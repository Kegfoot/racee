"use client";

import { useEffect, useRef } from "react";

type Particle = { x: number; y: number; vx: number; vy: number; size: number; color: string; rot: number; vr: number; life: number };

const COLORS = ["#f5c542", "#e8e8ec", "#cd7f32", "#ff5d5d", "#4fc3f7", "#7bd88f", "#ffffff"];
const LIFE_MS = 3600;

/**
 * Two little confetti cannons, bottom left and bottom right, that fire each
 * time `fireKey` changes (and not on the first render when it's 0). Purely
 * decorative: it ignores pointer events and cleans itself up.
 */
export function Confetti({ fireKey }: { fireKey: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (fireKey === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const particles: Particle[] = [];
    const cannon = (x: number, direction: 1 | -1) => {
      for (let i = 0; i < 90; i++) {
        // Angle off straight-up, leaning toward the middle of the screen.
        const lean = 0.15 + Math.random() * 0.6;
        const speed = (height / 40) * (0.65 + Math.random() * 0.9);
        particles.push({
          x,
          y: height + 6,
          vx: Math.sin(lean) * speed * direction,
          vy: -Math.cos(lean) * speed,
          size: 5 + Math.random() * 6,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 0.4,
          life: 0,
        });
      }
    };
    cannon(width * 0.06, 1);
    cannon(width * 0.94, -1);

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(now - last, 40);
      last = now;
      ctx.clearRect(0, 0, width, height);
      let alive = false;
      for (const p of particles) {
        p.life += dt;
        if (p.life > LIFE_MS) continue;
        alive = true;
        p.vy += 0.0011 * dt * (height / 40); // gravity
        p.vx *= 0.995;
        p.x += p.vx * (dt / 16);
        p.y += p.vy * (dt / 16);
        p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - p.life / LIFE_MS);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (alive) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, width, height);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, width, height);
    };
  }, [fireKey]);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[60] h-full w-full" />;
}
