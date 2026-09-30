# Doodle or Die

A side-view skateboard platformer drawn on a single sheet of notebook paper: the whole level fits on one page (no scrolling),
and you switchback up it by ollieing onto higher platforms, past lava, spikes, fans, saws, meat grinders and other things a
bored kid would draw in class. Fall off a higher row and you land on the one below, so mistakes cost progress.

**Play:** open `index.html` in a browser (no build, no server needed). Works on phones too (on-screen buttons appear on first touch).

| Key | Action |
|---|---|
| ← → / A D | push / brake |
| Space / ↑ / W / Z | ollie (hold = higher, tap = short hop) |
| R | retry from checkpoint |
| B | rivals on/off |
| M | mute |
| 1-3 (title) | pick a page |

## Layout
- `js/sim.js` – physics + traps, pure logic (no DOM). **All ollie/feel constants live in `C` at the top.**
- `js/levels.js` – levels as plain data; the object catalogue is documented at the top of the file.
- `js/render.js` – pen-sketch rendering, stick figure IK, death ragdoll.
- `js/bots.js` – rival skaters (Chad, Tina, Big Mike, Dizzy): each plays the page in its own copy of the world using a small
  look-ahead planner plus deliberate blunders, so they fail a lot. They splat visually but never shake the screen or make sound.
- `js/main.js` – loop, input (keyboard + multitouch), synthesized audio, camera, HUD.
- `test/feel.js` – headless numbers for ollie height / gap distance. `test/solve.js` – waypoint bot that proves each level
  is beatable, and names the waypoint it gets stuck at if not (`node test/solve.js [levelIndex] [beamWidth]`).
  `test/bots.js [seconds]` reports how often each rival dies / finishes.

Level authoring: `sheet()` in `levels.js` generates the switchback rows/stairs; anything (incl. hand-placed solids) is just objects.
Custom level: `index.html?level=my.json` loads a JSON file in the same shape as an entry in `levels.js`
(needs to be served over http). Dev: `?l=2&ff=20` fast-forwards 20s of play (rivals included); `?x=300&y=660` teleports the player.
