// Coins by opponent strength + daily challenges (js/daily.js): pay rises with difficulty / opponent OVR, underdog bonus,
// daily x2, same 3 different challenges for a date, sum vs max progress, paid only once, new day starts fresh.
// Usage: node tests/daily.test.js   (exit 1 on any failure)
'use strict';
const { SKILLS } = require('../js/skills.js');
const D = require('../js/daily.js');
let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } };
const E = SKILLS.earn;

// pay by strength
const lv = [0, 1, 2].map(l => D.earnWin({ lv: l }).n);
ok(lv[0] < lv[1] && lv[1] < lv[2], 'Easy < Normal < Hard: ' + lv);
ok(lv[1] === E.win, 'Normal pays the base win');
ok(D.earnWin({ lv: 1, daily: true }).n === E.win * E.dailyMul, 'daily bonus x dailyMul');
const o60 = D.earnWin({ opp: 60 }).n, o80 = D.earnWin({ opp: 80 }).n, o99 = D.earnWin({ opp: 99 }).n;
ok(o60 < o80 && o80 < o99, 'pay rises with opponent OVR: ' + [o60, o80, o99]);
ok(o60 === Math.round(E.win * E.ovr[0]) && o99 === Math.round(E.win * E.ovr[1]), 'OVR ends match the table');
const eq = D.earnWin({ opp: 80, me: 80 }), up = D.earnWin({ opp: 80, me: 70 }), down = D.earnWin({ opp: 80, me: 95 });
ok(eq.under === 0 && down.under === 0 && down.n === eq.n, 'no underdog bonus vs. weaker or equal opponents');
ok(up.n > eq.n && Math.abs(up.under - 10 * E.under) < 1e-9, 'underdog bonus per OVR point');
ok(D.earnWin({ opp: 99, me: 60 }).under === E.underMax, 'underdog bonus capped');
ok(D.earnWin({}).n === E.win, 'multiplayer: base win');
ok(D.earnLoss(E.lossMin) === E.loss && D.earnLoss(E.lossMin - 1) === 0 && D.earnLoss(15, 0.5) === Math.round(E.loss * 0.5), 'loss pays from lossMin points on');
ok(D.earnWin({ lv: 1, mul: 0.5 }).n === Math.round(E.win * 0.5), 'extra factor (Skill Games coinMul)');

// picks: n different ids from the pool, stable per day, not always the same set
const ids = new Set(SKILLS.daily.pool.map(c => c.id));
ok(ids.size === SKILLS.daily.pool.length, 'pool ids unique');
const keys = ['perfect', 'digs', 'saves', 'kills', 'aces', 'blocked', 'maxRally', 'fires', 'bout', 'lobs', 'wins', 'hard'];
ok(SKILLS.daily.pool.every(c => keys.includes(c.k) && c.g > 0 && c.c > 0 && c.t), 'pool entries valid');
const seen = new Set();
for (let d = 0; d < 400; d++) {
  const day = 20260101 + d, p = D.dailyPick(day);
  if (p.length !== SKILLS.daily.n || new Set(p).size !== p.length || !p.every(id => ids.has(id))) { ok(false, 'pick ' + day + ': ' + p); break; }
  if (String(D.dailyPick(day)) !== String(p)) { ok(false, 'pick not stable ' + day); break; }
  p.forEach(id => seen.add(id));
}
ok(seen.size === ids.size, 'every challenge shows up over a year');

// progress: sum vs max, pay once, new day resets
const day = 20261111;
const st = D.dailyState(null, day);
st.ids = ['bout', 'rally', 'wins'];
ok(D.dailyAdd(st, { bout: 3, maxRally: 8, wins: 1 }).length === 0, 'nothing done yet');
ok(st.p.bout === 3 && st.p.rally === 8 && st.p.wins === 1, 'progress stored');
ok(D.dailyReached(st, { bout: 2 }).map(c => c.id).join() === 'bout', 'reached in a running match');
let done = D.dailyAdd(st, { bout: 2, maxRally: 6, wins: 1 });
ok(done.map(c => c.id).join() === 'bout', 'sum challenge done; max keeps best rally: ' + st.p.rally);
ok(st.p.rally === 8, 'max: best single match');
done = D.dailyAdd(st, { bout: 4, maxRally: 12, wins: 1 });
ok(done.map(c => c.id).sort().join() === 'rally,wins', 'rest done');
ok(D.dailyAdd(st, { bout: 9, maxRally: 20, wins: 5 }).length === 0, 'paid only once');
ok(st.p.bout === 5, 'progress capped at the goal');
const same = D.dailyState(JSON.parse(JSON.stringify(st)), day);
ok(same.paid.length === 3 && same.ids.join() === st.ids.join(), 'same day: state kept');
const next = D.dailyState(st, day + 1);
ok(next.paid.length === 0 && Object.keys(next.p).length === 0 && next.ids.length === SKILLS.daily.n, 'new day: fresh set');

console.log((fails ? 'FAIL' : 'OK') + ': ' + (n - fails) + '/' + n + ' daily checks');
process.exit(fails ? 1 : 0);
