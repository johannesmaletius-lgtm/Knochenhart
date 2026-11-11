// P6 Skill Games (js/skillgames.js): budget = 30% of the max cost, spend / refund, host check (P5 cleaning + budget),
// auto spread inside the budget, the real profile + saved data + coins stay untouched by a Skill Games match.
// Usage: node tests/skillgames.test.js   (exit 1 on any failure)
'use strict';
const S = require('../js/skills.js');
const G = require('../js/skillgames.js');
const { SKILLS, totalCost, costTo, levelCost, skillsLoad, skillsSave, pickPerk, ovr } = S;
let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } };

// budget: share (0.3) of the coins for all six skills 60 -> 99, from the cost curve
const B = G.sgBudget();
ok(SKILLS.sg.share === 0.3, 'share parameter is 0.3');
ok(B === Math.round(totalCost() * 0.3) && B === 173, 'budget = 30% of the max cost (' + B + ' of ' + totalCost() + ')');
const sh = SKILLS.sg.share; SKILLS.sg.share = 0.25; ok(G.sgBudget() === Math.round(totalCost() / 4), 'budget follows the share parameter'); SKILLS.sg.share = sh;

// start at 60, spend up to the budget, never over it
const p = G.sgNew();
ok(p.tmp && p.sg && SKILLS.ids.every(id => p.sk[id] === SKILLS.min) && G.sgSpent(p) === 0, 'new Skill Games profile: all 60, temporary');
let spent = 0, c; while ((c = G.sgUp(p, 'spike', B))) spent += c;
ok(p.sk.spike === SKILLS.max && spent === costTo(SKILLS.min, SKILLS.max) && G.sgSpent(p) === spent, 'one skill can go to 99 (' + spent + ')');
for (const id of SKILLS.ids) while (G.sgUp(p, id, B));
ok(G.sgSpent(p) <= B && B - G.sgSpent(p) < Math.max(...SKILLS.ids.map(id => levelCost(p.sk[id]) || Infinity)), 'raising stops at the budget');
const before = JSON.stringify(p.sk);
ok(SKILLS.ids.every(id => G.sgUp(p, id, B) === 0) && JSON.stringify(p.sk) === before, 'overspending refused (sgUp returns 0, nothing changes)');
// refund: down a level gives that level's cost back; a badge below 90 is dropped
const q = G.sgNew(); for (let i = 0; i < 30; i++) G.sgUp(q, 'block', B);
ok(q.sk.block === 90 && pickPerk(q, 'block', 'wall'), 'badge pickable at 90 in the temporary profile');
const s0 = G.sgSpent(q); G.sgDown(q, 'block');
ok(q.sk.block === 89 && G.sgSpent(q) === s0 - levelCost(89) && !q.badge.block, 'lowering refunds and drops the badge below 90');
ok(G.sgDown(G.sgNew(), 'lob') === 0, 'cannot go below 60');

// host check: P5 cleaning + budget
const legit = G.sgCheck(JSON.parse(JSON.stringify(G.sgWire(p))), B);
ok(legit && JSON.stringify(legit.sk) === JSON.stringify(p.sk) && legit.tmp && legit.sg, 'legit spread accepted unchanged');
const all99 = { sk: Object.fromEntries(SKILLS.ids.map(id => [id, 99])), badge: {} };
ok(G.sgCheck(all99, B) === null, 'over-budget spread (all 99) rejected');
ok(G.sgCheck({ sk: { spike: 99, lob: 99, recv: 99, dig: 61, block: 60, serve: 60 } }, B) === null, 'one level over budget rejected');
const junk = G.sgCheck({ sk: { spike: -5, lob: 'x', recv: 1e9 }, badge: { recv: 'notAPerk', spike: 'hotHand' } }, B);
ok(junk && junk.sk.spike === 60 && junk.sk.lob === 60 && junk.sk.recv === 99 && !junk.badge.recv && !junk.badge.spike, 'junk cleaned like P5 profiles (clamped, bad perks dropped)');
ok(G.sgCheck(null, B) === null && G.sgCheck('x', B) === null, 'no data rejected');

