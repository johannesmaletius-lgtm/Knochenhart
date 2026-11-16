'use strict';
// powers: singleplayer power-ups (SKILLS.items: Fireball, Ghost Dig, Power Block, Bone Time) and the campaign opponents'
// items + boss abilities (SKILLS.camp.chapters[].ab). Engine/AI/render call the pw* hooks; MP does not use any of this.
// Pure helpers first (Node module for tests/powers.test.js), browser part below.
if (typeof SKILLS === 'undefined' && typeof require === 'function') Object.assign(globalThis, require('./skills.js'));
/* ---------------- pure ---------------- */
// weighted pick from { kind: weight } with r in [0, 1)
function pwPick(w, r) {
  const ks = Object.keys(w).filter(k => w[k] > 0), tot = ks.reduce((a, k) => a + w[k], 0);
  let x = r * tot;
  for (const k of ks) { x -= w[k]; if (x < 0) return k; }
  return ks[ks.length - 1];
}
// our item weights (Fireball more often with the Spike 85 unlock)
function pwWeights(fireUnlocked) {
  const I = SKILLS.items, w = Object.assign({}, I.w);
  if (fireUnlocked) w.fire *= I.fireUnlock;
  return w;
}
// points a campaign opponent must win for one item (chapter ch), bosses gain bossMul per point
function pwOppNeed(ch) { const m = SKILLS.items.opp.meter; return Math.max(m[2], Math.round(m[0] + m[1] * ch)); }
// abilities a Royal Decree can pick
const PW_DECREE = () => SKILLS.camp.chapters.map(c => c.ab && c.ab.id).filter(id => id && id !== 'wind' && id !== 'decree');

if (typeof module !== 'undefined' && typeof document === 'undefined') module.exports = { pwPick, pwWeights, pwOppNeed, PW_DECREE };

/* ---------------- browser ---------------- */
// item = our held item; ghost/wall/slow = our active effects; oArm = their armed item; oWall = their power block (until the
// point); om = their item meter; ab/abK = stage ability; dec = Royal Decree pick of this rally; dark = blackout rally;
// frozen = G.t until you cannot move; hide = [t0, t1] ball invisible; decoy = fake ball; windAt = score sum of the last wind
const PW = { item: null, drop: null, coins: [], ghost: false, wall: false, slow: false, oArm: null, oWall: false, om: 0, ab: null, abK: 1, boss: false,
  items: false, ch: 0, dec: null, dark: false, frozen: 0, hide: null, decoy: null, windAt: -9 };
const pwSP = () => G.mode === 'play';
function pwReset() {
  const s = CA.on ? caStages()[CA.i] : null;
  Object.assign(PW, { item: null, drop: null, coins: [], ghost: false, wall: false, slow: false, oArm: null, oWall: false, om: 0, dec: null, dark: false,
    frozen: 0, hide: null, decoy: null, windAt: -9, ab: s && s.ab, abK: s ? s.abK : 1, boss: !!(s && s.boss), items: !!(s && s.items), ch: s ? s.ch : 0 });
  pwUI();
  if (PW.boss && PW.items) after(2.6, () => { if (!PW.oArm) pwOppItem(); }); // bosses start with an item
  if (PW.ab) after(1.2, () => popup((PW.boss ? 'BOSS: ' : '') + PW.ab.n.toUpperCase(), C.bad, 1, null, H * 0.36, 2.2));
}
// chance of ability id right now (0 = off): the stage's own ability, or this rally's Royal Decree pick
function pwAb(id) {
  if (!pwSP() || !PW.ab) return 0;
  const A = PW.ab.id === id ? PW.ab : PW.ab.id === 'decree' && PW.dec === id ? SKILLS.camp.chapters.find(c => c.ab && c.ab.id === id).ab : null;
  return A ? (A.p != null ? A.p : 1) * PW.abK * (PW.ab.id === 'decree' ? PW.ab.p : 1) : 0;
}
const pwAbV = id => SKILLS.camp.chapters.find(c => c.ab && c.ab.id === id).ab;
const pwRoll = id => { const p = pwAb(id); return p > 0 && Math.random() < p; };
const pwSay = (s, col, y = 0.4) => popup(s, col || C.accent, 1, null, H * y, 1.3);

