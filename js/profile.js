'use strict';
// profile: player name + id, local leaderboard (board), skill screen (coins -> levels, OVR, radar, badge perks).
// The leaderboard helpers at the top are pure and also run in Node (tests/profile.test.js).
/* ---------------- pure helpers: name, leaderboard ---------------- */
function nameClean(s, max) {
  const t = String(s == null ? '' : s).replace(/[^A-Za-z0-9 _.-]/g, '').replace(/\s+/g, ' ').trim().slice(0, max).trim();
  return t || 'Player';
}
// one stored entry: { id, name, ovr, sk, badge, skin, t }; invalid input -> null
function lbEntry(e, nameMax) {
  if (!e || typeof e.id !== 'string' || !e.id || e.id.length > 32) return null;
  const o = Math.round(+e.ovr);
  return { id: e.id, name: nameClean(e.name, nameMax), ovr: o > 0 ? o : 0, sk: e.sk && typeof e.sk === 'object' ? e.sk : {}, badge: e.badge && typeof e.badge === 'object' ? e.badge : {}, skin: typeof e.skin === 'string' ? e.skin : '', t: +e.t || 0 };
}
// best OVR first, then name, then id (stable for equal players)
const lbSort = list => list.slice().sort((a, b) => b.ovr - a.ovr || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || (a.id < b.id ? -1 : 1));
// insert or replace (same id) and sort; over max the longest-unseen other entries are dropped
function lbAdd(list, e, max, nameMax) {
  const n = lbEntry(e, nameMax || 99);
  let out = (Array.isArray(list) ? list : []).map(x => lbEntry(x, nameMax || 99)).filter(x => x && (!n || x.id !== n.id));
  if (n) out.push(n);
  if (out.length > max) {
    const keep = out.filter(x => x !== n).sort((a, b) => b.t - a.t).slice(0, Math.max(0, max - (n ? 1 : 0)));
    out = n ? keep.concat(n) : keep;
  }
  return lbSort(out);
}
const lbRank = (list, id) => list.findIndex(x => x.id === id) + 1;

/* ---------------- pure helpers: MP profiles (P5) ---------------- */
// Node: the profile helpers need the SKILLS table (in the browser it is a global from js/skills.js)
if (typeof SKILLS === 'undefined' && typeof require === 'function') Object.assign(globalThis, require('./skills.js'));
// a profile from another phone is untrusted: id must be a short token, skills are clamped to 60..99,
// only known perks of reached badges survive, name sanitised; null = unusable
function profClean(raw, nameMax) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(raw.id)) return null;
  const p = skillsNew(), sk = raw.sk && typeof raw.sk === 'object' ? raw.sk : {}, bd = raw.badge && typeof raw.badge === 'object' ? raw.badge : {};
  for (const id of SKILLS.ids) { const v = Math.round(+sk[id]); p.sk[id] = v >= SKILLS.min ? Math.min(SKILLS.max, v) : SKILLS.min; }
  for (const id of SKILLS.ids) if (typeof bd[id] === 'string') pickPerk(p, id, bd[id]);
  const skin = typeof raw.skin === 'string' && /^[A-Za-z0-9_-]{1,16}$/.test(raw.skin) ? raw.skin : '';
  return { id: raw.id, name: nameClean(raw.name, nameMax || SKILLS.board.nameMax), ovr: ovr(p), sk: p.sk, badge: p.badge, skin };
}
// my card on the wire: no timestamp, the receiver recomputes the OVR from the skills
const profWire = c => ({ id: c.id, name: c.name, sk: Object.assign({}, c.sk), badge: Object.assign({}, c.badge), skin: c.skin });
// met players go into the board only when new or changed (seen: Map id -> last key), never my own id
function meetNew(seen, p, selfId) {
  if (!p || !p.id || p.id === selfId) return false;
  const k = JSON.stringify([p.name, p.sk, p.badge, p.skin]);
  if (seen.get(p.id) === k) return false;
  seen.set(p.id, k); return true;
}

if (typeof module !== 'undefined' && typeof document === 'undefined') module.exports = { nameClean, lbEntry, lbSort, lbAdd, lbRank, profClean, profWire, meetNew };

/* ---------------- browser: own id + name, stored board ---------------- */
const PID = typeof store !== 'undefined' ? store.get('pid', null) || (() => { const id = Math.random().toString(36).slice(2, 10); store.set('pid', id); return id; })() : '';
let myName = typeof store !== 'undefined' ? nameClean(store.get('name', ''), SKILLS.board.nameMax) : 'Player';
const myCard = () => ({ id: PID, name: myName, ovr: ovr(PROFILE), sk: Object.assign({}, PROFILE.sk), badge: Object.assign({}, PROFILE.badge), skin: mySkin, t: Date.now() });
// store a player (own card now, MP peers in P5): { id, name, sk, badge, skin } (ovr computed from sk when missing)
function leaderboardAdd(p) {
  const e = Object.assign({ t: Date.now() }, p);
  if (e.ovr == null && e.sk) e.ovr = ovr({ sk: Object.assign(skillsNew().sk, e.sk) });
  const list = lbAdd(store.get('board', []), e, SKILLS.board.max, SKILLS.board.nameMax);
  store.set('board', list);
  return list;
}
// view: stored board with the live own card always in it
const leaderboard = () => lbAdd(store.get('board', []), myCard(), Infinity, SKILLS.board.nameMax);
// ?ovr= profiles are temporary: shown, never stored
function profileSync() { if (!PROFILE.tmp) leaderboardAdd(myCard()); }

