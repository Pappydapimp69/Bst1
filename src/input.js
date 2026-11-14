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

export function bindInput(target, hold, { mothOnScreen, onGesture, onTouch }) {
  const down = new Set();
  let pointer = null;   // { id, touch, ox, oy, x, y }
  let touch = false;

  const keysVector = () => {
    let x = 0, y = 0;
    for (const code of down) { x += KEYS[code][0]; y += KEYS[code][1]; }
    if (x || y) hold.set('keys', x, y); else hold.release('keys');
  };
  const pointerVector = () => {
    if (!pointer) return;
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
    try { target.setPointerCapture(e.pointerId); } catch {}
    onGesture(isTouch ? 'touch' : 'mouse');
    pointerVector();
    e.preventDefault();
  });
  target.addEventListener('pointermove', (e) => {
    if (!pointer || pointer.id !== e.pointerId) return;
    pointer.x = e.clientX; pointer.y = e.clientY;
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

  return {
    refresh: pointerVector,   // the moth moves under a still mouse
    get stick() { return pointer && pointer.touch ? pointer : null; },
    get touch() { return touch; },
  };
}

function clamp(v) { return Math.max(-1, Math.min(1, v)); }
