// Assertions for js/hybrid.js (P4 Hybrid multiplayer rules): rotation after side-out, double touch, lane mapping of the set
// swipes, wrong lane -> free ball / floor, "blocker digs -> back sets -> blocker attacks", computer mates (10k rolls each).
// Usage: node tests/hybrid.test.js   (exit 1 on any failure)
'use strict';
const H = require('../js/hybrid.js'), { SKILLS } = require('../js/skills.js');
let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, msg + ' (got ' + a.toFixed(4) + ', want ' + b.toFixed(4) + ' +-' + tol + ')');
let seed = 11;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const K = 10000;

// rotation: only a side-out rotates, and only the team that wins the serve
let rot = [0, 0];
rot = H.hyRotate(rot, 0, 0); ok(rot[0] === 0 && rot[1] === 0, 'server wins: no rotation');
rot = H.hyRotate(rot, 0, 1); ok(rot[0] === 0 && rot[1] === 1, 'side-out: receiving team B rotates');
rot = H.hyRotate(rot, 1, 1); ok(rot[1] === 1, 'B keeps serving: no rotation');
rot = H.hyRotate(rot, 1, 0); ok(rot[0] === 1 && rot[1] === 1, 'side-out back to A: A rotates');
rot = H.hyRotate(rot, 0, 1); ok(rot[1] === 0, 'second side-out of B: back to the lobby positions');
const r0 = [0, 0]; H.hyRotate(r0, 0, 1); ok(r0[1] === 0, 'hyRotate does not mutate its input');
// rotation maps players to positions; everybody plays both roles
ok(H.hySlot(0, 0, [0, 0]) === 0 && H.hySlot(0, 1, [0, 0]) === 1 && H.hySlot(1, 0, [0, 0]) === 2 && H.hySlot(1, 1, [0, 0]) === 3, 'no rotation = lobby slots');
ok(H.hySlot(0, 0, [1, 0]) === 1 && H.hySlot(0, 1, [1, 0]) === 0 && H.hySlot(1, 0, [1, 0]) === 2, 'rotated team A: slot 1 plays back');
for (let s = 0; s < 4; s++) for (const ro of [[0, 0], [1, 0], [0, 1], [1, 1]]) ok(H.hySlot(s >> 1, H.hyFig(s, ro), ro) === s, 'hyFig inverts hySlot ' + s + ' ' + ro);
// a full match of side-outs: each player of a team serves after every second side-out (plays back half the time)
{ let ro = [0, 0], srv = 0, back = [0, 0, 0, 0], rallies = 0;
  for (let i = 0; i < K; i++) { const w = rnd() < 0.5 ? 0 : 1; ro = H.hyRotate(ro, srv, w); srv = w; rallies++; for (let s = 0; s < 4; s++) if (H.hyFig(s, ro) === 0) back[s]++; }
  for (let s = 0; s < 4; s++) near(back[s] / rallies, 0.5, 0.05, 'slot ' + s + ' plays back about half the rallies'); }
// controls: swapped only while the front player attacks
ok(H.hyCtl(1, [0, 0], [false, false]) === 1 && H.hyCtl(1, [0, 0], [true, false]) === 0 && H.hyCtl(0, [0, 0], [true, false]) === 1, 'sw swaps controls of team A');
ok(H.hyCtl(2, [0, 0], [true, false]) === 0, 'sw of team A does not touch team B');
ok(H.hyCtl(0, [1, 0], [false, false]) === 1 && H.hyCtl(0, [1, 0], [true, false]) === 0, 'rotation and swap combine');

// double touch
let t = H.hyTouch(null, 0, 0); ok(!t.fault, 'first touch ok');
t = H.hyTouch(t.last, 0, 1); ok(!t.fault, 'mate touches next: ok');
t = H.hyTouch(t.last, 0, 1); ok(t.fault, 'same player twice in a row: fault');
t = H.hyTouch({ t: 0, slot: 1 }, 1, 3); t = H.hyTouch(t.last, 0, 1); ok(!t.fault, 'block touch of the other team in between: ok');
// rule: blocker digs -> back sets -> blocker attacks; back digs -> front sets -> back attacks; never a double touch
for (const dig of [0, 1]) {
  const pl = H.hyPlan(dig);
  ok(pl.hit === dig && pl.set === 1 - dig, 'plan after dig by ' + (dig ? 'blocker' : 'back') + ': other sets, digger attacks');
  let L = H.hyTouch(null, 0, dig), f = false;
  for (const who of [pl.set, pl.hit]) { L = H.hyTouch(L.last, 0, who); f = f || L.fault; }
  ok(!f, 'dig -> set -> attack has no double touch (dig ' + dig + ')');
}
ok(H.hyPlan(1).set === 0, 'blocker digs: back player sets');

