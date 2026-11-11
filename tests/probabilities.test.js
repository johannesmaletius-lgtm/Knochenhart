// P3: every skill probability rolled 10k times (seeded) against its target, plus timing scaling checks.
// Usage: node tests/probabilities.test.js   (exit 1 on any failure)
'use strict';
const fs = require('fs'), path = require('path');
const S = require('../js/skills.js'), { SKILLS } = S;
// BAL lives in engine.js (browser file): take its object literal (numbers only)
const src = fs.readFileSync(path.join(__dirname, '../js/engine.js'), 'utf8');
const BAL = Function('return ' + src.slice(src.indexOf('const BAL = {') + 12, src.indexOf('\n};', src.indexOf('const BAL = {')) + 2))();
let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, msg + ' (got ' + a.toFixed(4) + ', want ' + b + ' +-' + tol + ')');
const rng = S.mulberry32(1), K = 10000;
const rate = f => { let h = 0; for (let i = 0; i < K; i++) if (f()) h++; return h / K; };
const prof = (lv, set) => { const p = S.skillsNew(lv); Object.assign(p.sk, set || {}); return p; };
const withPerk = (id, perkId, lv = 90) => { const p = prof(60, { [id]: lv }); S.pickPerk(p, id, perkId); return p; };
const T = 0.02; // tolerance for 10k rolls (~4 sigma at p = 0.3)

// seeded RNG: deterministic, uniform
const a = S.mulberry32(1), b = S.mulberry32(1);
ok([0, 1, 2, 3].every(() => a() === b()), 'seed=1 is deterministic');
near(rate(() => rng() < 0.5), 0.5, T, 'mulberry32 uniform');

// net fault: 0 % at okay or better, 15 % in the middle, 30 % at very bad (skill 60 = raw timing)
const O = SKILLS.net.okay, net = (sk, err) => rate(() => S.hitFault(sk, err, 0, 0, rng) === 'net');
near(net(60, 0), 0, 0, '10k net fault, perfect timing');
near(net(60, O), 0, 0, '10k net fault at okay');
near(net(60, (O + 1) / 2), 0.15, T, '10k net fault in the middle');
near(net(60, 1), 0.3, T, '10k net fault at very bad timing');
near(net(60, S.timingErr(BAL.atkWin[1] - 1e-6, BAL.atkWin)), 0, 0, '10k no net fault inside the good window');
near(net(60, S.timingErr(BAL.atkWin[2], BAL.atkWin)), 0.3, T, '10k net fault at the worst spike timing');
// out faults only on top (weak hits), net first
near(rate(() => S.hitFault(60, 1, 0, BAL.spikeOut, rng) !== ''), 0.3 + 0.7 * BAL.spikeOut, T, '10k weak spike fault total');
near(rate(() => S.hitFault(60, 1, 0, BAL.serveOut.auto, rng) !== ''), 0.3, T, '10k missed serve timing fault total = old 30 %');

// timing scaling: skill 60 keeps the old windows; quality rises with skill; faults fall with skill
const oldQ = adt => adt < 0.075 ? 'perfect' : adt < 0.17 ? 'good' : 'weak';
let same = true; for (let adt = 0; adt <= 0.3; adt += 0.001) if (S.hitTier(60, S.timingErr(adt, BAL.atkWin)) !== oldQ(adt)) same = false;
ok(same, 'skill 60: perfect/good/weak windows unchanged (0.075 / 0.17 s)');
let mono = true;
for (let e = 0; e <= 1; e += 0.05) for (let s = 61; s <= 99; s++) if (S.timingQ(s, e) < S.timingQ(s - 1, e) - 1e-12) mono = false;
ok(mono, 'timing quality monotone in skill');
const faultBy = [60, 75, 90, 99].map(s => net(s, 1));
ok(faultBy.every((v, i) => i === 0 || v < faultBy[i - 1]), 'very bad timing: net faults fall with skill ' + faultBy.map(v => v.toFixed(3)).join(' > '));
const goodBy = [60, 75, 90, 99].map(s => rate(() => S.hitTier(s, rng()) !== 'weak'));
ok(goodBy.every((v, i) => i === 0 || v > goodBy[i - 1]), 'random timing: non-weak hits rise with skill ' + goodBy.map(v => v.toFixed(3)).join(' < '));
ok(S.hitTier(99, 0.2) === 'good' && S.hitTier(99, 0.1) === 'perfect', 'perfect stays pure timing');
ok(S.hitTier(60, 0.45, 0.15) === 'good' && S.hitTier(60, 0.45) === 'weak', 'Heavy Arm bonus lifts a weak hit');

