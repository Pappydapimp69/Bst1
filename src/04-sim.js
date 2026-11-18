// ---------------------------------------------------------------- game state
const G = {
  mode: 'title', J: null, W: null, t: 0, tideFrac: 0, L: LOW, keeper: { x: START.x, y: START.y, face: 0, walk: 0, moving: false },
  path: [], moss: new Float32Array(MOSS_N * MOSS_N), trail: new Float32Array(MOSS_N * MOSS_N), mossDirty: true, mossLight: new Float32Array(MOSS_N * MOSS_N),
  beatT: 0, movedSinceBeat: 0, stepCount: 0, singQ: [], singRing: 0, singer: null, ringSeq: [], towerLit: false, towerT: 0, heardTonight: new Set(),
  msg: '', msgT: 0, msgPri: 0, waterDist: 20, explored: null, exploreT: 0, phantomLines: 0, overlayOpen: false, endingDue: -1, saveT: 0,
  noteTarget: null, sungAt: -99, ripples: [],
};
function say(text, secs, pri) {
  if (G.msgT > 0 && (pri || 0) < G.msgPri) return;
  G.msg = text; G.msgT = secs || 3.5; G.msgPri = pri || 0;
}
function persist() {
  if (!G.J) return;
  G.J.moss = encodeMoss(G.moss);
  storeSet(store, KEY_SAVE, G.J);
}
function newJournal() { G.J = freshJournal(); G.moss = new Float32Array(MOSS_N * MOSS_N); persist(); }
function startNight() {
  const J = G.J;
  G.moss = J.moss ? decodeMoss(J.moss) : G.moss;
  G.W = genNight(J);
  G.t = 0; G.tideFrac = 0; G.L = LOW; G.path = []; G.singQ = []; G.singer = null; G.ringSeq = []; G.heardTonight = new Set();
  G.towerLit = !!J.lit; G.towerT = J.lit ? 10 : 0; G.endingDue = -1;
  G.keeper = { x: START.x, y: START.y, face: Math.PI * 0.25, walk: 0, moving: false, pushT: 0 };
  G.trail = new Float32Array(MOSS_N * MOSS_N); G.mossDirty = true;
  G.explored = null; G.ripples = [];
  spawnCreatures();
  rebuildMossLight(); Render.mossDirty = true;
  Render.bakeTerrain();
  G.mode = 'play';
  UI.hud(); UI.hints();
  if (J.night > 1) say(`Night ${J.night}. The village has surfaced again, a little changed.`, 5, 1);
  persist();
}
function mossStrength(x, y) { const k = mossIdx(x, y); return k < 0 ? 0 : G.moss[k] + G.trail[k] * 0.4; }
function mossLightAt(x, y) { const k = mossIdx(x, y); return k < 0 ? 0 : G.mossLight[k]; }
function rebuildMossLight() {
  // light from the foxfire: a blurred copy of the moss, so a thick trail lights the ground around it
  const N = MOSS_N, src = new Float32Array(N * N), tmp = new Float32Array(N * N), out = G.mossLight;
  for (let k = 0; k < src.length; k++) src[k] = clamp(G.moss[k] + G.trail[k] * 0.4, 0, 1);
  const R = 3;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { let s = 0; for (let d = -R; d <= R; d++) { const ii = clamp(i + d, 0, N - 1); s += src[j * N + ii]; } tmp[j * N + i] = s / (2 * R + 1); }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { let s = 0; for (let d = -R; d <= R; d++) { const jj = clamp(j + d, 0, N - 1); s += tmp[jj * N + i]; } out[j * N + i] = clamp(s / (2 * R + 1) * 2.4, 0, 1); }
}
function litAt(x, y) {
  const k = G.keeper, d = dist(k.x, k.y, x, y);
  let l = d < LANTERN_R ? 1 - Math.max(0, d - LANTERN_R * 0.6) / (LANTERN_R * 0.4) * 0.5 : 0;
  l = Math.max(l, mossLightAt(x, y));
  if (G.towerLit) l = Math.max(l, 0.7);
  return l;
}
function groundAt(x, y) {
  const h = sampleH(G.W, x, y);
  if (h < G.L) return G.L - h < SHALLOW ? 'water' : 'deep';
  if (mossStrength(x, y) > 0.35) return 'moss';
  if (stoneAt(G.W, x, y)) return 'stone';
  return 'sand';
}
function groundMidi(x, y) {
  const g = groundAt(x, y), h = sampleH(G.W, x, y);
  const gi = g === 'deep' ? 'water' : g;
  const idx = ((Math.floor(h * 32) % 5) + 5) % 5;
  return { g: gi, midi: SCALE[GROUND_START[gi] + idx] };
}

