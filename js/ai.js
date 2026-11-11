'use strict';
// ai: opponent brain, opponent serve, opponent offense
/* ---------------- opponent brain: reads the player, keeps score of its own tactics, switches game plans ---------------- */
const PLANS = {
  basis: {},
  druck: { sHammer: 2.2, sFloat: 0.6, aTip: 0.45, aFar: 1.4, speed: 0.1 },     // power: hard serves, fast spikes away from you
  finte: { aTip: 2.3, aFake: 2.4, sFloat: 1.8, sHammer: 0.6 },                // trickery: tips, fake leans, floaters
  lesen: { bFake: 2.6, bWide: 1.3, libRead: 0.3 },                            // vs. block readers: late block switches, defender covers the open side
  mauer: { bWide: 2.2, bSide: 1.3, bDeep: 0.4 }                               // vs. one-way hitters: wall up
};
const AI = {
  m: null, plan: 'basis', planPts: 0, recent: [], planT: -9, huddle: false, rec: {},
  fresh() { return { read: { away: 0, into: 0 }, tell: { follow: 0, ignore: 0 }, tac: {} }; },
  k() { return [0.35, 0.7, 1][G.level] || 0.7; },
  start() {
    // the opponent remembers you from earlier matches, a bit faded
    const saved = store.get('ai' + G.level, null);
    this.m = this.fresh();
    if (saved && saved.read) {
      const f = 0.5, m = this.m;
      m.read.away = saved.read.away * f; m.read.into = saved.read.into * f;
      m.tell.follow = saved.tell.follow * f; m.tell.ignore = saved.tell.ignore * f;
      for (const k in saved.tac) m.tac[k] = [saved.tac[k][0] * f, saved.tac[k][1] * f];
    }
    this.plan = 'basis'; this.planPts = 0; this.recent = []; this.planT = -9; this.huddle = false; this.rec = {};
  },
  save() { if (this.m) store.set('ai' + G.level, this.m); },
  speed() { return PLANS[this.plan].speed || 0; },
  mult(key) { return PLANS[this.plan][key] != null ? PLANS[this.plan][key] : 1; },
  // opponent success rate of a tactic, shrunk toward 0.5 while there is little data
  rate(key) { const t = this.m.tac[key]; return t ? (t[0] + 1) / (t[1] + 2) : 0.5; },
  adapt(key) { return clamp(1 + this.k() * (this.rate(key) - 0.5) * 2.6, 0.3, 2.2) * this.mult(key); },
  note(key, won) {
    if (!key || !this.m) return;
    const t = this.m.tac[key] || (this.m.tac[key] = [0, 0]);
    t[0] = t[0] * 0.92 + won; t[1] = t[1] * 0.92 + 1;
  },
  readRate() { const r = this.m.read; return (r.away + 0.5) / (r.away + r.into + 1.5); },
  followRate() { const r = this.m.tell; return (r.follow + 0.3) / (r.follow + r.ignore + 1); },
  spamRate() { const h = G.hist, t = h.L + h.R + h.LOB + 0.01; return Math.max(h.L, h.R, h.LOB) / t; },
  weighted(w) { let s = 0; for (const k in w) s += w[k]; let r = Math.random() * s; for (const k in w) { r -= w[k]; if (r <= 0) return k; } return Object.keys(w)[0]; },
  // hooks from the rally
  defended(inc, oppWon) { if (inc.tac) this.note(inc.tac, oppWon ? 1 : 0); },
  blockResult(A, v) { if (A && A.tac && !A.noted) { A.noted = true; this.note(A.tac, v); } },
  sawAttack(A, dir) {
    if (!A.shown || A.shown === 'D' || A.shown === 'W' || dir === 'LOB') return;
    const decay = 0.94, r = this.m.read; r.away *= decay; r.into *= decay;
    if (dir === A.shown) r.into++; else r.away++;
  },
  sawTell(followed) { const t = this.m.tell; t.follow *= 0.94; t.ignore *= 0.94; if (followed) t.follow++; else t.ignore++; },
  point(w) {
    if (!this.m) return;
    this.recent.push(w); if (this.recent.length > 5) this.recent.shift();
    this.planPts++;
    const r = this.rec[this.plan] || (this.rec[this.plan] = [0, 0]); r[0] += w === 1 ? 1 : 0; r[1]++;
    const lost = this.recent.slice(-4).filter(v => v === 0).length;
    const stale = this.planPts >= 7 && lost >= 2;
    const chance = [0.45, 0.8, 1][G.level];
    if (this.planPts >= 3 && (lost >= 3 || stale) && Math.random() < chance) this.rethink();
    this.save();
  },
  rethink() {
    // value = how a plan did so far + how well it fits what it has seen from you
    const need = {
      basis: 0.25,
      druck: (this.rate('sHammer') + this.rate('aFar')) / 2,
      finte: (this.rate('aTip') + this.rate('aFake')) / 2 + 0.35 * this.followRate() - 0.1,
      lesen: this.readRate() * 0.9,
      mauer: this.spamRate() * 0.85
    };
    let best = this.plan, bv = -1;
    for (const p in PLANS) {
      if (p === this.plan) continue;
      const r = this.rec[p] || [0, 0], val = (r[0] + 1) / (r[1] + 2);
      const v = 0.5 * val + need[p] + rand(0, 0.2);
      if (v > bv) { bv = v; best = p; }
    }
    this.plan = best; this.planPts = 0; this.recent = []; this.huddle = true;
  }
};
AI.m = AI.fresh();