// auto spread: inside the budget, nothing affordable left; balanced (mix 0) keeps the skills within one level band
let rs = 7; const rng = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
for (let t = 0; t < 2000; t++) {
  const mix = t % 3 === 0 ? 0 : t % 3 === 1 ? SKILLS.sg.aiMix : 1, a = G.sgAuto(G.sgNew(), B, rng, mix), left = B - G.sgSpent(a);
  if (G.sgSpent(a) > B) { ok(false, 'auto spread over budget'); break; }
  if (SKILLS.ids.some(id => levelCost(a.sk[id]) && levelCost(a.sk[id]) <= left)) { ok(false, 'auto spread left budget unused'); break; }
  if (SKILLS.ids.some(id => a.sk[id] >= SKILLS.badgeAt && !a.badge[id])) { ok(false, 'auto spread badge without perk'); break; }
  if (mix === 0 && Math.max(...Object.values(a.sk)) - Math.min(...Object.values(a.sk)) > 1) { ok(false, 'balanced spread uneven'); break; }
  if (G.sgCheck(G.sgWire(a), B) === null) { ok(false, 'auto spread fails the host check'); break; }
}
ok(true, 'auto spread 2000x inside the budget');
const half = G.sgAuto(G.sgNew(), B, rng, 0), part = G.sgNew(); part.sk.spike = 80;
G.sgAuto(part, B, rng, 0);
ok(part.sk.spike >= 80 && G.sgSpent(part) <= B, 'auto spread keeps what you already spent');
console.log('balanced auto spread', JSON.stringify(half.sk), 'OVR', ovr(half), '| budget', B);

// a Skill Games match never touches the real profile, the saved data or the coins
const mem = { 'skills': { v: 1, sk: { spike: 77, lob: 64, recv: 90, dig: 60, block: 71, serve: 85 }, badge: { recv: 'calm' } }, coins: 123 };
const st = { get: (k, d) => k in mem ? JSON.parse(JSON.stringify(mem[k])) : d, set: (k, v) => { mem[k] = JSON.parse(JSON.stringify(v)); } };
let PROFILE = skillsLoad(st);
const real = PROFILE, snap = JSON.stringify(mem), realSnap = JSON.stringify(real);
const SG = { on: false, real: null, prof: null, opp: null };
const tmp = G.sgAuto(G.sgNew(), B, rng, 0), opp = G.sgAuto(G.sgNew(), B, rng, SKILLS.sg.aiMix);
PROFILE = G.sgEnter(SG, PROFILE, tmp, opp);
ok(PROFILE === tmp && SG.on && SG.opp === opp, 'match uses the temporary profile');
// the match: perks picked, levels moved, saves attempted -> all go to the temporary profile only
for (const id of SKILLS.ids) if (PROFILE.sk[id] >= 90) pickPerk(PROFILE, id, SKILLS.perks[id][1].id);
G.sgUp(PROFILE, 'serve', B); G.sgDown(PROFILE, 'spike'); skillsSave(PROFILE, st);
PROFILE = G.sgEnter(SG, PROFILE, G.sgNew()); // Again: a second spread keeps the real one held
PROFILE = G.sgLeave(SG, PROFILE);
ok(PROFILE === real && !SG.on && SG.real === null, 'after the match the real profile is back');
ok(JSON.stringify(real) === realSnap, 'real profile unchanged');
ok(JSON.stringify(mem) === snap && mem.coins === 123, 'saved skills and coins unchanged');
ok(G.sgLeave(SG, PROFILE) === real, 'leaving twice is harmless');

console.log((fails ? 'FAIL' : 'OK') + ' skillgames: ' + (n - fails) + '/' + n);
process.exit(fails ? 1 : 0);
