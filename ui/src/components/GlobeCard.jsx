import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import * as THREE from "three";

import { API_BASE as _API_BASE } from "../api";
const API_BASE = _API_BASE || "";

const POLYTECH_HTML_DATA = [
  { lat: 60.01, lng: 30.38, label: "SPbPU", id: "spbpu" },
];

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
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);

  const x = -Math.sin(phi) * Math.cos(theta);
  const z = Math.sin(phi) * Math.sin(theta);
  const y = Math.cos(phi);

  return new THREE.Vector3(x * r, y * r, z * r);
}

function makeDashedLine(segment, r, color = "#724796") {
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

function makeSatelliteSprite(r, opts = {}) {
  const { glow = "rgba(114,71,150,0.35)", scale = 0.16 } = opts;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, size, size);

  // мягкое радиальное свечение
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 16, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, glow);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 70, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(243,151,104,0.18)";
  ctx.fill();

  ctx.font = "138px system-ui, Apple Color Emoji, Segoe UI Emoji";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🛰️", size / 2, size / 2 + 4);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;

  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const spr = new THREE.Sprite(mat);

  const s = r * scale;
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
// Simple “beam + footprint annulus”
// --------------------
function makeBeamCone({ height, baseRadius, color = "#724796" }) {
  const geom = new THREE.ConeGeometry(baseRadius, height, 48, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide
  });
  const cone = new THREE.Mesh(geom, mat);
  return cone;
}

function makeFootprintAnnulus({ radiusOuter, radiusInner, color = "#724796" }) {
  const geom = new THREE.RingGeometry(radiusInner, radiusOuter, 96, 1);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geom, mat);
  return { mesh, mat };
}

function makeSpotLight({ intensity = 1.6, angle = Math.PI / 7, distance = 800 }) {
  const light = new THREE.SpotLight(0x724796, intensity, distance, angle, 0.75, 1.0);
  light.castShadow = false;
  return light;
}

