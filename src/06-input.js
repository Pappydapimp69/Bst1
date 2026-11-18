// ---------------------------------------------------------------- input: one table of bindings, every device
const BIND = {
  walk: { keys: 'arrow keys or WASD', pad: 'left stick', touch: 'draw a path from the keeper', mouse: 'drag a path from the keeper' },
  sing: { keys: 'Space', pad: 'A', touch: '', mouse: 'Space' },
  note: { keys: 'E', pad: 'X', touch: 'tap', mouse: 'click' },
  stop: { keys: 'Q', pad: 'B', touch: 'hold', mouse: 'Q' },
  journal: { keys: 'J', pad: 'Y', touch: '', mouse: 'J' },
  menu: { keys: 'Esc', pad: 'Start', touch: '', mouse: 'Esc' },
  back: { keys: 'Esc', pad: 'B', touch: '', mouse: 'Esc' },
};
const KEY_ACT = { Space: 'sing', Enter: 'sing', KeyE: 'note', KeyQ: 'stop', KeyJ: 'journal', Tab: 'journal', Escape: 'menu', KeyP: 'menu' };
const KEY_DIR = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
const PAD_DEAD = 0.2;   // radial dead zone on stick magnitude, shared by every stick read
function stickInput(ax, ay, dead) {
  const m = Math.hypot(ax, ay);
  if (m <= dead) return [0, 0];
  const k = Math.min(1, (m - dead) / (1 - dead)) / m;
  return [ax * k, ay * k];
}
const Input = {
  device: 'keys', keys: {}, pad: { x: 0, y: 0 }, prev: [], latched: new Set(), padCount: 0, ptr: null, drawing: false, drawFinger: null, drawTip: null,
  setDevice(d) {
    if (d === this.device) return;
    this.device = d;
    document.body.classList.remove('dev-keys', 'dev-pad', 'dev-touch', 'dev-mouse'); document.body.classList.add('dev-' + d);
    UI.hints();
  },
  hint(a) { const b = BIND[a]; if (!b) return ''; return b[this.device] ?? b.keys; },
  vector() {
    let x = 0, y = 0;
    for (const [code, d] of Object.entries(KEY_DIR)) if (this.keys[code]) { x += d[0]; y += d[1]; }
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    if (Math.hypot(this.pad.x, this.pad.y) > Math.hypot(x, y)) { x = this.pad.x; y = this.pad.y; }
    return { x, y };
  },
  releaseAll() { this.keys = {}; this.pad = { x: 0, y: 0 }; if (this.ptr) { clearTimeout(this.ptr.lp); this.ptr = null; } this.drawing = false; },
  latchHeld() { for (let i = 0; i < this.prev.length; i++) if (this.prev[i]) this.latched.add(i); },
  pollPad() {
    const list = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    if (list.length < this.padCount && G.mode === 'play' && !UI.ov) { UI.open('pause'); say('The controller went quiet, so the tide waits.', 4, 2); }
    this.padCount = list.length;
    if (!list.length) { this.pad = { x: 0, y: 0 }; this.prev = []; return; }
    // strongest push across every listed pad
    let ax = 0, ay = 0; const pressed = [];
    for (const gp of list) {
      if (Math.abs(gp.axes[0] || 0) > Math.abs(ax)) ax = gp.axes[0] || 0;
      if (Math.abs(gp.axes[1] || 0) > Math.abs(ay)) ay = gp.axes[1] || 0;
      gp.buttons.forEach((b, i) => { if (b && (b.pressed || b.value > 0.5)) pressed[i] = true; });
    }
    const [sx, sy] = stickInput(ax, ay, PAD_DEAD);
    this.pad = { x: sx, y: sy };
    const any = pressed.some(Boolean) || sx || sy;
    if (any) this.setDevice('pad');
    for (const i of [...this.latched]) if (!pressed[i]) this.latched.delete(i);
    const edge = (i) => pressed[i] && !this.prev[i] && !this.latched.has(i);
    if (UI.ov) {
      if (edge(12)) UI.nav(0, -1); if (edge(13)) UI.nav(0, 1); if (edge(14)) UI.nav(-1, 0); if (edge(15)) UI.nav(1, 0);
      if (edge(0)) UI.activate();
      if (edge(1)) UI.back();
      if (edge(9)) UI.back();
      if (edge(3) && UI.ov === 'journal') UI.back();
      this.pad = { x: 0, y: 0 };
    } else if (G.mode === 'play') {
      if (edge(0)) act('sing'); if (edge(1)) act('stop'); if (edge(2)) act('note'); if (edge(3)) act('journal'); if (edge(9)) act('menu');
    }
    this.prev = pressed;
  },
};
function act(a) {
  if (G.mode !== 'play' || UI.ov) return;
  if (a === 'sing') sing();
  else if (a === 'note') observe(G.noteTarget);
  else if (a === 'stop') stopWalking();
  else if (a === 'journal') UI.openJournal();
  else if (a === 'menu') UI.open('pause');
}
function bindInput() {
  const cv = $('view');
  const isTouch = (e) => e.pointerType === 'touch' || e.pointerType === 'pen';
  cv.addEventListener('pointerdown', (e) => {
    Input.setDevice(isTouch(e) ? 'touch' : 'mouse');
    Sound.unlock(isTouch(e));
    if (G.mode !== 'play' || UI.ov || Input.ptr) return;
    try { cv.setPointerCapture(e.pointerId); } catch (er) { /* capture is optional */ }
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const w = Render.toWorld(x, y), reach = (isTouch(e) ? 26 : 14) / Render.s;
    const hit = nearestNotable(w.x, w.y, reach, false);
    Input.ptr = { id: e.pointerId, x0: x, y0: y, touch: isTouch(e), moved: false, long: false, hit,
      lp: setTimeout(() => { if (Input.ptr && !Input.ptr.moved) { Input.ptr.long = true; stopWalking(); buzz(30); } }, 550) };
    e.preventDefault();
  });
  cv.addEventListener('pointermove', (e) => {
    const p = Input.ptr; if (!p || p.id !== e.pointerId) return;
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (!p.moved && Math.hypot(x - p.x0, y - p.y0) > 10) { p.moved = true; clearTimeout(p.lp); Input.drawing = true; G.path = []; }
    if (!p.moved) return;
    // the line lifts ahead of the finger so the hand does not cover it
    const lift = p.touch ? 46 : 0;
    const tip = { x, y: Math.max(2, y - lift) };
    Input.drawFinger = { x, y }; Input.drawTip = tip;
    const w = Render.toWorld(tip.x, tip.y), last = G.path[G.path.length - 1];
    if (!last || dist(last.x, last.y, w.x, w.y) > 0.8) G.path.push(w);
  });
  const end = (e) => {
    const p = Input.ptr; if (!p || p.id !== e.pointerId) return;
    clearTimeout(p.lp);
    if (!p.moved && !p.long && e.type === 'pointerup' && G.mode === 'play' && !UI.ov) {
      if (p.hit && litAt(p.hit.x, p.hit.y) > 0.3) observe(p.hit);
      else {
        if (p.hit) say('Too dark to make it out. Bring the lantern closer.', 2.5);
        G.path = [Render.toWorld(p.x0, p.y0)];
      }
    }
    Input.ptr = null; Input.drawing = false; Input.drawFinger = Input.drawTip = null;
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code.startsWith('F') && e.code.length <= 3) return;   // leave browser keys alone
    Input.setDevice('keys');
    Sound.unlock(false);
    if (UI.ov) { UI.key(e); return; }
    if (G.mode !== 'play') return;
    if (KEY_DIR[e.code]) { Input.keys[e.code] = true; e.preventDefault(); return; }
    const a = KEY_ACT[e.code];
    if (a) { e.preventDefault(); if (!e.repeat) act(a); }
  });
  window.addEventListener('keyup', (e) => { delete Input.keys[e.code]; });
  window.addEventListener('blur', () => { Input.releaseAll(); if (G.mode === 'play' && !UI.ov) UI.open('pause'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { Input.releaseAll(); if (G.mode === 'play' && !UI.ov) UI.open('pause'); } });
  window.addEventListener('gamepadconnected', () => { Input.setDevice('pad'); say('Controller ready.', 2); });
  window.addEventListener('gamepaddisconnected', () => { /* polled each frame; pause handled there */ });
  // first real touch shows touch hints; also feature-detect touch screens
  if ((navigator.maxTouchPoints || 0) > 0 && 'ontouchstart' in window) Input.setDevice('touch');
  document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') Input.setDevice('touch'); Sound.unlock(e.pointerType === 'touch'); }, true);
}
let vibeOff = false;
function buzz(ms) {
  if (vibeOff) return;
  try { if (navigator.vibrate) { if (!navigator.vibrate(Math.max(12, ms))) vibeOff = true; } } catch (e) { vibeOff = true; }
}
