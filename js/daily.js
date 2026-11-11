'use strict';
// daily: coins for a win by opponent strength (earnWin) and the daily challenges (SKILLS.daily, store 'daily').
// Pure helpers first (also a Node module for tests/daily.test.js), browser UI below.
if (typeof SKILLS === 'undefined' && typeof require === 'function') Object.assign(globalThis, require('./skills.js'));
/* ---------------- pure ---------------- */
// coins for one won match. o = { lv } (normal singleplayer) or { opp, me } (OVR numbers: campaign / Skill Games) or {} (MP);
// daily = first win of the day; mul = extra factor (Skill Games coinMul). Returns { n, m (strength factor), under (bonus share) }
function earnWin(o) {
  const E = SKILLS.earn;
  let m = 1, under = 0;
  if (o.opp != null) {
    const x = Math.min(1, Math.max(0, (o.opp - SKILLS.min) / (SKILLS.max - SKILLS.min)));
    m = E.ovr[0] + (E.ovr[1] - E.ovr[0]) * x;
    if (o.me != null) under = Math.min(E.underMax, Math.max(0, (o.opp - o.me) * E.under));
  } else if (o.lv != null) m = E.lv[o.lv] != null ? E.lv[o.lv] : 1;
  const n = Math.max(1, Math.round(E.win * m * (1 + under) * (o.daily ? E.dailyMul : 1) * (o.mul != null ? o.mul : 1)));
  return { n, m, under };
}
const dayKey = (d = new Date()) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
// the n challenges of a day: same for everybody on that date (seeded by the day key), all different
function dailyPick(day) {
  const pool = SKILLS.daily.pool.slice(), out = [];
  const r = mulberry32(day * 2654435761 >>> 0);
  while (out.length < SKILLS.daily.n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0].id);
  return out;
}
const dailyDef = id => SKILLS.daily.pool.find(c => c.id === id);
// saved state for today (a new day starts fresh): { day, ids, p: progress by id, paid: ids already paid }
function dailyState(saved, day) {
  if (saved && saved.day === day && Array.isArray(saved.ids)) return { day, ids: saved.ids, p: saved.p || {}, paid: saved.paid || [] };
  return { day, ids: dailyPick(day), p: {}, paid: [] };
}
// progress of challenge c if this match (stats s) were added
const dailyVal = (st, c, s) => {
  const have = st.p[c.id] || 0, add = (s && s[c.k]) || 0;
  return c.max ? Math.max(have, add) : have + add;
};
// add one finished match: updates st, returns the challenges completed by it (pay their c)
function dailyAdd(st, s) {
  const done = [];
  for (const id of st.ids) {
    const c = dailyDef(id); if (!c) continue;
    st.p[id] = Math.min(c.g, dailyVal(st, c, s));
    if (st.p[id] >= c.g && !st.paid.includes(id)) { st.paid.push(id); done.push(c); }
  }
  return done;
}
// challenges this running match would complete (for the in-match popup)
const dailyReached = (st, s) => st.ids.map(dailyDef).filter(c => c && !st.paid.includes(c.id) && dailyVal(st, c, s) >= c.g);

/* ---------------- browser ---------------- */
if (typeof document !== 'undefined') {
  var DLY = { ann: [] }; // challenges already announced in this match
  // coins + label for a won match right now (MP and Skill Games included); daily = first win of the day
  var winPay = daily => {
    const mul = sgCoinMul();
    if (MP.net) return Object.assign(earnWin({ daily, mul }), { lbl: '' });
    const o = (CA.on && CA.opp) || (SG.on && SG.opp);
    if (o) { const r = earnWin({ opp: ovr(o), me: ovr(PROFILE), daily, mul }); r.lbl = 'OVR ' + ovr(o) + (r.under ? ' · underdog +' + Math.round(r.under * 100) + '%' : ''); return r; }
    const r = earnWin({ lv: G.level, daily, mul }); r.lbl = ['Easy', 'Normal', 'Hard'][G.level] + ' ×' + r.m; return r;
  };
  var dailyNow = () => dailyState(store.get('daily', null), dayKey());
  var dailyStart = () => { DLY.ann = []; };
  // after every point in singleplayer: popup once a challenge is reached (paid at the end of the match)
  var dailyTick = () => {
    if (G.mode !== 'play' || MP.net) return;
    for (const c of dailyReached(dailyNow(), G.stats)) {
      if (DLY.ann.includes(c.id)) continue;
      DLY.ann.push(c.id); after(0.9, () => { popup('CHALLENGE +' + c.c, C.accent, 1, null, H * 0.36, 1.4); tone(1568, 0.08, 'square', 0.04); tone(2093, 0.12, 'square', 0.04, 0, 0.08); });
    }
  };
  // singleplayer match over: add it, pay finished challenges, list them on the result card
  var dailyMatch = win => {
    const s = G.stats;
    s.wins = win ? 1 : 0;
    const o = (CA.on && CA.opp) || (SG.on && SG.opp);
    s.hard = win && (o ? ovr(o) >= SKILLS.daily.hardOvr : G.level === 2) ? 1 : 0;
    const st = dailyNow(), done = dailyAdd(st, s);
    store.set('daily', st);
    const el = $('#ovDaily');
    el.hidden = !done.length;
    if (done.length) {
      addCoins(done.reduce((a, c) => a + c.c, 0));
      el.innerHTML = done.map(c => '<span class="ch">✓ ' + c.t + ' <span class="coin"></span>+' + c.c + '</span>').join('');
    }
  };
  // time until the next set (local midnight)
  var dailyLeft = () => { const d = new Date(), m = new Date(d); m.setHours(24, 0, 0, 0); const t = (m - d) / 60000; return Math.floor(t / 60) + 'h ' + Math.floor(t % 60) + 'm'; };
  // menu row: one pip per challenge, coins still open
  var dailyMenu = () => {
    const st = dailyNow(), open = st.ids.map(dailyDef).filter(c => c && !st.paid.includes(c.id));
    $('#dailyPips').innerHTML = st.ids.map(id => '<i' + (st.paid.includes(id) ? ' class="on"' : '') + '></i>').join('');
    $('#dailyLeft').innerHTML = open.length ? '<span class="coin"></span>+' + open.reduce((a, c) => a + c.c, 0) : 'All done';
  };
  var dailyOpen = () => {
    const st = dailyNow();
    $('#dailyList').innerHTML = st.ids.map(id => {
      const c = dailyDef(id); if (!c) return '';
      const v = Math.min(c.g, st.p[id] || 0), ok = st.paid.includes(id);
      return '<li class="' + (ok ? 'ok' : '') + '"><span class="t">' + c.t + '</span><span class="v">' + (ok ? 'Done' : v + '/' + c.g) + '</span>'
        + '<span class="bar"><i style="width:' + (v / c.g * 100).toFixed(1) + '%"></i></span><span class="c"><span class="coin"></span>' + c.c + '</span></li>';
    }).join('');
    $('#dailyReset').textContent = 'New challenges in ' + dailyLeft() + ' · singleplayer matches count';
    showOnly('dailyOv');
  };
  $('#dailyBtn').addEventListener('click', () => { audioInit(); SFX.tick(); dailyOpen(); });
  $('#dailyOk').addEventListener('click', () => { SFX.tick(); showOnly('menu'); });
}
if (typeof module !== 'undefined' && typeof document === 'undefined') module.exports = { earnWin, dayKey, dailyPick, dailyDef, dailyState, dailyAdd, dailyReached };
