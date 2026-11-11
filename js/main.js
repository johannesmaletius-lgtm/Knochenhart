'use strict';
// main: sizing, boot (loaded last)
/* ---------------- sizing ---------------- */
function resize() {
  const r = stageEl.getBoundingClientRect();
  const vw = Math.max(200, r.width), vh = Math.max(300, r.height);
  const asp = clamp(vh / vw, 1.55, 2.25);
  H = Math.round(W * asp);
  cv.width = W; cv.height = H; ctx.imageSmoothingEnabled = false;
  const sc = Math.min(vw / W, vh / H);
  frameEl.style.width = Math.floor(W * sc) + 'px'; frameEl.style.height = Math.floor(H * sc) + 'px';
  const keep = { x: CAM.x, z: CAM.z };
  CAM.x = 0; CAM.y = CAM0.y; CAM.z = DZ + CAM0.off; CAM.pitch = CAM0.pitch; trig();
  CAM.f = 1; HOR = 0;
  const feet = proj(0, 0, DZ), wall = proj(0, 0, -12.5);
  const fW = 27 / feet.s;
  const fH = (H - 34 - 46) / Math.max(0.01, feet.y - wall.y);
  CAM.f = Math.min(fW, fH);
  HOR = H - 34 - feet.y * CAM.f;
  CAM.x = keep.x; CAM.z = keep.z || DZ + CAM0.off;
}
addEventListener('resize', resize);
resize();

/* ---------------- boot ---------------- */
function boot(data) {
  data = data || {};
  if (data.level != null) setLevel(data.level);
  menuScene();
  if (data.mode === 'play' && Array.isArray(data.score)) {
    G.mode = 'play'; G.score = data.score.slice(); G.server = data.server || 0; G.meter = data.meter || 0; G.fire = !!data.fire;
    G.stats = Object.assign(newStats(), data.stats || {});
    showOnly(null); startRally();
  }
  requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
  // invite link (?raum=CODE): straight into that room
  try {
    const qs = new URLSearchParams(location.search), room = (qs.get('raum') || '').toUpperCase();
    if (/^[A-Z0-9]{4}$/.test(room)) {
      qs.delete('raum'); history.replaceState(null, '', location.pathname + (qs.toString() ? '?' + qs.toString().replace(/=(&|$)/g, '$1') : ''));
      mpOpen(); $('#mpCode').value = room; mpJoin();
    }
  } catch (e) {}
}
try { window.claude && window.claude.hot && window.claude.hot.snapshot && window.claude.hot.snapshot(() => ({ level: G.level, mode: G.mode, score: G.score, server: G.server, meter: G.meter, fire: G.fire, stats: G.stats })); } catch (e) {}
const hot = window.claude && window.claude.hot;
if (hot && hot.ready) hot.ready(boot); else boot(hot && hot.data ? hot.data : {});
window.__kh = { SKILLS, PROFILE, SG, prof: () => PROFILE, slotProf, leaderboardAdd, leaderboard, profileOpen, EMO, MP, AI, FIGS, G, me, mate, oB, oA, ball, startRally, BAL, CAM, LX, startGame, onSwipe, onTap, update, render };
