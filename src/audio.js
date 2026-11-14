// Sound starts only after a player gesture (browsers block it before), can be
// muted, and the context is suspended while the page is hidden: a muted gain
// still runs every node, only suspending stops the work.
export function createAudio({ muted = false } = {}) {
  let ctx = null, master = null;
  const FLOOR = 0.0001;   // an exponential ramp cannot reach zero

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended' && !document.hidden) ctx.resume(); return; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch { ctx = null; }
  }

  function tone(type, from, to, dur, vol, delay = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });

  return {
    unlock,
    get muted() { return muted; },
    get state() { return ctx ? ctx.state : 'none'; },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    play(type, n = 0) {
      if (type === 'pollen') { const f = 660 * Math.pow(1.122, n % 6); tone('triangle', f, f * 1.5, 0.16, 0.5); }
      else if (type === 'hit') { tone('sawtooth', 180, 50, 0.3, 0.6); tone('square', 90, 40, 0.22, 0.3); }
      else if (type === 'warn') tone('sine', 1500, 1100, 0.09, 0.12);
      else if (type === 'wave') { tone('sine', 330, 330, 0.25, 0.25); tone('sine', 495, 495, 0.35, 0.25, 0.12); }
      else if (type === 'over') { tone('triangle', 440, 220, 0.5, 0.5); tone('triangle', 330, 110, 0.9, 0.4, 0.25); }
    },
  };
}
