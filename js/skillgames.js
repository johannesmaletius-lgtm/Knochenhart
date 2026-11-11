'use strict';
// skillgames (P6): Skill Games mode. Everyone starts at 60 and spends a budget (SKILLS.sg.share of the coins for all skills
// 60 -> 99) on a temporary profile before the match. It is never saved, never sent as a lobby profile (so it never enters a
// leaderboard) and is dropped after the match; coins pay as usual (x SKILLS.sg.coinMul). Singleplayer: menu button, the
// computer gets its own auto-spent budget profile. MP: host lobby option (with Classic/Hybrid), every phone spends, the host
// checks each profile (P5 cleaning + budget), the match starts as soon as everyone is ready (no timer).
// The pure part (budget, spend, check, auto spread, profile swap) also runs in Node (tests/skillgames.test.js).
if (typeof SKILLS === 'undefined' && typeof require === 'function') Object.assign(globalThis, require('./skills.js'), require('./profile.js'));
/* ---------------- pure ---------------- */
const sgBudget = () => Math.round(totalCost() * SKILLS.sg.share);
function sgSpent(p) { let s = 0; for (const id of SKILLS.ids) s += costTo(SKILLS.min, p.sk[id]); return s; }
function sgNew() { const p = skillsNew(); p.tmp = true; p.sg = true; return p; }
// +1 level if it fits the budget (returns its cost, 0 = no); -1 level gives the coins back, a badge below 90 is dropped
function sgUp(p, id, budget) { const c = levelCost(p.sk[id]); if (!c || sgSpent(p) + c > budget) return 0; p.sk[id]++; return c; }
function sgDown(p, id) { if (!(p.sk[id] > SKILLS.min)) return 0; p.sk[id]--; if (!hasBadge(p, id)) delete p.badge[id]; return levelCost(p.sk[id]); }
// spend what is left: each step raises a random affordable skill (chance mix) or the lowest one; badges get a random perk
function sgAuto(p, budget, rng, mix) {
  for (;;) {
    const can = SKILLS.ids.filter(id => { const c = levelCost(p.sk[id]); return c && sgSpent(p) + c <= budget; });
    if (!can.length) break;
    let pool = can;
    if (!(rng() < mix)) { const lo = Math.min(...can.map(id => p.sk[id])); pool = can.filter(id => p.sk[id] === lo); }
    p.sk[pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]]++;
  }
  for (const id of SKILLS.ids) if (hasBadge(p, id) && !perk(p, id)) { const ks = SKILLS.perks[id]; pickPerk(p, id, ks[Math.min(ks.length - 1, Math.floor(rng() * ks.length))].id); }
  return p;
}
// preset (SKILLS.sg.presets id): back to 60, targets in order (as far as the budget goes), rest evenly, preset perks
function sgPreset(p, budget, id) {
  const pr = SKILLS.sg.presets.find(x => x.id === id); if (!pr) return null;
  for (const s of SKILLS.ids) p.sk[s] = SKILLS.min;
  p.badge = {};
  for (const [s, to] of pr.t) while (p.sk[s] < to && sgUp(p, s, budget));
  sgAuto(p, budget, () => 0.5, 0);
  for (const [s, k] of Object.entries(pr.perk || {})) pickPerk(p, s, k);
  return p;
}
// a temporary profile from another phone: P5 cleaning (profClean: 60..99, known perks of reached badges) + inside the budget
function sgCheck(raw, budget) {
  if (!raw || typeof raw !== 'object') return null;
  const c = profClean({ id: 'sg', name: 'sg', sk: raw.sk, badge: raw.badge }); if (!c) return null;
  const p = sgNew(); p.sk = c.sk; p.badge = c.badge;
  return sgSpent(p) <= budget ? p : null;
}
const sgWire = p => ({ sk: Object.assign({}, p.sk), badge: Object.assign({}, p.badge) });
function sgClone(p) { const q = sgNew(); Object.assign(q.sk, p.sk); Object.assign(q.badge, p.badge); return q; }
// swap the active profile for one match and back: the real one is only held, never written
function sgEnter(S, cur, prof, opp) { if (!S.on) S.real = cur; S.on = true; S.prof = prof; S.opp = opp || null; return prof; }
function sgLeave(S, cur) { if (!S.on) return cur; const r = S.real; S.on = false; S.real = S.prof = S.opp = null; return r; }

if (typeof module !== 'undefined' && typeof document === 'undefined') module.exports = { sgBudget, sgSpent, sgNew, sgUp, sgDown, sgAuto, sgPreset, sgCheck, sgWire, sgClone, sgEnter, sgLeave };

