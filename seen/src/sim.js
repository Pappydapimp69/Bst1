// Seen: a second-person game. You cross twelve rooms before dawn, choosing one
// of three doors in each. The tower knows nothing about the rooms that you do
// not: it only models you. Before every choice it seals a guess at your door;
// if the guess is right you are seen and held, which costs hours. The whole
// game is a pure function of the seed, the model it starts with and the picks.
import { makeStream, next } from '../../src/rng.js';

export const ROOMS = 12;
export const HOURS = 29;   // dawn: tuned by tests/sim.test.mjs so chance play escapes a little over half the time
export const SHORT = 1;    // hours through the short door
export const LONG = 2;     // hours through either long door
export const HELD = 2;     // hours lost each time the tower's sealed guess was your door
export const HONEST = 0.5; // how often the door the tower names is the door it expects

// What the tower keeps about one person: counts of what they did in each
// situation, and how far each way of reading them has earned trust.
export function newModel() {
  return { v: 1, runs: 0, escapes: 0, rooms: 0, hits: 0, tables: {}, weights: {} };
}

// Each expert reads one aspect of a door (where it is, whether it is the short
// one, whether the tower named it, how far it is from the last door) in one
// situation. `ctx` returns the situation as a string, or null if it has none yet.
const last = (h) => h[h.length - 1];
const EXPERTS = [
  { name: 'pos',        aspect: 'pos',   ctx: () => '' },
  { name: 'posAfter',   aspect: 'pos',   ctx: (h) => (h.length ? 'p' + last(h).pick : null) },
  { name: 'shift',      aspect: 'shift', ctx: (h) => (h.length ? (last(h).seen ? 'seen' : 'free') : null) },
  { name: 'short',      aspect: 'short', ctx: () => '' },
  { name: 'shortAfter', aspect: 'short', ctx: (h) => (h.length ? (last(h).short === last(h).pick ? 's' : 'l') + (last(h).seen ? 'seen' : 'free') : null) },
  { name: 'shortRun',   aspect: 'short', ctx: (h) => (h.length > 1 ? h.slice(-2).map((r) => (r.short === r.pick ? 's' : 'l')).join('') : null) },
  { name: 'shortTempo', aspect: 'short', ctx: (h) => (h.length ? (last(h).slow ? 'slow' : 'fast') : null) },
  { name: 'shortClock', aspect: 'short', ctx: (h, s) => (s.hours + (ROOMS - s.room) * 1.6 > HOURS ? 'late' : 'early') },
  { name: 'named',      aspect: 'named', ctx: () => '' },
  { name: 'namedAfter', aspect: 'named', ctx: (h) => (h.length ? (last(h).pick === last(h).claim ? 'took' : 'left') + (last(h).claim === last(h).sealed ? 'true' : 'lie') : null) },
];
const USES_CLAIM = (e) => e.aspect === 'named';
const ETA = 1.5;

// The value of an aspect for door d, and how many of the three doors share it.
function aspectOf(e, d, s, claim) {
  const h = s.history;
  if (e.aspect === 'pos') return [d, 1];
  if (e.aspect === 'shift') return [(d - last(h).pick + 3) % 3, 1];
  if (e.aspect === 'short') return d === s.short ? ['y', 1] : ['n', 2];
  return d === claim ? ['y', 1] : ['n', 2];
}
const SIZE = { pos: 3, shift: 3, short: 2, named: 2 };

// One expert's probability for each door, from its counts with one imagined
// observation spread over the outcomes so nothing is ever impossible.
function expertDoors(model, e, s, claim) {
  const c = e.ctx(s.history, s);
  if (c === null) return null;
  const row = model.tables[e.name + '|' + c] || {};
  let n = 0;
  for (const k in row) n += row[k];
  const out = [0, 0, 0];
  for (let d = 0; d < 3; d++) {
    const [val, share] = aspectOf(e, d, s, claim);
    out[d] = ((row[val] || 0) + 1 / SIZE[e.aspect]) / (n + 1) / share;
  }
  return out;
}

function mixture(model, s, claim) {
  const out = [0, 0, 0];
  let total = 0;
  for (const e of EXPERTS) {
    if (claim === null && USES_CLAIM(e)) continue;
    const p = expertDoors(model, e, s, claim);
    if (!p) continue;
    const w = model.weights[e.name] ?? 1;
    total += w;
    for (let d = 0; d < 3; d++) out[d] += w * p[d];
  }
  return out.map((x) => x / total);
}

function argmax(p, rng) {
  let best = [0];
  for (let d = 1; d < 3; d++) {
    if (p[d] > p[best[0]] + 1e-12) best = [d];
    else if (Math.abs(p[d] - p[best[0]]) <= 1e-12) best.push(d);
  }
  return best[Math.floor(next(rng) * best.length)];
}

export function createRun(seed, model = newModel()) {
  const s = {
    seed: String(seed), rooms: makeStream(seed, 'rooms'), tower: makeStream(seed, 'tower'),
    room: 0, hours: 0, seen: 0, status: 'play', history: [], model,
    short: 0, claim: 0, sealed: 0,
  };
  enterRoom(s);
  return s;
}

