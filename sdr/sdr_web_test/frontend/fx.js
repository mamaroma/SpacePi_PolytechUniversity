(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Lenis smooth scroll ──────────────────────────────────── */
  function initLenis() {
    if (reduceMotion || typeof Lenis === 'undefined') return null;
    const lenis = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    if (typeof gsap !== 'undefined') {
      if (typeof ScrollTrigger !== 'undefined') lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const tick = (time) => {
        lenis.raf(time);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    return lenis;
  }

  /* ── Three.js starfield (HighTech-style ambient scene) ────── */
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.min.js';

  let threePromise = null;
  const loadThree = () => {
    threePromise ||= import(THREE_URL).catch(() => null);
    return threePromise;
  };

  async function initScene() {
    const canvas = document.getElementById('scene-canvas');
    if (!canvas) return;
    const THREE = await loadThree();
    if (!THREE) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      powerPreference: 'low-power',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);
    camera.position.z = 18;

    const count = window.innerWidth < 700 ? 900 : 2200;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const scales = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Spherical shell — как sphereShell в HighTech
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = 14 + Math.random() * 22;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      seeds[i] = Math.random();
      scales[i] = 1 + Math.random() * Math.random() * 3.2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() },
        uColorA: { value: new THREE.Color('#ede8f5') },
        uColorB: { value: new THREE.Color('#9460b8') },
        uColorC: { value: new THREE.Color('#8ad27b') },
      },
      vertexShader: `
        attribute float aSeed;
        attribute float aScale;
        uniform float uTime;
        uniform float uPixelRatio;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform vec3 uColorC;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.12 + aSeed * 18.0) * 0.15;
          p.y += cos(uTime * 0.1 + aSeed * 12.0) * 0.12;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aScale * uPixelRatio * (90.0 / max(0.001, -mv.z));
          float twinkle = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (0.5 + aSeed * 1.7) + aSeed * 40.0), 3.0);
          vColor = mix(mix(uColorA, uColorB, aSeed), uColorC, step(0.82, aSeed) * 0.85);
          vAlpha = twinkle;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float core = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor, pow(core, 2.4) * vAlpha * 0.85);
        }
      `,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    const pointer = { x: 0, y: 0 };
    const onPointer = (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onPointer, { passive: true });

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    };
    resize();
    window.addEventListener('resize', resize);

    let running = true;
    document.addEventListener('visibilitychange', () => {
      running = document.visibilityState === 'visible';
    });

    const clock = new THREE.Clock();
    const render = () => {
      requestAnimationFrame(render);
      if (!running) return;
      const t = clock.getElapsedTime();
      material.uniforms.uTime.value = t;
      points.rotation.y = t * 0.018 + pointer.x * 0.08;
      points.rotation.x = pointer.y * 0.05;
      camera.position.x += (pointer.x * 0.6 - camera.position.x) * 0.04;
      camera.position.y += (-pointer.y * 0.4 - camera.position.y) * 0.04;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    render();
  }

  /* ── Hero orbit: Earth + satellites ───────────────────────── */
  const EARTH_TEXTURE = '/sdr/static/earth-dark.jpg';
  const STATION = { lat: 60.01, lon: 30.38 };

  function glowTexture(THREE) {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }

  // Same mapping as THREE.SphereGeometry UVs, so markers line up with the texture.
  function latLonToVec(THREE, lat, lon, r) {
    const phi = ((lon + 180) / 360) * Math.PI * 2;
    const theta = ((90 - lat) * Math.PI) / 180;
    return new THREE.Vector3(
      -r * Math.cos(phi) * Math.sin(theta),
      r * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta)
    );
  }

  function landDots(THREE, image, radius, count) {
    const W = 512, H = 256;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(image, 0, 0, W, H);
    const data = g.getImageData(0, 0, W, H).data;
    const out = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const rr = Math.sqrt(1 - y * y);
      const a = golden * i;
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr;
      let phi = Math.atan2(z, -x);
      if (phi < 0) phi += Math.PI * 2;
      const px = Math.min(W - 1, Math.floor((phi / (Math.PI * 2)) * W));
      const py = Math.min(H - 1, Math.floor((Math.acos(y) / Math.PI) * H));
      if (data[(py * W + px) * 4] < 14) out.push(x * radius, y * radius, z * radius);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    return geo;
  }

  async function initOrbit() {
    const canvas = document.getElementById('orbit-canvas');
    if (!canvas) return;
    const THREE = await loadThree();
    if (!THREE) return;
    const host = canvas.parentElement;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 1.1, 12.5);
    camera.lookAt(0, 0, 0);

    const C = {
      green: new THREE.Color('#8ad27b'),
      purple: new THREE.Color('#9460b8'),
      lavender: new THREE.Color('#a088d8'),
      orange: new THREE.Color('#f39768'),
    };
    const glow = glowTexture(THREE);
    const R = 1.55;

    const world = new THREE.Group();
    world.rotation.set(0.12, -0.5, -0.08);
    scene.add(world);

    const earth = new THREE.Group();
    earth.rotation.z = 0.41;
    world.add(earth);
    const spin = new THREE.Group();
    earth.add(spin);

    const earthMat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: null },
        uHasMap: { value: 0 },
        uSun: { value: new THREE.Vector3(-0.55, 0.4, 0.75).normalize() },
        uRimA: { value: C.green },
        uRimB: { value: C.purple },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vN;
        varying vec3 vWorldN;
        void main() {
          vUv = uv;
          vN = normalize(normalMatrix * normal);
          vWorldN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform float uHasMap;
        uniform vec3 uSun;
        uniform vec3 uRimA;
        uniform vec3 uRimB;
        varying vec2 vUv;
        varying vec3 vN;
        varying vec3 vWorldN;
        void main() {
          float lum = uHasMap > 0.5 ? texture2D(uMap, vUv).r : 0.2;
          float land = 1.0 - smoothstep(0.02, 0.055, lum);
          vec3 col = mix(vec3(0.03, 0.02, 0.07), vec3(0.17, 0.11, 0.26), land);
          float light = smoothstep(-0.3, 0.7, dot(normalize(vWorldN), uSun));
          col *= 0.3 + 0.95 * light;
          float fres = pow(1.0 - max(dot(normalize(vN), vec3(0.0, 0.0, 1.0)), 0.0), 2.6);
          col += mix(uRimA, uRimB, smoothstep(0.2, 0.8, vUv.y)) * fres * 0.55;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    spin.add(new THREE.Mesh(new THREE.SphereGeometry(R, 64, 48), earthMat));

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.13, 64, 48),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uA: { value: C.green }, uB: { value: C.purple } },
        vertexShader: `
          varying vec3 vN;
          varying float vY;
          void main() {
            vN = normalize(normalMatrix * normal);
            vY = normal.y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uA;
          uniform vec3 uB;
          varying vec3 vN;
          varying float vY;
          void main() {
            float k = clamp(-normalize(vN).z / 0.47, 0.0, 1.0);
            float i = pow(k, 3.0) * 0.8;
            gl_FragColor = vec4(mix(uB, uA, 0.5 + 0.5 * vY), i);
          }
        `,
      })
    );
    world.add(atmosphere);

    new THREE.TextureLoader().load(EARTH_TEXTURE, (tex) => {
      earthMat.uniforms.uMap.value = tex;
      earthMat.uniforms.uHasMap.value = 1;
      const dots = new THREE.Points(
        landDots(THREE, tex.image, R * 1.004, window.innerWidth < 700 ? 7000 : 14000),
        new THREE.PointsMaterial({
          color: C.green,
          size: 0.13,
          map: glow,
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
          sizeAttenuation: true,
        })
      );
      spin.add(dots);
    });

    // Ground station marker with pulsing rings
    const stationPos = latLonToVec(THREE, STATION.lat, STATION.lon, R * 1.006);
    const stationNormal = stationPos.clone().normalize();
    const station = new THREE.Group();
    station.position.copy(stationPos);
    station.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), stationNormal);
    spin.add(station);
    station.add(new THREE.Mesh(
      new THREE.CircleGeometry(0.035, 24),
      new THREE.MeshBasicMaterial({ color: C.orange })
    ));
    const pulses = [0, 0.5].map((offset) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.05, 0.062, 40),
        new THREE.MeshBasicMaterial({ color: C.orange, transparent: true, depthWrite: false, side: THREE.DoubleSide })
      );
      station.add(ring);
      return { ring, offset };
    });

    // Orbits + satellites
    const ORBITS = [
      { r: 2.25, inc: 0.38, node: 0.3, speed: 0.46, color: C.green, sats: [0, Math.PI] },
      { r: 2.7, inc: -1.0, node: 1.2, speed: -0.32, color: C.lavender, sats: [1.2] },
      { r: 3.1, inc: 1.32, node: -0.7, speed: 0.24, color: C.purple, sats: [2.4, 4.6] },
    ];
    const TRAIL = 0.85;
    const satellites = [];
    const bodyMat = new THREE.MeshBasicMaterial({ color: '#ede8f5' });
    const panelMat = new THREE.MeshBasicMaterial({ color: '#5b3b86' });

    for (const o of ORBITS) {
      const plane = new THREE.Group();
      plane.rotation.y = o.node;
      plane.rotation.x = o.inc;
      world.add(plane);

      const ringPts = [];
      for (let i = 0; i <= 160; i++) {
        const a = (i / 160) * Math.PI * 2;
        ringPts.push(new THREE.Vector3(Math.cos(a) * o.r, 0, Math.sin(a) * o.r));
      }
      plane.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(ringPts),
        new THREE.LineBasicMaterial({ color: o.color, transparent: true, opacity: 0.2, depthWrite: false })
      ));

      for (const start of o.sats) {
        const pivot = new THREE.Group();
        plane.add(pivot);

        const sat = new THREE.Group();
        sat.position.set(o.r, 0, 0);
        sat.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.09), bodyMat));
        const panels = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.06, 0.32), panelMat);
        sat.add(panels);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glow, color: o.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        }));
        halo.scale.setScalar(0.42);
        sat.add(halo);
        pivot.add(sat);

        const trailPts = [];
        const trailCol = [];
        const steps = 48;
        for (let i = 0; i <= steps; i++) {
          const k = i / steps;
          const a = -TRAIL * (1 - k) * Math.sign(o.speed);
          trailPts.push(Math.cos(a) * o.r, 0, Math.sin(a) * o.r);
          trailCol.push(o.color.r, o.color.g, o.color.b, k * k * 0.9);
        }
        const trailGeo = new THREE.BufferGeometry();
        trailGeo.setAttribute('position', new THREE.Float32BufferAttribute(trailPts, 3));
        trailGeo.setAttribute('color', new THREE.Float32BufferAttribute(trailCol, 4));
        pivot.add(new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
          vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        })));

        satellites.push({ pivot, sat, halo, start, speed: o.speed });
      }
    }

    // Downlink beam between station and the highest satellite above its horizon
    const linkGeo = new THREE.BufferGeometry();
    linkGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    linkGeo.setAttribute('color', new THREE.Float32BufferAttribute([
      C.orange.r, C.orange.g, C.orange.b, C.green.r, C.green.g, C.green.b,
    ], 3));
    const linkMat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const link = new THREE.Line(linkGeo, linkMat);
    link.frustumCulled = false;
    scene.add(link);

    // Drag to spin the scene
    let yaw = 0, yawVel = 0, dragging = false, lastX = 0;
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true; lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      yawVel = dx * 0.006;
      yaw += yawVel;
    });
    const endDrag = () => { dragging = false; };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    new ResizeObserver(resize).observe(host);

    let visible = true;
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(host);

    const tmpSat = new THREE.Vector3();
    const tmpSt = new THREE.Vector3();
    const tmpN = new THREE.Vector3();
    const tmpDir = new THREE.Vector3();
    const linkPos = linkGeo.attributes.position;
    const pace = reduceMotion ? 0.25 : 1;
    const clock = new THREE.Clock();
    let t = 0;

    const render = () => {
      requestAnimationFrame(render);
      const dt = Math.min(clock.getDelta(), 0.05);
      if (!visible || document.visibilityState !== 'visible') return;
      t += dt * pace;

      if (!dragging) {
        yawVel *= 0.94;
        yaw += yawVel;
      }
      world.rotation.y = -0.5 + yaw;
      spin.rotation.y = t * 0.07;

      for (const p of pulses) {
        const k = ((t * 0.55 + p.offset) % 1);
        p.ring.scale.setScalar(1 + k * 3.2);
        p.ring.material.opacity = 0.85 * (1 - k);
      }

      scene.updateMatrixWorld();
      station.getWorldPosition(tmpSt);
      tmpN.copy(tmpSt).normalize();

      let best = null, bestElev = 0.2;
      for (const s of satellites) {
        s.pivot.rotation.y = -(s.start + t * s.speed);
        s.sat.getWorldPosition(tmpSat);
        const elev = tmpDir.copy(tmpSat).sub(tmpSt).normalize().dot(tmpN);
        s.halo.material.opacity = 0.75;
        if (elev > bestElev) { bestElev = elev; best = s; }
      }

      if (best) {
        best.sat.getWorldPosition(tmpSat);
        linkPos.setXYZ(0, tmpSt.x, tmpSt.y, tmpSt.z);
        linkPos.setXYZ(1, tmpSat.x, tmpSat.y, tmpSat.z);
        linkPos.needsUpdate = true;
        best.halo.material.opacity = 1;
        best.halo.scale.setScalar(0.42 + 0.12 * Math.sin(t * 6));
      }
      const target = best ? 0.55 + 0.25 * Math.sin(t * 5) : 0;
      linkMat.opacity += (target - linkMat.opacity) * 0.12;
      for (const s of satellites) if (s !== best) s.halo.scale.setScalar(0.42);

      renderer.render(scene, camera);
    };
    render();
  }

  /* ── GSAP intro + scroll reveals ──────────────────────────── */
  function initMotion() {
    if (typeof gsap === 'undefined' || reduceMotion) return;

    if (typeof ScrollTrigger !== 'undefined') gsap.registerPlugin(ScrollTrigger);

    const ease = 'expo.out';
    const intro = gsap.timeline({ defaults: { ease } });

    intro
      .from('[data-hero-eyebrow]', { autoAlpha: 0, y: 18, duration: 0.9 }, 0.05)
      .from(
        '[data-hero-line]',
        { autoAlpha: 0, y: 54, rotateX: -28, duration: 1.15, stagger: 0.12, transformPerspective: 800 },
        0.15
      )
      .from('[data-hero-visual]', { autoAlpha: 0, scale: 0.88, duration: 1.8 }, 0.25)
      .from('[data-hero-state]', { autoAlpha: 0, y: 22, duration: 0.95 }, 0.55)
      .from('[data-hero-rule]', { scaleX: 0, transformOrigin: 'left', duration: 1.1 }, 0.7)
      .from('[data-hero-meta] > *', { autoAlpha: 0, y: 24, duration: 0.85, stagger: 0.07 }, 0.8);

    gsap.utils.toArray('[data-reveal]').forEach((el, i) => {
      gsap.from(el, {
        autoAlpha: 0,
        y: 36,
        duration: 1,
        ease,
        delay: i * 0.02,
        scrollTrigger: {
          trigger: el,
          start: 'top 90%',
          once: true,
        },
      });
    });
  }

  function boot() {
    initLenis();
    initScene();
    initOrbit();
    initMotion();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    // Defer one frame so CDN scripts marked defer have executed.
    requestAnimationFrame(boot);
  }
})();
