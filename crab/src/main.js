import { C, UPGRADES, RINGS, createWorld, step, tideAt, fingerprint } from './sim.js';
import { makeBot } from './bot.js';
import { createLoop } from '../../src/loop.js';
import { createHold, bindInput } from '../../src/input.js';
import { createAudio } from '../../src/audio.js';
import { createStore } from '../../src/save.js';
import { createRenderer } from './render.js';

const $ = (id) => document.getElementById(id);
const store = createStore('bst1.crabcastle.');
const fixedSeed = new URLSearchParams(location.search).get('seed');
const newSeed = () => fixedSeed || Date.now().toString(36);

const canvas = $('game');
const renderer = createRenderer(canvas);
const hold = createHold();
const audio = createAudio({ muted: store.load('muted', false) });
// Calm motion follows the system setting until the player chooses otherwise.
let calm = store.load('calm', matchMedia('(prefers-reduced-motion: reduce)').matches);
// Shells banked from past runs and the upgrades bought with them. Versioned,
// so a later change to its shape starts clean instead of misreading it.
const META_V = 1;
let meta = store.load('meta', null);
if (!meta || meta.v !== META_V) meta = { v: META_V, bank: 0, up: {} };
// The castle itself: how many rings stand, how many whole castles are done,
// and the most seconds to spare on each ring.
meta.rings = Math.max(0, Math.min(RINGS.length, meta.rings | 0));
meta.castles |= 0;
if (!Array.isArray(meta.best)) meta.best = [];
// The crab's home shell, its garrison and anemones waiting for a guard.
meta.shell = Math.max(0, meta.shell | 0);            // a new crab has no shell yet
if (!Array.isArray(meta.crabs)) meta.crabs = [];
meta.spare |= 0;
// Broad back became the home shell: hand back what was spent on it.
if (meta.up.back) { meta.bank += [25, 50, 100].slice(0, meta.up.back).reduce((a, b) => a + b, 0); delete meta.up.back; }
const saveMeta = () => store.save('meta', meta);
let shopOpen = false;

const complete = () => meta.rings >= RINGS.length;
const newWorld = () => createWorld(newSeed(), meta.up, complete() ? RINGS.length - 1 : meta.rings, { shell: meta.shell, guards: meta.crabs, spare: meta.spare });
let world = newWorld();
let mode = 'title', endAt = 0, time = 0, freeze = 0;
let crabScreen = { x: innerWidth / 2, y: innerHeight / 2 };

// A pentatonic run that climbs an octave every six notes, so a load of any
// size has a note for every shell in it.
const NOTES = [392, 440, 494, 587, 659, 784];
const note = (i) => NOTES[i % NOTES.length] * 2 ** Math.floor(i / NOTES.length);
function sound(e) {
  if (e.type === 'pick') audio.tone('triangle', note(e.carry - 1), note(e.carry - 1) * 1.02, 0.11, 0.4);
  else if (e.type === 'build') for (let i = 0; i < e.n; i++) audio.tone('triangle', note(i) * 1.5, note(i) * 1.5, 0.14, 0.4, i * 0.06);
  else if (e.type === 'tier') [523, 659, 784, 1047].forEach((f, i) => audio.tone('square', f, f, 0.18, 0.22, i * 0.09));
  else if (e.type === 'wind') { audio.tone('sawtooth', 1150, 760, 0.12, 0.2); audio.tone('sawtooth', 1150, 700, 0.14, 0.2, 0.16); }
  else if (e.type === 'dive') audio.tone('square', 820, 260, 0.2, 0.14);
  else if (e.type === 'hit') { audio.tone('sawtooth', 210, 55, 0.32, 0.6); audio.tone('triangle', 620, 180, 0.25, 0.3, 0.04); }
  else if (e.type === 'miss') audio.tone('sine', 300, 190, 0.12, 0.18);
  else if (e.type === 'tide') audio.tone('sine', 98, 147, 0.7, 0.35);
  else if (e.type === 'won') [523, 659, 784, 1047, 1319].forEach((f, i) => audio.tone('triangle', f, f, 0.3, 0.4, i * 0.11));
  else if (e.type === 'peck') audio.tone('square', 1400, 900, 0.05, 0.2);
  else if (e.type === 'steal') audio.tone('sawtooth', 520, 260, 0.16, 0.3);
  else if (e.type === 'shoo') audio.tone('triangle', 300, 700, 0.15, 0.35);
  else if (e.type === 'sting') { audio.tone('sawtooth', 1600, 300, 0.25, 0.3); audio.tone('square', 1200, 200, 0.2, 0.2, 0.08); }
  else if (e.type === 'chain') [392, 523, 659, 784].forEach((f, i) => audio.tone('sine', f, f, 0.2, 0.35, i * 0.08));
  else if (e.type === 'vacancy' || e.type === 'anemonewash') audio.tone('sine', 880, 1320, 0.25, 0.3);
  else if (e.type === 'anemone' || e.type === 'arm') audio.tone('triangle', 740, 1110, 0.18, 0.35);
  else if (e.type === 'lost') [392, 330, 262, 196].forEach((f, i) => audio.tone('triangle', f, f * 0.94, 0.34, 0.4, i * 0.16));
}