// set swipe -> lane: left = left (0), straight up / diagonal up-left = middle ball (1), right = right / back (2), tap = middle; no dump
ok(H.hySetLane('swipe', -1, 0.2) === 0, 'left -> lane 0');
ok(H.hySetLane('swipe', -1, -1) === 1, 'up-left diagonal -> lane 1');
ok(H.hySetLane('swipe', -1, -0.5) === 1 && H.hySetLane('swipe', -0.5, -1) === 1, 'up-left (flat / steep) -> lane 1');
ok(H.hySetLane('swipe', 1, 0) === 2 && H.hySetLane('swipe', 1, -1) === 2 && H.hySetLane('swipe', 1, 1) === 2, 'right (any) -> lane 2');
ok(H.hySetLane('swipe', 0, -1) === 1 && H.hySetLane('swipe', 0.2, -1) === 1 && H.hySetLane('swipe', -0.2, -1) === 1, 'straight up -> middle ball');
ok(H.hySetLane('swipe', -1, -0.2) === 0, 'nearly flat left -> lane 0');
ok(H.hySetLane('swipe', -1, 1) === 0, 'down-left -> lane 0');
ok(H.hySetLane('tap', 0, 0) === 1 && H.hySetLane('swipe', 0, 1) === 1, 'tap / down -> middle');
// random swipe directions: every swipe maps to exactly one lane (never a dump), angle bands as documented
{ const c = { 0: 0, 1: 0, 2: 0 };
  for (let i = 0; i < K; i++) { const a = rnd() * Math.PI * 2; c[H.hySetLane('swipe', Math.cos(a), Math.sin(a))]++; }
  const at = Math.atan(SKILLS.hy.setTilt) / (2 * Math.PI); // one tilt band as a share of the full circle
  ok(c[0] + c[1] + c[2] === K, 'every set swipe is a lane');
  near(c[2] / K, 0.5 - at, 0.015, 'right half -> lane 2');
  near(c[1] / K, 0.25, 0.015, 'straight-up + up-left diagonal band -> lane 1');
  near(c[0] / K, 0.25 + at, 0.015, 'flat left + down-left -> lane 0'); }

// wrong lane: next lane = free ball (Danke-Ball), two off = floor
ok(H.hyLaneResult(1, 1) === 'hit', 'same lane: hit');
ok(H.hyLaneResult(0, 1) === 'danke' && H.hyLaneResult(2, 1) === 'danke' && H.hyLaneResult(1, 0) === 'danke', 'next lane: free ball');
ok(H.hyLaneResult(0, 2) === 'floor' && H.hyLaneResult(2, 0) === 'floor', 'two lanes off: floor');

// attack swipes and lob aim (P3 tilt 0.3)
ok(H.hyAttackDir(-1, 0.3, 0.3).dir === 'L' && H.hyAttackDir(1, 1, 0.3).dir === 'R', 'sideways / down = spike');
ok(H.hyAttackDir(0, -1, 0.3).dir === 'LOB' && H.hyAttackDir(0, -1, 0.3).aim === 0, 'up = straight lob');
ok(H.hyAttackDir(-0.6, -1, 0.3).aim === -1 && H.hyAttackDir(0.6, -1, 0.3).aim === 1, 'diagonal up = aimed lob');
ok(H.hyLobLane(-1, rnd) === 2 && H.hyLobLane(1, rnd) === 0, "hitter's left = receiver's lane 2");
{ const c = [0, 0, 0]; for (let i = 0; i < K; i++) c[H.hyLobLane(0, rnd)]++; for (let l = 0; l < 3; l++) near(c[l] / K, 1 / 3, 0.02, 'straight lob lane ' + l + ' ~1/3'); }

// computer mates (10k rolls each, against SKILLS.hy)
for (const d of [0, 0.5, 1]) {
  let f = 0; for (let i = 0; i < K; i++) if (H.hyBotFollow(rnd, d)) f++;
  near(f / K, H.hyMix(SKILLS.hy.botFollow, d), 0.015, 'computer hitter follows the set lane, dif ' + d);
  let same = 0, adj = 0;
  for (let i = 0; i < K; i++) { const hl = (rnd() * 3) | 0, l = H.hyBotSetLane(rnd, d, hl); if (l === hl) same++; else if (Math.abs(l - hl) === 1) adj++; }
  near(same / K, H.hyMix(SKILLS.hy.botSetOk, d), 0.015, 'computer setter sets the hitter lane, dif ' + d);
  ok(same + adj === K, 'computer setter misses only by one lane (never a floor ball), dif ' + d);
}
// a computer hitter after a computer set: wrong lane rate stays small
{ let bad = 0; for (let i = 0; i < K; i++) { const hl = 1, sl = H.hyBotSetLane(rnd, 0.45, hl); const lane = sl === hl || H.hyBotFollow(rnd, 0.45) ? sl : hl; if (H.hyLaneResult(sl, lane) !== 'hit') bad++; }
  const want = (1 - H.hyMix(SKILLS.hy.botSetOk, 0.45)) * (1 - H.hyMix(SKILLS.hy.botFollow, 0.45));
  near(bad / K, want, 0.01, 'computer pair: free balls from wrong lanes'); }

console.log(fails ? fails + ' of ' + n + ' FAILED' : 'OK ' + n + '/' + n + ' hybrid checks');
process.exit(fails ? 1 : 0);
