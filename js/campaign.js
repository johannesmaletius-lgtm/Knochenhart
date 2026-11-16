'use strict';
// campaign (P7): singleplayer ladder of chapters (one per shop skin, SKILLS.camp), each with `per` stages, the last a boss.
// You play with your real profile (skills and coins as usual, it is never swapped). The first win of a stage pays a bonus and
// opens the next one; every stage has 2 goals (stars), a boss win gives its skin. The computer gets a profile of the stage
// OVR with the stage's focus skill on top, the AI level/pressure follow that OVR.
// Progress: store 'camp' ({ v: 2, w: wins per stage, s: star bits per stage }). Pure part also runs in Node (tests/campaign.test.js).
if (typeof SKILLS === 'undefined' && typeof require === 'function') Object.assign(globalThis, require('./skills.js'));
/* ---------------- pure ---------------- */
// stage list built from SKILLS.camp: { ch, j (stage in chapter), boss, skin, ovr, focus, c, goals: [{ k, v, t }] }
let CA_ST = null;
function caStages() {
  if (CA_ST) return CA_ST;
  const k = SKILLS.camp, n = k.chapters.length * k.per, GL = k.goals, out = [];
  for (let i = 0; i < n; i++) {
    const ch = Math.floor(i / k.per), j = i % k.per, boss = j === k.per - 1, C = k.chapters[ch];
    const c = Math.round((k.c[0] + k.c[1] * ch) * (boss ? k.boss : 1));
    const goals = [GL[(2 * i) % GL.length], GL[(2 * i + 1) % GL.length]].map(g => {
      const v = Math.max(g.k === 'held' ? 0 : 1, Math.round(g.a + g.b * ch));
      return { k: g.k, v, t: g.t.replace('N', v) };
    });
    out.push({ ch, j, boss, skin: C.skin, ovr: Math.round(SKILLS.min + (SKILLS.max - SKILLS.min) * i / (n - 1)),
      focus: boss ? C.focus : i ? SKILLS.ids[i % SKILLS.ids.length] : undefined, c, goals });
  }
  return (CA_ST = out);
}
const caName = s => s.boss ? SKIN_N(s.skin) : SKIN_N(s.skin) + ' ' + SKILLS.camp.rank[s.j];
const SKIN_N = id => typeof SKIN !== 'undefined' && SKIN[id] ? SKIN[id].n : id;
function caNew() { const n = caStages().length; return { v: 2, w: new Array(n).fill(0), s: new Array(n).fill(0) }; }
// v1 saves (one stage per skin): a beaten old stage = that whole chapter beaten (win star only, goal stars still open)
function caLoad(st) {
  const c = caNew(), raw = st.get('camp', null), per = SKILLS.camp.per;
  if (!raw || !Array.isArray(raw.w)) return c;
  const num = x => Math.max(0, Math.floor(+x) || 0);
  if (raw.v >= 2) {
    c.w = c.w.map((_, i) => num(raw.w[i]));
    if (Array.isArray(raw.s)) c.s = c.s.map((_, i) => num(raw.s[i]) & 3);
  } else c.w = c.w.map((_, i) => num(raw.w[Math.floor(i / per)]) > 0 ? 1 : 0);
  return c;
}
function caSave(c, st) { st.set('camp', { v: 2, w: c.w.slice(), s: c.s.slice() }); }
// 'locked' | 'open' | 'beaten': stage 1 is always open, every other one after a win of the stage before
function caStatus(c, i) {
  if (!(i >= 0 && i < c.w.length)) return 'locked';
  return c.w[i] > 0 ? 'beaten' : i === 0 || c.w[i - 1] > 0 ? 'open' : 'locked';
}
// stars of stage i: 0..3 (win + 2 goals)
const caStars = (c, i) => (c.w[i] > 0 ? 1 : 0) + (c.s[i] & 1) + (c.s[i] >> 1 & 1);
// goals of stage i reached in a match (score [we, they], stats = G.stats): bit mask (bit 0 = goal 1, bit 1 = goal 2)
function caGoals(i, score, stats) {
  return caStages()[i].goals.reduce((m, g, b) => {
    const okG = g.k === 'held' ? score[1] <= g.v : g.k === 'margin' ? score[0] - score[1] >= g.v : (stats[g.k] || 0) >= g.v;
    return okG ? m | 1 << b : m;
  }, 0);
}
// bonus coins for winning stage i now: full on the first win, round(c x repeat) later, 0 if locked
function caReward(c, i) {
  const s = caStatus(c, i), k = caStages()[i];
  return s === 'locked' ? 0 : s === 'beaten' ? Math.round(k.c * SKILLS.camp.repeat) : k.c;
}
// a win of stage i with goal mask m: { n: coins (bonus + new stars), stars: new goal bits, first, skin: boss skin to give }
function caWin(c, i, m = 0) {
  if (caStatus(c, i) === 'locked') return { n: 0, stars: 0, first: false, skin: null };
  const first = c.w[i] === 0, nw = m & ~c.s[i] & 3, k = caStages()[i];
  const n = caReward(c, i) + SKILLS.camp.star * ((nw & 1) + (nw >> 1 & 1));
  c.w[i]++; c.s[i] |= nw;
  return { n, stars: nw, first, skin: first && k.boss ? k.skin : null };
}
// stage to suggest: the first one not beaten yet, else the last
function caNext(c) { const i = c.w.findIndex(n => !(n > 0)); return i < 0 ? c.w.length - 1 : i; }
// computer profile with OVR = target: raise the lowest skill until the weighted mean reaches the target (so ovr() = target,
// 99 = all 99); the focus skill counts SKILLS.camp.lead lower (stays that far ahead); badges get their first perk. Never saved.
function caProfile(target, focus) {
  const p = skillsNew(), t = Math.min(SKILLS.max, Math.max(SKILLS.min, Math.round(target)));
  const lead = id => id === focus ? SKILLS.camp.lead : 0, W = SKILLS.weight;
  const mean = () => SKILLS.ids.reduce((a, id) => a + p.sk[id] * W[id], 0) / SKILLS.ids.reduce((a, id) => a + W[id], 0);
  while (mean() < t - 1e-9) {
    const can = SKILLS.ids.filter(id => p.sk[id] < SKILLS.max);
    if (!can.length) break;
    p.sk[can.reduce((a, b) => p.sk[b] - lead(b) < p.sk[a] - lead(a) ? b : a)]++;
  }
  for (const id of SKILLS.ids) if (hasBadge(p, id)) pickPerk(p, id, SKILLS.perks[id][0].id);
  p.tmp = true; return p;
}
// AI level (G.level arrays) and D() base for a stage OVR (bosses press bossD harder)
function caDiff(o, boss) {
  const k = SKILLS.camp, x = Math.min(1, Math.max(0, (o - SKILLS.min) / (SKILLS.max - SKILLS.min)));
  return { lv: o < k.lv[0] ? 0 : o < k.lv[1] ? 1 : 2, d: k.d[0] + (k.d[1] - k.d[0]) * x + (boss ? k.bossD : 0) };
}

