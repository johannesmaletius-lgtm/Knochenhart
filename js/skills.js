'use strict';
// skills: SKILLS table (curves, costs, thresholds, badge perks), OVR, profile load/save, ?ovr= debug.
// Data + small helpers only (no engine effect yet). Runs in the browser (classic script, globals)
// and in Node (module.exports) so tests/ can load it directly.
/* ---------------- skill table: every skill number lives here ---------------- */
const SKILLS = {
  ids: ['spike', 'lob', 'recv', 'dig', 'block', 'serve'],
  names: { spike: 'Spike', lob: 'Lob', recv: 'Receive', dig: 'Dig', block: 'Block', serve: 'Serve' },
  min: 60, max: 99,
  // OVR = weighted mean of all skills
  weight: { spike: 1, lob: 1, recv: 1, dig: 1, block: 1, serve: 1 },
  // coins to raise a skill from L to L+1: round(base + grow * x^pow), x = (L - min) / (max - 1 - min)
  // tuned with tests/sim-progress.js: all six skills 60 -> 99 in ~3 days of plan (below)
  cost: { base: 0.75, grow: 1.8, pow: 2 },
  // coins per match (shop.js pays these); daily = first win of the day instead of win
  earn: { win: 10, loss: 0, daily: 20 },
  // progression target: normal play
  plan: { matchesPerDay: 20, winRate: 0.5, days: 3 },
  // timing: x = skill progress 0..1, err = timing error 0 (perfect) .. 1 (very bad)
  // quality = max(floor, 1 - err * pen): low skill punishes bad timing hard, high skill keeps a decent result
  timing: { pen: [1, 0.55], floor: [0, 0.4] },
  // net fault: 0 at timing "okay" or better (err <= okay), max at very bad (err >= 1), linear between
  net: { okay: 0.35, max: 0.3 },
  // block recycle: chance the attacking team still saves a blocked ball, by the blocker's Block skill
  recycle: [[60, 0.7], [70, 0.45], [80, 0.25], [90, 0.1], [99, 0.03]],
  // threshold unlocks: feature -> [skill, level]
  unlock: { lobAim: ['lob', 75], splitBlock: ['block', 75], float: ['serve', 75], dive: ['dig', 70], fireball: ['spike', 85] },
  unlockNames: { lobAim: 'Lob aim', splitBlock: 'Split block', float: 'Float serve', dive: 'Dive', fireball: 'Fireball' },
  // local leaderboard (profile.js): stored entries, player name length
  board: { max: 50, nameMax: 12 },
  // skill badge at 90: pick one perk in the same area; v = effect value for the engine (P3)
  badgeAt: 90,
  perks: {
    spike: [{ id: 'hotHand', n: 'Hot Hand', d: 'Fireball charges faster', v: 0.75 }, { id: 'heavyArm', n: 'Heavy Arm', d: 'Weak timing still hits hard', v: 0.15 }],
    lob: [{ id: 'feather', n: 'Feather', d: 'Lobs drop shorter, harder to read', v: 0.2 }, { id: 'sneaky', n: 'Sneaky', d: 'Lob aim hidden until the hit', v: 1 }],
    recv: [{ id: 'platform', n: 'Platform', d: 'Good pass even with bad timing', v: 0.5 }, { id: 'calm', n: 'Calm', d: 'Aces against you are rarer', v: 0.7 }],
    dig: [{ id: 'catReflex', n: 'Cat Reflex', d: 'Bigger dive window', v: 1.25 }, { id: 'pancake', n: 'Pancake', d: 'Late digs still go up', v: 0.3 }],
    block: [{ id: 'longArms', n: 'Long Arms', d: 'Bigger block time window', v: 1.3 }, { id: 'wall', n: 'Wall', d: 'Blocked balls are recycled less', v: 0.6 }],
    serve: [{ id: 'jumpServe', n: 'Jump Serve', d: 'Jump serve: faster, more aces', v: 1.25 }, { id: 'pinpoint', n: 'Pinpoint', d: 'Wider serve timing window', v: 1.2 }]
  }
};