// Block-Anschlag (graze) 5 %, stuff on top
near(rate(() => S.blockRoll(BAL.blockGraze, 0, rng) === 'graze'), 0.05, 0.006, '10k block graze');
near(BAL.blockGraze, 0.05, 1e-9, 'BAL.blockGraze = 5 %');
const st = S.stuffChance(prof(60));
near(st, SKILLS.mateBlock.stuff[0], 1e-9, 'our stuff chance at Block 60');
near(rate(() => S.blockRoll(BAL.blockGraze, st, rng) === 'stuff'), st, 0.006, '10k our stuff at Block 60');
ok(S.stuffChance(prof(60, { block: 75 })) > 1.4 * S.stuffChance(prof(60, { block: 74 })), 'split block at Block 75');
ok(S.stuffChance(withPerk('block', 'longArms')) > S.stuffChance(prof(60, { block: 90 })), 'Long Arms: more stuffs');

// Block recycle by the blocker's Block skill: 60 ~70 %, 90 ~10 %, 99 ~3 %
for (const [s, want] of [[60, 0.7], [90, 0.1], [99, 0.03]]) near(rate(() => rng() < S.recycleP(prof(60, { block: s }))), want, T, '10k recycle vs Block ' + s);
near(rate(() => rng() < S.recycleP(withPerk('block', 'wall'))), 0.1 * 0.6, T, '10k recycle vs Wall perk');
// opponent skills keep the old block feel (recycle = 1 - lerp(0.45, 0.7, d))
let aiOk = true; for (let d = 0; d <= 1; d += 0.1) if (Math.abs(S.recycleP(S.aiProfile(d)) - (0.55 - 0.25 * d)) > 0.05) aiOk = false;
ok(aiOk, 'AI block skill: recycle within 5 % of the old curve');
ok(S.aiProfile(0).tmp && S.ovr(S.aiProfile(1)) > S.ovr(S.aiProfile(0)), 'AI profile rises with difficulty, never saved');

// late defense: skill 60 = old chance, more with skill and perks
for (const base of [0.8, 0.45]) {
  near(rate(() => rng() < S.lateSaveP(prof(60), 'spike', base)), base, T, '10k late dig at 60, base ' + base);
  const by = [60, 75, 90, 99].map(s => S.lateSaveP(prof(60, { dig: s }), 'spike', base));
  ok(by.every((v, i) => i === 0 || v > by[i - 1]), 'late dig save rises with Dig skill (base ' + base + ')');
}
ok(S.lateSaveP(prof(60, { recv: 99 }), 'serve', 0.45) > S.lateSaveP(prof(60, { recv: 99 }), 'spike', 0.45), 'serves use Receive, spikes Dig');
ok(S.lateSaveP(withPerk('recv', 'platform'), 'serve', 0.45) > S.lateSaveP(prof(60, { recv: 90 }), 'serve', 0.45), 'Platform perk');
ok(S.lateSaveP(withPerk('recv', 'calm'), 'serve', 0.45) > S.lateSaveP(prof(60, { recv: 90 }), 'serve', 0.45), 'Calm perk');
ok(S.lateSaveP(withPerk('dig', 'pancake'), 'tip', 0.45) > S.lateSaveP(prof(60, { dig: 90 }), 'tip', 0.45), 'Pancake perk');
ok(S.digWild(prof(60), 'spike') === 1 && S.digWild(prof(60, { dig: 99 }), 'spike') === SKILLS.dig.wild[1], 'dig scatter by skill');

// Dive (Dig 70)
ok(S.diveReach(prof(60, { dig: 69 })) === 0 && S.diveReach(prof(60, { dig: 70 })) === SKILLS.dive.reach, 'dive unlocks at Dig 70');
ok(S.diveReach(withPerk('dig', 'catReflex')) > SKILLS.dive.reach, 'Cat Reflex: bigger dive reach');
near(rate(() => rng() < S.diveSave(prof(60, { dig: 70 }))), S.diveSave(prof(60, { dig: 70 })), T, '10k dive save at Dig 70');
ok(S.diveSave(prof(60, { dig: 99 })) > S.diveSave(prof(60, { dig: 70 })), 'dive save rises with Dig');

// thresholds used by the engine
const u = prof(60, { spike: 84, lob: 74, serve: 74 });
ok(!S.unlocked(u, 'fireball') && !S.unlocked(u, 'lobAim') && !S.unlocked(u, 'float'), 'fireball/lob aim/float locked below threshold');
ok(S.fireMax(prof(60), BAL.meterMax) === BAL.meterMax && S.fireMax(withPerk('spike', 'hotHand'), BAL.meterMax) < BAL.meterMax, 'Hot Hand: shorter fireball bar');

console.log(fails ? fails + ' of ' + n + ' FAILED' : 'OK ' + n + '/' + n + ' probability checks');
process.exit(fails ? 1 : 0);
