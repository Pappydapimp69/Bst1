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

The castle outlasts a run. A finished ring stays standing, and the next run
adds another (the keep, a curtain wall, towers, a second keep, an outer wall),
each lower on the beach so the tide reaches it sooner. Lose and the tide takes
the ring in progress and knocks down the newest one standing.

The crab starts with no shell. Once a run a bigger empty one washes up, with a
wild crab waiting by it: reach it with empty claws and it is yours. The first
one simply becomes your home; after that each find runs a vacancy chain, as
real hermit crabs do: your old shell goes to your biggest guard, each guard
takes the shell left by the one ahead, and the smallest shell left over houses
one new crab for your garrison. Gulls sometimes raid the castle while you are far from
it; a guard takes as many pecks as its shell is big before it is stunned, then
the thief steals from the tier being built until you chase it off. A stinging
anemone, found now and then near the water, takes a place in your load and arms
a guard, and a gull that pecks an armed guard is stung off the beach for a
while. Lose a run and the crabs living in the ring that falls are lost with it.

    npm run serve        # then open /crab/ at the address it prints
    npm run tournament   # every habit of play over the same seeds

The tournament is the design check: it is tuned, and pinned by a test, so that
no fixed habit such as always carrying three wins, and reading the sky does. A
throw-a-shell-as-a-lure button was built and cut because the tournament showed
it was never the better choice.