// ---------------------------------------------------------------- creatures
function spawnCreatures() {
  const W = G.W, J = G.J, rnd = mulberry32((J.seed ^ (J.night * 7919)) | 0), C = W.creatures;
  const dry = (x, y) => sampleH(W, x, y) > LOW + 0.05;
  // the brightest moss draws creatures to it
  const mossSpots = [];
  for (let k = 0; k < G.moss.length; k++) if (G.moss[k] > 0.45) mossSpots.push(k);
  const mossPoint = () => { const k = mossSpots[Math.floor(rnd() * mossSpots.length)]; return { x: MOSS_X0 + (k % MOSS_N) + 0.5, y: MOSS_Y0 + Math.floor(k / MOSS_N) + 0.5 }; };
  const randDry = (x0, y0, r) => { for (let i = 0; i < 60; i++) { const x = x0 + (rnd() - 0.5) * 2 * r, y = y0 + (rnd() - 0.5) * 2 * r; if (dry(x, y)) return { x, y }; } return { x: x0, y: y0 }; };
  const sp = mossSpots.length && rnd() < 0.6 ? mossPoint() : { x: TOWER.x + 7, y: TOWER.y + 3 };
  C.push({ kind: 'spirit', x: sp.x, y: sp.y, tx: sp.x, ty: sp.y, cool: 2, wait: 3, ph: rnd() * 6 });
  for (let i = 0; i < 3; i++) {
    const p = i === 0 ? { x: START.x + 8, y: START.y + 6 } : mossSpots.length && rnd() < 0.7 ? mossPoint() : randDry(40, 40, 30);
    C.push({ kind: 'moth', x: p.x, y: p.y, ax: p.x, ay: p.y, ph: rnd() * 6, cool: 1 + i * 3, sp: 0.8 + rnd() * 0.5 });
  }
  const bs = W.boulders.slice().sort(() => rnd() - 0.5);
  for (let i = 0; i < 3; i++) {
    let p;
    if (i === 0) p = randDry(START.x + 14, START.y + 15, 4);
    else if (bs[i]) p = { x: bs[i].x + 1.6, y: bs[i].y + 0.6 };
    else p = randDry(50, 50, 30);
    C.push({ kind: 'crab', x: p.x, y: p.y, tx: p.x, ty: p.y, cool: 2 + i * 2, wait: 2 + rnd() * 4, ph: rnd() * 6 });
  }
  for (const pool of W.pools) C.push({ kind: 'fish', pool, x: pool.x, y: pool.y, cool: 1, ph: rnd() * 6 });
  for (const bell of W.bells) C.push({ kind: 'bell', bell, x: bell.x, y: bell.y, cool: 1, ph: rnd() * 6 });
  for (const c of C) { c.singing = null; c.lit = 0; c.seenGlow = 0; }
}
function phraseOptions(c) {
  const k = G.keeper, W = G.W, opts = [];
  const P = (id) => opts.push(PI_[id]);
  if (c.kind === 'moth') { if (mossStrength(c.x, c.y) > 0.3 || mossLightAt(c.x, c.y) > 0.4) P('p2'); if (dist(c.x, c.y, k.x, k.y) < 10) P('p1'); if (!opts.length) P('p1'); }
  else if (c.kind === 'crab') {
    if (W.boulders.some((b) => dist(b.x, b.y, c.x, c.y) < b.r + 2.5) || stoneAt(W, c.x, c.y)) P('p3');
    if (k.moving || G.t - G.sungAt < 6) P('p4');
    const h = sampleH(W, c.x, c.y);
    if (G.tideFrac < 0.5 && h - G.L < 0.07) P('p17');
    if (!opts.length) P(G.tideFrac < 0.5 ? 'p17' : 'p4');
  } else if (c.kind === 'fish') {
    if (G.L > c.pool.h) return [];
    P(['p10', 'p11', 'p12'][c.pool.fish - 1]);
    P(G.tideFrac < 0.45 ? 'p5' : 'p6');
  } else if (c.kind === 'bell') {
    if (G.L < c.bell.h + SHALLOW) P(['p7', 'p8', 'p9'][c.bell.n - 1]); else P('p16');
  } else if (c.kind === 'spirit') {
    if (dist(c.x, c.y, TOWER.x, TOWER.y) < 16) { P('p14'); P('p15'); }
    if (mossStrength(c.x, c.y) > 0.25 || !opts.length) P('p13');
  }
  return opts;
}
function startSing(c, forced) {
  if (G.singer && G.singer !== c) return false;
  if (c.singing) return false;
  const opts = phraseOptions(c);
  if (!opts.length) return false;
  // prefer what has been heard least, so every situation comes round
  let best = opts[0];
  for (const p of opts) if (G.J.phrases[p] < G.J.phrases[best] || (G.J.phrases[p] === G.J.phrases[best] && Math.random() < 0.5)) best = p;
  const k = G.keeper;
  const near = dist(c.x, c.y, k.x, k.y);
  const hears = near < 34 && (c.lit > 0.3 || c.kind === 'bell' || forced);
  c.singing = { p: best, t: 0, played: 0, hears };
  G.singer = c;
  if (hears) hearPhrase(best, c);
  return true;
}
function hearPhrase(pi, c) {
  const J = G.J, P = PHRASES[pi];
  const first = J.phrases[pi] === 0;
  J.phrases[pi]++;
  G.heardTonight.add(pi);
  for (const w of P.w) {
    const wi = WI[w], st = J.words[wi];
    if (!st.heard.includes(P.id)) st.heard.push(P.id);
    if (st.fade > 0 && st.confirmed) say(`The sign for "${WORDS[wi].name}" comes back to you.`, 3, 1);
    st.fade = 0; st.lastNight = J.night;
  }
  checkConfirm();
  if (first) say(`A new phrase from the ${KIND_NAMES[c.kind]}. It is in the journal.`, 3.5, 1);
  if (J.tut === 1) { J.tut = 2; }
  UI.hud();
}
function checkConfirm() {
  const J = G.J; let any = false;
  J.words.forEach((st, wi) => {
    if (!st.confirmed && st.guess === wi && st.heard.length >= 2) { st.confirmed = true; any = true; }
  });
  if (any) { Sound.chime(true); persist(); }
  return any;
}
function updateCreatures(dt) {
  const W = G.W, k = G.keeper;
  for (const c of W.creatures) {
    c.ph += dt;
    c.lit = litAt(c.x, c.y);
    c.cool -= dt;
    if (c.kind === 'moth') {
      // drawn to light: the keeper's lantern if near, else the brightest moss nearby, else the tower
      const dk = dist(c.x, c.y, k.x, k.y);
      let ax = c.ax, ay = c.ay;
      if (dk < 18 || G.t - G.sungAt < 8) { ax = k.x; ay = k.y; }
      else if (mossLightAt(c.x, c.y) < 0.3) {
        let bx = c.x, by = c.y, bv = mossLightAt(c.x, c.y);
        for (let i = 0; i < 6; i++) { const x = c.x + Math.cos(i + c.ph) * 8, y = c.y + Math.sin(i + c.ph) * 8, v = mossLightAt(x, y); if (v > bv) { bv = v; bx = x; by = y; } }
        c.ax = lerp(c.ax, bx, 0.02); c.ay = lerp(c.ay, by, 0.02); ax = c.ax; ay = c.ay;
      }
      const r = 3 + Math.sin(c.ph * 0.7) * 1.2;
      const tx = ax + Math.cos(c.ph * c.sp * 1.4) * r, ty = ay + Math.sin(c.ph * c.sp * 1.9) * r * 0.7;
      c.x = lerp(c.x, tx, 1 - Math.exp(-dt * 1.4)); c.y = lerp(c.y, ty, 1 - Math.exp(-dt * 1.4));
    } else if (c.kind === 'crab' || c.kind === 'spirit') {
      const d = dist(c.x, c.y, c.tx, c.ty);
      if (d < 0.3) {
        c.wait -= dt;
        if (c.wait <= 0) {
          const rnd = Math.random;
          let tx = c.x, ty = c.y;
          if (c.kind === 'spirit') {
            // the spirit walks between the tower and the brightest moss
            if (dist(c.x, c.y, TOWER.x, TOWER.y) > 14 && rnd() < 0.5) { tx = TOWER.x + 5 + rnd() * 6; ty = TOWER.y + 4 + rnd() * 6; }
            else { for (let i = 0; i < 20; i++) { const x = c.x + (rnd() - 0.5) * 30, y = c.y + (rnd() - 0.5) * 30; if (sampleH(W, x, y) > G.L + 0.04 && (mossStrength(x, y) > 0.3 || i > 14)) { tx = x; ty = y; break; } } }
            c.wait = 6 + rnd() * 8;
          } else {
            for (let i = 0; i < 12; i++) { const x = c.x + (rnd() - 0.5) * 14, y = c.y + (rnd() - 0.5) * 14; if (sampleH(W, x, y) > G.L + 0.01) { tx = x; ty = y; if (mossStrength(x, y) > 0.3 || rnd() < 0.3) break; } }
            c.wait = 3 + rnd() * 6;
          }
          c.tx = tx; c.ty = ty;
        }
      } else if (!c.singing) {
        const sp = (c.kind === 'crab' ? 1.6 : 1.2) * dt;
        c.x += (c.tx - c.x) / d * Math.min(sp, d); c.y += (c.ty - c.y) / d * Math.min(sp, d);
      }
      // the rising tide lifts them uphill too
      if (sampleH(W, c.x, c.y) < G.L) { const gx = sampleH(W, c.x + 0.5, c.y) - sampleH(W, c.x - 0.5, c.y), gy = sampleH(W, c.x, c.y + 0.5) - sampleH(W, c.x, c.y - 0.5), gl = Math.hypot(gx, gy) || 1; c.x += gx / gl * dt * 2; c.y += gy / gl * dt * 2; c.tx = c.x; c.ty = c.y; }
    }
    // singing
    if (c.singing) {
      const s = c.singing, P = PHRASES[s.p];
      s.t += dt;
      while (s.played < P.w.length && s.t >= s.played * 0.55 + 0.15) {
        Sound.glyph(c.kind, WORDS[WI[P.w[s.played]]].midi, c.x, c.y); s.played++;
      }
      if (s.t > P.w.length * 0.55 + 1.8) { c.singing = null; if (G.singer === c) G.singer = null; c.cool = 9 + Math.random() * 6; G.lastSingEnd = G.t; }
    } else if (!G.singer && c.cool <= 0 && G.t - (G.lastSingEnd || -9) > 1.6) {
      const dk = dist(c.x, c.y, k.x, k.y);
      const keen = c.kind === 'bell' ? (G.L < c.bell.h + SHALLOW ? dk < LANTERN_R : dk < 14) : c.lit > 0.35 && dk < 18;
      if (keen && Math.random() < dt * 0.6) startSing(c);
    }
  }
}

