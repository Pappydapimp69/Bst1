// The page around the simulation: it shows the room, times how long the real
// person takes to choose, and keeps the tower's model of them on this device.
import { createRun, step, newModel, habits, DOOR, ROOMS, HOURS, SHORT, LONG, HELD } from './sim.js';
import { createStore } from '../../src/save.js';

const store = createStore('bst1.seen.');
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const pause = params.has('fast') ? 0 : 1700;   // how long an opened seal stays on screen
let model = store.load('model.v1', null) || newModel();
let run = null, mode = 'title', shownAt = 0, locked = false, runCount = 0;

// The tower speaks about "the prisoner" until it has watched a few rooms, then
// turns to "you": by then what it says is about the person, not the character.
const knowsYou = () => model.rooms >= 4;

function showRoom() {
  const doors = document.querySelectorAll('.door');
  doors.forEach((el, d) => {
    el.className = 'door' + (d === run.short ? ' short' : '') + (d === run.claim ? ' named' : '');
    el.querySelector('.hours').textContent = (d === run.short ? SHORT + ' hour' : LONG + ' hours');
    el.disabled = false;
  });
  $('room').textContent = `Room ${run.room + 1} of ${ROOMS}`;
  $('left').textContent = `${Math.max(0, HOURS - run.hours)} h to dawn`;
  $('dawn').style.width = Math.min(100, (run.hours / HOURS) * 100) + '%';
  $('pupil').style.transform = `translateX(${(run.claim - 1) * 7}px)`;
  $('say').innerHTML = `${knowsYou() ? 'You' : 'The prisoner'} will take the <b>${DOOR[run.claim]}</b> door.`;
  $('note').className = '';
  $('note').textContent = run.room === 0 ? 'My guess is already sealed. Choose a door.' : '';
  locked = false;
  shownAt = performance.now();
}

function choose(d) {
  if (mode !== 'play' || locked) return;
  locked = true;
  // Slow means slow for this person: longer than one and a half times their own usual.
  const took = performance.now() - shownAt;
  const t = (model.tempo ||= { n: 0, sum: 0 });
  const slow = t.n >= 3 && took > 1.5 * (t.sum / t.n);
  t.n += 1; t.sum += Math.min(took, 20000);
  const before = habits(model, { most: 1 })[0];
  const e = step(run, d, slow);
  store.save('model.v1', model);
  document.querySelectorAll('.door').forEach((el, i) => {
    el.disabled = true;
    el.classList.toggle('picked', i === e.pick);
    el.classList.toggle('sealed', i === e.sealed);
  });
  $('tower').classList.toggle('blink', !e.seen);
  $('dawn').style.width = Math.min(100, (run.hours / HOURS) * 100) + '%';
  $('left').textContent = `${Math.max(0, HOURS - run.hours)} h to dawn`;
  const you = knowsYou();
  const lied = e.claim !== e.sealed ? ` I named another to move ${you ? 'you' : 'them'}.` : '';
  $('note').className = e.seen ? 'seen' : 'free';
  $('note').textContent = e.seen
    ? `I sealed the ${DOOR[e.sealed]} door.${lied} I saw ${you ? 'you' : 'the prisoner'}: ${HELD} hours held.${before && you ? ' ' + before.text + '.' : ''}`
    : `I sealed the ${DOOR[e.sealed]} door.${lied} ${you ? 'You' : 'The prisoner'} went ${DOOR[e.pick]}, past me.`;
  setTimeout(() => { $('tower').classList.remove('blink'); run.status === 'play' ? showRoom() : finish(); }, pause);
}

function finish() {
  mode = 'over';
  runCount += 1;
  const h = run.history, seen = run.seen, escaped = run.status === 'escaped';
  const known = habits(model);
  const rate = Math.round((model.hits / model.rooms) * 100);
  $('play').hidden = true;
  $('card').hidden = false;
  $('title').textContent = escaped ? 'Out before dawn' : 'Dawn';
  $('title').className = escaped ? 'escaped' : 'dawn';
  $('body').innerHTML = `
    <p>${escaped ? `You crossed all ${ROOMS} rooms with ${HOURS - run.hours} hours to spare.` : `The light came up in room ${h.length} of ${ROOMS}.`}
    I had sealed your door in ${seen} of ${h.length} rooms; guessing blind would get about ${Math.round(h.length / 3)}.</p>
    <div id="marks" role="img" aria-label="Rooms where the sealed guess was your door">${h.map((r) => `<i class="${r.seen ? 'seen' : 'free'}" title="Room ${r.room + 1}: sealed ${DOOR[r.sealed]}, you took ${DOOR[r.pick]}"></i>`).join('')}</div>
    <h2>What I know about you</h2>
    ${known.length ? `<ul id="habits">${known.map((k) => `<li>${k.text}. <span>${k.count} times in ${k.n}</span></li>`).join('')}</ul>`
      : `<p>Nothing I can use yet. ${model.rooms < 20 ? 'I have not watched you long.' : 'You are hard to read.'}</p>`}
    <p id="truth">There is no one in the tower. It is this game, and it was never watching the prisoner: it has kept what you did in ${model.rooms} rooms over ${model.runs} ${model.runs === 1 ? 'night' : 'nights'},
    on this device only, and has guessed ${rate}% of your doors. Each guess was fixed before you chose.</p>`;
  $('go').textContent = 'Another night';
  $('forget').hidden = false;
  $('go').focus();
}

function title() {
  mode = 'title';
  $('play').hidden = true;
  $('card').hidden = false;
  $('title').textContent = 'Seen';
  $('title').className = '';
  $('body').innerHTML = `<p>Twelve rooms stand between a prisoner and the wall, and dawn is ${HOURS} hours off. Each room has three doors: the lit one takes ${SHORT} hour, the others ${LONG}.</p>
    <p>The tower cannot see into the rooms. Before each choice it seals one guess at the door, and names a door aloud, which may or may not be the one it sealed. If the sealed door is the one taken, the prisoner is held for ${HELD} hours.</p>
    ${model.runs ? `<p id="truth">I remember you: ${model.runs} ${model.runs === 1 ? 'night' : 'nights'}, ${model.rooms} rooms.</p>` : ''}`;
  $('go').textContent = 'Begin';
  $('forget').hidden = !model.runs;
}

function begin() {
  const seed = params.get('seed') ? params.get('seed') + ':' + runCount : String(Date.now());
  run = createRun(seed, model);
  mode = 'play';
  $('card').hidden = true;
  $('play').hidden = false;
  showRoom();
}

$('go').addEventListener('click', begin);
$('forget').addEventListener('click', () => { model = newModel(); store.save('model.v1', model); title(); });
document.querySelectorAll('.door').forEach((el) => el.addEventListener('click', () => choose(Number(el.dataset.door))));
addEventListener('keydown', (ev) => {
  if (ev.repeat || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const d = { 1: 0, 2: 1, 3: 2, ArrowLeft: 0, ArrowDown: 1, ArrowUp: 1, ArrowRight: 2 }[ev.key];
  if (mode === 'play' && d !== undefined) { ev.preventDefault(); choose(d); }
  else if (mode !== 'play' && (ev.key === 'Enter' || ev.key === ' ') && document.activeElement?.tagName !== 'BUTTON') { ev.preventDefault(); begin(); }
});

title();
window.__game = { get mode() { return mode; }, get locked() { return locked; }, state: () => run, model: () => model };
