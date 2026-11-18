// ---------------------------------------------------------------- drawing
// Style rules: top-down night shore; value carries the form (hillshade, contours, shadows); dark overlay with
// light cut out of it; emitters (lantern, foxfire, creatures, lamp) added on top; text always on its own dark backing.
const COL = {
  sea: [6, 14, 28], sand: [156, 140, 108], heath: [74, 92, 66], stone: [120, 124, 132], wetSand: [108, 98, 80],
  shallow: [38, 96, 112], deep: [8, 24, 44], foam: [205, 232, 236], lantern: '#ffc46b', moss: '#7ff0c4', crab: '#78e0f0',
  moth: '#efe4c8', fish: '#f3dc8a', spirit: '#a9f5d4', bell: '#8f9a74', glyph: '#f1ebdc',
};
const Render = {
  cv: null, c: null, dpr: 1, cssW: 0, cssH: 0, s: 4, ox: 0, oy: 0, terrain: null, water: null, wImg: null, mossCv: null, mossDirty: true,
  dark: null, dc: null, explored: null, ec: null, waterT: 0, frame: 0, mossLightCv: null,
  init() {
    this.cv = $('view'); this.c = this.cv.getContext('2d');
    this.water = document.createElement('canvas'); this.water.width = HN; this.water.height = HN;
    this.wc = this.water.getContext('2d'); this.wImg = this.wc.createImageData(HN, HN);
    this.dark = document.createElement('canvas'); this.dc = this.dark.getContext('2d');
    this.mossCv = document.createElement('canvas'); this.mossCv.width = MOSS_N * 4; this.mossCv.height = MOSS_N * 4;
    this.mossLightCv = document.createElement('canvas'); this.mossLightCv.width = MOSS_N; this.mossLightCv.height = MOSS_N;
  },
  stale() {
    const st = $('stage').getBoundingClientRect();
    return (window.devicePixelRatio || 1) !== this.dpr || Math.round(st.width) !== this.cssW || Math.round(st.height) !== this.cssH;
  },
  fit() {
    const st = $('stage').getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1; this.cssW = Math.round(st.width); this.cssH = Math.round(st.height);
    this.cv.width = Math.max(1, Math.round(this.cssW * this.dpr)); this.cv.height = Math.max(1, Math.round(this.cssH * this.dpr));
    // fit the whole shore to the shorter side; scenery carries on past the edges
    this.s = Math.max(1, Math.min(this.cssW, this.cssH) / 104);
    this.ox = this.cssW / 2 - 50 * this.s; this.oy = this.cssH / 2 - 50 * this.s;
    this.dark.width = Math.max(1, Math.ceil(this.cssW / 2)); this.dark.height = Math.max(1, Math.ceil(this.cssH / 2));
  },
  viewRect() { return { x0: -this.ox / this.s, y0: -this.oy / this.s, x1: (this.cssW - this.ox) / this.s, y1: (this.cssH - this.oy) / this.s }; },
  toWorld(px, py) { return { x: (px - this.ox) / this.s, y: (py - this.oy) / this.s }; },
  toScreen(x, y) { return { x: this.ox + x * this.s, y: this.oy + y * this.s }; },
  bakeTerrain() {
    const W = G.W;
    if (!this.terrain) { this.terrain = document.createElement('canvas'); this.terrain.width = TN; this.terrain.height = TN; }
    const tc = this.terrain.getContext('2d'), img = tc.createImageData(TN, TN), d = img.data;
    for (let py = 0; py < TN; py++) for (let px = 0; px < TN; px++) {
      const x = WX0 + (px + 0.5) / TRES, y = WX0 + (py + 0.5) / TRES;
      const h = sampleH(W, x, y);
      const hx = sampleH(W, x + 0.6, y) - sampleH(W, x - 0.6, y), hy = sampleH(W, x, y + 0.6) - sampleH(W, x, y - 0.6);
      let shade = clamp(0.78 - (hx + hy) * 26, 0.35, 1.25);
      const n = hash2(px, py, 7) * 0.06 - 0.03, n2 = vnoise(x * 0.7, y * 0.7, 3) * 0.12 - 0.06 + (vnoise(x * 0.15, y * 0.15, 9) - 0.5) * 0.12;
      let col = h > 0.5 ? mix3(COL.sand, COL.heath, clamp((h - 0.5) / 0.12, 0, 1)) : h < 0.3 ? mix3(COL.wetSand, COL.sand, clamp((h - 0.05) / 0.25, 0, 1)) : COL.sand;
      // stone blends in through a soft, ragged edge instead of the grid's blocks
      const sf = stoneSoft(W, x + (n2 * 6), y - (n2 * 6));
      if (sf > 0) col = mix3(col, COL.stone, smooth(clamp(sf * 1.6 - 0.3, 0, 1)));
      // faint contour lines every tide step: the shape of the ground reads as heights
      const cl = Math.abs(((h * 25) % 1 + 1) % 1 - 0.5);
      if (cl > 0.485 && h > 0) shade *= 0.9;
      const k = (py * TN + px) * 4, f = shade * (1 + n + n2);
      d[k] = clamp(col[0] * f, 0, 255); d[k + 1] = clamp(col[1] * f, 0, 255); d[k + 2] = clamp(col[2] * f, 0, 255); d[k + 3] = 255;
    }
    tc.putImageData(img, 0, 0);
    tc.save(); tc.scale(TRES, TRES); tc.translate(-WX0, -WX0);
    // ruined walls with their shadows
    tc.lineCap = 'round';
    for (const w of W.walls) { tc.strokeStyle = 'rgba(10,12,18,0.55)'; tc.lineWidth = 1.1; tc.beginPath(); tc.moveTo(w.x0 + 0.35, w.y0 + 0.45); tc.lineTo(w.x1 + 0.35, w.y1 + 0.45); tc.stroke(); }
    for (const w of W.walls) { tc.strokeStyle = '#9a9c9c'; tc.lineWidth = 0.75; tc.beginPath(); tc.moveTo(w.x0, w.y0); tc.lineTo(w.x1, w.y1); tc.stroke();
      tc.strokeStyle = 'rgba(220,220,210,0.35)'; tc.lineWidth = 0.25; tc.beginPath(); tc.moveTo(w.x0 - 0.15, w.y0 - 0.15); tc.lineTo(w.x1 - 0.15, w.y1 - 0.15); tc.stroke(); }
    for (const b of W.boulders) drawRock(tc, b.x, b.y, b.r, b.rot);
    for (const p of W.pools) {
      // a rim of weathered rock around each pool, lit from the north-west
      tc.fillStyle = 'rgba(8,10,16,0.45)'; tc.beginPath(); tc.arc(p.x + 0.4, p.y + 0.5, p.r + 1.1, 0, 7); tc.fill();
      tc.fillStyle = '#7d8189'; tc.beginPath();
      for (let i = 0; i <= 24; i++) { const a = i / 24 * 6.283, rr = p.r + 0.7 + 0.35 * Math.sin(a * 3 + p.seed) + 0.2 * Math.sin(a * 7); i ? tc.lineTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr) : tc.moveTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr); }
      tc.fill();
      tc.strokeStyle = 'rgba(225,225,215,0.35)'; tc.lineWidth = 0.3; tc.beginPath(); tc.arc(p.x, p.y, p.r + 0.5, 3.6, 5.6); tc.stroke();
      drawRock(tc, p.x + p.r + 0.9, p.y - 0.6, 0.6, 1); drawRock(tc, p.x - p.r - 0.6, p.y + 1, 0.5, 2);
    }
    for (const o of W.islets) { drawRock(tc, o.x, o.y, 1.2, 1); drawRock(tc, o.x - 0.2, o.y - 0.7, 0.8, 2); drawRock(tc, o.x - 0.3, o.y - 1.25, 0.5, 3); }
    tc.restore();
  },
  buildWater(time) {
    const W = G.W, d = this.wImg.data, L = G.L, H = W.H, rm = reducedMotion();
    for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
      const k = j * HN + i, h = H[k], dep = L - h, o = k * 4;
      if (dep > -0.006) {
        if (dep <= 0.004) {
          // foam where the water meets the ground, breathing with the swell
          const w = rm ? 0.5 : 0.5 + 0.5 * Math.sin(time * 1.3 + i * 0.21 + j * 0.17);
          const a = (1 - Math.abs(dep - (-0.001)) / 0.006) * (0.35 + 0.35 * w);
          d[o] = COL.foam[0]; d[o + 1] = COL.foam[1]; d[o + 2] = COL.foam[2]; d[o + 3] = clamp(a, 0, 1) * 255;
        } else {
          const t = 1 - Math.exp(-dep * 9);
          d[o] = lerp(COL.shallow[0], COL.deep[0], t); d[o + 1] = lerp(COL.shallow[1], COL.deep[1], t); d[o + 2] = lerp(COL.shallow[2], COL.deep[2], t);
          d[o + 3] = (0.5 + 0.48 * Math.min(1, dep * 14)) * 255;
        }
      } else d[o + 3] = 0;
    }
    this.wc.putImageData(this.wImg, 0, 0);
  },
  buildMoss() {
    const mc = this.mossCv.getContext('2d');
    mc.clearRect(0, 0, this.mossCv.width, this.mossCv.height);
    for (let j = 0; j < MOSS_N; j++) for (let i = 0; i < MOSS_N; i++) {
      const k = j * MOSS_N + i, m = clamp(G.moss[k] + G.trail[k] * 0.4, 0, 1);
      if (m < 0.06) continue;
      const n = 1 + Math.floor(m * 5);
      for (let q = 0; q < n; q++) {
        const rx = hash2(i * 7 + q, j, 11), ry = hash2(i, j * 7 + q, 13), rr = hash2(i + q, j + q, 17);
        mc.fillStyle = `rgba(127,240,196,${(0.25 + 0.6 * m * rr).toFixed(3)})`;
        mc.beginPath(); mc.arc((i + rx) * 4, (j + ry) * 4, 0.6 + rr * 1.3 * (0.5 + m), 0, 7); mc.fill();
      }
    }
    const lc = this.mossLightCv.getContext('2d'), img = lc.createImageData(MOSS_N, MOSS_N);
    for (let k = 0; k < G.mossLight.length; k++) { img.data[k * 4 + 3] = clamp(G.mossLight[k] * 0.85, 0, 1) * 255; }
    lc.putImageData(img, 0, 0);
    this.mossDirty = false;
  },
  stampExplored() {
    if (!this.explored) { this.explored = document.createElement('canvas'); this.explored.width = WSIZE * 2; this.explored.height = WSIZE * 2; this.ec = this.explored.getContext('2d'); }
    if (G.explored !== this.explored) { this.ec.clearRect(0, 0, this.explored.width, this.explored.height); G.explored = this.explored; }
    const k = G.keeper, x = (k.x - WX0) * 2, y = (k.y - WX0) * 2, r = LANTERN_R * 2 * 0.95;
    const g = this.ec.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(0.7, 'rgba(255,255,255,0.1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    this.ec.fillStyle = g; this.ec.beginPath(); this.ec.arc(x, y, r, 0, 7); this.ec.fill();
  },
  draw(now) {
    const c = this.c, s = this.s, W = G.W, time = now / 1000, rm = reducedMotion();
    if (!W) return;
    this.frame++;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = 'rgb(6,14,28)'; c.fillRect(0, 0, this.cssW, this.cssH);
    if (this.mossDirty) this.buildMoss();
    if (this.frame % 3 === 0 || !this.waterBuilt) { this.buildWater(time); this.waterBuilt = true; }
    if (G.mode === 'play' && (this.frame % 6 === 0 || !G.explored)) this.stampExplored();
    // world space
    c.save(); c.translate(this.ox, this.oy); c.scale(s, s);
    c.imageSmoothingEnabled = true;
    c.drawImage(this.terrain, WX0, WX0, WSIZE, WSIZE);
    // pools hold their own water; fish circle inside
    for (const p of W.pools) {
      const pg = c.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.3, 0, p.x, p.y, p.r);
      pg.addColorStop(0, 'rgb(44,104,118)'); pg.addColorStop(1, 'rgb(14,40,58)');
      c.fillStyle = pg; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill();
      c.strokeStyle = 'rgba(205,232,236,0.35)'; c.lineWidth = Math.max(0.15, 1 / s); c.beginPath(); c.arc(p.x, p.y, p.r - 0.15, 0, 7); c.stroke();
      for (let f = 0; f < p.fish; f++) {
        const a = (rm ? 0 : time * 0.6) + f * 2.1 + p.seed, rr = p.r * (0.35 + 0.18 * f);
        const fx = p.x + Math.cos(a) * rr, fy = p.y + Math.sin(a) * rr;
        c.save(); c.translate(fx, fy); c.rotate(a + Math.PI / 2); drawFish(c, Math.max(0.55, 3 / s));
        c.restore();
      }
    }
    // drowned bells sit under the water layer, so the tide covers them
    for (const b of W.bells) drawBell(c, b, s, time, rm);
    c.drawImage(this.water, WX0, WX0, WSIZE, WSIZE);
    // phantom: where the chart says an island was, only a ring of memory
    if (W.phantom && W.phantom.found) { c.setLineDash([0.8, 0.8]); c.strokeStyle = 'rgba(241,235,220,0.5)'; c.lineWidth = Math.max(0.2, 1 / s); c.beginPath(); c.arc(W.phantom.x, W.phantom.y, 2.6, 0, 7); c.stroke(); c.setLineDash([]); }
    drawTower(c, s, G.towerLit, G.towerT, time, rm);
    // the drawn path, lifted ahead of the finger
    const k = G.keeper;
    if (G.path.length && G.mode === 'play') {
      c.strokeStyle = 'rgba(255,196,107,0.75)'; c.lineWidth = Math.max(0.3, 2.2 / s); c.setLineDash([1.1, 0.9]); c.lineCap = 'round';
      c.beginPath(); c.moveTo(k.x, k.y); for (const p of G.path) c.lineTo(p.x, p.y); c.stroke(); c.setLineDash([]);
      const e = G.path[G.path.length - 1];
      c.strokeStyle = 'rgba(255,196,107,0.9)'; c.lineWidth = Math.max(0.25, 1.6 / s); c.beginPath(); c.arc(e.x, e.y, Math.max(1, 6 / s), 0, 7); c.stroke();
    }
    for (const r of G.ripples) {
      const a = 1 - r.t / 2.2;
      c.strokeStyle = r.sing ? `rgba(255,196,107,${a * 0.6})` : r.note ? `rgba(241,235,220,${a * 0.7})` : `rgba(205,232,236,${a * 0.6})`;
      c.lineWidth = Math.max(0.2, 1.5 / s); c.beginPath(); c.arc(r.x, r.y, 1 + r.t * (r.sing ? 9 : 3), 0, 7); c.stroke();
    }
    // creatures
    for (const cr of W.creatures) drawCreature(c, cr, s, time, rm);
    if (G.mode === 'play' || G.mode === 'dawn') drawKeeper(c, k, s, time, rm);
    c.restore();
    // darkness with the light cut out of it
    this.drawDark(time, rm);
    // emitters on top of the dark: foxfire, creature glows, the lantern
    c.save(); c.translate(this.ox, this.oy); c.scale(s, s);
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.55 + (rm ? 0 : 0.1 * Math.sin(time * 0.8));
    c.drawImage(this.mossCv, MOSS_X0, MOSS_Y0, MOSS_N, MOSS_N);
    c.globalAlpha = 1;
    for (const cr of W.creatures) glowCreature(c, cr, s, time);
    for (const b of W.bells) if (b.glow > 0 || b.rung) radial(c, b.x, b.y, 5, `rgba(200,220,170,${0.25 * Math.max(b.glow, b.rung ? 0.6 : 0)})`);
    if (G.mode === 'play' || G.mode === 'dawn') {
      const fl = rm ? 1 : 0.93 + 0.07 * Math.sin(time * 7.3) * Math.sin(time * 3.1);
      radial(c, k.x, k.y, 4.5 * fl, 'rgba(255,190,100,0.38)');
    }
    if (G.towerLit) drawBeam(c, G.towerT, time, rm);
    c.globalCompositeOperation = 'source-over';
    c.restore();
    // screen space: song bubbles and the note target
    for (const cr of W.creatures) if (cr.singing) drawBubble(c, cr, this);
    if (G.mode === 'play' && G.noteTarget && (Input.device === 'keys' || Input.device === 'pad')) {
      const p = this.toScreen(G.noteTarget.x, G.noteTarget.y);
      c.strokeStyle = 'rgba(241,235,220,0.85)'; c.lineWidth = 1.5; c.setLineDash([4, 4]); c.beginPath(); c.arc(p.x, p.y, 16, 0, 7); c.stroke(); c.setLineDash([]);
      label(c, Input.hint('note') + ' note', p.x, p.y - 28);
    }
    if (Input.drawing && Input.drawFinger && Input.drawTip) {
      c.strokeStyle = 'rgba(255,196,107,0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(Input.drawFinger.x, Input.drawFinger.y); c.lineTo(Input.drawTip.x, Input.drawTip.y); c.stroke();
    }
  },
  drawDark(time, rm) {
    const dc = this.dc, dw = this.dark.width, dh = this.dark.height, s = this.s / 2, k = G.keeper;
    dc.setTransform(1, 0, 0, 1, 0, 0);
    dc.globalCompositeOperation = 'source-over';
    dc.clearRect(0, 0, dw, dh);
    const base = G.mode === 'title' ? 0.6 : G.towerLit ? 0.55 : 0.8;
    dc.fillStyle = `rgba(4,8,24,${base})`; dc.fillRect(0, 0, dw, dh);
    dc.globalCompositeOperation = 'destination-out';
    dc.setTransform(s, 0, 0, s, this.ox / 2, this.oy / 2);
    if (G.explored) { dc.globalAlpha = 0.5; dc.drawImage(this.explored, WX0, WX0, WSIZE, WSIZE); dc.globalAlpha = 1; }
    dc.globalAlpha = 0.95; dc.drawImage(this.mossLightCv, MOSS_X0, MOSS_Y0, MOSS_N, MOSS_N); dc.globalAlpha = 1;
    if (G.mode === 'play' || G.mode === 'dawn') {
      const fl = rm ? 1 : 0.97 + 0.03 * Math.sin(time * 6.1);
      const g = dc.createRadialGradient(k.x, k.y, 0, k.x, k.y, LANTERN_R * fl);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,0.92)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      dc.fillStyle = g; dc.beginPath(); dc.arc(k.x, k.y, LANTERN_R, 0, 7); dc.fill();
    }
    for (const cr of G.W.creatures) if (cr.kind !== 'fish' && cr.kind !== 'bell') { dc.globalAlpha = 0.5; radial(dc, cr.x, cr.y, 2.4, '#000'); dc.globalAlpha = 1; }
    if (G.towerLit) { radial(dc, TOWER.x, TOWER.y, 22, 'rgba(0,0,0,0.9)'); }
    dc.globalCompositeOperation = 'source-over';
    this.c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.c.imageSmoothingEnabled = true;
    this.c.drawImage(this.dark, 0, 0, dw * 2, dh * 2);
  },
};
function stoneSoft(W, x, y) {
  const fx = (x - WX0) * HRES - 0.5, fy = (y - WX0) * HRES - 0.5;
  if (fx < 0 || fy < 0 || fx >= HN - 1 || fy >= HN - 1) return 0;
  const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, S = W.stone, k = j * HN + i;
  return lerp(lerp(S[k], S[k + 1], u), lerp(S[k + HN], S[k + HN + 1], u), v);
}
function mix3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function radial(c, x, y, r, col) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
}
function drawRock(c, x, y, r, rot) {
  c.fillStyle = 'rgba(8,10,16,0.5)'; c.beginPath(); c.ellipse(x + r * 0.35, y + r * 0.4, r, r * 0.8, rot, 0, 7); c.fill();
  c.fillStyle = '#6d7178'; c.beginPath();
  for (let i = 0; i < 7; i++) { const a = rot + i * 0.9, rr = r * (0.8 + 0.2 * Math.sin(i * 2.3 + rot)); i ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.85) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.85); }
  c.closePath(); c.fill();
  c.fillStyle = 'rgba(220,222,215,0.28)'; c.beginPath(); c.ellipse(x - r * 0.25, y - r * 0.3, r * 0.45, r * 0.3, rot, 0, 7); c.fill();
}
function drawFish(c, sz) {
  c.fillStyle = COL.fish; c.beginPath(); c.ellipse(0, 0, sz * 0.38, sz, 0, 0, 7); c.fill();
  c.beginPath(); c.moveTo(0, sz * 0.8); c.lineTo(-sz * 0.4, sz * 1.5); c.lineTo(sz * 0.4, sz * 1.5); c.closePath(); c.fill();
}
function drawBell(c, b, s, time, rm) {
  const r = Math.max(1.5, 7 / s);
  c.fillStyle = 'rgba(5,8,12,0.5)'; c.beginPath(); c.ellipse(b.x + r * 0.3, b.y + r * 0.35, r * 1.05, r * 0.95, 0, 0, 7); c.fill();
  c.fillStyle = b.rung ? '#b9c48f' : COL.bell; c.beginPath(); c.arc(b.x, b.y, r, 0, 7); c.fill();
  c.strokeStyle = '#2b3022'; c.lineWidth = r * 0.12; c.beginPath(); c.arc(b.x, b.y, r, 0, 7); c.stroke();
  // bands: one, two or three rings round the crown
  for (let i = 0; i < b.n; i++) { c.beginPath(); c.arc(b.x, b.y, r * (0.78 - i * 0.2), 0, 7); c.stroke(); }
  c.fillStyle = '#2b3022'; c.beginPath(); c.arc(b.x, b.y, r * 0.16, 0, 7); c.fill();
  if (b.rung) { c.strokeStyle = 'rgba(241,235,220,0.8)'; c.lineWidth = Math.max(0.2, 1.4 / s); c.beginPath(); c.arc(b.x, b.y, r * 1.45 + (rm ? 0 : Math.sin(time * 2) * 0.2), 0, 7); c.stroke(); }
}
function drawTower(c, s, lit, lt, time, rm) {
  // a standing tower: shadow on the ground, banded body rising toward the top of the screen, lamp room and cap
  const x = TOWER.x, y = TOWER.y + 2, top = y - 7.5;
  c.fillStyle = 'rgba(4,6,10,0.5)'; c.beginPath(); c.moveTo(x - 2.4, y); c.lineTo(x + 6.5, y + 5.5); c.lineTo(x + 8.2, y + 3.6); c.lineTo(x + 2.4, y - 0.6); c.closePath(); c.fill();
  c.fillStyle = '#5e5a52'; c.beginPath(); c.ellipse(x, y, 3.3, 1.5, 0, 0, 7); c.fill();
  const body = new Path2D(); body.moveTo(x - 2.6, y); body.lineTo(x - 1.7, top); body.lineTo(x + 1.7, top); body.lineTo(x + 2.6, y); body.closePath();
  c.fillStyle = '#d8d2c2'; c.fill(body);
  c.save(); c.clip(body);
  c.fillStyle = '#8e3b34'; for (let b = 0; b < 3; b++) c.fillRect(x - 3, y - 1.6 - b * 2.2, 6, 1.05);
  const sh = c.createLinearGradient(x - 2.6, 0, x + 2.6, 0); sh.addColorStop(0, 'rgba(255,255,255,0.18)'); sh.addColorStop(0.45, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.45)');
  c.fillStyle = sh; c.fillRect(x - 3, top, 6, y - top);
  c.restore();
  c.fillStyle = '#3a3428'; c.fillRect(x - 0.45, y - 1.3, 0.9, 1.3);
  c.fillStyle = '#2a2c30'; c.fillRect(x - 2.2, top - 0.3, 4.4, 0.5);
  c.fillStyle = lit ? '#ffe2a0' : '#26304a'; c.fillRect(x - 1.25, top - 2.1, 2.5, 1.8);
  c.strokeStyle = '#1b1d24'; c.lineWidth = 0.22; c.strokeRect(x - 1.25, top - 2.1, 2.5, 1.8); c.beginPath(); c.moveTo(x, top - 2.1); c.lineTo(x, top - 0.3); c.stroke();
  c.fillStyle = '#2a2c30'; c.beginPath(); c.moveTo(x - 1.6, top - 2.1); c.lineTo(x, top - 3.4); c.lineTo(x + 1.6, top - 2.1); c.closePath(); c.fill();
}
function drawBeam(c, lt, time, rm) {
  const a = rm ? 0.8 : lt * 0.5, x = TOWER.x, y = TOWER.y + 2 - 8.7, grow = Math.min(1, lt / 3);
  radial(c, x, y, 9 * grow + 1, 'rgba(255,220,150,0.5)');
  for (const off of [0, Math.PI]) {
    c.save(); c.translate(x, y); c.rotate(a + off);
    const g = c.createLinearGradient(0, 0, 120, 0); g.addColorStop(0, `rgba(255,226,160,${0.28 * grow})`); g.addColorStop(1, 'rgba(255,226,160,0)');
    c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.lineTo(120, -14); c.lineTo(120, 14); c.closePath(); c.fill();
    c.restore();
  }
}
function drawCreature(c, cr, s, time, rm) {
  const bob = rm ? 0 : Math.sin(cr.ph * 3) * 0.15;
  if (cr.kind === 'crab') {
    const r = Math.max(0.9, 4.5 / s);
    c.save(); c.translate(cr.x, cr.y + bob * 0.3);
    c.fillStyle = 'rgba(5,8,12,0.5)'; c.beginPath(); c.ellipse(r * 0.3, r * 0.4, r * 1.2, r * 0.8, 0, 0, 7); c.fill();
    c.strokeStyle = '#2d4752'; c.lineWidth = r * 0.22;
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(sx * r * 0.6, (i - 1) * r * 0.35); c.lineTo(sx * r * 1.5, (i - 1) * r * 0.5 + r * 0.3); c.stroke(); }
    c.fillStyle = '#28414c'; c.beginPath(); c.ellipse(0, 0, r, r * 0.7, 0, 0, 7); c.fill();
    c.fillStyle = COL.crab; for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * r * 1.1, -r * 0.75, r * 0.32, 0, 7); c.fill(); }
    c.fillStyle = COL.crab; c.beginPath(); c.arc(-r * 0.35, 0, r * 0.18, 0, 7); c.arc(r * 0.35, 0, r * 0.18, 0, 7); c.fill();
    c.restore();
  } else if (cr.kind === 'moth') {
    const r = Math.max(0.8, 4 / s), flap = rm ? 0.8 : 0.35 + 0.65 * Math.abs(Math.sin(cr.ph * 9));
    c.save(); c.translate(cr.x, cr.y);
    c.fillStyle = 'rgba(5,8,12,0.35)'; c.beginPath(); c.ellipse(r * 1.5, r * 2, r * flap, r * 0.5, 0, 0, 7); c.fill();
    c.fillStyle = COL.moth;
    for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(sx * r * 0.8 * flap, -r * 0.1, r * 0.9 * flap, r * 0.6, sx * 0.4, 0, 7); c.fill(); }
    c.fillStyle = '#6b5f4a'; c.beginPath(); c.ellipse(0, 0, r * 0.2, r * 0.7, 0, 0, 7); c.fill();
    c.restore();
  } else if (cr.kind === 'spirit') {
    const r = Math.max(1.2, 6 / s);
    c.save(); c.translate(cr.x, cr.y + bob);
    c.fillStyle = 'rgba(5,8,12,0.35)'; c.beginPath(); c.ellipse(r * 0.4, r * 1.3, r * 0.8, r * 0.35, 0, 0, 7); c.fill();
    const g = c.createLinearGradient(0, -r * 1.5, 0, r); g.addColorStop(0, 'rgba(169,245,212,0.95)'); g.addColorStop(1, 'rgba(60,140,110,0.6)');
    c.fillStyle = g; c.beginPath(); c.moveTo(0, -r * 1.5); c.quadraticCurveTo(r, -r * 0.2, r * 0.55, r); c.quadraticCurveTo(0, r * 0.6, -r * 0.55, r); c.quadraticCurveTo(-r, -r * 0.2, 0, -r * 1.5); c.fill();
    c.fillStyle = '#10221c'; c.beginPath(); c.arc(-r * 0.22, -r * 0.45, r * 0.12, 0, 7); c.arc(r * 0.22, -r * 0.45, r * 0.12, 0, 7); c.fill();
    c.restore();
  }
}
function glowCreature(c, cr, s, time) {
  const a = cr.singing ? 0.5 : 0.22;
  if (cr.kind === 'crab') radial(c, cr.x, cr.y, Math.max(2.2, 10 / s), `rgba(120,224,240,${a})`);
  else if (cr.kind === 'moth') radial(c, cr.x, cr.y, Math.max(1.8, 8 / s), `rgba(239,228,200,${a * 0.8})`);
  else if (cr.kind === 'spirit') radial(c, cr.x, cr.y, Math.max(3, 14 / s), `rgba(127,240,196,${a + 0.1})`);
  else if (cr.kind === 'fish' && G.L <= cr.pool.h) radial(c, cr.x, cr.y, cr.pool.r * 1.3, `rgba(243,220,138,${a * 0.6})`);
}
function label(c, text, x, y) {
  c.font = '600 13px system-ui, sans-serif'; const w = c.measureText(text).width + 12;
  c.fillStyle = 'rgba(5,7,14,0.88)'; roundRect(c, x - w / 2, y - 10, w, 20, 6); c.fill();
  c.fillStyle = '#ece6d6'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, x, y); c.textAlign = 'left';
}
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function drawBubble(c, cr, R) {
  const s = cr.singing, P = PHRASES[s.p], J = G.J;
  const gs = 24, pad = 8, n = P.w.length;
  const anyTr = P.w.some((w) => { const st = J.words[WI[w]]; return st.confirmed && st.fade < 3; });
  const bw = n * (gs + 8) - 8 + pad * 2, bh = gs + pad * 2 + (anyTr ? 22 : 0);
  const p = R.toScreen(cr.x, cr.y);
  let x = p.x - bw / 2, y = p.y - 22 - bh;
  x = clamp(x, 6, R.cssW - bw - 6); if (y < 6) y = p.y + 22;
  const fade = Math.min(1, s.t * 3) * (s.t > n * 0.55 + 1.3 ? Math.max(0, 1 - (s.t - n * 0.55 - 1.3) * 2) : 1);
  c.save(); c.globalAlpha = fade;
  c.fillStyle = 'rgba(5,7,14,0.9)'; roundRect(c, x, y, bw, bh, 10); c.fill();
  c.strokeStyle = s.hears ? 'rgba(241,235,220,0.35)' : 'rgba(241,235,220,0.15)'; c.lineWidth = 1; c.stroke();
  for (let i = 0; i < n; i++) {
    if (i >= s.played) continue;
    const wi = WI[P.w[i]], st = J.words[wi];
    const gx = x + pad + i * (gs + 8), gy = y + pad;
    const tr = st.confirmed && st.fade < 3;
    const alpha = [1, 0.8, 0.62, 0.45][st.fade];
    c.globalAlpha = fade * (st.heard.length ? alpha : 1);
    drawGlyph(c, wi, gx, gy, gs, tr ? COL.lantern : COL.glyph, 1.25);
    if (tr) drawPic(c, WORDS[wi].pic, gx + 3, gy + gs + 2, 18, COL.lantern);
    c.globalAlpha = fade;
  }
  c.restore();
}
function drawKeeper(c, k, s, time, rm) {
  const r = Math.max(1.3, 7 / s);
  c.save(); c.translate(k.x, k.y);
  c.fillStyle = 'rgba(5,8,12,0.55)'; c.beginPath(); c.ellipse(r * 0.4, r * 0.55, r * 1.05, r * 0.8, 0, 0, 7); c.fill();
  const step = rm ? 0 : Math.sin(k.walk * 1.6) * (k.moving ? 1 : 0);
  c.rotate(k.face + Math.PI / 2);
  // feet
  c.fillStyle = '#1d1b19'; c.beginPath(); c.ellipse(-r * 0.35, -step * r * 0.35, r * 0.22, r * 0.32, 0, 0, 7); c.ellipse(r * 0.35, step * r * 0.35, r * 0.22, r * 0.32, 0, 0, 7); c.fill();
  // coat and hood
  c.fillStyle = '#3c4a63'; c.beginPath(); c.ellipse(0, r * 0.1, r * 0.85, r * 0.65, 0, 0, 7); c.fill();
  c.strokeStyle = '#0d1018'; c.lineWidth = r * 0.12; c.stroke();
  c.fillStyle = '#566482'; c.beginPath(); c.arc(0, -r * 0.05, r * 0.42, 0, 7); c.fill();
  // lantern held out in front
  c.fillStyle = '#ffd38a'; c.beginPath(); c.arc(r * 0.75, -r * 0.55, r * 0.26, 0, 7); c.fill();
  c.strokeStyle = '#3a2a10'; c.lineWidth = r * 0.08; c.stroke();
  c.restore();
}