export default function GlobeCard({ sat, atIso, minutes, stepSec, orbitData: orbitDataProp = null, multiOrbitData = {}, mapSats = new Set(), fleetColorMap = {}, deadSatellites = {}, onSatelliteClick }) {
  const globeRef = useRef(null);
  const overlayRef = useRef(new THREE.Group());
  const lightsRef = useRef({ ambient: null, sun: null });

  const beamRef = useRef({
    spot: null,
    target: null
  });

  const [orbitLocal, setOrbitLocal] = useState(null);
  const [err, setErr] = useState("");
  // Use parent-supplied data when available, fall back to local fetch
  const orbit = orbitDataProp ?? orbitLocal;
  // true once the THREE.js scene is ready — guards the orbit drawing effect
  const [globeReady, setGlobeReady] = useState(false);

  const [countryLabels, setCountryLabels] = useState([]);
  const [showCountryLabels, setShowCountryLabels] = useState(false);
  const polytechHtmlElFn = useCallback((d) => {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "position:relative;cursor:pointer;";

    const icon = document.createElement("img");
    icon.src = "/spbpu-logo.png";
    icon.style.cssText = "width:26px;height:26px;border-radius:5px;display:block;";
    wrapper.appendChild(icon);

    const popup = document.createElement("div");
    popup.style.cssText =
      "display:none;position:absolute;bottom:38px;left:50%;transform:translateX(-50%);" +
      "background:#1b1530;border:1px solid #724796;border-radius:8px;padding:10px 14px;" +
      "box-shadow:0 8px 24px rgba(0,0,0,.6);white-space:nowrap;font-family:'Space Mono',monospace;" +
      "font-size:11px;color:#f1ead2;z-index:1000;pointer-events:auto;";
    popup.innerHTML =
      '<div style="font-weight:700;color:#724796;margin-bottom:5px">SPbPU Ground Station</div>' +
      "<div>Technopolis Polytech</div>" +
      "<div>Polytechnicheskaya st. 29AF</div>" +
      "<div>Lat 60.01 &middot; Lon 30.38</div>";
    wrapper.appendChild(popup);

    wrapper.addEventListener("click", (e) => {
      e.stopPropagation();
      const isVisible = popup.style.display !== "none";
      popup.style.display = isVisible ? "none" : "block";
    });

    return wrapper;
  }, []);

  const onSatClickRef = useRef(onSatelliteClick);
  onSatClickRef.current = onSatelliteClick;

  const track = useMemo(() => orbit?.track ?? [], [orbit]);
  const current = useMemo(() => orbit?.current ?? null, [orbit]);
  const segments = useMemo(() => splitByDateline(track), [track]);

  // ---- fetch orbit (only when parent didn't provide data)
  useEffect(() => {
    if (orbitDataProp !== null) return;  // parent handles fetching
    let alive = true;
    setErr("");

    fetchOrbitTrack({ sat, atIso, minutes, stepSec })
      .then((data) => { if (alive) setOrbitLocal(data); })
      .catch((e) => { if (alive) setErr(String(e?.message ?? e)); });

    return () => { alive = false; };
  }, [sat, atIso, minutes, stepSec, orbitDataProp]);

  // ---- load countries
  useEffect(() => {
    let alive = true;
    const url =
      "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson";

    fetch(url)
      .then((r) => r.json())
      .then((geo) => {
        if (!alive) return;
        const feats = Array.isArray(geo?.features) ? geo.features : [];
        const labels = feats
          .map((f) => {
            const c = roughCentroid(f);
            const name = f?.properties?.name || f?.properties?.NAME || f?.properties?.admin || "";
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

  // ---- scene init (space bg, sun light, WASD, labels, + raise planet)
  useEffect(() => {
    let stop = false;
    let cleanup = null;

    const initWhenReady = () => {
      if (stop) return;

      const g = globeRef.current;
      if (!g) return requestAnimationFrame(initWhenReady);

      const scene = g.scene?.();
      const controls = g.controls?.();
      const camera = g.camera?.();
      if (!scene || !controls || !camera) return requestAnimationFrame(initWhenReady);

      // overlay once — and signal that the scene is ready for orbit drawing
      if (!scene.children.includes(overlayRef.current)) scene.add(overlayRef.current);
      setGlobeReady(true);

      // space background
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
        const ambient = new THREE.AmbientLight(0xffffff, 0.22);
        const sun = new THREE.DirectionalLight(0xffffff, 1.25);
        sun.position.set(650, 0, 0);
        scene.add(ambient);
        scene.add(sun);
        lightsRef.current = { ambient, sun };
      }

      // update sun every 8s
      const updateSun = () => {
        const v = sunDirectionFromDate(new Date());
        const dist = 750;
        const sun = lightsRef.current.sun;
        if (!sun) return;
        sun.position.set(v.x * dist, v.y * dist, v.z * dist);
        sun.lookAt(0, 0, 0);
      };
      updateSun();
      const sunTimer = setInterval(updateSun, 8000);

      // emissive night map (optional)
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
            },
            undefined,
            () => {}
          );
        }
      } catch {}

      // -------------------------
      // IMPORTANT: Raise planet in viewport
      // -------------------------
      // 1) move controls target upward (this is what actually changes framing)
      //    increase 0.22 -> 0.30 if you want even higher
      controls.target.set(0, 0.22, 0);
      controls.update();

      // 2) optionally lift camera slightly too (small)
      camera.position.y += 0.08;
      controls.update();

      // keyboard controls — use THREE.Spherical directly because
      // rotateLeft/rotateUp/dollyIn are private in bundled OrbitControls
      const onKeyDown = (e) => {
        const rot  = 0.085;
        const zoom = 0.11;

        const cam  = camera;
        const ctrl = controls;
        const sph  = new THREE.Spherical().setFromVector3(
          cam.position.clone().sub(ctrl.target)
        );

        switch (e.key) {
          case "ArrowLeft":  case "a": case "A":
            sph.theta -= rot; break;
          case "ArrowRight": case "d": case "D":
            sph.theta += rot; break;
          case "ArrowUp":    case "w": case "W":
            sph.phi = Math.max(0.05, sph.phi - rot); break;
          case "ArrowDown":  case "s": case "S":
            sph.phi = Math.min(Math.PI - 0.05, sph.phi + rot); break;
          case "+": case "=":
            sph.radius = Math.max(ctrl.minDistance || 110, sph.radius * (1 - zoom)); break;
          case "-": case "_":
            sph.radius = Math.min(ctrl.maxDistance || 5000, sph.radius * (1 + zoom)); break;
          default:
            return;
        }

        cam.position.copy(ctrl.target).add(
          new THREE.Vector3().setFromSpherical(sph)
        );
        ctrl.update();
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

  // ---- draw orbit overlays + simplified beam + annulus footprint
  // globeReady is in deps so this re-runs once the scene is initialized,
  // even if orbit data arrived first (race condition fix)
  useEffect(() => {
    if (!globeReady) return;          // wait for THREE.js scene
    const g = globeRef.current;
    if (!g) return;

    const scene = g.scene?.();
    if (!scene) return;

    const R0 = typeof g.getGlobeRadius === "function" ? g.getGlobeRadius() : 100;
    let cleanupRaf = null;

    // clear overlay
    const grp = overlayRef.current;
    while (grp.children.length) grp.remove(grp.children[0]);

    // remove old spotlight
    if (beamRef.current.spot) scene.remove(beamRef.current.spot);
    if (beamRef.current.target) scene.remove(beamRef.current.target);
    beamRef.current.spot = null;
    beamRef.current.target = null;

    // orbit track
    const trackR = R0 * 1.01;
    for (const seg of segments) grp.add(makeDashedLine(seg, trackR, "#724796"));

    // satellite + simplified beam
    if (current && validLatLon(current.lat, current.lon)) {
      const lat = Number(current.lat);
      const lng = Number(current.lon);

      const rSurface = R0 * 1.01;
      const rSat = R0 * 1.11;

      const satPos = llToXyz(lat, lng, rSat);
      const groundPos = llToXyz(lat, lng, rSurface);

      // satellite sprite (clickable, увеличен в ~2 раза)
      const spr = makeSatelliteSprite(R0, { scale: 0.16, glow: "rgba(114,71,150,0.45)" });
      spr.position.copy(satPos);
      spr.userData = { satName: sat, clickable: true };
      grp.add(spr);

      // footprint sizes
      const footprintOuter = R0 * 0.24;
      const blindInner = R0 * 0.09;

      // beam cone: wide end on Earth, narrow end at the satellite
      const height = Math.max(0.001, rSat - rSurface);
      const cone = makeBeamCone({ height, baseRadius: footprintOuter, color: "#724796" });

      // place at mid and point down
      const midPos = satPos.clone().add(groundPos).multiplyScalar(0.5);
      cone.position.copy(midPos);

      const dirUp = satPos.clone().normalize();
      const upY = new THREE.Vector3(0, 1, 0);
      cone.quaternion.setFromUnitVectors(upY, dirUp);

      grp.add(cone);

      // footprint ring
      const { mesh: ring, mat: ringMat } = makeFootprintAnnulus({
        radiusOuter: footprintOuter,
        radiusInner: blindInner,
        color: "#724796"
      });

      ring.position.copy(groundPos.clone().multiplyScalar(1.002));

      // align ring plane to sphere tangent
      const outward = groundPos.clone().normalize();
      const zAxis = new THREE.Vector3(0, 0, 1);
      ring.quaternion.setFromUnitVectors(zAxis, outward);

      grp.add(ring);

      // spotlight (optional)
      const angle = Math.min(Math.PI / 6.5, Math.atan(footprintOuter / height) * 1.05);
      const spot = makeSpotLight({ intensity: 1.6, angle, distance: height * 2.2 });
      spot.position.copy(satPos);

      const targetObj = new THREE.Object3D();
      targetObj.position.copy(groundPos);
      scene.add(targetObj);
      spot.target = targetObj;

      scene.add(spot);
      beamRef.current.spot = spot;
      beamRef.current.target = targetObj;

      // very subtle breathing for ring only
      let raf = 0;
      const t0 = performance.now();
      const animate = () => {
        const t = (performance.now() - t0) / 1000;
        ringMat.opacity = 0.48 + 0.06 * (0.5 + 0.5 * Math.sin(t * 1.2));
        raf = requestAnimationFrame(animate);
      };
      raf = requestAnimationFrame(animate);

      // POV
      try {
        g.pointOfView({ lat, lng, altitude: 2.2 }, 600);
      } catch {}

      cleanupRaf = () => cancelAnimationFrame(raf);
    }

    // Draw other fleet satellites (not the primary one which is drawn above)
    for (const [satName, oData] of Object.entries(multiOrbitData)) {
      if (!mapSats.has(satName)) continue;
      if (satName === sat) continue;
      const isDead = !!deadSatellites[satName];
      const color = isDead ? "#5e4d78" : (fleetColorMap[satName] || "#724796");

      if (!isDead) {
        const extraTrack = (oData?.track ?? []).filter(p => validLatLon(p.lat, p.lon));
        const extraSegs = splitByDateline(extraTrack.map(p => ({ lat: Number(p.lat), lng: Number(p.lon), ts_utc: p.ts_utc })));
        for (const seg of extraSegs) grp.add(makeDashedLine(seg, trackR, color));
      }

      const extraCur = oData?.current;
      if (extraCur && validLatLon(extraCur.lat, extraCur.lon)) {
        const ePos = llToXyz(Number(extraCur.lat), Number(extraCur.lon), R0 * 1.06);
        const eSpr = makeSatelliteSprite(R0, {
          scale: isDead ? 0.12 : 0.14,
          glow: isDead ? "rgba(218,73,39,0.30)" : `rgba(114,71,150,0.35)`,
        });
        eSpr.position.copy(ePos);
        eSpr.userData = { satName, clickable: true };
        if (isDead) eSpr.material.opacity = 0.65;
        grp.add(eSpr);
      }
    }

    // Click handler for satellites
    const onClick = (e) => {
      const g = globeRef.current;
      if (!g) return;
      const renderer = g.renderer?.();
      const camera = g.camera?.();
      if (!renderer || !camera) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.params.Sprite = { threshold: 8 };
      raycaster.setFromCamera(mouse, camera);

      const intersects = raycaster.intersectObjects(grp.children, true);
      for (const hit of intersects) {
        const obj = hit.object;
        if (obj.userData?.clickable && obj.userData?.satName) {
          onSatClickRef.current?.(obj.userData.satName);
          return;
        }
      }
    };

    const canvas = globeRef.current?.renderer?.()?.domElement;
    if (canvas) canvas.addEventListener("click", onClick);

    return () => {
      if (cleanupRaf) cleanupRaf();
      if (canvas) canvas.removeEventListener("click", onClick);
    };
  }, [segments, current, globeReady, multiOrbitData, mapSats, fleetColorMap, sat, deadSatellites]);

  // -------------------------
  // UI sizing (вынесено в константы, чтобы проще править)
  // -------------------------
  // Хочешь ещё выше — поставь 86vh / 90vh
  const CARD_HEIGHT = "82vh";
  const CARD_MIN_H = 760;

  // Высота внутреннего контейнера = card - шапка
  const INNER_HEIGHT = "calc(82vh - 60px)";
  const INNER_MIN_H = 680;

  return (
    <div className="globe-card" style={{ height: CARD_HEIGHT, minHeight: CARD_MIN_H }}>
      <div className="card-header">
        <span className="card-title">🌍 Orbit Ground Track (TLE/SGP4) — 3D Globe</span>
        <span className="card-meta">
          {err
            ? <span style={{ color: "var(--red)" }}>Orbit error: {err}</span>
            : `${track.length} pts · WASD/Arrows rotate · +/- zoom`}
        </span>
      </div>

      <div
        className="globe-inner"
        style={{ height: INNER_HEIGHT, minHeight: INNER_MIN_H }}
      >
        <Globe
          ref={globeRef}
          style={{ width: "100%", height: "100%" }}
          backgroundColor="rgba(0,0,0,1)"
          globeImageUrl="https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
          bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
          showAtmosphere={true}
          atmosphereColor="#9460b8"
          atmosphereAltitude={0.12}
          // labels (страны)
          labelsData={showCountryLabels ? countryLabels : []}
          labelLat={(d) => d.lat}
          labelLng={(d) => d.lng}
          labelText={(d) => d.name}
          labelSize={0.9}
          labelDotRadius={0.15}
          labelAltitude={0.01}
          // SPbPU interactive marker
          htmlElementsData={POLYTECH_HTML_DATA}
          htmlLat={(d) => d.lat}
          htmlLng={(d) => d.lng}
          htmlAltitude={0.005}
          htmlElement={polytechHtmlElFn}
          htmlElementVisibilityModifier={(el, isVisible) => {
            el.style.opacity = isVisible ? "1" : "0";
            el.style.pointerEvents = isVisible ? "auto" : "none";
          }}
        />
      </div>
    </div>
  );
}