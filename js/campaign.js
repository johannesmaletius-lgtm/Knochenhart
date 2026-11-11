'use strict';
// campaign (P7): singleplayer ladder. The stages are the shop skins (SKILLS.camp) with rising OVR; you play with your real
// profile (skills and coins as usual, it is never swapped) and the first win of a stage pays a bonus and opens the next one.
// The computer gets a profile of the stage OVR with the stage's focus skill on top, the AI level/pressure follow that OVR.
// Progress: store 'camp' ({ w: wins per stage }). The pure part also runs in Node (tests/campaign.test.js).
if (typeof SKILLS === 'undefined' && typeof require === 'function') Object.assign(globalThis, require('./skills.js'));
/* ---------------- pure ---------------- */
const caStages = () => SKILLS.camp.stages;
function caNew() { return { v: 1, w: caStages().map(() => 0) }; }
function caLoad(st) {
  const c = caNew(), raw = st.get('camp', null);
  if (raw && Array.isArray(raw.w)) c.w = c.w.map((_, i) => Math.max(0, Math.floor(+raw.w[i]) || 0));
  return c;
}
function caSave(c, st) { st.set('camp', { v: 1, w: c.w.slice() }); }
// 'locked' | 'open' | 'beaten': stage 1 is always open, every other one after a win of the stage before
function caStatus(c, i) {
  if (!(i >= 0 && i < c.w.length)) return 'locked';
  return c.w[i] > 0 ? 'beaten' : i === 0 || c.w[i - 1] > 0 ? 'open' : 'locked';
}
// bonus coins for winning stage i now: full on the first win, round(c x repeat) later, 0 if locked
function caReward(c, i) {
  const s = caStatus(c, i), k = caStages()[i];
  return s === 'locked' ? 0 : s === 'beaten' ? Math.round(k.c * SKILLS.camp.repeat) : k.c;
}
// a win of stage i: returns the bonus coins (locked stages cannot be won)
function caWin(c, i) { if (caStatus(c, i) === 'locked') return 0; const n = caReward(c, i); c.w[i]++; return n; }
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
// AI level (G.level arrays) and D() base for a stage OVR
function caDiff(o) {
  const k = SKILLS.camp, x = Math.min(1, Math.max(0, (o - SKILLS.min) / (SKILLS.max - SKILLS.min)));
  return { lv: o < k.lv[0] ? 0 : o < k.lv[1] ? 1 : 2, d: k.d[0] + (k.d[1] - k.d[0]) * x };
}

if (typeof module !== 'undefined' && typeof document === 'undefined') module.exports = { caStages, caNew, caLoad, caSave, caStatus, caReward, caWin, caNext, caProfile, caDiff };

/* ---------------- browser ---------------- */
// on = a campaign match runs (i = stage, opp = computer profile, d = D() base, lvReal = your difficulty, restored after);
// again = stage the Again/Next button starts (-1 = none); sel = picked row; prog = saved progress
const CA = { on: false, i: -1, opp: null, d: 0, lvReal: 1, again: -1, sel: 0, prog: null, drawn: false };
const caProg = () => CA.prog || (CA.prog = caLoad(store));
const CA_FOCUS = id => id ? SKILLS.names[id] : 'All-round';
function caShow() { audioInit(); CA.sel = caNext(caProg()); CA.drawn = false; showOnly('campOv'); caDraw(); }
function caDraw() {
  const c = caProg(), list = $('#caList'), sc = list.scrollTop;
  $('#caOvr').textContent = 'OVR ' + ovr(PROFILE);
  list.innerHTML = caStages().map((s, i) => {
    const k = SKIN[s.skin], st = caStatus(c, i), n = caReward(c, i);
    const em = st === 'locked' ? 'Locked' : (st === 'beaten' ? '<i class="ok">Beaten</i>' : '') + (n ? '<span class="coin"></span>+' + n : '');
    return '<button class="ca-row ' + st + '" style="--rc:' + RARITY(k.p)[1] + '" data-i="' + i + '" aria-pressed="' + (i === CA.sel) + '"' + (st === 'locked' ? ' disabled' : '') + '>'
      + '<span class="ca-n">' + (i + 1) + '</span><img class="px" alt="" src="' + skinIcon(k) + '"><span class="ca-t"><b>' + k.n + '</b><i>OVR ' + s.ovr + ' · ' + CA_FOCUS(s.focus) + '</i></span><em>' + em + '</em></button>';
  }).join('');
  list.scrollTop = sc;
  if (!CA.drawn) { CA.drawn = true; const b = list.querySelector('[aria-pressed="true"]'); if (b) list.scrollTop = Math.max(0, b.offsetTop - list.clientHeight / 2); }
  const s = caStages()[CA.sel];
  $('#caGo').textContent = 'Start: ' + SKIN[s.skin].n;
  $('#caGo').disabled = caStatus(c, CA.sel) === 'locked';
}
function caStart(i) {
  const c = caProg(), s = caStages()[i];
  if (!s || caStatus(c, i) === 'locked') return;
  const df = caDiff(s.ovr);
  if (!CA.on) CA.lvReal = G.level;
  CA.on = true; CA.i = i; CA.again = i; CA.d = df.d; CA.opp = caProfile(s.ovr, s.focus); G.level = df.lv;
  oA.skin = oB.skin = s.skin;
  startGame();
}
// match over: progress + bonus (store 'camp', shop coins), result line and the Again/Next button; then caEnd()
function caOver(win) {
  const el = $('#ovCamp');
  $('#againBtn').textContent = 'Again';
  el.hidden = !CA.on; if (!CA.on) return;
  const c = caProg(), i = CA.i, st = caStages(), nx = st[i + 1], first = caStatus(c, i) !== 'beaten';
  if (win) {
    const n = caWin(c, i); caSave(c, store); if (n) addCoins(n);
    el.innerHTML = '<b>Stage ' + (i + 1) + (first ? ' beaten!' : ' won') + '</b>' + (n ? ' <span class="coin"></span>+' + n + ' bonus' : '')
      + (first ? '<small>' + (nx ? SKIN[nx.skin].n + ' unlocked' : 'Campaign complete!') + '</small>' : '');
    if (nx) { CA.again = i + 1; $('#againBtn').textContent = 'Next stage'; }
  } else el.innerHTML = '<b>' + SKIN[st[i].skin].n + ' wins</b><small>Raise your skills and try again.</small>';
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