/* our items: a full bar drops one on the floor of your court, in another lane; walk over it to pick it up */
const PW_COL = { fire: '#f39a3c', ghost: '#bfe3ff', wall: '#6fb8ff', slow: '#c08bff' };
function pwDrop() {
  if (!pwSP() || PW.item || PW.drop) return;
  const kind = pwPick(pwWeights(unlocked(PROFILE, 'fireball')), Math.random()), lane = pick([0, 1, 2].filter(l => l !== me.lane));
  PW.drop = { kind, lane, x: LX[lane], z: DZ, t0: G.t };
  SFX.tick(); pwSay(SKILLS.items.short[kind] + ' ON THE FLOOR', PW_COL[kind], 0.4);
}
// every frame (render.js update): pick up, or the drop fades after items.life s
function pwTick() {
  if (!pwSP()) return;
  // floor coins (SKILLS.items.coin): walk over them, they fade after coin.life s
  const K = SKILLS.items.coin;
  for (let i = PW.coins.length - 1; i >= 0; i--) {
    const c = PW.coins[i];
    if (Math.abs(me.x - c.x) < SKILLS.items.reach && Math.abs(me.z - c.z) < 1.4) {
      PW.coins.splice(i, 1); addCoins(c.v); G.stats.coins = (G.stats.coins || 0) + c.v; SFX.tick();
      sparks(c.x, 0.3, c.z, 6, ['#f5c85f', '#ffffff']); const p = pv(c.x, 0.6, c.z); popup('+' + c.v, '#f5c85f', 1, p.x, p.y - 6, 0.7);
    } else if (G.t - c.t0 > K.life) PW.coins.splice(i, 1);
  }
  const d = PW.drop; if (!d) return;
  if (Math.abs(me.x - d.x) < SKILLS.items.reach && Math.abs(me.z - d.z) < 1.4) { PW.drop = null; pwGive(d.kind); sparks(d.x, 0.3, d.z, 10, [PW_COL[d.kind], '#ffffff']); }
  else if (G.t - d.t0 > SKILLS.items.life) { PW.drop = null; G.meter = 0; }
}
function pwGive(kind) {
  PW.item = kind || pwPick(pwWeights(unlocked(PROFILE, 'fireball')), Math.random());
  G.flash = 0.25; SFX.fire(); pwSay(SKILLS.items.names[PW.item].toUpperCase() + '!', C.fire2, 0.32);
  if (!store.get('itemTip', 0)) { store.set('itemTip', 1); after(1.1, () => pwSay('TAP THE ITEM BUTTON', C.bone, 0.4)); }
  pwUI();
}
function pwUse() {
  if (!pwSP() || G.paused || !PW.item) return;
  const k = PW.item; PW.item = null; G.meter = 0;
  if (k === 'fire') { G.fire = true; G.flash = 0.5; SFX.fire(); }
  else if (k === 'ghost') { PW.ghost = true; SFX.plan(); }
  else if (k === 'wall') { PW.wall = true; PW.wallT = G.t; SFX.block(); G.netWob = 1; shake(2); }
  else if (k === 'slow') { PW.slow = true; SFX.plan(); }
  pwSay(SKILLS.items.names[k].toUpperCase(), k === 'fire' ? C.fire2 : C.accent, 0.36);
  pwUI();
}
// Ghost Dig: a ball that would drop on our side is saved (ours or theirs armed)
function pwGhostSave(inc) {
  if (!PW.ghost) return false;
  PW.ghost = false; pwUI();
  ghostFx(ball.x, ball.z, '#bfe3ff'); pwSay('GHOST DIG!', '#bfe3ff', 0.5);
  if (inc) AI.defended(inc, false);
  return true;
}
function pwOppGhost() {
  if (!pwSP() || PW.oArm !== 'ghost') return false;
  PW.oArm = null;
  after(0.25, () => { ghostFx(oA.x, oA.z, '#bfe3ff'); pwSay('THEIR GHOST DIG!', C.bad, 0.3); });
  return true;
}
function ghostFx(x, z, col) {
  for (let i = 0; i < 14; i++) G.parts.push({ x: x + rand(-0.5, 0.5), y: rand(0.1, 1.6), z: z + rand(-0.3, 0.3), vx: rand(-0.4, 0.4), vy: rand(0.8, 2), vz: 0, age: 0, life: rand(0.5, 0.9), c: pick([col, '#ffffff', '#8fb7d6']) });
  SFX.touch();
}
// Bone Time: their flights x slowK; use = this is their next attack/serve, the effect ends with it (one attack only)
function pwSlow(use) {
  if (!pwSP() || !PW.slow) return 1;
  if (use) { PW.slow = false; pwUI(); }
  return SKILLS.items.slowK;
}
// one attack only: after our attack their Power Block and Ghost Dig are gone, an unused Fireball too (lob / late hit)
function pwAttackDone() {
  if (!pwSP()) return;
  G.fire = false;
  after(0.2, () => { PW.oWall = false; if (PW.oArm === 'ghost') { PW.oArm = null; pwSay('THEIR GHOST FADES', C.boneDim, 0.3); } });
}
// after their ball reached you (dug, saved or missed): our Ghost Dig is used up, the Power Block too unless it was a serve
function pwDefDone(inc) { if (!pwSP()) return; PW.ghost = false; if (!inc || inc.type !== 'serve') PW.wall = false; }

