'use strict';
// mp: multiplayer (transport, lobby, host match rules, input, state sync)
/* ================= multiplayer: up to 4 phones, 2 vs 2, one phone (the host) runs the match ================= */
// slots: 0 team A back, 1 team A front, 2 team B back, 3 team B front; an empty slot is played by the computer
// world: team A lives on z > 0, team B on z < 0; game logic works in team-local coordinates (lx, lz) and W() maps them
const sgn = t => t === 0 ? 1 : -1;
const TEAMF = [[me, mate], [oA, oB]];
const tfig = (t, r) => TEAMF[t][r];
// player slot of position r (0 back, 1 front); Hybrid rotates the players (MP.rot), the classic mode keeps [0, 0]
const slotOf = (t, r) => hySlot(t, r, MP.rot);
const MIRR = { jump: 1, spike: 1, follow: 1, lob: 1, hold: 1, toss: 1, floatServe: 1, fist: 1, pointFwd: 1 };
const PZ = (f, n) => f.front && MIRR[n] ? n + 'M' : n;
const lane2x = (t, l) => sgn(t) * LX[l];
const MPCODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MP = {
  net: null, host: false, code: '', slots: [null, null, null, null], myId: '', mySlot: -1, team: 0, role: 0,
  st: null, view: null, level: 1, snapT: 0, off: 0, offOk: false, rtt: 0.12, pingT: 0, lastBall: null, pred: { lane: 1, until: 0 },
  hintAtk: null, hy: false, rot: [0, 0], sw: [false, false], fig: 0,
  sg: false, sgOpen: false, sgp: null, sgEnd: 0 // P6 Skill Games (js/skillgames.js)
};