/* ---------------- opponent serve ---------------- */
function oppToss() {
  setPose(oA, 'tossM', 0.6); SFX.toss();
  // some serves are big jump serves, the rest standing floaters
  G.oppJump = Math.random() < 0.45;
  if (G.oppJump) {
    launch({ x: ball.x, y: ball.y + 1.4, z: ball.z + 0.5 }, 0.9);
    after(0.1, () => { jump(oA, 3.6); setPose(oA, 'jumpM', 0, 18); oA.tz = oA.z + 0.5; oA.sz = 1.2; });
  } else launch({ x: ball.x, y: ball.y + 0.05, z: ball.z + 0.25 }, 0.9);
  after(0.45, oppServeHit);
}
function oppServeHit() {
  const d = D(), k = AI.k();
  setPose(oA, G.oppJump ? 'spikeM' : 'floatServeM', 0.3, 30); SFX.serve();
  const lane = pickLane();
  const backToBase = () => after(0.35, () => { oA.tx = pick([-2.4, 0, 2.4]); oA.tz = LIB_Z; oA.sx = oA.sz = 6; setBase(oA, 'ready'); });
  const err = [0.1, 0.07, 0.045][G.level] || 0.07, r = Math.random();
  if (r < err * 0.5) {
    // into the net
    G.phase = 'served';
    intoNet(-1, LX[lane] * 0.6, () => point(0, 'NET'));
    after(0.5, () => react(oA, 'headHands', 1, 12));
    backToBase(); return;
  }
  if (r < err) {
    // long: let it go
    outBall(lane === me.lane || Math.random() < 0.6 ? me.lane : lane, lerp(1.25, 0.95, d), 0.3);
    backToBase(); return;
  }
  if (r < err + 0.07) {
    // clips the tape and dribbles over: short ball
    G.phase = 'served';
    launch({ x: LX[lane] * 0.7, y: 2.47, z: -0.05 }, 0.75, { spin: 4 });
    after(0.75, () => {
      G.netWob = 0.6; SFX.tick(); sparks(ball.x, ball.y, ball.z, 4, [C.bone]);
      launch({ x: LX[lane] * 0.85, y: 0.45, z: 2.1 }, 0.72, { spin: 2 });
      incoming('tip', lane, LX[lane] * 0.85, 2.1, 0.72, 0.05);
    });
    backToBase(); return;
  }
  const kind = AI.weighted({
    sNorm: 1,
    sFloat: (d > 0.3 ? 0.3 + 0.45 * d : 0.08 * k) * AI.adapt('sFloat'),
    sHammer: (d > 0.35 ? 0.3 : 0.08 * k) * AI.adapt('sHammer')
  });
  const float = kind === 'sFloat', hammer = kind === 'sHammer';
  const T = lerp(BAL.oppServeT[0], BAL.oppServeT[1], d) * (hammer ? 0.8 : 1) * (1 - AI.speed());
  const o = float ? { wob: rand(0.9, 1.4) * (Math.random() < 0.5 ? -1 : 1), wobF: Math.PI * 2 * rand(1.0, 1.6), spin: 1 } : { spin: hammer ? 26 : 12 };
  launch({ x: LX[lane], y: 0.85, z: DZ + 0.1 }, T, o);
  incoming('serve', lane, LX[lane], DZ + 0.1, T, float ? T * 0.5 : lerp(0, 0.15, d)).tac = kind;
  if (hammer) { shake(2); SFX.spike(); }
  after(0.35, () => { oA.tx = pick([-2.4, 0, 2.4]); oA.tz = LIB_Z; oA.sx = oA.sz = 6; setBase(oA, 'ready'); });
}
function pickLane() {
  const w = [0, 1, 2].map(l => l === me.lane ? 0.24 : 0.38);
  let r = Math.random() * (w[0] + w[1] + w[2]);
  for (let i = 0; i < 3; i++) { r -= w[i]; if (r <= 0) return i; }
  return 2;
}

