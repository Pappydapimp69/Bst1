// A player that plays well enough to calibrate the game against and to drive
// replays. It reads the world and returns a held direction; it draws no
// random numbers, so it cannot disturb the run it is measuring.
import { C } from './sim.js';

const HEADINGS = [];
for (let i = 0; i < 16; i++) HEADINGS.push([Math.cos((i / 16) * 2 * Math.PI), Math.sin((i / 16) * 2 * Math.PI)]);
const LOOK = 60, STRIDE = 4, NEAR = 64;

// When a bat on its present course would first come within NEAR of a moth
// flying this heading, in ticks; LOOK + 1 if never.
function entryTime(s, b, hx, hy) {
  const dt = C.TICK;
  for (let t = STRIDE; t <= LOOK; t += STRIDE) {
    const lead = Math.max(0, t - b.warm) * dt;
    const mx = s.moth.x + hx * C.MOTH_MAX * t * dt, my = s.moth.y + hy * C.MOTH_MAX * t * dt;
    let bx = b.x + b.vx * lead, by = b.y + b.vy * lead;
    if (b.warm > 0) {
      // A waking bat will head for the moth: assume it closes straight in.
      const dx = mx - b.x, dy = my - b.y, d = Math.hypot(dx, dy) || 1;
      bx = b.x + (dx / d) * C.BAT_SPEED * lead; by = b.y + (dy / d) * C.BAT_SPEED * lead;
    }
    if (Math.hypot(mx - bx, my - by) < NEAR) return t;
  }
  return LOOK + 1;
}

export function botInput(s) {
  const m = s.moth;
  let goal = null, gd = Infinity;
  for (const p of s.pollen) {
    const d = Math.hypot(p.x - m.x, p.y - m.y);
    if (d < gd) { gd = d; goal = p; }
  }
  const gx = goal ? (goal.x - m.x) / (gd || 1) : 0, gy = goal ? (goal.y - m.y) / (gd || 1) : 0;
  const hunters = s.bats.filter((b) => !b.leaving);
  let best = [gx, gy], bestScore = -Infinity;
  const options = HEADINGS.concat([[gx, gy]]);
  for (const [hx, hy] of options) {
    // Judge a heading by the threat that arrives first, by entry time, not by
    // whichever bat happens to be scanned last.
    let first = LOOK + 1;
    for (const b of hunters) first = Math.min(first, entryTime(s, b, hx, hy));
    const danger = first > LOOK ? 0 : 1 + (LOOK - first) / LOOK;
    const score = hx * gx + hy * gy - danger * 3;
    if (score > bestScore) { bestScore = score; best = [hx, hy]; }
  }
  return { x: best[0], y: best[1] };
}
