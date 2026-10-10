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
  function initScene() {
    const canvas = document.getElementById('scene-canvas');
    if (!canvas || typeof THREE === 'undefined') return;

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

    // Soft accent orbs
    const orbMat = (color, opacity) => new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const orbA = new THREE.Mesh(new THREE.SphereGeometry(2.4, 24, 24), orbMat(0x724796, 0.09));
    orbA.position.set(-6, 2, -8);
    const orbB = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 24), orbMat(0x8ad27b, 0.06));
    orbB.position.set(7, -3, -6);
    scene.add(orbA, orbB);

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
      orbA.position.x = -6 + Math.sin(t * 0.2) * 0.4;
      orbB.position.y = -3 + Math.cos(t * 0.17) * 0.35;
      camera.position.x += (pointer.x * 0.6 - camera.position.x) * 0.04;
      camera.position.y += (-pointer.y * 0.4 - camera.position.y) * 0.04;
      camera.lookAt(0, 0, 0);
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
    initMotion();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    // Defer one frame so CDN scripts marked defer have executed.
    requestAnimationFrame(boot);
  }
})();
