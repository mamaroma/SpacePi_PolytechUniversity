import React, { useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import * as THREE from "three";

const API_BASE = "http://127.0.0.1:8000";

// --------------------
// Utils
// --------------------
function isNum(x) {
  return Number.isFinite(Number(x));
}
function validLatLon(lat, lon) {
  const la = Number(lat),
    lo = Number(lon);
  return isNum(la) && isNum(lo) && la >= -90 && la <= 90 && lo >= -180 && lo <= 180;
}

// разрез по линии перемены даты, чтобы не было “спиралей”
function splitByDateline(points) {
  const segs = [];
  let cur = [];
  let prevLng = null;

  for (const p of points) {
    if (!validLatLon(p.lat, p.lon)) continue;
    const lat = Number(p.lat);
    const lng = Number(p.lon);

    if (prevLng !== null) {
      const d = Math.abs(lng - prevLng);
      if (d > 180) {
        if (cur.length >= 2) segs.push(cur);
        cur = [];
      }
    }

    cur.push({ lat, lng, ts_utc: p.ts_utc });
    prevLng = lng;
  }

  if (cur.length >= 2) segs.push(cur);
  return segs;
}

function llToXyz(lat, lng, r) {
  // three-globe coords
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);

  const x = -Math.sin(phi) * Math.cos(theta);
  const z = Math.sin(phi) * Math.sin(theta);
  const y = Math.cos(phi);

  return new THREE.Vector3(x * r, y * r, z * r);
}

function makeDashedLine(segment, r, color = "#4CFF7A") {
  const verts = [];
  for (const p of segment) {
    const v = llToXyz(p.lat, p.lng, r);
    verts.push(v.x, v.y, v.z);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geom.computeBoundingSphere();

  const mat = new THREE.LineDashedMaterial({
    color,
    dashSize: r * 0.02,
    gapSize: r * 0.012,
    transparent: true,
    opacity: 0.95
  });

  const line = new THREE.Line(geom, mat);
  line.computeLineDistances();
  return line;
}

function makeSatelliteSprite(r) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, size, size);

  // glow
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 34, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,255,180,0.18)";
  ctx.fill();

  // emoji
  ctx.font = "64px system-ui, Apple Color Emoji, Segoe UI Emoji";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🛰️", size / 2, size / 2 + 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;

  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false
  });
  const spr = new THREE.Sprite(mat);

  const s = r * 0.08;
  spr.scale.set(s, s, s);

  return spr;
}

async function fetchOrbitTrack({ sat, atIso, minutes, stepSec }) {
  const qs = new URLSearchParams({
    sat,
    at: atIso,
    minutes: String(minutes),
    step_sec: String(stepSec)
  });

  const r = await fetch(`${API_BASE}/api/orbit/track?` + qs.toString());
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
  }
  return await r.json();
}

// --------------------
// Sun dir (простая аппроксимация)
// --------------------
function dayOfYearUTC(d) {
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const cur = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((cur - start) / 86400000) + 1;
}
function sunDirectionFromDate(d) {
  const doy = dayOfYearUTC(d);
  const decl = 23.44 * Math.sin(((2 * Math.PI) / 365) * (doy - 81));

  const utcHours = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const subLon = (12 - utcHours) * 15;
  const subLat = decl;

  const v = llToXyz(subLat, subLon, 1);
  v.normalize();
  return v;
}

// --------------------
// Countries labels
// --------------------
function roughCentroid(feature) {
  const geom = feature?.geometry;
  if (!geom) return null;

  const points = [];
  const walk = (coords) => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number") {
      if (coords.length >= 2 && isNum(coords[0]) && isNum(coords[1])) points.push(coords);
      return;
    }
    for (const c of coords) walk(c);
  };

  walk(geom.coordinates);
  if (!points.length) return null;

  let sumLat = 0,
    sumLng = 0;
  for (const [lng, lat] of points) {
    sumLat += lat;
    sumLng += lng;
  }
  return { lat: sumLat / points.length, lng: sumLng / points.length };
}

