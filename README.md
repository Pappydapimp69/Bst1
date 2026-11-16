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

# Seen

A proof of concept for a second-person game, in `seen/`. A prisoner crosses
twelve rooms before dawn, one of three doors each. The tower cannot see the
rooms: it models only the person playing, from what they did in each situation
before and whether they hesitated, and seals a guess at their door before every
choice. A right guess costs hours. It names a door aloud, sometimes truthfully.
At the end it says what it has learned about you and that it is the game itself.

    npm run serve        # then open /seen/ at the address it prints

`seen/tests/sim.test.mjs` is the design check: a player choosing by chance is
seen one room in three and escapes about seven nights in ten, while every
habitual player (always the short door, stay-or-shift, obeying or defying the
named door) is seen in most rooms and almost never escapes.
