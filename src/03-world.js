// ---------------------------------------------------------------- the shore
const WX0 = -66, WSIZE = 232, HRES = 2, HN = WSIZE * HRES;        // height grid: 2 cells per unit over [-66,166]
const TRES = 4, TN = WSIZE * TRES;                                 // terrain image: 4 px per unit
const LOW = 0.10, HIGH = 0.52, NIGHT_LEN = 450, SHALLOW = 0.06;
const LANTERN_R = 15, SPEED = 7, BEAT = 0.375;
const TOWER = { x: 22, y: 15 }, START = { x: 27.5, y: 24.5 };
const SCALE = []; for (let m = 36; m < 100; m++) if ([0, 2, 4, 7, 9].includes(m % 12)) SCALE.push(m);
const GROUND_START = { water: SCALE.indexOf(48), sand: SCALE.indexOf(57), stone: SCALE.indexOf(64), moss: SCALE.indexOf(69) };
const tideLevel = (f) => LOW + (HIGH - LOW) * (1 - Math.cos(Math.PI * clamp(f, 0, 1))) / 2;

function genNight(J) {
  const rnd = mulberry32((J.seed * 31 + J.night * 977) | 0);
  const P = { s1: J.seed % 9973, s2: (J.seed >> 3) % 7919, night: J.night,
    vx: 60 + (rnd() - 0.5) * 7, vy: 62 + (rnd() - 0.5) * 7, islets: [] };
  const W = { P, night: J.night, H: new Float32Array(HN * HN), stone: new Uint8Array(HN * HN), ruins: [], walls: [], pools: [], bells: [],
    boulders: [], islets: [], phantom: null, creatures: [] };
  const base = (x, y) => {
    let g = 0.80 - 0.0080 * (0.55 * y + 0.45 * x);
    g += 0.26 * Math.exp(-((x - TOWER.x) ** 2 + (y - TOWER.y) ** 2) / (2 * 8.5 * 8.5));
    g -= 0.11 * Math.exp(-((x - P.vx) ** 2 + (y - P.vy) ** 2) / (2 * 15 * 15));
    g += 0.14 * (fbm(x * 0.05, y * 0.05, P.s1) - 0.5);
    g += 0.05 * (fbm(x * 0.17, y * 0.17, P.s2 + J.night * 13) - 0.5);
    return g;
  };
  // islets: what the chart remembers stays where it was, except one that is simply not there tonight
  const charted = J.chart.filter((c) => c.kind === 'islet');
  if (J.night >= 2 && charted.length) {
    const ph = charted[Math.floor(rnd() * charted.length)];
    W.phantom = { x: ph.x, y: ph.y, found: false };
  }
  for (const c of charted) if (!W.phantom || c.x !== W.phantom.x || c.y !== W.phantom.y) W.islets.push({ x: c.x, y: c.y, charted: true });
  for (let tries = 0; W.islets.length < 3 && tries < 400; tries++) {
    const x = 60 + rnd() * 38, y = 70 + rnd() * 30, h = base(x, y);
    if (h < 0.0 || h > 0.08) continue;
    if (W.islets.some((o) => dist(o.x, o.y, x, y) < 16)) continue;
    if (W.phantom && dist(W.phantom.x, W.phantom.y, x, y) < 12) continue;
    W.islets.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, charted: false });
  }
  const height = (x, y) => {
    let g = base(x, y);
    for (const o of W.islets) { const d2 = (x - o.x) ** 2 + (y - o.y) ** 2; if (d2 < 100) g += 0.17 * Math.exp(-d2 / (2 * 2.8 * 2.8)); }
    return g;
  };
  for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) W.H[j * HN + i] = height(WX0 + (i + 0.5) / HRES, WX0 + (j + 0.5) / HRES);
  W.height = height;
  const hAt = (x, y) => sampleH(W, x, y);
  // ruins: the drowned village, shifted a little each night
  const nR = 7 + Math.floor(rnd() * 3);
  for (let tries = 0; W.ruins.length < nR && tries < 300; tries++) {
    const a = rnd() * Math.PI * 2, r = 4 + rnd() * 15;
    const x = P.vx + Math.cos(a) * r, y = P.vy + Math.sin(a) * r * 0.8;
    const w = 5 + rnd() * 4, hh = 4 + rnd() * 3, rot = (rnd() - 0.5) * 0.5;
    if (W.ruins.some((o) => dist(o.x, o.y, x, y) < 8)) continue;
    W.ruins.push({ x, y, w, h: hh, rot });
  }
  for (const r of W.ruins) {
    const c = Math.cos(r.rot), s = Math.sin(r.rot);
    const pt = (u, v) => ({ x: r.x + u * c - v * s, y: r.y + u * s + v * c });
    const corners = [pt(-r.w / 2, -r.h / 2), pt(r.w / 2, -r.h / 2), pt(r.w / 2, r.h / 2), pt(-r.w / 2, r.h / 2)];
    for (let k = 0; k < 4; k++) {
      const A = corners[k], B = corners[(k + 1) % 4];
      // broken walls: each side keeps one or two runs
      const cut1 = rnd() * 0.5, cut2 = cut1 + 0.15 + rnd() * 0.3;
      const runs = rnd() < 0.5 ? [[0, cut1], [cut2, 1]] : [[0, 0.3 + rnd() * 0.6]];
      for (const [t0, t1] of runs) if (t1 - t0 > 0.08) W.walls.push({ x0: lerp(A.x, B.x, t0), y0: lerp(A.y, B.y, t0), x1: lerp(A.x, B.x, t1), y1: lerp(A.y, B.y, t1) });
    }
  }
  for (const w of W.walls) {
    const n = Math.ceil(dist(w.x0, w.y0, w.x1, w.y1) * HRES * 2);
    for (let k = 0; k <= n; k++) { const x = lerp(w.x0, w.x1, k / n), y = lerp(w.y0, w.y1, k / n); markStone(W, x, y, 0.7); }
  }
  // drowned bells: low in the village, only above water near low tide
  const want = [0.15, 0.21];
  for (let tries = 0; W.bells.length < 3 && tries < 3000; tries++) {
    const relax = tries > 2000 ? 0.03 : 0;
    const a = rnd() * Math.PI * 2, r = 3 + rnd() * 18;
    const x = P.vx + Math.cos(a) * r, y = P.vy + Math.sin(a) * r;
    const h = hAt(x, y);
    if (h < want[0] - relax || h > want[1] + relax) continue;
    if (W.bells.some((o) => dist(o.x, o.y, x, y) < 11)) continue;
    W.bells.push({ x, y, h, n: 0, rung: false, inside: false, toll: 8 + rnd() * 10, glow: 0 });
  }
  const order = [1, 2, 3].sort(() => rnd() - 0.5);
  W.bells.forEach((b, i) => { b.n = order[i]; });
  // rock pools on the middle shore, each holding one, two or three fish
  const counts = [1, 2, 3].sort(() => rnd() - 0.5);
  for (let tries = 0; W.pools.length < 3 && tries < 3000; tries++) {
    const x = 5 + rnd() * 80, y = 15 + rnd() * 70, h = hAt(x, y);
    if (h < 0.27 || h > 0.45) continue;
    if (dist(x, y, P.vx, P.vy) < 15 || dist(x, y, START.x, START.y) < 10) continue;
    if (W.pools.some((o) => dist(o.x, o.y, x, y) < 16)) continue;
    const r = 2.2 + rnd() * 0.9;
    W.pools.push({ x, y, h, r, fish: counts[W.pools.length], seed: rnd() * 100 });
    for (let a = 0; a < 6.28; a += 0.2) markStone(W, x + Math.cos(a) * (r + 0.6), y + Math.sin(a) * (r + 0.6), 0.6);
  }
  // boulders where crabs sleep
  for (let tries = 0; W.boulders.length < 14 && tries < 2000; tries++) {
    const x = -10 + rnd() * 120, y = -10 + rnd() * 110, h = hAt(x, y);
    if (h < 0.2 || h > 0.7) continue;
    if (W.boulders.some((o) => dist(o.x, o.y, x, y) < 7) || W.pools.some((o) => dist(o.x, o.y, x, y) < 6) || dist(x, y, TOWER.x, TOWER.y) < 9) continue;
    W.boulders.push({ x, y, r: 0.9 + rnd() * 0.9, rot: rnd() * 6 });
    markStone(W, x, y, 1.5);
  }
  // headland rock and scattered stony ground
  for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
    const x = WX0 + (i + 0.5) / HRES, y = WX0 + (j + 0.5) / HRES, h = W.H[j * HN + i];
    if ((h > 0.66 && fbm(x * 0.12, y * 0.12, 91) > 0.45) || (h > 0.2 && fbm(x * 0.09, y * 0.09, P.s1 + 5) > 0.7)) W.stone[j * HN + i] = 1;
  }
  return W;
}
function markStone(W, x, y, r) {
  const i0 = Math.floor((x - r - WX0) * HRES), i1 = Math.ceil((x + r - WX0) * HRES), j0 = Math.floor((y - r - WX0) * HRES), j1 = Math.ceil((y + r - WX0) * HRES);
  for (let j = Math.max(0, j0); j <= Math.min(HN - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(HN - 1, i1); i++) {
    const cx = WX0 + (i + 0.5) / HRES, cy = WX0 + (j + 0.5) / HRES;
    if ((cx - x) ** 2 + (cy - y) ** 2 <= r * r) W.stone[j * HN + i] = 1;
  }
}
function sampleH(W, x, y) {
  const fx = (x - WX0) * HRES - 0.5, fy = (y - WX0) * HRES - 0.5;
  if (fx < 0 || fy < 0 || fx >= HN - 1 || fy >= HN - 1) return -0.5;
  const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, H = W.H, k = j * HN + i;
  return lerp(lerp(H[k], H[k + 1], u), lerp(H[k + HN], H[k + HN + 1], u), v);
}
function stoneAt(W, x, y) {
  const i = Math.floor((x - WX0) * HRES), j = Math.floor((y - WX0) * HRES);
  return i >= 0 && j >= 0 && i < HN && j < HN && W.stone[j * HN + i] === 1;
}

// ---------------------------------------------------------------- the garden (moss grid, kept across tides)
function mossIdx(x, y) {
  const i = Math.floor(x - MOSS_X0), j = Math.floor(y - MOSS_Y0);
  return i >= 0 && j >= 0 && i < MOSS_N && j < MOSS_N ? j * MOSS_N + i : -1;
}
function growMoss(moss, trail) {
  // walked cells thicken, the most-walked most of all; unwalked moss thins slowly.
  // A cell next to two strong neighbours along a line gains a little, so trails knit into routes.
  const out = new Float32Array(moss.length), N = MOSS_N;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, m = moss[k], t = Math.min(trail[k], 2);
    let v = m * (t > 0 ? 0.97 : 0.9) + t * 0.5 * (1 - m * 0.45);
    if (i > 0 && j > 0 && i < N - 1 && j < N - 1) {
      const a = Math.min(moss[k - 1], moss[k + 1]), b = Math.min(moss[k - N], moss[k + N]);
      v += 0.08 * Math.max(a, b);
    }
    out[k] = clamp(v < 0.03 ? 0 : v, 0, 1);
  }
  return out;
}
