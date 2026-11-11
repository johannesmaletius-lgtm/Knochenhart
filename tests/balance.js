// P8 balance pass: headless rally / match simulation on the pure skill decisions (js/skills.js) and BAL (js/engine.js).
// Model = a 2 v 2 rally after the Classic MP host rules (mp.js), reduced to dice: serve -> receive -> set -> spike / lob ->
// block (tool / touch / stuff -> recycle -> cover) or graze / net fault / out -> dig ... until a point; matches to 15 by 2.
// Skill enters only through the real helpers: timingErr/hitTier (tiers), hitFault (net/out), blockRoll (graze), recycleP
// (stuff), lateSaveP (late digs), digWild (pass quality), SKILLS.blockQ (block jump tier). Every skill acts as in the SP engine
// (Serve tiers, Receive/Dig late saves); not modelled: unlocks (fireball, dive, float, lob aim, split block) and perks, which
// only add to the higher skill's edge. Everything else is the player model below.
//
// Player models (timing |dt| ~ |N(0, sigma)| s on serve / set / spike / block jump / cover; read = right lane on defense
// by the incoming tier perfect/good/weak; late = share of read balls reached too late; blockRead = hitter avoids the block):
//   avg  = sigma 0.12 s, read .35/.55/.75, late .30, blockRead .45   (a normal phone player)
//   good = sigma 0.07 s, read .45/.65/.85, late .15, blockRead .65   (clean timing, reads the game)
//   bad  = sigma 0.20 s, same reads as avg                            (only for "does timing still count at 99?")
//
// Targets (asserted, exit 1 on a miss; 2000 matches per scenario, seeded):
//   equal OVR (60/60, 80/80, 99/99, same model): matches 50 % +- 4, rallies 50 % +- 1.5
//   99 vs 60 (both avg): the 99 wins clearly but not always: rallies 55..64 %, matches 72..90 % (unlocks not modelled)
//   timing still counts at 99: 99 good vs 99 bad wins >= 85 % of the matches; 60 good vs 99 avg: 20..90 % (neither is a lock)
//   fixed rules: net fault 0 % at timing better than okay, 30 % at very bad timing (skill 60), linear between; graze 5 % of open
//   spikes; recycle vs blocker 60 ~70 %, 90 ~10 %, 99 ~3 % (10k rolls each, tol. 2 %; in play for normal "good" block jumps)
//   Classic MP block at 60 (P5 check): block points per blocked spike within 10 % (abs.) of the pre-P5 rule
//   P7: campaign / Skill Games opponent faults (aiErr) fall over the OVR staffel. P4 Hybrid: see CLAUDE.md (script-bot check).
//
// Balance table (node tests/balance.js, seed 8; P8: SKILLS.timing pen [1, 0.65] floor [0, 0.3], SKILLS.blockQ perfect +0.4):
//   scenario             rally A   match A   net fault / attack A / B   graze   recycle A-blocks / B-blocks   block pts / block A
//   60 avg vs 60 avg      50.3 %    50.9 %     1.3 / 1.2 %               4.9 %   52 / 53 % (good jumps 70 %)    40.5 % (pre-P5 48.9 %)
//   80 avg vs 80 avg      49.8 %    50.0 %     0.7 / 0.8 %               5.2 %   14 / 15 %                      68.6 %
//   99 avg vs 99 avg      49.7 %    49.5 %     0.3 / 0.3 %               4.9 %    4 /  4 %                      75.6 %
//   99 avg vs 60 avg      56.6 %    75.0 %     0.4 / 1.2 %               4.9 %    3 / 52 %                      77.0 %
//   99 good vs 99 bad     68.8 %    98.0 %     0.0 / 2.0 %               5.1 %    1 /  7 %                      85.6 %
//   60 good vs 99 avg     57.9 %    80.2 %     0.1 / 0.4 %               5.1 %   42 /  4 %                      51.5 %
//   (net faults per attack are low because very bad timing is rare; per very bad hit: 30 % at 60, 14 % at 99)
// Usage: node tests/balance.js   (exit 1 on any failure)
'use strict';
const fs = require('fs'), path = require('path');
const S = require('../js/skills.js'), { SKILLS } = S;
const src = fs.readFileSync(path.join(__dirname, '../js/engine.js'), 'utf8');
const BAL = Function('return ' + src.slice(src.indexOf('const BAL = {') + 12, src.indexOf('\n};', src.indexOf('const BAL = {')) + 2))();

