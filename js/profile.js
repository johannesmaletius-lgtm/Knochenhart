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

if (typeof module !== 'undefined' && typeof document === 'undefined') module.exports = { nameClean, lbEntry, lbSort, lbAdd, lbRank };

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
function profileOpen() { pfTab = 'sk'; showOnly('skillOv'); profileSync(); profileDraw(); $('#pfList').scrollTop = 0; }
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
  const lv = PROFILE.sk[id], c = levelCost(lv), f = (lv - SKILLS.min) / (SKILLS.max - SKILLS.min);
  let tags = '';
  for (const [k, [s, at]] of Object.entries(SKILLS.unlock)) if (s === id) tags += '<span class="tag' + (lv >= at ? ' on' : '') + '">' + SKILLS.unlockNames[k] + (lv >= at ? '' : ' ' + at) + '</span>';
  tags += '<span class="tag' + (lv >= SKILLS.badgeAt ? ' on gold' : '') + '">Badge' + (lv >= SKILLS.badgeAt ? '' : ' ' + SKILLS.badgeAt) + '</span>';
  let perks = '';
  if (hasBadge(PROFILE, id)) perks = '<div class="perks" role="group" aria-label="' + SKILLS.names[id] + ' badge">' + SKILLS.perks[id].map(k =>
    '<button class="perk" data-sk="' + id + '" data-perk="' + k.id + '" aria-pressed="' + (PROFILE.badge[id] === k.id) + '"><b>' + k.n + '</b><small>' + k.d + '</small></button>').join('') + '</div>';
  const btn = c ? '<button class="plus" data-up="' + id + '"' + (coins < c ? ' disabled' : '') + ' aria-label="Raise ' + SKILLS.names[id] + ' for ' + c + ' coins">+<span class="coin"></span>' + c + '</button>'
    : '<span class="plus max">Max</span>';
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
  $('#pfCoins').textContent = coins;
  $('#pfSeg').dataset.lv = pfTab === 'sk' ? 0 : 1;
  $('#pfTabSk').setAttribute('aria-pressed', pfTab === 'sk'); $('#pfTabLb').setAttribute('aria-pressed', pfTab === 'lb');
  $('#pfList').hidden = pfTab !== 'sk'; $('#pfLb').hidden = pfTab !== 'lb';
  $('#pfOvr').textContent = ovr(PROFILE);
  $('#pfRank').textContent = '#' + lbRank(leaderboard(), PID) + ' local';
  $('#pfTmp').hidden = !PROFILE.tmp;
  if (pfTab === 'sk') {
    $('#pfRadar').innerHTML = radarSVG(PROFILE.sk);
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
  $('#pfOk').addEventListener('click', () => { SFX.tick(); showOnly('menu'); });
  $('#pfTabSk').addEventListener('click', () => { pfTab = 'sk'; SFX.tick(); profileDraw(); });
  $('#pfTabLb').addEventListener('click', () => { pfTab = 'lb'; SFX.tick(); profileDraw(); });
  $('#pfList').addEventListener('click', e => {
    const up = e.target.closest('.plus[data-up]'), pk = e.target.closest('.perk');
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