/* their items + abilities: hooks */
function pwOppItem(kind) {
  PW.oArm = kind || pwPick(Object.fromEntries(SKILLS.items.opp.kinds.map(k => [k, 1])), Math.random());
  pwSay((PW.boss ? 'BOSS ' : 'THEY ') + 'GOT ' + SKILLS.items.names[PW.oArm].toUpperCase(), C.bad, 0.3);
}
// new rally: blackout, Royal Decree pick
function pwRally() {
  if (!pwSP()) return;
  // floor coin: sometimes one lies in a lane of your court
  const K = SKILLS.items.coin;
  if (PW.coins.length < K.max && Math.random() < K.p) { const l = (Math.random() * 3) | 0; PW.coins.push({ x: LX[l] + rand(-0.2, 0.2), z: DZ + rand(-0.3, 0.3), t0: G.t, v: K.v }); }
  PW.hide = null; PW.decoy = null; PW.frozen = 0;
  PW.dec = PW.ab && PW.ab.id === 'decree' ? pick(PW_DECREE()) : null;
  if (PW.dec) after(0.6, () => pwSay('DECREE: ' + pwAbV(PW.dec).n.toUpperCase(), '#ffd75a', 0.34));
  PW.dark = pwRoll('dark');
  if (PW.dark) after(0.4, () => { pwSay('BLACKOUT!', C.bad, 0.34); SFX.plan(); });
}
// a point: effects end, their meter, Second Wind, Plunder
function pwPoint(w) {
  if (!pwSP()) return;
  PW.wall = PW.slow = PW.oWall = false; PW.dark = false; PW.hide = null; PW.decoy = null;
  const [a, b] = G.score;
  if (w === 1 && PW.item && pwAb('plunder') && SKILLS.items.opp.kinds.includes(PW.item) && !PW.oArm) {
    PW.oArm = PW.item; PW.item = null; G.meter = 0; pwSay('PLUNDERED!', C.bad, 0.3);
  } else if (w === 1 && PW.item && pwAb('plunder')) { PW.item = null; G.meter = 0; pwSay('PLUNDERED!', C.bad, 0.3); }
  if (PW.items && !PW.oArm && w === 1) {
    PW.om += PW.boss ? SKILLS.items.opp.bossMul : 1;
    if (PW.om >= pwOppNeed(PW.ch)) { PW.om = 0; pwOppItem(); }
  }
  if (pwAb('wind') && !PW.oArm && a - b >= pwAbV('wind').gap && a + b - PW.windAt >= pwAbV('wind').cd) {
    PW.windAt = a + b; pwSay('SECOND WIND!', C.bad, 0.3); pwOppItem();
  }
  pwUI();
}
// our attack starts: their power block (item or Hellwall)
function pwAttackStart() {
  if (!pwSP() || PW.oWall) return;
  if (PW.oArm === 'wall') PW.oArm = null; else if (!pwRoll('hellwall')) return;
  PW.oWall = true; PW.oWallT = G.t; G.netWob = 1; SFX.block(); shake(2);
  pwSay('POWER BLOCK! LOB IT', C.bad, 0.42);
  setBase(oB, 'blockW'); setPose(oB, 'blockW', 0, 22); oB.tx = 0; oB.tz = BLK_Z;
}
// their set: a fireball (item or Meteor)? Our power block forces a tip
function pwOppHot() {
  if (!pwSP()) return false;
  if (PW.oArm === 'fire') { PW.oArm = null; return true; }
  return pwRoll('meteor');
}
// Plunder: cannon serve flight factor
function pwCannon() {
  if (!pwRoll('plunder')) return 1;
  after(0.05, () => { pwSay('CANNON!', C.bad, 0.36); shake(4); SFX.spike(); sparks(ball.x, ball.y, ball.z, 10, ['#888', '#bbb', C.fire2]); });
  return pwAbV('plunder').T;
}
// their spike / serve just flew: freeze, strobe, decoy, phase shift
function pwOppHit(inc, T, kind) {
  if (!pwSP() || !inc) return;
  if (pwRoll('freeze')) {
    PW.frozen = G.t + pwAbV('freeze').t;
    pwSay('FROZEN!', '#a9dcff', 0.5); SFX.block();
    for (let i = 0; i < 10; i++) G.parts.push({ x: me.x + rand(-0.4, 0.4), y: rand(0.2, 1.8), z: me.z, vx: rand(-0.5, 0.5), vy: rand(-0.2, 0.6), vz: 0, age: 0, life: rand(0.3, 0.6), c: pick(['#a9dcff', '#ffffff']) });
  }
  if (kind !== 'spike') return;
  if (pwRoll('strobe')) { const h = pwAbV('strobe').hide; PW.hide = [G.t + T * h[0], G.t + T * h[1]]; G.flash = 0.3; }
  if (pwRoll('decoy')) {
    const ls = [0, 1, 2].filter(l => l !== inc.lane), dl = pick(ls);
    PW.decoy = { p0: { x: ball.x, y: ball.y, z: ball.z }, to: { x: LX[dl], y: 0.85, z: DZ + 0.1 }, t0: G.t, T, lane: dl, tMark: inc.tMark };
  }
  if (pwRoll('phase')) {
    at(G.t + T * pwAbV('phase').at, () => {
      if (G.incoming !== inc || inc.done) return;
      const nl = inc.lane === 0 ? 1 : inc.lane === 2 ? 1 : pick([0, 2]);
      inc.lane = nl; inc.x = LX[nl];
      sparks(ball.x, ball.y, ball.z, 8, ['#bfe3ff', '#ffffff']); SFX.touch();
      launch({ x: LX[nl], y: 0.85, z: DZ + 0.1 }, Math.max(0.05, inc.tArr - G.t), { spin: 22 });
    });
  }
}
// skeleton arms over the whole net: grow out of the tape in 0.25 s, sway, hands open and grab; side 1 = our side, -1 = theirs.
// Pairs lean towards each other like a real block; bones 2 px with a dark edge, knobby elbow, palm + 4 fingers + thumb
function pwArms(t0, side, glow) {
  const g = clamp((G.t - t0) / 0.25, 0, 1), n = SKILLS.items.arms, z = side * 0.12;
  // glowing tape under the arms
  const l = pv(-4.7, 2.43, z), r = pv(4.7, 2.43, z);
  ctx.globalAlpha = 0.55 + 0.3 * Math.sin(G.t * 9); line(l.x, l.y - 1, r.x, r.y - 1, glow, 2); ctx.globalAlpha = 1;
  for (let i = 0; i < n; i++) {
    const x = -4.4 + 8.8 * i / (n - 1), lean = (i % 2 ? -1 : 1) * 0.16, sw = Math.sin(G.t * 4 + i * 1.3) * 0.07;
    const a = pv(x, 2.43, z), e = pv(x - lean * 0.6 + sw * 0.4, 2.43 + 0.55 * g, z), h = pv(x + lean + sw, 2.43 + 1.15 * g, z);
    const u = Math.max(1, Math.round(0.03 * h.s));
    // shadow edge, glow edge, bone
    line(a.x - u, a.y, e.x - u, e.y, C.ink, u + 1); line(e.x - u, e.y, h.x - u, h.y, C.ink, u + 1);
    line(a.x + u, a.y, e.x + u, e.y, glow, u); line(e.x + u, e.y, h.x + u, h.y, glow, u);
    line(a.x, a.y, e.x, e.y, C.bone, u + 1); line(e.x, e.y, h.x, h.y, C.boneMid, u + 1);
    rect(e.x - u - 1, e.y - u, 2 * u + 3, 2 * u + 1, C.bone); rect(e.x - u - 1, e.y + u, 2 * u + 3, 1, C.boneDim); // elbow knob
    if (g < 0.6) continue;
    // hand sprite (u px per pixel): palm 7 x 3, four fingers with a gap, curled now and then, thumb to the side
    const grab = ((G.t * 3 + i * 0.37) % 2) < 0.25, fl = grab ? 1 : 3;
    const px = Math.round(h.x) - 3 * u, py = Math.round(h.y) - u;
    rect(px - 1, py - 1, 7 * u + 2, 3 * u + 2, C.ink); rect(px, py, 7 * u, 3 * u, C.boneMid); rect(px, py, 7 * u, u, C.bone);
    for (let f = 0; f < 4; f++) {
      const fx = px + 2 * f * u;
      rect(fx - 1, py - fl * u - 1, u + 2, fl * u + 1, C.ink); rect(fx, py - fl * u, u, fl * u, C.bone);
    }
    const th = (i % 2 ? -1 : 1) > 0 ? px + 7 * u : px - 2 * u; rect(th, py + u, 2 * u, u, C.bone);
  }
}
const pwFrozen = () => pwSP() && G.t < PW.frozen;
const pwHidden = () => pwSP() && PW.hide && G.t > PW.hide[0] && G.t < PW.hide[1];

