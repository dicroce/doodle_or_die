// Levels are plain data (JSON-compatible). A level editor only needs to read/write this shape.
//
// level: { name, w, h, start:{x,y}, finish:{x}, objects:[ ... ] }
// x/y are world pixels, y grows downward. Ground line is conventionally y=400.
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
//   checkpoint {x,y}                              y = ground line
//   text       {x,y,text,size?}                   handwritten hint
(function (root) {
  'use strict';
  const G = 400; // ground line
  const ground = (x, w) => ({ type: 'solid', x, y: G, w, h: 300 });

  const levels = [
    {
      name: 'Homeroom', w: 4600, h: 540,
      start: { x: 110, y: G }, finish: { x: 4460 },
      objects: [
        ground(0, 900), ground(1060, 700), ground(1940, 160), ground(2300, 1750), ground(4230, 370),
        { type: 'text', x: 150, y: 300, text: 'hold  →  to push', size: 30 },
        { type: 'text', x: 470, y: 290, text: 'SPACE = ollie', size: 30 },
        { type: 'text', x: 470, y: 322, text: '(hold it longer = higher)', size: 20 },
        { type: 'solid', x: 700, y: 372, w: 60, h: 28 },
        { type: 'text', x: 930, y: 300, text: 'mind the gap', size: 26 },
        { type: 'spikes', x: 1300, y: G - 22, w: 80, h: 22, facing: 'up' },
        { type: 'checkpoint', x: 1500, y: G },
        { type: 'ramp', x: 1640, y: 352, w: 120, h: 48, dir: 1 },
        { type: 'text', x: 1560, y: 280, text: 'ollie off the lip!', size: 24 },
        { type: 'lava', x: 2100, y: 412, w: 200, h: 130 },
        { type: 'checkpoint', x: 2400, y: G },
        { type: 'fan', x: 2520, y: 200, w: 200, h: 200, dir: 'up', power: 4200 },
        { type: 'spikes', x: 2440, y: 150, w: 360, h: 30, facing: 'down' },
        { type: 'text', x: 2470, y: 110, text: 'hmm, a fan...', size: 24 },
        { type: 'saw', x: 3040, y: G, r: 30, spin: 1 },
        { type: 'saw', x: 3320, y: 378, r: 26, path: { dx: 190, dy: 0, period: 2.6 } },
        { type: 'checkpoint', x: 3600, y: G },
        { type: 'pendulum', x: 3830, y: 110, len: 250, amp: 50, period: 2.6, r: 24 },
        { type: 'grinder', x: 4140, y: 424, r: 40 },
      ],
    },
    {
      name: 'Study Hall', w: 4700, h: 540,
      start: { x: 110, y: G }, finish: { x: 4560 },
      objects: [
        ground(0, 2300), ground(3010, 640), ground(3650, 1050),
        { type: 'text', x: 220, y: 300, text: 'no way past that... or is there?', size: 26 },
        { type: 'spikes', x: 660, y: G - 24, w: 540, h: 24, facing: 'up' },
        { type: 'spring', x: 560, y: G - 14, w: 56 },
        { type: 'solid', x: 840, y: 290, w: 480, h: 24 },
        { type: 'checkpoint', x: 1420, y: G },
        { type: 'crusher', x: 1620, y: 150, w: 90, h: 100, drop: 150, period: 3.0, phase: 0 },
        { type: 'crusher', x: 1830, y: 150, w: 90, h: 100, drop: 150, period: 3.0, phase: 0.33 },
        { type: 'crusher', x: 2040, y: 150, w: 90, h: 100, drop: 150, period: 3.0, phase: 0.66 },
        { type: 'checkpoint', x: 2210, y: G },
        { type: 'lava', x: 2300, y: 412, w: 710, h: 130 },
        { type: 'crumble', x: 2320, y: G, w: 90, h: 40 },
        { type: 'crumble', x: 2470, y: G, w: 90, h: 40 },
        { type: 'crumble', x: 2620, y: G, w: 90, h: 40 },
        { type: 'crumble', x: 2770, y: G, w: 90, h: 40 },
        { type: 'crumble', x: 2920, y: G, w: 90, h: 40 },
        { type: 'checkpoint', x: 3100, y: G },
        { type: 'fan', x: 3380, y: 200, w: 300, h: 200, dir: 'left', power: 450 },
        { type: 'text', x: 3330, y: 150, text: 'headwind!', size: 26 },
        { type: 'pendulum', x: 3900, y: 100, len: 260, amp: 55, period: 2.4, phase: 0, r: 24 },
        { type: 'pendulum', x: 4120, y: 100, len: 260, amp: 55, period: 2.4, phase: 0.5, r: 24 },
      ],
    },
    {
      name: 'Detention', w: 4400, h: 540,
      start: { x: 110, y: G }, finish: { x: 4300 },
      objects: [
        ground(0, 520), ground(1160, 540), ground(1900, 550), ground(2950, 550), ground(3700, 700),
        { type: 'ramp', x: 380, y: 340, w: 140, h: 60, dir: 1 },
        { type: 'solid', x: 520, y: 340, w: 640, h: 260 },
        { type: 'text', x: 560, y: 250, text: 'the floor bites back', size: 24 },
        { type: 'saw', x: 760, y: 352, r: 26, path: { dx: 0, dy: -120, period: 2.4 } },
        { type: 'saw', x: 980, y: 352, r: 26, path: { dx: 0, dy: -120, period: 2.4, phase: 0.5 } },
        { type: 'checkpoint', x: 1260, y: G },
        { type: 'fan', x: 1380, y: 220, w: 320, h: 180, dir: 'right', power: 700 },
        { type: 'spikes', x: 1940, y: G - 24, w: 60, h: 24, facing: 'up' },
        { type: 'checkpoint', x: 2100, y: G },
        { type: 'spring', x: 2300, y: G - 14, w: 56 },
        { type: 'lava', x: 2450, y: 412, w: 500, h: 130 },
        { type: 'solid', x: 2560, y: 250, w: 140, h: 24 },
        { type: 'solid', x: 2790, y: 250, w: 150, h: 24 },
        { type: 'spikes', x: 2620, y: 100, w: 340, h: 30, facing: 'down' },
        { type: 'text', x: 2540, y: 190, text: 'small hops only', size: 22 },
        { type: 'checkpoint', x: 3050, y: G },
        { type: 'grinder', x: 3600, y: 424, r: 40 },
        { type: 'crusher', x: 3850, y: 150, w: 100, h: 100, drop: 150, period: 2.8, phase: 0 },
        { type: 'crusher', x: 4030, y: 150, w: 100, h: 100, drop: 150, period: 2.8, phase: 0.5 },
      ],
    },
  ];

  root.DOD = root.DOD || {};
  root.DOD.levels = levels;
  if (typeof module !== 'undefined') module.exports = levels;
})(typeof window !== 'undefined' ? window : globalThis);
