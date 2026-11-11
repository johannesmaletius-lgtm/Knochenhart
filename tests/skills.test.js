// Assertions for js/skills.js: OVR, costs, curves (10k rolls), unlocks, perks, save roundtrip with a mock store.
// Usage: node tests/skills.test.js   (exit 1 on any failure)
'use strict';
const S = require('../js/skills.js'), { SKILLS } = S;
let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, msg + ' (got ' + a.toFixed(4) + ', want ' + b + ' +-' + tol + ')');
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const rolls = (p, k = 10000) => { let h = 0; for (let i = 0; i < k; i++) if (rnd() < p) h++; return h / k; };

// table
ok(SKILLS.ids.length === 6 && SKILLS.min === 60 && SKILLS.max === 99, 'six skills 60..99');
for (const id of SKILLS.ids) ok(SKILLS.names[id] && SKILLS.weight[id] > 0 && SKILLS.perks[id].length >= 1, 'table complete: ' + id);

// OVR
const p = S.skillsNew();
ok(S.ovr(p) === 60, 'fresh OVR 60');
ok(S.ovr(S.skillsNew(99)) === 99, 'max OVR 99');
p.sk.spike = 99; p.sk.block = 81;
ok(S.ovr(p) === Math.round((60 * 4 + 99 + 81) / 6), 'OVR = mean');

// costs
ok(S.levelCost(59) === 0 && S.levelCost(99) === 0, 'no cost outside 60..98');
let mono = true; for (let L = 61; L < 99; L++) if (S.levelCost(L) < S.levelCost(L - 1) || S.levelCost(L) < 1) mono = false;
ok(mono, 'cost per level >= 1 and rising');
ok(S.costTo(60, 99) * 6 === S.totalCost(), 'totalCost = 6 skills');
const E = SKILLS.earn, P = SKILLS.plan;
const perDay = P.matchesPerDay * (P.winRate * E.win + (1 - P.winRate) * E.loss) + (E.daily - E.win);
near(S.totalCost() / perDay, P.days, 0.4, 'all skills 60->99 ~ plan days of income');

// buying, no respec
const q = S.skillsNew();
ok(S.trySkillUp(q, 'lob', 0) === 0 && q.sk.lob === 60, 'no coins, no level');
ok(S.trySkillUp(q, 'lob', 100) === S.levelCost(60) && q.sk.lob === 61, 'buy one level');
const m = S.skillsNew(99);
ok(S.trySkillUp(m, 'lob', 1e9) === 0 && m.sk.lob === 99, 'capped at 99');

// recycle curve (+ 10k rolls)
near(S.recycleChance(60), 0.7, 1e-9, 'recycle 60'); near(S.recycleChance(90), 0.1, 1e-9, 'recycle 90'); near(S.recycleChance(99), 0.03, 1e-9, 'recycle 99');
let down = true; for (let s = 61; s <= 99; s++) if (S.recycleChance(s) >= S.recycleChance(s - 1)) down = false;
ok(down, 'recycle falls with block skill');
for (const [s, want] of [[60, 0.7], [90, 0.1], [99, 0.03]]) near(rolls(S.recycleChance(s)), want, 0.015, '10k rolls recycle ' + s);

// net fault 0 / 30 %, linear (+ 10k rolls)
ok(S.netFault(0) === 0 && S.netFault(SKILLS.net.okay) === 0, 'no net fault at okay or better');
near(S.netFault(1), 0.3, 1e-9, 'net fault at very bad timing');
near(S.netFault((SKILLS.net.okay + 1) / 2), 0.15, 1e-9, 'net fault linear');
near(rolls(S.netFault(1)), 0.3, 0.015, '10k rolls net fault');

// timing scaling
ok(S.timingQ(60, 0) === 1 && S.timingQ(99, 0) === 1, 'perfect timing = full quality');
ok(S.timingQ(60, 1) < 0.05, 'skill 60: very bad timing is punished hard');
ok(S.timingQ(99, 1) >= 0.4 && S.timingQ(99, 0.6) > S.timingQ(60, 0.6), 'skill 99: bad timing still decent');

// unlocks
const u = S.skillsNew();
for (const f of Object.keys(SKILLS.unlock)) ok(!S.unlocked(u, f), 'locked at 60: ' + f);
u.sk.lob = 75; u.sk.block = 75; u.sk.serve = 75; u.sk.dig = 70; u.sk.spike = 84;
ok(S.unlocked(u, 'lobAim') && S.unlocked(u, 'splitBlock') && S.unlocked(u, 'float') && S.unlocked(u, 'dive'), 'unlocks at 75/75/75/70');
ok(!S.unlocked(u, 'fireball'), 'fireball locked at 84'); u.sk.spike = 85; ok(S.unlocked(u, 'fireball'), 'fireball at 85');

// badges and perks
ok(!S.pickPerk(u, 'spike', 'hotHand'), 'no perk below 90');
u.sk.spike = 90;
ok(S.pickPerk(u, 'spike', 'hotHand') && S.hasPerk(u, 'hotHand') && S.perk(u, 'spike').v === 0.75, 'perk at 90');
ok(!S.pickPerk(u, 'spike', 'longArms'), 'perk must be in the same area');

// save roundtrip with mock store (same key scheme as store: knochenhart.*)
const mem = {};
const st = { get(k, d) { const v = mem['knochenhart.' + k]; return v == null ? d : JSON.parse(v); }, set(k, v) { mem['knochenhart.' + k] = JSON.stringify(v); } };
S.skillsSave(u, st);
ok('knochenhart.skills' in mem, 'saved under knochenhart.skills');
const back = S.skillsLoad(st);
ok(JSON.stringify(back.sk) === JSON.stringify(u.sk) && back.badge.spike === 'hotHand', 'roundtrip');
ok(JSON.stringify(S.skillsLoad({ get: (k, d) => d }).sk) === JSON.stringify(S.skillsNew().sk), 'empty store -> fresh profile');
mem['knochenhart.skills'] = JSON.stringify({ sk: { spike: 140, lob: 'x', recv: 12 }, badge: { lob: 'hotHand' } });
const bad = S.skillsLoad(st);
ok(bad.sk.spike === 99 && bad.sk.lob === 60 && bad.sk.recv === 60 && !bad.badge.lob, 'bad data is clamped');
const tmp = S.skillsNew(99); tmp.tmp = true; delete mem['knochenhart.skills'];
S.skillsSave(tmp, st); ok(!('knochenhart.skills' in mem), '?ovr profile is not saved');

console.log((fails ? 'FAIL ' : 'OK ') + (n - fails) + '/' + n + ' checks');
process.exit(fails ? 1 : 0);
