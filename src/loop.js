// Fixed-step loop fed by an accumulator. A frame's elapsed time is capped so a
// stall cannot snowball into catch-up steps; leftover time carries over and
// the picture is blended between the last two states by `alpha`.
export function createLoop({ dt, step, render, maxFrame = 0.25 }) {
  let acc = 0, last = null, manual = false;
  return {
    frame(nowMs) {
      const elapsed = last === null ? 0 : Math.min(maxFrame, Math.max(0, (nowMs - last) / 1000));
      last = nowMs;
      if (!manual) {
        acc += elapsed;
        while (acc >= dt) { step(); acc -= dt; }
      }
      render(manual ? 1 : acc / dt, elapsed);
    },
    // Stepping by hand (tests): drop the real-time remainder and stop feeding
    // it, or the frame loop runs extra ticks between the hand's steps.
    stepBy(n) {
      manual = true; acc = 0;
      for (let i = 0; i < n; i++) step();
    },
    resume() { manual = false; acc = 0; last = null; },
    get manual() { return manual; },
  };
}