// The tower names a door aloud, then seals its real guess, both before the pick.
function enterRoom(s) {
  s.short = Math.floor(next(s.rooms) * 3);
  const first = argmax(mixture(s.model, s, null), s.tower);
  s.claim = next(s.tower) < HONEST ? first : (first + 1 + Math.floor(next(s.tower) * 2)) % 3;
  s.sealed = argmax(mixture(s.model, s, s.claim), s.tower);
}

// Take door `pick` (0 left, 1 middle, 2 right). `slow` is whether the real
// person hesitated before choosing; it is the one thing here the character
// in the room does not have.
export function step(s, pick, slow = false) {
  if (s.status !== 'play' || !(pick >= 0 && pick < 3)) return null;
  const m = s.model;
  // Learn: move trust toward the experts that expected this door, then count it.
  let sum = 0;
  const grown = {};
  for (const e of EXPERTS) {
    const p = expertDoors(m, e, s, s.claim);
    if (!p) continue;
    grown[e.name] = (m.weights[e.name] ?? 1) * Math.pow(p[pick] * 3, ETA);
    sum += grown[e.name];
  }
  const names = Object.keys(grown);
  for (const k of names) m.weights[k] = Math.max(0.02, grown[k] * names.length / sum);
  for (const e of EXPERTS) {
    const c = e.ctx(s.history, s);
    if (c === null) continue;
    const key = e.name + '|' + c;
    const [val] = aspectOf(e, pick, s, s.claim);
    (m.tables[key] ||= {})[val] = (m.tables[key][val] || 0) + 1;
  }
  const seen = pick === s.sealed;
  const cost = (pick === s.short ? SHORT : LONG) + (seen ? HELD : 0);
  const entry = { room: s.room, short: s.short, claim: s.claim, sealed: s.sealed, pick, seen, slow: !!slow, cost };
  s.history.push(entry);
  s.hours += cost;
  if (seen) { s.seen += 1; m.hits += 1; }
  m.rooms += 1;
  s.room += 1;
  if (s.hours > HOURS) s.status = 'dawn';
  else if (s.room >= ROOMS) s.status = 'escaped';
  if (s.status === 'play') enterRoom(s);
  else { m.runs += 1; if (s.status === 'escaped') m.escapes += 1; }
  return entry;
}

// The habits the tower would say aloud: situations it has seen at least
// `min` times in which you did the same thing at least `sure` of the time.
export const DOOR = ['left', 'middle', 'right'];
const WORDS = {
  pos: (c, v) => `You take the ${DOOR[v]} door`,
  posAfter: (c, v) => `After the ${DOOR[c[1]]} door you take the ${DOOR[v]} one`,
  shift: (c, v) => `After I ${c === 'seen' ? 'see' : 'miss'} you, you ${v === '0' ? 'take the same door again' : 'change doors'}`,
  short: (c, v) => `You take the ${v === 'y' ? 'short' : 'long'} way`,
  shortAfter: (c, v) => `After a ${c[0] === 's' ? 'short' : 'long'} door that I ${c.endsWith('seen') ? 'saw' : 'missed'}, you take the ${v === 'y' ? 'short' : 'long'} way`,
  shortRun: (c, v) => `After ${c === 'ss' ? 'two short doors' : c === 'll' ? 'two long doors' : c === 'sl' ? 'short then long' : 'long then short'}, you go ${v === 'y' ? 'short' : 'long'}`,
  shortTempo: (c, v) => `When you ${c === 'slow' ? 'hesitate' : 'choose quickly'}, your next door is the ${v === 'y' ? 'short' : 'long'} way`,
  shortClock: (c, v) => `When dawn is ${c === 'late' ? 'close' : 'far'}, you take the ${v === 'y' ? 'short' : 'long'} way`,
  named: (c, v) => `You ${v === 'y' ? 'take' : 'avoid'} the door I name`,
  namedAfter: (c, v) => `After you ${c.startsWith('took') ? 'took' : 'refused'} my door and I had ${c.endsWith('true') ? 'told the truth' : 'lied'}, you ${v === 'y' ? 'take' : 'avoid'} the door I name`,
};
export function habits(model, { min = 5, sure = 0.7, most = 3 } = {}) {
  const found = [];
  for (const key in model.tables) {
    const [name, c] = key.split('|');
    const row = model.tables[key];
    let n = 0;
    for (const k in row) n += row[k];
    if (n < min) continue;
    for (const v in row) {
      let count = row[v], value = v;
      // "Change doors" is the two shifted outcomes together.
      if (name === 'shift' && v !== '0') { if (v === '2' && row['1']) continue; count = (row['1'] || 0) + (row['2'] || 0); value = '1'; }
      const chance = name === 'pos' || name === 'posAfter' ? 1 / 3 : name === 'shift' ? (value === '0' ? 1 / 3 : 2 / 3) : value === 'y' ? 1 / 3 : 2 / 3;
      const rate = count / n;
      if (rate < sure || rate - chance < 0.2) continue;
      found.push({ text: WORDS[name](c, value), count, n, lift: rate - chance, aspect: EXPERTS.find((e) => e.name === name).aspect });
    }
  }
  // Strongest first, and one habit for each kind of thing it reads, so the
  // same habit is not said three ways.
  found.sort((a, b) => b.lift * Math.sqrt(b.n) - a.lift * Math.sqrt(a.n));
  const kinds = new Set();
  return found.filter((f) => !kinds.has(f.aspect) && kinds.add(f.aspect)).slice(0, most);
}