/* ---------------- browser: singleplayer ---------------- */
// on = a Skill Games match runs (PROFILE is the temporary one), again = last spread (Again button), mp = MP spend screen open
const SG = { on: false, real: null, prof: null, opp: null, again: null, mp: false, timer: 0, tick: 0, ready: [0, 0] };
const sgCoinMul = () => SG.on || (MP.net && MP.sg) ? SKILLS.sg.coinMul : 1;
function sgOpenSP(keep) {
  audioInit();
  const b = sgBudget(), p = keep && SG.again ? sgClone(SG.again) : sgNew();
  pfSgOpen({ p, budget: b, go: 'Start', msg: 'Everyone starts at 60. This spread counts for one match only.',
    onGo: () => sgStartSP(p), onBack: () => { SFX.tick(); sgClose(); showOnly('menu'); } });
}
function sgStartSP(p) {
  sgClose(); SG.again = sgClone(p);
  PROFILE = sgEnter(SG, PROFILE, p, sgAuto(sgNew(), sgBudget(), RNG, SKILLS.sg.aiMix));
  startGame();
}
// match over or left: back to the real profile (untouched)
function sgEnd() { PROFILE = sgLeave(SG, PROFILE); }
function sgClose() { clearInterval(SG.tick); clearTimeout(SG.timer); if (typeof waitFx === 'function') waitFx('#pfSgMsg', false); SG.mp = false; if (typeof MP !== 'undefined') MP.sgOpen = false; pfSgClose(); }

/* ---------------- browser: multiplayer (host decides) ---------------- */
function mpGoReq() { if (!MP.host) return; if (MP.sg) sgMpOpen(); else mpBegin(); }
function sgMpOpen() {
  const b = sgBudget();
  MP.sgp = [null, null, null, null];
  MP.net.all({ t: 'sgo', b });
  sgMpScreen(b); MP.sgOpen = true;
  sgMpCheck();
}
// every phone: spend screen, no countdown; the match starts when every player pressed Ready
function sgMpScreen(b) {
  clearInterval(SG.tick);
  SG.mp = true; SG.ready = [0, Math.max(1, MP.slots.filter(Boolean).length)];
  pfSgOpen({ p: sgNew(), budget: b, go: 'Ready', msg: '', onGo: sgMpReady, onBack: () => { sgClose(); mpLeave(); } });
  const tick = () => {
    if (!pfSG) return clearInterval(SG.tick);
    pfSgMsg((pfSG.locked ? 'Ready! Waiting for the others. ' : 'Spend your coins, then Ready. ') + SG.ready[0] + '/' + SG.ready[1] + ' ready');
    waitFx('#pfSgMsg', !!pfSG.locked); // done spending: wait for the others
  };
  SG.tick = setInterval(tick, 250); tick();
}
function sgMpReady() {
  if (!pfSG || pfSG.locked || !MP.net) return;
  pfSG.locked = true; SFX.tick();
  const w = sgWire(pfSG.p);
  if (MP.host) sgMpIn(MP.mySlot, w); else MP.net.toHost({ t: 'sgp', p: w });
  if (pfSG) profileDraw();
}
// host: a phone's spread; rejected ones (over budget, bad data) get an auto spread at the start
function sgMpIn(i, raw) {
  if (!MP.sgOpen || !(i >= 0) || !MP.slots[i] || MP.sgp[i]) return;
  const p = sgCheck(raw, sgBudget()); if (!p) return;
  MP.sgp[i] = p; sgMpCheck();
}
function sgMpCheck() {
  if (!MP.sgOpen) return;
  const hum = [0, 1, 2, 3].filter(i => MP.slots[i]), n = hum.filter(i => MP.sgp[i]).length;
  if (n >= hum.length) { sgMpGo(); return; }
  SG.ready = [n, hum.length]; MP.net.all({ t: 'sgr', n, of: hum.length });
}
function sgMpGo() {
  if (!MP.sgOpen || !MP.host || !MP.net) return;
  const b = sgBudget();
  for (let i = 0; i < 4; i++) if (!MP.slots[i] || !MP.sgp[i]) MP.sgp[i] = sgAuto(sgNew(), b, Math.random, MP.slots[i] ? 0 : SKILLS.sg.aiMix);
  sgClose(); mpBegin();
}
// host: someone joined while the others spend
function sgMpJoin(id) { if (MP.sgOpen) { MP.net.send(id, { t: 'sgo', b: sgBudget() }); sgMpCheck(); } }
// client: host messages (peer data: clamp)
function sgMpMsg(d) {
  if (d.t === 'sgo') sgMpScreen(clamp(Math.round(+d.b) || 0, 0, totalCost()));
  else if (d.t === 'sgr') SG.ready = [clamp(Math.round(+d.n) || 0, 0, 4), clamp(Math.round(+d.of) || 0, 0, 4)];
}
function sgWireUI() {
  $('#sgBtn').addEventListener('click', () => { SFX.tick(); sgOpenSP(false); });
  $('#pfGo').addEventListener('click', () => { if (pfSG && !pfSG.locked) pfSG.onGo(); });
  $('#pfPre').innerHTML = SKILLS.sg.presets.map(k => '<button class="btn ghost" data-pre="' + k.id + '">' + k.n + '</button>').join('');
  $('#pfPre').addEventListener('click', e => {
    const b = e.target.closest('[data-pre]'); if (!b || !pfSG || pfSG.locked) return;
    sgPreset(pfSG.p, pfSG.budget, b.dataset.pre); SFX.tick(); profileDraw();
  });
  $('#pfAuto').addEventListener('click', () => { if (!pfSG || pfSG.locked) return; sgAuto(pfSG.p, pfSG.budget, Math.random, 0); SFX.tick(); profileDraw(); });
}
if (typeof document !== 'undefined') sgWireUI();
