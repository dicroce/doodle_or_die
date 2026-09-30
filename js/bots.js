// Rival skaters: computer-controlled players that attempt the same page at the same time (and often fail).
//
// Each rival owns a private copy of the world (so crumbling platforms/checkpoints don't affect anyone else),
// stepped in lock-step so time-based traps (crushers, pendulums, saws) line up for everybody.
// Brain: follow a route of waypoints; every 0.1-0.2s try a handful of actions in a scratch copy of the
// world (look-ahead), pick the one that survives and gets closest to the next waypoint. Weaker rivals
// look less far ahead, sometimes act on stale info, and make blunders, so they fail in fun ways.
(function (root) {
  'use strict';
  const D = root.DOD;

  // ---- route planning (shared with test/solve.js) ----
  let HZ = []; // x-ranges swept by moving hazards: never park a waypoint inside one
  function hazardRanges(lv) {
    return lv.objects.flatMap((o) => {
      if (o.type === 'pendulum') { const r = o.len * Math.sin(o.amp * Math.PI / 180) + (o.r || 22) + 40; return [[o.x - r, o.x + r]]; }
      if (o.type === 'saw') return [[o.x - o.r - 40, o.x + o.r + 40 + Math.max(0, (o.path && o.path.dx) || 0)]];
      if (o.type === 'spikes') return [[o.x - 35, o.x + o.w + 35]];
      if (o.type === 'crusher') return [[o.x - 40, o.x + o.w + 40]];
      if (o.type === 'grinder') return [[o.x - o.r * 2 - 40, o.x + o.r * 2 + 40]];
      return [];
    });
  }
  function densify(wp, x0, x1, Y, d, tag, cutsRow) {
    const bad = HZ.concat((cutsRow || []).map(([a, b]) => [a - 30, b + 30]));
    for (let x = x0 + d * 250; d * (x1 - x) > 120; x += d * 250) if (!bad.some(([a, b]) => x > a && x < b)) wp.push({ x, y: Y, tag: tag + ' run', dir: d });
  }
  // Route of {x,y,tag,dir}: row entries, far side of each gap, stair steps, finish. Needs level.meta (see sheet()).
  function route(lv) {
    const { rows, gap, step, cuts } = lv.meta, Y0 = lv.start.y, wp = [];
    HZ = hazardRanges(lv);
    for (let i = 0; i < rows; i++) {
      const d = i % 2 === 0 ? 1 : -1, Y = Y0 - gap * i, push = (x, y, tag) => wp.push({ x, y, tag, dir: d });
      if (i === 0) push(lv.start.x + 60, Y, 'row0 start'); else push(d > 0 ? 195 : 1075, Y, `row${i} arrival`);
      const gaps = (cuts[i] || []).slice().sort((a, b) => d * (a[0] - b[0]));
      let cx = wp[wp.length - 1].x;
      for (const [c0, c1] of gaps) { const fx = d > 0 ? c1 + 30 : c0 - 30; densify(wp, cx, fx, Y, d, `row${i}`, cuts[i]); push(fx, Y, `row${i} past gap ${c0}-${c1}`); cx = fx; }
      if (i < rows - 1) {
        densify(wp, cx, d > 0 ? 1090 : 230, Y, d, `row${i}`, cuts[i]);
        if (d > 0) { push(1150, Y - step, `row${i} stair1`); push(1235, Y - 2 * step, `row${i} stair2`); }
        else { push(130, Y - step, `row${i} stair1`); push(50, Y - 2 * step, `row${i} stair2`); }
      } else push(lv.finish.x, lv.finish.y, 'FINISH');
    }
    return wp;
  }
  const reached = (p, g) => p.grounded && Math.abs(p.x - g.x) < 28 && Math.abs(p.y - g.y) < 8;

  // ---- rivals ----
  // A candidate plan: do `pre` (+1 toward the target, 0 coast, -1 back) for `wait` steps, then optionally
  // jump (holding `h` seconds), then keep rolling toward the target. `wait` lets a rival plan
  // "roll a bit, then ollie" or "hold still until the crusher lifts".
  const PLANS = [{ pre: 1, wait: 0, h: 0 }];
  for (const w of [0.15, 0.3, 0.5, 0.75]) PLANS.push({ pre: 0, wait: w, h: 0 });
  for (const w of [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4]) for (const h of [0.06, 0.5]) PLANS.push({ pre: 1, wait: w, h, jump: true });
  PLANS.push({ pre: 0, wait: 0, h: 0.5, jump: true }); // standing ollie (stairs)
  const CAST = [
    { name: 'Chad', color: '#2b6fd6', skill: 0.55, look: 1.3, every: 0.1 },
    { name: 'Tina', color: '#1f9a55', skill: 0.45, look: 1.1, every: 0.1 },
    { name: 'Big Mike', color: '#8a3fc4', skill: 0.36, look: 0.9, every: 0.15 },
    { name: 'Dizzy', color: '#e07a1a', skill: 0.25, look: 0.65, every: 0.2 },
  ];
  const RDT = 1 / 60; // rollout step

  function create(level, count) {
    if (!level.meta) return [];
    const wp = route(level), bots = [];
    for (let i = 0; i < Math.min(count, CAST.length); i++) {
      bots.push({
        ...CAST[i], wp, w: D.build(level), idx: 0, startDelay: 0.8 + i * 1.7, clock: 0, nextDecide: i * 0.03, // staggered so rivals don't all think on the same frame
       
        holdT: 0, blunder: 0, act: { f: 1, j: 0, h: 0 }, finishes: 0, resetT: 0, dirSign: 1, needResync: true, bestDist: 1e9, stuckT: 0,
      });
    }
    return bots;
  }

  // Simulate a plan in a scratch copy of the world and score how it turns out.
  function rollout(b, plan, tgt, ds) {
    const w = structuredClone(b.w); w.events = [];
    const inp = w.input, steps = Math.round(b.look / RDT), waitSteps = Math.round(plan.wait / RDT);
    let hold = b.holdT;
    for (let k = 0; k < steps; k++) {
      const f = k < waitSteps ? plan.pre : 1;
      inp.right = ds * f > 0; inp.left = ds * f < 0;
      if (plan.jump && k === waitSteps) { inp.jumpPressed = true; hold = plan.h; }
      inp.jump = hold > 0; hold = Math.max(0, hold - RDT);
      D.step(w, RDT);
      const p = w.player;
      if (w.finished) return 1e6 - k;
      if (p.dead) return -1e5 + k * 50;                    // dying later beats dying sooner
      if (reached(p, tgt)) return 1e4 - k * 20;
    }
    const p = w.player;
    return -(Math.abs(p.x - tgt.x) + 3 * Math.abs(p.y - tgt.y)) - (p.grounded ? 0 : 25);
  }

  // Keep the target waypoint sensible: advance when reached, and re-route after falling to a lower row.
  function retarget(b) {
    const p = b.w.player, wp = b.wp;
    while (b.idx < wp.length - 1 && reached(p, wp[b.idx])) b.idx++;
    if (p.grounded && (b.needResync || p.y - wp[b.idx].y > 60)) {
      b.needResync = false;
      let pick = -1;
      for (let i = 0; i < wp.length; i++) if (Math.abs(wp[i].y - p.y) < 8 && wp[i].dir * (wp[i].x - p.x) > -25) { pick = i; break; }
      if (pick < 0) { let bd = 1e9; wp.forEach((q, i) => { const d = Math.abs(q.x - p.x) + 3 * Math.abs(q.y - p.y); if (d < bd) { bd = d; pick = i; } }); }
      b.idx = pick;
    }
  }

  function decide(b) {
    const p = b.w.player;
    retarget(b);
    const tgt = b.wp[b.idx];
    b.dirSign = Math.abs(tgt.x - p.x) < 6 ? 0 : Math.sign(tgt.x - p.x);
    const err = 1 - b.skill;
    // impatience: no progress toward the target for a while -> stop thinking and just go for it
    const dist = Math.abs(p.x - tgt.x) + 3 * Math.abs(p.y - tgt.y);
    if (dist < b.bestDist - 12 || b.idx !== b.lastIdx) { b.bestDist = dist; b.stuckT = 0; } else b.stuckT += b.every;
    b.lastIdx = b.idx;
    if (b.stuckT > 2.6) { b.stuckT = 0; b.blunder = 2; b.act = { f: b.dirSign || 1, j: 1, h: Math.random() < 0.6 ? 0.5 : 0.06 }; b.act.f = 1; return; }
    if (b.blunder > 0) { b.blunder--; return; }                              // still doing something dumb
    if (Math.random() < err * 0.22) {                                        // a blunder: do something dumb for a moment
      b.blunder = 1 + (Math.random() * 3 | 0);
      b.act = [{ f: 1, j: 1, h: 0.5 }, { f: 0, j: 0, h: 0 }, { f: -1, j: 0, h: 0 }, { f: 1, j: 1, h: 0.06 }][Math.random() * 4 | 0];
      return;
    }
    if (Math.random() < err * 0.1) { b.blunder = 3 + (Math.random() * 4 | 0); b.act = { f: 1, j: 0, h: 0 }; return; } // tunnel vision: just roll, ignore the traps
    if (Math.random() < err * 0.25) return;                                 // reaction lapse: keep doing what it was doing
    if (b.dirSign === 0) { b.act = { f: 0, j: 0, h: 0 }; return; }
    let best = -1e18, pick = null;
    for (const pl of PLANS) { const sc = rollout(b, pl, tgt, b.dirSign); if (sc > best) { best = sc; pick = pl; } }
    // act on the first step of the winning plan; later steps get re-planned next tick
    if (pick.wait === 0 && pick.jump) b.act = { f: pick.pre, j: 1, h: pick.h };
    else b.act = { f: pick.wait > 0 ? pick.pre : 1, j: 0, h: 0 };
  }

  // Advance every rival by dt. `on.die(b, e)` is called when a rival dies (visual splat only).
  function step(bots, dt, on) {
    for (const b of bots) {
      const w = b.w, p = w.player, inp = w.input;
      b.clock += dt;
      if (b.clock >= b.startDelay && !p.dead && !w.finished) {
        b.nextDecide -= dt;
        if (b.nextDecide <= 0) {
          decide(b); b.nextDecide = b.every;
          if (b.act.j && (p.grounded || p.coyote > 0)) { inp.jumpPressed = true; b.holdT = b.act.h; }
        }
        inp.right = b.dirSign * b.act.f > 0; inp.left = b.dirSign * b.act.f < 0;
        inp.jump = b.holdT > 0; b.holdT = Math.max(0, b.holdT - dt);
        if (b.act.j) b.act = { ...b.act, j: 0 }; // a jump press is consumed once
      } else { inp.right = inp.left = inp.jump = false; }
      D.step(w, dt);
      for (const e of w.events) if (e.type === 'die' && on && on.die) on.die(b, e);
      w.events.length = 0;
      if (p.dead && p.deadT > 1.1) { D.respawn(w); b.blunder = 0; b.holdT = 0; b.idx = 0; b.needResync = true; b.bestDist = 1e9; b.act = { f: 1, j: 0, h: 0 }; b.nextDecide = 0; }
      if (w.finished) { // celebrate briefly, then go again from the top
        b.resetT += dt;
        if (b.resetT > 1.6) {
          b.resetT = 0; b.finishes++; w.finished = false;
          w.spawn = { x: w.level.start.x, y: w.level.start.y, vx: 0 };
          for (const c of w.checks) c.hit = false;
          const dth = w.deaths; D.respawn(w); w.deaths = dth; b.idx = 0; b.needResync = true; b.bestDist = 1e9; b.act = { f: 1, j: 0, h: 0 };
          if (on && on.finish) on.finish(b);
        }
      }
    }
  }

  root.DOD.Bots = { create, step, route, CAST };
})(typeof window !== 'undefined' ? window : globalThis);