if (typeof module !== 'undefined' && typeof document === 'undefined') module.exports = { caStages, caNew, caLoad, caSave, caStatus, caStars, caGoals, caReward, caWin, caNext, caProfile, caDiff };

/* ---------------- browser ---------------- */
// on = a campaign match runs (i = stage, opp = computer profile, d = D() base, lvReal = your difficulty, restored after);
// again = stage the Again/Next button starts (-1 = none); sel = picked row; prog = saved progress
const CA = { on: false, i: -1, opp: null, d: 0, lvReal: 1, again: -1, sel: 0, prog: null, drawn: false };
const caProg = () => CA.prog || (CA.prog = caLoad(store));
const CA_FOCUS = id => id ? SKILLS.names[id] : 'All-round';
function caShow() { audioInit(); CA.sel = caNext(caProg()); CA.drawn = false; showOnly('campOv'); caDraw(); }
const CA_STAR = n => '<span class="ca-stars">' + [0, 1, 2].map(k => '<i' + (k < n ? ' class="on"' : '') + '></i>').join('') + '</span>';
function caDraw() {
  const c = caProg(), list = $('#caList'), sc = list.scrollTop, all = caStages(), K = SKILLS.camp;
  const stars = all.reduce((a, _, i) => a + caStars(c, i), 0);
  $('#caOvr').textContent = 'OVR ' + ovr(PROFILE);
  $('#caSum').textContent = stars + '/' + all.length * 3;
  list.innerHTML = all.map((s, i) => {
    const k = SKIN[s.skin], st = caStatus(c, i), n = caReward(c, i);
    const head = s.j ? '' : '<p class="ca-ch">Chapter ' + (s.ch + 1) + ' · ' + k.n + (owned.has(k.id) ? '' : ' · boss gives skin') + '</p>';
    const em = st === 'locked' ? 'Locked' : (n ? '<span class="coin"></span>+' + n : '');
    return head + '<button class="ca-row ' + st + (s.boss ? ' boss' : '') + '" style="--rc:' + RARITY(k.p)[1] + '" data-i="' + i + '" aria-pressed="' + (i === CA.sel) + '"' + (st === 'locked' ? ' disabled' : '') + '>'
      + '<span class="ca-n">' + (s.ch + 1) + '-' + (s.j + 1) + '</span><img class="px" alt="" src="' + skinIcon(k) + '"><span class="ca-t"><b>' + caName(s) + (s.boss ? ' <u>Boss</u>' : '') + '</b><i>OVR ' + s.ovr + ' · ' + CA_FOCUS(s.focus) + '</i></span>'
      + '<em>' + CA_STAR(caStars(c, i)) + em + '</em></button>';
  }).join('');
  list.scrollTop = sc;
  if (!CA.drawn) { CA.drawn = true; const b = list.querySelector('[aria-pressed="true"]'); if (b) list.scrollTop = Math.max(0, b.offsetTop - list.clientHeight / 2); }
  const s = all[CA.sel], bits = c.s[CA.sel];
  $('#caGoals').innerHTML = '<b>' + caName(s) + '</b>' + s.goals.map((g, b) => '<span' + (bits >> b & 1 ? ' class="ok"' : '') + '>★ ' + g.t + (bits >> b & 1 ? '' : ' (+' + K.star + ')') + '</span>').join('')
    + (s.boss && !owned.has(s.skin) ? '<span class="gift">Win: ' + SKIN[s.skin].n + ' skin for free</span>' : '');
  $('#caGo').textContent = 'Start: ' + caName(s);
  $('#caGo').disabled = caStatus(c, CA.sel) === 'locked';
}
function caStart(i) {
  const c = caProg(), s = caStages()[i];
  if (!s || caStatus(c, i) === 'locked') return;
  const df = caDiff(s.ovr, s.boss);
  if (!CA.on) CA.lvReal = G.level;
  CA.on = true; CA.i = i; CA.again = i; CA.d = df.d; CA.opp = caProfile(s.ovr, s.focus); G.level = df.lv;
  oA.skin = oB.skin = s.skin;
  startGame();
}
// match over: progress + bonus + goal stars (store 'camp', shop coins), boss skin, result line and the Again/Next button; then caEnd()
function caOver(win) {
  const el = $('#ovCamp');
  $('#againBtn').textContent = 'Again';
  el.hidden = !CA.on; if (!CA.on) return;
  const c = caProg(), i = CA.i, st = caStages(), s = st[i], nx = st[i + 1];
  const m = caGoals(i, G.score, G.stats);
  const gl = s.goals.map((g, b) => '<span class="' + (m >> b & 1 ? 'ok' : 'no') + '">★ ' + g.t + '</span>').join('');
  if (win) {
    const r = caWin(c, i, m); caSave(c, store); if (r.n) addCoins(r.n);
    let gift = '';
    if (r.skin && !owned.has(r.skin)) { owned.add(r.skin); store.set('skins', [...owned]); gift = SKIN[r.skin].n + ' skin unlocked! '; }
    el.innerHTML = '<b>' + caName(s) + (r.first ? ' beaten!' : ' won') + '</b>' + (r.n ? ' <span class="coin"></span>+' + r.n + ' bonus' : '')
      + '<small class="ca-gl">' + gl + '</small>'
      + (r.first ? '<small>' + gift + (nx ? (nx.j ? caName(nx) + ' unlocked' : 'Chapter ' + (nx.ch + 1) + ' unlocked') : 'Campaign complete!') + '</small>' : gift ? '<small>' + gift + '</small>' : '');
    if (nx) { CA.again = i + 1; $('#againBtn').textContent = 'Next stage'; }
  } else el.innerHTML = '<b>' + caName(s) + ' wins</b><small class="ca-gl">' + gl + '</small><small>Goals only count with a win. Raise your skills and try again.</small>';
  caEnd();
}
// match over or left: back to your own difficulty (it was never stored)
function caEnd() { if (!CA.on) return; CA.on = false; CA.opp = null; G.level = CA.lvReal; }
function caWireUI() {
  $('#caBtn').addEventListener('click', () => { SFX.tick(); caShow(); });
  $('#caBack').addEventListener('click', () => { SFX.tick(); showOnly('menu'); });
  $('#caList').addEventListener('click', e => { const b = e.target.closest('.ca-row'); if (!b || b.disabled) return; CA.sel = +b.dataset.i; SFX.tick(); caDraw(); });
  $('#caGo').addEventListener('click', () => { if (caStatus(caProg(), CA.sel) !== 'locked') caStart(CA.sel); });
}
if (typeof document !== 'undefined') caWireUI();
