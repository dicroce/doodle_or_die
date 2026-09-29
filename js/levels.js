// Levels are plain data (JSON-compatible). A level editor only needs to read/write this shape.
//
// level: { name, w, h, start:{x,y}, finish:{x,y}, objects:[ ... ] }
// The whole level is one notebook page (nominally 1280x720) shown without scrolling; y grows downward.
// start.y / finish.y are the surface heights (feet) the skater stands on there.
//
// object types:
//   solid      {x,y,w,h}                          rect you can stand on / bonk into
//   ramp       {x,y,w,h,dir}                      y = TOP of ramp, dir 1 = high on the right, -1 = high on the left
//   spikes     {x,y,w,h,facing}                   facing: up|down|left|right (points that way)
//   lava       {x,y,w,h}
//   saw        {x,y,r,teeth?, spin?, path?:{dx,dy,period,phase}}    circle centre x,y; path oscillates by (dx,dy)
//   grinder    {x,y,r}                            two meshed counter-rotating gears centred on x
//   pendulum   {x,y,len,amp,period,phase?,r?}     pivot x,y; amp in degrees
//   crusher    {x,y,w,h,drop,period,phase?}       y = resting top; slams down by `drop`
//   fan        {x,y,w,h,dir,power}                wind zone; dir: up|down|left|right
//   crumble    {x,y,w,h,delay?}                   solid that falls away after you touch it
//   spring     {x,y,w,power?}                     bouncy pad (sits on the surface at y)
//   checkpoint {x,y}                              y = surface; triggers when the skater is near it
//   text       {x,y,text,size?}                   handwritten hint
//
// `sheet()` below is only an authoring shortcut that generates the "switchback climb" geometry (rows of
// platforms joined by ollie-able steps). It outputs ordinary objects; the runtime only ever sees data.
(function (root) {
  'use strict';
  const W = 1280, H = 720, Y0 = 660;

  // rows: number of platform rows. Row 0 is the thick ground, rows alternate heading right / left.
  // gap: vertical spacing between rows. step: height of each of the two stairs at a turn.
  // cuts: {row: [[x0,x1],...]} holes cut out of a row (pits / gaps).
  function sheet(name, { rows, gap, step, cuts = {}, extras = [] }) {
    const Y = (i) => Y0 - gap * i, T = 20;
    const objs = [{ type: 'solid', x: -100, y: -400, w: 100, h: 1500 }, { type: 'solid', x: W, y: -400, w: 100, h: 1500 }];
    const seg = (i, x0, x1) => { // a row platform with its cuts removed
      let parts = [[x0, x1]];
      for (const [c0, c1] of cuts[i] || []) {
        parts = parts.flatMap(([a, b]) => (c1 <= a || c0 >= b) ? [[a, b]] : [[a, Math.max(a, c0)], [Math.min(b, c1), b]].filter(p => p[1] - p[0] > 0));
      }
      for (const [a, b] of parts) objs.push({ type: 'solid', x: a, y: Y(i), w: b - a, h: i === 0 ? 200 : T });
    };
    for (let i = 0; i < rows; i++) {
      const last = i === rows - 1;
      const left = i === 0 ? 0 : (i % 2 === 0 ? 160 : 0);
      const right = i === 0 ? W : (i % 2 === 0 ? (last ? 1240 : 1180) : 1120); // odd rows stop short so the stairs below have open sky
      seg(i, left, right);
      if (!last) {
        if (i % 2 === 0) { // right-hand stairs up to the next row
          objs.push({ type: 'solid', x: 1120, y: Y(i) - step, w: 60, h: step });
          objs.push({ type: 'solid', x: 1180, y: Y(i) - 2 * step, w: 100, h: 2 * step + (i === 0 ? 0 : T) });
        } else { // left-hand stairs
          objs.push({ type: 'solid', x: 100, y: Y(i) - step, w: 60, h: step });
          objs.push({ type: 'solid', x: 0, y: Y(i) - 2 * step, w: 100, h: 2 * step });
        }
      }
    }
    const lastRow = rows - 1;
    const fin = { x: lastRow % 2 ? 110 : 1150, y: Y(lastRow) };
    // meta is authoring/test info only (the solver bot uses it to plot a route); the game ignores it
    return { name, w: W, h: H, start: { x: 110, y: Y0 }, finish: fin, meta: { rows, gap, step, cuts }, objects: objs.concat(extras) };
  }

  const g1 = 150, Y1 = (i) => Y0 - g1 * i;
  const level1 = sheet('Page One', {
    rows: 4, gap: g1, step: 50,
    cuts: { 0: [[640, 780]], 1: [[560, 700]], 2: [[760, 900]] },
    extras: [
      { type: 'text', x: 200, y: 610, text: 'hold  →  to push', size: 30 },
      { type: 'text', x: 200, y: 578, text: 'SPACE = ollie', size: 26 },
      { type: 'spikes', x: 420, y: Y1(0) - 22, w: 70, h: 22, facing: 'up' },
      { type: 'lava', x: 640, y: 672, w: 140, h: 48 },
      { type: 'saw', x: 950, y: Y1(0), r: 26 },
      { type: 'text', x: 880, y: 590, text: 'ollie up the stairs!', size: 22 },
      // row 1 (heading left)
      { type: 'checkpoint', x: 1060, y: Y1(1) },
      { type: 'pendulum', x: 900, y: Y1(2) + 20, len: 100, amp: 50, period: 2.4, r: 20 },
      { type: 'spikes', x: 380, y: Y1(1) - 22, w: 60, h: 22, facing: 'up' },
      // row 2 (heading right)
      { type: 'checkpoint', x: 210, y: Y1(2) },
      { type: 'fan', x: 420, y: 230, w: 120, h: 130, dir: 'up', power: 3400 },
      { type: 'spikes', x: 400, y: 230, w: 160, h: 24, facing: 'down' },
      { type: 'text', x: 250, y: 330, text: 'hmm, a fan...', size: 22 },
      { type: 'grinder', x: 830, y: 386, r: 32 },
      // row 3 (heading left)
      { type: 'checkpoint', x: 1060, y: Y1(3) },
      { type: 'crusher', x: 850, y: 40, w: 90, h: 80, drop: 90, period: 3.0 },
      { type: 'saw', x: 420, y: Y1(3) - 20, r: 22, path: { dx: 150, dy: 0, period: 2.6 } },
      { type: 'spikes', x: 250, y: Y1(3) - 22, w: 50, h: 22, facing: 'up' },
    ],
  });

  const g2 = 130, Y2 = (i) => Y0 - g2 * i;
  const level2 = sheet('Switchback', {
    rows: 5, gap: g2, step: 43,
    cuts: { 0: [[560, 700]], 1: [[500, 840]], 2: [[700, 840]], 3: [[540, 640]] },
    extras: [
      { type: 'text', x: 200, y: 600, text: 'five floors to go...', size: 26 },
      { type: 'spikes', x: 350, y: Y2(0) - 22, w: 50, h: 22, facing: 'up' },
      { type: 'lava', x: 560, y: 672, w: 140, h: 48 },
      { type: 'saw', x: 900, y: Y2(0), r: 26 },
      // row 1 (left): crumbling bridge
      { type: 'checkpoint', x: 1060, y: Y2(1) },
      { type: 'crumble', x: 760, y: Y2(1), w: 80, h: 20, delay: 0.3 },
      { type: 'crumble', x: 630, y: Y2(1), w: 80, h: 20, delay: 0.3 },
      { type: 'crumble', x: 500, y: Y2(1), w: 80, h: 20, delay: 0.3 },
      // row 2 (right): headwind gap
      { type: 'checkpoint', x: 210, y: Y2(2) },
      { type: 'fan', x: 600, y: 290, w: 260, h: 110, dir: 'left', power: 450 },
      { type: 'spikes', x: 380, y: Y2(2) - 22, w: 60, h: 22, facing: 'up' },
      { type: 'text', x: 640, y: 440, text: 'headwind!', size: 22 },
      // row 3 (left): pendulum + grinder
      { type: 'checkpoint', x: 1060, y: Y2(3) },
      { type: 'pendulum', x: 900, y: Y2(4) + 20, len: 90, amp: 55, period: 2.3, r: 20 },
      { type: 'grinder', x: 590, y: Y2(3) + 22, r: 28 },
      // row 4 (right): the finish
      { type: 'checkpoint', x: 210, y: Y2(4) },
      { type: 'spikes', x: 400, y: Y2(4) - 22, w: 60, h: 22, facing: 'up' },
      { type: 'saw', x: 640, y: Y2(4) - 20, r: 22, path: { dx: 140, dy: 0, period: 2.4 } },
    ],
  });

  const g3 = 150, Y3 = (i) => Y0 - g3 * i;
  const level3 = sheet('Final Exam', {
    rows: 4, gap: g3, step: 50,
    cuts: { 0: [[560, 700]], 1: [[420, 720]], 2: [[640, 780]] },
    extras: [
      { type: 'saw', x: 300, y: Y3(0) - 20, r: 22, path: { dx: 180, dy: 0, period: 2.6 } },
      { type: 'lava', x: 560, y: 672, w: 140, h: 48 },
      { type: 'spikes', x: 745, y: Y3(0) - 22, w: 60, h: 22, facing: 'up' },
      { type: 'saw', x: 950, y: Y3(0) + 12, r: 26, path: { dx: 0, dy: -90, period: 2.4 } },
      // row 1 (left)
      { type: 'checkpoint', x: 1060, y: Y3(1) },
      { type: 'crumble', x: 620, y: Y3(1), w: 90, h: 20, delay: 0.3 },
      { type: 'crumble', x: 520, y: Y3(1), w: 90, h: 20, delay: 0.3 },
      { type: 'crumble', x: 420, y: Y3(1), w: 90, h: 20, delay: 0.3 },
      { type: 'spikes', x: 300, y: Y3(1) - 22, w: 50, h: 22, facing: 'up' },
      // row 2 (right)
      { type: 'checkpoint', x: 210, y: Y3(2) },
      { type: 'fan', x: 300, y: 230, w: 120, h: 130, dir: 'up', power: 3400 },
      { type: 'spikes', x: 280, y: 230, w: 160, h: 24, facing: 'down' },
      { type: 'grinder', x: 710, y: 384, r: 32 },
      { type: 'pendulum', x: 1000, y: Y3(3) + 20, len: 100, amp: 50, period: 2.4, r: 20 },
      // row 3 (left)
      { type: 'checkpoint', x: 1060, y: Y3(3) },
      { type: 'crusher', x: 900, y: 40, w: 90, h: 80, drop: 90, period: 2.8, phase: 0 },
      { type: 'crusher', x: 660, y: 40, w: 90, h: 80, drop: 90, period: 2.8, phase: 0.5 },
      { type: 'saw', x: 300, y: Y3(3) - 20, r: 22, path: { dx: 140, dy: 0, period: 2.4 } },
    ],
  });

  root.DOD = root.DOD || {};
  root.DOD.levels = [level1, level2, level3];
  if (typeof module !== 'undefined') module.exports = root.DOD.levels;
})(typeof window !== 'undefined' ? window : globalThis);