const MODELS = {
  avg: { sigma: 0.12, read: { perfect: 0.35, good: 0.55, weak: 0.75 }, late: 0.3, blockRead: 0.45 },
  good: { sigma: 0.07, read: { perfect: 0.45, good: 0.65, weak: 0.85 }, late: 0.15, blockRead: 0.65 },
  bad: { sigma: 0.2, read: { perfect: 0.35, good: 0.55, weak: 0.75 }, late: 0.3, blockRead: 0.45 }
};
let rng = S.mulberry32(8);
const gauss = () => { let u = 0; while (!u) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); };
const adt = m => Math.abs(gauss() * m.sigma);
const tier3 = (dt, w) => dt < w[0] ? 'perfect' : dt < w[1] ? 'good' : 'weak';
// pre-P5 Classic MP stuff rule (BAL.stuff before P3, removed since): lerp(0.45, 0.70, mpDiff), mid difficulty 0.45
const OLD_STUFF = 0.45 + 0.25 * 0.45, OLD_Q = { perfect: [0.4, 0.6, 0.15], good: [1, 1, 0], weak: [1.6, 1.5, -0.15] }, LOB = 0.15, DIVE = (BAL.diveOk[0] + BAL.diveOk[1]) / 2, SRV = BAL.serveWin[1];
// statistics per team: att = spikes + lobs, net = net faults, open = open spikes, graze, stuffs = our blocks that stuffed, rec = recycled
const newStats = () => ({ att: 0, net: 0, open: 0, graze: 0, stuffs: 0, rec: 0, stuffG: 0, recG: 0, blk: 0, blkPts: 0 });

// one rally, team s serves; T = [team0, team1] = { p: profile, m: model, st: stats, old: pre-P5 Classic block rule }
function rally(T, s) {
  const r = 1 - s, sv = T[s], rv = T[r];
  // serve: timing through the Serve skill, net / long faults, aces by tier
  const err = S.timingErr(adt(sv.m), [SRV[0], SRV[1], BAL.serveMax]), q = S.hitTier(sv.p.sk.serve, err);
  if (S.hitFault(sv.p.sk.serve, err, 0, BAL.serveOut[q], rng)) return r;
  if (rng() < BAL.ace[q]) return s;
  if (!defend(rv, 'serve', { perfect: 0.8, good: 0.88, weak: 0.95 }[q])) return s;
  return play(T, r, 'good');
}
// defense of team d: right lane, then late = Receive / Dig skill save chance
function defend(D, type, read) {
  if (rng() >= read) return false;
  return rng() >= D.m.late || rng() < S.lateSaveP(D.p, type, DIVE);
}
// team a has the ball after a dig / receive of quality pass: set, attack; returns the rally winner
function play(T, a, pass) {
  for (let guard = 0; guard < 60; guard++) {
    const o = 1 - a, A = T[a], B = T[o];
    // set: pure timing (old windows), a wild pass (digWild by skill) spoils it now and then
    let sq = tier3(adt(A.m), [0.08, 0.18]);
    if (pass === 'wild' && rng() < 0.5 * S.digWild(A.p, 'spike')) sq = 'weak';
    const wn = { perfect: 1.4, good: 1, weak: 0.8 }[sq], lob = rng() < LOB, sk = A.p.sk[lob ? 'lob' : 'spike'];
    const err = S.timingErr(adt(A.m), [0.075 * wn, 0.17 * wn, BAL.atkWin[2]]), q = S.hitTier(sk, err);
    A.st.att++;
    if (lob) {
      if (S.hitFault(sk, err, 0, 0, rng) === 'net') { A.st.net++; return o; }
      if (!defend(B, 'tip', { perfect: 0.5, good: 0.6, weak: 0.75 }[q] * (0.9 + 0.1 * B.m.read.good / 0.55))) return a;
      a = o; pass = 'wild'; continue;
    }
    // the blocker guesses a side or goes wide; a hitter who reads it hits around
    const inLine = rng() >= A.m.blockRead && rng() < 0.6;
    if (inLine) {
      const bq = tier3(adt(B.m), [0.07, 0.16]), m = (B.old ? OLD_Q : SKILLS.blockQ)[bq], x = rng();
      B.st.blk++;
      if (x < BAL.tool[q] * m[0]) return a; // block out
      if (x < BAL.tool[q] * m[0] + BAL.touch * m[1]) { a = o; pass = 'good'; continue; } // touch: free ball to the blockers
      // stuff: recycled by the blocker's Block skill (pre-P5 Classic: lerp(BAL.stuff) at mid difficulty)
      B.st.stuffs++; if (bq === 'good') B.st.stuffG++;
      const pStuff = B.old ? OLD_STUFF : 1 - S.recycleP(B.p);
      if (rng() < pStuff + m[2]) { B.st.blkPts++; return o; }
      B.st.rec++; if (bq === 'good') B.st.recG++;
      // rebound: the setter covers it on time, else the hitter digs it like a late ball
      if (adt(A.m) < 0.17 || defend(A, 'block', 0.6)) { pass = 'wild'; continue; }
      B.st.blkPts++; return o;
    }
    A.st.open++;
    const fault = S.hitFault(sk, err, 0, q === 'weak' ? BAL.spikeOut : 0, rng);
    if (fault) { if (fault === 'net') A.st.net++; return o; }
    const graze = S.blockRoll(BAL.blockGraze, 0, rng) === 'graze';
    if (graze) A.st.graze++;
    if (!defend(B, 'spike', Math.min(0.95, B.m.read[q] + (graze ? 0.2 : 0)))) return a;
    a = o; pass = 'wild';
  }
  return rng() < 0.5 ? 0 : 1;
}
function match(T) {
  const sc = [0, 0]; let s = rng() < 0.5 ? 0 : 1;
  while (!((sc[0] >= 15 || sc[1] >= 15) && Math.abs(sc[0] - sc[1]) >= 2)) { const w = rally(T, s); sc[w]++; s = w; T.r[w]++; }
  return sc[0] > sc[1] ? 0 : 1;
}
function scenario(a, b, n = 2000) {
  const T = [{ p: S.skillsNew(a[0]), m: MODELS[a[1]], st: newStats(), old: a[2] }, { p: S.skillsNew(b[0]), m: MODELS[b[1]], st: newStats(), old: b[2] }];
  T.r = [0, 0]; let w = 0;
  for (let i = 0; i < n; i++) if (match(T) === 0) w++;
  return { match: w / n, rally: T.r[0] / (T.r[0] + T.r[1]), A: T[0].st, B: T[1].st };
}

