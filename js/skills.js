'use strict';
// skills: SKILLS table (curves, costs, thresholds, badge perks), OVR, profile load/save, ?ovr= debug.
// Data + pure decision helpers (the engine only calls them). Runs in the browser (classic script, globals)
// and in Node (module.exports) so tests/ can load it directly. ?seed=N: deterministic RNG for skill rolls.
/* ---------------- skill table: every skill number lives here ---------------- */
const SKILLS = {
  ids: ['spike', 'lob', 'recv', 'dig', 'block', 'serve'],
  names: { spike: 'Spike', lob: 'Lob', recv: 'Receive', dig: 'Dig', block: 'Block', serve: 'Serve' },
  min: 60, max: 99,
  // OVR = weighted mean of all skills
  weight: { spike: 1, lob: 1, recv: 1, dig: 1, block: 1, serve: 1 },
  // coins to raise a skill from L to L+1, fixed per tier of `step` levels: 60-69 = 1, 70-79 = 2, 80-89 = 3, 90-98 = 4
  // (one skill 60 -> 99 = 96, all six = 576). Costs are fixed; tests/sim-progress.js checks the income against plan.days
  cost: { step: 10, tier: [1, 2, 3, 4] },
  // coins per won match (daily.js earnWin): win x strength of the opponent. Normal singleplayer: lv[G.level] (Easy / Normal /
  // Hard); explicit opponent profile (campaign, Skill Games): ovr[0] at OVR 60 -> ovr[1] at 99, plus under per OVR point the
  // opponent is above you (max underMax). First win of the day x dailyMul. Multiplayer: x1. loss = coins for a lost match
  // if you scored at least lossMin points (no coins for giving up a match; x Skill Games coinMul, no daily bonus)
  earn: { win: 10, loss: 3, lossMin: 5, dailyMul: 2, lv: [0.6, 1, 1.6], ovr: [0.6, 1.8], under: 0.03, underMax: 0.5 },
  // daily challenges (daily.js): n picked per day from pool (seeded by the date), progress over all singleplayer matches of
  // the day (campaign + Skill Games count, multiplayer not). k = match stat (G.stats), sum over matches or max (best single
  // match); g = goal; c = coins once the goal is reached. Expected ~20 coins/day are in plan.chal (tests/sim-progress.js)
  daily: {
    n: 3,
    pool: [
      { id: 'bout', k: 'bout', g: 5, c: 12, t: 'Spike off the block' },
      { id: 'lobs', k: 'lobs', g: 4, c: 10, t: 'Score lob points' },
      { id: 'aces', k: 'aces', g: 3, c: 10, t: 'Serve aces' },
      { id: 'perf', k: 'perfect', g: 15, c: 8, t: 'Perfect timings' },
      { id: 'save', k: 'saves', g: 6, c: 10, t: 'Diving saves' },
      { id: 'fire', k: 'fires', g: 2, c: 12, t: 'Fire fireballs' },
      { id: 'rally', k: 'maxRally', g: 12, c: 10, t: 'Rally length (one rally)', max: true },
      { id: 'kills', k: 'kills', g: 25, c: 8, t: 'Attack points' },
      { id: 'digs', k: 'digs', g: 40, c: 8, t: 'Digs' },
      { id: 'wins', k: 'wins', g: 3, c: 15, t: 'Win matches' },
      { id: 'hard', k: 'hard', g: 1, c: 20, t: 'Win on Hard' }
    ],
    hardOvr: 86 // campaign / Skill Games: a win vs. this OVR or more counts as Hard
  },
  // progression target: normal play (chal = expected daily challenge coins per day); campaign (P7): stage cleared once OVR >= stage OVR - campEdge, still >= campMin days
  plan: { matchesPerDay: 20, winRate: 0.5, days: 3.5, campEdge: 4, campMin: 2.5, chal: 20 },
  // timing: x = skill progress 0..1, err = timing error 0 (perfect) .. 1 (very bad)
  // quality = max(floor, 1 - err * pen): low skill punishes bad timing hard, high skill keeps a decent result
  // P8 (tests/balance.js): 99 a bit stricter than P3 (0.55 / 0.4): very bad timing at 99 = weak, ~14 % net faults (60: 30 %)
  // tiers: raw err < perfect = perfect (pure timing); else effective err (1 - quality) < net.okay = good, else weak
  timing: { pen: [1, 0.65], floor: [0, 0.3], perfect: 0.15 },
  // net fault: 0 at timing "okay" or better (err <= okay), max at very bad (err >= 1), linear between
  net: { okay: 0.35, max: 0.3 },
  // P3 singleplayer effects. dig: scatter of our digs by Receive/Dig skill (60 -> 99)
  dig: { wild: [1, 0.5] },
  // Dive (Dig 70): automatic diving save for balls up to reach (m) beside you; save chance base .. 1 by Dig skill
  dive: { reach: 1.5, base: 0.5 },
  // our net blocker vs. their spike: stuff chance by your Block skill (60 -> 99), x split once Split block is unlocked
  mateBlock: { stuff: [0.03, 0.09], split: 1.5 },
  // opponent skills = base + rise * D() (D = level + score pressure, 0..1); 66..77 keeps the old block/recycle feel
  // campaign / Skill Games opponents (explicit profile): spike / serve error chance (net + long) by its Spike / Serve skill;
  // normal SP keeps the old G.level table (ai.js). Falls from above the old level-0 rate (60: easy first stage) to below level 2 (99)
  ai: { base: 66, rise: 11, err: { spike: [[60, 0.11], [72, 0.075], [86, 0.05], [99, 0.03]], serve: [[60, 0.12], [72, 0.085], [86, 0.055], [99, 0.035]] } },
  // block recycle: chance the attacking team still saves a blocked ball, by the blocker's Block skill
  recycle: [[60, 0.7], [70, 0.45], [80, 0.25], [90, 0.1], [99, 0.03]],
  // MP block jump tier -> [tool x, touch x, + stuff chance] on a blocked spike (mp.js mpAttack / mpStuff); good = the recycle curve
  // as is; P8: a perfect jump stuffs more (+0.4, was +0.15) so a Block 60 player gets ~ the pre-P5 block points (tests/balance.js)
  blockQ: { perfect: [0.3, 0.5, 0.4], good: [1, 1, 0], weak: [1.6, 1.5, -0.15] },
  // threshold unlocks: feature -> [skill, level]
  unlock: { lobAim: ['lob', 75], splitBlock: ['block', 75], float: ['serve', 75], dive: ['dig', 70], fireball: ['spike', 85] },
  unlockNames: { lobAim: 'Lob aim', splitBlock: 'Split block', float: 'Float serve', dive: 'Dive', fireball: 'Fireball' },
  // local leaderboard (profile.js): stored entries, player name length
  board: { max: 50, nameMax: 12 },
  // P5 MP social (social.js): emotes = pixel-text quick messages, dur = s shown over the player; rate limit per player
  // (own phone and host): gap = min s between two emotes, at most burst emotes per win s
  social: { emotes: ['NICE!', 'GG', 'OOPS', 'HAHA', 'WOW', 'SORRY'], dur: 2.2, gap: 1.0, burst: 3, win: 8 },
  // P4 Hybrid multiplayer (js/hybrid.js, mp.js): setTilt = set swipe |dx|/|dy| split (straight up = dump, diagonal up-left = middle);
  // laneLock = s before the hit the hitter's approach lane is checked against the set lane; computer mates by difficulty (0 -> 1):
  // botFollow = hitter runs into the set lane, botSetOk = setter sets the hitter's lane (else a neighbour lane), botReact = s;
  // lobFar = less dig chance for an aimed lob two lanes away; dankeT = flight of a free ball (s); setSpd = run speed of a back setter
  hy: { setTilt: 0.4, laneLock: 0.45, botFollow: [0.86, 0.97], botSetOk: [0.88, 0.97], botReact: [0.1, 0.24], lobFar: 0.2, dankeT: 1.3, setSpd: 9, defLv: 60 },
  // P6 Skill Games (js/skillgames.js): budget = round(share x coins for all skills 60 -> 99); aiMix = share of random picks in
  // the computer's auto spread (rest raises the lowest skill); MP: wait = s to spend, the phone auto-spends the rest grace s
  // before the end, the host waits grace s longer, then auto-spends for anyone missing; coinMul = coin reward x (1 = as normal)
  // presets (buttons on the spend screen, sgPreset): reset to 60, raise each [skill, target] in order, spread the rest evenly
  // (lowest first); perk = badge picked for a skill that reaches 90. At budget 173: Attacker spike 99 / serve 80 / lob 75 / rest 69,
  // Blocker block 99 / dig 80 / recv 75 / rest 69, Defender dig + recv 90 / rest ~71, All-round all ~79
  sg: { share: 0.3, aiMix: 0.35, wait: 45, grace: 1.5, coinMul: 1,
    presets: [
      { id: 'att', n: 'Attacker', t: [['spike', 99], ['serve', 80], ['lob', 75]], perk: { spike: 'hotHand' } },
      { id: 'blk', n: 'Blocker', t: [['block', 99], ['dig', 80], ['recv', 75]], perk: { block: 'longArms' } },
      { id: 'def', n: 'Defender', t: [['dig', 90], ['recv', 90]], perk: { dig: 'catReflex', recv: 'platform' } },
      { id: 'all', n: 'All-round', t: [] }
    ] },
  // P7 campaign (js/campaign.js): stages = shop skins (SKINS ids) with rising OVR; focus = skill kept `lead` levels above the rest;
  // c = bonus coins on the first win (on top of the normal match coins), later wins pay round(c x repeat). Opponent AI: level
  // (G.level arrays) 0 below lv[0] OVR, 1 below lv[1], else 2; D() base 60 -> 99 = d. Bonus pool ~6% of totalCost(): with it
  // tests/sim-progress.js (stage cleared once OVR >= ovr - plan.campEdge, worst-case replays) stays >= plan.campMin days
  camp: {
    stages: [
      { skin: 'knochen', ovr: 60, c: 1 }, { skin: 'neon', ovr: 64, focus: 'recv', c: 1 }, { skin: 'nacht', ovr: 68, focus: 'dig', c: 2 },
      { skin: 'eis', ovr: 72, focus: 'block', c: 2 }, { skin: 'lava', ovr: 76, focus: 'spike', c: 3 }, { skin: 'pirat', ovr: 80, focus: 'lob', c: 3 },
      { skin: 'teufel', ovr: 85, focus: 'serve', c: 4 }, { skin: 'kuerbis', ovr: 90, focus: 'dig', c: 4 }, { skin: 'geist', ovr: 95, focus: 'lob', c: 5 },
      { skin: 'koenig', ovr: 99, c: 7 }
    ],
    lead: 12, repeat: 0.1, lv: [72, 86], d: [0.1, 0.55]
  },
  // skill badge at 90: pick one perk in the same area; v = effect value for the engine:
  // hotHand: fireball bar length x v; heavyArm: + v spike quality; feather: lob dig chance x (1 - v); sneaky: lobs feed
  // the AI read x (1 - v); platform: receive timing err x (1 - v); calm: failed late receives x v; catReflex: dive reach x v;
  // pancake: + v late-dig quality; longArms: stuff chance x v; wall: recycle against you x v; jumpServe: ace x v, flight / v;
  // pinpoint: serve timing windows x v
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
  const t = SKILLS.cost.tier;
  return t[Math.min(t.length - 1, Math.floor((L - SKILLS.min) / SKILLS.cost.step))];
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

/* ---------------- P3 decisions: pure, rng passed in (engine: RNG) ---------------- */
// mulberry32: small seeded RNG (?seed=N)
function mulberry32(a) {
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const clip01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const perkV = (p, id, perkId, d) => { const k = perk(p, id); return k && k.id === perkId ? k.v : d; };
// raw timing error 0..1 from |dt| and windows w = [perfect, good, max] (s); at skill 60 the tiers equal the old windows
function timingErr(adt, w) {
  const P = SKILLS.timing.perfect, O = SKILLS.net.okay;
  if (adt < w[0]) return P * adt / w[0];
  if (adt < w[1]) return P + (O - P) * (adt - w[0]) / (w[1] - w[0]);
  return O + (1 - O) * Math.min(1, (adt - w[1]) / Math.max(1e-6, w[2] - w[1]));
}
// effective error after skill (+ perk bonus on quality)
const effErr = (skill, err, bonus = 0) => clip01(1 - timingQ(skill, err) - bonus);
function hitTier(skill, err, bonus = 0) {
  if (err < SKILLS.timing.perfect) return 'perfect';
  return effErr(skill, err, bonus) < SKILLS.net.okay ? 'good' : 'weak';
}
// fault after our hit: 'net' (net fault curve on the effective error), 'out' (chance outP) or ''
function hitFault(skill, err, bonus, outP, rng) {
  if (rng() < netFault(effErr(skill, err, bonus))) return 'net';
  return rng() < outP ? 'out' : '';
}
// an attack at the net block: 'graze' (touches the block, BAL.blockGraze), 'stuff' or ''
function blockRoll(graze, stuff, rng) { const r = rng(); return r < graze ? 'graze' : r < graze + stuff ? 'stuff' : ''; }
// our net blocker: stuff chance by profile p (Block skill, split block, Long Arms)
function stuffChance(p) {
  const m = SKILLS.mateBlock;
  return skMix(m.stuff, p.sk.block) * (unlocked(p, 'splitBlock') ? m.split : 1) * perkV(p, 'block', 'longArms', 1);
}
// chance the attacking team still saves a ball stuffed by blocker profile p (Wall perk)
const recycleP = p => recycleChance(p.sk.block) * perkV(p, 'block', 'wall', 1);
// defense: serves and free balls are receives (Receive), the rest digs (Dig)
const defSkill = type => type === 'serve' || type === 'free' ? 'recv' : 'dig';
// late arrival (very bad timing): save chance from the old base; skill 60 = base, higher skill saves more
function lateSaveP(p, type, base) {
  const id = defSkill(type);
  const err = 1 - perkV(p, id, 'platform', 0);
  let s = base + (1 - base) * clip01(timingQ(p.sk[id], err) + perkV(p, id, 'pancake', 0));
  if (type === 'serve') s = 1 - (1 - s) * perkV(p, id, 'calm', 1);
  return s;
}
const digWild = (p, type) => skMix(SKILLS.dig.wild, p.sk[defSkill(type)]);
// Dive (Dig 70): reach beside you (0 = locked) and save chance
const diveReach = p => unlocked(p, 'dive') ? SKILLS.dive.reach * perkV(p, 'dig', 'catReflex', 1) : 0;
const diveSave = p => SKILLS.dive.base + (1 - SKILLS.dive.base) * timingQ(p.sk.dig, 1);
// fireball bar length (Hot Hand shortens it)
const fireMax = (p, max) => Math.max(1, Math.round(max * perkV(p, 'spike', 'hotHand', 1)));
// opponent profile from difficulty d 0..1 (never saved)
function aiProfile(d) {
  const a = SKILLS.ai, p = skillsNew(Math.round(Math.min(SKILLS.max, Math.max(SKILLS.min, a.base + a.rise * d))));
  p.tmp = true; return p;
}

// campaign / Skill Games opponent fault chance (kind 'spike' | 'serve') from its profile
const aiErr = (p, kind) => curve(SKILLS.ai.err[kind], p.sk[kind]);

/* ---------------- browser: own profile, ?ovr=NN debug override ---------------- */
let PROFILE = null;
if (typeof store !== 'undefined') {
  PROFILE = skillsLoad(store);
  const m = typeof location !== 'undefined' && location.search.match(/[?&]ovr=(\d+)/);
  if (m) { PROFILE = skillsNew(Math.min(SKILLS.max, Math.max(SKILLS.min, +m[1]))); PROFILE.tmp = true; }
}
// skill rolls: ?seed=N = deterministic (mulberry32), else Math.random
let RNG = Math.random;
if (typeof location !== 'undefined') { const sd = location.search.match(/[?&]seed=(\d+)/); if (sd) RNG = mulberry32(+sd[1]); }
// spend shop coins on one level of a skill (UI glue for P2)
function skillUp(id) {
  const c = trySkillUp(PROFILE, id, coins);
  if (c) { addCoins(-c); skillsSave(PROFILE, store); }
  return c;
}

if (typeof module !== 'undefined') module.exports = { SKILLS, curve, recycleChance, timingQ, netFault, levelCost, costTo, totalCost, skillsNew, ovr, unlocked, hasBadge, perk, hasPerk, pickPerk, trySkillUp, skillsLoad, skillsSave,
  mulberry32, timingErr, effErr, hitTier, hitFault, blockRoll, stuffChance, recycleP, defSkill, lateSaveP, digWild, diveReach, diveSave, fireMax, aiProfile, aiErr };