// --------------------
// CINEMA BEAM (shader + scan + particles + footprint ring)
// --------------------
function makeBeamMaterial() {
  // Важное: uTime для “скана”
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color("#66ffdd") },
      uTime: { value: 0.0 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        // vUv.y: 0..1 along height (0 near tip for ConeGeometry depends on mapping, but visually ok)
        float h = 1.0 - vUv.y;

        // базовая дымка по высоте
        float heightFade = smoothstep(0.0, 0.95, h) * smoothstep(1.0, 0.12, h);

        // мягкий центр (псевдо-радиал)
        float radial = 1.0 - abs(vUv.x - 0.5) * 2.0;
        radial = pow(max(radial, 0.0), 2.2);

        // "скан" полосы, бегущие вниз
        float speed = 0.65;
        float bands = sin((vUv.y * 18.0) - (uTime * speed * 6.2831));
        bands = smoothstep(0.15, 1.0, bands); // оставим только яркие

        // лёгкий "шум" чтобы киношнее
        float n = hash(vec2(floor(vUv.x*40.0), floor(vUv.y*60.0) + floor(uTime*2.0)));
        float noise = 0.85 + 0.30 * n;

        float a = (0.10 * heightFade) + (0.26 * radial * heightFade);
        a *= (0.65 + 0.60 * bands);
        a *= noise;
        a *= (0.40 + 0.60 * h);

        if (a < 0.015) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `
  });

  return mat;
}

function makeBeamCone({ height, baseRadius }) {
  const geom = new THREE.ConeGeometry(baseRadius, height, 72, 1, true);
  const cone = new THREE.Mesh(geom, makeBeamMaterial());
  cone.renderOrder = 20;
  return cone;
}

function makeGroundGlowSprite({ r }) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  const grd = ctx.createRadialGradient(size / 2, size / 2, 10, size / 2, size / 2, size / 2);
  grd.addColorStop(0.0, "rgba(120,255,220,1.0)");
  grd.addColorStop(0.18, "rgba(120,255,220,0.55)");
  grd.addColorStop(0.55, "rgba(120,255,220,0.18)");
  grd.addColorStop(1.0, "rgba(120,255,220,0.0)");

  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;

  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const spr = new THREE.Sprite(mat);
  const s = r * 0.26;
  spr.scale.set(s, s, s);
  spr.renderOrder = 30;

  return spr;
}

function makeFootprintRing({ radiusOuter, radiusInner }) {
  const geom = new THREE.RingGeometry(radiusInner, radiusOuter, 96, 1);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x66ffdd,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.renderOrder = 25;
  return mesh;
}

function makeBeamParticles({ height, baseRadius, count }) {
  // Позиции в локальных координатах луча:
  // Ось Y направлена вдоль конуса (у нас потом конус будет повернут к Земле)
  // Мы размещаем частицы внутри конуса: y ∈ [-height/2 .. +height/2]
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // y от верха (спутник) к низу (земля): начнём распределённо
    const t = Math.random(); // 0..1
    const y = height * 0.5 - t * height; // +height/2 .. -height/2

    // радиус конуса на данной высоте (линейная аппроксимация)
    const k = (0.5 - (y / height)); // 0..1 (примерно)
    const rAtY = baseRadius * (0.25 + 0.75 * k);

    // случайная точка в диске
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.sqrt(Math.random()) * rAtY;
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;

    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    speeds[i] = 0.15 + Math.random() * 0.55; // скорость падения
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: 0x66ffdd,
    size: Math.max(1.2, baseRadius * 0.06),
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const points = new THREE.Points(geom, mat);
  points.renderOrder = 21;

  return { points, positions, speeds, count };
}

function makeSpotLight({ intensity, angle, distance }) {
  const light = new THREE.SpotLight(0x88ffdd, intensity, distance, angle, 0.6, 1.8);
  light.castShadow = false;
  return light;
}

export default function GlobeCard({ title, sat, atIso, minutes, stepSec }) {
  const globeRef = useRef(null);

  // overlay group: lines + sprite + beam objects
  const overlayRef = useRef(new THREE.Group());

  const lightsRef = useRef({ ambient: null, sun: null });

  // Beam objects refs for animation updates
  const beamRef = useRef({
    beamGroup: null,
    cone: null,
    glow: null,
    ring: null,
    ringMat: null,
    coneMat: null,
    particles: null, // {points, positions, speeds, count}
    spot: null,
    spotTarget: null,
    rafId: null,
    t0: 0
  });

  const [orbit, setOrbit] = useState(null);
  const [err, setErr] = useState("");

  const [countryLabels, setCountryLabels] = useState([]);
  const [showCountryLabels, setShowCountryLabels] = useState(false);

  const track = useMemo(() => orbit?.track ?? [], [orbit]);
  const current = useMemo(() => orbit?.current ?? null, [orbit]);
  const segments = useMemo(() => splitByDateline(track), [track]);

  // ---- fetch orbit
  useEffect(() => {
    let alive = true;
    setErr("");

    fetchOrbitTrack({ sat, atIso, minutes, stepSec })
      .then((data) => alive && setOrbit(data))
      .catch((e) => alive && setErr(String(e?.message ?? e)));

    return () => {
      alive = false;
    };
  }, [sat, atIso, minutes, stepSec]);

  // ---- load countries
  useEffect(() => {
    let alive = true;
    const url = "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson";

    fetch(url)
      .then((r) => r.json())
      .then((geo) => {
        if (!alive) return;
        const feats = Array.isArray(geo?.features) ? geo.features : [];
        const labels = feats
          .map((f) => {
            const c = roughCentroid(f);
            const name =
              f?.properties?.name || f?.properties?.NAME || f?.properties?.admin || "";
            if (!c || !name) return null;
            return { ...c, name };
          })
          .filter(Boolean);
        setCountryLabels(labels);
      })
      .catch(() => alive && setCountryLabels([]));

    return () => {
      alive = false;
    };
  }, []);

  // ---- scene init (wait until ready, safe for hot reload)
  useEffect(() => {
    let stop = false;
    let cleanup = null;

    const initWhenReady = () => {
      if (stop) return;

      const g = globeRef.current;
      if (!g) return requestAnimationFrame(initWhenReady);

      const scene = g.scene?.();
      const controls = g.controls?.();
      if (!scene || !controls) return requestAnimationFrame(initWhenReady);

      // overlay once
      if (!scene.children.includes(overlayRef.current)) scene.add(overlayRef.current);

      // space background (SAFE)
      if (!scene.userData.__spaceBgLoaded) {
        scene.userData.__spaceBgLoaded = true;
        const loader = new THREE.TextureLoader();
        loader.load(
          "https://unpkg.com/three-globe/example/img/night-sky.png",
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            scene.background = tex;
          },
          undefined,
          () => {}
        );
      }

      // lights once
      if (!lightsRef.current.ambient) {
        const ambient = new THREE.AmbientLight(0xffffff, 0.25);
        const sun = new THREE.DirectionalLight(0xffffff, 1.35);
        sun.position.set(650, 0, 0);
        scene.add(ambient);
        scene.add(sun);
        lightsRef.current = { ambient, sun };
      }

      // update sun every 5s
      const updateSun = () => {
        const v = sunDirectionFromDate(new Date());
        const dist = 750;
        const sun = lightsRef.current.sun;
        if (!sun) return;
        sun.position.set(v.x * dist, v.y * dist, v.z * dist);
        sun.lookAt(0, 0, 0);
      };
      updateSun();
      const sunTimer = setInterval(updateSun, 5000);

      // try attach night emissive map if possible
      try {
        if (typeof g.globeMaterial === "function") {
          const loader = new THREE.TextureLoader();
          loader.load(
            "https://unpkg.com/three-globe/example/img/earth-night.jpg",
            (nightTex) => {
              nightTex.colorSpace = THREE.SRGBColorSpace;
              const mat = g.globeMaterial();
              if (mat) {
                mat.emissive = new THREE.Color(0xffffff);
                mat.emissiveMap = nightTex;
                mat.emissiveIntensity = 0.9;
                mat.needsUpdate = true;
              }
            }
          );
        }
      } catch {}

      // keyboard controls
      const onKeyDown = (e) => {
        const rot = 0.085;
        const zoom = 0.11;

        switch (e.key) {
          case "ArrowLeft":
          case "a":
          case "A":
            controls.rotateLeft(rot);
            break;
          case "ArrowRight":
          case "d":
          case "D":
            controls.rotateLeft(-rot);
            break;
          case "ArrowUp":
          case "w":
          case "W":
            controls.rotateUp(rot);
            break;
          case "ArrowDown":
          case "s":
          case "S":
            controls.rotateUp(-rot);
            break;
          case "+":
          case "=":
            controls.dollyIn(1 + zoom);
            break;
          case "-":
          case "_":
            controls.dollyOut(1 + zoom);
            break;
          default:
            return;
        }

        controls.update();
        e.preventDefault();
      };
      window.addEventListener("keydown", onKeyDown, { passive: false });

      // labels on zoom
      const onControlsChange = () => {
        const dist = controls?.object?.position?.length?.() ?? 9999;
        setShowCountryLabels(dist < 260);
      };
      onControlsChange();
      controls.addEventListener?.("change", onControlsChange);

      cleanup = () => {
        clearInterval(sunTimer);
        window.removeEventListener("keydown", onKeyDown);
        controls.removeEventListener?.("change", onControlsChange);
      };
    };

    initWhenReady();

    return () => {
      stop = true;
      if (cleanup) cleanup();
    };
  }, []);

  // ---- stop any previous animation loop
  const stopBeamAnimation = () => {
    const b = beamRef.current;
    if (b.rafId) cancelAnimationFrame(b.rafId);
    b.rafId = null;
  };

  // ---- draw orbit overlays + FULL CINEMA KIT
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;

    const scene = g.scene?.();
    if (!scene) return;

    const R0 = typeof g.getGlobeRadius === "function" ? g.getGlobeRadius() : 100;

    // clear overlay
    const grp = overlayRef.current;
    while (grp.children.length) grp.remove(grp.children[0]);

    // remove old beam spotlight from scene
    const b = beamRef.current;
    stopBeamAnimation();

    if (b.spot) scene.remove(b.spot);
    if (b.spotTarget) scene.remove(b.spotTarget);
    b.beamGroup = null;
    b.cone = null;
    b.glow = null;
    b.ring = null;
    b.ringMat = null;
    b.coneMat = null;
    b.particles = null;
    b.spot = null;
    b.spotTarget = null;

    // orbit track
    const trackR = R0 * 1.01;
    for (const seg of segments) grp.add(makeDashedLine(seg, trackR, "#4CFF7A"));

    // add satellite + beam
    if (current && validLatLon(current.lat, current.lon)) {
      const lat = Number(current.lat);
      const lng = Number(current.lon);

      const rSurface = R0 * 1.01;
      const rSat = R0 * 1.11;

      const satPos = llToXyz(lat, lng, rSat);
      const groundPos = llToXyz(lat, lng, rSurface);

      // --- satellite sprite
      const spr = makeSatelliteSprite(R0);
      spr.position.copy(satPos);
      grp.add(spr);

      // --- beam kit group
      const beamGroup = new THREE.Group();

      // FIXED footprint radius (не зависит от высоты)
      const footprintRadius = R0 * 0.22; // <-- поменяй если хочешь шире/уже
      const footprintInner = footprintRadius * 0.72;

      // cone geometry params
      const height = Math.max(0.001, rSat - rSurface);
      const baseRadius = footprintRadius;

      // cone
      const cone = makeBeamCone({ height, baseRadius });
      const coneMat = cone.material;
      // mid position
      const midPos = satPos.clone().add(groundPos).multiplyScalar(0.5);
      cone.position.copy(midPos);

      // orient cone: default +Y, point down to Earth center
      const dirDown = satPos.clone().normalize().multiplyScalar(-1);
      const upY = new THREE.Vector3(0, 1, 0);
      cone.quaternion.setFromUnitVectors(upY, dirDown);

      beamGroup.add(cone);

      // ground glow
      const glow = makeGroundGlowSprite({ r: R0 });
      glow.position.copy(groundPos.clone().multiplyScalar(1.002));
      beamGroup.add(glow);

      // footprint ring (on the surface, aligned by normal)
      const ring = makeFootprintRing({ radiusOuter: footprintRadius, radiusInner: footprintInner });
      const ringMat = ring.material;

      ring.position.copy(groundPos.clone().multiplyScalar(1.002));

      // align ring plane to tangent of sphere:
      // RingGeometry is in XY plane -> normal is +Z. We need it to face outward (along ground normal).
      const ringNormal = groundPos.clone().normalize(); // outward
      const zAxis = new THREE.Vector3(0, 0, 1);
      ring.quaternion.setFromUnitVectors(zAxis, ringNormal);

      beamGroup.add(ring);

      // particles inside beam
      const particles = makeBeamParticles({
        height,
        baseRadius,
        count: 520
      });
      // particles should follow cone transform => attach to cone (local coords)
      // BUT cone mesh is centered at mid. Easier: attach particles to cone as child and set pos=0
      cone.add(particles.points);
      particles.points.position.set(0, 0, 0);

      grp.add(beamGroup);

      // --- real spotlight
      const angle = Math.min(Math.PI / 3.0, Math.atan(baseRadius / height) * 1.10);
      const dist = height * 2.2;
      const spot = makeSpotLight({ intensity: 2.6, angle, distance: dist });
      spot.position.copy(satPos);

      const targetObj = new THREE.Object3D();
      targetObj.position.copy(groundPos);
      scene.add(targetObj);
      spot.target = targetObj;

      scene.add(spot);

      // store for animation loop
      b.beamGroup = beamGroup;
      b.cone = cone;
      b.glow = glow;
      b.ring = ring;
      b.ringMat = ringMat;
      b.coneMat = coneMat;
      b.particles = particles;
      b.spot = spot;
      b.spotTarget = targetObj;

      // POV
      try {
        g.pointOfView({ lat, lng, altitude: 2.2 }, 600);
      } catch {}

      // ---- animation loop: scan + ring pulse + particles fall + subtle glow breathing
      b.t0 = performance.now();

      const animate = () => {
        const now = performance.now();
        const t = (now - b.t0) / 1000;

        // scan in shader
        if (b.coneMat?.uniforms?.uTime) {
          b.coneMat.uniforms.uTime.value = t;
        }

        // ring pulse
        if (b.ringMat) {
          b.ringMat.opacity = 0.22 + 0.18 * (0.5 + 0.5 * Math.sin(t * 2.2));
        }
        if (b.ring) {
          const s = 1.0 + 0.025 * Math.sin(t * 2.8);
          b.ring.scale.set(s, s, s);
        }

        // glow breathing
        if (b.glow?.material) {
          b.glow.material.opacity = 0.55 + 0.20 * (0.5 + 0.5 * Math.sin(t * 1.8));
        }

        // particles fall (in cone local coordinates)
        if (b.particles) {
          const { points, positions, speeds, count } = b.particles;
          const arr = positions;
          const h = height;

          // move along -Y (down the beam)
          for (let i = 0; i < count; i++) {
            const idx = i * 3 + 1;
            arr[idx] -= speeds[i] * (0.55 + 0.45 * Math.sin(t * 0.6)) * 0.35;

            // wrap: если ниже -h/2 => наверх
            if (arr[idx] < -h * 0.5) {
              arr[idx] = h * 0.5;

              // лёгкая рандомизация по XZ при перезапуске
              const y = arr[idx];
              const k = (0.5 - y / h);
              const rAtY = baseRadius * (0.25 + 0.75 * k);

              const ang = Math.random() * Math.PI * 2;
              const rad = Math.sqrt(Math.random()) * rAtY;

              arr[i * 3 + 0] = Math.cos(ang) * rad;
              arr[i * 3 + 2] = Math.sin(ang) * rad;
            }
          }

          points.geometry.attributes.position.needsUpdate = true;

          // opacity “sparkle”
          if (points.material) {
            points.material.opacity = 0.12 + 0.16 * (0.5 + 0.5 * Math.sin(t * 3.3));
          }
        }

        b.rafId = requestAnimationFrame(animate);
      };

      b.rafId = requestAnimationFrame(animate);
    }

    return () => {
      // cleanup animation loop on change/unmount
      stopBeamAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, current]);

  return (
    <div className="card" style={{ height: "72vh", minHeight: 560 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ margin: "6px 0 10px" }}>{title}</h3>
        <div className="small" style={{ textAlign: "right" }}>
          {err ? `Orbit error: ${err}` : `${track.length} orbit pts`}
          <br />
          <span style={{ opacity: 0.75 }}>
            Controls: WASD / Arrows rotate • +/- zoom
          </span>
          <br />
          <span style={{ opacity: 0.75 }}>
            Beam: scan + footprint + particles (cinema)
          </span>
        </div>
      </div>

      <div
        style={{
          width: "100%",
          height: "calc(72vh - 60px)",
          minHeight: 500,
          borderRadius: 12,
          overflow: "hidden",
          background: "black"
        }}
      >
        <Globe
          ref={globeRef}
          backgroundColor="rgba(0,0,0,1)"
          globeImageUrl="https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
          bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
          showAtmosphere={true}
          atmosphereColor="#7bdcff"
          atmosphereAltitude={0.12}
          // labels
          labelsData={showCountryLabels ? countryLabels : []}
          labelLat={(d) => d.lat}
          labelLng={(d) => d.lng}
          labelText={(d) => d.name}
          labelSize={0.9}
          labelDotRadius={0.15}
          labelAltitude={0.01}
        />
      </div>
    </div>
  );
}