let fails = 0, k = 0;
const ok = (c, msg) => { k++; if (!c) { fails++; console.log('FAIL', msg); } };
const pc = v => (100 * v).toFixed(1).padStart(5) + ' %';
const rate = (f, n = 10000) => { let h = 0; for (let i = 0; i < n; i++) if (f()) h++; return h / n; };

// fixed rules (10k rolls each)
rng = S.mulberry32(1);
const O = SKILLS.net.okay, net = e => rate(() => S.hitFault(60, e, 0, 0, rng) === 'net');
ok(net(0) === 0 && net(O) === 0 && net(O * 0.99) === 0, 'net fault 0 % at timing okay or better');
ok(Math.abs(net(1) - 0.3) < 0.02, 'net fault 30 % at very bad timing');
ok(Math.abs(net((O + 1) / 2) - 0.15) < 0.02, 'net fault linear between (15 % half way)');
ok(Math.abs(rate(() => S.blockRoll(BAL.blockGraze, 0, rng) === 'graze') - 0.05) < 0.006, 'graze 5 %');
for (const [lv, want] of [[60, 0.7], [90, 0.1], [99, 0.03]]) ok(Math.abs(rate(() => rng() < S.recycleP(S.skillsNew(lv))) - want) < 0.02, 'recycle vs Block ' + lv);

// (P3) timing still counts at 99: very bad timing is a weak hit with net faults, perfect stays pure timing
const w99 = S.timingErr(BAL.atkWin[1] * 1.5, BAL.atkWin);
ok(S.hitTier(99, 1) === 'weak' && S.netFault(S.effErr(99, 1)) >= 0.12, 'skill 99, very bad timing: weak and >= 12 % net faults');
ok(S.hitTier(99, w99) === 'weak', 'skill 99: 1.5 x the good window is still weak');
ok(S.netFault(S.effErr(99, 1)) < S.netFault(S.effErr(60, 1)), 'skill 99 bad timing still better than skill 60');

