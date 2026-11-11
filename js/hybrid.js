'use strict';
// hybrid: pure rules of the Hybrid multiplayer mode (rotation, roles, lanes, touches, computer mates).
// The host (mp.js) calls these; clients only draw and send input. Numbers: SKILLS.hy. Also a Node module (tests/hybrid.test.js).
const HYS = typeof SKILLS !== 'undefined' ? SKILLS : require('./skills.js').SKILLS;

// rotation: rot[t] = 0 -> lobby slot "Back" plays back, 1 -> the two players of team t swapped positions.
// Side-out (the receiving team wins the rally) rotates the team that wins the serve, like official volleyball.
function hyRotate(rot, server, winner) {
  const r = rot.slice();
  if (winner !== server) r[winner] ^= 1;
  return r;
}
// player slot (0..3) that plays position r (0 back, 1 front) of team t
const hySlot = (t, r, rot) => t * 2 + (r ^ rot[t]);
// position (0 back, 1 front) that slot plays
const hyFig = (slot, rot) => (slot & 1) ^ rot[slot >> 1];
// control role of a slot: 0 = defender/hitter controls, 1 = setter/blocker controls.
// sw[t]: in this possession the front player dug, so the back player sets and the front player attacks
const hyCtl = (slot, rot, sw) => hyFig(slot, rot) ^ (sw && sw[slot >> 1] ? 1 : 0);
// who plays the next two touches after a dig by position dig: the other one sets, the digger attacks
// (back digs -> front sets -> back attacks; blocker digs -> back sets -> blocker attacks)
const hyPlan = dig => ({ set: 1 - dig, hit: dig });
// nobody plays the ball twice in a row: last = { t, slot } of the previous contact (any team) or null
function hyTouch(last, t, slot) {
  return { fault: !!last && last.t === t && last.slot === slot, last: { t, slot } };
}
// setter swipe -> lane of the set (team-local 0 left, 1 middle, 2 right) or 'dump' (straight up).
// left = left, diagonal up-left = middle, right = right ("back set" behind the setter), tap / down = middle
function hySetLane(k, dx, dy, tilt = HYS.hy.setTilt) {
  if (k !== 'swipe') return 1;
  const ax = Math.abs(dx || 0), ay = Math.abs(dy || 0);
  if (dy < 0 && ax < ay * tilt) return 'dump';
  if (dx > 0) return 2;
  if (dx < 0) return dy < 0 && ay >= ax * tilt ? 1 : 0;
  return 1;
}
// the hitter approached in lane hit, the set went to lane set: 'hit' (same), 'danke' (next lane: only a bump over, a free ball), 'floor' (two lanes off)
function hyLaneResult(set, hit) {
  const d = Math.abs(set - hit);
  return d === 0 ? 'hit' : d === 1 ? 'danke' : 'floor';
}
// hitter swipe: 'L' / 'R' spike or 'LOB'; aim = lob side (-1 left, 1 right, 0 straight; same tilt as the P3 Lob aim)
function hyAttackDir(dx, dy, lobTilt) {
  const ax = Math.abs(dx || 0), ay = Math.abs(dy || 0);
  if (dy < 0 && ay > ax * 1.1) return { dir: 'LOB', aim: ax > ay * lobTilt ? Math.sign(dx) : 0 };
  return { dir: dx < 0 ? 'L' : 'R', aim: 0 };
}
// lane (receiver-local) of an aimed lob: the hitter's left is the receiver's right; straight = random lane
const hyLobLane = (aim, rng) => aim < 0 ? 2 : aim > 0 ? 0 : Math.min(2, (rng() * 3) | 0);
const hyMix = (a, d) => a[0] + (a[1] - a[0]) * Math.min(1, Math.max(0, d));
// computer hitter runs into the set lane (else it stays and the ball becomes a free ball / drops)
const hyBotFollow = (rng, dif) => rng() < hyMix(HYS.hy.botFollow, dif);
// computer setter: sets the hitter's lane, now and then a neighbour lane (the hitter has to move)
function hyBotSetLane(rng, dif, hitLane) {
  if (rng() < hyMix(HYS.hy.botSetOk, dif)) return hitLane;
  return hitLane === 1 ? (rng() < 0.5 ? 0 : 2) : 1;
}

if (typeof module !== 'undefined') module.exports = { hyRotate, hySlot, hyFig, hyCtl, hyPlan, hyTouch, hySetLane, hyLaneResult, hyAttackDir, hyLobLane, hyMix, hyBotFollow, hyBotSetLane };
