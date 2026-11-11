'use strict';
// render: canvas drawing, scoreboard, fades, main loop
/* ---------------- render ---------------- */
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function buildCrowd() {
  G.crowd = [];
  for (let row = 0; row < 3; row++) for (let x = -10; x <= 10; x += 0.62) G.crowd.push({ x: x + rand(-0.15, 0.15) + (row % 2) * 0.3, row, ph: rand(0, 6.28), sh: Math.random() < 0.5 });
}
buildCrowd();
function drawBG() {
  ctx.fillStyle = C.void; ctx.fillRect(0, 0, W, H);
  const wallY = Math.round(proj(0, 0, -12.5).y);
  ctx.fillStyle = C.wall; ctx.fillRect(0, 0, W, wallY);
  // dithered light band near the floor
  ctx.fillStyle = C.wall2;
  for (let y = Math.max(0, wallY - 26); y < wallY; y++) { const dense = (y - (wallY - 26)) / 26; for (let x = (y & 1); x < W; x += 2) if (((x * 7 + y * 13) % 10) / 10 < dense) ctx.fillRect(x, y, 1, 1); }
  // banner
  if (G.mode !== 'menu') { const bp = proj(0, 3.6, -12.5); text('VOLLEYSKULL', bp.x, bp.y - 3, C.crowd2, 1, 'c', null); }
  // crowd
  for (const c of G.crowd) {
    const hop = G.hype > 0 ? Math.max(0, Math.sin(G.t * 14 + c.ph)) * 0.25 * Math.min(1, G.hype) : 0;
    const p = proj(c.x, 0.7 + c.row * 0.62 + hop, -12.45 + c.row * 0.01);
    if (p.x < -3 || p.x > W + 3) continue;
    const col = c.sh ? C.crowd2 : C.crowd;
    rect(p.x - 1, p.y - 1, 3, 2, col); rect(p.x - 1, p.y + 1, 3, 1, col);
    if (G.hype > 0.3 && c.sh) { rect(p.x - 2, p.y - 3, 1, 2, col); rect(p.x + 2, p.y - 3, 1, 2, col); }
  }
  ctx.fillStyle = C.floor; ctx.fillRect(0, wallY, W, H - wallY);
  rect(0, wallY, W, 1, C.court2);
  // court
  fillPoly([proj(-4.5, 0, -9), proj(4.5, 0, -9), proj(4.5, 0, 9), proj(-4.5, 0, 9)], C.court);
  const L = (x0, z0, x1, z1, c) => { const a = proj(x0, 0, z0), b = proj(x1, 0, z1); line(a.x, a.y, b.x, b.y, c); };
  L(-4.5, -9, 4.5, -9, C.line); L(-4.5, 9, 4.5, 9, C.line);
  L(-4.5, -9, -4.5, 9, C.line); L(4.5, -9, 4.5, 9, C.line);
  L(-4.5, 0, 4.5, 0, C.lineHi); L(-4.5, 3, 4.5, 3, C.line); L(-4.5, -3, 4.5, -3, C.line);
  // lane guides on our side
  const strong = G.mode === 'play' && (G.phase === 'defend' || G.phase === 'oppPlay' || G.phase === 'pass');
  for (const lx of [-0.95, 0.95]) for (let z = 3.3; z < 9.4; z += 0.5) { const p = proj(lx, 0, z); rect(p.x, p.y, 1, 1, strong ? C.line : C.court2); }
}
function drawShadow(x, z, w, a) {
  const p = pv(x, 0, z);
  const rx = Math.max(1, Math.round(w * p.s)), ry = Math.max(1, Math.round(rx * 0.32));
  ctx.globalAlpha = a; ellipse(p.x, p.y, rx, ry, C.shade); ctx.globalAlpha = 1;
}
function drawMarker() {
  const inc = G.mode === 'mp' ? MP.view && MP.view.inc : G.incoming; if (!inc || inc.done || G.t < inc.tMark) return;
  const blink = ((G.t * 12) | 0) % 2 === 0;
  for (const ex of [inc.x - 0.95, inc.x + 0.95]) for (let z = inc.z - 1.6; z <= inc.z + 1.7; z += 0.5) { const q = pv(ex, 0, z); rect(q.x, q.y, 1, 1, inc.type === 'out' ? C.bad : C.accent); }
  const p = pv(inc.x, 0, inc.z), s = Math.max(2, Math.round(0.2 * p.s));
  const col = inc.type === 'out' ? (blink ? C.bad : C.eye) : blink ? C.accent : C.fire2;
  line(p.x - s, p.y - s * 0.4, p.x + s, p.y + s * 0.4, col); line(p.x - s, p.y + s * 0.4, p.x + s, p.y - s * 0.4, col);
}
const JT = new Float32Array(26);
const BONES = [[0, 1], [1, 8], [2, 3], [2, 4], [4, 6], [3, 5], [5, 7], [8, 9], [9, 11], [8, 10], [10, 12]];
function drawFig(f) {
  const P = f.pose;
  for (let i = 0; i < 26; i++) JT[i] = P[i];
  if (f.moving && !f.air && !f.lock) {
    const s = Math.sin(f.ph), s2 = -s;
    JT[19] += Math.max(0, s) * 0.16; JT[23] += Math.max(0, s) * 0.26;
    JT[21] += Math.max(0, s2) * 0.16; JT[25] += Math.max(0, s2) * 0.26;
    JT[13] += s * 0.07; JT[15] += s2 * 0.07;
    const bob = Math.abs(Math.cos(f.ph)) * 0.04; for (let i = 1; i <= 17; i += 2) JT[i] += bob;
  }
  if (!f.moving && !f.air && (f.tgt === 'ready' || f.tgt === 'stand' || f.tgt === 'setReady')) { const br = Math.sin(G.t * 3.2 + f.x * 1.7 + f.z) * 0.014; for (let i = 1; i <= 17; i += 2) JT[i] += br; }
  if (f.tgt === 'blockReady' && !f.air) { const bo = Math.abs(Math.sin(G.t * 9)) * 0.05; for (let i = 1; i <= 17; i += 2) JT[i] -= bo; }
  if (f.lean) for (let j = 0; j < 8; j++) JT[j * 2] += f.lean * (j === 0 ? 0.36 : j >= 4 ? 0.34 : 0.26);
  const base = pv(f.x, 0, f.z), b = boostAt(base.d);
  const pts = [];
  for (let j = 0; j < 13; j++) pts.push(pv(f.x + JT[j * 2] * b, f.y + JT[j * 2 + 1] * b, f.z));
  const SK = f.skin ? SKIN[f.skin] : null;
  const col = SK ? SK.bone : f.col, sc = base.s * b;
  if (SK && SK.alpha) ctx.globalAlpha = SK.alpha;
  for (const [a, c] of BONES) line(pts[a].x, pts[a].y, pts[c].x, pts[c].y, col);
  // ribcage + pelvis drawn across the spine
  const n = pts[1], h = pts[8]; const vx = h.x - n.x, vy = h.y - n.y, len = Math.hypot(vx, vy) || 1;
  const qx = -vy / len, qy = vx / len, rw = 0.15 * sc;
  for (let i = 0; i < 3; i++) { const t = 0.2 + i * 0.2, cx = n.x + vx * t, cy = n.y + vy * t, w = rw * (1 - i * 0.18); line(cx - qx * w, cy - qy * w, cx + qx * w, cy + qy * w, col); }
  const pw = 0.12 * sc; line(h.x - qx * pw, h.y - qy * pw, h.x + qx * pw, h.y + qy * pw, col);
  // blocker hands are the tell, so they get chunky bright pixels
  if ((f === oB || f === mate) && f.tgt.startsWith('block')) for (const j of [6, 7]) rect(pts[j].x - 1, pts[j].y - 1, 3, 2, f.glow ? C.fire1 : C.bone);
  if (f.glow && (G.mode === 'mp' || G.mode === 'mpOver')) for (const j of [6, 7]) for (let i = 0; i < 3; i++) {
    const fy = pts[j].y - 2 - ((G.t * 16 + i * 2 + j) % 5);
    rect(pts[j].x + Math.round(Math.sin(G.t * 11 + i * 2 + j) * 1.5), fy, 1, 1, i === 0 ? C.fire1 : i === 1 ? C.fire2 : C.fire3);
  }
  // skull
  const r = Math.max(1, Math.round(0.15 * sc)), hx = Math.round(pts[0].x), hy = Math.round(pts[0].y);
  const facing = f.front !== FLIP, acc = SK && SK.acc;
  if (acc === 'pumpkin') { disc(hx, hy, r + 1, '#e07b2a'); rect(hx - 1, hy - r - 1, 1, 2, '#c4621a'); rect(hx + 1, hy - r - 1, 1, 2, '#c4621a'); rect(hx, hy - r - 3, 1, 2, '#3d6b2f'); }
  else disc(hx, hy, r, col);
  if (acc === 'pumpkin') { if (facing && r >= 2) { rect(hx - 2, hy - 1, 1, 1, '#ffe08a'); rect(hx + 2, hy - 1, 1, 1, '#ffe08a'); rect(hx - 1, hy + 1, 3, 1, '#ffe08a'); } }
  else if (facing) {
    const glow = G.t - AI.planT < 2.2 && G.mode === 'play' && ((G.t * 8) | 0) % 2 === 0;
    if (glow && r >= 2) { rect(hx - 2, hy - 1, 2, 2, C.eye); rect(hx + 1, hy - 1, 2, 2, C.eye); }
    else if (r >= 2) { rect(hx - 1, hy, 1, 1, C.eye); rect(hx + 1, hy, 1, 1, C.eye); if (r >= 3) rect(hx, hy + 2, 1, 1, C.ink); }
    else rect(hx, hy, 1, 1, C.eye);
  } else if (r >= 2) rect(hx + r - 1, hy + 1, 1, 1, C.boneDim);
  if (acc === 'bandana') {
    rect(hx - r, hy - r, 2 * r + 1, Math.max(1, r - 1), SK.band); rect(hx + r, hy - 1, 2, 1, SK.band); rect(hx + r + 1, hy, 1, 1, SK.band);
    if (facing && r >= 2) rect(hx - 2, hy - 1, 2, 2, C.ink);
  } else if (acc === 'horns') {
    const hc = '#3a1414'; rect(hx - r, hy - r - 1, 1, 2, hc); rect(hx - r - 1, hy - r - 2, 1, 1, hc); rect(hx + r, hy - r - 1, 1, 2, hc); rect(hx + r + 1, hy - r - 2, 1, 1, hc);
  } else if (acc === 'crown') {
    const cc = '#ffd75a'; rect(hx - r, hy - r - 2, 2 * r + 1, 2, cc); rect(hx - r, hy - r - 3, 1, 1, cc); rect(hx, hy - r - 4, 1, 2, cc); rect(hx + r, hy - r - 3, 1, 1, cc); rect(hx, hy - r - 2, 1, 1, C.bad);
  }
  if (SK && SK.fx === 'ember') for (let i = 0; i < 3; i++) {
    const ex = hx + Math.round(Math.sin(G.t * 7 + i * 2.1 + f.x) * (r + 1)), ey = hy - r - 1 - ((G.t * 14 + i * 3) % 5);
    rect(ex, ey, 1, 1, i === 0 ? C.fire1 : C.fire2);
  }
  if (f.band && acc !== 'bandana') {
    const yb = hy - Math.floor(r / 3), w = Math.floor(Math.sqrt(Math.max(0, r * r + r * 0.8 - (yb - hy) ** 2)));
    const fire = G.mode === 'mp' ? MP.view && MP.view.fire : G.fire && G.mode === 'play';
    rect(hx - w, yb, 2 * w + 1, 1, fire ? C.fire2 : SK ? SK.band : C.accent);
  }
  ctx.globalAlpha = 1;
  f._head = { x: hx, y: hy, r };
}
function drawBall() {
  if (ball.mode === 'none') return;
  for (let i = 0; i < ball.trail.length; i++) {
    const q = pv(ball.trail[i].x, ball.trail[i].y, ball.trail[i].z), tr = Math.max(0, Math.round(0.14 * q.s) - (ball.trail.length - i));
    ctx.globalAlpha = 0.12 + 0.1 * i; disc(q.x, q.y, tr, ball.fire ? C.fire2 : C.boneMid);
  }
  ctx.globalAlpha = 1;
  const p = pv(ball.x, ball.y, ball.z), r = clamp(Math.round(0.14 * p.s), 1, 5);
  if (ball.fire) disc(p.x, p.y, r + 1, C.fire2);
  disc(p.x, p.y, r, C.boneMid);
  if (r >= 2) disc(p.x - 0.6, p.y - 0.6, r - 1, ball.fire ? C.fire1 : C.bone);
  if (r >= 2) { const a = ball.spin, ca = Math.cos(a) * (r - 0.5), sa = Math.sin(a) * (r - 0.5); line(p.x - ca, p.y - sa, p.x + ca, p.y + sa, C.boneDim); }
}
function drawNet() {
  const top = 2.43, bot = 1.45, wob = G.netWob;
  for (const sx of [-1, 1]) { const a = proj(sx * 4.95, 0, 0), b = proj(sx * 4.95, 2.6, 0); line(a.x, a.y, b.x, b.y, C.post); line(a.x + sx, a.y, b.x + sx, b.y, C.boneDim); }
  ctx.globalAlpha = 0.5;
  for (let x = -4.5; x <= 4.51; x += 0.3) {
    const w = wob * Math.sin(x * 2.3 + G.t * 40) * 0.12;
    const a = proj(x + w, top, 0), b = proj(x - w, bot, 0); line(a.x, a.y, b.x, b.y, C.netDim);
  }
  for (let y = bot; y <= top + 0.01; y += 0.245) { const a = proj(-4.5, y, 0), b = proj(4.5, y, 0); line(a.x, a.y, b.x, b.y, C.netDim); }
  ctx.globalAlpha = 1;
  const a = proj(-4.5, top + wob * 0.04 * Math.sin(G.t * 50), 0), b = proj(4.5, top, 0);
  line(a.x, a.y, b.x, b.y, C.bone); line(a.x, a.y + 1, b.x, b.y + 1, C.boneMid);
  // block zone on the net tape (assist on Leicht and Normal)
  const A = G.attack;
  const B = G.mode === 'mp' ? MP.view && MP.view.blk : null;
  const showMp = B && B.mine && MP.level < 2;
  if (showMp || (A && A.shown && A.shown !== 'D' && G.level < 2 && G.mode === 'play')) {
    const sd = showMp ? (B.v === 'W' ? 'W' : B.v < 0 ? 'L' : 'R') : A.shown, cx = showMp ? B.cx : A.C.x;
    const span = sd === 'L' ? [cx - 1.8, cx + 0.15] : sd === 'R' ? [cx - 0.15, cx + 1.8] : [cx - 1.8, cx + 1.8];
    const p = pv(clamp(span[0], -4.5, 4.5), top, 0), q = pv(clamp(span[1], -4.5, 4.5), top, 0);
    line(p.x, p.y - 1, q.x, q.y - 1, C.bad); line(p.x, p.y, q.x, q.y, C.bad);
  }
  const c = proj(-4.5, bot, 0), d = proj(4.5, bot, 0); line(c.x, c.y, d.x, d.y, C.boneDim);
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { const p = proj(sx * 4.5, top + i * 0.2, 0), q = proj(sx * 4.5, top + (i + 1) * 0.2, 0); line(p.x, p.y, q.x, q.y, i % 2 ? C.bone : C.bad); }
}
function drawParts() {
  for (const p of G.parts) { const q = pv(p.x, p.y, p.z); const s = q.s > 22 ? 2 : 1; rect(q.x, q.y, s, s, p.c); }
}
function drawRing() {
  let tc = null;
  if (G.mode === 'mp') tc = MP.view && MP.view.ring;
  else if (G.phase === 'attack' && G.attack && !G.attack.hit) tc = G.attack.tc;
  else if (G.phase === 'serveToss' && G.serve && !G.serve.hit) tc = G.serve.tp;
  if (tc == null) return;
  const u = (G.t - (tc - RING)) / RING; if (u < 0) return;
  const p = pv(ball.x, ball.y, ball.z), rb = clamp(Math.round(0.14 * p.s), 1, 5);
  const r = Math.max(rb + 1, lerp(17, rb + 1, Math.min(1, u)));
  const hot = Math.abs(G.t - tc) < 0.075;
  ring(p.x, p.y, r, hot ? C.accent : (u > 1 ? C.bad : C.boneMid));
  if (hot) ring(p.x, p.y, r + 1, C.accent);
}
function drawHUD() {
  const cx = W / 2;
  if (hint && (G.mode === 'play' || G.mode === 'mp')) {
    const a = Math.min(1, (G.t - hintT) * 4) * (0.65 + 0.35 * Math.sin(G.t * 6));
    ctx.globalAlpha = a; text(hint, cx, Math.round(H * 0.69), C.bone, 1, 'c'); ctx.globalAlpha = 1;
  }
}
/* scoreboard: HTML on top of the canvas, touched only when something changes */
const BD = { el: $('#board'), sc: [$('#sc0'), $('#sc1')], last: [-1, -1], srv: [$('#srvL'), $('#srvR')], mt: $('#meterBar'), wall: $('#wallBar'), chip: $('#sbChip'), key: '', mkey: '', wkey: '', ckey: '', skin: '', mp: null };
function updBoard() {
  const on = G.mode === 'play' || G.mode === 'mp';
  if (BD.el.hidden === on) BD.el.hidden = !on;
  if (!on) { BD.last = [-1, -1]; return; }
  const mpv = G.mode === 'mp' && MP.view;
  const SC = mpv ? mpv.score : G.score, SV = mpv ? mpv.server : G.server, MT = mpv ? mpv.meter : G.meter, FI = mpv ? mpv.fire : G.fire;
  if (BD.skin !== mySkin || BD.mp !== !!mpv) {
    BD.skin = mySkin; BD.mp = !!mpv;
    $('#sbImgL').src = skinIcon(SKIN[mySkin]); $('#sbImgR').src = skinIcon(null, true);
    $('#sbNameL').textContent = mpv ? 'US' : 'YOU'; $('#sbNameR').textContent = mpv ? 'THEM' : ['EASY', 'CPU', 'HARD'][G.level] || 'CPU';
  }
  for (let i = 0; i < 2; i++) {
    if (SC[i] === BD.last[i]) continue;
    const el = BD.sc[i]; el.textContent = pad2(SC[i]);
    if (BD.last[i] >= 0 && SC[i] > BD.last[i] && !reduceMotion) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
    BD.last[i] = SC[i];
  }
  BD.srv[0].classList.toggle('on', SV === 0); BD.srv[1].classList.toggle('on', SV === 1);
  $('#sbR').classList.toggle('flare', G.mode === 'play' && G.t - AI.planT < 2.2);
  // singleplayer: the fireball bar only with Spike 85 (fireOn), Hot Hand shortens it
  const MM = mpv ? BAL.meterMax : meterMax(), mon = !!mpv || fireOn();
  const mk = MT + '|' + FI + '|' + MM + '|' + mon;
  if (mk !== BD.mkey) {
    BD.mkey = mk; BD.mt.hidden = !mon;
    if (BD.mt.children.length !== MM) BD.mt.innerHTML = '<i></i>'.repeat(MM);
    for (let i = 0; i < MM; i++) BD.mt.children[i].className = i < MT ? 'on' : '';
    BD.mt.classList.toggle('fire', !!FI);
  }
  const wl = mpv && MP.role === 1 && mpv.wall != null ? mpv.wall : -1, wk = String(wl);
  if (wk !== BD.wkey) {
    BD.wkey = wk; BD.wall.hidden = wl < 0;
    if (wl >= 0) {
      if (BD.wall.children.length !== WALLMAX) BD.wall.innerHTML = '<i></i>'.repeat(WALLMAX);
      for (let i = 0; i < WALLMAX; i++) BD.wall.children[i].className = i < wl ? 'on' : '';
      BD.wall.classList.toggle('full', wl >= WALLMAX);
    }
  }
  // match point / deuce
  const [a, b] = SC, hi = Math.max(a, b);
  const ck = hi >= 14 ? (a === b ? 'DEUCE' : Math.abs(a - b) === 1 ? (a > b ? 'MATCH POINT' : 'THEIR MATCH POINT') : '') : '';
  if (ck !== BD.ckey) {
    BD.ckey = ck; BD.chip.hidden = !ck; BD.chip.textContent = ck;
    BD.chip.className = 'chip' + (ck === 'THEIR MATCH POINT' ? ' bad' : '');
  }
}
function drawFx() {
  for (const f of G.fx) {
    const u = (G.t - f.t0) / f.dur, p = pv(f.x, f.y, f.z), r0 = clamp(Math.round(0.14 * p.s), 1, 5) + 1;
    ctx.globalAlpha = 1 - u; ring(p.x, p.y, lerp(r0, f.r1, 1 - (1 - u) * (1 - u)), f.col);
  }
  ctx.globalAlpha = 1;
}
// ordered dither fade between rallies, built from 4x4 Bayer patterns
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const FADE_PAT = [];
for (let lv = 1; lv <= 16; lv++) {
  const c = document.createElement('canvas'); c.width = c.height = 4; const g = c.getContext('2d'); g.fillStyle = C.void;
  for (let i = 0; i < 16; i++) if (BAYER[i] < lv) g.fillRect(i % 4, (i / 4) | 0, 1, 1);
  FADE_PAT.push(ctx.createPattern(c, 'repeat'));
}
function drawFade() {
  const lv = Math.round(G.fade * 16); if (lv <= 0) return;
  ctx.fillStyle = FADE_PAT[Math.min(16, lv) - 1]; ctx.fillRect(0, 0, W, H);
}
function drawPops() {
  for (let i = G.pops.length - 1; i >= 0; i--) {
    const p = G.pops[i], age = G.t - p.t0;
    if (age > p.dur) { G.pops.splice(i, 1); continue; }
    if (age > p.dur * 0.72 && ((G.t * 20) | 0) % 2) continue;
    const pop = p.big ? Math.min(1, age / 0.08) : 1;
    const sc = p.big && pop < 1 ? 1 : p.sc;
    const w = tw(p.s, sc);
    const x = clamp(p.x, w / 2 + 2, W - w / 2 - 2);
    text(p.s, x, p.y - age * (p.big ? 6 : 14), p.col, sc, 'c');
  }
}
function drawFireHead() {
  const mpm = G.mode === 'mp', who = mpm ? (MP.mySlot >= 0 ? tfig(MP.team, MP.role) : null) : me;
  if (!(mpm ? MP.view && MP.view.fire : G.fire && G.mode === 'play') || !who || !who._head) return;
  const h = who._head;
  for (let i = 0; i < 6; i++) {
    const fx = h.x + Math.round(Math.sin(G.t * 9 + i * 1.7) * h.r * 0.8);
    const fy = h.y - h.r - 1 - ((G.t * 18 + i * 3) % 6);
    rect(fx, fy, 1, 1, i % 3 === 0 ? C.fire1 : i % 3 === 1 ? C.fire2 : C.fire3);
  }
}
function render() {
  ctx.save();
  if (G.shake > 0.3) ctx.translate(Math.round(Math.sin(G.t * 61) * G.shake), Math.round(Math.cos(G.t * 47) * G.shake * 0.6));
  drawBG();
  for (const f of FIGS) drawShadow(f.x, f.z, f.air ? 0.22 : 0.3, 0.45);
  if (ball.mode !== 'none' && ball.mode !== 'held') drawShadow(ball.x, ball.z, 0.15, clamp(0.6 - ball.y * 0.07, 0.2, 0.6));
  drawMarker();
  const vz = z => FLIP ? -z : z;
  const items = FIGS.map(f => ({ z: (f === oB || f === mate) && vz(f.z) > -1.3 && vz(f.z) < 0 ? 0.3 : vz(f.z), fn: () => drawFig(f) }));
  items.push({ z: 0, fn: drawNet });
  items.push({ z: vz(ball.z) + (ball.mode === 'held' ? 0.2 : 0), fn: drawBall });
  items.sort((a, b) => a.z - b.z);
  for (const it of items) it.fn();
  drawFireHead();
  drawParts();
  drawRing();
  drawFx();
  ctx.restore();
  drawFade();
  if (G.flash > 0) { ctx.globalAlpha = Math.min(0.5, G.flash * 0.5); rect(0, 0, W, H, C.fire1); ctx.globalAlpha = 1; }
  if (G.mode === 'play' || G.mode === 'mp') drawHUD();
  updBoard();
  drawPops();
}

