// P5: MP profile validation / wire format (js/profile.js), leaderboard dedupe of met players, emote rate limit (js/social.js).
// Usage: node tests/social.test.js   (exit 1 on any failure)
'use strict';
const P = require('../js/profile.js');
const { SKILLS, ovr, skillsNew } = require('../js/skills.js');
const { emoteGate } = require('../js/social.js');
let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } };

// a regular card survives the round trip through the wire format (JSON like the network)
const sk = { spike: 92, lob: 75, recv: 61, dig: 70, block: 90, serve: 66 };
const card = { id: 'ab12cd34', name: 'Bone Crusher', ovr: 1, sk, badge: { spike: 'hotHand', block: 'wall' }, skin: 'neon', t: 123 };
const w = JSON.parse(JSON.stringify(P.profWire(card)));
ok(!('t' in w) && !('ovr' in w), 'wire format has no timestamp / ovr (receiver recomputes)');
const c = P.profClean(w);
ok(c && c.id === 'ab12cd34' && c.name === 'Bone Crusher' && c.skin === 'neon', 'round trip keeps id, name, skin');
ok(SKILLS.ids.every(id => c.sk[id] === sk[id]), 'round trip keeps skills');
ok(c.badge.spike === 'hotHand' && c.badge.block === 'wall', 'round trip keeps badge perks');
ok(c.ovr === ovr({ sk }), 'OVR recomputed from skills, sent value ignored');

// untrusted input: clamp, sanitise, reject
const bad = P.profClean({ id: 'x1', name: '<img src=x onerror=alert(1)>AAAAAAAAAAAAAAAAAA', sk: { spike: 500, lob: -3, recv: 'abc', dig: 1e9, block: 89.6, serve: null },
  badge: { spike: 'hotHand', lob: 'feather', block: 'notAPerk', serve: 'hotHand', __proto__: { x: 1 } }, skin: '../../evil' });
ok(bad.sk.spike === 99 && bad.sk.lob === 60 && bad.sk.recv === 60 && bad.sk.dig === 99 && bad.sk.block === 90 && bad.sk.serve === 60, 'skills clamped to 60..99, junk -> 60');
ok(bad.badge.spike === 'hotHand', 'known perk of a reached badge kept');
ok(!bad.badge.lob, 'perk of a badge not reached (lob 60) dropped');
ok(!('serve' in bad.badge) && !bad.badge.x, 'perk of another skill / prototype junk dropped');
ok(bad.badge.block === undefined, 'unknown perk id dropped');
ok(bad.name.length <= SKILLS.board.nameMax && !/[<>=()]/.test(bad.name), 'name sanitised and capped (' + bad.name + ')');
ok(bad.skin === '', 'bad skin id dropped');
ok(P.profClean(null) === null && P.profClean('x') === null && P.profClean({ name: 'a' }) === null, 'non-objects / missing id rejected');
ok(P.profClean({ id: 'a'.repeat(33) }) === null && P.profClean({ id: 'a b' }) === null && P.profClean({ id: '' }) === null && P.profClean({ id: 7 }) === null, 'bad ids rejected');
const empty = P.profClean({ id: 'e' });
ok(SKILLS.ids.every(id => empty.sk[id] === SKILLS.min) && empty.ovr === ovr(skillsNew()) && empty.name === 'Player', 'missing data -> 60 profile named Player');

// met players -> board: once per id, again only when changed, never myself; board dedupes by id
const seen = new Map();
ok(P.meetNew(seen, c, 'me') === true, 'new player stored');
ok(P.meetNew(seen, P.profClean(w), 'me') === false, 'same player again (lobby resync) not stored twice');
const c2 = P.profClean(Object.assign({}, w, { sk: Object.assign({}, sk, { lob: 80 }) }));
ok(P.meetNew(seen, c2, 'me') === true, 'changed profile stored again');
ok(P.meetNew(seen, P.profClean({ id: 'me', name: 'Fake' }), 'me') === false, 'own id never stored from a peer');
let L = [];
for (const p of [c, c2, c, empty]) L = P.lbAdd(L, Object.assign({ t: 1 }, p), SKILLS.board.max, SKILLS.board.nameMax);
ok(L.length === 2 && L.filter(x => x.id === 'ab12cd34').length === 1, 'board: one entry per player id');

// emote rate limit: min gap, burst per window, recovers
const cfg = SKILLS.social;
let log = [], r;
r = emoteGate(log, 0, cfg); ok(r.ok, 'first emote passes'); log = r.log;
r = emoteGate(log, cfg.gap * 0.5, cfg); ok(!r.ok, 'too soon blocked'); log = r.log;
let t = 0, sent = 1;
for (let i = 0; i < 20; i++) { t += cfg.gap; r = emoteGate(log, t, cfg); log = r.log; if (r.ok) sent++; }
const maxIn = Math.ceil(20 * cfg.gap / cfg.win + 1) * cfg.burst;
ok(sent <= maxIn && sent >= cfg.burst, 'spam capped by burst/window (sent ' + sent + ', max ' + maxIn + ')');
r = emoteGate(log, t + cfg.win + 0.01, cfg); ok(r.ok, 'free again after the window');
ok(cfg.emotes.length >= 4 && cfg.emotes.length <= 6 && cfg.emotes.every(s => /^[A-Z0-9!?.]{1,6}$/.test(s)), 'emotes: 4-6 short pixel-font words');

console.log(fails ? fails + ' of ' + n + ' FAILED' : 'social: all ' + n + ' checks passed');
process.exit(fails ? 1 : 0);