// ---------------------------------------------------------------- the keeper
function update(dt) {
  const W = G.W, J = G.J, k = G.keeper;
  G.t += dt;
  G.tideFrac = Math.min(1, G.t / NIGHT_LEN);
  G.L = tideLevel(G.tideFrac);
  if (G.msgT > 0) G.msgT -= dt;
  // movement: a held direction walks directly; otherwise follow the drawn path
  const v = Input.vector();
  let mx = 0, my = 0;
  if (v.x || v.y) { G.path = []; mx = v.x; my = v.y; }
  else if (G.path.length) {
    const p = G.path[0], d = dist(k.x, k.y, p.x, p.y);
    if (d < 0.35) G.path.shift();
    else { mx = (p.x - k.x) / d; my = (p.y - k.y) / d; if (d < 1) { mx *= d; my *= d; } }
  }
  const here = groundAt(k.x, k.y);
  const spd = SPEED * (here === 'water' ? 0.6 : 1);
  k.moving = false;
  if (mx || my) {
    const nx = k.x + mx * spd * dt, ny = k.y + my * spd * dt;
    const view = Render.viewRect();
    const cx = clamp(nx, Math.max(view.x0 + 1.5, WX0 + 2), Math.min(view.x1 - 1.5, WX0 + WSIZE - 2));
    const cy = clamp(ny, Math.max(view.y0 + 1.5, WX0 + 2), Math.min(view.y1 - 1.5, WX0 + WSIZE - 2));
    if (groundAt(cx, cy) === 'deep' && here !== 'deep') {
      G.path = [];
      if (G.msgT <= 0 || G.msg.indexOf('deep') < 0) say('Too deep to wade. The water turns you back.', 2.5);
      G.ripples.push({ x: cx, y: cy, t: 0 });
    } else {
      const d = dist(k.x, k.y, cx, cy);
      if (d > 0.0001) { k.face = Math.atan2(cy - k.y, cx - k.x); k.moving = true; }
      k.x = cx; k.y = cy; k.walk += d; G.movedSinceBeat += d; G.walkedTotal = (G.walkedTotal || 0) + d;
      // walked ground seeds foxfire moss
      G.trailAcc = (G.trailAcc || 0) + d;
      if (G.trailAcc > 0.5) {
        G.trailAcc = 0;
        const c0 = mossIdx(k.x, k.y);
        if (c0 >= 0 && sampleH(W, k.x, k.y) > G.L) {
          G.trail[c0] = Math.min(3, G.trail[c0] + 0.2);
          for (const o of [1, -1, MOSS_N, -MOSS_N]) if (G.trail[c0 + o] !== undefined) G.trail[c0 + o] = Math.min(3, G.trail[c0 + o] + 0.06);
          G.mossDirty = true;
        }
      }
    }
  }
  if (here === 'deep') {
    // the tide rose under the keeper: drift gently uphill
    const gx = sampleH(W, k.x + 0.5, k.y) - sampleH(W, k.x - 0.5, k.y), gy = sampleH(W, k.x, k.y + 0.5) - sampleH(W, k.x, k.y - 0.5), gl = Math.hypot(gx, gy) || 1;
    k.x += gx / gl * dt * 3; k.y += gy / gl * dt * 3; G.path = [];
    if (G.msgT <= 0) say('The tide lifts you gently back to higher ground.', 3);
  }
  // tutorial step 0 passes on a real walk
  if (J.tut === 0 && (G.walkedTotal || 0) > 8) { J.tut = 1; persist(); }
  // beat: every half-beat that the keeper has moved plays the ground's note
  G.beatT += dt;
  while (G.beatT >= BEAT) {
    G.beatT -= BEAT;
    if (G.singQ.length) { const n = G.singQ.shift(); Sound.step(n.g, n.midi, k.x, k.y); G.ripples.push({ x: k.x, y: k.y, t: 0, sing: 1 }); if (!G.singQ.length) singAnswered(); }
    else if (G.movedSinceBeat > 0.4) { const gm = groundMidi(k.x, k.y); Sound.step(gm.g, gm.midi, k.x, k.y); G.stepCount++; G.lastStep = { g: gm.g, t: G.t }; }
    G.movedSinceBeat = 0;
  }
  for (const r of G.ripples) r.t += dt;
  G.ripples = G.ripples.filter((r) => r.t < 2.2);
  updateCreatures(dt);
  updateBells(dt);
  // landmarks the lantern reaches are charted
  for (const o of W.islets) if (!o.charted && dist(o.x, o.y, k.x, k.y) < LANTERN_R - 2) {
    o.charted = true; J.chart.push({ kind: 'islet', x: o.x, y: o.y, night: J.night }); J.seen.islet = (J.seen.islet || 0) + 1;
    say('A little island, now on your chart.', 3); persist();
  }
  if (W.phantom && !W.phantom.found && dist(W.phantom.x, W.phantom.y, k.x, k.y) < LANTERN_R - 3) {
    W.phantom.found = true;
    J.chart = J.chart.filter((c) => !(c.x === W.phantom.x && c.y === W.phantom.y));
    J.phantoms.push({ x: W.phantom.x, y: W.phantom.y, night: J.night });
    say('The island on your chart is not here. Only water where you drew it.', 5, 2); persist();
  }
  // where the nearest water is, for the sound of the tide
  let wd = 30;
  for (let a = 0; a < 6.28; a += 0.785) for (let r = 2; r < 30; r += 4) { if (sampleH(W, k.x + Math.cos(a) * r, k.y + Math.sin(a) * r) < G.L) { wd = Math.min(wd, r); break; } }
  G.waterDist = wd;
  // note target for keys and pad
  G.noteTarget = nearestNotable(k.x, k.y, 18, true);
  if (G.mossDirty && (G.mossT = (G.mossT || 0) + dt) > 1) { G.mossT = 0; G.mossDirty = false; rebuildMossLight(); Render.mossDirty = true; }
  if (G.towerLit) G.towerT += dt;
  if (G.endingDue > 0 && G.t >= G.endingDue) { G.endingDue = -1; UI.showEnding(); }
  G.saveT += dt; if (G.saveT > 20) { G.saveT = 0; persist(); }
  if (G.tideFrac >= 1) dawn();
}
function sing() {
  if (G.mode !== 'play') return;
  if (G.singQ.length) { say('Already singing.', 1.5); return; }
  const k = G.keeper, gm = groundMidi(k.x, k.y);
  const i0 = SCALE.indexOf(gm.midi);
  G.singQ = [0, 2, 4, 2].map((d) => ({ g: gm.g, midi: SCALE[clamp(i0 + d, 0, SCALE.length - 1)] }));
  G.sungAt = G.t;
}
function singAnswered() {
  // the nearest lit creature answers the keeper's song
  const k = G.keeper; let best = null, bd = 26;
  for (const c of G.W.creatures) {
    const d = dist(c.x, c.y, k.x, k.y);
    if (d < bd && (c.lit > 0.3 || (c.kind === 'bell' && d < 16)) && !c.singing && phraseOptions(c).length) { bd = d; best = c; }
  }
  if (best && !G.singer) { startSing(best, true); }
  else if (!best) say('Your song carries over the dark. Nothing lit is near enough to answer.', 3);
}
function stopWalking() { G.path = []; G.singQ = []; say('Stopped.', 1.2); }
function nearestNotable(x, y, r, needLit) {
  const W = G.W; let best = null, bd = r;
  const consider = (kind, ox, oy, ref, rad) => {
    const d = Math.max(0, dist(ox, oy, x, y) - (rad || 0));
    if (d < bd && (!needLit || litAt(ox, oy) > 0.3)) { bd = d; best = { kind, x: ox, y: oy, ref }; }
  };
  for (const c of W.creatures) if (c.kind !== 'bell' || G.L < c.bell.h + SHALLOW) consider(c.kind === 'fish' ? 'fish' : c.kind, c.x, c.y, c, c.kind === 'fish' ? 2 : 0);
  for (const b of W.boulders) consider('stone', b.x, b.y, b, b.r);
  for (const o of W.islets) consider('islet', o.x, o.y, o, 2);
  for (const r2 of W.ruins) consider('ruin', r2.x, r2.y, r2, 2);
  consider('tower', TOWER.x, TOWER.y, null, 3);
  return best;
}
function observe(t) {
  const J = G.J;
  if (!t) { say('Nothing lit close enough to note. Walk the lantern nearer.', 2.5); return; }
  J.seen[t.kind] = (J.seen[t.kind] || 0) + 1;
  const first = J.seen[t.kind] === 1;
  say(first ? `Noted in the journal: ${KIND_NAMES[t.kind]}.` : `${KIND_NAMES[t.kind][0].toUpperCase() + KIND_NAMES[t.kind].slice(1)}, noted again.`, 2.5);
  if (t.ref && t.ref.kind && !t.ref.singing) startSing(t.ref, true);
  if (t.kind === 'tower' && !G.towerLit) say('The lamp is cold. Something in the village must wake it.', 4, 1);
  if (J.tut === 2 && t.ref && t.ref.kind) { J.tut = 3; }
  G.ripples.push({ x: t.x, y: t.y, t: 0, note: 1 });
  persist(); UI.hud();
}
function updateBells(dt) {
  const k = G.keeper;
  for (const b of G.W.bells) {
    b.glow = Math.max(0, b.glow - dt * 0.5);
    const surfaced = G.L < b.h + SHALLOW;
    const d = dist(b.x, b.y, k.x, k.y);
    if (surfaced && d < 2.4 && !b.inside) { b.inside = true; ringBell(b); }
    if (d > 3.2) b.inside = false;
    if (!surfaced) { b.toll -= dt; if (b.toll <= 0) { b.toll = 18 + Math.random() * 14; if (d < 40) Sound.bell(b.n - 1, b.x, b.y, true, 0.35); b.glow = 0.6; } }
  }
}
function ringBell(b) {
  const under = G.L > b.h;
  Sound.bell(b.n - 1, b.x, b.y, under, 0.95);
  b.glow = 1;
  if (b.rung || G.towerLit) return;
  if (b.n === G.ringSeq.length + 1) {
    b.rung = true; G.ringSeq.push(b.n);
    if (b.n === 3) lightTower();
    else say(b.n === 1 ? 'The bell rings, and keeps ringing under the water.' : 'A second bell answers the first.', 3);
  } else {
    for (const o of G.W.bells) o.rung = false;
    G.ringSeq = [];
    say('The bells fall quiet together. They wanted another order.', 3.5, 1);
    Sound.chime(false);
  }
}
function lightTower() {
  G.towerLit = true; G.towerT = 0; G.J.lit = true; G.J.nightsLit++;
  say('Far behind you, the lighthouse lamp wakes.', 6, 3);
  Sound.chime(true);
  setTimeout(() => { for (let i = 0; i < 3; i++) Sound.bell(i, TOWER.x, TOWER.y, false, 0.7); }, 600);
  if (!G.J.ended) G.endingDue = G.t + 7;
  persist();
}
function dawn() {
  const J = G.J;
  G.mode = 'dawn';
  // the garden: walked trails thicken into moss that stays
  const before = G.moss.reduce((a, b) => a + b, 0);
  G.moss = growMoss(G.moss, G.trail);
  const after = G.moss.reduce((a, b) => a + b, 0);
  // words not heard tonight fade one step
  const faded = [];
  J.words.forEach((st, wi) => { if (st.heard.length && st.lastNight !== J.night) { if (st.fade < 3) { st.fade++; faded.push(wi); } } });
  const summary = { night: J.night, heard: [...G.heardTonight], faded, mossGain: after - before, confirmed: J.words.filter((w) => w.confirmed).length };
  J.night++;
  G.trail = new Float32Array(MOSS_N * MOSS_N);
  persist();
  UI.showDawn(summary);
}