// (P7) campaign / skill games opponent: fault rate falls over the OVR staffel, normal SP keeps the level table
const ce = [60, 72, 86, 99].map(o => S.aiErr(S.skillsNew(o), 'spike'));
ok(ce.every((v, i) => !i || v < ce[i - 1]) && ce[0] >= 0.09 && ce[3] <= 0.04, 'campaign opponent spike errors fall with OVR ' + ce.map(v => v.toFixed(3)).join(' > '));

// scenarios
const rows = [
  ['60 avg vs 60 avg', [60, 'avg'], [60, 'avg']], ['80 avg vs 80 avg', [80, 'avg'], [80, 'avg']], ['99 avg vs 99 avg', [99, 'avg'], [99, 'avg']],
  ['99 avg vs 60 avg', [99, 'avg'], [60, 'avg']], ['99 good vs 99 bad', [99, 'good'], [99, 'bad']], ['60 good vs 99 avg', [60, 'good'], [99, 'avg']],
  ['60 avg old vs 60 avg old', [60, 'avg', true], [60, 'avg', true]]
];
rng = S.mulberry32(8);
const R = {};
console.log('scenario                   rally A   match A   net fault A / B     graze A   recycle of A-blocks / B-blocks   block pts per block A');
for (const [nm, a, b] of rows) {
  const x = R[nm] = scenario(a, b);
  const rec = s => s.stuffs ? pc(s.rec / s.stuffs) : '   -   ';
  console.log(nm.padEnd(25), pc(x.rally), pc(x.match), '  ', pc(x.A.net / x.A.att), '/', pc(x.B.net / x.B.att), '  ', pc(x.A.graze / x.A.open), '  ', rec(x.A), '/', rec(x.B), '                ', pc(x.A.blkPts / x.A.blk));
}
for (const nm of ['60 avg vs 60 avg', '80 avg vs 80 avg', '99 avg vs 99 avg']) {
  ok(Math.abs(R[nm].match - 0.5) <= 0.04, nm + ': matches 50 % +- 4');
  ok(Math.abs(R[nm].rally - 0.5) <= 0.015, nm + ': rallies 50 % +- 1.5');
}
const big = R['99 avg vs 60 avg'];
ok(big.rally >= 0.55 && big.rally <= 0.64, '99 vs 60: rallies 55..64 % (got ' + pc(big.rally) + ')');
ok(big.match >= 0.72 && big.match <= 0.9, '99 vs 60: matches 72..90 % (got ' + pc(big.match) + ')');
ok(R['99 good vs 99 bad'].match >= 0.85, 'timing counts at 99: good beats bad >= 85 % (got ' + pc(R['99 good vs 99 bad'].match) + ')');
ok(R['60 good vs 99 avg'].match >= 0.2 && R['60 good vs 99 avg'].match <= 0.9, 'good 60 vs average 99: 20..90 %, neither is a lock (got ' + pc(R['60 good vs 99 avg'].match) + ')');
ok(big.A.net / big.A.att < big.B.net / big.B.att, 'net faults fall with skill');
for (const nm of ['60 avg vs 60 avg', '99 avg vs 99 avg']) ok(Math.abs(R[nm].A.graze / R[nm].A.open - 0.05) < 0.01, nm + ': graze 5 % of open spikes');
const r60 = R['60 avg vs 60 avg'], r99 = R['99 avg vs 99 avg'];
ok(Math.abs(r60.A.recG / r60.A.stuffG - 0.7) < 0.05 && r99.A.recG / r99.A.stuffG < 0.06, 'in play, normal (good) block jumps: recycle ~70 % vs Block 60, ~3 % vs 99');
// (P5) Classic MP: a Block 60 player gets about as many block points per blocked spike as before the skill system
const nowB = r60.A.blkPts / r60.A.blk, oldB = R['60 avg old vs 60 avg old'].A.blkPts / R['60 avg old vs 60 avg old'].A.blk;
ok(Math.abs(nowB - oldB) <= 0.1, 'Block 60 points per blocked spike ' + pc(nowB) + ' ~ pre-P5 ' + pc(oldB) + ' (+-10 %)');

console.log(fails ? fails + ' of ' + k + ' FAILED' : 'OK ' + k + '/' + k + ' balance checks');
process.exit(fails ? 1 : 0);
