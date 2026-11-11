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

// stages: the shop skins (ids from js/shop.js), each once, OVR rising from 60 to 99, valid focus skills and rewards
const shop = fs.readFileSync(path.join(__dirname, '../js/shop.js'), 'utf8');
const skinIds = [...shop.matchAll(/\{ id: '(\w+)', n: '/g)].map(m => m[1]);
ok(st.length >= 5 && st.every(s => skinIds.includes(s.skin)), 'every stage is a shop skin (' + st.map(s => s.skin).join(',') + ')');
ok(new Set(st.map(s => s.skin)).size === st.length, 'each skin appears once');
ok(st[0].ovr === SKILLS.min && st[st.length - 1].ovr === SKILLS.max, 'OVR ladder runs 60 -> 99');
ok(st.every((s, i) => !i || s.ovr > st[i - 1].ovr), 'OVR strictly rising: ' + st.map(s => s.ovr).join(' '));
ok(st.every(s => s.focus == null || SKILLS.ids.includes(s.focus)), 'focus skills are known skill ids');
ok(st.every((s, i) => s.c >= 1 && (!i || s.c >= st[i - 1].c)), 'first-win bonus >= 1 and not falling: ' + st.map(s => s.c).join(' '));
ok(SKILLS.camp.repeat >= 0 && SKILLS.camp.repeat < 1, 'repeat share below 1');

// unlocks: only stage 1 open at start; a win opens the next; locked stages cannot be won
const c = C.caNew();
ok(C.caStatus(c, 0) === 'open' && st.slice(1).every((_, i) => C.caStatus(c, i + 1) === 'locked'), 'start: stage 1 open, rest locked');
ok(C.caStatus(c, -1) === 'locked' && C.caStatus(c, st.length) === 'locked', 'out of range = locked');
ok(C.caNext(c) === 0, 'suggested stage at start = 1');
ok(C.caWin(c, 2) === 0 && c.w[2] === 0, 'winning a locked stage does nothing');
const r1 = C.caWin(c, 0);
ok(r1 === st[0].c, 'first win pays the full bonus (' + r1 + ')');
ok(C.caStatus(c, 0) === 'beaten' && C.caStatus(c, 1) === 'open' && C.caStatus(c, 2) === 'locked', 'after the win: stage 1 beaten, stage 2 open, stage 3 locked');
ok(C.caNext(c) === 1, 'suggested stage moves on to 2');
// full bonus only once: repeats pay round(c x repeat) < c
let total = 0; for (let k = 0; k < 5; k++) total += C.caWin(c, 0);
ok(total === 5 * Math.round(st[0].c * SKILLS.camp.repeat) && c.w[0] === 6, 'repeat wins pay the reduced bonus (' + total + ' for 5)');
for (let i = 0; i < st.length; i++) ok(Math.round(st[i].c * SKILLS.camp.repeat) < st[i].c, 'stage ' + (i + 1) + ': repeat bonus below the first-win bonus');
// play the whole ladder: each first win pays c once, the last one leaves caNext on the last stage
const d = C.caNew(); let sum = 0;
for (let i = 0; i < st.length; i++) { ok(C.caStatus(d, i) === 'open', 'stage ' + (i + 1) + ' open in order'); sum += C.caWin(d, i); }
ok(sum === st.reduce((a, s) => a + s.c, 0) && st.every((_, i) => C.caStatus(d, i) === 'beaten'), 'whole ladder: all beaten, bonus total ' + sum);
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
ok(st.every(s => ovr(C.caProfile(s.ovr, s.focus)) === s.ovr), 'every stage profile has its stage OVR');
// AI level and pressure rise with the OVR
const df = st.map(s => C.caDiff(s.ovr));
ok(df.every((x, i) => !i || (x.lv >= df[i - 1].lv && x.d > df[i - 1].d)), 'AI level and D() base never fall along the ladder');
ok(df[0].lv === 0 && df[df.length - 1].lv === 2 && df[0].d === SKILLS.camp.d[0] && Math.abs(df[df.length - 1].d - SKILLS.camp.d[1]) < 1e-9, 'first stage easy, last hard, D base from SKILLS.camp.d');

// save / load roundtrip through a fake store; bad data is cleaned
const mem = {}, store = { get: (k, dv) => k in mem ? JSON.parse(mem[k]) : dv, set: (k, v) => { mem[k] = JSON.stringify(v); } };
const e = C.caNew(); C.caWin(e, 0); C.caWin(e, 1); C.caWin(e, 1); C.caSave(e, store);
const e2 = C.caLoad(store);
ok(JSON.stringify(e2.w) === JSON.stringify(e.w) && C.caStatus(e2, 2) === 'open' && C.caStatus(e2, 3) === 'locked', 'save/load roundtrip keeps wins and unlocks');
ok(JSON.stringify(C.caLoad({ get: () => null }).w) === JSON.stringify(C.caNew().w), 'nothing saved = fresh campaign');
mem.camp = JSON.stringify({ w: ['x', -3, 2.7, null] });
const e3 = C.caLoad(store);
ok(e3.w.length === st.length && e3.w[0] === 0 && e3.w[1] === 0 && e3.w[2] === 2 && e3.w[3] === 0, 'bad saved data cleaned (' + e3.w.join(',') + ')');

console.log((fails ? 'FAIL' : 'OK') + ': ' + (n - fails) + '/' + n + ' campaign checks');
process.exit(fails ? 1 : 0);
