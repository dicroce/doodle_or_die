// Doodle or Die - rendering. Everything is drawn like a pen sketch on ruled notebook paper.
(function (root) {
  'use strict';
  const D = root.DOD;
  const C = D.C;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  const PAPER = '#f7f4e6', RULE = '#b7d0ea', MARGIN = '#e88a8a';
  const INK = '#1d2a4d', PENCIL = 'rgba(52,58,96,0.32)', RED = '#d0242e', REDFILL = 'rgba(208,36,46,0.16)';
  const BLUE = '#3d78c8', GREEN = '#1f8a4c';
  const FONT = '"Segoe Print","Bradley Hand","Chalkboard SE","Comic Sans MS","Marker Felt",cursive';

  function wob(s) { const v = Math.sin(s * 12.9898) * 43758.5453; return (v - Math.floor(v)) * 2 - 1; }

  // Adds a hand-wobbled line to the current path.
  function sketchTo(ctx, x1, y1, x2, y2, seed, j) {
    const L = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.round(L / 30));
    ctx.moveTo(x1 + wob(seed) * j, y1 + wob(seed + 0.3) * j);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      ctx.lineTo(x1 + (x2 - x1) * t + wob(seed + i * 1.7) * j, y1 + (y2 - y1) * t + wob(seed + i * 2.3 + 0.5) * j);
    }
  }
  function sketchPoly(ctx, pts, seed, color, lw, close) {
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      const n = pts.length;
      for (let i = 0; i < (close ? n : n - 1); i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        sketchTo(ctx, a[0], a[1], b[0], b[1], seed + i * 3.1 + pass * 11.7, pass ? 1.4 : 0.9);
      }
      ctx.stroke();
    }
  }
  function hatchBox(ctx, x0, y0, x1, y1, spacing, color) {
    if (x1 <= x0 || y1 <= y0) return;
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
    for (let c = Math.floor((x0 + y0) / spacing) * spacing; c < x1 + y1; c += spacing) { ctx.moveTo(c - y1, y1); ctx.lineTo(c - y0, y0); }
    ctx.stroke();
  }
  // Paper-filled, hatched, outlined polygon (opaque so buried hazards stay hidden).
  function solidPoly(ctx, pts, cam, view, seed, hatchColor) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    if (x1 < cam.x - 20 || x0 > cam.x + view.w + 20 || y1 < cam.y - 20 || y0 > cam.y + view.h + 20) return;
    ctx.save();
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    ctx.fillStyle = PAPER; ctx.fill(); ctx.clip();
    hatchBox(ctx, Math.max(x0, cam.x), Math.max(y0, cam.y), Math.min(x1, cam.x + view.w), Math.min(y1, cam.y + view.h), 9, hatchColor || PENCIL);
    ctx.restore();
    sketchPoly(ctx, pts, seed, INK, 2.4, true);
  }
  const rectPts = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const visible = (cam, view, x, y, w, h) => x + w > cam.x - 40 && x < cam.x + view.w + 40 && y + h > cam.y - 40 && y < cam.y + view.h + 40;

  function text(ctx, str, x, y, size, color, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
    ctx.font = size + 'px ' + FONT; ctx.fillStyle = color; ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, 0, 0); ctx.restore();
  }

  // ---------------- background ----------------
  function page(ctx, cam, view, L) { // the desk, the sheet of paper, and a clip to the sheet
    ctx.fillStyle = '#cbc1a6'; ctx.fillRect(cam.x - 60, cam.y - 60, view.w + 120, view.h + 120);
    ctx.fillStyle = 'rgba(0,0,0,0.20)'; ctx.fillRect(7, 9, L.w, L.h);
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, L.w, L.h);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, L.w, L.h); ctx.clip();
    ctx.strokeStyle = RULE; ctx.lineWidth = 1.3; ctx.beginPath();
    for (let y = 30; y < L.h; y += 30) { ctx.moveTo(0, y); ctx.lineTo(L.w, y); }
    ctx.stroke();
    ctx.strokeStyle = MARGIN; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(84, 0); ctx.lineTo(84, L.h); ctx.stroke();
    ctx.fillStyle = '#cbc1a6';
    for (const hy of [120, 360, 600]) { ctx.beginPath(); ctx.arc(30, hy, 10, 0, TAU); ctx.fill(); }
  }

  // ---------------- hazards ----------------
  function drawSaw(ctx, h, q, t) {
    const teeth = h.teeth || 10, ang = t * 5 * (h.spin || 1) + (h.off || 0), r = h.r, rb = r * 0.74;
    ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(ang);
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a0 = (i / teeth) * TAU, a1 = a0 + TAU / teeth * 0.5, a2 = a0 + TAU / teeth;
      if (i === 0) ctx.moveTo(Math.cos(a0) * rb, Math.sin(a0) * rb);
      ctx.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
      ctx.lineTo(Math.cos(a2) * rb, Math.sin(a2) * rb);
    }
    ctx.closePath();
    ctx.fillStyle = '#efe9ea'; ctx.fill();
    ctx.strokeStyle = RED; ctx.lineWidth = 2.6; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, rb * 0.72, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-rb * 0.42, -rb * 0.42); ctx.lineTo(rb * 0.42, rb * 0.42); ctx.moveTo(rb * 0.42, -rb * 0.42); ctx.lineTo(-rb * 0.42, rb * 0.42); ctx.stroke();
    ctx.restore();
  }
  function drawSpikes(ctx, h, seed) {
    const f = h.facing || 'up', horiz = f === 'up' || f === 'down';
    const len = horiz ? h.w : h.h, n = Math.max(1, Math.round(len / 18)), step = len / n;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = i * step, b = a + step / 2, c = a + step;
      if (f === 'up') pts.push([h.x + a, h.y + h.h], [h.x + b, h.y], [h.x + c, h.y + h.h]);
      else if (f === 'down') pts.push([h.x + a, h.y], [h.x + b, h.y + h.h], [h.x + c, h.y]);
      else if (f === 'left') pts.push([h.x + h.w, h.y + a], [h.x, h.y + b], [h.x + h.w, h.y + c]);
      else pts.push([h.x, h.y + a], [h.x + h.w, h.y + b], [h.x, h.y + c]);
    }
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.fillStyle = REDFILL; ctx.fill();
    sketchPoly(ctx, pts, seed, RED, 2.2, false);
  }
  function drawLava(ctx, h, t, cam, view) {
    if (!visible(cam, view, h.x, h.y, h.w, h.h)) return;
    const x0 = Math.max(h.x, cam.x - 10), x1 = Math.min(h.x + h.w, cam.x + view.w + 10), y1 = Math.min(h.y + h.h, cam.y + view.h + 10);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(x0, y1);
    for (let x = x0; x <= x1; x += 8) ctx.lineTo(x, h.y + Math.sin(x * 0.06 + t * 2.4) * 3);
    ctx.lineTo(x1, y1); ctx.closePath();
    const g = ctx.createLinearGradient(0, h.y, 0, h.y + 90);
    g.addColorStop(0, 'rgba(255,170,40,0.85)'); g.addColorStop(1, 'rgba(232,72,42,0.75)');
    ctx.fillStyle = g; ctx.fill(); ctx.clip();
    hatchBox(ctx, x0, h.y, x1, y1, 8, 'rgba(160,20,20,0.35)');
    // bubbles
    for (let i = 0, n = Math.floor(h.w / 55); i < n; i++) {
      const ph = (((t * 0.55 + wob(h.x + i * 5.3) * 3 + i * 0.37) % 1) + 1) % 1, bx = h.x + 20 + i * 55 + wob(i + h.x) * 12;
      const by = h.y + 26 - ph * 22, br = 2 + ph * 6;
      ctx.strokeStyle = 'rgba(120,20,10,0.8)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.stroke();
    }
    ctx.restore();
    // wobbling surface + flame licks
    ctx.strokeStyle = RED; ctx.lineWidth = 2.6; ctx.lineJoin = 'round'; ctx.beginPath();
    for (let x = x0; x <= x1; x += 8) { const y = h.y + Math.sin(x * 0.06 + t * 2.4) * 3; x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
    ctx.strokeStyle = '#f08a2a'; ctx.lineWidth = 2.2;
    for (let x = Math.ceil(x0 / 34) * 34; x < x1; x += 34) {
      const fh = 9 + 7 * Math.sin(t * 5 + x * 0.3), y = h.y + Math.sin(x * 0.06 + t * 2.4) * 3;
      ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.quadraticCurveTo(x - 2, y - fh * 0.6, x + Math.sin(t * 6 + x) * 3, y - fh); ctx.quadraticCurveTo(x + 3, y - fh * 0.5, x + 6, y); ctx.stroke();
    }
  }
  function drawBall(ctx, x, y, r, rot) {
    const n = 10; ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = a0 + TAU / n / 2, a2 = a0 + TAU / n;
      if (i === 0) ctx.moveTo(Math.cos(a0) * r * 0.75, Math.sin(a0) * r * 0.75);
      ctx.lineTo(Math.cos(a1) * r * 1.25, Math.sin(a1) * r * 1.25);
      ctx.lineTo(Math.cos(a2) * r * 0.75, Math.sin(a2) * r * 0.75);
    }
    ctx.closePath(); ctx.fillStyle = '#c9c4cc'; ctx.fill(); ctx.strokeStyle = RED; ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, r * 0.4, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  function drawPendulum(ctx, h, t) {
    const q = D.bobPos(h, t);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(h.x, h.y, 5, 0, TAU); ctx.fill();
    drawBall(ctx, q.x, q.y, (h.r || 22) * 0.85, q.th * 2);
  }
  function drawCrusher(ctx, h, t, cam) {
    const st = D.crusherState(h, t), sx = Math.sin(t * 90) * 2.2 * st.shake, y = h.y + st.off, x = h.x + sx;
    // chain up off the page
    ctx.strokeStyle = INK; ctx.lineWidth = 2;
    for (let cy = y - 8; cy > cam.y - 20; cy -= 14) { ctx.beginPath(); ctx.ellipse(h.x + h.w / 2 + sx, cy, 4, 8, 0, 0, TAU); ctx.stroke(); }
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, h.w, h.h); ctx.fillStyle = '#e9e4e6'; ctx.fill(); ctx.clip();
    hatchBox(ctx, x, y, x + h.w, y + h.h, 7, 'rgba(80,60,80,0.4)'); ctx.restore();
    sketchPoly(ctx, rectPts(x, y, h.w, h.h), h.x * 0.7, RED, 2.6, true);
    // angry face
    const cx = x + h.w / 2, cy = y + h.h * 0.42;
    ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - 24, cy - 12); ctx.lineTo(cx - 6, cy - 4); ctx.moveTo(cx + 24, cy - 12); ctx.lineTo(cx + 6, cy - 4); ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(cx - 13, cy + 2, 3, 0, TAU); ctx.arc(cx + 13, cy + 2, 3, 0, TAU); ctx.fill();
    ctx.beginPath(); const my = y + h.h - 16;
    for (let i = 0; i <= 6; i++) { const mx = cx - 21 + i * 7; i ? ctx.lineTo(mx, my + (i % 2 ? 7 : 0)) : ctx.moveTo(mx, my); } ctx.stroke();
    // spikes on the underside
    const n = Math.round(h.w / 16), sw = h.w / n; ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < n; i++) { ctx.moveTo(x + i * sw, y + h.h); ctx.lineTo(x + i * sw + sw / 2, y + h.h + 9); ctx.lineTo(x + (i + 1) * sw, y + h.h); }
    ctx.stroke();
    if (st.shake > 0) text(ctx, '!', cx - 5, y - 6, 34, RED, Math.sin(t * 40) * 0.15);
  }
  function drawFan(ctx, f, t, cam) {
    const flow = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[f.dir];
    const vert = flow[0] === 0, len = vert ? f.h : f.w, wid = vert ? f.w : f.h;
    ctx.strokeStyle = 'rgba(61,120,200,0.55)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    const n = Math.max(4, Math.round(wid / 14));
    for (let k = 0; k < n; k++) {
      const d = (t * 230 + k * 57) % len, lat = ((k * 0.618) % 1) * wid;
      const fade = Math.sin((d / len) * Math.PI);
      ctx.globalAlpha = 0.25 + 0.6 * fade;
      const bx = vert ? f.x + lat : (flow[0] < 0 ? f.x + f.w - d : f.x + d);
      const by = vert ? (flow[1] < 0 ? f.y + f.h - d : f.y + d) : f.y + lat;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + flow[0] * 14, by + flow[1] * 14); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // housing + spinning blades at the source side
    let hx, hy, hw, hh;
    if (f.dir === 'up') { hx = f.x + 4; hy = f.y + f.h - 14; hw = f.w - 8; hh = 14; }
    else if (f.dir === 'down') { hx = f.x + 4; hy = f.y; hw = f.w - 8; hh = 14; }
    else if (f.dir === 'left') { hx = f.x + f.w - 14; hy = f.y + 4; hw = 14; hh = f.h - 8; }
    else { hx = f.x; hy = f.y + 4; hw = 14; hh = f.h - 8; }
    ctx.save(); ctx.beginPath(); ctx.rect(hx, hy, hw, hh); ctx.fillStyle = '#e6eaf2'; ctx.fill(); ctx.restore();
    sketchPoly(ctx, rectPts(hx, hy, hw, hh), f.x * 0.3 + f.y, BLUE, 2.4, true);
    ctx.strokeStyle = BLUE; ctx.lineWidth = 3;
    const cx = hx + hw / 2, cy = hy + hh / 2, span = (vert ? hw : hh) / 2 - 3;
    for (let i = 0; i < 3; i++) {
      const s = Math.sin(t * 22 + i * 2.1) * span; ctx.beginPath();
      if (vert) { ctx.moveTo(cx - s, cy - 1); ctx.lineTo(cx + s, cy - 1); } else { ctx.moveTo(cx - 1, cy - s); ctx.lineTo(cx - 1, cy + s); }
      ctx.stroke();
    }
  }
  function drawSpring(ctx, s) {
    const stretch = s.anim * 12, top = s.y + 2 - stretch, base = s.y + s.h, cx = s.x + s.w / 2;
    ctx.strokeStyle = GREEN; ctx.lineWidth = 2.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, base);
    const coils = 5; for (let i = 1; i <= coils; i++) ctx.lineTo(cx + (i % 2 ? -1 : 1) * (s.w * 0.32), base + (top + 4 - base) * (i / (coils + 0.5)));
    ctx.lineTo(cx, top + 3); ctx.stroke();
    ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(s.x, top + 2); ctx.lineTo(s.x + s.w, top + 2); ctx.stroke();
    ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(s.x + 4, base); ctx.lineTo(s.x + s.w - 4, base); ctx.stroke();
  }
  function drawCrumble(ctx, s, t, cam, view, seed) {
    const shake = s.state === 'shake' ? Math.sin(t * 70) * 2 : 0, y = s.y + s.fy;
    if (s.state === 'fall' && s.fy > view.h + 200) return;
    if (!visible(cam, view, s.x, y, s.w, s.h)) return;
    ctx.save(); ctx.translate(shake, 0);
    ctx.globalAlpha = s.state === 'fall' ? clamp(1 - s.fy / 260, 0, 1) : 1;
    ctx.beginPath(); ctx.rect(s.x, y, s.w, s.h); ctx.fillStyle = PAPER; ctx.fill();
    ctx.setLineDash([7, 5]); sketchPoly(ctx, rectPts(s.x, y, s.w, s.h), seed, INK, 2.2, true); ctx.setLineDash([]);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.beginPath();
    const c = s.x + s.w * 0.5; ctx.moveTo(c - 6, y); ctx.lineTo(c + 2, y + s.h * 0.4); ctx.lineTo(c - 4, y + s.h * 0.7); ctx.lineTo(c + 5, y + s.h); ctx.stroke();
    ctx.restore();
  }
  function drawCheckpoint(ctx, c, t) {
    ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x, c.y - 62); ctx.stroke();
    const wv = c.hit ? Math.sin(t * 6) * 3 : 0;
    ctx.beginPath(); ctx.moveTo(c.x, c.y - 62); ctx.lineTo(c.x + 30, c.y - 54 + wv); ctx.lineTo(c.x, c.y - 42); ctx.closePath();
    if (c.hit) { ctx.fillStyle = 'rgba(31,138,76,0.35)'; ctx.fill(); }
    ctx.strokeStyle = c.hit ? GREEN : INK; ctx.stroke();
    if (c.hit) { ctx.beginPath(); ctx.moveTo(c.x + 6, c.y - 53); ctx.lineTo(c.x + 11, c.y - 48); ctx.lineTo(c.x + 20, c.y - 58); ctx.stroke(); }
  }
  function drawFinish(ctx, w, t) {
    const F = w.level.finish, fx0 = F.x, fy = F.y, L = fx0 - 34, Rr = fx0 + 34, top = fy - 96;
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(L, fy); ctx.lineTo(L, top); ctx.moveTo(Rr, fy); ctx.lineTo(Rr, top); ctx.stroke();
    const bw = Rr - L, cell = 11; ctx.save(); ctx.beginPath(); ctx.rect(L, top, bw, 22); ctx.fillStyle = PAPER; ctx.fill(); ctx.clip();
    ctx.fillStyle = INK; for (let r = 0; r < 2; r++) for (let c = 0; c * cell < bw; c++) if ((r + c) % 2 === 0) ctx.fillRect(L + c * cell, top + r * cell, cell, cell);
    ctx.restore(); sketchPoly(ctx, rectPts(L, top, bw, 22), 5.5, INK, 2.2, true);
    text(ctx, 'FINISH', fx0 - 34, top - 8 + Math.sin(t * 3) * 1.5, 26, RED, -0.04);
    for (let c = 0; c * cell < bw; c++) { ctx.fillStyle = c % 2 ? INK : PAPER; ctx.fillRect(L + c * cell, fy - 5, cell, 5); }
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.strokeRect(L, fy - 5, bw, 5);
  }

  // ---------------- stick figure ----------------
  function ik(ax, ay, bx, by, l1, l2, sx, sy) {
    let dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 0.001;
    const max = l1 + l2 - 0.01;
    if (d > max) { const k = max / d; dx *= k; dy *= k; d = max; bx = ax + dx; by = ay + dy; }
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const mx = ax + dx * a / d, my = ay + dy * a / d;
    let px = -dy / d, py = dx / d; if (px * sx + py * sy < 0) { px = -px; py = -py; }
    return [mx + px * h, my + py * h, bx, by];
  }
  const lerp = (a, b, k) => a + (b - a) * k;

  // Returns the skeleton for the current state: segments [x1,y1,x2,y2], head, board.
  function pose(p, t) {
    const v = p.v || (p.v = { armAir: 0 });
    const f = p.face, a = p.boardAng, air = !p.grounded;
    v.armAir += ((air ? 1 : 0) - v.armAir) * 0.25;
    const cx = p.x, cy = p.y - 7.5;
    const dx = f * Math.cos(a), dy = -Math.sin(a), nx = -f * Math.sin(a), ny = -Math.cos(a);
    const rise = clamp(-p.vy / C.JUMP_V, -1, 1);
    // legs
    let hipH = 15.5 - 5.5 * p.squash;
    if (air) hipH = p.popT < 0.07 ? 17.5 : (rise > 0 ? 12.5 : 14.5);
    else if (p.pushing) hipH -= 1.2;
    if (p.grindT > 0) hipH = 11; // low grinding crouch
    const lean = clamp(p.vx / C.MAX_SPEED, -1, 1) * f * 3;
    const ff = [cx + dx * 10 + nx * 2, cy + dy * 10 + ny * 2];
    let rf = [cx - dx * 10 + nx * 2, cy - dy * 10 + ny * 2];
    if (p.pushing && !air) {
      const ph = p.pushPh, k = ph < 0.55 ? Math.sin(ph / 0.55 * Math.PI) : 0;
      const gp = [cx - f * (12 + 10 * (ph / 0.55)), p.y];
      rf = [lerp(rf[0], gp[0], k), lerp(rf[1], gp[1], k)];
    }
    const hip = [cx + lean * 0.4, cy - 2 - hipH];
    const kF = ik(hip[0], hip[1], ff[0], ff[1], 9.5, 9.5, f, 0.2);
    const kR = ik(hip[0], hip[1], rf[0], rf[1], 9.5, 9.5, f, 0.2);
    // torso, head
    const chest = [hip[0] + lean + f * (air ? 1 : 0), hip[1] - 12];
    const head = [chest[0] + f * 1.5 + lean * 0.3, chest[1] - 8.5];
    const sh = [chest[0], chest[1] + 1.5];
    // arms
    const sway = Math.sin(t * 3 + p.x * 0.01) * 1.2, swing = p.pushing ? Math.sin(p.pushPh * TAU) * 4 : 0;
    const groundF = [sh[0] + f * 13, sh[1] + 6 + sway + swing * 0.5], groundR = [sh[0] - f * 12, sh[1] + 4 - sway - swing * 0.5];
    const airF = rise > 0 ? [sh[0] + f * 9, sh[1] - 9] : [sh[0] + f * 14, sh[1] - 2];
    const airR = rise > 0 ? [sh[0] - f * 10, sh[1] - 6] : [sh[0] - f * 14, sh[1] - 1];
    const hf = [lerp(groundF[0], airF[0], v.armAir), lerp(groundF[1], airF[1], v.armAir)];
    const hr = [lerp(groundR[0], airR[0], v.armAir), lerp(groundR[1], airR[1], v.armAir)];
    const aF = ik(sh[0], sh[1], hf[0], hf[1], 7.5, 7.5, -f * 0.3, 1), aR = ik(sh[0], sh[1], hr[0], hr[1], 7.5, 7.5, -f * 0.3, 1);
    const segs = [
      [hip[0], hip[1], kR[0], kR[1]], [kR[0], kR[1], kR[2], kR[3]],
      [hip[0], hip[1], kF[0], kF[1]], [kF[0], kF[1], kF[2], kF[3]],
      [hip[0], hip[1], chest[0], chest[1]],
      [sh[0], sh[1], aR[0], aR[1]], [aR[0], aR[1], aR[2], aR[3]],
      [sh[0], sh[1], aF[0], aF[1]], [aF[0], aF[1], aF[2], aF[3]],
    ];
    const board = { cx, cy, dx, dy, nx, ny };
    return { segs, head, board, f };
  }
  function drawBoard(ctx, b, wheelRot, color) {
    const { cx, cy, dx, dy, nx, ny } = b;
    ctx.strokeStyle = color || INK; ctx.lineWidth = 3.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - dx * 23 + nx * 3.5, cy - dy * 23 + ny * 3.5); ctx.lineTo(cx - dx * 19, cy - dy * 19);
    ctx.lineTo(cx + dx * 19, cy + dy * 19); ctx.lineTo(cx + dx * 23 + nx * 3.5, cy + dy * 23 + ny * 3.5); ctx.stroke();
    ctx.lineWidth = 2;
    for (const s of [-1, 1]) {
      const wx = cx + dx * 13 * s - nx * 4, wy = cy + dy * 13 * s - ny * 4;
      ctx.beginPath(); ctx.arc(wx, wy, 3.6, 0, TAU); ctx.stroke();
      const ra = wheelRot; ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + Math.cos(ra) * 3, wy + Math.sin(ra) * 3); ctx.stroke();
    }
  }
  function drawHead(ctx, head, f, color) {
    ctx.strokeStyle = color || '#111'; ctx.fillStyle = color || '#111'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(head[0], head[1], 5.6, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(head[0], head[1], 5.8, Math.PI, TAU); ctx.fill(); // cap
    ctx.beginPath(); ctx.moveTo(head[0] + f * 4, head[1] - 1.5); ctx.lineTo(head[0] + f * 10, head[1] - 0.5); ctx.stroke();
  }
  // style (rivals only): {color, alpha, name}
  function drawPlayer(ctx, p, t, st) {
    const ps = pose(p, t), col = st ? st.color : '#111';
    ctx.save(); if (st) ctx.globalAlpha = st.alpha;
    drawBoard(ctx, ps.board, p.wheel * 0.28, st ? col : INK);
    ctx.strokeStyle = col; ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); for (const s of ps.segs) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); } ctx.stroke();
    drawHead(ctx, ps.head, ps.f, col);
    if (p.grindT > 0) { // pencil timer ring: drains over the grind, blinks when nearly out
      const k = p.grindT / C.GRIND_TIME;
      if (k > 0.3 || Math.sin(t * 40) > 0) {
        ctx.strokeStyle = '#e8a010'; ctx.lineWidth = 3.4; ctx.beginPath();
        ctx.arc(p.x, p.y - 24, 34, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
      }
    }
    if (st && st.name) { ctx.font = '15px ' + FONT; ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.fillText(st.name, ps.head[0], ps.head[1] - 15); ctx.textAlign = 'left'; }
    ctx.restore();
  }

  // ---------------- particles & death ragdoll ----------------
  const fx = { parts: [], bones: [], ink: [], words: [] };
  const WORDS = { spikes: ['OUCH!', 'STABBY!', 'POKED!', 'YEOWCH'], lava: ['HOT!', 'SIZZLE', 'TOASTY', 'HOT HOT HOT'], saw: ['SKREEE!', 'BZZZT', 'CHOP!'], pendulum: ['BONK!', 'WHAM!', 'THWACK'], crusher: ['SPLAT!', 'FLAT!', 'CRUNCH'], fall: ['AAAAH...', 'WHOOPS', 'DOWN WE GO'], grinder: ['GRIND!'] };

  fx.dust = function (x, y, n, spd, dir) {
    for (let i = 0; i < n; i++) fx.parts.push({ type: 'dust', x: x + (Math.random() - 0.5) * 10, y: y - 1, vx: (dir || (Math.random() - 0.5) * 2) * spd * (0.3 + Math.random() * 0.7), vy: -20 - Math.random() * 40, life: 0, max: 0.35 + Math.random() * 0.25, s: 2 + Math.random() * 3 });
  };
  fx.sparkle = function (x, y, n) {
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = 60 + Math.random() * 160; fx.parts.push({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 0, max: 0.5 + Math.random() * 0.3, s: 3 }); }
  };
  fx.word = function (str, x, y, color, size) { fx.words.push({ str, x, y, life: 0, max: 1.1, color: color || RED, size: size || 34, rot: (Math.random() - 0.5) * 0.3 }); };
  fx.death = function (p, cause, t, hx, hy, opt) {
    opt = opt || {};
    const ps = pose(p, t);
    const push = (x1, y1, x2, y2) => {
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, ang = (hx !== undefined ? Math.atan2(my - hy, mx - hx) : -Math.PI / 2);
      const s = 180 + Math.random() * 260;
      fx.bones.push({ x: mx, y: my, a: Math.atan2(y2 - y1, x2 - x1), len: Math.hypot(x2 - x1, y2 - y1), va: (Math.random() - 0.5) * 18, vx: Math.cos(ang) * s * 0.7 + p.vx * 0.4, vy: Math.sin(ang) * s * 0.7 - 260 - Math.random() * 120, life: 0, color: opt.color, alpha: opt.alpha });
    };
    for (const s of ps.segs) push(s[0], s[1], s[2], s[3]);
    const h = ps.head; fx.bones.push({ head: true, x: h[0], y: h[1], a: 0, len: 0, va: 6, vx: p.vx * 0.5 + (Math.random() - 0.5) * 200, vy: -420 - Math.random() * 120, life: 0, f: ps.f, color: opt.color, alpha: opt.alpha });
    const b = ps.board; fx.bones.push({ board: true, x: b.cx, y: b.cy, a: Math.atan2(b.dy, b.dx), len: 46, va: (Math.random() - 0.5) * 14, vx: p.vx * 0.6 + (Math.random() - 0.5) * 240, vy: -300 - Math.random() * 200, life: 0, color: opt.color, alpha: opt.alpha });
    const ink = cause === 'lava' ? '#f08a2a' : RED;
    for (let i = 0; i < 22; i++) { const a = Math.random() * TAU, s = 80 + Math.random() * 300; fx.ink.push({ x: p.x, y: p.y - 22, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 140, r: 1.5 + Math.random() * 3.5, life: 0, color: ink, alpha: opt.alpha, stuck: false }); }
    if (opt.quiet) return;
    const ws = WORDS[cause] || WORDS.spikes; fx.word(ws[(Math.random() * ws.length) | 0], p.x - 40, p.y - 70, ink, 36);
  };
  fx.clearDeath = function () { fx.bones.length = 0; fx.ink.length = 0; };
  fx.reset = function () { fx.parts.length = 0; fx.bones.length = 0; fx.ink.length = 0; fx.words.length = 0; };
  fx.update = function (dt) {
    for (const p of fx.parts) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.type === 'spark') p.vy += 500 * dt; else p.vx *= 0.96; }
    fx.parts = fx.parts.filter(p => p.life < p.max);
    for (const b of fx.bones) { b.life += dt; b.vy += 1800 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt; if (b.life > 3) b.dead = true; }
    fx.bones = fx.bones.filter(b => !b.dead);
    for (const k of fx.ink) { if (k.stuck) continue; k.life += dt; k.vy += 1400 * dt; k.x += k.vx * dt; k.y += k.vy * dt; if (k.life > 0.9) k.stuck = true; }
    for (const w of fx.words) w.life += dt;
    fx.words = fx.words.filter(w => w.life < w.max);
  };
  fx.draw = function (ctx) {
    for (const p of fx.parts) {
      const k = 1 - p.life / p.max; ctx.globalAlpha = k;
      if (p.type === 'dust') { ctx.strokeStyle = 'rgba(70,70,90,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (1.4 - k * 0.6), 0, TAU); ctx.stroke(); }
      else { ctx.strokeStyle = '#e0a020'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    for (const k of fx.ink) { ctx.globalAlpha = k.alpha || 1; ctx.fillStyle = k.color; ctx.beginPath(); ctx.arc(k.x, k.y, k.r, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'round';
    for (const b of fx.bones) {
      ctx.save(); ctx.globalAlpha = b.alpha || 1; ctx.translate(b.x, b.y); ctx.rotate(b.a); ctx.strokeStyle = b.color || (b.board ? INK : '#111'); ctx.lineWidth = b.board ? 3.4 : 3.2;
      if (b.head) { ctx.beginPath(); ctx.arc(0, 0, 5.6, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 5.8, Math.PI, TAU); ctx.fillStyle = b.color || '#111'; ctx.fill(); }
      else { ctx.beginPath(); ctx.moveTo(-b.len / 2, 0); ctx.lineTo(b.len / 2, 0); ctx.stroke(); }
      ctx.restore();
    }
    for (const w of fx.words) { const k = w.life / w.max; ctx.globalAlpha = 1 - k * k; text(ctx, w.str, w.x, w.y - k * 30, w.size * (1 + 0.2 * Math.sin(Math.min(1, k * 4) * Math.PI)), w.color, w.rot); }
    ctx.globalAlpha = 1;
  };

  // ---------------- world ----------------
  function drawWorld(ctx, w, cam, view, bots) {
    const t = w.t, p = w.player;
    page(ctx, cam, view, w.level);
    ctx.save(); ctx.lineCap = 'round';
    // hazards that can be half-buried in the ground go behind solids
    for (const h of w.hazards) {
      if (h.type !== 'saw') continue;
      const q = D.sawPos(h, t);
      if (h.path) { ctx.strokeStyle = 'rgba(60,60,80,0.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 7]); ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(h.x + h.path.dx, h.y + h.path.dy); ctx.stroke(); ctx.setLineDash([]); }
      if (visible(cam, view, q.x - h.r, q.y - h.r, h.r * 2, h.r * 2)) drawSaw(ctx, h, q, t);
    }
    for (const h of w.hazards) if (h.type === 'lava') drawLava(ctx, h, t, cam, view);
    let i = 0;
    for (const s of w.solids) {
      i++;
      if (s.crumble) { drawCrumble(ctx, s, t, cam, view, i * 5.1); continue; }
      if (visible(cam, view, s.x, s.y, s.w, s.h)) solidPoly(ctx, rectPts(s.x, s.y, s.w, s.h), cam, view, i * 7.13);
    }
    for (const r of w.ramps) {
      const pts = r.dir === 1 ? [[r.x, r.y + r.h], [r.x + r.w, r.y + r.h], [r.x + r.w, r.y]] : [[r.x, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]];
      solidPoly(ctx, pts, cam, view, r.x * 0.11);
    }
    for (const h of w.hazards) if (h.type === 'spikes' && visible(cam, view, h.x, h.y, h.w, h.h)) drawSpikes(ctx, h, h.x * 0.07 + h.y);
    for (const f of w.fans) if (visible(cam, view, f.x, f.y, f.w, f.h)) drawFan(ctx, f, t, cam);
    for (const s of w.springs) drawSpring(ctx, s);
    for (const c of w.checks) drawCheckpoint(ctx, c, t);
    for (const h of w.hazards) {
      if (h.type === 'crusher' && visible(cam, view, h.x, cam.y, h.w, view.h)) drawCrusher(ctx, h, t, cam);
      else if (h.type === 'pendulum') drawPendulum(ctx, h, t);
    }
    // handwriting
    for (const tx of w.texts) text(ctx, tx.text, tx.x, tx.y, tx.size || 26, 'rgba(29,42,77,0.72)', -0.025);
    text(ctx, 'START', w.level.start.x - 70, w.level.start.y - 70, 26, RED, -0.06);
    ctx.strokeStyle = RED; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(w.level.start.x - 50, w.level.start.y - 58); ctx.quadraticCurveTo(w.level.start.x - 44, w.level.start.y - 40, w.level.start.x - 46, w.level.start.y - 26); ctx.lineTo(w.level.start.x - 53, w.level.start.y - 33); ctx.moveTo(w.level.start.x - 46, w.level.start.y - 26); ctx.lineTo(w.level.start.x - 39, w.level.start.y - 34); ctx.stroke();
    drawFinish(ctx, w, t);
    for (const b of bots || []) if (!b.w.player.dead) drawPlayer(ctx, b.w.player, t, { color: b.color, alpha: 0.62, name: b.name });
    if (!p.dead) drawPlayer(ctx, p, t);
    ctx.restore();
    ctx.restore(); // page clip
  }

  root.DOD.Render = { drawWorld, fx, pose, text, FONT, INK, RED, PAPER, RULE };
})(typeof window !== 'undefined' ? window : globalThis);
