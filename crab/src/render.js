// Drawing only: nothing here feeds back into the simulation.
import { C, tideAt, tierOf, hitRadius, ringPlace } from './sim.js';

const SHELL_COLORS = ['#f4a99a', '#f6dcc6', '#c9a3d6', '#f6e39b', '#9fd3c7'];
const INK = '#5b3a29';

export function createRenderer(canvas) {
  const g = canvas.getContext('2d');
  const view = { scale: 1, dpr: 1, cssW: 0, cssH: 0, ox: 0, oy: 0 };
  const particles = [], popups = [];
  let shake = 0, walk = 0, goal = { x: C.CASTLE_X, y: C.CASTLE_Y };

  function fit() {
    const dpr = globalThis.devicePixelRatio || 1;
    view.dpr = dpr; view.cssW = innerWidth; view.cssH = innerHeight;
    canvas.width = Math.round(view.cssW * dpr); canvas.height = Math.round(view.cssH * dpr);
    // The whole beach is always in view: fit the field inside the screen.
    view.scale = Math.min(view.cssW / C.W, view.cssH / C.H);
    view.ox = (view.cssW - C.W * view.scale) / 2; view.oy = (view.cssH - C.H * view.scale) / 2;
  }
  const stale = () => (globalThis.devicePixelRatio || 1) !== view.dpr || innerWidth !== view.cssW || innerHeight !== view.cssH;
  fit();

  const lerp = (a, b, t) => a + (b - a) * t;
  function cellHash(x, y) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function burst(x, y, n, colors, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life: 1, color: colors[i % colors.length], r: 2 + Math.random() * 3 });
    }
  }
  function onEvent(e, calm) {
    const k = calm ? 0.3 : 1;
    if (e.type === 'pick') burst(e.x, e.y, Math.ceil(5 * k), ['#fff6dc', '#f6dcc6'], 90);
    if (e.type === 'build') { burst(goal.x, goal.y, Math.ceil((6 + 4 * e.n) * k), ['#fff6dc', '#e8c98a', '#f4a99a'], 170); popups.push({ x: goal.x, y: goal.y - 70, text: '+' + e.n, life: 1, color: '#2f7d4f' }); }
    if (e.type === 'hit') { burst(e.x, e.y, Math.ceil(8 * e.lost * k), SHELL_COLORS, 260); popups.push({ x: e.x, y: e.y - 40, text: '−' + e.lost, life: 1, color: '#c22a3c' }); if (!calm) shake = 14; }
    if (e.type === 'steal') { burst(e.x, e.y, Math.ceil(6 * k), SHELL_COLORS, 160); popups.push({ x: e.x, y: e.y - 30, text: '−1', life: 1, color: '#c22a3c' }); }
    if (e.type === 'peck') burst(e.x, e.y - 6, Math.ceil(4 * k), ['#fff6dc', '#e9c9a0'], 90);
    if (e.type === 'sting') burst(e.x, e.y - 10, Math.ceil(16 * k), ['#e0457b', '#f27aa2', '#fff6dc'], 220);
    if (e.type === 'shoo') burst(e.x, e.y, Math.ceil(10 * k), ['#fbfbf7', '#b9c2c9'], 180);
    if (e.type === 'chain') { burst(e.x, e.y, Math.ceil(30 * k), ['#e9c9a0', '#fff6dc', '#f6e39b'], 220); if (e.joined) popups.push({ x: e.x, y: e.y - 40, text: '+1 crab', life: 1, color: '#2f7d4f' }); }
    if (e.type === 'miss') burst(e.x, e.y, Math.ceil(7 * k), ['#e7d3a0', '#d6bf86'], 110);
    if (e.type === 'tier') burst(goal.x, goal.y - 30, Math.ceil(40 * k), ['#fff6dc', '#f6e39b', '#f4a99a', '#9fd3c7'], 260);
    if (e.type === 'won') burst(goal.x, goal.y - 60, Math.ceil(90 * k), ['#e2553d', '#f6e39b', '#3aa6b9', '#fff6dc', '#c9a3d6'], 340);
  }

  function shell(x, y, id, size = 9) {
    g.fillStyle = SHELL_COLORS[id % SHELL_COLORS.length]; g.strokeStyle = INK; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x - size, y + size * 0.45); g.arc(x, y + size * 0.45, size, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
    g.lineWidth = 1; g.beginPath();
    for (let k = -1; k <= 1; k++) { g.moveTo(x, y + size * 0.45); g.lineTo(x + k * size * 0.55, y - size * 0.4 + Math.abs(k) * size * 0.25); }
    g.stroke();
  }

  // The castle, one ring at a time and each ring one tier at a time. A finished
  // tier is solid sand, the tier in progress rises from the ground, and every
  // tier still to come is a dashed plan. Rings already built stand behind the
  // one in progress, each drawn about its own spot on the beach.
  const both = (f) => { f(-1); f(1); };
  const berm = (a, b) => { g.moveTo(a, 44); g.lineTo(a + 16, 22); g.lineTo(b - 16, 22); g.lineTo(b, 44); g.closePath(); };
  const merlons = (a, b, stepX, top) => { for (let x = a; x <= b; x += stepX) g.rect(x - 7, top, 14, 10); };
  const RING_TIERS = [
    [   // the keep
      [() => { g.moveTo(-92, 44); g.lineTo(-74, 16); g.lineTo(74, 16); g.lineTo(92, 44); g.closePath(); }, 16, 44],
      [() => { g.rect(-62, -14, 124, 30); for (let k = -3; k <= 3; k += 2) g.rect(k * 16 - 7, -24, 14, 10); }, -24, 16],
      [() => { both((sx) => { g.rect(sx * 62 - 17, -52, 34, 68); g.rect(sx * 62 - 21, -62, 12, 10); g.rect(sx * 62 + 9, -62, 12, 10); }); }, -62, 16],
      [() => { g.rect(-26, -84, 52, 70); g.rect(-30, -94, 14, 10); g.rect(-7, -94, 14, 10); g.rect(16, -94, 14, 10); }, -94, -14],
      [() => { g.rect(-2, -132, 4, 40); }, -132, -92],
    ],
    [   // the curtain wall
      [() => berm(-200, 200), 22, 44],
      [() => g.rect(-176, -8, 352, 30), -8, 22],
      [() => merlons(-165, 165, 30, -18), -18, -8],
      [() => both((sx) => { g.rect(sx * 179 - 17, -40, 34, 62); g.rect(sx * 179 - 19, -50, 12, 10); g.rect(sx * 179 + 7, -50, 12, 10); }), -50, 22],
      [() => { g.rect(-30, -30, 60, 52); merlons(-24, 24, 24, -40); }, -40, 22],
    ],
    [   // the towers
      [() => both((sx) => berm(sx * 250 - 56, sx * 250 + 56)), 22, 44],
      [() => both((sx) => g.rect(sx > 0 ? 176 : -276, -2, 100, 24)), -2, 22],
      [() => both((sx) => g.rect(sx * 250 - 32, -70, 64, 92)), -70, 22],
      [() => both((sx) => merlons(sx * 250 - 26, sx * 250 + 26, 26, -80)), -80, -70],
      [() => both((sx) => { g.moveTo(sx * 250 - 32, -80); g.lineTo(sx * 250, -130); g.lineTo(sx * 250 + 32, -80); g.closePath(); }), -130, -80],
    ],
    [   // the second keep
      [() => berm(-112, 112), 22, 44],
      [() => g.rect(-90, -6, 180, 28), -6, 22],
      [() => g.rect(-50, -70, 100, 64), -70, -6],
      [() => merlons(-43, 43, 43, -80), -80, -70],
      [() => { g.moveTo(-16, -80); g.lineTo(0, -122); g.lineTo(16, -80); g.closePath(); }, -122, -80],
    ],
    [   // the outer wall
      [() => berm(-344, 344), 22, 44],
      [() => g.rect(-322, -4, 644, 26), -4, 22],
      [() => merlons(-310, 310, 31, -14), -14, -4],
      [() => { g.rect(-62, -50, 40, 72); g.rect(22, -50, 40, 72); }, -50, 22],
      [() => both((sx) => g.rect(sx * 326 - 20, -56, 40, 78)), -56, 22],
    ],
  ];

  function ring(r, done, part, fallen, plan) {
    const tiers = RING_TIERS[r], at = ringPlace(r).goal;
    g.save(); g.translate(at.x, at.y);
    if (fallen) { g.translate(0, 30); g.scale(1.06, 0.38); }
    for (let t = 0; t < tiers.length; t++) {
      const [shape, top, bottom] = tiers[t];
      const solid = t < done ? 1 : t === done ? part : 0;
      if (solid > 0) {
        g.save();
        g.beginPath(); g.rect(-400, bottom - (bottom - top) * solid, 800, (bottom - top) * solid + 1); g.clip();
        g.setLineDash([]); g.beginPath(); shape();
        g.fillStyle = fallen ? '#b89f6a' : t % 2 ? '#e3c583' : '#d8b770'; g.fill();
        g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
        g.restore();
      }
      if (solid < 1 && plan) {
        g.setLineDash([6, 6]); g.lineWidth = 1.6; g.strokeStyle = 'rgba(91,58,41,0.45)';
        g.beginPath(); shape(); g.stroke();
      }
    }
    g.setLineDash([]);
    g.restore();
  }

  function castle(s, time, calm) {
    const done = tierOf(s.built), per = C.NEED / C.TIERS, part = (s.built - done * per) / per;
    const lost = s.phase === 'lost';
    for (let r = 0; r <= s.ring; r++) {
      const current = r === s.ring;
      // A lost run takes the ring in progress and knocks down the newest one standing.
      ring(r, current ? done : C.TIERS, current ? part : 0, lost && (current || r === s.ring - 1), current && !lost);
    }
    const keepUp = s.ring > 0 ? !(lost && s.ring === 1) : done >= C.TIERS;
    if (keepUp) {      // the flag flies on a finished keep
      const wave = calm ? 0 : Math.sin(time * 7) * 5;
      g.save(); g.translate(C.CASTLE_X, C.CASTLE_Y);
      g.fillStyle = '#e2553d'; g.strokeStyle = INK; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(2, -131); g.quadraticCurveTo(18, -138 + wave, 34, -124); g.quadraticCurveTo(18, -116 - wave, 2, -113); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
    // The ring where shells are handed over, in front of the ring being built.
    if (!lost) {
      const pulse = s.carry > 0 && !calm ? 0.5 + 0.5 * Math.sin(time * 6) : 0.4;
      g.setLineDash([10, 9]); g.lineWidth = 3; g.strokeStyle = `rgba(91,58,41,${0.25 + 0.4 * pulse})`;
      g.beginPath(); g.ellipse(s.goal.x, s.goal.y + 12, C.CASTLE_R + 30, C.CASTLE_R + 4, 0, 0, 7); g.stroke();
      g.setLineDash([]);
    }
  }

  // A hermit crab's home shell: a coiled whorl, bigger with each size.
  function homeShell(x, y, size, scale = 1) {
    const R = (11 + 4 * size) * scale;
    g.save(); g.translate(x, y);
    g.fillStyle = '#e9c9a0'; g.strokeStyle = INK; g.lineWidth = 2 * Math.min(1, scale + 0.2);
    g.beginPath(); g.ellipse(0, 0, R, R * 0.82, 0, 0, 7); g.fill(); g.stroke();
    g.lineWidth = 1.4 * Math.min(1, scale + 0.2); g.beginPath();
    for (let a = 0; a < 9.5; a += 0.25) { const rr = R * 0.86 * (1 - a / 11); const px = Math.cos(a) * rr, py = Math.sin(a) * rr * 0.8; a ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.stroke(); g.restore();
  }
  function anemone(x, y, k = 1, dull = false, time = 0) {
    g.save(); g.translate(x, y); g.scale(k, k);
    g.strokeStyle = dull ? '#b9a3a8' : '#e0457b'; g.lineWidth = 2.4; g.lineCap = 'round';
    for (let i = 0; i < 7; i++) { const a = -Math.PI + (i + 0.5) * Math.PI / 7, w = Math.sin(time * 4 + i) * 0.15; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(Math.cos(a + w) * 7, Math.sin(a + w) * 9, Math.cos(a) * 10, Math.sin(a) * 11); g.stroke(); }
    g.fillStyle = dull ? '#cdb8bc' : '#f27aa2'; g.strokeStyle = INK; g.lineWidth = 1.2;
    g.beginPath(); g.ellipse(0, 1, 7, 5, 0, 0, 7); g.fill(); g.stroke();
    g.restore();
  }
  function guard(q, time, calm) {
    g.save(); g.translate(q.x, q.y); g.scale(1.3, 1.3);
    const stunned = q.stun > 0;
    if (stunned && !calm) g.rotate(Math.sin(time * 9 + q.id) * 0.12);
    homeShell(0, -6, q.size, 0.6);
    g.strokeStyle = INK; g.lineWidth = 1.6; g.lineCap = 'round';
    for (const side of [-1, 1]) { g.beginPath(); g.moveTo(side * 7, 2); g.lineTo(side * 13, 6); g.stroke(); }
    g.fillStyle = stunned ? '#c98a7c' : '#e2553d';
    g.beginPath(); g.ellipse(0, 3, 10, 7, 0, 0, 7); g.fill(); g.stroke();
    for (const side of [-1, 1]) { g.beginPath(); g.arc(side * 10, -1, 4, 0, 7); g.fill(); g.stroke(); }
    g.fillStyle = '#fff'; for (const side of [-1, 1]) { g.beginPath(); g.arc(side * 3.5, -3, 2.4, 0, 7); g.fill(); g.stroke(); }
    if (q.armed) anemone(13, -6, 0.6, q.used, calm ? 0 : time);
    for (let i = 0; i < q.size; i++) {                // pips: pecks it can still take
      g.fillStyle = i < q.hp && !stunned ? '#2f7d4f' : 'rgba(59,42,26,0.2)';
      g.beginPath(); g.arc((i - (q.size - 1) / 2) * 6, 15, 2.2, 0, 7); g.fill();
    }
    if (stunned) { g.fillStyle = '#f6e39b'; g.strokeStyle = INK; g.lineWidth = 0.8; for (let k = 0; k < 2; k++) { const a = time * (calm ? 2 : 6) + k * 3.1; g.beginPath(); g.arc(Math.cos(a) * 12, -16 + Math.sin(a) * 4, 2.4, 0, 7); g.fill(); g.stroke(); } }
    g.restore();
  }

  function crab(s, x, y, time, calm) {
    const c = s.crab, stunned = c.stun > 0;
    const step = Math.sin(walk * 0.22);
    g.save(); g.translate(x, y);
    if (stunned && !calm) g.rotate(Math.sin(time * 30) * 0.18);
    if (s.shell) homeShell(-c.fx * 9, -c.fy * 7 + 2, s.shell, 0.9);
    g.strokeStyle = INK; g.lineWidth = 2.2; g.lineCap = 'round';
    for (const side of [-1, 1]) for (let k = -1; k <= 1; k++) {      // legs
      const sw = step * 4 * (k === 0 ? -1 : 1) * side;
      g.beginPath(); g.moveTo(side * 12, k * 5); g.lineTo(side * 21, k * 8 + sw); g.lineTo(side * 25, k * 8 + 5 + sw); g.stroke();
    }
    for (const side of [-1, 1]) {                                     // claws reach the way it faces
      const cx = side * 15 + c.fx * 8, cy = -6 + c.fy * 9;
      g.beginPath(); g.moveTo(side * 11, -3); g.lineTo(cx, cy); g.stroke();
      g.fillStyle = stunned ? '#c98a7c' : '#e2553d';
      g.beginPath(); g.arc(cx, cy, 6.5, 0, 7); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + c.fx * 6 + side * 2, cy + c.fy * 6); g.stroke();
    }
    g.fillStyle = stunned ? '#c98a7c' : '#e2553d';
    g.beginPath(); g.ellipse(0, 0, 17, 12, 0, 0, 7); g.fill(); g.stroke();
    for (const side of [-1, 1]) {                                     // eyes
      const ex = side * 6 + c.fx * 3, ey = -9 + c.fy * 3;
      g.fillStyle = '#fff'; g.beginPath(); g.arc(ex, ey, 4.2, 0, 7); g.fill(); g.lineWidth = 1.4; g.stroke();
      g.fillStyle = '#20140e'; g.beginPath(); g.arc(ex + c.fx * 1.6, ey + c.fy * 1.6, 1.9, 0, 7); g.fill();
    }
    // The load, stacked on its back where both the player and the gulls can see it.
    const lean = Math.max(-1, Math.min(1, -c.vx / 200));
    const top = (s.shell || 0) * 4;
    for (let i = 0; i < s.carry; i++) {
      if (s.carryAnemone && i === s.carry - 1) anemone(lean * i * 2.2, -16 - top - i * 9.5, 0.9, false, calm ? 0 : time);
      else shell(lean * i * 2.2, -14 - top - i * 9.5, i + 1, 10);
    }
    if (stunned) {
      g.fillStyle = '#f6e39b'; g.strokeStyle = INK; g.lineWidth = 1;
      for (let k = 0; k < 3; k++) { const a = time * (calm ? 2 : 7) + k * 2.1; g.beginPath(); g.arc(Math.cos(a) * 20, -22 + Math.sin(a) * 6, 3, 0, 7); g.fill(); g.stroke(); }
    }
    g.restore();
  }

  function gull(gl, x, y, time, crabX, crabY) {
    const far = Math.hypot(gl.ax - x, gl.ay - y);
    const alt = gl.state === 'dive' ? Math.min(74, far * 0.45) : gl.state === 'raid' ? Math.min(74, far * 0.4) : gl.state === 'perch' ? 6 + Math.max(0, Math.sin(time * 9)) * 4 : 74;
    g.fillStyle = `rgba(40,30,20,${0.26 - alt * 0.0018})`;
    g.beginPath(); g.ellipse(x, y, 20 - alt * 0.08, 8 - alt * 0.03, 0, 0, 7); g.fill();
    let dx = x - gl.px, dy = y - gl.py;
    if (gl.state === 'wind') { dx = crabX - x; dy = crabY - y; }
    if (gl.state === 'perch') { dx = 0; dy = 1; }
    const ang = Math.atan2(dy, dx), flap = gl.state === 'dive' ? -0.5 : gl.state === 'wind' ? Math.sin(time * 26) * 0.9 : Math.sin(time * 6 + gl.id) * 0.7;
    g.save(); g.translate(x, y - alt); g.rotate(ang);
    g.strokeStyle = INK; g.lineWidth = 1.6; g.lineJoin = 'round';
    for (const side of [-1, 1]) {
      g.fillStyle = '#b9c2c9';
      g.beginPath(); g.moveTo(4, side * 3); g.lineTo(-2, side * (20 + flap * 6)); g.lineTo(-14, side * (30 + flap * 9)); g.lineTo(-9, side * 4); g.closePath(); g.fill(); g.stroke();
    }
    g.fillStyle = '#fbfbf7'; g.beginPath(); g.ellipse(0, 0, 15, 7, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#f2b632'; g.beginPath(); g.moveTo(14, -2.5); g.lineTo(22, 0); g.lineTo(14, 2.5); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#20140e'; g.beginPath(); g.arc(9, -2.5, 1.2, 0, 7); g.arc(9, 2.5, 1.2, 0, 7); g.fill();
    g.restore();
  }

  function draw(s, alpha, time, frameDt, opts) {
    if (stale()) fit();
    const { dpr, scale } = view, calm = opts.calm;
    const c = s.crab, cx = lerp(c.px, c.x, alpha), cy = lerp(c.py, c.y, alpha);
    walk += Math.hypot(c.x - c.px, c.y - c.py);
    let sx = 0, sy = 0;
    if (shake > 0.4 && !calm) { sx = (Math.random() - 0.5) * shake; sy = (Math.random() - 0.5) * shake; shake *= Math.pow(0.002, frameDt); } else shake = 0;
    g.setTransform(dpr * scale, 0, 0, dpr * scale, (view.ox + sx) * dpr, (view.oy + sy) * dpr);
    const L = -view.ox / scale - 30, R = C.W + view.ox / scale + 30, T = -view.oy / scale - 30, B = C.H + view.oy / scale + 30;
    const tide = tideAt(s);
    goal = s.goal;

    // Sand, lighter and drier toward the dunes.
    const sand = g.createLinearGradient(0, 0, 0, C.H);
    sand.addColorStop(0, '#f5e6ba'); sand.addColorStop(1, '#e6cf98');
    g.fillStyle = sand; g.fillRect(L, T, R - L, B - T);
    for (let gy = Math.floor(T / 60); gy <= B / 60; gy++) for (let gx = Math.floor(L / 60); gx <= R / 60; gx++) {
      const r = cellHash(gx, gy), r2 = cellHash(gx + 17, gy - 5), x = (gx + r) * 60, y = (gy + r2) * 60;
      g.fillStyle = r < 0.5 ? 'rgba(160,125,70,0.28)' : 'rgba(255,255,255,0.35)';
      g.beginPath(); g.arc(x, y, 1.6 + r2 * 1.8, 0, 7); g.fill();
      if (y < 70 && r > 0.35) {            // dune grass along the top
        g.strokeStyle = '#8fa35c'; g.lineWidth = 2; g.beginPath();
        for (let k = -1; k <= 1; k++) { g.moveTo(x + k * 4, y); g.lineTo(x + k * 8, y - 14 - r * 8); }
        g.stroke();
      }
    }
    // The line the tide will reach, marked the way a real beach marks it.
    g.strokeStyle = 'rgba(110,125,70,0.55)'; g.lineWidth = 4; g.setLineDash([14, 10, 5, 12]);
    g.beginPath(); g.moveTo(L, s.foot + 6); g.lineTo(R, s.foot + 6); g.stroke(); g.setLineDash([]);
    g.fillStyle = 'rgba(150,120,70,0.16)'; g.fillRect(L, tide.line - 46, R - L, 46);     // wet sand
    g.fillStyle = 'rgba(70,50,30,0.07)'; g.fillRect(L, T, -L, B - T); g.fillRect(C.W, T, R - C.W, B - T);

    castle(s, time, calm);
    for (const q of s.guards || []) guard(q, time, calm);
    // A perched thief: the dashed circle is where to stand to chase it off.
    for (const gl of s.gulls) if (gl.state === 'perch') {
      g.setLineDash([5, 7]); g.strokeStyle = 'rgba(194,42,60,0.7)'; g.lineWidth = 2.5;
      g.beginPath(); g.arc(gl.x, gl.y, C.SHOO_R, 0, 7); g.stroke(); g.setLineDash([]);
    }
    // The big empty shell, its countdown, and the crabs queued behind it.
    if (s.vacancy) {
      const v = s.vacancy, u = v.t / C.VAC_TICKS;
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 4;
      g.beginPath(); g.arc(v.x, v.y, 30, -Math.PI / 2, -Math.PI / 2 + u * Math.PI * 2); g.stroke();
      homeShell(v.x, v.y, v.size, 0.9);
      v.line.forEach((sz, i) => { const q = { id: i, x: v.x + 34 + i * 26, y: v.y + 6, size: sz, hp: sz, stun: 0 }; guard(q, time, calm); });
    }
    if (s.anemone) {
      if (!calm) { g.strokeStyle = `rgba(242,122,162,${0.5 + 0.4 * Math.sin(time * 5)})`; g.lineWidth = 2; g.beginPath(); g.arc(s.anemone.x, s.anemone.y, 17, 0, 7); g.stroke(); }
      anemone(s.anemone.x, s.anemone.y, 1, false, calm ? 0 : time);
    }
    for (const sh of s.shells) {
      if (s.phase === 'wait' && !calm) { g.strokeStyle = `rgba(255,255,255,${0.5 + 0.4 * Math.sin(time * 5 + sh.id)})`; g.lineWidth = 2; g.beginPath(); g.arc(sh.x, sh.y, 15 + 2 * Math.sin(time * 5 + sh.id), 0, 7); g.stroke(); }
      shell(sh.x, sh.y, sh.id);
    }

    // The sea, drawn over whatever it has covered.
    const edge = (x) => tide.line + (calm ? 0 : Math.sin(x * 0.021 + time * 1.7) * 5 + Math.sin(x * 0.047 - time * 1.1) * 3);
    const sea = g.createLinearGradient(0, tide.line, 0, tide.line + 420);
    sea.addColorStop(0, 'rgba(96,196,205,0.78)'); sea.addColorStop(0.25, 'rgba(46,150,178,0.9)'); sea.addColorStop(1, 'rgba(22,96,134,0.97)');
    g.fillStyle = sea; g.beginPath(); g.moveTo(L, B);
    for (let x = L; x <= R + 12; x += 12) g.lineTo(x, edge(x));
    g.lineTo(R, B); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.92)'; g.lineWidth = 5; g.lineJoin = 'round';
    g.beginPath(); for (let x = L; x <= R + 12; x += 12) g.lineTo(x, edge(x)); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2.5;
    g.beginPath(); for (let x = L; x <= R + 12; x += 12) g.lineTo(x, edge(x + 90) + 22); g.stroke();

    // While the world waits, a trail shows the next thing to do.
    if (s.phase === 'wait' && opts.playing) {
      const target = s.carry > 0 ? { x: s.goal.x, y: s.goal.y + 40 } : s.shells.reduce((a, b) => (Math.hypot(b.x - cx, b.y - cy) < Math.hypot(a.x - cx, a.y - cy) ? b : a), s.shells[0]);
      if (target) {
        const dx = target.x - cx, dy = target.y - cy, d = Math.hypot(dx, dy) || 1, ang = Math.atan2(dy, dx);
        const slide = calm ? 0 : (time * 60) % 34;
        for (let k = 36; k + slide < d - 22; k += 34) {
          const t = k + slide;
          g.save(); g.translate(cx + (dx / d) * t, cy + (dy / d) * t); g.rotate(ang);
          g.strokeStyle = 'rgba(91,58,41,0.55)'; g.lineWidth = 3.5; g.lineCap = 'round';
          g.beginPath(); g.moveTo(-6, -7); g.lineTo(2, 0); g.lineTo(-6, 7); g.stroke(); g.restore();
        }
      }
    }

    // A touch path: the way the crab will walk, ending in a ring.
    if (opts.path && opts.path.length && opts.playing) {
      g.strokeStyle = 'rgba(91,58,41,0.5)'; g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round'; g.setLineDash([2, 10]);
      g.beginPath(); g.moveTo(cx, cy); for (const p of opts.path) g.lineTo(p.x, p.y); g.stroke(); g.setLineDash([]);
      const end = opts.path[opts.path.length - 1];
      g.lineWidth = 3; g.beginPath(); g.arc(end.x, end.y, 11, 0, 7); g.stroke();
    }

    // Where a gull will strike: locked on the spot where it chose the crab,
    // the ring closes over the wind-up and the gull lands when it shuts.
    for (const gl of s.gulls) {
      if (gl.state !== 'wind' && gl.state !== 'dive') continue;
      const r = hitRadius(s.carry || 1, s.k), locked = gl.state === 'dive';
      const tx = gl.ax, ty = gl.ay;
      g.fillStyle = locked ? 'rgba(194,42,60,0.3)' : 'rgba(194,42,60,0.12)';
      g.beginPath(); g.arc(tx, ty, r, 0, 7); g.fill();
      g.strokeStyle = '#c22a3c'; g.lineWidth = locked ? 4 : 3;
      g.beginPath(); g.arc(tx, ty, locked ? r : r + 70 * (gl.t / C.WIND), 0, 7); g.stroke();
    }
    if (c.y > tide.line) { g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2; g.beginPath(); g.ellipse(cx, cy + 6, 24 + Math.sin(time * 5) * 3, 9, 0, 0, 7); g.stroke(); }
    crab(s, cx, cy, time, calm);
    for (const gl of s.gulls) gull(gl, lerp(gl.px, gl.x, alpha), lerp(gl.py, gl.y, alpha), time, cx, cy);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= frameDt * 1.5;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += 420 * frameDt; p.x += p.vx * frameDt; p.y += p.vy * frameDt;
      g.globalAlpha = Math.min(1, p.life * 1.6); g.fillStyle = p.color; g.strokeStyle = INK; g.lineWidth = 0.8;
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); g.stroke();
    }
    g.globalAlpha = 1;
    g.font = '800 30px system-ui, sans-serif'; g.textAlign = 'center'; g.lineWidth = 5; g.lineJoin = 'round';
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.life -= frameDt * 0.9;
      if (p.life <= 0) { popups.splice(i, 1); continue; }
      const y = p.y - (1 - p.life) * 46;
      g.globalAlpha = Math.min(1, p.life * 2); g.strokeStyle = '#fff8e4'; g.strokeText(p.text, p.x, y); g.fillStyle = p.color; g.fillText(p.text, p.x, y);
    }
    g.globalAlpha = 1;

    if (opts.stick) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const st = opts.stick;
      g.strokeStyle = 'rgba(59,42,26,0.35)'; g.lineWidth = 2;
      g.beginPath(); g.arc(st.ox, st.oy, 56, 0, 7); g.stroke();
      const dx = st.x - st.ox, dy = st.y - st.oy, d = Math.hypot(dx, dy) || 1, k = Math.min(1, 56 / d);
      g.fillStyle = 'rgba(59,42,26,0.35)'; g.beginPath(); g.arc(st.ox + dx * k, st.oy + dy * k, 20, 0, 7); g.fill();
    }
    return { x: view.ox + cx * scale, y: view.oy + cy * scale };
  }

  return { draw, view, onEvent, clear() { particles.length = 0; popups.length = 0; shake = 0; } };
}
