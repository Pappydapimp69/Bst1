// ---------------------------------------------------------------- sound
// The person's sound engine (inlined as SE) is the default; plain Web Audio is the fallback.
// Context is made inside the first gesture; resume is never awaited; hidden page suspends.
const FLOOR = 0.0001;
const M_PER_UNIT = 0.45;
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PAD_SONG = { bpm: 40, seed: 3, swing: 0, tracks: [
  { name: 'pad', instrument: 'fm', patch: 'organ', gain: 0.35, gate: 1, steps: 'A2 - - - - - - - E2 - - - - - - - F2 - - - - - - - E2 - - - - - - -' },
  { name: 'air', instrument: 'fm', patch: 'epiano', gain: 0.25, gate: 0.9, minIntensity: 0.35, steps: '. . . . E4 . . . . . . . . . . . . . . . C4 . . . . . . . ?D4 . . .' },
] };
const Sound = {
  ctx: null, out: null, eng: null, fallback: false, src: {}, music: null, tide: null, state: 'off', t0: 0,
  unlock(touch) {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC({ latencyHint: touch ? 'balanced' : 'interactive' });
      this.out = this.ctx.createGain(); this.out.gain.value = settings.sound ? 0.9 : 0;
      const lim = this.ctx.createDynamicsCompressor(); lim.threshold.value = -8; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.2;
      this.out.connect(lim); lim.connect(this.ctx.destination);
      this.ctx.resume().catch(() => {});
      this.ctx.onstatechange = () => { this.state = this.ctx.state; UI.soundNote(); };
      this.state = this.ctx.state;
      this.makeTide();
      this.startEngine(touch);
    } catch (e) { this.ctx = null; }
  },
  startEngine(touch) {
    const SEk = window.SE;
    if (!SEk || !SEk.SoundEngine || !this.ctx.audioWorklet) { this.fallback = true; return; }
    let url = null;
    try { url = URL.createObjectURL(new Blob([$('seWorklet').textContent], { type: 'application/javascript' })); } catch (e) { this.fallback = true; return; }
    const bus = this.ctx.createGain(); bus.gain.value = 0.85; bus.connect(this.out);
    SEk.SoundEngine.create({ context: this.ctx, workletUrl: url, destination: bus, zone: 'openPlain', device: touch ? 'mono' : 'headphones', maxVoices: 20 })
      .then((eng) => {
        this.eng = eng;
        const pos = { x: 0, y: 0 };
        this.src.steps = eng.createSource('synth', { position: pos, level: 80, priority: 6 });
        this.src.feet = eng.createSource('footsteps', { position: pos, level: 60 });
        this.src.crab = eng.createSource('synth', { position: pos, priority: 4 });
        this.src.moth = eng.createSource('synth', { position: pos, priority: 4 });
        this.src.fish = eng.createSource('synth', { position: pos, priority: 4 });
        this.src.chime = eng.createSource('synth', { position: pos, priority: 10 });
        this.src.spirit = eng.createSource('voice', { position: pos, tract: 0.11, sac: 0.05, priority: 5, level: 90 });
        this.src.bells = [0, 1, 2].map((i) => {
          const f = midiHz([48, 52, 55][i]);
          const ratios = [0.5, 1, 1.183, 1.506, 2.0, 2.514, 2.662, 3.011];
          return eng.createSource('modal', { position: pos, priority: 12, level: 95,
            modes: ratios.map((r, k) => ({ freq: f * r, gain: 1 / (1 + k * 0.6), t60: 7 / (1 + k * 0.7) })) });
        });
        try { this.music = eng.createMusic(PAD_SONG, { intensity: 0.2, volume: 0.16, send: 0.25 }).play(); } catch (e) { this.music = null; }
      })
      .catch(() => { this.fallback = true; });
  },
  makeTide() {
    const c = this.ctx, len = c.sampleRate * 3, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let b = 0; for (let i = 0; i < len; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 6; } // brown-ish noise
    const n = c.createBufferSource(); n.buffer = buf; n.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.4;
    const g = c.createGain(); g.gain.value = FLOOR;
    // the hiss of foam on each swell, kept above phone-speaker roll-off
    const n2 = c.createBufferSource(); const buf2 = c.createBuffer(1, len, c.sampleRate), d2 = buf2.getChannelData(0);
    for (let i = 0; i < len; i++) d2[i] = Math.random() * 2 - 1;
    n2.buffer = buf2; n2.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.6;
    const g2 = c.createGain(); g2.gain.value = FLOOR;
    n.connect(lp); lp.connect(g); g.connect(this.out); n2.connect(bp); bp.connect(g2); g2.connect(this.out);
    n.start(); n2.start();
    this.tide = { g, g2, lp };
  },
  setMuted(m) {
    if (!this.ctx) return;
    this.out.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  },
  now() { return this.ctx ? this.ctx.currentTime : performance.now() / 1000; },
  frame(G) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    if (this.tide) {
      const k = G.keeper, frac = G.tideFrac;
      // shaped noise: a slow swell every ~9 s, louder as the tide rises and as the keeper nears the water
      const sw = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI / 9.3) * (0.7 + 0.3 * Math.sin(t * 0.37));
      const near = clamp(1 - (G.waterDist || 20) / 30, 0.15, 1);
      const base = (0.05 + 0.08 * frac) * near * (G.mode === 'play' ? 1 : 0.5);
      this.tide.g.gain.setTargetAtTime(Math.max(FLOOR, base * (0.35 + 0.65 * sw)), t, 0.3);
      this.tide.g2.gain.setTargetAtTime(Math.max(FLOOR, base * 0.07 * Math.pow(sw, 3)), t, 0.25);
      this.tide.lp.frequency.setTargetAtTime(380 + 420 * sw, t, 0.4);
    }
    if (this.eng) {
      const k = G.keeper;
      this.eng.setListener({ x: k.x * M_PER_UNIT, y: -k.y * M_PER_UNIT, yaw: 0 });
      this.src.steps.setPosition(k.x * M_PER_UNIT, -k.y * M_PER_UNIT);
      this.src.feet.setPosition(k.x * M_PER_UNIT, -k.y * M_PER_UNIT);
      if (this.music) this.music.setIntensity(0.15 + 0.6 * G.tideFrac);
      this.eng.update();
    }
  },
  place(s, x, y) { if (s) s.setPosition(x * M_PER_UNIT, -y * M_PER_UNIT); },
  // plain Web Audio voice used when the engine is unavailable
  tone(freq, dur, vol, type, delay) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx, t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(FLOOR, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  },
  step(ground, midi, x, y) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (this.eng) {
      const patch = ground === 'stone' ? 'bell' : 'epiano';
      const vel = ground === 'moss' ? 0.28 : ground === 'water' ? 0.3 : 0.36;
      this.src.steps.note({ midi, velocity: vel, duration: ground === 'stone' ? 0.5 : 0.35, patch });
      const surface = ground === 'water' ? 'water' : ground === 'stone' ? 'sandstone' : ground === 'moss' ? 'packedDirt' : 'sand';
      this.src.feet.step({ mass: 60, speed: 1.1, surface, gain: 0.35 });
    } else this.tone(midiHz(midi), ground === 'stone' ? 0.6 : 0.4, 0.06, ground === 'water' ? 'sine' : 'triangle');
  },
  glyph(kind, midi, x, y) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (this.eng) {
      if (kind === 'spirit') { this.place(this.src.spirit, x, y); this.src.spirit.call({ mode: 'open', duration: 0.55, f0: midiHz(midi - 24), f0End: midiHz(midi - 24) * 0.98, amp: 0.5, intensity: 0.2, breath: 0.4, vibrato: 0.3, mouth: 0.6 }); return; }
      if (kind === 'bell') { this.bell(0, x, y, true, 0.5); this.place(this.src.chime, x, y); this.src.chime.note({ midi: midi - 12, velocity: 0.35, duration: 0.6, patch: 'bell' }); return; }
      const s = this.src[kind] || this.src.moth; this.place(s, x, y);
      if (kind === 'crab') s.chip({ channel: 0, freq: midiHz(midi), velocity: 0.22, duration: 0.22, decay: 4 });
      else if (kind === 'fish') s.note({ midi: midi - 12, velocity: 0.4, duration: 0.5, patch: 'epiano' });
      else s.note({ midi, velocity: 0.3, duration: 0.45, patch: 'bell' });
    } else this.tone(midiHz(kind === 'fish' || kind === 'bell' ? midi - 12 : midi), 0.5, 0.07, kind === 'crab' ? 'square' : 'sine');
  },
  bell(n, x, y, under, amp) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (this.eng) { const s = this.src.bells[n]; this.place(s, x, y); s.strike(amp == null ? 0.9 : amp, under ? 0.18 : 0.6); }
    else { const f = midiHz([48, 52, 55][n]); [0.5, 1, 1.183, 1.506, 2].forEach((r, i) => this.tone(f * r, 3 - i * 0.4, 0.05 / (1 + i), 'sine')); }
  },
  chime(ok) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const notes = ok ? [72, 76, 79] : [64, 62];
    notes.forEach((m, i) => {
      if (this.eng) setTimeout(() => this.src.chime && this.src.chime.note({ midi: m, velocity: 0.3, duration: 0.6, patch: 'bell' }), i * 140);
      else this.tone(midiHz(m), 0.6, 0.05, 'sine', i * 0.14);
    });
  },
  suspend(h) { if (!this.ctx) return; if (h) this.ctx.suspend().catch(() => {}); else this.ctx.resume().catch(() => {}); },
};
document.addEventListener('visibilitychange', () => Sound.suspend(document.hidden));