/* ---------------- skill screen ---------------- */
let pfTab = 'sk';
// P6 Skill Games (js/skillgames.js): the same screen edits a temporary profile against a budget, never saved.
// pfSG = { p, budget, go, msg, onGo, onBack, locked } or null (own profile)
let pfSG = null;
const pfP = () => pfSG ? pfSG.p : PROFILE;
function profileOpen() { pfSG = null; pfTab = 'sk'; showOnly('skillOv'); profileSync(); profileDraw(); $('#pfList').scrollTop = 0; }
function pfSgOpen(cfg) { pfSG = cfg; pfTab = 'sk'; showOnly('skillOv'); pfSgMsg(cfg.msg); profileDraw(); $('#pfList').scrollTop = 0; $('#pfGo').focus({ preventScroll: true }); }
function pfSgClose() { pfSG = null; }
function pfSgMsg(s) { $('#pfSgMsg').textContent = s || ''; }
// radar: 6 axes, level 60 sits on a small inner ring so the shape never collapses
function radarSVG(sk) {
  const ids = SKILLS.ids, W = 168, H = 132, cx = W / 2, cy = H / 2 + 2, R = 46, in0 = 0.16;
  const pt = (i, f) => { const a = -Math.PI / 2 + i * 2 * Math.PI / ids.length; return [cx + Math.cos(a) * R * f, cy + Math.sin(a) * R * f]; };
  const fr = lv => in0 + (1 - in0) * (lv - SKILLS.min) / (SKILLS.max - SKILLS.min);
  const poly = f => ids.map((id, i) => pt(i, f(id)).map(v => v.toFixed(1)).join(',')).join(' ');
  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="radar" role="img" aria-label="Skill chart">';
  for (const lv of [70, 80, 90, SKILLS.max]) s += '<polygon class="g" points="' + poly(() => fr(lv)) + '"/>';
  ids.forEach((id, i) => { const [x, y] = pt(i, 1); s += '<line class="g" x1="' + cx + '" y1="' + cy + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>'; });
  s += '<polygon class="v" points="' + poly(id => fr(sk[id])) + '"/>';
  ids.forEach((id, i) => {
    const [x, y] = pt(i, 1.24), anc = Math.abs(x - cx) < 4 ? 'middle' : x < cx ? 'end' : 'start';
    s += '<text x="' + x.toFixed(1) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="' + anc + '"' + (sk[id] >= SKILLS.badgeAt ? ' class="hi"' : '') + '>' + SKILLS.names[id] + ' ' + sk[id] + '</text>';
  });
  return s + '</svg>';
}
function skillRowHTML(id) {
  const P = pfP(), lv = P.sk[id], c = levelCost(lv), f = (lv - SKILLS.min) / (SKILLS.max - SKILLS.min), lock = pfSG && pfSG.locked ? ' disabled' : '';
  let tags = '';
  for (const [k, [s, at]] of Object.entries(SKILLS.unlock)) if (s === id) tags += '<span class="tag' + (lv >= at ? ' on' : '') + '">' + SKILLS.unlockNames[k] + (lv >= at ? '' : ' ' + at) + '</span>';
  tags += '<span class="tag' + (lv >= SKILLS.badgeAt ? ' on gold' : '') + '">Badge' + (lv >= SKILLS.badgeAt ? '' : ' ' + SKILLS.badgeAt) + '</span>';
  let perks = '';
  if (hasBadge(P, id)) perks = '<div class="perks" role="group" aria-label="' + SKILLS.names[id] + ' badge">' + SKILLS.perks[id].map(k =>
    '<button class="perk" data-sk="' + id + '" data-perk="' + k.id + '" aria-pressed="' + (P.badge[id] === k.id) + '"' + lock + '><b>' + k.n + '</b><small>' + k.d + '</small></button>').join('') + '</div>';
  // Skill Games: the budget pays, levels can go back down
  const have = pfSG ? pfSG.budget - sgSpent(P) : coins;
  let btn = c ? '<button class="plus" data-up="' + id + '"' + (have < c || lock ? ' disabled' : '') + ' aria-label="Raise ' + SKILLS.names[id] + ' for ' + c + ' coins">+<span class="coin"></span>' + c + '</button>'
    : '<span class="plus max">Max</span>';
  if (pfSG) btn = '<button class="plus minus" data-dn="' + id + '"' + (lv <= SKILLS.min || lock ? ' disabled' : '') + ' aria-label="Lower ' + SKILLS.names[id] + '">&minus;</button>' + btn;
  return '<div class="sk"><div class="sk-top"><b>' + SKILLS.names[id] + '</b><span class="lv">' + lv + '</span>' + btn + '</div>'
    + '<span class="bar"><i style="width:' + (f * 100).toFixed(1) + '%"></i></span><div class="tags">' + tags + '</div>' + perks + '</div>';
}
function boardHTML() {
  const list = leaderboard();
  return list.map((e, i) => {
    const mine = e.id === PID, k = SKIN[e.skin] || SKINS[0];
    return '<li' + (mine ? ' class="me"' : '') + '><i>' + (i + 1) + '</i><img class="px" alt="" src="' + skinIcon(k) + '"><b>' + e.name + '</b>'
      + (mine ? '<span class="you">You</span>' : '') + '<em>' + e.ovr + '</em></li>';
  }).join('');
}
function profileDraw() {
  const P = pfP(), sg = !!pfSG;
  if (sg) pfTab = 'sk';
  $('#pfCoins').textContent = sg ? pfSG.budget - sgSpent(P) : coins;
  $('#pfTitle').textContent = sg ? 'Skill Games' : 'Skills';
  $('#pfSeg').hidden = sg; $('#pfSg').hidden = !sg;
  if (sg) { $('#pfGo').textContent = pfSG.locked ? 'Waiting' : pfSG.go; $('#pfGo').disabled = $('#pfAuto').disabled = !!pfSG.locked; }
  $('#pfSeg').dataset.lv = pfTab === 'sk' ? 0 : 1;
  $('#pfTabSk').setAttribute('aria-pressed', pfTab === 'sk'); $('#pfTabLb').setAttribute('aria-pressed', pfTab === 'lb');
  $('#pfList').hidden = pfTab !== 'sk'; $('#pfLb').hidden = pfTab !== 'lb';
  $('#pfOvr').textContent = ovr(P);
  $('#pfRank').textContent = sg ? 'Budget ' + pfSG.budget : '#' + lbRank(leaderboard(), PID) + ' local';
  $('#pfTmp').hidden = !P.tmp; $('#pfTmp').textContent = sg ? 'This match only' : 'Debug';
  if (pfTab === 'sk') {
    $('#pfRadar').innerHTML = radarSVG(P.sk);
    const list = $('#pfList'), sc = list.scrollTop;
    list.innerHTML = SKILLS.ids.map(skillRowHTML).join('');
    list.scrollTop = sc;
  } else {
    if (document.activeElement !== $('#pfName')) $('#pfName').value = myName;
    $('#pfBoard').innerHTML = boardHTML();
  }
}
function profileWire() {
  $('#skillBtn').addEventListener('click', () => { audioInit(); profileOpen(); });
  $('#pfOk').addEventListener('click', () => { if (pfSG) { pfSG.onBack(); return; } SFX.tick(); showOnly('menu'); });
  $('#pfTabSk').addEventListener('click', () => { pfTab = 'sk'; SFX.tick(); profileDraw(); });
  $('#pfTabLb').addEventListener('click', () => { pfTab = 'lb'; SFX.tick(); profileDraw(); });
  $('#pfList').addEventListener('click', e => {
    const up = e.target.closest('.plus[data-up]'), pk = e.target.closest('.perk'), dn = e.target.closest('.plus[data-dn]');
    if (pfSG) {
      // Skill Games: temporary profile, budget instead of coins, nothing is saved
      const P = pfSG.p; if (pfSG.locked) return;
      if (up) { const id = up.dataset.up; if (!sgUp(P, id, pfSG.budget)) return; const lv = P.sk[id]; if (lv === SKILLS.badgeAt || Object.values(SKILLS.unlock).some(([s, at]) => s === id && at === lv)) SFX.win(); else SFX.tick(); }
      else if (dn) { if (!sgDown(P, dn.dataset.dn)) return; SFX.tick(); }
      else if (pk) { if (!pickPerk(P, pk.dataset.sk, pk.dataset.perk)) return; SFX.tick(); }
      else return;
      profileDraw(); return;
    }
    if (up) {
      const id = up.dataset.up;
      if (!skillUp(id)) return;
      const lv = PROFILE.sk[id], hit = lv === SKILLS.badgeAt || Object.values(SKILLS.unlock).some(([s, at]) => s === id && at === lv);
      if (hit) SFX.win(); else SFX.tick();
      profileSync(); profileDraw();
    } else if (pk) {
      if (pickPerk(PROFILE, pk.dataset.sk, pk.dataset.perk)) { skillsSave(PROFILE, store); profileSync(); SFX.tick(); profileDraw(); }
    }
  });
  const setName = () => { myName = nameClean($('#pfName').value, SKILLS.board.nameMax); $('#pfName').value = myName; store.set('name', myName); profileSync(); profileDraw(); };
  $('#pfName').addEventListener('change', setName);
  $('#pfName').addEventListener('keydown', e => { if (e.key === 'Enter') $('#pfName').blur(); });
}
if (typeof document !== 'undefined') profileWire();
