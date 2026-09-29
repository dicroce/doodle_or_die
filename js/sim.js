// Doodle or Die - simulation. Pure logic, no DOM, so it can run headless in Node for tests.
// World units are pixels, y grows downward. The player's (x, y) is (center, feet/wheel-bottom).
(function (root) {
  'use strict';

  // ---- Feel constants. Tweak these first when chasing the perfect ollie. ----
  const C = {
    GRAV: 2300,
    FALL_GRAV_MUL: 1.12,   // snappier descent than ascent
    MAX_FALL: 1100,
    MAX_SPEED: 430,
    PUSH_ACCEL: 900,
    BRAKE: 1500,           // holding against your motion
    ROLL_DRAG: 70,         // coasting friction: momentum should feel real
    OVER_DRAG: 350,        // bleed speed above MAX_SPEED (ramps, fans)
    AIR_ACCEL: 520,
    JUMP_V: 760,           // ollie pop velocity  (~125px high)
    JUMP_CUT: 0.42,        // releasing early scales upward velocity by this (short ollie)
    APEX_BAND: 130,        // |vy| below this while holding jump = hang time
    APEX_GRAV: 0.62,
    COYOTE: 0.09,
    BUFFER: 0.12,
    HALF_W: 13,
    H: 46,
    SUPPORT: 10,           // how far the board can overhang a ledge and still be supported
    RAMP_G: 0.42,          // fraction of gravity felt along ramps
    SPRING_V: 1050,
    STEP_UP: 5,            // grounded curb step
    LEDGE_FORGIVE: 10,     // airborne corner correction
  };
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ---- geometry helpers ----
  function rampY(r, x) {
    const u = clamp((x - r.x) / r.w, 0, 1);
    return r.dir === 1 ? r.y + r.h * (1 - u) : r.y + r.h * u;
  }
  function rampSlope(r) { return (r.dir === 1 ? -1 : 1) * r.h / r.w; } // dy/dx, y-down
  function sawPos(h, t) {
    if (!h.path) return { x: h.x, y: h.y };
    const u = 0.5 - 0.5 * Math.cos(TAU * (t / h.path.period + (h.path.phase || 0)));
    return { x: h.x + h.path.dx * u, y: h.y + h.path.dy * u };
  }
  function bobPos(h, t) {
    const th = (h.amp * Math.PI / 180) * Math.sin(TAU * (t / h.period + (h.phase || 0)));
    return { x: h.x + h.len * Math.sin(th), y: h.y + h.len * Math.cos(th), th };
  }
  // Crusher cycle: rest -> shake (telegraph) -> slam -> hold -> rise
  function crusherState(h, t) {
    const T = h.period || 3;
    const u = (((t / T) + (h.phase || 0)) % 1 + 1) % 1;
    if (u < 0.45) return { off: 0, shake: 0 };
    if (u < 0.6) return { off: 0, shake: (u - 0.45) / 0.15 };
    if (u < 0.66) { const k = (u - 0.6) / 0.06; return { off: h.drop * k * k, shake: 0 }; }
    if (u < 0.8) return { off: h.drop, shake: 0 };
    const k = (u - 0.8) / 0.2;
    return { off: h.drop * (1 - k * k * (3 - 2 * k)), shake: 0 };
  }
  function circleBox(cx, cy, r, b) {
    const dx = cx - clamp(cx, b.l, b.r), dy = cy - clamp(cy, b.t, b.b);
    return dx * dx + dy * dy < r * r;
  }
  const boxOverlap = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

  // ---- world construction from level data ----
  function build(level) {
    const w = {
      level, t: 0, clock: 0,
      solids: [], ramps: [], hazards: [], fans: [], springs: [], checks: [], texts: [],
      events: [], deaths: 0, finished: false,
      spawn: { x: level.start.x, y: level.start.y, vx: 0 },
      input: { left: false, right: false, jump: false, jumpPressed: false },
      player: null,
    };
    for (const o of level.objects) {
      switch (o.type) {
        case 'solid': w.solids.push({ ...o, active: true }); break;
        case 'crumble':
          w.solids.push({ ...o, active: true, crumble: true, state: 'idle', timer: 0, fy: 0, fvy: 0, delay: o.delay || 0.3 });
          break;
        case 'ramp': w.ramps.push({ ...o, dir: o.dir || 1 }); break;
        case 'spikes': case 'lava': case 'saw': case 'pendulum': case 'crusher':
          w.hazards.push({ ...o }); break;
        case 'grinder': { // two meshed counter-rotating gears
          const r = o.r || 40, s = 2 * r - 8;
          w.hazards.push({ type: 'saw', gear: true, x: o.x - s / 2, y: o.y, r, spin: 1, teeth: 12 });
          w.hazards.push({ type: 'saw', gear: true, x: o.x + s / 2, y: o.y, r, spin: -1, teeth: 12, off: Math.PI / 12 });
          break;
        }
        case 'fan': w.fans.push({ dir: 'up', power: 3800, ...o }); break;
        case 'spring': w.springs.push({ power: C.SPRING_V, h: 14, ...o, anim: 0, cool: 0 }); break;
        case 'checkpoint': w.checks.push({ ...o, hit: false }); break;
        case 'text': w.texts.push({ ...o }); break;
      }
    }
    respawn(w, true);
    return w;
  }

  function newPlayer(x, y, vx) {
    return {
      x, y, vx: vx || 0, vy: 0, grounded: true, surf: null, support: null,
      face: 1, coyote: 0, buffer: 0, jumping: false, cut: false, groundVy: 0,
      boardAng: 0, squash: 0, airT: 0, wheel: 0, pushing: false, pushPh: 0, popT: 9,
      dead: false, deadT: 0, cause: null, hitX: 0, hitY: 0,
    };
  }

  function respawn(w, first) {
    w.player = newPlayer(w.spawn.x, w.spawn.y, w.spawn.vx);
    for (const s of w.solids) if (s.crumble) { s.active = true; s.state = 'idle'; s.timer = 0; s.fy = 0; s.fvy = 0; }
    w.input.jumpPressed = false;
    if (!first) w.deaths++;
    if (!first) w.events.push({ type: 'respawn' });
  }

  function kill(w, cause, hx, hy) {
    const p = w.player;
    if (p.dead) return;
    p.dead = true; p.deadT = 0; p.cause = cause; p.hitX = hx; p.hitY = hy;
    w.events.push({ type: 'die', cause, x: p.x, y: p.y - 22 });
  }

  // ---- collision queries ----
  function findSupport(w, x, yMin, yMax) {
    let best = null;
    const S = C.SUPPORT;
    for (const s of w.solids) {
      if (!s.active) continue;
      if (x + S > s.x && x - S < s.x + s.w && s.y >= yMin && s.y <= yMax && (!best || s.y < best.y)) best = { y: s.y, solid: s };
    }
    for (const r of w.ramps) {
      if (x < r.x || x > r.x + r.w) continue;
      const y = rampY(r, x);
      if (y >= yMin && y <= yMax && (!best || y < best.y)) best = { y, ramp: r };
    }
    return best;
  }

  function resolveWalls(w, p) {
    const HW = C.HALF_W, H = C.H;
    for (const s of w.solids) {
      if (!s.active) continue;
      if (p.x + HW > s.x && p.x - HW < s.x + s.w && p.y > s.y + 0.75 && p.y - H < s.y + s.h) {
        const pen = p.y - s.y;
        if (pen <= (p.grounded ? C.STEP_UP : C.LEDGE_FORGIVE) && p.vy >= -C.JUMP_V * 1.5) {
          p.y = s.y; // curb step / ledge forgiveness
          continue;
        }
        const fromLeft = p.vx > 0 || (p.vx === 0 && p.x < s.x + s.w / 2);
        p.x = fromLeft ? s.x - HW : s.x + s.w + HW;
        if (Math.abs(p.vx) > 120) w.events.push({ type: 'bonk', x: p.x + (fromLeft ? HW : -HW), y: p.y - 20, speed: Math.abs(p.vx) });
        p.vx = 0;
      }
    }
    for (const r of w.ramps) { // the tall vertical face of a ramp is a wall
      if (r.dir === 1) {
        const hx = r.x + r.w;
        if (p.x > hx && p.x - HW < hx && p.y > r.y + 0.75 && p.y - H < r.y + r.h) { p.x = hx + HW; if (p.vx < 0) p.vx = 0; }
      } else if (p.x < r.x && p.x + HW > r.x && p.y > r.y + 0.75 && p.y - H < r.y + r.h) { p.x = r.x - HW; if (p.vx > 0) p.vx = 0; }
    }
  }

  function hazardHit(w, h, b) {
    switch (h.type) {
      case 'spikes': {
        let l = h.x + 2, r = h.x + h.w - 2, t = h.y, bt = h.y + h.h;
        const f = h.facing || 'up', k = 0.4;
        if (f === 'up') t = h.y + h.h * k; else if (f === 'down') bt = h.y + h.h * (1 - k);
        else if (f === 'left') r = h.x + h.w * (1 - k); else l = h.x + h.w * k;
        return boxOverlap(b, { l, r, t, b: bt });
      }
      case 'lava': return boxOverlap(b, { l: h.x, r: h.x + h.w, t: h.y + 6, b: h.y + h.h });
      case 'saw': { const q = sawPos(h, w.t); return circleBox(q.x, q.y, h.r - 4, b); }
      case 'pendulum': { const q = bobPos(h, w.t); return circleBox(q.x, q.y, (h.r || 22) - 3, b); }
      case 'crusher': {
        const off = crusherState(h, w.t).off;
        return boxOverlap(b, { l: h.x + 3, r: h.x + h.w - 3, t: h.y + off + 2, b: h.y + off + h.h });
      }
    }
    return false;
  }

  // ---- ollie ----
  function doOllie(w, p) {
    const gv = p.groundVy;
    p.vy = -C.JUMP_V + (gv < 0 ? gv : gv * 0.5); // ramps add launch; downhill takes a little off
    p.grounded = false; p.surf = null; p.support = null;
    p.coyote = 0; p.buffer = 0; p.jumping = true; p.cut = false; p.airT = 0; p.popT = 0;
    p.boardAng = 0.62; // tail snaps down, nose pops up: the visual "pop"
    w.events.push({ type: 'pop', x: p.x, y: p.y, speed: Math.abs(p.vx) });
  }

  function land(w, p, cand) {
    const impact = p.vy;
    p.y = cand.y; p.vy = 0; p.grounded = true;
    p.surf = cand.ramp || null; p.support = cand.solid || null;
    p.jumping = false; p.cut = false;
    if (impact > 220) p.squash = clamp(impact / 1000, 0.15, 1);
    w.events.push({ type: 'land', x: p.x, y: p.y, impact });
  }

  // ---- main player step ----
  function stepPlayer(w, dt) {
    const p = w.player, inp = w.input, HW = C.HALF_W, H = C.H;
    if (inp.jumpPressed) { p.buffer = C.BUFFER; inp.jumpPressed = false; } else p.buffer = Math.max(0, p.buffer - dt);
    p.coyote = p.grounded ? C.COYOTE : p.coyote - dt;
    p.popT += dt;
    p.squash = Math.max(0, p.squash - dt * 5);
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);

    // wind
    let windX = 0, windY = 0;
    const hb = { l: p.x - HW, r: p.x + HW, t: p.y - H, b: p.y };
    for (const f of w.fans) {
      if (!boxOverlap(hb, { l: f.x, r: f.x + f.w, t: f.y, b: f.y + f.h })) continue;
      if (f.dir === 'up' || f.dir === 'down') {
        const len = f.h, d = f.dir === 'up' ? (f.y + f.h) - (p.y - H / 2) : (p.y - H / 2) - f.y;
        const k = 1 - 0.6 * clamp(d / len, 0, 1);
        windY += (f.dir === 'up' ? -1 : 1) * f.power * k;
      } else {
        const len = f.w, d = f.dir === 'left' ? (f.x + f.w) - p.x : p.x - f.x;
        const k = 1 - 0.6 * clamp(d / len, 0, 1);
        windX += (f.dir === 'left' ? -1 : 1) * f.power * k;
      }
    }

    // horizontal
    if (p.grounded) {
      p.pushing = false;
      if (dir !== 0) {
        if (dir * p.vx < 0) p.vx += dir * C.BRAKE * dt;
        else if (Math.abs(p.vx) < C.MAX_SPEED) { p.vx = clamp(p.vx + dir * C.PUSH_ACCEL * dt, -C.MAX_SPEED, C.MAX_SPEED); p.pushing = true; }
      } else if (p.vx !== 0) {
        const d = C.ROLL_DRAG * dt;
        p.vx = Math.abs(p.vx) <= d ? 0 : p.vx - Math.sign(p.vx) * d;
      }
      if (Math.abs(p.vx) > C.MAX_SPEED) {
        const d = C.OVER_DRAG * dt; p.vx -= Math.sign(p.vx) * Math.min(d, Math.abs(p.vx) - C.MAX_SPEED);
      }
      if (p.surf) { const s = rampSlope(p.surf); p.vx += C.RAMP_G * C.GRAV * s / (1 + s * s) * dt; }
      p.vx += windX * dt;
      p.pushPh = p.pushing ? (p.pushPh + dt * 2.4) % 1 : 0;
    } else {
      p.pushing = false; p.pushPh = 0;
      if (dir !== 0 && dir * p.vx < C.MAX_SPEED * 1.1) p.vx += dir * C.AIR_ACCEL * dt;
      p.vx += windX * dt;
    }
    if (Math.abs(p.vx) > 40) p.face = p.vx > 0 ? 1 : -1; else if (dir !== 0) p.face = dir;

    // ollie
    if (p.grounded && windY < -C.GRAV) { // strong updraft peels you off the ground
      p.grounded = false; p.groundVy = 0; p.vy = -20; p.surf = null; p.support = null; p.jumping = false;
    }
    if (p.buffer > 0 && p.coyote > 0) doOllie(w, p);

    // vertical velocity
    if (!p.grounded) {
      if (p.jumping && !inp.jump && !p.cut && p.vy < 0) { p.vy *= C.JUMP_CUT; p.cut = true; }
      let g = C.GRAV;
      if (p.vy > 0) g *= C.FALL_GRAV_MUL;
      else if (inp.jump && Math.abs(p.vy) < C.APEX_BAND) g *= C.APEX_GRAV;
      p.vy += (g + windY) * dt;
      if (p.vy > C.MAX_FALL) p.vy = C.MAX_FALL;
      p.airT += dt;
    }

    // move + collide
    const px0 = p.x;
    p.x += p.vx * dt;
    p.wheel += p.vx * dt;
    resolveWalls(w, p);

    if (p.grounded) {
      const down = 3 + Math.abs(p.vx) * dt * 1.6;
      const s = findSupport(w, p.x, p.y - C.STEP_UP - 3, p.y + down);
      if (s) { p.y = s.y; p.surf = s.ramp || null; p.support = s.solid || null; p.groundVy = p.surf ? rampSlope(p.surf) * p.vx : 0; }
      else { // rolled off an edge (or the top of a ramp): keep the slope's momentum
        p.grounded = false; p.vy = p.groundVy; p.surf = null; p.support = null; p.airT = 0; p.jumping = false; p.cut = false;
      }
    } else {
      const py0 = p.y;
      p.y += p.vy * dt;
      if (p.vy < 0) { // bonk head
        for (const s of w.solids) {
          if (!s.active) continue;
          if (p.x + HW > s.x && p.x - HW < s.x + s.w && p.y - H < s.y + s.h && py0 - H >= s.y + s.h - 0.5) {
            p.y = s.y + s.h + H; p.vy = 0; p.cut = true;
            w.events.push({ type: 'bonk', x: p.x, y: p.y - H, speed: 200 });
          }
        }
      }
      let cand = null;
      for (const s of w.solids) {
        if (!s.active) continue;
        if (p.x + C.SUPPORT > s.x && p.x - C.SUPPORT < s.x + s.w && py0 <= s.y + 0.5 && p.y >= s.y && (!cand || s.y < cand.y)) cand = { y: s.y, solid: s };
      }
      for (const r of w.ramps) {
        if (p.x < r.x || p.x > r.x + r.w) continue;
        const sy = rampY(r, p.x), psy = rampY(r, px0);
        if (py0 <= psy + 0.5 && p.y >= sy && (!cand || sy < cand.y)) cand = { y: sy, ramp: r };
      }
      if (cand) land(w, p, cand);
    }

    // board pose target (the pop lives here)
    if (p.grounded) {
      const ang = p.surf ? Math.atan(-rampSlope(p.surf) * p.face) : 0;
      p.boardAng += (ang - p.boardAng) * Math.min(1, 30 * dt);
    } else {
      const target = clamp(-p.vy / C.JUMP_V, -0.4, 1) * 0.45;
      p.boardAng += (target - p.boardAng) * Math.min(1, 20 * dt);
    }

    // crumble triggers
    if (p.support && p.support.crumble && p.support.state === 'idle') { p.support.state = 'shake'; p.support.timer = p.support.delay; w.events.push({ type: 'crumble', x: p.x, y: p.y }); }

    // springs
    const box = { l: p.x - HW, r: p.x + HW, t: p.y - H, b: p.y };
    for (const s of w.springs) {
      if (s.cool > 0) continue;
      if (boxOverlap(box, { l: s.x, r: s.x + s.w, t: s.y + 2, b: s.y + s.h }) && (p.vy >= -50 || p.grounded)) {
        p.vy = -s.power; p.grounded = false; p.surf = null; p.support = null; p.jumping = false; p.cut = true; p.airT = 0;
        s.anim = 1; s.cool = 0.25;
        w.events.push({ type: 'spring', x: s.x + s.w / 2, y: s.y });
      }
    }

    // hazards
    const hitBox = { l: p.x - HW + 4, r: p.x + HW - 4, t: p.y - H + 4, b: p.y - 2 };
    for (const h of w.hazards) {
      if (hazardHit(w, h, hitBox)) { kill(w, h.type, p.x, p.y - 20); return; }
    }
    if (p.y - H > w.level.h + 80) { kill(w, 'fall', p.x, p.y); return; }

    // checkpoints & finish
    for (const c of w.checks) {
      if (!c.hit && p.x >= c.x) {
        c.hit = true; w.spawn = { x: c.x, y: c.y, vx: 180 };
        w.events.push({ type: 'checkpoint', x: c.x, y: c.y });
      }
    }
    if (p.x >= w.level.finish.x) { w.finished = true; w.events.push({ type: 'win' }); }
    w.clock += dt;
  }

  function stepWorld(w, dt) {
    w.t += dt;
    for (const s of w.solids) {
      if (!s.crumble) continue;
      if (s.state === 'shake') { s.timer -= dt; if (s.timer <= 0) { s.state = 'fall'; s.active = false; s.timer = 2.6; s.fvy = 0; } }
      else if (s.state === 'fall') {
        s.fvy += C.GRAV * dt * 0.6; s.fy += s.fvy * dt; s.timer -= dt;
        if (s.timer <= 0) { s.state = 'idle'; s.active = true; s.fy = 0; s.fvy = 0; }
      }
    }
    for (const s of w.springs) { s.anim = Math.max(0, s.anim - dt * 4); s.cool = Math.max(0, s.cool - dt); }
  }

  // Advance one fixed step.
  function step(w, dt) {
    stepWorld(w, dt);
    if (w.finished) return;
    if (w.player.dead) { w.player.deadT += dt; return; }
    stepPlayer(w, dt);
  }

  root.DOD = root.DOD || {};
  Object.assign(root.DOD, { C, build, step, respawn, rampY, rampSlope, sawPos, bobPos, crusherState });
  if (typeof module !== 'undefined') module.exports = root.DOD;
})(typeof window !== 'undefined' ? window : globalThis);
