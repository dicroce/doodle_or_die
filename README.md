# Doodle or Die

A side-view skateboard platformer drawn on notebook paper. Stick figure, ballpoint pen, and a path lined with
lava, spikes, fans, saws, meat grinders and other things a bored kid would draw in class.

**Play:** open `index.html` in a browser (no build, no server needed). Works on phones too (on-screen buttons appear on first touch).

| Key | Action |
|---|---|
| ← → / A D | push / brake |
| Space / ↑ / W / Z | ollie (hold = higher, tap = short hop) |
| R | retry from checkpoint |
| M | mute |
| 1-3 (title) | pick a page |

## Layout
- `js/sim.js` – physics + traps, pure logic (no DOM). **All ollie/feel constants live in `C` at the top.**
- `js/levels.js` – levels as plain data; the object catalogue is documented at the top of the file.
- `js/render.js` – pen-sketch rendering, stick figure IK, death ragdoll.
- `js/main.js` – loop, input (keyboard + multitouch), synthesized audio, camera, HUD.
- `test/feel.js` – headless numbers for ollie height / gap distance. `test/solve.js` – beam-search bot that proves
  each level is beatable (`XB=25 VB=120 node test/solve.js [levelIndex] [beamWidth]`).

Custom level: `index.html?level=my.json` loads a JSON file in the same shape as an entry in `levels.js`
(needs to be served over http). Dev: `?l=2&x=2500` starts level 2 with the player teleported to x=2500.