/* ---------- transport: WebRTC via Trystero (signalling over several public Nostr relays), BroadcastChannel for same-device tests (?bc) ---------- */
function loadPeer() {
  if (window.Trystero) return Promise.resolve();
  return new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = 'lib/trystero.min.js';
    s.onload = () => window.Trystero ? ok() : no(new Error('nolib')); s.onerror = () => no(new Error('nolib')); document.head.appendChild(s);
  });
}
const useBC = /[?&]bc\b/.test(location.search);
const LAG = +((location.search.match(/lag=(\d+)/) || [])[1] || 0); // test only: fake network delay in ms
const bcPost = (bc, m) => LAG ? setTimeout(() => { try { bc.postMessage(m); } catch (e) {} }, LAG * (0.8 + Math.random() * 0.4)) : bc.postMessage(m);
const RELAYS = (location.search.match(/[?&]relay=([^&]+)/) || [])[1]; // test only: own relay
const TRCONF = {
  appId: 'volleyskull-knochenhart-v1',
  relayConfig: { urls: RELAYS ? [decodeURIComponent(RELAYS)] : ['nos.lol', 'relay.damus.io', 'relay.primal.net', 'nostr.mom', 'relay.nostr.dev.br', 'nostr.robosats.org', 'cdn.satellite.earth', 'relay.degmods.com'].map(u => 'wss://' + u), warnOnRelayFailure: false },
  // TURN relays for phones on mobile data / strict NATs (Trystero adds its own STUN servers)
  turnConfig: [{ urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' }]
};
// watch the WebRTC links Trystero opens: one appears as soon as another phone is found over the servers
const DIAG = { pcs: 0, state: '', ok: 0 };
const DiagPC = typeof RTCPeerConnection === 'function' ? class extends RTCPeerConnection {
  constructor(c) {
    super(c); DIAG.pcs++; DIAG.state = 'new';
    const upd = () => { DIAG.state = this.connectionState || this.iceConnectionState; if (DIAG.state === 'connected') DIAG.ok++; };
    this.addEventListener('connectionstatechange', upd); this.addEventListener('iceconnectionstatechange', upd);
  }
} : undefined;
if (DiagPC) TRCONF.rtcPolyfill = DiagPC;
const relaysUp = () => { try { return Object.values(Trystero.getRelaySockets()).filter(w => w && w.readyState === 1).length; } catch (e) { return -1; } };
function trRoom(code, onJoinError) {
  const room = Trystero.joinRoom(TRCONF, 'room-' + code, { onJoinError: e => onJoinError && onJoinError(e) });
  const act = room.makeAction('d');
  return { room, send: (d, to) => Promise.resolve(act.send(d, to ? { target: to } : undefined)).catch(() => {}), on: f => { act.onMessage = (d, meta) => f(d, typeof meta === 'string' ? meta : meta && meta.peerId); } };
}
function netCreate(code, h) {
  // h: { open(), conn(id), msg(id, data), gone(id), fail(kind) }
  if (useBC) {
    const bc = new BroadcastChannel('vsk-' + code), peers = new Set();
    bc.onmessage = e => { const m = e.data; if (m.to !== 'H') return; if (!peers.has(m.from)) { peers.add(m.from); h.conn(m.from); } if (m.d && m.d.t === 'bye') { peers.delete(m.from); h.gone(m.from); } else h.msg(m.from, m.d); };
    setTimeout(() => h.open(), 0);
    return { send: (id, d) => bcPost(bc, { to: id, from: 'H', d }), all: d => { for (const id of peers) bcPost(bc, { to: id, from: 'H', d }); }, close() { for (const id of peers) bc.postMessage({ to: id, from: 'H', d: { t: 'bye' } }); bc.close(); } };
  }
  // the host announces itself to everyone who shows up in the room; guests only talk to the host
  const r = trRoom(code), peers = new Set();
  r.room.onPeerJoin = id => r.send({ t: 'host' }, id);
  r.room.onPeerLeave = id => { if (peers.delete(id)) h.gone(id); };
  r.on((d, id) => {
    if (!d || !id) return;
    if (d.t === 'host') return; // someone else hosts this code too
    if (!peers.has(id)) { if (d.t !== 'hi') return; peers.add(id); h.conn(id); }
    if (d.t !== 'hi') h.msg(id, d);
  });
  setTimeout(() => h.open(), 0);
  return {
    send: (id, d) => { if (peers.has(id)) r.send(d, id); },
    all: d => { if (peers.size) r.send(d, [...peers]); },
    close() { try { r.room.leave(); } catch (e) {} }
  };
}
function netJoin(code, h) {
  if (useBC) {
    const id = 'c' + Math.random().toString(36).slice(2, 8), bc = new BroadcastChannel('vsk-' + code);
    bc.onmessage = e => { const m = e.data; if (m.to !== id) return; if (m.d && m.d.t === 'bye') h.gone(); else h.msg(m.d); };
    const net = { id, toHost: d => bcPost(bc, { to: 'H', from: id, d }), close() { bc.postMessage({ to: 'H', from: id, d: { t: 'bye' } }); bc.close(); } };
    setTimeout(() => { net.toHost({ t: 'hi' }); h.open(id); }, 0);
    return net;
  }
  let host = '', done = false, seen = false;
  // a peer was found in the room but WebRTC could not open a direct line to it (strict mobile / guest networks)
  const r = trRoom(code, () => { seen = true; }), id = Trystero.selfId;

  const net = { id, seen: () => seen, toHost: d => { if (host) r.send(d, host); }, close() { done = true; try { r.room.leave(); } catch (e) {} } };
  r.on((d, from) => {
    if (!d || done) return;
    if (!host) { if (d.t !== 'host') return; host = from; net.toHost({ t: 'hi' }); h.open(id); return; }
    if (from === host) h.msg(d);
  });
  r.room.onPeerLeave = p => { if (p === host && !done) h.gone(); };
  return net;
}

/* ---------- lobby ---------- */
function mpMsg(s) { $('#mpMsg').textContent = s; waitFx('#mpMsg', /^Connecting/.test(s)); }
function mpOpen() { mpCardHide(); showOnly('mpOv'); $('#mpStart').hidden = false; $('#mpLobby').hidden = true; mpMsg(''); }
function mpNewCode() { let s = ''; for (let i = 0; i < 4; i++) s += MPCODE[(Math.random() * MPCODE.length) | 0]; return s; }
async function mpCreate() {
  audioInit(); mpMsg('…');
  try { if (!useBC) await loadPeer(); } catch (e) { mpMsg('No connection'); return; }
  if (MP.net) { try { MP.net.close(); } catch (e) {} MP.net = null; }
  const code = mpNewCode();
  MP.host = true; MP.hy = false; MP.sg = false; MP.sgOpen = false; MP.code = code; MP.myId = 'H'; MP.slots = [{ id: 'H', n: 1, sk: mySkin, prof: profIn(myProf()) }, null, null, null]; MP.mySlot = 0; MP.level = G.level;
  MP.net = netCreate(code, {
    open() { mpLobbyShow(); },
    conn(id) {
      if (MP.slots.some(s => s && s.id === id)) return;
      const free = [2, 1, 3, 0].find(i => !MP.slots[i]);
      if (free == null) { MP.net.send(id, { t: 'full' }); return; }
      const used = MP.slots.filter(Boolean).map(s => s.n);
      let n = 1; while (used.includes(n)) n++;
      MP.slots[free] = { id, n };
      mpLobbySync(); sgMpJoin(id);
      if (G.mode === 'mp') { MP.net.send(id, { t: 'start', level: MP.level, hy: MP.hy, sg: MP.sg }); if (MP.lastBall) MP.net.send(id, { t: 'fx', e: MP.lastBall }); }
    },
    msg(id, d) { mpHostMsg(id, d); },
    gone(id) { const i = MP.slots.findIndex(s => s && s.id === id); if (i >= 0) { MP.slots[i] = null; mpLobbySync(); sgMpCheck(); } },
    fail(k) { const n = MP.net; MP.net = null; if (n) n.close(); if (k === 'taken') mpCreate(); else mpMsg('No connection'); }
  });
}
async function mpJoin() {
  audioInit();
  const code = $('#mpCode').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 4) { $('#mpCode').focus(); return; }
  mpMsg('Connecting…');
  try { if (!useBC) await loadPeer(); } catch (e) { mpMsg('No connection'); return; }
  if (MP.net) { try { MP.net.close(); } catch (e) {} MP.net = null; }
  MP.host = false; MP.code = code; MP.mySlot = -1; MP.myId = '';
  // status while searching: how many matchmaking servers this phone reaches, then a precise reason on timeout
  DIAG.pcs = 0; DIAG.state = ''; DIAG.ok = 0;
  const t1 = useBC ? 0 : setInterval(() => {
    if (MP.myId || !MP.net) return clearInterval(t1);
    const n = relaysUp();
    mpMsg('Connecting… ' + (n >= 0 ? n + '/' + TRCONF.relayConfig.urls.length + ' servers' : '') + (DIAG.pcs ? ' · host found, linking (' + DIAG.state + ')' : ' · looking for host'));
  }, 1000);
  const t0 = setTimeout(() => {
    clearInterval(t1); if (MP.myId || !MP.net) return;
    const n = MP.net; MP.net = null; const seen = (n.seen && n.seen()) || DIAG.pcs > 0; n.close();
    mpMsg(!useBC && relaysUp() === 0 ? 'No internet connection to the servers' : seen ? 'Room found, but your networks block the connection. Try Wi-Fi on both phones' : 'Room not found. Is the host app open in front?');
  }, 25000);
  MP.net = netJoin(code, {
    open(id) { clearTimeout(t0); clearInterval(t1); MP.myId = id; MP.net.toHost({ t: 'skin', sk: mySkin }); MP.net.toHost({ t: 'prof', p: myProf() }); },
    msg(d) { mpClientMsg(d); },
    gone() { if (MP.net) { mpLeave(); popup('DISCONNECTED', C.bad); } },
    fail(k) { clearTimeout(t0); clearInterval(t1); const n = MP.net; MP.net = null; if (n) n.close(); mpMsg(k === 'nofound' ? 'Room not found' : 'No connection'); }
  });
}
function mpLeave() {
  const net = MP.net; MP.net = null;
  if (net) try { net.close(); } catch (e) {}
  MP.st = null; MP.view = null; MP.mySlot = -1; MP.myId = '';
  FLIP = false; oA.spring = false; me.band = true; mate.band = oA.band = oB.band = false;
  G.paused = false; menuScene();
}
function mpLobbySync() {
  if (!MP.host) return;
  MP.net.all({ t: 'lobby', slots: MP.slots, code: MP.code, level: MP.level, live: G.mode === 'mp', hy: MP.hy, sg: MP.sg });
  mpLobbyDraw();
}
function mpLobbyShow() { mpMsg(''); showOnly('mpOv'); $('#mpStart').hidden = true; $('#mpLobby').hidden = false; mpLobbyDraw(); }
function mpLobbyDraw() {
  $('#mpRoom').textContent = MP.code;
  MP.mySlot = MP.slots.findIndex(s => s && s.id === MP.myId);
  for (let i = 0; i < 4; i++) {
    const s = MP.slots[i], b = $('#slot' + i);
    // P5: name + OVR per slot (profile from the join), computer players by difficulty
    b.querySelector('b').textContent = !s ? 'CPU' : s.prof ? s.prof.name : s.id === MP.myId ? 'YOU' : 'P' + s.n;
    b.querySelector('em').textContent = 'OVR ' + (!s ? ovr(aiProfile(mpDiff())) : s.prof ? s.prof.ovr + (s.prof.dbg ? ' DBG' : '') : '–');
    b.querySelector('b').style.color = s && s.sk && SKIN[s.sk] && i !== MP.mySlot ? SKIN[s.sk].bone : '';
    b.setAttribute('aria-pressed', String(i === MP.mySlot));
    b.classList.toggle('taken', !!s && i !== MP.mySlot);
  }
  $('#mpGo').hidden = !MP.host;
  const hb = $('#mpHy'); hb.textContent = 'Mode: ' + (MP.hy ? 'Hybrid' : 'Classic'); hb.disabled = !MP.host || G.mode === 'mp'; hb.setAttribute('aria-pressed', String(MP.hy));
  const sb = $('#mpSg'); sb.textContent = 'Skill Games: ' + (MP.sg ? 'On' : 'Off'); sb.disabled = !MP.host || G.mode === 'mp' || !!MP.sgOpen; sb.setAttribute('aria-pressed', String(!!MP.sg));
  $('#mpHyInfo').textContent = [MP.hy ? 'Hybrid: both roles, rotate on side-out, set by lane' : '', MP.sg ? 'Skill Games: all start at 60, spend ' + sgBudget() + ' coins for this match' : ''].filter(Boolean).join(' · ');
  const alone = MP.slots.filter(Boolean).length < 2, waiting = G.mode !== 'mp' && (!MP.host || alone);
  if (!/copied|http/.test($('#mpWait').textContent) || !MP.host) $('#mpWait').textContent = MP.host ? (alone ? 'Waiting for players…' : '') : 'Waiting for the host to start…';
  waitFx('#mpWait', waiting);
}
function inviteURL() {
  const base = /github\.io$/.test(location.hostname) || location.hostname === 'localhost' ? location.origin + location.pathname : 'https://johannesmaletius-lgtm.github.io/Knochenhart/';
  return base + '?raum=' + MP.code + (useBC ? '&bc' : '') + (RELAYS ? '&relay=' + RELAYS : '');
}
async function mpShare() {
  const url = inviteURL();
  try { if (navigator.share) { await navigator.share({ title: 'Volleyskull', text: 'Play Volleyskull with me!', url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); $('#mpWait').textContent = 'Link copied'; }
  catch (e) { $('#mpWait').textContent = url; }
}
function mpPickSlot(i) {
  if (MP.host) { if (MP.slots[i]) return; const me0 = MP.slots[MP.mySlot]; MP.slots[MP.mySlot] = null; MP.slots[i] = me0; mpLobbySync(); }
  else MP.net && MP.net.toHost({ t: 'slot', i });
}
function mpHostMsg(id, d) {
  const i = MP.slots.findIndex(s => s && s.id === id);
  if (d.t === 'slot') { if (i >= 0 && !MP.slots[d.i] && G.mode !== 'mp' && !MP.sgOpen) { MP.slots[d.i] = MP.slots[i]; MP.slots[i] = null; mpLobbySync(); } }
  else if (d.t === 'p') MP.net.send(id, { t: 'q', c: d.c });
  else if (d.t === 'skin' && i >= 0 && SKIN[d.sk]) { MP.slots[i].sk = d.sk; mpLobbySync(); if (G.mode === 'mp') mpRoles(); }
  else if (d.t === 'in' && i >= 0 && G.mode === 'mp') hostInput(i, d.k, d.dx, d.dy, d.ht);
  else if (d.t === 'prof' && i >= 0) mpProfIn(i, d.p);
  else if (d.t === 'emo' && i >= 0 && G.mode === 'mp') emoteHost(i, d.e);
  else if (d.t === 'sgp') sgMpIn(i, d.p);
}
function mpClientMsg(d) {
  if (d.t === 'lobby') { MP.slots = mpProfSlots(d.slots); MP.code = d.code; MP.level = d.level; MP.hy = !!d.hy; MP.sg = !!d.sg; if (G.mode === 'mp') mpRoles(); else if (SG.mp) mpLobbyDraw(); else mpLobbyShow(); }
  else if (d.t === 'full') { mpMsg('Room full'); MP.net.close(); MP.net = null; }
  else if (d.t === 'start') { MP.level = d.level; MP.hy = !!d.hy; MP.sg = !!d.sg; mpEnter(); }
  else if (d.t === 'sgo' || d.t === 'sgr') sgMpMsg(d);
  else if (d.t === 's') mpSnap(d);
  else if (d.t === 'fx') applyFx(d.e);
  else if (d.t === 'q') { const r = (performance.now() - d.c) / 1000; MP.rtt = MP.rtt * 0.7 + r * 0.3; }
  else if (d.t === 'over') mpOverShow(d.score, d.stats);
}

/* ---------- entering a match (all phones) ---------- */
// MP.fig = position I play (0 back, 1 front, rotates in Hybrid); MP.role = my controls (Hybrid: swapped while the front player attacks)
function mpRoleCalc() {
  MP.fig = MP.mySlot >= 0 ? hyFig(MP.mySlot, MP.rot) : 0;
  MP.role = MP.mySlot >= 0 ? hyCtl(MP.mySlot, MP.rot, MP.sw) : 0;
}
function mpRoles() {
  MP.mySlot = MP.slots.findIndex(s => s && s.id === MP.myId);
  MP.team = MP.mySlot >= 0 ? MP.mySlot >> 1 : 0; mpRoleCalc();
  FLIP = MP.team === 1;
  for (let i = 0; i < 4; i++) { const f = tfig(i >> 1, hyFig(i, MP.rot)), sl = MP.slots[i]; f.band = i === MP.mySlot; f.skin = sl && sl.sk && SKIN[sl.sk] ? sl.sk : null; }
  // after a rotation (or a player joining) show again for a moment who is who
  const wk = MP.slots.map(s => s ? s.id : '').join() + MP.rot.join();
  if (G.mode === 'mp' && MP.whoKey !== wk) MP.whoUntil = Math.max(MP.whoUntil || 0, performance.now() + 3000);
  MP.whoKey = wk;
}
function mpEnter() {
  G.mode = 'mp'; G.paused = false; G.ev.length = 0; G.pops.length = 0; G.fade = 1; G.fadeV = -4; G.hype = 0;
  oA.spring = true; MP.rot = [0, 0]; MP.sw = [false, false]; mpRoles();
  MP.view = { hy: MP.hy,  score: [0, 0], server: 0, meter: 0, fire: false, ring: null, inc: null, blk: null, ph: '' };
  mpCardHide(); sgClose(); showOnly(null); setHint('');
  MP.whoUntil = performance.now() + 6000; // names over the skeletons at the start (render.js drawWho)
  try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => {}); } catch (e) {}
}
function mpBegin() {
  if (!MP.host) return;
  MP.level = G.level;
  MP.net.all({ t: 'start', level: MP.level, hy: MP.hy, sg: MP.sg });
  mpEnter();
  MP.st = { score: [0, 0], server: Math.random() < 0.5 ? 0 : 1, meter: [0, 0], fire: [false, false], phase: 'idle', inc: null, atk: null, srv: null,
    hist: [{ L: 0, R: 0, LOB: 0 }, { L: 0, R: 0, LOB: 0 }], lane: [1, 1], arrive: [-9, -9], dash: [false, false], rally: 0,
    wall: [0, 0], stats: [0, 1, 2, 3].map(() => ({ p: 0, b: 0, d: 0, s: 0, f: 0 })),
    hy: MP.hy, rot: [0, 0], sw: [false, false], tch: null, side: null, sgp: MP.sg && MP.sgp ? MP.sgp.slice() : null };
  MP.rot = MP.st.rot; MP.sw = MP.st.sw;
  for (const f of FIGS) f.seq = null;
  mpRally();
}

// the front player's wall bar: good blocking work fills it, a full bar makes the next block a sure point
const WALLMAX = 8;
function mpWall(t, n) {
  const st = MP.st; if (!st || st.wall[t] >= WALLMAX) return;
  st.wall[t] = Math.min(WALLMAX, st.wall[t] + n); MP.snapT = 0;
  if (st.wall[t] >= WALLMAX) S('fire');
}
const stat = (slot, k, n = 1) => { const st = MP.st; if (st && st.stats[slot]) st.stats[slot][k] += n; };

/* ---------- host: effects that every phone plays ---------- */
function fx(e) { applyFx(e); if (MP.host && MP.net) MP.net.all({ t: 'fx', e }); if (e.k === 'ball' || e.k === 'hold') MP.lastBall = e; }
const FXCOL = { bone: C.bone, accent: C.accent, bad: C.bad, fire: C.fire2 };
function applyFx(e) {
  switch (e.k) {
    case 'sfx': if (SFX[e.n]) SFX[e.n](e.a); break;
    case 'sparks': sparks(e.x, e.y, e.z, e.n, e.c && e.c.map(c => C[c] || c)); break;
    case 'dust': dust(e.x, e.z, e.n); break;
    case 'shake': shake(e.v); break;
    case 'net': G.netWob = e.v; break;
    case 'flash': G.flash = e.v; break;
    case 'hype': G.hype = Math.max(G.hype, e.v); break;
    case 'burst': G.fx.push({ x: ball.x, y: ball.y, z: ball.z, t0: G.t, dur: e.big ? 0.32 : 0.2, col: FXCOL[e.c] || C.bone, r1: e.big ? 15 : 8 }); break;
    case 'vib': if (e.team == null || e.team === MP.team) vib(e.ms); break;
    case 'pop': popup(e.s, e.team == null ? C.accent : e.team === MP.team ? C.accent : C.bad); break;
    case 'fade': G.fadeV = e.v; break;
    case 'res': if (MP.team === e.w) SFX.win(); else SFX.lose(); break;
    case 'sweat': sweat(); break;
    case 'hp': hitPop(e.dt, e.q, e.w); break;
    case 'emo': emoteShow(e.s, e.e); break;
    case 'hold': ball.mode = 'held'; ball.holder = FIGS[e.f]; ball.idx = e.i; ball.fire = false; ball.trail.length = 0; break;
    case 'ball':
      ball.p0 = e.p0; ball.v = e.v; ball.t0 = e.t0; ball.T = e.T; ball.mode = 'flight'; ball.holder = null;
      ball.wob = e.wob || 0; ball.wobF = e.wobF || 0; ball.fire = !!e.fire; ball.spinV = e.spin; ball.stop = false; break;
    case 'bstop': ball.stop = true; break;
  }
}
const S = (n, a) => fx({ k: 'sfx', n, a });
function mlaunch(to, T, o = {}) {
  launch(to, T, o);
  fx({ k: 'ball', p0: ball.p0, v: ball.v, t0: ball.t0, T, wob: ball.wob, wobF: ball.wobF, fire: ball.fire, spin: ball.spinV });
}
function mhold(f, i) { fx({ k: 'hold', f: FIGS.indexOf(f), i }); }
function msparks(n, c) { fx({ k: 'sparks', x: ball.x, y: ball.y, z: ball.z, n, c }); }

/* ---------- host: match rules ---------- */
const human = i => !!MP.slots[i];
const grace = i => MP.slots[i] && MP.slots[i].id !== MP.myId ? 0.2 : 0;
const mpDiff = () => [0.2, 0.45, 0.7][MP.level] != null ? [0.2, 0.45, 0.7][MP.level] : 0.45;
/* ---------- Hybrid helpers (rules: js/hybrid.js, numbers: SKILLS.hy) ---------- */
const HY = () => !!(MP.st && MP.st.hy);
// position (0 back, 1 front) that attacks in team t's possession: the front player after it dug the ball itself (Hybrid)
const hitIx = t => MP.st && MP.st.sw && MP.st.sw[t] ? 1 : 0;
// skills per player slot (Classic + Hybrid): MP.slots[i].prof = cleaned join profile (social.js); fallback SKILLS.hy.defLv, computer players by difficulty
const HYDEF = skillsNew(SKILLS.hy.defLv);
// P6 Skill Games: the host-checked budget profile of this match (MP.st.sgp, js/skillgames.js) wins, it never enters the board
function slotProf(i) { const s = MP.slots[i], g = MP.st && MP.st.sgp && MP.st.sgp[i]; return g ? g : s ? (s.prof && s.prof.sk ? s.prof : HYDEF) : aiProfile(mpDiff()); }
// EARLY / LATE on every hit, on every phone (Hybrid only; the classic mode stays as it was)
function mpHitPop(dt, q, w) {
  if (!HY() || (q === 'perfect' && !w)) return;
  fx({ k: 'hp', dt: dt == null ? (Math.random() < 0.5 ? -1 : 1) : dt, q, w });
}
// one contact of slot (team t): a second touch in a row by the same player is a fault, point for the other team
function mpContact(t, slot) {
  const st = MP.st; if (!HY()) return true;
  const r = hyTouch(st.tch, t, slot); st.tch = r.last;
  if (!r.fault) return true;
  st.phase = 'dead'; fx({ k: 'burst', c: 'bad' }); S('err');
  mlaunch({ x: ball.x + rand(-0.5, 0.5), y: 0, z: ball.z + rand(-0.5, 0.5) }, 0.45, { spin: -6 });
  after(0.6, () => mpPoint(1 - t, 'DOUBLE!'));
  return false;
}
// Hybrid: the attack of team t is over (ball went across): positions are back to normal
function hyOver(t) { const st = MP.st; if (st && st.sw) st.sw[t] = false; }
function laneOfX(t, wx) { const lx = sgn(t) * wx; return lx < -0.95 ? 0 : lx > 0.95 ? 2 : 1; }
function goBack(t) { const b = tfig(t, 0); b.tx = lane2x(t, MP.st.lane[t]); b.tz = sgn(t) * DZ; b.sz = 6; setBase(b, 'ready'); }
function mpRally() {
  const st = MP.st; if (!st || G.mode !== 'mp') return;
  G.ev.length = 0; st.inc = st.atk = st.srv = null; st.rally = 0; st.dash = [false, false];
  st.sw[0] = st.sw[1] = false;
  if (st.hy) {
    // Hybrid: side-out -> the team that won the serve rotates (back <-> front), every phone redraws who is where
    st.tch = null;
    if (st.side != null) { const w = st.side; st.side = null; st.rot = MP.rot = hyRotate(st.rot, 1 - w, w); mpRoles(); after(0.5, () => fx({ k: 'pop', s: 'ROTATE', team: w })); }
  }
  for (let t = 0; t < 2; t++) {
    const b = tfig(t, 0), f = tfig(t, 1), s = sgn(t);
    st.lane[t] = 1; place(b, 0, s * DZ); snapPose(b, 'ready'); b.sx = 15; b.sz = 7;
    place(f, s * MSET.x, s * 0.6); snapPose(f, 'setReady'); f.sx = f.sz = 7;
  }
  const t = st.server, b = tfig(t, 0), s = sgn(t);
  place(b, s * 0.3, s * 9.4); snapPose(b, PZ(b, 'hold')); setBase(b, PZ(b, 'hold'));
  mhold(b, 6);
  st.phase = 'serveReady';
  fx({ k: 'fade', v: -5 });
  after(0.4, () => S('whistle'));
  if (!human(slotOf(t, 0))) after(1.3, () => mpToss(t));
}
function mpToss(t) {
  const st = MP.st; if (!st || st.phase !== 'serveReady' || st.server !== t) return;
  const b = tfig(t, 0), s = sgn(t);
  st.phase = 'serveToss';
  setPose(b, PZ(b, 'toss'), 0.7); setBase(b, PZ(b, 'toss')); S('toss');
  mlaunch({ x: b.x + 0.05 * s, y: 1.6, z: b.z - 0.6 * s }, 1.3, { spin: 2 });
  const tp = G.t + 0.65;
  const sl0 = slotOf(t, 0);
  st.srv = { t, tp, hit: false, lock: 0, jumpServe: human(sl0) || Math.random() < 0.45 };
  at(tp - 0.42, () => { if (st.srv && !st.srv.hit && st.srv.jumpServe) { jump(b, 4.0); setPose(b, PZ(b, 'jump'), 0, 18); b.tz = b.z - 0.45 * s; b.sz = 1.3; } });
  const sl = slotOf(t, 0);
  at(tp + 0.3 + grace(sl), () => mpServeHit(t, 0, null));
  if (!human(sl)) { const d = mpDiff(); at(tp + rand(-0.13, 0.13) * (1.2 - d), () => mpServeHit(t, pick([-1, 0, 1]), G.t)); }
}
function mpServeHit(t, h, ht) {
  const st = MP.st, Sv = st && st.srv; if (!Sv || Sv.hit || Sv.t !== t) return;
  const auto = ht == null, dt = auto ? 1 : ht - Sv.tp;
  if (!auto && dt < -0.32) { fx({ k: 'burst', c: 'bad' }); S('err'); return; }
  Sv.hit = true;
  const win = BAL.serveWin[MP.level] || BAL.serveWin[1];
  const adt = Math.abs(dt), q = auto ? 'weak' : adt < win[0] ? 'perfect' : adt < win[1] ? 'good' : 'weak';
  if (!st.ace || st.ace.t !== t) st.ace = { t, n: 0 };
  if (q === 'perfect') { mpMeter(t, 1); fx({ k: 'burst', c: 'accent', big: true }); S('perfect', 1); }
  mpContact(t, slotOf(t, 0)); mpHitPop(auto ? 1 : dt, q);
  const b = tfig(t, 0), r = 1 - t;
  setPose(b, PZ(b, b.air ? 'spike' : 'floatServe'), b.air ? 0.15 : 0.3, 40); setBase(b, PZ(b, 'follow')); S('serve'); fx({ k: 'shake', v: q === 'perfect' ? 2 : 1 });
  msparks(q === 'perfect' ? 8 : 3);
  const back = () => goBack(t);
  if (b.air) b.onLand = back; else after(0.3, back);
  st.phase = 'served';
  const lane = 1 - h; // the server's left is the receiver's right
  const T = { perfect: 0.95, good: 1.05, weak: 1.2 }[q], md = { perfect: 0.32, good: 0.18, weak: 0.06 }[q];
  const o = q === 'perfect' && Math.random() < 0.5 ? { wob: rand(0.8, 1.2) * (Math.random() < 0.5 ? -1 : 1), wobF: Math.PI * 2 * rand(1, 1.5), spin: 1 } : { spin: 14 };
  // faults: weak or missed serves (and the computer now and then) go into the net or long
  const fault = human(slotOf(t, 0)) ? (auto ? 0.3 : q === 'weak' ? 0.12 : 0.015) : ([0.1, 0.07, 0.045][MP.level] || 0.07);
  if (Math.random() < fault) {
    if (Math.random() < 0.55) { mpIntoNet(t, lane2x(r, lane) * 0.5, () => mpPoint(r, 'NET')); after(0.5, () => react(b, 'headHands', 1, 12)); }
    else mpOutBall(r, Math.random() < 0.6 ? st.lane[r] : lane, T * 1.05, 0.3, null);
    return;
  }
  if (q !== 'weak' && Math.random() < 0.065) {
    // net cord: clips the tape, drops short
    mlaunch({ x: lane2x(r, lane) * 0.7, y: 2.47, z: sgn(r) * 0.05 }, 0.7, { spin: 4 });
    after(0.7, () => {
      fx({ k: 'net', v: 0.6 }); S('tick'); msparks(4, ['bone']);
      mlaunch({ x: lane2x(r, lane) * 0.85, y: 0.45, z: sgn(r) * 3.0 }, 0.72, { spin: 2 });
      mpIncoming(r, 'tip', lane, 0.72, 0.05, 'good').by = slotOf(t, 0);
    });
    return;
  }
  mlaunch({ x: lane2x(r, lane), y: 0.85, z: sgn(r) * (DZ + 0.1) }, T, o);
  mpIncoming(r, 'serve', lane, T, md, q, 0.06 * st.ace.n).by = slotOf(t, 0);
}
// the ball smacks into the net and drops on the hitter's side
function mpIntoNet(t, x, cb) {
  const s = sgn(t);
  mlaunch({ x, y: rand(1.6, 2.1), z: s * 0.12 }, 0.3, { spin: 20 });
  MP.st.phase = 'dead';
  after(0.3, () => { fx({ k: 'net', v: 1 }); S('block'); fx({ k: 'shake', v: 2 }); mlaunch({ x: x + rand(-0.4, 0.4), y: 0, z: s * rand(0.5, 1.1) }, 0.45, { spin: -6 }); });
  after(1.0, cb);
}
// a ball flying out: the defender has to get out of its way (red X)
function mpOutBall(d, lane, T, md, by) {
  mlaunch({ x: lane2x(d, lane), y: 1.35, z: sgn(d) * (DZ + 0.1) }, T, { spin: 18 });
  const inc = mpIncoming(d, 'out', lane, T, md, 'good');
  inc.by = by;
  return inc;
}
function mpMeter(t, n) {
  const st = MP.st; if (st.fire[t]) return;
  st.meter[t] = clamp(st.meter[t] + n, 0, BAL.meterMax);
  if (st.meter[t] >= BAL.meterMax) { st.fire[t] = true; S('fire'); }
}
function mpIncoming(d, type, lane, T, md, q, extra) {
  const st = MP.st, s = sgn(d);
  const lz = type === 'tip' ? 3.0 : type === 'block' ? 3.3 : DZ + 0.1;
  const inc = st.inc = { d, type, lane, x: s * LX[lane] * (type === 'tip' ? 0.85 : 1), z: s * lz, tArr: G.t + T, tMark: G.t + md, done: false, q, ai: null };
  st.phase = 'defend'; st.dash[d] = false; MP.snapT = 0; hyOver(d);
  const b = tfig(d, 0), sl = slotOf(d, 0);
  if (!b.air && !b.lock && type !== 'block' && type !== 'out') { jump(b, 1.5); setPose(b, 'ready', 0.2, 20); }
  // a remote defender gets grace s more: meanwhile the ball waits at the defender instead of flying on behind him (off the screen)
  if (human(sl)) { if (grace(sl) && type !== 'out') fx({ k: 'bstop' }); after(T + grace(sl), mpResolve); return inc; }
  // computer defender: decide, then move there like a person would
  const dif = mpDiff();
  if (type === 'out') {
    const cur = st.lane[d], dodge = Math.random() < 0.8 + 0.15 * dif;
    const goal = dodge ? (cur === lane ? (lane === 1 ? pick([0, 2]) : 1) : cur) : lane;
    after(clamp(md + rand(0.1, 0.22), 0, T - 0.15), () => { if (!inc.done && goal !== st.lane[d]) mpLane(d, goal - st.lane[d], G.t, true); });
    after(T, mpResolve);
    return inc;
  }
  let p = type === 'serve' ? { perfect: 0.84, good: 0.92, weak: 0.97 }[q] * (0.82 + 0.3 * dif) : type === 'spike' ? { perfect: 0.3, good: 0.5, weak: 0.72 }[q]
    : type === 'tip' ? 0.6 : type === 'free' ? 0.88 : type === 'fire' ? 0.06 : 0.6;
  if (type !== 'serve') p *= 0.75 + 0.5 * dif;
  p = clamp(p + (extra || 0), 0.03, 0.95);
  const ok = Math.random() < p;
  inc.ai = ok;
  const goal = ok ? lane : (lane === st.lane[d] ? pick([0, 1, 2].filter(l => l !== lane)) : st.lane[d]);
  after(clamp(md + rand(0.08, 0.2), 0, T - 0.2), () => {
    if (inc.done) return;
    if (goal !== st.lane[d]) mpLane(d, goal - st.lane[d], G.t, true);
    if (type === 'tip' && ok) mpDash(d, G.t);
  });
  after(T, mpResolve);
  return inc;
}
function mpLane(t, dl, ht, abs) {
  const st = MP.st, b = tfig(t, hitIx(t));
  const nl = clamp(st.lane[t] + dl, 0, 2); if (nl === st.lane[t]) return;
  st.lane[t] = nl; b.tx = lane2x(t, nl); b.sx = 15; b.moveDir = Math.sign(dl) * sgn(t);
  st.arrive[t] = (ht == null ? G.t : ht) + 0.12 * Math.abs(dl);
  fx({ k: 'dust', x: b.x, z: b.z, n: 2 }); S('step');
  if (!b.lock && !b.air) setPose(b, b.moveDir < 0 ? 'reachL' : 'reachR', 0.1, 26);
}
function mpDash(t, ht) {
  const st = MP.st, inc = st.inc; if (!inc || inc.done || inc.d !== t || st.dash[t]) return;
  const b = tfig(t, 0); st.dash[t] = true; b.sz = 13;
  if (inc.type === 'tip') { b.tz = inc.z + 0.3 * sgn(t); b.tx = inc.x; } else b.tz = sgn(t) * 2.6;
  st.arrive[t] = Math.max(st.arrive[t], (ht == null ? G.t : ht) + Math.abs(b.tz - b.z) / b.sz); S('step');
}
function mpResolve() {
  const st = MP.st, inc = st && st.inc; if (!inc || inc.done) return;
  inc.done = true; st.inc = null;
  const d = inc.d, b = tfig(d, 0);
  let ok, late;
  if (inc.type === 'out') {
    st.phase = 'dead';
    if (st.lane[d] === inc.lane) {
      setPose(b, 'reflex', 0.5, 40); S('dig'); msparks(5, ['bone']);
      mlaunch({ x: ball.x + pick([-1, 1]) * rand(4, 6), y: 0, z: sgn(d) * rand(8, 11) }, 0.7, { spin: 20 });
      after(0.35, () => react(b, 'headHands', 1, 12));
      if (inc.by != null) stat(inc.by, 'p');
      after(0.75, () => mpPoint(1 - d, 'TOUCHED'));
    } else {
      seq(b, [['letGo', 0.7, 22]]);
      mlaunch({ x: ball.x + rand(-0.3, 0.3), y: 0, z: sgn(d) * (DZ + 3.6) }, 0.32, { spin: 18 });
      after(0.25, () => S('bounce'));
      after(0.7, () => mpPoint(d, 'OUT'));
    }
    return;
  }
  if (inc.blkSave && inc.blkSave()) { mpDig(d, inc, false, tfig(d, 1)); return; }
  if (inc.ai != null) { ok = inc.ai; late = ok && Math.random() < (inc.type === 'serve' ? 0.08 : 0.25); }
  else {
    if (inc.type === 'tip') {
      // short ball: already standing under it counts, a dash reaches it from the next lane too
      const under = Math.abs(b.z - inc.z) < BAL.tipNear && Math.abs(b.x - inc.x) < BAL.tipNear;
      ok = under || (st.dash[d] && Math.abs(st.lane[d] - inc.lane) <= BAL.tipLane);
      late = !under && st.arrive[d] > inc.tArr + BAL.tipLate;
    } else {
      ok = st.lane[d] === inc.lane && !st.dash[d];
      late = st.arrive[d] > inc.tArr - 0.08;
    }
  }
  if (inc.type === 'fire' && inc.ai == null) late = true;
  const diveOk = lerp(BAL.diveOk[0], BAL.diveOk[1], mpDiff());
  if (ok && (!late || Math.random() < diveOk)) { mpDig(d, inc, late, b); return; }
  st.phase = 'dead';
  if (inc.type === 'serve' && st.ace) st.ace.n++;
  const side = inc.x < b.x - 0.05 ? -1 : inc.x > b.x + 0.05 ? 1 : (b.moveDir || 1);
  if (ok) {
    defAnim(b, inc.type === 'tip' ? 'missTip' : 'shank', side); S('dig');
    mlaunch({ x: ball.x + side * rand(4, 6), y: 0, z: sgn(d) * rand(7, 11) }, 0.9, { spin: 18 });
    after(0.7, () => mpPoint(1 - d, 'LATE!'));
    return;
  }
  defAnim(b, Math.abs(b.x - inc.x) < 2.6 ? (inc.type === 'tip' ? 'missTip' : 'miss') : 'lunge', side);
  if (inc.by != null) stat(inc.by, 'p');
  after(0.45, () => mpPoint(1 - d, inc.type === 'block' ? 'BLOCKED!' : inc.type === 'tip' ? 'TIP!' : inc.type === 'serve' ? 'ACE!' : 'POINT!'));
}
function mpDig(d, inc, late, digger) {
  const st = MP.st, s = sgn(d), dg = digger === tfig(d, 0) ? 0 : 1;
  if (!mpContact(d, slotOf(d, dg))) return;
  // the digger attacks, the other one sets (blocker digs -> back sets, blocker attacks), in both modes
  const pl = hyPlan(dg);
  st.sw[d] = pl.hit === 1;
  if (pl.hit === 1) st.lane[d] = laneOfX(d, digger.x);
  const b = tfig(d, pl.hit), set = tfig(d, pl.set);
  if (late) mpHitPop(1, 'weak');
  const off = inc.x - digger.x;
  if (inc.type === 'serve' && st.ace) st.ace.n = 0;
  let kind;
  if (inc.type === 'tip') { kind = 'pancake'; mpMeter(d, 1); }
  else if (late) { kind = 'dive'; mpMeter(d, 1); }
  else if (inc.type === 'block') kind = 'reflex';
  else if (inc.type === 'free') kind = 'free';
  else if (Math.abs(off) > 0.42) kind = 'reach';
  else kind = inc.type === 'spike' || inc.type === 'fire' ? 'low' : 'clean';
  const dur = defAnim(digger, kind, kind === 'reach' ? Math.sign(off) : (b.moveDir || 1));
  stat(slotOf(d, dg), 'd');
  if (dg === 1) mpWall(d, 1);
  if (inc.type === 'tip' && digger === b) st.lane[d] = inc.lane;
  S('dig'); fx({ k: 'dust', x: ball.x, z: ball.z, n: 6 }); msparks(kind === 'dive' || kind === 'pancake' ? 7 : 4, ['bone']); fx({ k: 'vib', ms: 12, team: d });
  st.rally++; if (st.rally >= 4) { fx({ k: 'hype', v: 0.5 + st.rally * 0.05 }); if (st.rally % 2 === 0) S('crowd'); }
  if (st.rally >= 6) fx({ k: 'sweat' });
  if (kind === 'dive' && dg === 0 && inc.type !== 'block' && Math.random() < 0.16) { mpOverpass(d); return; }
  const wild = kind === 'dive' || kind === 'pancake' ? 1 : kind === 'reach' || kind === 'reflex' ? 0.45 : 0.12;
  const lx = clamp(MSET.x + rand(-1.3, 1.3) * wild, -2.6, 3.2), lz = clamp(MSET.z + rand(-0.2, 1.2) * wild, 0.5, 2.2);
  mlaunch({ x: s * lx, y: 2.55 + rand(0, 0.7) * wild, z: s * (lz + 0.12) }, 1.0, { spin: 4 });
  // the digger might be the setter (deep block); then the setter just plays it back
  set.tx = s * lx; set.tz = s * lz; set.sx = set.sz = pl.set === 0 ? SKILLS.hy.setSpd : 6;
  after(0.6, () => setPose(set, 'setReady', 0.5));
  st.phase = 'pass';
  after(Math.max(0.4, Math.min(0.72, dur)), () => { b.lock = false; b.tx = lane2x(d, st.lane[d]); b.sx = 15; b.tz = s * APZ; b.sz = 7; setBase(b, 'ready'); });
  // the setter: tap when the ring closes for a clean set; it never plays the ball over the net (no dump)
  const tset = G.t + 1.0, ssl = slotOf(d, pl.set);
  st.setq = { t: d, ts: tset };
  MP.snapT = 0;
  if (human(ssl)) at(tset + 0.18 + grace(ssl), () => mpSetGo(d, 'weak', 'high', 1));
  else {
    const dif = mpDiff(), r = Math.random();
    // Hybrid computer setter: no quick set; it sets the lane its hitter stands in (sometimes the next one)
    at(tset, () => mpSetGo(d, Math.random() < 0.3 + 0.5 * dif ? 'perfect' : 'good', r < 0.3 + 0.1 * dif && !st.hy ? 'quick' : 'high',
      st.hy ? hyBotSetLane(Math.random, dif, st.lane[d]) : null));
  }
}
function mpOverpass(d) {
  const st = MP.st, o = 1 - d, so = sgn(o), f = tfig(o, 1), x = rand(-1.4, 1.4);
  st.phase = 'over';
  mlaunch({ x: so * x, y: 2.9, z: so * 0.8 }, 1.0, { spin: 6 });
  f.tx = so * x; f.tz = so * 0.6; f.sx = f.sz = 7;
  const ov = st.ovp = { t: o, d, tc: G.t + 1.0 }; MP.snapT = 0;
  after(0.25, () => setPose(tfig(d, 1), 'headHands', 0.6, 14));
  after(0.45, () => { const b = tfig(d, 0); b.lock = false; goBack(d); });
  after(0.58, () => { jump(f, 3.8); setPose(f, PZ(f, 'jump'), 0, 18); });
  const sl = slotOf(o, 1);
  if (human(sl)) at(ov.tc + 0.15 + grace(sl), () => mpSmash(o, null, 'weak'));
  else at(ov.tc, () => { const r = Math.random(); mpSmash(o, null, r < 0.3 + 0.4 * mpDiff() ? 'perfect' : r < 0.8 ? 'good' : 'weak'); });
}
function mpSmash(t, ht, q0) {
  const st = MP.st, ov = st.ovp; if (!ov || ov.t !== t) return;
  let q = q0;
  if (!q) { const dt = (ht == null ? G.t : ht) - ov.tc; if (dt < -0.3) { S('err'); return; } q = Math.abs(dt) < 0.08 ? 'perfect' : Math.abs(dt) < 0.18 ? 'good' : 'weak'; }
  st.ovp = null;
  const f = tfig(t, 1), d = ov.d;
  if (!mpContact(t, slotOf(t, 1))) return;
  mpHitPop(q0 ? null : (ht == null ? G.t : ht) - ov.tc, q);
  setPose(f, PZ(f, 'spike'), 0.2, 40); setBase(f, 'ready'); S('spike'); fx({ k: 'shake', v: q === 'perfect' ? 4 : 2 }); msparks(q === 'perfect' ? 9 : 5, ['bone', 'bad']);
  if (q === 'perfect') fx({ k: 'burst', c: 'accent', big: true });
  const lane = (Math.random() * 3) | 0, T = { perfect: 0.5, good: 0.6, weak: 0.75 }[q], md = { perfect: 0.04, good: 0.07, weak: 0.12 }[q];
  mlaunch({ x: lane2x(d, lane), y: 0.85, z: sgn(d) * (DZ + 0.1) }, T, { spin: 22 });
  mpIncoming(d, 'spike', lane, T, md, q).by = slotOf(t, 1);
}
// lane: Hybrid set lane (team-local 0..2), null = the hitter's lane (classic)
function mpSetGo(d, q, mode, lane, dt) {
  const st = MP.st; if (!st || !st.setq || st.setq.t !== d) return;
  st.setq = null;
  const ss = slotOf(d, 1 - hitIx(d));
  if (!mpContact(d, ss)) return;
  mpHitPop(dt, q);
  if (q === 'perfect') stat(ss, 's');
  mpSet(d, q, mode === 'quick', st.hy && lane != null ? lane : null);
}
function mpSetInput(t, ht, mode, lane) {
  const st = MP.st, sq = st.setq; if (!sq || sq.t !== t) return;
  const dt = ht - sq.ts;
  if (dt < -0.35) { S('err'); return; }
  const adt = Math.abs(dt), q = adt < 0.08 ? 'perfect' : adt < 0.18 ? 'good' : 'weak';
  mpSetGo(t, q, mode, lane, dt);
}
function mpDumpSave(t) {
  const st = MP.st, D0 = st.dump; if (!D0 || D0.o !== t || D0.save) return;
  if (D0.until && G.t > D0.until) { S('err'); return; }
  D0.save = true;
  const blk = tfig(t, 1), inc = st.inc;
  if (inc && inc.d === t) { blk.tx = inc.x; blk.tz = inc.z - sgn(t) * 0.3; blk.sx = blk.sz = 9; }
  S('step');
}
function mpSet(a, sq, quick, lane) {
  const st = MP.st; if (!st || G.mode !== 'mp') return;
  const hx = hitIx(a), o = 1 - a, s = sgn(a), b = tfig(a, hx), set = tfig(a, 1 - hx), blk = tfig(o, 1), def = tfig(o, 0), dif = mpDiff();
  sq = sq || 'good';
  setPose(set, 'set', 0.3); S('set');
  // quick set: low and fast, the block has almost no time to read it
  if (quick) { S('set'); msparks(4, ['bone']); }
  if (sq === 'perfect') { jump(set, 2.0); fx({ k: 'burst', c: 'accent', big: true }); S('perfect', 1); msparks(5, ['accent', 'fire1']); }
  else if (sq === 'weak') fx({ k: 'burst', c: 'bad' });
  const sl = lane != null ? lane : st.lane[a];
  const Cp = { x: s * (LX[sl] + 0.12), y: CY, z: s * CZ };
  const TS = quick ? 0.62 : 0.9;
  mlaunch(Cp, TS, { spin: quick ? 8 : 3 });
  const tc = G.t + TS;
  // a clean set gives the hitter a wider timing window
  const A = st.atk = { a, tc, C: Cp, hit: false, block: null, lockT: tc - 0.2, defRead: null, win: { perfect: 1.4, good: 1, weak: 0.8 }[sq] * (quick ? 0.85 : 1), tb: tc - 0.3, bj: false, bq: null, quick: !!quick,
    sl, hs: slotOf(a, hx), miss: null };
  st.phase = 'attack'; MP.snapT = 0;
  blk.tx = clamp(Cp.x, -2.8, 2.8); blk.tz = sgn(o) * 0.5; blk.sx = blk.sz = 7; setBase(blk, 'blockReady'); setPose(blk, 'blockReady');
  const bsl = slotOf(o, 1), asl = A.hs, dsl = slotOf(o, 0);
  if (st.hy) {
    // Hybrid lanes: a set two lanes away from the hitter is a fault right away, the ball just drops (nobody can get there)
    if (hyLaneResult(sl, st.lane[a]) === 'floor') { A.miss = 'floor'; A.hit = true; at(tc, () => mpMissLane(A)); return; }
    // one lane off: the hitter has to run into the set lane; checked when the approach starts (SKILLS.hy.laneLock before the hit)
    if (!human(asl) && st.lane[a] !== sl) after(rand(SKILLS.hy.botReact[0], SKILLS.hy.botReact[1]), () => {
      if (st.atk === A && hyBotFollow(Math.random, dif)) mpLane(a, sl - st.lane[a], G.t, true);
    });
    at(tc - SKILLS.hy.laneLock, () => {
      if (st.atk !== A || A.hit) return;
      const res = hyLaneResult(sl, st.lane[a]); if (res === 'hit') return;
      A.miss = res; A.hit = true; MP.snapT = 0;
      at(tc, () => mpMissLane(A));
    });
  }
  if (!human(bsl)) {
    // computer blocker: leans on what this hitter likes, sometimes shows one side and switches
    const h = st.hist[a], tot = h.L + h.R + h.LOB + 1;
    const w = { L: 1 + 1.4 * h.L / tot, R: 1 + 1.4 * h.R / tot, W: 0.35 + 0.5 * dif + 0.3 * (h.L + h.R) / tot, D: 0.15 + 0.3 * dif + 2 * h.LOB / tot };
    const k = quick ? pick(['L', 'R', 'W']) : AI.weighted(w);
    const v = k === 'L' ? -s : k === 'R' ? s : k; // attacker's left in world x
    const lead = quick ? 0.4 : lerp(0.72, 0.4, dif);
    if ((k === 'L' || k === 'R') && Math.random() < 0.3 * dif) {
      at(tc - 0.78, () => mpBlock(A, -v));
      at(tc - Math.max(0.36, lead * 0.8), () => mpBlock(A, v));
    } else at(tc - lead, () => mpBlock(A, v));
  }
  if (!human(dsl)) at(tc - 0.3, () => {
    // computer defender covers the side the block leaves open
    if (st.atk !== A || typeof A.block !== 'number' || Math.random() > 0.4 + 0.5 * dif) return;
    const goal = laneOfX(o, A.C.x - A.block * 2.4);
    A.defRead = goal;
    if (goal !== st.lane[o]) mpLane(o, goal - st.lane[o], G.t);
  });
  at(tc - 0.8, () => { b.tz = s * 3.3; b.sz = Math.max(3, Math.abs(b.z - s * 3.3) / 0.4); b.lock = false; setBase(b, 'stand'); });
  at(tc - 0.43, () => { if (A.miss) return; jump(b, 4.25); setPose(b, PZ(b, 'jump'), 0, 18); setBase(b, PZ(b, 'jump')); b.tz = s * 2.9; b.sz = 1.2; });
  // blocker jump: the front player taps when the ring closes; the computer has its own timing
  if (human(bsl)) at(A.tb + 0.2, () => { if (st.atk === A && A.block != null && A.block !== 'D') mpBlockJump(A, null, 'weak'); });
  else at(A.tb + rand(-0.06, 0.06), () => {
    if (st.atk !== A || A.block == null || A.block === 'D') return;
    const r = Math.random() + (quick ? 0.3 : 0);
    mpBlockJump(A, null, r < 0.2 + 0.4 * dif ? 'perfect' : r < 0.75 ? 'good' : 'weak');
  });
  if (!human(asl)) at(tc + rand(-0.12, 0.12) * (1.25 - dif), () => {
    if (st.atk !== A || A.hit) return;
    // computer hitter reads the block (better on higher levels)
    let dir;
    const bl = A.block, read = Math.random() < 0.35 + 0.55 * dif;
    if (typeof bl === 'number' && read) dir = bl * s < 0 ? 'R' : 'L';
    else if (bl === 'W' && read) dir = Math.random() < 0.6 ? 'LOB' : pick(['L', 'R']);
    else dir = Math.random() < 0.15 ? 'LOB' : pick(['L', 'R']);
    mpAttack(a, dir, G.t);
  });
  at(tc + 0.2 + grace(asl), () => mpLateHit(A));
}
function mpBlock(A, v, ht) {
  const st = MP.st; if (st.atk !== A || A.hit || A.bj || (ht != null ? ht : G.t) > A.lockT) return;
  if (A.block === v) return;
  const prev = A.block;
  A.block = v; S('tick'); MP.snapT = 0;
  const blk = tfig(1 - A.a, 1), so = sgn(1 - A.a);
  if (v === 'D') { blk.tz = so * 2.4; blk.sz = 5; setBase(blk, 'ready'); setPose(blk, 'ready'); return; }
  blk.tz = so * 0.5; blk.sx = 8; blk.sz = 6;
  const nx = clamp(A.C.x + (v === 'W' ? 0 : v * 0.45), -3, 3);
  const side = nx < blk.x - 0.1 ? -1 : nx > blk.x + 0.1 ? 1 : 0;
  blk.tx = nx;
  const p = v === 'W' ? 'blockW' : v < 0 ? 'blockL' : 'blockR';
  setBase(blk, p);
  // quick side shuffle when the block moves over
  if (side && prev !== 'D') seq(blk, [['shuffle' + (side < 0 ? 'L' : 'R'), 0.1, 30], [p, 0.05, 26]]);
  else setPose(blk, p, 0, 22);
}
// the jump: on time it seals the net, too early and the ball goes over the hands
function mpBlockJump(A, ht, q0) {
  const st = MP.st; if (st.atk !== A || A.hit || A.bj) return;
  if (A.block === 'D') return;
  if (A.block == null) mpBlock(A, 'W', ht);
  let q = q0;
  if (!q) { const dt = (ht == null ? G.t : ht) - A.tb; q = dt < -0.3 ? 'miss' : Math.abs(dt) < 0.07 ? 'perfect' : Math.abs(dt) < 0.16 ? 'good' : 'weak'; }
  A.bj = true; A.bq = q; MP.snapT = 0;
  if (q !== 'miss') mpHitPop(q0 ? null : (ht == null ? G.t : ht) - A.tb, q);
  const blk = tfig(1 - A.a, 1);
  blk.seq = null; blk.lock = false;
  const p = A.block === 'W' ? 'blockW' : A.block < 0 ? 'blockL' : 'blockR';
  jump(blk, q === 'perfect' ? 3.7 : 3.4); setPose(blk, p, 0, 30); setBase(blk, p); S('toss');
  if (q === 'perfect') { fx({ k: 'burst', c: 'accent', big: true }); S('perfect', 1); mpWall(1 - A.a, 1); }
  else if (q === 'miss') fx({ k: 'burst', c: 'bad' });
  blk.onLand = () => { setBase(blk, 'ready'); fx({ k: 'dust', x: blk.x, z: blk.z, n: 4 }); };
}
function mpLateHit(A) {
  const st = MP.st; if (!st || st.atk !== A || A.hit) return;
  A.hit = true; st.phase = 'over';
  const a = A.a, o = 1 - a, b = tfig(a, hitIx(a));
  hyOver(a); if (!mpContact(a, A.hs)) return;
  fx({ k: 'burst', c: 'bad' }); S('err'); mpHitPop(1, 'weak');
  setPose(b, PZ(b, 'lob'), 0.25); setBase(b, PZ(b, 'follow'));
  b.onLand = () => goBack(a);
  const lane = (Math.random() * 3) | 0;
  mlaunch({ x: lane2x(o, lane), y: 0.85, z: sgn(o) * (DZ + 0.1) }, 1.3, { spin: 3 });
  mpIncoming(o, 'free', lane, 1.3, 0.15, 'weak');
}
// Hybrid: the hitter approached in the wrong lane. Next lane: it can only bump the ball over (free ball, "Danke-Ball");
// two lanes off: the set drops to the floor, point for the other team
function mpMissLane(A) {
  const st = MP.st; if (!st || st.atk !== A || st.phase !== 'attack') return;
  const a = A.a, o = 1 - a, s = sgn(a), b = tfig(a, hitIx(a));
  hyOver(a); st.phase = 'over'; MP.snapT = 0;
  const side = A.C.x < b.x ? -1 : 1;
  if (A.miss === 'floor') {
    st.phase = 'dead';
    fx({ k: 'pop', s: 'BAD SET', team: o });
    mlaunch({ x: A.C.x + rand(-0.3, 0.3), y: 0, z: s * (CZ + rand(-0.3, 0.3)) }, 0.42, { spin: -4 });
    after(0.42, () => { S('bounce'); fx({ k: 'dust', x: ball.x, z: ball.z, n: 5 }); });
    after(0.3, () => defAnim(b, 'lunge', side));
    after(0.9, () => mpPoint(o, 'BAD SET'));
    return;
  }
  if (!mpContact(a, A.hs)) return;
  defAnim(b, 'reach', side); S('dig'); msparks(4, ['bone']); mpHitPop(1, 'weak', 'FREE BALL');
  st.rally++;
  const lane = (Math.random() * 3) | 0, T = SKILLS.hy.dankeT;
  mlaunch({ x: lane2x(o, lane), y: 0.85, z: sgn(o) * (DZ + 0.1) }, T, { spin: 3 });
  after(0.5, () => { b.lock = false; goBack(a); });
  mpIncoming(o, 'free', lane, T, 0.15, 'weak');
}
function mpAttack(a, dir, ht, aim) {
  const st = MP.st, A = st.atk; if (!A || A.a !== a || A.hit) return;
  const dt = ht - A.tc;
  if (dt < -0.3) { fx({ k: 'burst', c: 'bad' }); S('err'); return; }
  if (dt > 0.2) return;
  A.hit = true;
  const wn = A.win || 1, adt = Math.abs(dt);
  let q = adt < 0.075 * wn ? 'perfect' : adt < 0.17 * wn ? 'good' : 'weak';
  // human hitters (Classic + Hybrid, P5 profiles): timing through the Spike / Lob skill (P3 curves), net faults by the skill curve
  const hk = human(A.hs) ? { p: slotProf(A.hs), err: timingErr(adt, [0.075 * wn, 0.17 * wn, BAL.atkWin[2]]) } : null;
  if (hk) { hk.sk = hk.p.sk[dir === 'LOB' ? 'lob' : 'spike']; hk.bonus = dir === 'LOB' ? 0 : perkV(hk.p, 'spike', 'heavyArm', 0); q = hitTier(hk.sk, hk.err, hk.bonus); }
  const b = tfig(a, hitIx(a));
  hyOver(a); if (!mpContact(a, A.hs)) return;
  mpHitPop(dt, q);
  const h = st.hist[a]; for (const k in h) h[k] *= 0.8; h[dir] += 1;
  if (q === 'perfect') { mpMeter(a, 1); fx({ k: 'burst', c: 'accent', big: true }); S('perfect', 1); } else if (q === 'good') fx({ k: 'burst', c: 'bone' });
  const o = 1 - a, s = sgn(a);
  setPose(b, PZ(b, dir === 'LOB' ? 'lob' : 'spike'), 0.14, 40); setBase(b, PZ(b, 'follow'));
  b.onLand = () => { setBase(b, 'ready'); setPose(b, 'ready'); if (!st.inc || st.inc.d !== a) goBack(a); else { b.tz = s * 3.3; b.sz = 4; } };
  st.phase = 'over';
  st.rally++;
  const wx = dir === 'L' ? -s : s;
  if (st.fire[a] && dir !== 'LOB' && q !== 'weak') { mpFire(A, wx); return; }
  if (dir === 'LOB') { mpLob(A, q, st.hy ? aim || 0 : 0); return; }
  const blk = tfig(o, 1);
  const inLine = A.block === 'W' || A.block === wx;
  const blocked = inLine && A.bj && A.bq !== 'miss';
  if (blocked && st.wall[o] >= WALLMAX) {
    st.wall[o] = 0;
    fx({ k: 'flash', v: 0.6 }); fx({ k: 'shake', v: 6 }); S('fire');
    mpStuff(A, wx, 2);
    return;
  }
  if (blocked) {
    const m = SKILLS.blockQ[A.bq]; // block jump tier: tool / touch / stuff bonus
    const r = Math.random(), tool = BAL.tool[q] * m[0], touch = BAL.touch * m[1];
    if (r < tool) mpBlockOut(A, wx); else if (r < tool + touch) mpTouch(A, wx); else mpStuff(A, wx, m[2]);
    return;
  }
  // the ball got past the block: the blocker shrugs
  if (A.bj || inLine) after(0.15, () => setPose(blk, 'shrug', 0.5, 16));
  // weak human hits and computer hitters sometimes miss: into the net or long
  const errP = human(A.hs) ? (q === 'weak' ? 0.22 : 0) : ([0.09, 0.06, 0.04][MP.level] || 0.06);
  const flt = hk ? hitFault(hk.sk, hk.err, hk.bonus, q === 'weak' ? BAL.spikeOut : 0, Math.random) : null;
  if (hk ? flt : Math.random() < errP) {
    S('spike'); fx({ k: 'shake', v: 1 });
    if (hk ? flt === 'net' : Math.random() < 0.5) { mpIntoNet(a, A.C.x + wx * 0.6, () => mpPoint(o, 'NET')); after(0.7, () => react(b, 'headHands', 1, 12)); }
    else mpOutBall(o, Math.random() < 0.6 ? st.lane[o] : (Math.random() * 3) | 0, 0.85, 0.08, null);
    return;
  }
  S('spike'); fx({ k: 'shake', v: q === 'perfect' ? 3 : 2 }); fx({ k: 'vib', ms: 18, team: a }); msparks(q === 'perfect' ? 10 : 5);
  const tx = clamp(A.C.x + wx * rand(2.0, 2.8), -4.1, 4.1), lane = laneOfX(o, tx);
  const T = { perfect: 0.58, good: 0.68, weak: 0.8 }[q], md = { perfect: 0.14, good: 0.08, weak: 0.03 }[q] - (A.block === 'D' ? 0.03 : 0);
  mlaunch({ x: lane2x(o, lane), y: 0.85, z: sgn(o) * (DZ + 0.1) }, T, { spin: 22 });
  mpIncoming(o, 'spike', lane, T, Math.max(0, md), q, (A.block === 'D' ? 0.15 : 0) + (A.defRead === lane ? 0.2 : 0)).by = A.hs;
}
function mpFire(A, wx) {
  const st = MP.st, a = A.a, o = 1 - a;
  st.fire[a] = false; st.meter[a] = 0;
  S('fire'); S('spike'); fx({ k: 'shake', v: 6 }); fx({ k: 'flash', v: 1 }); fx({ k: 'vib', ms: 40 });
  msparks(16, ['fire1', 'fire2', 'fire3']);
  const lane = laneOfX(o, clamp(A.C.x + wx * 2.6, -4.1, 4.1));
  mlaunch({ x: lane2x(o, lane), y: 0.85, z: sgn(o) * (DZ + 0.1) }, 0.42, { fire: true, spin: 30 });
  mpIncoming(o, 'fire', lane, 0.42, 0.3, 'perfect');
  after(0.2, () => setPose(tfig(o, 1), 'sad', 1.2));
}
// aim (Hybrid): -1 / 1 = short lob to the hitter's left / right (P3 Lob aim), 0 = random lane
function mpLob(A, q, aim) {
  const st = MP.st, a = A.a, o = 1 - a, so = sgn(o);
  S('lob');
  const lane = aim ? hyLobLane(aim, Math.random) : (Math.random() * 3) | 0, T = 1.05;
  if (A.block === 'D') {
    // the blocker dropped back for exactly this
    const blk = tfig(o, 1), lx = LX[lane] * 0.85;
    mlaunch({ x: so * lx, y: 0.6, z: so * 3.0 }, T, { spin: 3 });
    blk.tx = so * lx; blk.tz = so * 2.9; blk.sx = blk.sz = 7;
    if (Math.random() < BAL.lobD) { after(T, () => mpDig(o, { type: 'free', x: so * lx, lane }, false, blk)); return; }
    after(T * 0.8, () => defAnim(blk, 'missTip', 1));
    after(T + 0.25, () => mpPoint(a, 'LOB POINT!'));
    return;
  }
  mlaunch({ x: so * LX[lane] * 0.85, y: 0.45, z: so * 3.0 }, T, { spin: 3 });
  const inc = mpIncoming(o, 'tip', lane, T, A.block === 'W' ? 0.4 : A.block != null ? 0.22 : 0.15, q, aim && Math.abs(lane - st.lane[o]) === 2 ? -SKILLS.hy.lobFar : 0);
  inc.by = A.hs;
  const D0 = st.dump = { o, save: false, until: G.t + 0.5 };
  inc.blkSave = () => D0.save;
  if (!human(slotOf(o, 1)) && Math.random() < 0.12 + 0.2 * mpDiff()) after(rand(0.2, 0.4), () => mpDumpSave(o));
  after(T + 0.3, () => { if (st.dump === D0) st.dump = null; });
}
function mpHands(A, wx, cb) {
  const blk = tfig(1 - A.a, 1);
  mpContact(1 - A.a, slotOf(1 - A.a, 1));
  mlaunch({ x: blk.x + wx * 0.35, y: blk.y + 2.3, z: sgn(1 - A.a) * 0.2 }, 0.1, { spin: 20 });
  S('spike');
  after(0.1, cb);
}
function mpBlockOut(A, wx) {
  mpHands(A, wx, () => {
    S('touch'); S('block'); fx({ k: 'shake', v: 3 }); fx({ k: 'net', v: 0.7 }); fx({ k: 'burst', c: 'accent', big: true }); msparks(8, ['bone', 'accent']);
    const o = 1 - A.a, blk = tfig(o, 1); seq(blk, [['blockOw', 0.35, 30], ['ready', 0.25, 12]]);
    mlaunch({ x: wx * rand(5.6, 6.8), y: 0, z: sgn(o) * rand(5, 9) }, 0.8, { spin: 25 });
    after(0.45, () => defAnim(tfig(o, 0), 'lunge', wx));
    after(0.95, () => { stat(A.hs, 'p'); mpPoint(A.a, 'BLOCK OUT!'); });
  });
}
function mpTouch(A, wx) {
  mpHands(A, wx, () => {
    const o = 1 - A.a; S('touch'); fx({ k: 'net', v: 0.5 }); fx({ k: 'shake', v: 2 }); fx({ k: 'burst', c: 'bone' }); msparks(6, ['bone', 'accent']);
    seq(tfig(o, 1), [['blockOw', 0.18, 34], [wx < 0 ? 'blockL' : 'blockR', 0.15, 20]]);
    mpWall(o, 1);
    const lane = (Math.random() * 3) | 0;
    mlaunch({ x: lane2x(o, lane), y: 0.85, z: sgn(o) * (DZ + 0.1) }, 1.0, { spin: 14 });
    mpIncoming(o, 'free', lane, 1.0, 0.12, 'good');
  });
}
function mpStuff(A, wx, bonus) {
  mpHands(A, wx, () => {
    const st = MP.st, a = A.a, sa = sgn(a), blk = tfig(1 - a, 1);
    S('block'); fx({ k: 'shake', v: 4 }); fx({ k: 'net', v: 1 }); fx({ k: 'vib', ms: 30 }); msparks(8, ['bone', 'bad']);
    seq(blk, [['slam', 0.16, 42], ['blockW', 0.12, 20]]);
    // the attacking team recycles a stuffed ball by the blocker's Block skill (SKILLS.recycle; computer blockers by difficulty)
    const pStuff = 1 - recycleP(slotProf(slotOf(1 - a, 1)));
    if (Math.random() < pStuff + (bonus || 0)) {
      // monster block: the blocker flexes on the way down
      fx({ k: 'burst', c: 'bad', big: true }); fx({ k: 'flash', v: 0.25 }); msparks(10, ['bone', 'bad', 'accent']);
      blk.onLand = () => { seq(blk, [['flex', 0.7, 14]]); fx({ k: 'dust', x: blk.x, z: blk.z, n: 6 }); };
      const sx = ball.x + rand(-0.6, 0.6);
      mlaunch({ x: sx, y: 0, z: sa * rand(0.6, 1.6) }, 0.3, { spin: -20 });
      st.phase = 'dead';
      const set = tfig(a, 1);
      after(0.12, () => defAnim(set, Math.abs(set.x - sx) < 1.6 ? 'miss' : 'lunge', sx < set.x ? -1 : 1));
      stat(slotOf(1 - a, 1), 'b'); stat(slotOf(1 - a, 1), 'p');
      if ((bonus || 0) < 2) mpWall(1 - a, 2);
      after(0.75, () => mpPoint(1 - a, 'BLOCKED!'));
      return;
    }
    mpWall(1 - a, 1);
    // it bounces back: the hitter covers, and the setter can jump in (tap on the ring)
    const rl = (Math.random() * 3) | 0, T = lerp(BAL.reboundT[0], BAL.reboundT[1], mpDiff());
    mlaunch({ x: lane2x(a, rl), y: 0.8, z: sa * 3.3 }, T, { spin: -14 });
    const inc = mpIncoming(a, 'block', rl, T, 0, 'good');
    const cov = st.cover = { t: a, tc: G.t + T * 0.55, ok: false };
    inc.blkSave = () => cov.ok;
    if (!human(slotOf(a, 1)) && Math.random() < 0.25 + 0.3 * mpDiff()) at(cov.tc, () => mpCover(a, cov.tc));
    after(T + 0.3, () => { if (st.cover === cov) st.cover = null; });
  });
}
function mpCover(t, ht) {
  const st = MP.st, cov = st.cover; if (!cov || cov.t !== t || cov.ok) return;
  if (Math.abs(ht - cov.tc) > 0.17) { S('err'); return; }
  cov.ok = true; st.cover = null;
  mpHitPop(ht - cov.tc, Math.abs(ht - cov.tc) < 0.07 ? 'perfect' : 'good');
  const set = tfig(t, 1), inc = st.inc;
  if (inc && inc.d === t) { set.tx = inc.x; set.tz = inc.z - sgn(t) * 0.4; set.sx = set.sz = 10; }
  setPose(set, 'reflex', 0.3, 30); S('step'); fx({ k: 'burst', c: 'accent' });
}
function mpPoint(w, txt) {
  const st = MP.st; if (!st || st.phase === 'point' || G.mode !== 'mp') return;
  G.ev.length = 0; st.phase = 'point'; st.inc = st.atk = st.srv = st.setq = st.dump = st.cover = st.ovp = null;
  st.score[w]++; st.why = w + txt;
  const l = 1 - w, long = st.rally >= 4;
  fx({ k: 'hype', v: long ? 2.4 : 1.4 });
  S('crowd'); fx({ k: 'res', w });
  mpMeter(w, long ? 2 : 1);
  if (!st.fire[l]) st.meter[l] = Math.max(0, st.meter[l] - 3);
  celebrate(tfig(w, 0), true, long); after(0.12, () => celebrate(tfig(w, 1), true, long));
  celebrate(tfig(l, 0), false, long); react(tfig(l, 1), pick(['sad', 'headHands']), 1.1, 10);
  if (st.hy && w !== st.server) st.side = w;
  st.server = w;
  const [x, y] = st.score;
  if ((x >= 15 || y >= 15) && Math.abs(x - y) >= 2) { after(1.8, mpOver); return; }
  if (Math.max(x, y) >= 14 && x !== y) after(1.4, () => fx({ k: 'pop', s: 'MATCH POINT', team: x > y ? 0 : 1 }));
  after(1.15, () => fx({ k: 'fade', v: 6 }));
  after(1.35, mpRally);
}
function mpOver() {
  const sc = MP.st.score.slice(), stats = MP.st.stats;
  MP.net.all({ t: 'over', score: sc, stats });
  mpOverShow(sc, stats);
}
function mpOverShow(sc, stats) {
  G.mode = 'mpOver';
  const mine = sc[MP.team], theirs = sc[1 - MP.team], win = mine > theirs;
  SFX.match(win);
  $('#ovTitle').textContent = win ? 'Victory!' : 'Defeat';
  $('#ovTitle').className = win ? 'win' : 'lose';
  $('#ovScore').textContent = mine + ' : ' + theirs;
  const my = stats && MP.mySlot >= 0 ? stats[MP.mySlot] : null;
  const rows = !my ? [] : MP.hy ? [['Points', my.p], ['Digs', my.d], ['Block points', my.b], ['Perfect sets', my.s]] : MP.role === 1 ? [['Block points', my.b], ['Saves', my.d], ['Perfect sets', my.s]] : [['Points', my.p], ['Digs', my.d]];
  $('#ovStats').innerHTML = rows.map(r => '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>').join('');
  showCoinWin(win && MP.mySlot >= 0, MP.mySlot >= 0 ? mine : -1);
  updOverMeta();
  if (win) confetti();
  const b = tfig(MP.team, 0);
  if (win) { setBase(b, 'cheer'); setPose(b, 'cheer', 0); G.hype = 4; } else { setBase(b, 'sad'); setPose(b, 'sad', 0); }
  $('#againBtn').hidden = !MP.host;
  showOnly('over');
}

/* ---------- input: every phone sends swipes and taps, the host decides ---------- */
function hostInput(slot, k, dx, dy, ht) {
  const st = MP.st; if (!st) return;
  if (k === 'pause') { mpSetPause(!!dx); return; }
  if (st.paused) return;
  // r = controls of this slot: classic = lobby position; Hybrid = rotated position, swapped while the front player attacks
  const t = slot >> 1, r = hyCtl(slot, MP.rot, st.sw), ph = st.phase, ax = Math.abs(dx || 0), ay = Math.abs(dy || 0);
  ht = ht == null ? G.t : Math.min(ht, G.t);
  if (r === 0) {
    if (ph === 'serveReady' && st.server === t) { mpToss(t); return; }
    if (ph === 'serveToss' && st.srv && st.srv.t === t) { mpServeHit(t, k === 'tap' ? 0 : ax > ay * 0.5 ? Math.sign(dx) : 0, ht); return; }
    if (k !== 'swipe') return;
    if (ph === 'attack' && st.atk && st.atk.a === t && !st.atk.hit) {
      if (st.hy) {
        // Hybrid: sideways before the approach = run into another lane; then spike left / right, up = lob (diagonal = aimed lob)
        if (ht < st.atk.tc - SKILLS.hy.laneLock && ax >= ay * 0.8) { mpLane(t, dx < 0 ? -1 : 1, ht); return; }
        const h = hyAttackDir(dx, dy, BAL.lobTilt);
        mpAttack(t, h.dir, ht, h.aim); return;
      }
      const dir = dy < 0 && ay > ax * 1.1 ? 'LOB' : dx < 0 ? 'L' : dx > 0 ? 'R' : pick(['L', 'R']);
      mpAttack(t, dir, ht); return;
    }
    if ((ph === 'serveReady' || ph === 'serveToss') && st.server === t) return;
    if (ph === 'point' || ph === 'dead') return;
    if (ax >= ay * 0.8) mpLane(t, dx < 0 ? -1 : 1, ht);
    else if (dy < 0 && ph === 'defend') mpDash(t, ht);
  } else {
    // setter: tap on the ring = set; the setter can not play the ball over the net
    if (st.setq && st.setq.t === t) {
      // Hybrid: the swipe picks the lane of the set (left = left, up / diagonal up-left = middle ball, right = right / back set)
      if (st.hy) { mpSetInput(t, ht, 'high', hySetLane(k, dx, dy)); return; }
      // classic: sideways or up = quick set (middle ball), tap / down = high set
      mpSetInput(t, ht, k !== 'swipe' ? 'high' : ax > ay || dy < 0 ? 'quick' : 'high'); return;
    }
    // the other team lobbed: swipe down to turn and grab it
    if (st.dump && st.dump.o === t && k === 'swipe' && dy > 0 && ay > ax) { mpDumpSave(t); return; }
    // own hitter got blocked: tap on the ring to cover the rebound
    if (st.cover && st.cover.t === t && k === 'tap') { mpCover(t, ht); return; }
    // the other side's dig came over the net: tap on the ring to smash it
    if (st.ovp && st.ovp.t === t && k === 'tap') { mpSmash(t, ht); return; }
    if (ph === 'attack' && st.atk && st.atk.a === 1 - t) {
      // blocker: sideways = that side of the hitter, up = wide, down = drop back, tap = jump
      if (k === 'tap') { mpBlockJump(st.atk, ht); return; }
      const v = ay > ax * 1.1 ? (dy < 0 ? 'W' : 'D') : (dx < 0 ? -sgn(t) : sgn(t));
      mpBlock(st.atk, v, ht);
    }
  }
}
function mpSwipe(dx, dy) {
  if (MP.mySlot < 0) return;
  const v = MP.view, ax = Math.abs(dx), ay = Math.abs(dy);
  // predict my own lane move so it feels instant
  let lane = false;
  if (MP.role === 0 && v && ax >= ay * 0.8 && !v.ring && v.ph !== 'serveReady' && v.ph !== 'point' && v.ph !== 'dead') {
    lane = true;
    if (!MP.host) {
      const b = tfig(MP.team, MP.sw[MP.team] ? 1 : 0), nl = clamp(MP.pred.lane + (dx < 0 ? -1 : 1), 0, 2);
      if (nl !== MP.pred.lane) { MP.pred.lane = nl; MP.pred.until = performance.now() + 450; b.tx = lane2x(MP.team, nl); SFX.step(); }
    }
  }
  mpSend('swipe', dx, dy);
  return lane ? 'lane' : undefined;
}
function mpSend(k, dx, dy) {
  if (MP.host) hostInput(MP.mySlot, k, dx, dy, G.t);
  else if (MP.net) MP.net.toHost({ t: 'in', k, dx, dy, ht: G.t });
}

/* ---------- state sync: host sends snapshots, phones draw them ---------- */
function mpSetPause(v) {
  const st = MP.st; if (!st || st.paused === v) return;
  st.paused = v; MP.snapT = 0;
  if (MP.view) MP.view.paused = v;
  mpShowPause(v);
}
function mpShowPause(v) {
  G.paused = v;
  $('#pauseOv').hidden = !v;
  if (v) SFX.tick();
}
function mpPause(v) {
  if (MP.host) mpSetPause(v);
  else if (MP.net) MP.net.toHost({ t: 'in', k: 'pause', dx: v ? 1 : 0 });
}
function mpSnapOut() {
  const st = MP.st; if (!st) return null;
  const f = FIGS.map(g => [+g.x.toFixed(3), +g.y.toFixed(3), +g.z.toFixed(3), g.tgt, g.rate, +g.lean.toFixed(2), g.lock ? 1 : 0]);
  const A = st.atk, I = st.inc, V = st.srv;
  const Q = st.setq;
  const CV = st.cover, OV = st.ovp;
  return { t: 's', ov: OV ? [OV.t, OV.tc] : 0, T: G.t, ph: st.phase, pz: st.paused ? 1 : 0, sq: Q ? [Q.t, Q.ts] : 0, w: st.wall, cv: CV ? [CV.t, CV.tc] : 0, sc: st.score, sv: st.server, m: st.meter, fi: st.fire, ln: st.lane, f,
    a: A ? [A.a, A.tc, A.hit ? 1 : 0, A.block, A.C.x, A.tb, A.bj ? 1 : 0] : 0, i: I ? [I.x, I.z, I.tMark, I.d, I.type === 'out' ? 1 : 0] : 0, v: V ? [V.t, V.tp, V.hit ? 1 : 0] : 0,
    sw: st.sw, ...(st.hy ? { hy: 1, ro: st.rot } : {}) };
}
function mpSnap(d) {
  const now = performance.now() / 1000;
  const off = d.T + MP.rtt / 2 - now;
  if (!MP.offOk || Math.abs(off - MP.off) > 0.3) { MP.off = off; MP.offOk = true; } else MP.off += (off - MP.off) * 0.1;
  MP.snap = d;
  for (let i = 0; i < 4; i++) {
    const g = FIGS[i], s = d.f[i];
    g.nx = s[0]; g.ny = s[1]; g.nz = s[2]; g.lean = s[5]; g.lock = !!s[6];
    if (g.tgt !== s[3]) { g.tgt = s[3]; g.rate = s[4]; }
    if (g.nx0 == null) { g.x = g.nx; g.y = g.ny; g.z = g.nz; g.nx0 = 1; }
  }
  if (performance.now() > MP.pred.until) MP.pred.lane = d.ln[MP.team];
  mpViewFrom(d);
}
// what this phone draws: my team's score first, ring only for me, marker, block on the net
function mpViewFrom(d) {
  const v = MP.view; if (!v) return;
  // Hybrid: positions rotate (redraw skins / my figure); both modes: controls swap while the front player attacks
  if (!MP.host) {
    if (d.hy && (d.ro[0] !== MP.rot[0] || d.ro[1] !== MP.rot[1])) { MP.rot = d.ro.slice(); mpRoles(); }
    if (d.sw) MP.sw = [!!d.sw[0], !!d.sw[1]];
  }
  mpRoleCalc();
  const T = MP.team;
  v.score = [d.sc[T], d.sc[1 - T]]; v.server = d.sv === T ? 0 : 1; v.meter = d.m[T]; v.fire = d.fi[T]; v.ph = d.ph;
  v.ring = null;
  if (MP.role === 0 && d.a && d.a[0] === T && !d.a[2]) v.ring = d.a[1];
  if (MP.role === 0 && d.v && d.v[0] === T && !d.v[2] && d.ph === 'serveToss') v.ring = d.v[1];
  // front player: ring for the set, ring for the block jump
  if (MP.role === 1 && d.sq && d.sq[0] === T) v.ring = d.sq[1];
  if (MP.role === 1 && d.cv && d.cv[0] === T) v.ring = d.cv[1];
  if (d.w) { v.wall = d.w[T]; tfig(0, 1).glow = d.w[0] >= WALLMAX; tfig(1, 1).glow = d.w[1] >= WALLMAX; }
  if (MP.role === 1 && d.a && d.a[0] !== T && !d.a[2] && !d.a[6] && d.a[3] !== 'D') v.ring = d.a[5];
  if (!!d.pz !== !!v.paused) { v.paused = !!d.pz; if (!MP.host) mpShowPause(v.paused); }
  if (MP.role === 1 && d.ov && d.ov[0] === T) v.ring = d.ov[1];
  v.inc = d.i ? { x: d.i[0], z: d.i[1], tMark: d.i[2], done: false, type: d.i[4] ? 'out' : '' } : null;
  v.blk = d.a && d.a[3] != null && d.a[3] !== 'D' && !d.a[2] ? { cx: d.a[4], v: d.a[3], mine: d.a[0] === T } : null;
  // gesture hints, first few times only
  const atkKey = d.a ? d.a[1] : null;
  if (atkKey !== MP.hintAtk) {
    MP.hintAtk = atkKey;
    if (d.a && !d.a[2]) setHint(MP.role === 1 && d.a[0] !== T ? 'block' : MP.role === 0 && d.a[0] === T ? (d.hy ? 'hyatk' : 'attack') : '');
  }
  const sqKey = d.sq ? d.sq[1] : null;
  if (sqKey !== MP.hintSet) { MP.hintSet = sqKey; if (d.sq && MP.role === 1 && d.sq[0] === T) setHint(d.hy ? 'hyset' : 'set'); }
}
function mpUpdate(dt) {
  if (G.fadeV) { G.fade = clamp(G.fade + G.fadeV * dt, 0, 1); if (G.fade <= 0 || G.fade >= 1) G.fadeV = 0; }
  G.stop = 0; G.slow = 0;
  const frozen = MP.view && MP.view.paused;
  if (MP.host) {
    if (!frozen) {
      G.t += dt;
      runEv();
      for (const f of FIGS) updFig(f, dt);
    }
    MP.snapT -= dt;
    if (MP.snapT <= 0 && MP.net) { MP.snapT = 0.05; const s = mpSnapOut(); if (s) { MP.net.all(s); mpViewFrom(s); } }
  } else if (frozen) {
    MP.offOk = false; // resync the clock on resume
  } else {
    G.t = performance.now() / 1000 + MP.off;
    if (MP.net && performance.now() > MP.pingT) { MP.pingT = performance.now() + 2000; MP.net.toHost({ t: 'p', c: performance.now() }); }
    const k = Math.min(1, dt * 16);
    for (let i = 0; i < 4; i++) {
      const f = FIGS[i]; if (f.nx == null) continue;
      const own = MP.role === 0 && MP.mySlot >= 0 && f === tfig(MP.team, MP.sw[MP.team] ? 1 : 0) && performance.now() < MP.pred.until;
      const px = f.x, wasAir = f.y > 0.03;
      f.x += ((own ? f.tx : f.nx) - f.x) * (own ? Math.min(1, dt * 22) : k);
      f.z += (f.nz - f.z) * k; f.y += (f.ny - f.y) * Math.min(1, dt * 24);
      f.air = f.y > 0.03;
      f.moving = Math.abs(f.x - px) > dt * 0.4;
      if (f.moving && !f.air) f.ph += dt * 15;
      if (wasAir && !f.air) dust(f.x, f.z, 3);
      const tp = POSES[f.tgt]; if (tp) { const kk = Math.min(1, dt * (f.rate || 14)); for (let j = 0; j < 26; j++) f.pose[j] += (tp[j] - f.pose[j]) * kk; }
    }
  }
  if (frozen) return;
  updBall(dt);
  updParts(dt);
  updCam(dt);
  G.shake = Math.max(0, G.shake - dt * 16);
  G.flash = Math.max(0, G.flash - dt * 3);
  G.netWob = Math.max(0, G.netWob - dt * 2.2);
  G.hype = Math.max(0, G.hype - dt);
  for (let i = G.fx.length - 1; i >= 0; i--) if (G.t - G.fx[i].t0 > G.fx[i].dur) G.fx.splice(i, 1);
}

/* ---------- UI wiring ---------- */
$('#mpBtn').addEventListener('click', mpOpen);
$('#mpCreate').addEventListener('click', mpCreate);
$('#mpJoin').addEventListener('click', mpJoin);
$('#mpCode').addEventListener('keydown', e => { if (e.key === 'Enter') mpJoin(); });
$('#mpBack').addEventListener('click', () => { if (MP.net) { MP.net.close(); MP.net = null; } menuScene(); });
$('#mpLeave').addEventListener('click', mpLeave);
$('#mpGo').addEventListener('click', mpGoReq);
$('#mpShare').addEventListener('click', mpShare);
$('#mpHy').addEventListener('click', () => { if (!MP.host || G.mode === 'mp') return; MP.hy = !MP.hy; mpLobbySync(); });
$('#mpSg').addEventListener('click', () => { if (!MP.host || G.mode === 'mp' || MP.sgOpen) return; MP.sg = !MP.sg; SFX.tick(); mpLobbySync(); });
// tap on a player = his card (radar + badges), on a free slot = move there
for (let i = 0; i < 4; i++) $('#slot' + i).addEventListener('click', () => { if (!(MP.slots[i] && mpCardShow(i))) mpPickSlot(i); });

