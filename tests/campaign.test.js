// P7 campaign (js/campaign.js): rising OVR ladder of shop skins, unlock after a win, full bonus only once, opponent profile
// OVR = stage OVR with the focus skill on top, AI level/pressure rise with the OVR, save/load roundtrip.
// Usage: node tests/campaign.test.js   (exit 1 on any failure)
'use strict';
const S = require('../js/skills.js');
const C = require('../js/campaign.js');
const fs = require('fs'), path = require('path');
const { SKILLS, ovr, hasBadge, perk } = S;
let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } };
const st = C.caStages();

// stages: chapters = shop skins (ids from js/shop.js), each once, `per` stages with the boss last, OVR 60 -> 99 strictly rising
const K = SKILLS.camp;
const shop = fs.readFileSync(path.join(__dirname, '../js/shop.js'), 'utf8');
const skinIds = [...shop.matchAll(/\{ id: '(\w+)', n: '/g)].map(m => m[1]);
ok(K.chapters.every(c => skinIds.includes(c.skin)) && new Set(K.chapters.map(c => c.skin)).size === K.chapters.length, 'every chapter is a shop skin, once');
ok(st.length === K.chapters.length * K.per && st.length >= 30, st.length + ' stages');
ok(st.every((s, i) => s.ch === Math.floor(i / K.per) && s.boss === (i % K.per === K.per - 1) && s.skin === K.chapters[s.ch].skin), 'chapter layout, boss last');
ok(st[0].ovr === SKILLS.min && st[st.length - 1].ovr === SKILLS.max, 'OVR ladder runs 60 -> 99');
ok(st.every((s, i) => !i || s.ovr > st[i - 1].ovr), 'OVR strictly rising');
ok(st.every(s => s.focus == null || SKILLS.ids.includes(s.focus)), 'focus skills are known skill ids');
ok(st.every((s, i) => s.c >= 1 && (!i || s.c >= st[i - 1].c || st[i - 1].boss)), 'first-win bonus >= 1, not falling inside a chapter');
ok(st.every(s => !s.boss || s.c > st[s.ch * K.per].c), 'boss pays more than the chapter stages');
ok(K.repeat >= 0 && K.repeat < 1, 'repeat share below 1');
ok(st.every(s => s.goals.length === 2 && s.goals[0].k !== s.goals[1].k && s.goals.every(g => g.v >= 0 && !/N/.test(g.t))), 'two different goals per stage with values');
ok(new Set(st.flatMap(s => s.goals.map(g => g.k))).size === K.goals.length, 'every goal kind is used');
const hv = st.filter(s => s.goals.some(g => g.k === 'held')).map(s => s.goals.find(g => g.k === 'held').v);
ok(hv.every(v => v >= 5 && v <= 13), 'held goals reachable in a 15-point match: ' + hv.join(' '));
console.log('goals:', st.slice(0, 6).map(s => s.goals.map(g => g.t).join(' / ')).join(' | '));

// goal check: stats keys, held, margin
const gi = st.findIndex(s => s.goals.some(g => g.k === 'held')), gh = st[gi].goals.findIndex(g => g.k === 'held');
ok(C.caGoals(gi, [15, st[gi].goals[gh].v], {}) >> gh & 1 && !(C.caGoals(gi, [15, st[gi].goals[gh].v + 1], {}) >> gh & 1), 'held goal: opponent points <= v');
const mi = st.findIndex(s => s.goals.some(g => g.k === 'margin')), mh = st[mi].goals.findIndex(g => g.k === 'margin'), mv = st[mi].goals[mh].v;
ok(C.caGoals(mi, [15, 15 - mv], {}) >> mh & 1 && !(C.caGoals(mi, [16, 17 - mv], {}) >> mh & 1), 'margin goal: win by >= v');
const g0 = st[0].goals[0]; ok(C.caGoals(0, [15, 13], { [g0.k]: 99 }) & 1 || g0.k === 'held' || g0.k === 'margin', 'stat goal reached by G.stats');

// unlocks: only stage 1 open at start; a win opens the next; locked stages cannot be won
const c = C.caNew();
ok(C.caStatus(c, 0) === 'open' && st.slice(1).every((_, i) => C.caStatus(c, i + 1) === 'locked'), 'start: stage 1 open, rest locked');
ok(C.caStatus(c, -1) === 'locked' && C.caStatus(c, st.length) === 'locked', 'out of range = locked');
ok(C.caNext(c) === 0, 'suggested stage at start = 1');
ok(C.caWin(c, 2).n === 0 && c.w[2] === 0, 'winning a locked stage does nothing');
const r1 = C.caWin(c, 0, 1);
ok(r1.n === st[0].c + K.star && r1.first && r1.stars === 1 && C.caStars(c, 0) === 2, 'first win pays bonus + goal star (' + r1.n + ')');
ok(C.caStatus(c, 0) === 'beaten' && C.caStatus(c, 1) === 'open' && C.caStatus(c, 2) === 'locked', 'after the win: stage 1 beaten, stage 2 open, stage 3 locked');
ok(C.caNext(c) === 1, 'suggested stage moves on to 2');
const r2 = C.caWin(c, 0, 3);
ok(r2.n === Math.round(st[0].c * K.repeat) + K.star && r2.stars === 2 && C.caStars(c, 0) === 3, 'replay: only the new star pays');
let total = 0; for (let k = 0; k < 5; k++) total += C.caWin(c, 0, 3).n;
ok(total === 5 * Math.round(st[0].c * K.repeat) && c.w[0] === 7, 'repeat wins pay the reduced bonus, stars only once (' + total + ' for 5)');
for (let i = 0; i < st.length; i++) ok(Math.round(st[i].c * K.repeat) < st[i].c, 'stage ' + (i + 1) + ': repeat bonus below the first-win bonus');
// play the whole ladder with all goals: bosses hand out their skins
const d = C.caNew(); let sum = 0; const skins = [];
for (let i = 0; i < st.length; i++) { ok(C.caStatus(d, i) === 'open', 'stage ' + (i + 1) + ' open in order'); const r = C.caWin(d, i, 3); sum += r.n; if (r.skin) skins.push(r.skin); }
ok(sum === st.reduce((a, s) => a + s.c + 2 * K.star, 0) && st.every((_, i) => C.caStatus(d, i) === 'beaten' && C.caStars(d, i) === 3), 'whole ladder: all beaten, 3 stars, coins ' + sum);
ok(skins.join() === K.chapters.map(x => x.skin).join(), 'every boss gives its skin once');
ok(C.caNext(d) === st.length - 1, 'all beaten: suggested = last stage');

// opponent profile: OVR = target for every OVR 60..99 and focus, focus skill on top, all skills 60..99, badges with a perk
let pOk = true, fOk = true;
for (let o = SKILLS.min; o <= SKILLS.max; o++) for (const f of [undefined, ...SKILLS.ids]) {
  const p = C.caProfile(o, f);
  if (ovr(p) !== o || !p.tmp || !SKILLS.ids.every(id => p.sk[id] >= SKILLS.min && p.sk[id] <= SKILLS.max)) pOk = false;
  if (!SKILLS.ids.every(id => !hasBadge(p, id) || perk(p, id))) pOk = false;
  if (f && SKILLS.ids.some(id => p.sk[id] > p.sk[f])) fOk = false;
  if (f && o > 66 && o < 90 && p.sk[f] - Math.min(...SKILLS.ids.map(id => p.sk[id])) < SKILLS.camp.lead - 1) fOk = false;
}
ok(pOk, 'caProfile: OVR = target (60..99, every focus), skills in range, badges have a perk');
ok(fOk, 'caProfile: focus skill is the highest, about lead (' + SKILLS.camp.lead + ') above the lowest in the middle range');
ok(SKILLS.ids.every(id => C.caProfile(60).sk[id] === 60) && SKILLS.ids.every(id => C.caProfile(99, 'block').sk[id] === 99), 'OVR 60 = all 60, OVR 99 = all 99');
const p72 = C.caProfile(72, 'block'); console.log('stage profile OVR 72, focus block:', JSON.stringify(p72.sk));
ok(st.every(s => ovr(C.caProfile(s.pOvr, s.focus)) === s.pOvr && s.pOvr === Math.min(99, s.ovr + (s.boss ? K.bossOvr : 0))), 'every stage profile has its stage OVR (bosses + bossOvr)');
// AI level and pressure rise with the OVR
const df = st.map(s => C.caDiff(s.ovr));
ok(df.every((x, i) => !i || (x.lv >= df[i - 1].lv && x.d > df[i - 1].d)), 'AI level and D() base never fall along the ladder');
ok(Math.abs(C.caDiff(80, true).d - C.caDiff(80).d - K.bossD) < 1e-9, 'bosses press bossD harder');
ok(df[0].lv === 0 && df[df.length - 1].lv === 2 && df[0].d === SKILLS.camp.d[0] && Math.abs(df[df.length - 1].d - SKILLS.camp.d[1]) < 1e-9, 'first stage easy, last hard, D base from SKILLS.camp.d');

// save / load roundtrip through a fake store; bad data is cleaned; saves older than camp.v are reset
const mem = {}, store = { get: (k, dv) => k in mem ? JSON.parse(mem[k]) : dv, set: (k, v) => { mem[k] = JSON.stringify(v); } };
const e = C.caNew(); C.caWin(e, 0, 2); C.caWin(e, 1); C.caWin(e, 1); C.caSave(e, store);
const e2 = C.caLoad(store);
ok(JSON.stringify(e2.w) === JSON.stringify(e.w) && JSON.stringify(e2.s) === JSON.stringify(e.s) && C.caStatus(e2, 2) === 'open' && C.caStatus(e2, 3) === 'locked', 'save/load roundtrip keeps wins, stars and unlocks');
ok(JSON.stringify(C.caLoad({ get: () => null }).w) === JSON.stringify(C.caNew().w), 'nothing saved = fresh campaign');
mem.camp = JSON.stringify({ v: K.v, w: ['x', -3, 2.7, null], s: [7, 'y', 2] });
const e3 = C.caLoad(store);
ok(e3.w.length === st.length && e3.w[0] === 0 && e3.w[1] === 0 && e3.w[2] === 2 && e3.w[3] === 0 && e3.s.join().startsWith('3,0,2,0'), 'bad saved data cleaned (' + e3.w.slice(0, 4).join(',') + ')');
for (const old of [{ v: 1, w: [3, 1, 0] }, { v: 2, w: new Array(st.length).fill(1), s: new Array(st.length).fill(3) }, { w: [1, 1] }]) {
  mem.camp = JSON.stringify(old);
  const e4 = C.caLoad(store);
  ok(e4.w.every(x => x === 0) && e4.s.every(x => !x) && C.caNext(e4) === 0, 'old save v' + old.v + ' -> campaign reset to stage 1');
}

console.log((fails ? 'FAIL' : 'OK') + ': ' + (n - fails) + '/' + n + ' campaign checks');
process.exit(fails ? 1 : 0);