function begin() {
  // A new run is a new world, made before anything is shown.
  if (complete()) { meta.castles++; meta.rings = 0; saveMeta(); }   // a finished castle: start the next on bare sand
  world = newWorld();
  renderer.clear();
  freeze = 0;
  mode = 'play';
  $('overlay').hidden = true;
  hud();
}

function hud() {
  $('count').textContent = `${world.built} / ${C.NEED}`;
  $('ringname').textContent = complete() ? 'Castle complete' : `Ring ${world.ring + 1} of ${RINGS.length}: ${RINGS[world.ring].name}`;
  const armed = world.guards.filter((g) => g.armed).length;
  $('garrison').textContent = `${world.shell ? `Shell size ${world.shell}` : 'No shell yet'} · ${world.guards.length} guard${world.guards.length === 1 ? '' : 's'}${armed ? `, ${armed} armed` : ''}`;
  const u = tideAt(world).u;
  $('tide').style.width = `${Math.round(u * 100)}%`;
  $('bar').classList.toggle('close', u > 0.75 && world.phase === 'play');
}

function banner(text) {
  const b = $('banner');
  b.textContent = text;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}

function titleCard() {
  const n = meta.rings;
  $('title').textContent = 'Crab Castle';
  $('line').textContent = complete()
    ? `Your castle is complete, all ${RINGS.length} rings of it. Build the next one from bare sand.`
    : n === 0
      ? 'Carry shells up the beach and finish the keep before the tide reaches it. The more you carry, the more the gulls want it.'
      : `${n} ring${n > 1 ? 's' : ''} of your castle still stand${n > 1 ? '' : 's'}. Next is ${RINGS[n].name}, lower on the beach, where the tide comes sooner. Lose and the tide knocks down your newest ring.`;
}

function finish(title, line) {
  mode = 'end'; endAt = performance.now();
  // What the crab takes home: its shell, its garrison and spare anemones.
  meta.shell = world.shell; meta.spare = world.spare;
  meta.crabs = world.guards.map((g) => ({ size: g.size, armed: g.armed, home: g.home }));
  // Every shell that reached the castle is banked, win or lose.
  meta.bank += world.built; saveMeta();
  line += ` ${world.built} shell${world.built === 1 ? '' : 's'} banked for the shop.`;
  $('banner').classList.remove('show');
  $('title').textContent = title;
  $('line').textContent = line;
  $('hint').textContent = input.touch ? 'Tap to build again' : 'Press a key, a button, or click to build again';
  $('overlay').hidden = false;
}

