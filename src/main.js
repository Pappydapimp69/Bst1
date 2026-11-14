import { C, createWorld, step, waveAt, fingerprint } from './sim.js';
import { botInput } from './bot.js';
import { createLoop } from './loop.js';
import { followCamera } from './camera.js';
import { createHold, bindInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { load, save } from './save.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const fixedSeed = params.get('seed');
const newSeed = () => fixedSeed || Date.now().toString(36);

const canvas = $('game');
const renderer = createRenderer(canvas);
const hold = createHold();
const audio = createAudio({ muted: load('muted', false) });
// Calm motion follows the system setting until the player chooses otherwise.
let calm = load('calm', matchMedia('(prefers-reduced-motion: reduce)').matches);
let best = load('best', 0);

let world = createWorld(newSeed());
let cam = { x: world.moth.x, y: world.moth.y };
let mode = 'title';
let overAt = 0, mothScreen = { x: innerWidth / 2, y: innerHeight / 2 }, time = 0, chain = 0;
let wasRest = true;

function begin() {
  // A new run starts from a new world, made before anything is shown, so
  // nothing of the last run carries over.
  world = createWorld(newSeed());
  cam = { x: world.moth.x, y: world.moth.y };
  renderer.clear();
  chain = 0; wasRest = true;
  mode = 'play';
  $('overlay').hidden = true;
  hud();
}

function hud() {
  $('score').textContent = `Pollen ${world.score}`;
  $('best').textContent = `Best ${Math.max(best, world.score)}`;
  $('glow').style.width = `${Math.round(world.glow * 100)}%`;
  $('glow').classList.toggle('low', world.glow < 0.3);
}

function banner(text) {
  const b = $('banner');
  b.textContent = text;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}

function tick() {
  if (mode !== 'play') return;
  input.refresh();
  step(world, hold.vector());
  for (const e of world.events) {
    renderer.onEvent(e, calm);
    if (e.type === 'pollen') audio.play('pollen', chain++);
    else if (e.type === 'hit') { audio.play('hit'); chain = 0; }
    else if (e.type === 'warn') audio.play('warn');
    else if (e.type === 'wave') { audio.play('wave'); banner(`Wave ${e.wave + 1}`); }
    else if (e.type === 'over') {
      audio.play('over');
      mode = 'over'; overAt = performance.now();
      $('banner').classList.remove('show');
      if (world.score > best) { best = world.score; save('best', best); }
      $('title').textContent = 'The light went out';
      $('line').textContent = `You gathered ${world.score} pollen and lasted ${Math.round(world.tick * C.TICK)} seconds. Best ${best}.`;
      $('hint').textContent = input.touch ? 'Tap to fly again' : 'Press a key, a button, or click to fly again';
      $('overlay').hidden = false;
    }
  }
  const rest = waveAt(world.tick).rest;
  if (rest && !wasRest && mode === 'play') banner('The bats scatter');
  wasRest = rest;
  cam = followCamera(cam, world.moth, renderer.view, { w: C.W, h: C.H });
  hud();
}

const loop = createLoop({
  dt: C.TICK,
  step: tick,
  render(alpha, frameDt) {
    time += frameDt;
    input.pollPad();
    mothScreen = renderer.draw(world, mode === 'play' ? alpha : 1, cam, time, frameDt, { calm, stick: input.stick });
  },
});

const input = bindInput(canvas, hold, {
  mothOnScreen: () => mothScreen,
  onGesture(source, code) {
    audio.unlock();
    if (code === 'KeyM') return toggleSound();
    if (mode === 'title') begin();
    else if (mode === 'over' && performance.now() - overAt > 700) begin();
  },
  onTouch() {
    document.body.classList.add('touch');
    if (mode === 'title') $('hint').textContent = 'Drag anywhere to fly';
  },
});

function toggleSound() {
  audio.setMuted(!audio.muted);
  save('muted', audio.muted);
  labels();
}
function labels() {
  $('sound').textContent = audio.muted ? 'Sound off' : 'Sound on';
  $('sound').setAttribute('aria-pressed', String(!audio.muted));
  $('motion').textContent = calm ? 'Motion calm' : 'Motion full';
  $('motion').setAttribute('aria-pressed', String(calm));
}
$('sound').addEventListener('click', (e) => { audio.unlock(); toggleSound(); e.currentTarget.blur(); });
$('motion').addEventListener('click', (e) => { calm = !calm; save('calm', calm); labels(); e.currentTarget.blur(); });
labels(); hud();

requestAnimationFrame(function frame(now) { loop.frame(now); requestAnimationFrame(frame); });

// For tests: the game's own tick and state, so nothing has to wait on a clock.
window.__game = {
  get tick() { return world.tick; },
  get mode() { return mode; },
  get touch() { return input.touch; },
  get seen() { return hold.seen; },
  hold,
  get audio() { return audio.state; },
  get calm() { return calm; },
  state: () => JSON.parse(JSON.stringify(world)),
  camera: () => ({ ...cam }),
  view: () => ({ ...renderer.view }),
  stepBy: (n) => loop.stepBy(n),
  resume: () => loop.resume(),
  replay(seed, ticks) {
    const w = createWorld(seed);
    for (let i = 0; i < ticks && !w.over; i++) step(w, botInput(w));
    return fingerprint(w);
  },
};
