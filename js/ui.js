'use strict';
// ui: menu demo, game lifecycle, input, UI wiring
/* ---------------- menu demo ---------------- */
function menuScene() {
  me.skin = mySkin; mate.skin = oA.skin = oB.skin = null; mate.glow = oB.glow = false;
  G.mode = 'menu'; G.paused = false; G.ev.length = 0; G.pops.length = 0; G.fade = 0; G.fadeV = 0;
  resetCourt();
  me.lane = 1; place(me, 0, DZ); snapPose(me, 'ready'); setBase(me, 'ready');
  ball.x = 0; ball.y = 0.8; ball.z = DZ - 0.05; ball.mode = 'flight';
  launch({ x: 0, y: 0.8, z: DZ - 0.05 }, 0.01);
  demoBump();
  showOnly('menu');
}
function demoBump() {
  if (G.mode !== 'menu') return;
  setPose(me, 'dig', 0.28, 30);
  const T = rand(1.05, 1.3);
  launch({ x: me.x + rand(-0.12, 0.12), y: 0.8, z: DZ - 0.05 }, T, { spin: 4 });
  after(T, demoBump);
}

/* ---------------- game lifecycle ---------------- */
function startGame() {
  audioInit();
  G.mode = 'play'; G.paused = false; G.score = [0, 0]; G.server = 1; G.meter = 0; G.combo = 0; G.fire = false; G.streak = 0; G.aceRun = 0; G.lastAim = null;
  G.hist = { L: 0, R: 0, LOB: 0 }; G.stats = newStats(); AI.start(); G.pops.length = 0; G.ev.length = 0; G.fade = 1;
  showOnly(null);
  try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => {}); } catch (e) {}
  setHint('');
  startRally();
}
function gameOver() {
  G.mode = 'over';
  const win = G.score[0] > G.score[1];
  SFX.match(win);
  const rec = store.get('rec', { 0: [0, 0], 1: [0, 0], 2: [0, 0] });
  rec[G.level] = rec[G.level] || [0, 0]; rec[G.level][win ? 0 : 1]++;
  store.set('rec', rec);
  $('#ovTitle').textContent = win ? 'Victory!' : 'Defeat';
  $('#ovTitle').className = win ? 'win' : 'lose';
  $('#ovScore').textContent = G.score[0] + ' : ' + G.score[1];
  const s = G.stats;
  const rows = [['Perfect', s.perfect], ['Rally', s.maxRally], ['Aces', s.aces]];
  $('#ovStats').innerHTML = rows.map(r => '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>').join('');
  showCoinWin(win);
  updOverMeta();
  if (win) { setPose(me, 'cheer', 0); setBase(me, 'cheer'); G.hype = 4; } else { setBase(me, 'sad'); setPose(me, 'sad', 0); }
  showOnly('over');
}
function togglePause(force) {
  if (G.mode === 'mp') { mpPause(force != null ? force : !(MP.view && MP.view.paused)); return; }
  if (G.mode !== 'play') return;
  G.paused = force != null ? force : !G.paused;
  $('#pauseOv').hidden = !G.paused;
  if (G.paused) $('#resumeBtn').focus();
}
function showOnly(id) {
  if (id === 'over' && !MP.net) $('#againBtn').hidden = false;
  for (const k of ['menu', 'how', 'over', 'pauseOv', 'mpOv', 'shop', 'skillOv']) $('#' + k).hidden = k !== id;
  $('#pauseBtn').hidden = G.mode !== 'play' && G.mode !== 'mp';
  if (id === 'menu') { updRecord(); updCoins(); updMenuMeta(); }
  if (id !== 'over') $('#ovCoins').hidden = true;
}
function updRecord() {
  const rec = store.get('rec', null);
  const r = rec && rec[G.level];
  const w = r ? r[0] : 0, l = r ? r[1] : 0;
  $('#stW').textContent = w; $('#stL').textContent = l;
  $('#stR').textContent = w + l ? Math.round(w / (w + l) * 100) + '%' : '–';
}