/* ---------------- curves ---------------- */
const skX = s => Math.min(1, Math.max(0, (s - SKILLS.min) / (SKILLS.max - SKILLS.min)));
const skMix = (a, s) => a[0] + (a[1] - a[0]) * skX(s);
// piecewise linear through [[x, y], ...]
function curve(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x0, y0] = pts[i - 1];
    if (x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  return pts[pts.length - 1][1];
}
const recycleChance = blockSkill => curve(SKILLS.recycle, blockSkill);
// shot quality 0..1 from timing error 0..1 and skill
function timingQ(skill, err) {
  const e = Math.min(1, Math.max(0, err));
  return Math.max(skMix(SKILLS.timing.floor, skill), 1 - e * skMix(SKILLS.timing.pen, skill));
}
function netFault(err) {
  const n = SKILLS.net;
  return err <= n.okay ? 0 : n.max * Math.min(1, (err - n.okay) / (1 - n.okay));
}

/* ---------------- costs ---------------- */
function levelCost(L) {
  if (L < SKILLS.min || L >= SKILLS.max) return 0;
  const c = SKILLS.cost, x = (L - SKILLS.min) / (SKILLS.max - 1 - SKILLS.min);
  return Math.max(1, Math.round(c.base + c.grow * Math.pow(x, c.pow)));
}
function costTo(from, to) { let s = 0; for (let L = from; L < to; L++) s += levelCost(L); return s; }
const totalCost = () => costTo(SKILLS.min, SKILLS.max) * SKILLS.ids.length;

/* ---------------- profile ---------------- */
function skillsNew(lv) {
  const sk = {};
  for (const id of SKILLS.ids) sk[id] = lv == null ? SKILLS.min : lv;
  return { v: 1, sk, badge: {} };
}
function ovr(p) {
  let s = 0, w = 0;
  for (const id of SKILLS.ids) { s += p.sk[id] * SKILLS.weight[id]; w += SKILLS.weight[id]; }
  return Math.round(s / w);
}
function unlocked(p, feature) { const u = SKILLS.unlock[feature]; return !!u && p.sk[u[0]] >= u[1]; }
const hasBadge = (p, id) => p.sk[id] >= SKILLS.badgeAt;
// active perk object of a skill (chosen one, else none)
function perk(p, id) { return hasBadge(p, id) && SKILLS.perks[id].find(k => k.id === p.badge[id]) || null; }
function hasPerk(p, perkId) { return SKILLS.ids.some(id => { const k = perk(p, id); return !!k && k.id === perkId; }); }
function pickPerk(p, id, perkId) {
  if (!hasBadge(p, id) || !SKILLS.perks[id].some(k => k.id === perkId)) return false;
  p.badge[id] = perkId; return true;
}
// raise one level if affordable: returns the coins spent (0 = not possible). No respec.
function trySkillUp(p, id, have) {
  const c = levelCost(p.sk[id]);
  if (!c || have < c) return 0;
  p.sk[id]++; return c;
}
function skillsLoad(st) {
  const p = skillsNew(), raw = st.get('skills', null);
  if (raw && raw.sk) for (const id of SKILLS.ids) {
    const v = Math.round(+raw.sk[id]);
    if (v >= SKILLS.min) p.sk[id] = Math.min(SKILLS.max, v);
  }
  if (raw && raw.badge) for (const id of SKILLS.ids) if (raw.badge[id]) pickPerk(p, id, raw.badge[id]);
  return p;
}
// tmp profiles (?ovr= debug) are never saved
function skillsSave(p, st) { if (!p.tmp) st.set('skills', { v: 1, sk: p.sk, badge: p.badge }); }

/* ---------------- browser: own profile, ?ovr=NN debug override ---------------- */
let PROFILE = null;
if (typeof store !== 'undefined') {
  PROFILE = skillsLoad(store);
  const m = typeof location !== 'undefined' && location.search.match(/[?&]ovr=(\d+)/);
  if (m) { PROFILE = skillsNew(Math.min(SKILLS.max, Math.max(SKILLS.min, +m[1]))); PROFILE.tmp = true; }
}
// spend shop coins on one level of a skill (UI glue for P2)
function skillUp(id) {
  const c = trySkillUp(PROFILE, id, coins);
  if (c) { addCoins(-c); skillsSave(PROFILE, store); }
  return c;
}

if (typeof module !== 'undefined') module.exports = { SKILLS, curve, recycleChance, timingQ, netFault, levelCost, costTo, totalCost, skillsNew, ovr, unlocked, hasBadge, perk, hasPerk, pickPerk, trySkillUp, skillsLoad, skillsSave };
