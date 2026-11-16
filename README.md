# Glowmoth

A small browser game. You are a moth in a dark meadow and your light is burning
down. Gather the glowing pollen to keep it, and stay clear of the bats that hunt
it. The bats come in waves that build and then scatter; your light burns faster
each wave, so every run ends and leaves a score to beat.

Fly by holding the mouse toward where you want to go, dragging a thumb anywhere
on a touch screen, with the arrow keys or WASD, or with a controller's left stick or d-pad. M mutes the sound.

## Run it

    npm run serve      # then open the address it prints
    npm test           # the simulation, in Node
    npm run play       # the real page, in a headless browser
    npm run balance    # how long an idle, a flailing and a skilled player last

There is nothing to install or build: the page loads `src/main.js` as a module.

## How it is put together

`src/sim.js` is the whole game as a pure simulation on a fixed tick, with seeded
random streams from `src/rng.js`; the same seed and inputs give the same run in
Node and in a browser. Everything else (`loop`, `input`, `camera`, `render`,
`audio`, `save`) is the browser around it. `src/bot.js` is a player good enough
to calibrate the balance against.

# Crab Castle

A second game on the same engine, in `crab/`. A crab carries shells up the
beach to build a sandcastle before the tide reaches it, and unlike Glowmoth it
can be won. The whole game turns on how many shells to carry at once: each one
builds the castle faster, but slows the crab, makes it a bigger target, brings
the gulls down sooner, and is lost with the rest if a gull connects. Gulls only
trouble a crab that is carrying, and they scatter each time a tier is finished.

    npm run serve        # then open /crab/ at the address it prints
    npm run tournament   # every habit of play over the same seeds

The tournament is the design check: it is tuned, and pinned by a test, so that
no fixed habit such as always carrying three wins, and reading the sky does. A
throw-a-shell-as-a-lure button was built and cut because the tournament showed
it was never the better choice.

# Hare and Hounds

A third game, in `hare/`, built to test lessons bs held only as research. A
hare must nibble two clover patches in a hedged meadow and get back to its form
before dawn, while three hounds hunt it by lantern light. The hunt horn gives
the hare's place away on a fixed count, the way Scotland Yard surfaces Mr. X.

    npm run serve   # then open /hare/ at the address it prints
    npm run hunt    # how often a capable hare gets home, with and without the horn

What the tests settle:

- Sight uses Albert Ford's symmetric shadowcasting, and the test checks every
  pair of floor tiles on several maps: none sees one way only, while a plain
  Bresenham line breaks symmetry on over a thousand pairs. So the amber glow
  the page draws around a hound you can see is exactly where it can see you.
- Maps are built as Bob Nystrom's rooms and mazes, and the test shows the
  reopen chance is what makes alternative routes: a spanning tree alone leaves
  about a third of the meadow as chokepoints, a 12 percent reopen chance
  leaves about four percent.
- Hidden movement is the hare's defence: unrevealed, the test hare gets home
  over a quarter of the time; with the horn, under half as often. Whether the
  horn's spacing is a fine balance dial, as Scotland Yard's schedule suggests,
  is not settled: these hounds do no better with the hare always in view than
  with a horn every 24 turns, which says more about the hounds than the lesson.