/* ---------------- input ---------------- */
function onSwipe(dx, dy) {
  if (G.mode === 'mp') return G.paused ? undefined : mpSwipe(dx, dy);
  if (G.mode !== 'play' || G.paused) return;
  const ax = Math.abs(dx), ay = Math.abs(dy), ph = G.phase;
  if (ph === 'serveReady') { toss(); return; }
  if (ph === 'serveToss') {
    // swipe down = Float serve (Serve 75), tilt aims it
    if (dy > 0 && ay > ax && unlocked(PROFILE, 'float')) { serveHit(ax > ay * BAL.lobTilt ? Math.sign(dx) : 0, false, true); return; }
    serveHit(ax > ay * 0.5 ? Math.sign(dx) : 0, false); return;
  }
  if (ph === 'attack') {
    let dir, aim = 0;
    // up = lob; tilted up-left / up-right = aimed lob (Lob 75)
    if (dy < 0 && ay > ax * 1.1) { dir = 'LOB'; if (ax > ay * BAL.lobTilt) aim = Math.sign(dx); }
    else dir = dx < 0 ? 'L' : dx > 0 ? 'R' : (Math.random() < 0.5 ? 'L' : 'R');
    swipeAttack(dir, aim); return;
  }
  if (ph === 'defend' || ph === 'pass' || ph === 'oppPlay' || ph === 'over' || ph === 'served' || ph === 'wait') {
    if (ax >= ay * 0.8) { moveLane(dx < 0 ? -1 : 1); return 'lane'; }
    else if (dy < 0 && ph === 'defend') dash();
  }
}
function onTap() {
  if (G.mode === 'mp') { if (!G.paused) mpSend('tap', 0, 0); return; }
  if (G.mode !== 'play' || G.paused) return;
  if (G.phase === 'serveReady') toss();
  else if (G.phase === 'serveToss') serveHit(0, false);
}
let ptr = null;
const SW = 18;
cv.addEventListener('pointerdown', e => {
  audioInit();
  ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, used: false };
  try { cv.setPointerCapture(e.pointerId); } catch (er) {}
  e.preventDefault();
});
cv.addEventListener('pointermove', e => {
  if (!ptr || e.pointerId !== ptr.id || (ptr.used && !ptr.chain)) return;
  if (ptr.chain) {
    // second lane only for a long sweep (about half the screen), so a normal swipe from the side stops in the middle
    const tot = e.clientX - ptr.x0, need = Math.max(SW * 4, frameEl.clientWidth * 0.5);
    if (Math.sign(tot) !== ptr.dir || Math.abs(tot) < need) return;
    ptr.chain = false;
    moveLane(ptr.dir);
    return;
  }
  const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
  if (Math.hypot(dx, dy) <= SW) return;
  ptr.used = true;
  if (onSwipe(dx, dy) === 'lane') { ptr.chain = true; ptr.dir = dx < 0 ? -1 : 1; } else ptr.chain = false;
});
const endPtr = e => {
  if (!ptr || e.pointerId !== ptr.id) return;
  if (!ptr.used) {
    const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
    if (Math.hypot(dx, dy) > SW * 0.6) onSwipe(dx, dy); else onTap();
  }
  ptr = null;
};
cv.addEventListener('pointerup', endPtr);
cv.addEventListener('pointercancel', () => { ptr = null; });
document.addEventListener('touchmove', e => { if (e.target === cv) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
addEventListener('keydown', e => {
  const k = e.key;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(k) && (G.mode === 'play' || G.mode === 'mp') && document.activeElement === document.body) e.preventDefault();
  if (G.mode === 'mp') { if (e.repeat) return; if (k === 'p' || k === 'P' || k === 'Escape') { togglePause(); return; } if (G.paused) return; audioInit(); const mm = { ArrowLeft: [-1, 0.2], a: [-1, 0.2], ArrowRight: [1, 0.2], d: [1, 0.2], ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1] }[k]; if (mm) onSwipe(mm[0], mm[1]); else if (k === ' ' || k === 'Enter') onTap(); return; }
  if (e.repeat) return;
  if (k === 'p' || k === 'P' || k === 'Escape') { togglePause(); return; }
  if (G.mode !== 'play' || G.paused) return;
  audioInit();
  const m = { ArrowLeft: [-1, 0.2], a: [-1, 0.2], A: [-1, 0.2], ArrowRight: [1, 0.2], d: [1, 0.2], D: [1, 0.2],
    ArrowUp: [0, -1], w: [0, -1], W: [0, -1], ArrowDown: [0, 1], s: [0, 1], S: [0, 1], q: [-1, 1], Q: [-1, 1], e: [1, 1], E: [1, 1],
    z: [-0.6, -1], Z: [-0.6, -1], c: [0.6, -1], C: [0.6, -1] }[k];
  if (m) onSwipe(m[0], m[1]);
  else if (k === ' ' || k === 'Enter') onTap();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && (G.mode === 'play' || G.mode === 'mp')) togglePause(true); });

/* ---------------- UI wiring ---------------- */
function setLevel(l) {
  G.level = l; store.set('level', l);
  for (let i = 0; i < 3; i++) $('#lv' + i).setAttribute('aria-pressed', String(i === l));
  $('#lvSeg').dataset.lv = l;
  updRecord();
}
for (let i = 0; i < 3; i++) $('#lv' + i).addEventListener('click', () => { if (G.level !== i) SFX.tick(); setLevel(i); });
$('#playBtn').addEventListener('click', () => {
  if (!store.get('seenHow', false)) { store.set('seenHow', true); openHow('play'); return; }
  startGame();
});
function openHow(next) { showOnly('how'); $('#how').scrollTop = 0; $('#howOk').dataset.next = next; $('#howOk').focus({ preventScroll: true }); }
$('#howBtn').addEventListener('click', () => openHow('menu'));
$('#howOk').addEventListener('click', () => { if ($('#howOk').dataset.next === 'play') startGame(); else showOnly('menu'); });
$('#resumeBtn').addEventListener('click', () => togglePause(false));
$('#quitBtn').addEventListener('click', () => { G.paused = false; $('#pauseOv').hidden = true; if (MP.net) mpLeave(); else menuScene(); });
$('#againBtn').addEventListener('click', () => { if (MP.net) mpBegin(); else startGame(); });
$('#menuBtn').addEventListener('click', () => { if (MP.net) mpLeave(); else menuScene(); });
$('#pauseBtn').addEventListener('click', () => togglePause());
function updSoundIcon() { $('#waves').style.display = muted ? 'none' : ''; $('#mute').style.display = muted ? '' : 'none'; $('#soundBtn').setAttribute('aria-label', muted ? 'Unmute' : 'Mute'); }
$('#soundBtn').addEventListener('click', () => { muted = !muted; store.set('muted', muted); audioInit(); updSoundIcon(); });
updSoundIcon();
setLevel(G.level);