/* ---------------- opponent offense: blocker sets, server attacks ---------------- */
function oppPass(easy, scramble) {
  if (G.mode !== 'play') return;
  rallyTick();
  launch({ x: OSET.x, y: 2.6, z: OSET.z - 0.1 }, 0.95, { spin: 4 });
  oB.tx = OSET.x; oB.tz = OSET.z; oB.sx = oB.sz = 7; setBase(oB, 'setReady');
  const hl = (Math.random() * 3) | 0;
  after(scramble ? 0.62 : 0.3, () => { oA.tx = LX[hl]; oA.tz = -4.6; oA.sx = oA.sz = scramble ? 10 : 7; setBase(oA, 'stand'); });
  G.phase = 'oppPlay'; setHint('');
  me.sz = 6; if (!me.air) me.tz = DZ;
  after(0.95, () => oppSet(hl, easy));
}
// aim near or far from where you stand, by what has worked against you
function pickAttackLane(hl) {
  const near = AI.adapt('aNear'), far = AI.adapt('aFar');
  const w = [0, 1, 2].map(l => (l === me.lane ? 0.55 * near : 0.8 * far) * (l === hl ? 1.5 : 1) * (Math.abs(l - hl) === 2 ? 0.6 : 1));
  let r = Math.random() * (w[0] + w[1] + w[2]);
  for (let i = 0; i < 3; i++) { r -= w[i]; if (r <= 0) return i; }
  return hl;
}
function oppSet(hl, easy) {
  if (G.mode !== 'play') return;
  const d = clamp(D() + (easy ? 0.25 : 0), 0, 1);
  setPose(oB, 'set', 0.3); SFX.set();
  const hx = LX[hl];
  const T = lerp(BAL.oppSetT[0], BAL.oppSetT[1], d);
  launch({ x: hx - 0.12, y: 3.3, z: -2.7 }, T, { spin: 3 });
  const tc = G.t + T;
  const k = AI.k();
  // a tip right after a tip is predictable; the brain mixes it up
  const tipAgain = AI.lastTip ? 0.5 : 1;
  const tip = Math.random() < clamp((BAL.tip[0] + BAL.tip[1] * d) * AI.adapt('aTip') * tipAgain, 0.04, 0.42);
  AI.lastTip = tip;
  const al = pickAttackLane(hl);
  const lean = Math.sign(al - hl);
  // players who chase the hitter's lean get faked more often
  const pFake = (d > 0.5 ? 0.3 * d : 0) + k * 0.5 * Math.max(0, AI.followRate() - 0.35) * AI.adapt('aFake');
  const fake = !tip && Math.random() < clamp(pFake, 0, [0.15, 0.35, 0.5][G.level]);
  const tellLean = fake ? pick([-1, 0, 1].filter(v => v !== lean)) : lean;
  const O = G.oppAtk = { tc, al, hl, tip, fake, tellLean, tellLane: me.lane };
  // our net blocker (mate): graze (BAL.blockGraze) or stuff (your Block skill, split block); jumps only when it gets a hand on it
  O.blk = tip ? '' : blockRoll(BAL.blockGraze, stuffChance(PROFILE), RNG);
  if (O.blk) {
    at(tc - Math.min(0.5, T - 0.05), () => { mate.tx = clamp(LX[al] * 0.8, -2.6, 2.6); mate.tz = 0.45; mate.sx = mate.sz = 9; });
    at(tc - 0.25, () => { jump(mate, 3.4); setPose(mate, 'block', 0.5, 22); });
  }
  at(tc - Math.min(0.8, T - 0.05), () => { oA.tx = hx; oA.tz = -3.0; oA.sz = Math.max(3, Math.abs(oA.z + 3.0) / 0.4); oA.sx = 7; });
  at(tc - 0.43, () => { jump(oA, 4.1); setPose(oA, 'jumpM', 0, 18); setBase(oA, 'jumpM'); });
  at(tc - lerp(0.55, 0.28, d), () => { if (!tip) { oA.leanT = tellLean; O.tellLane = me.lane; } });
  if (fake) at(tc - 0.06, () => { oA.leanT = lean; });
  at(tc - 0.3, () => { oB.tx = 0; oB.tz = BLK_Z; oB.sx = oB.sz = 4; setBase(oB, 'setReady'); });
  at(tc, () => oppAttack(O, d));
}
function oppAttack(O, d) {
  if (G.mode !== 'play') return;
  const { al, tip } = O;
  oA.leanT = 0;
  oA.onLand = () => { setBase(oA, 'ready'); oA.tx = pick([-2.4, 0, 2.4]); oA.tz = LIB_Z; oA.sx = oA.sz = 5; };
  G.oppAtk = null;
  // did you move with the hitter's lean?
  if (!tip && O.tellLean) { const mv = Math.sign(me.lane - O.tellLane); AI.sawTell(mv === O.tellLean); }
  if (tip) {
    setPose(oA, 'lobM', 0.3); setBase(oA, 'followM'); SFX.lob();
    launch({ x: LX[al] * 0.85, y: 0.45, z: 2.1 }, 0.82, { spin: 2 });
    incoming('tip', al, LX[al] * 0.85, 2.1, 0.82, 0.1).tac = 'aTip';
    return;
  }
  setPose(oA, 'spikeM', 0.14, 40); setBase(oA, 'followM'); SFX.spike(); shake(2); G.stop = 0.04;
  sparks(ball.x, ball.y, ball.z, 5, [C.bone, C.bad]);
  const T = lerp(BAL.oppSpikeT[0], BAL.oppSpikeT[1], d) * (1 - AI.speed());
  const err = [0.09, 0.06, 0.04][G.level] || 0.06, r = Math.random();
  if (r < err * 0.45) { intoNet(-1, LX[al] * 0.5, () => point(0, 'NET')); after(0.6, () => react(oA, 'headHands', 1, 12)); G.phase = 'over'; return; }
  if (r < err) { outBall(Math.random() < 0.6 ? me.lane : al, T * 1.2, lerp(BAL.markDelay[0], BAL.markDelay[1], d)); return; }
  const md = lerp(BAL.markDelay[0], BAL.markDelay[1], d), tac = O.fake ? 'aFake' : al === me.lane ? 'aNear' : 'aFar';
  if (O.blk === 'stuff') { mateStuff(); return; }
  if (O.blk === 'graze') { mateGraze(al, T, md, tac); return; }
  launch({ x: LX[al], y: 0.85, z: DZ + 0.1 }, T, { spin: 22 });
  incoming('spike', al, LX[al], DZ + 0.1, T, md).tac = tac;
}
// Block-Anschlag on our side: the spike brushes our blocker's hands and comes slower
function mateGraze(al, T, md, tac) {
  const T2 = T * BAL.grazeSlow;
  launch({ x: mate.x, y: 2.55, z: 0.25 }, 0.1, { spin: 22 });
  incoming('spike', al, LX[al], DZ + 0.1, 0.1 + T2, md).tac = tac;
  after(0.1, () => {
    SFX.touch(); G.netWob = 0.5; sparks(ball.x, ball.y, ball.z, 6, [C.bone, C.accent]); burst(C.bone, false);
    launch({ x: LX[al], y: 0.85, z: DZ + 0.1 }, T2, { spin: 10 });
  });
}
// our blocker stuffs it; they recycle it with a chance set by your Block skill (SKILLS.recycle, Wall perk)
function mateStuff() {
  const hx = mate.x;
  launch({ x: hx, y: 2.55, z: 0.25 }, 0.1, { spin: 22 });
  G.phase = 'over'; setHint('');
  after(0.1, () => {
    if (G.mode !== 'play') return;
    SFX.block(); shake(4); G.netWob = 1; G.stop = 0.08;
    sparks(ball.x, ball.y, ball.z, 8, [C.bone, C.accent]); burst(C.accent, true);
    const sx = clamp(hx + rand(-0.6, 0.6), -3, 3), sz = -rand(0.8, 1.6);
    if (RNG() < recycleP(PROFILE)) {
      launch({ x: sx, y: 0.5, z: sz }, 0.34, { spin: -16 });
      oA.onLand = null; oA.tx = sx; oA.tz = sz - 0.15; oA.sx = oA.sz = 12;
      after(0.34, () => { defAnim(oA, 'reflex', 1); SFX.dig(); oppPass(false, true); });
    } else {
      launch({ x: sx, y: 0, z: sz }, 0.3, { spin: -20 });
      G.phase = 'dead';
      after(0.12, () => defAnim(oA, Math.abs(oA.x - sx) < 1.6 ? 'miss' : 'lunge', sx < oA.x ? -1 : 1));
      after(0.75, () => { G.stats.kills++; addMeter(1); point(0, 'BLOCK!'); });
    }
  });
}

