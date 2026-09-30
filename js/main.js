// Doodle or Die - game shell: loop, input, camera, audio, HUD.
(function () {
  'use strict';
  const D = DOD, R = D.Render, fx = R.fx, C = D.C;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ---------------- audio (all synthesized, no assets) ----------------
  const Snd = (function () {
    let ac = null, master, roll, rollGain, rollFilter, muted = false;
    function noiseBuffer() {
      const b = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return b;
    }
    function init() {
      if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ac = new AC(); master = ac.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ac.destination);
      roll = ac.createBufferSource(); roll.buffer = noiseBuffer(); roll.loop = true;
      rollFilter = ac.createBiquadFilter(); rollFilter.type = 'bandpass'; rollFilter.Q.value = 0.9; rollFilter.frequency.value = 500;
      rollGain = ac.createGain(); rollGain.gain.value = 0;
      roll.connect(rollFilter); rollFilter.connect(rollGain); rollGain.connect(master); roll.start();
    }
    function burst(dur, freq, type, vol, q, sweepTo) { // filtered noise burst
      if (!ac) return;
      const s = ac.createBufferSource(); s.buffer = noiseBuffer();
      const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
      if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, ac.currentTime + dur);
      const g = ac.createGain(); const t = ac.currentTime; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
    }
    function tone(type, f0, f1, dur, vol, delay) {
      if (!ac) return;
      const t = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
    }
    return {
      init,
      toggle() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.8; return muted; },
      rolling(speed, grounded) {
        if (!ac) return; const k = grounded ? clamp(Math.abs(speed) / C.MAX_SPEED, 0, 1) : 0;
        rollGain.gain.setTargetAtTime(k * k * 0.11, ac.currentTime, 0.04);
        rollFilter.frequency.setTargetAtTime(350 + k * 900, ac.currentTime, 0.05);
      },
      pop() { burst(0.06, 2200, 'bandpass', 0.55, 2); tone('triangle', 240, 70, 0.09, 0.4); },
      land(impact) { const v = clamp(impact / 900, 0.15, 1); burst(0.12, 700, 'lowpass', 0.5 * v + 0.1, 1); tone('sine', 110, 45, 0.12, 0.45 * v); burst(0.04, 3000, 'bandpass', 0.25, 2); },
      bonk() { tone('square', 140, 60, 0.1, 0.18); burst(0.08, 500, 'lowpass', 0.3); },
      die(cause) {
        if (cause === 'lava') { burst(0.6, 3000, 'highpass', 0.35, 1, 800); tone('sawtooth', 380, 60, 0.5, 0.2); }
        else if (cause === 'saw') { burst(0.35, 2500, 'bandpass', 0.6, 4, 600); tone('sawtooth', 900, 120, 0.4, 0.2); }
        else if (cause === 'crusher') { burst(0.25, 300, 'lowpass', 0.9); tone('sine', 90, 30, 0.3, 0.6); }
        else if (cause === 'fall') { tone('sine', 700, 90, 0.7, 0.3); }
        else { burst(0.15, 1200, 'bandpass', 0.6, 2); tone('sawtooth', 500, 90, 0.35, 0.22); }
        tone('square', 300, 80, 0.3, 0.1, 0.05);
      },
      spring() { tone('sine', 180, 760, 0.28, 0.35); tone('triangle', 260, 1000, 0.22, 0.15, 0.03); },
      checkpoint() { tone('sine', 660, 660, 0.12, 0.3); tone('sine', 990, 990, 0.25, 0.3, 0.1); },
      crumble() { burst(0.25, 900, 'bandpass', 0.4, 1.5); },
      win() { [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.25, 0.35, i * 0.11)); },
      start() { tone('triangle', 440, 660, 0.15, 0.3); },
      grind() { burst(0.28, 3500, 'highpass', 0.35, 1, 6000); tone('sawtooth', 700, 1500, 0.12, 0.12); },
      scrape() { burst(0.06, 4500, 'highpass', 0.12, 1); },
    };
  })();

  // ---------------- state ----------------
  const levels = D.levels;
  let state = 'title';           // title | play | win | end
  let world = null, levelIdx = 0;
  let cam = { x: 0, y: 0, shake: 0 };
  const view = { w: 960, h: 540, scale: 1 };
  let touchMode = false, touches = new Map(), buttons = [];
  let best = {};
  try { best = JSON.parse(localStorage.getItem('dod_best') || '{}'); } catch (e) { best = {}; }
  let bots = [], botsOn = true;
  let runTime = 0, winInfo = null, lastPushPh = 0, respawnFlash = 0, stateT = 0;

  function saveBest() { try { localStorage.setItem('dod_best', JSON.stringify(best)); } catch (e) { /* private mode */ } }

  function loadLevel(i, custom) {
    levelIdx = i;
    world = D.build(custom || levels[i]);
    fx.reset();
    cam.shake = 0; runTime = 0;
    spawnBots(custom ? null : i);
    fit();
  }
  // Rival skaters (computer-controlled, mostly failing). Only for levels that carry route metadata (level.meta).
  function spawnBots(i) {
    bots = (botsOn && i !== null && D.Bots) ? D.Bots.create(levels[i], 4) : [];
  }
  const botEvents = {
    // Rivals splat visually but never shake the screen or make sound.
    die(b, e) { const p = b.w.player; fx.death(p, e.cause, b.w.t, p.hitX, p.hitY, { color: b.color, alpha: 0.55, quiet: true }); },
  };
  // The whole level is one page: scale it to fit the window and centre it. No scrolling.
  function fit() {
    const L = world ? world.level : { w: 1280, h: 720 };
    const cw = innerWidth, ch = innerHeight, s = Math.min((cw - 16) / L.w, (ch - 16) / L.h);
    view.scale = s; view.w = cw / s; view.h = ch / s;
    cam.x = (L.w - view.w) / 2; cam.y = (L.h - view.h) / 2;
  }
  function startPlay(i, custom) { Snd.init(); Snd.start(); state = 'play'; stateT = 0; loadLevel(i, custom); }

  // ---------------- input ----------------
  const keys = { left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], jump: ['Space', 'ArrowUp', 'KeyW', 'KeyZ', 'KeyK'] };
  const down = new Set();
  const isDown = (a) => a.some(k => down.has(k));
  function syncKeys() {
    if (!world) return;
    const inp = world.input;
    inp.left = isDown(keys.left) || touchBtn('left');
    inp.right = isDown(keys.right) || touchBtn('right');
    inp.jump = isDown(keys.jump) || touchBtn('jump');
  }
  function pressJump() {
    if (state !== 'play') return;
    if (world.player.dead) { if (world.player.deadT > 0.3) doRespawn(); return; }
    world.input.jumpPressed = true;
  }
  function pressGrind() {
    if (state === 'play' && !world.player.dead) world.input.grindPressed = true;
  }
  function anyAction() { // title / win / end screens
    Snd.init();
    if (state === 'title') startPlay(0);
    else if (state === 'win' && stateT > 0.5) { if (levelIdx + 1 < levels.length) startPlay(levelIdx + 1); else { state = 'end'; stateT = 0; } }
    else if (state === 'end' && stateT > 0.8) { state = 'title'; stateT = 0; loadLevel(0); }
  }
  addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    down.add(e.code);
    Snd.init();
    if (e.code === 'KeyM') { Snd.toggle(); return; }
    if (e.code === 'KeyB') { botsOn = !botsOn; spawnBots(state === 'title' || !world ? 0 : levelIdx); return; }
    if (state === 'title') {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= levels.length) { startPlay(n - 1); return; }
      if (e.code === 'Space' || e.code === 'Enter' || e.code.startsWith('Arrow')) anyAction();
      return;
    }
    if (state !== 'play') { if (e.code === 'Space' || e.code === 'Enter') anyAction(); return; }
    if (e.code === 'Escape') { state = 'title'; stateT = 0; loadLevel(0); return; }
    if (e.code === 'KeyR' && !world.player.dead) { forceDie(); return; }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { pressGrind(); return; }
    if (keys.jump.includes(e.code)) pressJump();
    else if (world.player.dead && world.player.deadT > 0.3 && (keys.left.includes(e.code) || keys.right.includes(e.code) || e.code === 'Enter')) doRespawn();
  });
  addEventListener('keyup', (e) => down.delete(e.code));
  addEventListener('blur', () => { down.clear(); touches.clear(); });

  function forceDie() { const p = world.player; p.dead = true; p.deadT = 0; p.cause = 'fall'; world.events.push({ type: 'die', cause: 'retry', x: p.x, y: p.y - 22 }); }
  function doRespawn() { fx.clearDeath(); D.respawn(world); }

  // touch / pointer controls
  function layoutButtons() {
    const cw = innerWidth, ch = innerHeight, s = clamp(Math.min(cw, ch) * 0.2, 64, 120), m = s * 0.35;
    buttons = [
      { id: 'left', x: m + s * 0.5, y: ch - m - s * 0.5, r: s * 0.55, label: '◀' },
      { id: 'right', x: m + s * 1.75, y: ch - m - s * 0.5, r: s * 0.55, label: '▶' },
      { id: 'jump', x: cw - m - s * 0.8, y: ch - m - s * 0.8, r: s * 0.8, label: 'OLLIE' },
      { id: 'grind', x: cw - m - s * 2.2, y: ch - m - s * 0.55, r: s * 0.55, label: 'GRIND' },
    ];
  }
  function touchBtn(id) { for (const b of touches.values()) if (b === id) return true; return false; }
  function hitButton(px, py) {
    let best = null, bd = 1e9;
    for (const b of buttons) { const d = Math.hypot(px - b.x, py - b.y); if (d < b.r * 1.35 && d < bd) { best = b.id; bd = d; } }
    return best;
  }
  canvas.addEventListener('pointerdown', (e) => {
    Snd.init();
    if (e.pointerType === 'mouse') { if (state !== 'play') anyAction(); return; }
    touchMode = true; e.preventDefault();
    if (state !== 'play') { anyAction(); return; }
    const id = hitButton(e.clientX, e.clientY); touches.set(e.pointerId, id);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (id === 'jump') pressJump();
    else if (id === 'grind') pressGrind();
    else if (world.player.dead && world.player.deadT > 0.3) doRespawn();
  });
  canvas.addEventListener('pointermove', (e) => { if (touches.has(e.pointerId)) touches.set(e.pointerId, hitButton(e.clientX, e.clientY) || (touches.get(e.pointerId) === 'jump' ? 'jump' : hitButton(e.clientX, e.clientY))); });
  const endPtr = (e) => touches.delete(e.pointerId);
  canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------------- resize ----------------
  function resize() {
    const dpr = window.devicePixelRatio || 1, cw = innerWidth, ch = innerHeight;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    view.dpr = dpr;
    fit();
    layoutButtons();
  }
  addEventListener('resize', resize); resize();

  // ---------------- events -> feedback ----------------
  function handleEvents() {
    const w = world, p = w.player;
    for (const e of w.events) {
      switch (e.type) {
        case 'pop': Snd.pop(); fx.dust(e.x - p.face * 8, e.y, 4, 60, -p.face); break;
        case 'land':
          Snd.land(e.impact);
          if (e.impact > 260) { fx.dust(e.x, e.y, 3 + Math.min(6, e.impact / 200 | 0), 140, 0); cam.shake = Math.max(cam.shake, clamp(e.impact / 400, 0, 3)); }
          break;
        case 'bonk': Snd.bonk(); cam.shake = Math.max(cam.shake, 3); fx.sparkle(e.x, e.y, 5); break;
        case 'grind': Snd.grind(); fx.sparkle(e.x, e.y - 10, 10); fx.word('grind!', e.x - 26, e.y - 62, '#c98a00', 26); break;
        case 'grindspark': Snd.scrape(); fx.sparkle(e.x, e.y, 3); break;
        case 'spring': Snd.spring(); fx.dust(e.x, e.y, 6, 120, 0); break;
        case 'crumble': Snd.crumble(); break;
        case 'checkpoint': Snd.checkpoint(); fx.sparkle(e.x + 10, e.y - 50, 14); fx.word('saved!', e.x - 20, e.y - 80, R.INK, 26); break;
        case 'die':
          Snd.die(e.cause); cam.shake = 9;
          fx.death(p, e.cause, w.t, p.hitX, p.hitY);
          break;
        case 'respawn': respawnFlash = 1; break;
        case 'win': onWin(); break;
      }
    }
    w.events.length = 0;
  }
  function onWin() {
    Snd.win();
    const t = world.clock, prev = best[levelIdx];
    const isBest = !prev || t < prev.time;
    if (isBest) { best[levelIdx] = { time: t, deaths: world.deaths }; saveBest(); }
    winInfo = { time: t, deaths: world.deaths, isBest, best: best[levelIdx] };
    state = 'win'; stateT = 0;
    fx.sparkle(world.player.x, world.player.y - 30, 40);
  }

  // ---------------- main loop ----------------
  const STEP = 1 / 120;
  let acc = 0, last = performance.now(), simT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    stateT += dt; simT += dt;
    if (state === 'play' || state === 'win') {
      syncKeys();
      acc += dt;
      while (acc >= STEP) {
        D.step(world, STEP); acc -= STEP;
        if (bots.length) D.Bots.step(bots, STEP, botEvents);
        if (world.events.length) handleEvents();
        if (world.player.dead && world.player.deadT > 0.95 && state === 'play') doRespawn();
      }
      const p = world.player;
      // pushing dust + rolling sound
      if (p.pushing && lastPushPh < 0.3 && p.pushPh >= 0.3) fx.dust(p.x - p.face * 14, p.y, 2, 50, -p.face);
      lastPushPh = p.pushPh;
      Snd.rolling(p.dead ? 0 : p.vx, p.grounded && !p.dead);
      fx.update(dt);
      cam.shake = Math.max(0, cam.shake - dt * 22);
      respawnFlash = Math.max(0, respawnFlash - dt * 3);
    } else {
      Snd.rolling(0, false); fx.update(dt);
    }
    draw();
  }

  // ---------------- drawing ----------------
  function draw() {
    const s = view.scale * view.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!world) { loadLevel(0); }
    const sx = cam.shake ? (Math.random() - 0.5) * cam.shake : 0, sy = cam.shake ? (Math.random() - 0.5) * cam.shake : 0;
    ctx.setTransform(s, 0, 0, s, (-cam.x + sx) * s, (-cam.y + sy) * s);
    R.drawWorld(ctx, world, cam, view, state === 'title' ? null : bots);
    fx.draw(ctx);
    ctx.setTransform(s, 0, 0, s, 0, 0); // screen space (logical units)
    if (state === 'play') drawHUD();
    else if (state === 'title') drawTitle();
    else if (state === 'win') { drawHUD(); drawWin(); }
    else if (state === 'end') drawEnd();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (touchMode && state === 'play') drawTouch();
  }
  function txt(str, x, y, size, color, rot, align) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
    ctx.font = size + 'px ' + R.FONT; ctx.fillStyle = color || R.INK; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, 0, 0); ctx.restore();
  }
  function fmt(t) { const m = Math.floor(t / 60), s = t - m * 60; return (m ? m + ':' : '') + (m && s < 10 ? '0' : '') + s.toFixed(1); }
  function tally(x, y, n) { // deaths as tally marks
    ctx.strokeStyle = R.RED; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.beginPath();
    const shown = Math.min(n, 60);
    for (let i = 0; i < shown; i++) {
      const g = Math.floor(i / 5), k = i % 5, gx = x + g * 34;
      if (k < 4) { ctx.moveTo(gx + k * 6, y); ctx.lineTo(gx + k * 6 + 0.5, y + 20); } else { ctx.moveTo(gx - 3, y + 16); ctx.lineTo(gx + 26, y + 4); }
    }
    ctx.stroke();
    if (n > 60) txt('+' + (n - 60), x + 12 * 34, y + 18, 20, R.RED);
  }
  function drawHUD() {
    txt(world.level.name, view.w - 20, 34, 26, R.INK, 0.01, 'right');
    txt(fmt(world.clock), view.w - 20, 62, 22, 'rgba(29,42,77,0.7)', 0.01, 'right');
    if (world.deaths) { txt('oopsies:', 20, 26, 18, 'rgba(29,42,77,0.6)'); tally(20, 34, world.deaths); }
    if (bots.length) { // rivals' scoreboard, centred along the top of the page
      const cx = -cam.x + world.level.w / 2, y = -cam.y + 22;
      ctx.font = '15px ' + R.FONT; ctx.textBaseline = 'alphabetic';
      const parts = bots.map(b => b.name + ' x' + b.w.deaths + (b.finishes ? ' ✓' + b.finishes : ''));
      const widths = parts.map(t => ctx.measureText(t).width), gap = 26, total = widths.reduce((a, b) => a + b, 0) + gap * (parts.length - 1);
      let x = cx - total / 2; ctx.textAlign = 'left';
      parts.forEach((t, i) => { ctx.fillStyle = bots[i].color; ctx.globalAlpha = 0.85; ctx.fillText(t, x, y); x += widths[i] + gap; });
      ctx.globalAlpha = 1;
    }
    if (respawnFlash > 0) { ctx.fillStyle = 'rgba(247,244,230,' + respawnFlash * 0.5 + ')'; ctx.fillRect(0, 0, view.w, view.h); }
    if (world.player.dead && world.player.deadT > 0.35 && state === 'play') txt('tap / press any key', view.w / 2, view.h - 24, 18, 'rgba(29,42,77,0.5)', 0, 'center');
  }
  function drawTitle() {
    ctx.fillStyle = 'rgba(247,244,230,0.88)'; ctx.fillRect(0, 0, view.w, view.h);
    const cx = view.w / 2, bob = Math.sin(simT * 2) * 3;
    txt('DOODLE', cx - 10, 150 + bob, 96, R.INK, -0.05, 'right');
    txt('or', cx + 6, 150 + bob, 44, R.RED, -0.05, 'left');
    txt('DIE', cx + 62, 150 + bob, 96, R.RED, -0.05, 'left');
    ctx.strokeStyle = R.RED; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx - 250, 176); ctx.quadraticCurveTo(cx, 190, cx + 250, 170); ctx.stroke();
    txt('a skateboarding stick figure vs. a bored kid with a pen', cx, 218, 24, 'rgba(29,42,77,0.8)', -0.01, 'center');
    const blink = 0.6 + 0.4 * Math.sin(simT * 4);
    txt(touchMode ? 'tap to start' : 'press SPACE to start', cx, view.h - 110, 34, 'rgba(29,42,77,' + blink + ')', 0, 'center');
    txt('← → push/brake     SPACE ollie (hold = higher)     ↓ grind (in the air)   R retry   B rivals   M mute', cx, view.h - 70, 19, 'rgba(29,42,77,0.65)', 0, 'center');
    txt('keys 1-' + levels.length + ' pick a page', cx, view.h - 44, 18, 'rgba(29,42,77,0.5)', 0, 'center');
  }
  function drawWin() {
    ctx.fillStyle = 'rgba(247,244,230,0.7)'; ctx.fillRect(0, 0, view.w, view.h);
    const cx = view.w / 2;
    txt('YOU MADE IT!', cx, 170, 74, R.INK, -0.04, 'center');
    txt(world.level.name + ' cleared in ' + fmt(winInfo.time), cx, 226, 30, R.INK, 0, 'center');
    txt(winInfo.deaths + (winInfo.deaths === 1 ? ' oopsie' : ' oopsies'), cx, 266, 26, R.RED, 0, 'center');
    if (winInfo.isBest) txt('new best!', cx, 306, 28, '#1f8a4c', -0.05, 'center');
    else txt('best: ' + fmt(winInfo.best.time), cx, 306, 22, 'rgba(29,42,77,0.6)', 0, 'center');
    if (stateT > 0.5) txt(touchMode ? 'tap for next page' : 'press SPACE for next page', cx, 380, 28, 'rgba(29,42,77,' + (0.6 + 0.4 * Math.sin(simT * 4)) + ')', 0, 'center');
  }
  function drawEnd() {
    ctx.fillStyle = 'rgba(247,244,230,0.9)'; ctx.fillRect(0, 0, view.w, view.h);
    const cx = view.w / 2;
    txt('THE END', cx, 190, 90, R.RED, -0.04, 'center');
    txt('you survived every page of the notebook.', cx, 250, 28, R.INK, 0, 'center');
    txt('(the kid is running out of paper...)', cx, 290, 22, 'rgba(29,42,77,0.6)', 0, 'center');
    if (stateT > 0.8) txt(touchMode ? 'tap to go back' : 'press SPACE', cx, 370, 26, 'rgba(29,42,77,0.7)', 0, 'center');
  }
  function drawTouch() {
    ctx.lineWidth = 3; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const b of buttons) {
      const on = touchBtn(b.id), pl = world.player;
      ctx.globalAlpha = b.id === 'grind' && (pl.grounded || pl.grindCool > 0) ? 0.4 : 1;
      ctx.fillStyle = on ? 'rgba(208,36,46,0.35)' : 'rgba(29,42,77,0.10)'; ctx.strokeStyle = on ? R.RED : 'rgba(29,42,77,0.55)';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.font = (b.id === 'jump' ? b.r * 0.38 : b.r * 0.6) + 'px ' + R.FONT; ctx.fillStyle = on ? R.RED : 'rgba(29,42,77,0.7)';
      ctx.fillText(b.label, b.x, b.y + 2);
      ctx.globalAlpha = 1;
    }
  }

  // ---------------- boot: optional ?level=<json url> for custom / editor levels ----------------
  const qs = new URLSearchParams(location.search);
  if (qs.get('level') && /^[\w./-]+\.json$/.test(qs.get('level'))) {
    fetch(qs.get('level')).then(r => r.json()).then(lv => { if (lv && lv.objects) startPlay(0, lv); }).catch(() => { });
  } else if (qs.get('l')) {
    const n = parseInt(qs.get('l'), 10); if (n >= 1 && n <= levels.length) { loadLevel(n - 1); state = 'play'; }
  }
  if (!world) loadLevel(0);
  if (qs.get('ff')) { // dev: ?l=1&ff=25 fast-forwards 25s of simulated time (rivals included) for screenshots
    for (let n = 0; n < (+qs.get('ff')) * 120; n++) { D.step(world, STEP); if (bots.length) D.Bots.step(bots, STEP, botEvents); if (n % 6 === 0) fx.update(STEP * 6); if (world.events.length) world.events.length = 0; }
  }
  if (qs.get('x')) { // dev: ?l=2&x=2500[&y=400] teleports the player (used for screenshots/testing)
    const p = world.player; p.x = +qs.get('x'); p.y = +(qs.get('y') || 400); world.spawn = { x: p.x, y: p.y, vx: 0 };
    if (qs.get('air')) { p.grounded = false; p.vy = -180; p.vx = 330; p.boardAng = 0.28; p.popT = 0.2; } // dev: start mid-ollie
    if (qs.get('gr')) { p.grounded = false; p.grindT = 0.8; p.vy = 30; p.vx = 300; } // dev: start mid-grind
  }
  requestAnimationFrame(frame);

  window.__dod = { get world() { return world; }, get state() { return state; }, startPlay, Snd }; // handy for debugging
})();
