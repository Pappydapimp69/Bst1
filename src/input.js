// One hold controller for every input method. Keys, mouse and touch each hold
// a direction under their own source name; the game reads a single vector, so
// nothing can be held by a pointer that a keyboard cannot also hold.
export function createHold() {
  const held = new Map();
  const seen = new Set();
  return {
    set(source, x, y) { held.set(source, { x, y }); seen.add(source); },
    release(source) { held.delete(source); },
    releaseAll() { held.clear(); },
    vector() {
      let x = 0, y = 0;
      for (const v of held.values()) { x += v.x; y += v.y; }
      const l = Math.hypot(x, y);
      return l > 1 ? { x: x / l, y: y / l } : { x, y };
    },
    get seen() { return [...seen]; },
    get holding() { return held.size > 0; },
  };
}

const KEYS = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1],
};
const STICK = 56;    // CSS px of thumb travel for full thrust
const REACH = 90;    // CSS px from the moth for full thrust with a mouse
const DEAD = 0.2;    // stick travel ignored round the centre, so a worn stick does not drift

export function bindInput(target, hold, { mothOnScreen, onGesture, onTouch, touchPath = false }) {
  const down = new Set();
  let pointer = null;   // { id, touch, ox, oy, x, y }
  let touch = false;
  // Path mode (touch only): a tap or a drawn line, in screen points, that the
  // game walks along. Nothing is held, so the hand is free to lift away.
  let path = [];

  const keysVector = () => {
    let x = 0, y = 0;
    for (const code of down) { x += KEYS[code][0]; y += KEYS[code][1]; }
    if (x || y) hold.set('keys', x, y); else hold.release('keys');
  };
  const pointerVector = () => {
    if (!pointer) return;
    if (pointer.touch && touchPath) return;
    if (pointer.touch) {
      // A floating stick: drag from where the thumb landed, so the hand never
      // has to cover the moth.
      hold.set('touch', clamp((pointer.x - pointer.ox) / STICK), clamp((pointer.y - pointer.oy) / STICK));
    } else {
      const m = mothOnScreen();
      hold.set('mouse', clamp((pointer.x - m.x) / REACH), clamp((pointer.y - m.y) / REACH));
    }
  };
  const releaseEverything = () => { down.clear(); pointer = null; hold.releaseAll(); };

  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    onGesture('keys', e.code);
    if (KEYS[e.code]) { down.add(e.code); keysVector(); e.preventDefault(); }
  });
  addEventListener('keyup', (e) => { if (down.delete(e.code)) keysVector(); });

  target.addEventListener('pointerdown', (e) => {
    // Touch is known from the first real touch, never guessed from feature
    // sniffing, which misjudges laptops with touch screens.
    const isTouch = e.pointerType === 'touch';
    if (isTouch && !touch) { touch = true; onTouch(); }
    if (pointer && pointer.id !== e.pointerId) return;
    pointer = { id: e.pointerId, touch: isTouch, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
    if (isTouch && touchPath) path = [{ x: e.clientX, y: e.clientY }];   // a new touch replaces the old path
    try { target.setPointerCapture(e.pointerId); } catch {}
    onGesture(isTouch ? 'touch' : 'mouse');
    pointerVector();
    e.preventDefault();
  });
  target.addEventListener('pointermove', (e) => {
    if (!pointer || pointer.id !== e.pointerId) return;
    pointer.x = e.clientX; pointer.y = e.clientY;
    if (pointer.touch && touchPath) {
      const last = path[path.length - 1];
      if (!last || Math.hypot(e.clientX - last.x, e.clientY - last.y) > 10) path.push({ x: e.clientX, y: e.clientY });
    }
    pointerVector();
  });
  const up = (e) => {
    if (!pointer || pointer.id !== e.pointerId) return;
    hold.release(pointer.touch ? 'touch' : 'mouse');
    pointer = null;
  };
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
  target.addEventListener('contextmenu', (e) => e.preventDefault());

  // Losing focus or the tab is an implicit release: the keyup or pointerup
  // that would have ended the hold may never arrive.
  addEventListener('blur', releaseEverything);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseEverything(); });

  // A controller is a fourth source on the same hold controller. It has no
  // events for sticks, so it is polled once a frame: the left stick or the
  // d-pad steers, and the first press or push counts as the gesture that
  // starts a run.
  let padActive = false;
  function pollPad() {
    let pads;
    try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch { return; }
    let x = 0, y = 0, pressed = false;
    for (const p of pads || []) {
      if (!p || !p.connected) continue;
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0, m = Math.hypot(ax, ay);
      if (m > DEAD) { const k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m; x += ax * k; y += ay * k; }
      const b = p.buttons || [];
      const on = (i) => Boolean(b[i] && b[i].pressed);
      if (on(14)) x -= 1;
      if (on(15)) x += 1;
      if (on(12)) y -= 1;
      if (on(13)) y += 1;
      for (let i = 0; i < b.length; i++) if (on(i)) pressed = true;
    }
    const steering = x !== 0 || y !== 0, active = steering || pressed;
    if (active && !padActive) onGesture('pad');
    padActive = active;
    if (steering) hold.set('pad', clamp(x), clamp(y)); else hold.release('pad');
  }

  return {
    refresh: pointerVector,   // the moth moves under a still mouse
    get path() { return path; },
    clearPath() { path = []; },
    pollPad,
    get stick() { return pointer && pointer.touch && !touchPath ? pointer : null; },
    get touch() { return touch; },
  };
}

function clamp(v) { return Math.max(-1, Math.min(1, v)); }