/* drawing (render.js) */
function pwDraw() {
  if (!pwSP()) return;
  // floor coins: spinning gold, blink before they fade
  for (const c of PW.coins) {
    if (SKILLS.items.coin.life - (G.t - c.t0) < 2 && ((G.t * 10) | 0) % 2) continue;
    const p = pv(c.x, 0.15, c.z), s = Math.max(3, Math.round(0.17 * p.s)), w = Math.max(1, Math.round(s * (0.35 + 0.65 * Math.abs(Math.cos(G.t * 4 + c.x)))));
    rect(p.x - w, p.y - s, 2 * w, 2 * s, '#b8862a'); if (w > 1) rect(p.x - w + 1, p.y - s + 1, 2 * w - 2, 2 * s - 2, '#f5c85f');
  }
  // item on the floor: blinking box with its short name, blinks faster before it fades
  const fd = PW.drop;
  if (fd) {
    const left = SKILLS.items.life - (G.t - fd.t0), bl = left < 3 ? ((G.t * 10) | 0) % 2 : 1;
    if (bl) {
      const p = pv(fd.x, 0.15 + 0.08 * Math.sin(G.t * 5), fd.z), s = Math.max(3, Math.round(0.22 * p.s));
      ctx.globalAlpha = 0.4; ellipse(p.x, Math.round(pv(fd.x, 0, fd.z).y), s + 2, Math.max(1, (s + 2) >> 2), C.shade); ctx.globalAlpha = 1;
      rect(p.x - s, p.y - s, 2 * s, 2 * s, C.ink); rect(p.x - s + 1, p.y - s + 1, 2 * s - 2, 2 * s - 2, PW_COL[fd.kind]);
      text(SKILLS.items.short[fd.kind], p.x, p.y - s - 9, PW_COL[fd.kind], 1, 'c');
    }
  }
  // power blocks: a row of skeleton arms reaching up out of the net (ours: bone + blue, theirs: bone + red)
  if (PW.wall) pwArms(PW.wallT, 1, '#6fb8ff');
  if (PW.oWall) pwArms(PW.oWallT, -1, C.bad);
  // decoy ball: no shadow, flickers
  const D2 = PW.decoy;
  if (D2) {
    const u = (G.t - D2.t0) / D2.T;
    if (u >= 1) PW.decoy = null;
    else if (((G.t * 18) | 0) % 3) {
      const x = lerp(D2.p0.x, D2.to.x, u), z = lerp(D2.p0.z, D2.to.z, u), y = lerp(D2.p0.y, D2.to.y, u) + 4 * u * (1 - u) * 0.6;
      const p = pv(x, y, z), r = clamp(Math.round(0.14 * p.s), 1, 5);
      disc(p.x, p.y, r, '#f39a3c'); if (r >= 2) disc(p.x - 0.6, p.y - 0.6, r - 1, '#ffc27a');
      if (G.t >= D2.tMark) { const q = pv(D2.to.x, 0, D2.to.z), s = Math.max(2, Math.round(0.2 * q.s)), col = ((G.t * 12) | 0) % 2 ? C.accent : C.fire2; line(q.x - s, q.y - s * 0.4, q.x + s, q.y + s * 0.4, col); line(q.x - s, q.y + s * 0.4, q.x + s, q.y - s * 0.4, col); }
    }
  }
  // frozen: ice block around you
  if (pwFrozen()) { const p = pv(me.x, 0.9, me.z), s = Math.round(0.6 * p.s); ctx.globalAlpha = 0.35; rect(p.x - (s >> 1), p.y - s, s, Math.round(s * 1.6), '#a9dcff'); ctx.globalAlpha = 1; }
}
// blackout: dark screen, light only around the ball and you
let PW_DK = null;
function pwDark() {
  if (!pwSP() || !PW.dark) return;
  if (!PW_DK) PW_DK = document.createElement('canvas');
  if (PW_DK.width !== W || PW_DK.height !== H) { PW_DK.width = W; PW_DK.height = H; }
  const g = PW_DK.getContext('2d'), r = Math.round(W * pwAbV('dark').r);
  g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H); g.fillStyle = 'rgba(2,5,4,0.9)'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
  for (const [x, y, z, k] of [[ball.x, ball.y, ball.z, 1], [me.x, 1, me.z, 0.8]]) {
    const p = pv(x, y, z); g.beginPath(); g.arc(Math.round(p.x), Math.round(p.y), r * k, 0, Math.PI * 2); g.fill();
  }
  ctx.drawImage(PW_DK, 0, 0);
}
// HUD: their item / ability line under the board (canvas)
function pwHUD() {
  if (!pwSP()) return;
  const parts = [];
  if (PW.oArm) parts.push('THEM: ' + SKILLS.items.short[PW.oArm]);
  if (PW.ghost) parts.push('GHOST ON');
  if (PW.wall) parts.push('BLOCK ON');
  if (PW.slow) parts.push('SLOW ON');
  if (parts.length) text(parts.join('  '), W / 2, Math.round(H * 0.15), PW.oArm ? C.bad : C.accent, 1, 'c');
}
// item button (HTML)
function pwUI() {
  const b = $('#itemBtn'); if (!b) return;
  const on = pwSP() && !!PW.item;
  b.hidden = !on;
  if (on) { b.textContent = SKILLS.items.short[PW.item]; b.dataset.k = PW.item; b.setAttribute('aria-label', 'Use ' + SKILLS.items.names[PW.item]); }
}
if (typeof document !== 'undefined') {
  $('#itemBtn').addEventListener('click', e => { e.stopPropagation(); audioInit(); pwUse(); });
  addEventListener('keydown', e => { if ((e.key === 'f' || e.key === 'F' || e.key === 'x' || e.key === 'X') && !e.repeat) pwUse(); });
}
