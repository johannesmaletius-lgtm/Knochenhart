// Progress sim: days until all six skills are 99 with normal play (SKILLS.plan), coins as in the game.
// Usage: node tests/sim-progress.js   (exit 1 if the plan win rate misses the target by more than 0.5 days)
'use strict';
const S = require('../js/skills.js'), { SKILLS } = S;
let seed = 1;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

// one player: plays matchesPerDay matches a day, first win of the day pays daily, spends coins on the lowest skill
function run(winRate) {
  const E = SKILLS.earn, perDay = SKILLS.plan.matchesPerDay, p = S.skillsNew();
  let coins = 0, m = 0;
  for (let day = 0; day < 365; day++) {
    let bonus = true;
    for (let i = 0; i < perDay; i++, m++) {
      if (rnd() < winRate) { coins += bonus ? E.daily : E.win; bonus = false; } else coins += E.loss;
      for (;;) {
        const id = SKILLS.ids.reduce((a, b) => (p.sk[b] < p.sk[a] ? b : a));
        const c = S.trySkillUp(p, id, coins);
        if (!c) break;
        coins -= c;
      }
      if (S.ovr(p) === SKILLS.max && SKILLS.ids.every(id => p.sk[id] === SKILLS.max)) return (m + 1) / perDay;
    }
  }
  return Infinity;
}
function stats(winRate, n) {
  const d = []; for (let i = 0; i < n; i++) d.push(run(winRate));
  d.sort((a, b) => a - b);
  return { mean: d.reduce((a, b) => a + b, 0) / n, p10: d[(n * 0.1) | 0], p90: d[(n * 0.9) | 0] };
}

const E = SKILLS.earn, P = SKILLS.plan;
console.log('cost per level 60..98:', Array.from({ length: SKILLS.max - SKILLS.min }, (_, i) => S.levelCost(SKILLS.min + i)).join(' '));
console.log('one skill 60->99:', S.costTo(SKILLS.min, SKILLS.max), 'coins, all six:', S.totalCost(), 'coins');
console.log('income/day at plan (' + P.matchesPerDay + ' matches, ' + P.winRate * 100 + '% wins):',
  (P.matchesPerDay * (P.winRate * E.win + (1 - P.winRate) * E.loss) + (E.daily - E.win)).toFixed(0), 'coins (approx.)');
for (const w of [0.3, 0.4, 0.5, 0.6, 0.7]) {
  const s = stats(w, 2000);
  console.log('win rate ' + (w * 100).toFixed(0).padStart(2) + '%: days to 99 mean ' + s.mean.toFixed(2) + '  (p10 ' + s.p10.toFixed(2) + ', p90 ' + s.p90.toFixed(2) + ')');
}
const t = stats(P.winRate, 2000).mean, ok = Math.abs(t - P.days) <= 0.5;
console.log((ok ? 'OK' : 'FAIL') + ': plan ' + P.days + ' days, simulated ' + t.toFixed(2));
process.exit(ok ? 0 : 1);
