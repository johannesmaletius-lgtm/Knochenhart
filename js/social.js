'use strict';
// social (P5): MP profiles (sent on join, cleaned by the host, shown in the lobby: name + OVR per slot, tap = card with
// radar + badges), every met player -> local leaderboard, emote quick menu (top-left corner, MP only) relayed by the host.
// Numbers: SKILLS.social. The rate limit on top is pure and also runs in Node (tests/social.test.js).
/* ---------------- pure: emote rate limit ---------------- */
// log = send times (s) of one player; ok = this emote may go out now (min gap, at most burst per win seconds)
function emoteGate(log, now, cfg) {
  const L = (Array.isArray(log) ? log : []).filter(t => now - t < cfg.win);
  if ((L.length && now - L[L.length - 1] < cfg.gap) || L.length >= cfg.burst) return { ok: false, log: L };
  L.push(now); return { ok: true, log: L };
}
if (typeof module !== 'undefined' && typeof document === 'undefined') module.exports = { emoteGate };

/* ---------------- browser: profiles ---------------- */
const MET = new Map();
function playerMet(p) { if (meetNew(MET, p, PID)) leaderboardAdd({ id: p.id, name: p.name, ovr: p.ovr, sk: p.sk, badge: p.badge, skin: p.skin }); }
const myProf = () => profWire(myCard());
// clean a profile from a peer; skins must exist on this phone
function profIn(raw) { const p = profClean(raw); if (p && !SKIN[p.skin]) p.skin = ''; return p; }
// host: slot i sent its profile
function mpProfIn(i, raw) {
  const p = profIn(raw); if (!p || !MP.slots[i]) return;
  MP.slots[i].prof = p; playerMet(p); mpLobbySync();
}
// client: the host's lobby list is peer data too: clean every profile, remember everyone
function mpProfSlots(slots) {
  if (!Array.isArray(slots)) return [null, null, null, null];
  return [0, 1, 2, 3].map(i => {
    const s = slots[i]; if (!s || typeof s !== 'object') return null;
    const p = s.prof ? profIn(s.prof) : null; if (p) playerMet(p);
    return { id: String(s.id), n: +s.n || 0, sk: typeof s.sk === 'string' ? s.sk : '', prof: p };
  });
}
// lobby card: radar + badges of one slot
function mpCardShow(i) {
  const s = MP.slots[i], p = s && s.prof; if (!p) return false;
  $('#mpCardName').textContent = p.name;
  $('#mpCardOvr').textContent = p.ovr;
  $('#mpCardRadar').innerHTML = radarSVG(p.sk);
  const tags = SKILLS.ids.filter(id => p.sk[id] >= SKILLS.badgeAt).map(id => {
    const k = perk(p, id);
    return '<span class="tag on gold">' + (k ? k.n : SKILLS.names[id] + ' badge') + '</span>';
  });
  $('#mpCardBadges').innerHTML = tags.length ? tags.join('') : '<span class="tag">No badges yet</span>';
  $('#mpCard').hidden = false; SFX.tick();
  $('#mpCardOk').focus({ preventScroll: true });
  return true;
}
function mpCardHide() { $('#mpCard').hidden = true; }

/* ---------------- browser: emotes ---------------- */
const EMO = { log: [], host: [[], [], [], []], show: [null, null, null, null] };
function emoteMenu(v) { const m = $('#emoMenu'); m.hidden = v == null ? !m.hidden : !v; $('#emoBtn').setAttribute('aria-expanded', String(!m.hidden)); }
function emoteUI() { const on = G.mode === 'mp' && !!MP.net; $('#emoBtn').hidden = !on; if (!on) emoteMenu(false); }
function emoteSend(e) {
  emoteMenu(false);
  if (G.mode !== 'mp' || !MP.net || MP.mySlot < 0) return;
  const g = emoteGate(EMO.log, performance.now() / 1000, SKILLS.social); EMO.log = g.log;
  if (!g.ok) { SFX.err && SFX.err(); return; }
  SFX.tick();
  if (MP.host) emoteHost(MP.mySlot, e); else MP.net.toHost({ t: 'emo', e });
}
// host: same limit per slot (a modified client cannot spam the others), then to every phone as an fx
function emoteHost(slot, e) {
  e = Math.round(+e);
  if (!(e >= 0 && e < SKILLS.social.emotes.length) || slot < 0 || slot > 3 || !MP.slots[slot]) return;
  const g = emoteGate(EMO.host[slot], performance.now() / 1000, SKILLS.social); EMO.host[slot] = g.log;
  if (g.ok) fx({ k: 'emo', s: slot, e });
}
function emoteShow(slot, e) {
  slot = Math.round(+slot); e = Math.round(+e);
  if (!(slot >= 0 && slot < 4) || !SKILLS.social.emotes[e]) return;
  EMO.show[slot] = { s: SKILLS.social.emotes[e], t0: G.t };
}
// over the head of the player's figure (positions rotate in Hybrid), small pixel bubble
function drawEmotes() {
  if (G.mode !== 'mp') return;
  for (let i = 0; i < 4; i++) {
    const m = EMO.show[i]; if (!m) continue;
    const age = G.t - m.t0;
    if (age > SKILLS.social.dur || age < 0) { EMO.show[i] = null; continue; }
    const f = tfig(i >> 1, hyFig(i, MP.rot)), h = f._head; if (!h) continue;
    const w = tw(m.s, 1) + 6, x = clamp(Math.round(h.x - w / 2), 1, W - w - 1), y = Math.round(h.y - h.r - 14 - Math.min(1, age / 0.12) * 2);
    rect(x, y, w, 11, C.ink); rect(x + 1, y + 1, w - 2, 9, i === MP.mySlot ? C.accent : C.bone);
    rect(Math.round(h.x) - 1, y + 11, 3, 1, C.ink); rect(Math.round(h.x), y + 12, 1, 1, C.ink);
    text(m.s, x + w / 2, y + 2, C.ink, 1, 'c', null);
  }
}
function socialWire() {
  $('#emoBtn').addEventListener('click', e => { e.currentTarget.blur(); audioInit(); emoteMenu(); });
  $('#emoMenu').innerHTML = SKILLS.social.emotes.map((s, i) => '<button class="emo" data-e="' + i + '">' + s + '</button>').join('');
  $('#emoMenu').addEventListener('click', e => { const b = e.target.closest('.emo'); if (b) { b.blur(); emoteSend(+b.dataset.e); } });
  $('#mpCardOk').addEventListener('click', () => { SFX.tick(); mpCardHide(); });
  $('#mpCard').addEventListener('click', e => { if (e.target === e.currentTarget) mpCardHide(); });
}
if (typeof document !== 'undefined') socialWire();
