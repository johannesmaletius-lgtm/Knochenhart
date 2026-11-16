// Power-ups + campaign abilities (js/powers.js, SKILLS.items, SKILLS.camp.chapters[].ab): item weights (10k rolls), the Spike 85
// fireball boost, opponent item meter per chapter, every chapter boss has its own ability, Elite stages preview it weaker.
// Usage: node tests/powers.test.js   (exit 1 on any failure)
'use strict';
const S = require('../js/skills.js');
const P = require('../js/powers.js');
const C = require('../js/campaign.js');
const { SKILLS } = S, I = SKILLS.items, K = SKILLS.camp;
let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } };
let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

// item roll: 10k picks match the weights (+-2 % points)
for (const fu of [false, true]) {
  const w = P.pwWeights(fu), tot = Object.values(w).reduce((a, b) => a + b, 0), cnt = {};
  for (let i = 0; i < 10000; i++) { const k = P.pwPick(w, rnd()); cnt[k] = (cnt[k] || 0) + 1; }
  for (const k of I.kinds) ok(Math.abs(cnt[k] / 10000 - w[k] / tot) < 0.02, (fu ? 'Spike 85: ' : '') + k + ' ' + (cnt[k] / 100).toFixed(1) + '% vs ' + (w[k] / tot * 100).toFixed(1) + '%');
  console.log((fu ? 'with Spike 85: ' : 'items: ') + I.kinds.map(k => k + ' ' + (cnt[k] / 100).toFixed(1) + '%').join(', '));
}
ok(P.pwWeights(true).fire === I.w.fire * I.fireUnlock && I.fireUnlock > 1, 'Spike 85 makes fireballs more likely');
ok(I.kinds.every(k => I.names[k] && I.short[k]) && I.opp.kinds.every(k => I.kinds.includes(k)), 'every item has a name; their items are ours too');
ok(I.slowK > 1 && I.opp.fireT < 1, 'Bone Time slows, their fireball is faster');

// opponent item meter: never below the minimum, never rising with the chapter
const need = K.chapters.map((_, ch) => P.pwOppNeed(ch));
console.log('their item every N points by chapter:', need.join(' '));
ok(need.every((v, i) => v >= I.opp.meter[2] && (!i || v <= need[i - 1])), 'opponent meter falls with the chapter, min ' + I.opp.meter[2]);

// abilities: every chapter boss has its own one, Elite stages preview it, other stages none
const ids = K.chapters.map(c => c.ab && c.ab.id);
ok(ids.every(Boolean) && new Set(ids).size === ids.length, 'every boss ability is unique: ' + ids.join(','));
ok(K.chapters.every(c => c.ab.n && c.ab.d && (c.ab.p == null || (c.ab.p > 0 && c.ab.p <= 1))), 'abilities have name, text, chance in (0, 1]');
const st = C.caStages();
ok(st.every(s => s.boss ? s.ab === K.chapters[s.ch].ab && s.abK === 1 : s.j === K.per - 2 ? s.ab === K.chapters[s.ch].ab && s.abK === K.elite : !s.ab), 'bosses full, Elite stages at elite x, rest none');
ok(st.every(s => s.items === (s.ch >= I.opp.from)), 'opponents use items from chapter ' + (I.opp.from + 1));
const dec = P.PW_DECREE();
ok(dec.length >= 6 && !dec.includes('wind') && !dec.includes('decree') && dec.every(id => ids.includes(id)), 'Royal Decree picks from the other bosses: ' + dec.join(','));

console.log((fails ? 'FAIL' : 'OK') + ': ' + (n - fails) + '/' + n + ' power checks');
process.exit(fails ? 1 : 0);