/* ---------------- main loop ---------------- */
function updCam(dt) {
  let tx = 0, tz = DZ + CAM0.off;
  if (G.mode === 'play' || G.mode === 'over') tz = Math.max(DZ + CAM0.off, me.z + CAM0.off - 0.6);
  else if ((G.mode === 'mp' || G.mode === 'mpOver') && MP.mySlot >= 0) { const b = tfig(MP.team, 0); tz = Math.max(DZ + CAM0.off, (FLIP ? -b.z : b.z) + CAM0.off - 0.6); }
  CAM.x += (tx - CAM.x) * Math.min(1, dt * 4);
  CAM.z += (tz - CAM.z) * Math.min(1, dt * 3);
}
function update(dt) {
  if (G.mode === 'mp' || G.mode === 'mpOver') { mpUpdate(dt); return; }
  if (G.fadeV) { G.fade = clamp(G.fade + G.fadeV * dt, 0, 1); if (G.fade <= 0 || G.fade >= 1) G.fadeV = 0; }
  if (G.stop > 0) { G.stop -= dt; return; }
  const s = G.slow > 0 ? 0.35 : 1;
  G.slow -= dt;
  const gdt = dt * s;
  G.t += gdt;
  runEv();
  for (const f of FIGS) updFig(f, gdt);
  updBall(gdt);
  updParts(gdt);
  updCam(dt);
  G.shake = Math.max(0, G.shake - dt * 16);
  G.flash = Math.max(0, G.flash - dt * 3);
  G.netWob = Math.max(0, G.netWob - dt * 2.2);
  G.hype = Math.max(0, G.hype - dt);
  for (let i = G.fx.length - 1; i >= 0; i--) if (G.t - G.fx[i].t0 > G.fx[i].dur) G.fx.splice(i, 1);
}
let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05; if (dt < 0) dt = 0;
  if ((!G.paused || G.mode === 'mp') && !G.freeze) update(dt);
  render();
  requestAnimationFrame(frame);
}