// The touch path, from screen points to beach coordinates.
const toWorld = (p) => { const v = renderer.view; return { x: (p.x - v.ox) / v.scale, y: (p.y - v.oy) / v.scale }; };
function followPath() {
  const path = input.path, c = world.crab;
  while (path.length) {
    const w = toWorld(path[0]), dx = w.x - c.x, dy = w.y - c.y, d = Math.hypot(dx, dy);
    if (d < 8) { path.shift(); continue; }
    hold.set('touch', dx / d, dy / d);
    return;
  }
  hold.release('touch');
}

function tick() {
  if (mode !== 'play') return;
  input.refresh();
  followPath();
  step(world, hold.vector());
  for (const e of world.events) {
    renderer.onEvent(e, calm);
    sound(e);
    if (e.type === 'hit' && !calm) freeze = 0.09;      // a held frame; the simulation never pauses
    else if (e.type === 'wind') { input.clearPath(); hold.release('touch'); }   // the crab stops: get out of the ring
    else if (e.type === 'tide') banner('The tide is coming in');
    else if (e.type === 'vacancy') banner('A big empty shell washed up');
    else if (e.type === 'chain') banner(!e.joined ? 'A shell of your own' : e.grew ? (e.moved ? 'Everyone moves up, and a new crab joins' : 'A new crab moves into your old shell') : 'Your garrison moves up, and a new crab joins');
    else if (e.type === 'chainlost') banner('Another crab took the shell');
    else if (e.type === 'anemonewash') banner('An anemone washed up');
    else if (e.type === 'arm') banner(e.id ? 'A guard takes up the anemone' : 'The anemone waits for a guard');
    else if (e.type === 'perch') banner('A gull is robbing your castle!');
    else if (e.type === 'sting') banner('Stung! The gull flies off');
    else if (e.type === 'tier') banner(e.tier === 1 ? 'Here come the gulls' : e.tier === C.TIERS - 1 ? 'One tier to go' : 'The gulls scatter');
    else if (e.type === 'won') {
      const spare = Math.floor(e.spare * C.TICK), r = world.ring, best = meta.best[r];
      const beaten = best == null || spare > best;
      if (beaten) meta.best[r] = spare;
      meta.rings = r + 1;
      finish(complete() ? 'The castle is complete' : RINGS[r].stands,
        `Finished with ${spare} seconds to spare.${beaten ? ' Your best on this ring yet.' : ` Your best here is ${best}.`}${complete() ? '' : ` Next is ${RINGS[r + 1].name}, lower down the beach.`}`);
    } else if (e.type === 'lost') {
      const r = world.ring, fell = r > 0 ? RINGS[r - 1].name : null;
      meta.rings = Math.max(0, r - 1);
      // The crabs living in the ring that fell are lost with it.
      const before = world.guards.length;
      if (fell) world.guards = world.guards.filter((g) => g.home !== r - 1);
      const gone = before - world.guards.length;
      finish('The tide took it', `${e.built} of ${C.NEED} shells of ${RINGS[r].name} were in place.${fell ? ` The sea knocked down ${fell} as well` : ''}${gone ? `, and ${gone} crab${gone > 1 ? 's' : ''} living there with it.` : fell ? '.' : ''}`);
    }
  }
  hud();
}

const loop = createLoop({
  dt: C.TICK,
  step: tick,
  render(alpha, frameDt) {
    input.pollPad();
    if (freeze > 0) { freeze -= frameDt; return; }
    time += frameDt;
    crabScreen = renderer.draw(world, mode === 'play' ? alpha : 1, time, frameDt, { calm, stick: input.stick, playing: mode === 'play', path: input.path.map(toWorld) });
  },
});

const input = bindInput(canvas, hold, {
  mothOnScreen: () => crabScreen,
  onGesture(source, code) {
    audio.unlock();
    if (code === 'KeyM') return toggleSound();
    if (shopOpen) return;
    if (mode === 'title') begin();
    else if (mode === 'end' && performance.now() - endAt > 700) begin();
  },
  touchPath: true,
  onTouch() {
    if (mode === 'title') $('hint').textContent = 'Tap where to go, or draw the way';
  },
});

