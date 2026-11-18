// ---------------------------------------------------------------- boot and frame loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);   // asked first, so one bad frame never stops the loop
  try {
    if (Render.stale()) { UI.layout(); Render.fit(); }
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    Input.pollPad();
    if (G.mode === 'play' && !UI.ov) update(dt * (window.__ltSpeed || 1));
    Sound.frame(G);
    Render.draw(now);
    UI.frame(dt);
  } catch (e) {
    if (!frame.errs) frame.errs = 0;
    if (frame.errs++ < 3) console.error('Low Tide frame error:', e);
  }
}
function boot() {
  document.body.classList.add('dev-keys');
  UI.layout();
  Render.init();
  const { save, note } = loadSave();
  G.J = save || freshJournal();
  G.moss = save && save.moss ? decodeMoss(save.moss) : new Float32Array(MOSS_N * MOSS_N);
  G.W = genNight(G.J);
  G.towerLit = !!G.J.lit; G.towerT = 10;
  spawnCreatures();
  rebuildMossLight();
  Render.fit();
  Render.bakeTerrain();
  bindInput(); bindUI();
  UI.hints(); UI.hud();
  G.mode = 'title';
  UI.open('title');
  if (note) $('tNote').textContent = note;
  if (mqReduce && mqReduce.addEventListener) mqReduce.addEventListener('change', () => UI.paintToggles());
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- test hook (inert unless a test calls it)
window.__lt = {
  get mode() { return G.mode; }, get overlay() { return UI.ov; }, get night() { return G.J.night; }, get tide() { return G.tideFrac; },
  get keeper() { return { x: G.keeper.x, y: G.keeper.y }; }, get towerLit() { return G.towerLit; }, get tut() { return G.J.tut; },
  get device() { return Input.device; }, get sound() { return Sound.ctx ? { state: Sound.ctx.state, engine: !!Sound.eng, fallback: Sound.fallback } : null; },
  get pathLen() { return G.path.length; }, get stepCount() { return G.stepCount; }, get ringSeq() { return G.ringSeq.slice(); },
  bells() { return G.W.bells.map((b) => ({ n: b.n, x: b.x, y: b.y, h: b.h, rung: b.rung, surfaced: G.L < b.h + SHALLOW, screen: Render.toScreen(b.x, b.y) })); },
  creatures() { return G.W.creatures.map((c) => ({ kind: c.kind, x: c.x, y: c.y, lit: c.lit, singing: !!c.singing, screen: Render.toScreen(c.x, c.y) })); },
  toScreen(x, y) { return Render.toScreen(x, y); },
  words() { return G.J.words.map((w, i) => ({ id: WORDS[i].id, heard: w.heard.length, guess: w.guess, confirmed: w.confirmed, fade: w.fade })); },
  heardPhrases() { return G.J.phrases.slice(); },
  setSpeed(k) { window.__ltSpeed = k; },
  skipTutorial() { G.J.tut = 5; persist(); },
  tideTo(f) { G.t = f * NIGHT_LEN; },
  // a clear route between two world points, for bots walking with real input
  groundAt(x, y) { return groundAt(x, y); },
  moss() { let s = 0; for (const v of G.moss) s += v; return s; },
  errors: [],
};
window.addEventListener('error', (e) => window.__lt.errors.push(String(e.message)));
boot();
