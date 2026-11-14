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