function toggleSound() {
  audio.setMuted(!audio.muted);
  store.save('muted', audio.muted);
  labels();
}
function labels() {
  $('sound').textContent = audio.muted ? 'Sound off' : 'Sound on';
  $('sound').setAttribute('aria-pressed', String(!audio.muted));
  $('motion').textContent = calm ? 'Motion calm' : 'Motion full';
  $('motion').setAttribute('aria-pressed', String(calm));
}
$('sound').addEventListener('click', (e) => { audio.unlock(); toggleSound(); e.currentTarget.blur(); });
$('motion').addEventListener('click', (e) => { calm = !calm; store.save('calm', calm); labels(); e.currentTarget.blur(); });
labels(); titleCard(); hud();

// The shop: open from the title or end card, never during a run.
function renderShop() {
  $('bank').textContent = `${meta.bank} shells`;
  const list = $('upgrades');
  list.replaceChildren();
  for (const u of UPGRADES) {
    const lv = meta.up[u.id] | 0, cost = u.cost[lv];
    const row = document.createElement('li');
    row.innerHTML = `<div class="u-text"><b></b><span></span></div><div class="pips" aria-label="Level ${lv} of 3">${'<i class="on"></i>'.repeat(lv)}${'<i></i>'.repeat(3 - lv)}</div><button type="button"></button>`;
    row.querySelector('b').textContent = u.name;
    row.querySelector('span').textContent = u.what;
    const btn = row.querySelector('button');
    if (cost === undefined) { btn.textContent = 'Maxed'; btn.disabled = true; }
    else {
      btn.textContent = `Buy · ${cost}`;
      btn.disabled = meta.bank < cost;
      btn.addEventListener('click', () => {
        if (meta.bank < cost) return;
        meta.bank -= cost; meta.up[u.id] = lv + 1; saveMeta();
        audio.tone('triangle', 660, 990, 0.18, 0.4);
        renderShop();
      });
    }
    list.append(row);
  }
}
function openShop(open) {
  shopOpen = open;
  $('shop').hidden = !open;
  $('card').hidden = open;
  if (open) { renderShop(); $('shopclose').focus(); }
}
$('shopbtn').addEventListener('click', (e) => { audio.unlock(); openShop(true); e.stopPropagation(); });
$('shopclose').addEventListener('click', (e) => { openShop(false); e.stopPropagation(); });
addEventListener('keydown', (e) => { if (shopOpen && e.code === 'Escape') openShop(false); });

// The next frame is asked for first, so one thrown error costs a frame, not the game.
requestAnimationFrame(function frame(now) { requestAnimationFrame(frame); loop.frame(now); });

// For tests: the game's own tick and state, so nothing has to wait on a clock.
window.__game = {
  get tick() { return world.tick; },
  get mode() { return mode; },
  get touch() { return input.touch; },
  get seen() { return hold.seen; },
  get audio() { return audio.state; },
  get calm() { return calm; },
  get meta() { return JSON.parse(JSON.stringify(meta)); },
  hold,
  state: () => JSON.parse(JSON.stringify(world)),
  view: () => ({ ...renderer.view }),
  stepBy: (n) => loop.stepBy(n),
  resume: () => loop.resume(),
  // Play on from here with a bot, by hand-stepped ticks, until the run ends.
  autoplay(policy, maxTicks = 60 * 60 * 6) {
    const bot = makeBot(policy);
    for (let i = 0; i < maxTicks && mode === 'play'; i++) { const v = bot(world); hold.set('bot', v.x, v.y); loop.stepBy(1); }
    hold.release('bot');
    return world.phase;
  },
  replay(seed, ticks) {
    const w = createWorld(seed), bot = makeBot();
    for (let i = 0; i < ticks && w.phase !== 'won' && w.phase !== 'lost'; i++) step(w, bot(w));
    return fingerprint(w);
  },
};
