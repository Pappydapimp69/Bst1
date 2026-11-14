// Drawing only. Nothing here feeds back into the simulation, so presentation
// randomness and the frame clock are free to use.
import { C } from './sim.js';

export function createRenderer(canvas) {
  const g = canvas.getContext('2d');
  const view = { w: 900, h: 600, scale: 1, dpr: 1, cssW: 0, cssH: 0 };
  const particles = [];
  let shake = 0;

  function fit() {
    const dpr = globalThis.devicePixelRatio || 1;
    view.dpr = dpr;
    view.cssW = innerWidth; view.cssH = innerHeight;
    canvas.width = Math.round(view.cssW * dpr);
    canvas.height = Math.round(view.cssH * dpr);
    // The same amount of meadow on any screen shape.
    view.scale = Math.sqrt((view.cssW * view.cssH) / (900 * 600));
    view.w = view.cssW / view.scale; view.h = view.cssH / view.scale;
  }
  // Checked every frame against the live values instead of waiting on events:
  // a pixel-ratio change (a window dragged to another monitor) fires no
  // resize, and the resolution media query's change event is not dependable
  // either (it never fires under headless device emulation).
  const stale = () => (globalThis.devicePixelRatio || 1) !== view.dpr || innerWidth !== view.cssW || innerHeight !== view.cssH;
  fit();

  const lerp = (a, b, t) => a + (b - a) * t;
  function cellHash(x, y) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function burst(x, y, n, color, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color });
    }
  }

  function onEvent(e, calm) {
    if (e.type === 'pollen') burst(e.x, e.y, calm ? 4 : 16, '#ffd76a', 150);
    if (e.type === 'hit') { burst(e.x, e.y, calm ? 5 : 22, '#ff6a5a', 240); if (!calm) shake = 12; }
  }

  function ground(cam) {
    const S = 80;
    const x0 = Math.floor((cam.x - view.w / 2) / S) - 1, x1 = Math.floor((cam.x + view.w / 2) / S) + 1;
    const y0 = Math.floor((cam.y - view.h / 2) / S) - 1, y1 = Math.floor((cam.y + view.h / 2) / S) + 1;
    g.lineCap = 'round';
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const r = cellHash(cx, cy), r2 = cellHash(cx + 91, cy - 37), r3 = cellHash(cx - 13, cy + 57);
      const x = (cx + r) * S, y = (cy + r2) * S;
      if (x < 0 || x > C.W || y < 0 || y > C.H) continue;
      if (r3 < 0.14) {           // a flower
        g.fillStyle = r3 < 0.07 ? '#8f7fd6' : '#d98fb4';
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + r * 6;
          g.beginPath(); g.arc(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 3.4, 0, 7); g.fill();
        }
        g.fillStyle = '#f2e3a0'; g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill();
      } else {                   // a tuft of grass
        g.strokeStyle = r3 < 0.55 ? '#2f6b4a' : '#3f8358';
        g.lineWidth = 2.2;
        g.beginPath();
        for (let k = -1; k <= 1; k++) { g.moveTo(x + k * 4, y); g.lineTo(x + k * 9 + (r - 0.5) * 6, y - 10 - r2 * 9); }
        g.stroke();
      }
    }
    // The hedge round the meadow.
    g.strokeStyle = '#1d4a35'; g.lineWidth = 26; g.lineJoin = 'round';
    g.strokeRect(-13, -13, C.W + 26, C.H + 26);
    g.strokeStyle = '#2c6b4b'; g.lineWidth = 6;
    g.strokeRect(-3, -3, C.W + 6, C.H + 6);
  }

  function wings(x, y, ang, flap, span, depth, fill) {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.fillStyle = fill;
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(2, 0);
      g.quadraticCurveTo(depth * 0.4, side * span * flap, -depth * 0.2, side * span * flap);
      g.quadraticCurveTo(-depth, side * span * flap * 0.7, -depth * 0.5, 0);
      g.closePath(); g.fill();
    }
    g.restore();
  }

  // The two markers differ in shape, not only colour, so they stay apart for
  // eyes that confuse red and gold: a round grain for pollen, a barb for a bat.
  function edgeMarker(sx, sy, color, size, round) {
    const cx = view.cssW / 2, cy = view.cssH / 2, pad = 22;
    const dx = sx - cx, dy = sy - cy;
    const k = Math.min((cx - pad) / Math.abs(dx || 1e-6), (cy - pad) / Math.abs(dy || 1e-6));
    if (k >= 1) return;
    g.save(); g.translate(cx + dx * k, cy + dy * k); g.rotate(Math.atan2(dy, dx));
    g.fillStyle = color;
    g.beginPath();
    if (round) g.arc(0, 0, size * 0.55, 0, 7);
    else { g.moveTo(size, 0); g.lineTo(-size * 0.7, -size * 0.75); g.lineTo(-size * 0.3, 0); g.lineTo(-size * 0.7, size * 0.75); g.closePath(); }
    g.fill(); g.restore();
  }

  function draw(s, alpha, cam, time, frameDt, opts) {
    if (stale()) fit();
    const { dpr, scale } = view, k = dpr * scale;
    const m = s.moth, mx = lerp(m.px, m.x, alpha), my = lerp(m.py, m.y, alpha);
    let ox = 0, oy = 0;
    if (shake > 0.3 && !opts.calm) { ox = (Math.random() - 0.5) * shake; oy = (Math.random() - 0.5) * shake; shake *= Math.pow(0.002, frameDt); } else shake = 0;
    const world = () => g.setTransform(k, 0, 0, k, (view.cssW / 2 - (cam.x + ox) * scale) * dpr, (view.cssH / 2 - (cam.y + oy) * scale) * dpr);
    const toScreen = (x, y) => ({ x: view.cssW / 2 + (x - cam.x) * scale, y: view.cssH / 2 + (y - cam.y) * scale });

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#05080f'; g.fillRect(0, 0, canvas.width, canvas.height);
    world();
    g.fillStyle = '#143326'; g.fillRect(0, 0, C.W, C.H);
    ground(cam);

    // Bat bodies sit under the darkness: only the light shows them whole.
    for (const b of s.bats) {
      if (b.warm > 0) continue;
      const bx = lerp(b.px, b.x, alpha), by = lerp(b.py, b.y, alpha);
      g.globalAlpha = b.leaving ? 0.45 : 1;
      const ang = Math.atan2(b.vy, b.vx), flap = 0.55 + 0.45 * Math.sin(time * 16 + b.id);
      wings(bx, by, ang, flap, 30, 24, '#6a4f8c');
      g.fillStyle = '#2b1f40'; g.beginPath(); g.ellipse(bx, by, 12, 7.5, ang, 0, 7); g.fill();
      g.globalAlpha = 1;
    }

    // Darkness, opened by the moth's light. The light shrinks as it burns down.
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ms = toScreen(mx - ox, my - oy);
    const flicker = opts.calm ? 0 : Math.sin(time * 9) * 4 + Math.sin(time * 23) * 2;
    const R = (110 + 330 * s.glow + flicker) * scale;
    const dark = g.createRadialGradient(ms.x, ms.y, R * 0.15, ms.x, ms.y, R);
    dark.addColorStop(0, 'rgba(4,6,14,0)');
    dark.addColorStop(0.55, 'rgba(4,6,14,0.45)');
    dark.addColorStop(1, 'rgba(4,6,14,0.95)');
    g.fillStyle = dark; g.fillRect(0, 0, view.cssW, view.cssH);
    const warm = g.createRadialGradient(ms.x, ms.y, 0, ms.x, ms.y, R * 0.6);
    warm.addColorStop(0, `rgba(255,196,96,${0.10 + 0.14 * s.glow})`);
    warm.addColorStop(1, 'rgba(255,196,96,0)');
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = warm; g.fillRect(0, 0, view.cssW, view.cssH);

    // Everything that carries its own light, drawn over the dark.
    world();
    for (const p of s.pollen) {
      const pulse = 1 + 0.18 * Math.sin(time * 3 + p.id);
      const halo = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, 30 * pulse);
      halo.addColorStop(0, 'rgba(255,224,130,0.95)');
      halo.addColorStop(0.25, 'rgba(255,200,90,0.45)');
      halo.addColorStop(1, 'rgba(255,190,80,0)');
      g.fillStyle = halo; g.beginPath(); g.arc(p.x, p.y, 30 * pulse, 0, 7); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    for (const b of s.bats) {
      if (b.leaving) continue;
      const bx = lerp(b.px, b.x, alpha), by = lerp(b.py, b.y, alpha);
      if (b.warm > 0) {     // the warning: a ring closing on where the bat wakes
        const t = b.warm / C.BAT_WARM;
        g.strokeStyle = `rgba(255,90,80,${0.9 - 0.5 * t})`; g.lineWidth = 3;
        g.beginPath(); g.arc(bx, by, 14 + 40 * t, 0, 7); g.stroke();
      }
      const dx = m.x - b.x, dy = m.y - b.y, d = Math.hypot(dx, dy) || 1;
      const ang = b.warm > 0 ? Math.atan2(dy, dx) : Math.atan2(b.vy, b.vx);
      g.fillStyle = '#ff5a4f';
      for (const side of [-1, 1]) {
        g.beginPath();
        g.arc(bx + Math.cos(ang) * 6 - Math.sin(ang) * 3.4 * side, by + Math.sin(ang) * 6 + Math.cos(ang) * 3.4 * side, 2.1, 0, 7);
        g.fill();
      }
    }

    // The moth.
    const sp = Math.hypot(m.vx, m.vy);
    const ang = sp > 8 ? Math.atan2(m.vy, m.vx) : -Math.PI / 2;
    const blink = m.safe > 0 && Math.floor(time * 14) % 2 === 0;
    if (!blink || opts.calm) {
      g.globalAlpha = m.safe > 0 && opts.calm ? 0.55 : 1;
      const flap = 0.45 + 0.55 * Math.abs(Math.sin(time * (opts.calm ? 9 : 22)));
      wings(mx, my, ang, flap, 23, 22, '#f4e2b8');
      wings(mx, my, ang, flap * 0.8, 13, 13, '#e2b877');
      g.fillStyle = '#6b4a2a'; g.beginPath(); g.ellipse(mx, my, 11, 5, ang, 0, 7); g.fill();
      g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(mx - Math.cos(ang) * 8, my - Math.sin(ang) * 8, 3.6 + 2.4 * s.glow, 0, 7); g.fill();
      g.globalAlpha = 1;
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= frameDt * 1.8;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * frameDt; p.y += p.vy * frameDt; p.vx *= 0.96; p.vy *= 0.96;
      g.globalAlpha = p.life; g.fillStyle = p.color;
      g.beginPath(); g.arc(p.x, p.y, 2.6 * p.life + 0.6, 0, 7); g.fill();
    }
    g.globalAlpha = 1;

    // Screen space: where the off-screen things are, and the thumb stick.
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const near = [...s.pollen].sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y)).slice(0, 3);
    for (const p of near) { const q = toScreen(p.x, p.y); edgeMarker(q.x, q.y, 'rgba(255,214,110,0.9)', 9, true); }
    for (const b of s.bats) { if (!b.leaving) { const q = toScreen(b.x, b.y); edgeMarker(q.x, q.y, 'rgba(255,90,80,0.95)', 12, false); } }
    if (opts.stick) {
      const st = opts.stick;
      g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 2;
      g.beginPath(); g.arc(st.ox, st.oy, 56, 0, 7); g.stroke();
      const dx = st.x - st.ox, dy = st.y - st.oy, d = Math.hypot(dx, dy) || 1, c = Math.min(1, 56 / d);
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.beginPath(); g.arc(st.ox + dx * c, st.oy + dy * c, 20, 0, 7); g.fill();
    }
    return ms;
  }

  return { draw, view, onEvent, clear() { particles.length = 0; shake = 0; } };
}
