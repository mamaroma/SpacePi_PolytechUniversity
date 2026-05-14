import React, { useEffect, useRef } from "react";

/**
 * Emergent-3D starfield canvas background.
 * Stars rendered in 3D projection — closer stars appear bigger & brighter,
 * farther stars smaller & dim. On scroll the field shifts creating parallax depth.
 */
export default function SpaceBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    document.body.classList.add("has-space-bg");
    return () => document.body.classList.remove("has-space-bg");
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const STAR_COUNT   = 340;
    const NEBULA_COUNT = 5;
    const FOV          = 340;
    const SPEED        = 0.18;   // warp speed (z-axis drift)

    let W = 0, H = 0;
    let scrollY = 0;
    let rafId;

    /* ── Resize ─────────────────────────────────────────────────────── */
    const resize = () => {
      W = canvas.width  = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    /* ── Scroll tracking ─────────────────────────────────────────────── */
    const onScroll = () => { scrollY = window.scrollY; };
    window.addEventListener("scroll", onScroll, { passive: true });

    /* ── Nebula blobs ─────────────────────────────────────────────── */
    const nebulae = Array.from({ length: NEBULA_COUNT }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.18 + Math.random() * 0.22,
      hue: i % 2 === 0 ? 275 : 22,   // purple / orange
      alpha: 0.04 + Math.random() * 0.06,
      phase: Math.random() * Math.PI * 2,
    }));

    /* ── 3D stars ──────────────────────────────────────────────────── */
    const rand = (a, b) => a + Math.random() * (b - a);

    const mkStar = () => ({
      x: rand(-1, 1),   // normalised screen coords [-1..1]
      y: rand(-1, 1),
      z: rand(0.1, 1),  // depth: 0 = far, 1 = close
      color: Math.random() < 0.18
        ? `hsl(${rand(260, 300)},70%,${rand(72, 90)}%)`  // purple-tinted
        : Math.random() < 0.12
          ? `hsl(${rand(18, 38)},88%,${rand(72, 88)}%)`   // orange
          : `hsl(0,0%,${rand(82, 100)}%)`,                 // white
      twinkle: rand(0, Math.PI * 2),
      twinkleSpeed: rand(0.015, 0.045),
    });

    const stars = Array.from({ length: STAR_COUNT }, mkStar);

    /* ── Frame ──────────────────────────────────────────────────────── */
    let frame = 0;

    const draw = () => {
      frame++;
      rafId = requestAnimationFrame(draw);

      ctx.clearRect(0, 0, W, H);

      /* Background */
      ctx.fillStyle = "#0a081a";
      ctx.fillRect(0, 0, W, H);

      /* Nebulae */
      const scrollFrac = scrollY / (document.body.scrollHeight || 1);
      nebulae.forEach(n => {
        const pulse = 1 + 0.04 * Math.sin(n.phase + frame * 0.008);
        const cx = n.x * W;
        const cy = (n.y + scrollFrac * 0.25 * (1 - n.r)) * H;
        const rad = Math.min(W, H) * n.r * pulse;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        g.addColorStop(0,   `hsla(${n.hue},70%,50%,${n.alpha * 1.6})`);
        g.addColorStop(0.5, `hsla(${n.hue},60%,40%,${n.alpha})`);
        g.addColorStop(1,   "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rad, rad * 0.65, n.phase, 0, Math.PI * 2);
        ctx.fill();
      });

      /* Stars */
      const parallaxY = scrollY * 0.15;
      stars.forEach(s => {
        /* slow z drift = warp crawl */
        s.z -= SPEED * 0.004;
        if (s.z <= 0.02) { Object.assign(s, mkStar()); s.z = 1; }

        s.twinkle += s.twinkleSpeed;

        /* 3D → 2D projection */
        const perspective = FOV / (FOV + (1 - s.z) * FOV * 2.5);
        const sx = (s.x * perspective + 0.5) * W;
        const sy = (s.y * perspective + 0.5) * H - parallaxY * (1 - s.z);

        /* radius: closer = bigger */
        const r   = s.z * s.z * 2.8;
        const twinkleAlpha = 0.7 + 0.3 * Math.sin(s.twinkle);
        const brightness   = 0.55 + s.z * 0.45;

        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(0.3, r), 0, Math.PI * 2);

        /* Glow on bright/close stars */
        if (s.z > 0.55) {
          const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 4);
          glow.addColorStop(0, s.color.replace("hsl", "hsla").replace(")", `,${twinkleAlpha * brightness * 0.9})`));
          glow.addColorStop(1, "transparent");
          ctx.fillStyle = glow;
          ctx.arc(sx, sy, r * 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(sx, sy, Math.max(0.3, r), 0, Math.PI * 2);
        }

        ctx.fillStyle = s.color.includes("hsla")
          ? s.color
          : s.color.replace(")", `,${twinkleAlpha * brightness})`).replace("hsl", "hsla");
        ctx.fill();
      });

      /* Subtle scan-line overlay */
      if (frame % 4 === 0) {
        ctx.fillStyle = "rgba(0,0,0,0.018)";
        for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: -1,
        pointerEvents: "none",
        display: "block",
      }}
    />
  );
}
