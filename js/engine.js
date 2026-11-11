'use strict';
// engine: helpers, storage, pixel font, drawing primitives, camera, poses, figures, ball, fx, sound, game state, rally rules (our side), points
const $ = s => document.querySelector(s);
const cv = $('#cv'), ctx = cv.getContext('2d', { alpha: false });
const frameEl = $('#frame'), stageEl = $('#stage');
const W = 144; let H = 260;

const C = {
  void:'#0c1513', wall:'#111e1a', wall2:'#15241f', floor:'#16251f', court:'#1b2d27', court2:'#22362f',
  line:'#4b635b', lineHi:'#6b857c', bone:'#dcdcd2', boneMid:'#b0b4aa', boneDim:'#7d8881',
  opp:'#949e97', eye:'#ff5a46', ink:'#08100e', shade:'#070d0b',
  accent:'#f2c25e', good:'#a4dc8e', bad:'#ec6b55', fire1:'#ffe08a', fire2:'#f39a3c', fire3:'#d2482f',
  crowd:'#26362f', crowd2:'#30443b', netDim:'#6d7c75', post:'#8d968f', lamp:'#e8e3c4'
};
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const pad2 = n => (n < 10 ? '0' : '') + n;

/* ---------------- storage ---------------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('knochenhart.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('knochenhart.' + k, JSON.stringify(v)); } catch (e) {} }
};

/* ---------------- pixel font 5x7 ---------------- */
const G5 = {
  'A':'.###.|#...#|#...#|#####|#...#|#...#|#...#', 'B':'####.|#...#|#...#|####.|#...#|#...#|####.',
  'C':'.###.|#...#|#....|#....|#....|#...#|.###.', 'D':'####.|#...#|#...#|#...#|#...#|#...#|####.',
  'E':'#####|#....|#....|####.|#....|#....|#####', 'F':'#####|#....|#....|####.|#....|#....|#....',
  'G':'.###.|#...#|#....|#.###|#...#|#...#|.####', 'H':'#...#|#...#|#...#|#####|#...#|#...#|#...#',
  'I':'.###.|..#..|..#..|..#..|..#..|..#..|.###.', 'J':'..###|...#.|...#.|...#.|#..#.|#..#.|.##..',
  'K':'#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', 'L':'#....|#....|#....|#....|#....|#....|#####',
  'M':'#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', 'N':'#...#|#...#|##..#|#.#.#|#..##|#...#|#...#',
  'O':'.###.|#...#|#...#|#...#|#...#|#...#|.###.', 'P':'####.|#...#|#...#|####.|#....|#....|#....',
  'Q':'.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', 'R':'####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  'S':'.####|#....|#....|.###.|....#|....#|####.', 'T':'#####|..#..|..#..|..#..|..#..|..#..|..#..',
  'U':'#...#|#...#|#...#|#...#|#...#|#...#|.###.', 'V':'#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  'W':'#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.', 'X':'#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  'Y':'#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', 'Z':'#####|....#|...#.|..#..|.#...|#....|#####',
  'Ä':'.#.#.|.....|.###.|#...#|#####|#...#|#...#', 'Ö':'.#.#.|.....|.###.|#...#|#...#|#...#|.###.',
  'Ü':'.#.#.|.....|#...#|#...#|#...#|#...#|.###.',
  '0':'.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', '1':'..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  '2':'.###.|#...#|....#|...#.|..#..|.#...|#####', '3':'####.|....#|....#|.###.|....#|....#|####.',
  '4':'...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', '5':'#####|#....|####.|....#|....#|#...#|.###.',
  '6':'.###.|#....|#....|####.|#...#|#...#|.###.', '7':'#####|....#|...#.|..#..|.#...|.#...|.#...',
  '8':'.###.|#...#|#...#|.###.|#...#|#...#|.###.', '9':'.###.|#...#|#...#|.####|....#|....#|.###.',
  '!':'..#..|..#..|..#..|..#..|..#..|.....|..#..', '?':'.###.|#...#|....#|...#.|..#..|.....|..#..',
  '.':'.....|.....|.....|.....|.....|.....|..#..', ',':'.....|.....|.....|.....|.....|..#..|.#...',
  ':':'.....|..#..|.....|.....|.....|..#..|.....', '-':'.....|.....|.....|.###.|.....|.....|.....',
  '+':'.....|..#..|..#..|#####|..#..|..#..|.....', '/':'....#|....#|...#.|..#..|.#...|#....|#....',
  "'":'..#..|..#..|.....|.....|.....|.....|.....', '·':'.....|.....|.....|..#..|.....|.....|.....',
  '←':'.....|..#..|.#...|#####|.#...|..#..|.....', '→':'.....|..#..|...#.|#####|...#.|..#..|.....',
  '↑':'..#..|.###.|#.#.#|..#..|..#..|..#..|.....', '↓':'.....|..#..|..#..|..#..|#.#.#|.###.|..#..',
  '↙':'.....|....#|#..#.|#.#..|##...|####.|.....', '↘':'.....|#....|.#..#|..#.#|...##|.####|.....'
};
const FONT = {};
for (const k in G5) FONT[k] = G5[k].split('|');
const tw = (s, sc) => s.length * 6 * sc - sc;
function drawStr(s, x, y, col, sc) {
  ctx.fillStyle = col;
  for (let i = 0; i < s.length; i++) {
    const g = FONT[s[i]]; if (!g) continue;
    for (let r = 0; r < 7; r++) { const row = g[r]; for (let c = 0; c < 5; c++) if (row.charCodeAt(c) === 35) ctx.fillRect(x + (i * 6 + c) * sc, y + r * sc, sc, sc); }
  }
}
function text(s, x, y, col, sc = 1, al = 'c', sh = C.ink) {
  s = String(s).toUpperCase();
  const w = tw(s, sc);
  const X = al === 'c' ? Math.round(x - w / 2) : al === 'r' ? Math.round(x - w) : Math.round(x);
  const Y = Math.round(y);
  if (sh) { drawStr(s, X + 1, Y + 1, sh, sc); if (sc > 1) { drawStr(s, X + sc, Y + sc, sh, sc); drawStr(s, X - 1, Y, sh, sc); } }
  drawStr(s, X, Y, col, sc);
}

/* ---------------- primitives ---------------- */
function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
function line(x0, y0, x1, y1, c, th = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  ctx.fillStyle = c;
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, n = 0;
  for (;;) {
    ctx.fillRect(x0, y0, th, th);
    if ((x0 === x1 && y0 === y1) || ++n > 900) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function disc(cx, cy, r, c) {
  ctx.fillStyle = c; cx = Math.round(cx); cy = Math.round(cy);
  if (r <= 0) { ctx.fillRect(cx, cy, 1, 1); return; }
  for (let y = -r; y <= r; y++) { const w = Math.floor(Math.sqrt(Math.max(0, r * r + r * 0.8 - y * y))); ctx.fillRect(cx - w, cy + y, 2 * w + 1, 1); }
}
function ellipse(cx, cy, rx, ry, c) {
  ctx.fillStyle = c; cx = Math.round(cx); cy = Math.round(cy);
  for (let y = -ry; y <= ry; y++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y / (ry + 0.5)) ** 2))); ctx.fillRect(cx - w, cy + y, 2 * w + 1, 1); }
}
function ring(cx, cy, r, c) {
  cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r); ctx.fillStyle = c;
  let x = r, y = 0, e = 1 - r;
  while (x >= y) {
    ctx.fillRect(cx + x, cy + y, 1, 1); ctx.fillRect(cx + y, cy + x, 1, 1); ctx.fillRect(cx - x, cy + y, 1, 1); ctx.fillRect(cx - y, cy + x, 1, 1);
    ctx.fillRect(cx + x, cy - y, 1, 1); ctx.fillRect(cx + y, cy - x, 1, 1); ctx.fillRect(cx - x, cy - y, 1, 1); ctx.fillRect(cx - y, cy - x, 1, 1);
    y++; if (e < 0) e += 2 * y + 1; else { x--; e += 2 * (y - x) + 1; }
  }
}
function fillPoly(pts, c) {
  ctx.fillStyle = c;
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
  minY = Math.max(0, Math.ceil(minY)); maxY = Math.min(H - 1, Math.floor(maxY));
  for (let y = minY; y <= maxY; y++) {
    const yc = y + 0.5; let xl = Infinity, xr = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a.y <= yc && b.y > yc) || (b.y <= yc && a.y > yc)) { const x = a.x + (yc - a.y) * (b.x - a.x) / (b.y - a.y); if (x < xl) xl = x; if (x > xr) xr = x; }
    }
    if (xl < xr) { const a = Math.max(0, Math.round(xl)), b = Math.min(W, Math.round(xr)); if (b > a) ctx.fillRect(a, y, b - a, 1); }
  }
}

/* ---------------- camera / projection ---------------- */
const CAM0 = { y: 9, off: 7.4, pitch: 0.5 };
const CAM = { x: 0, y: CAM0.y, z: 0, pitch: CAM0.pitch, f: 290, cp: 1, sp: 0 };
let HOR = 0;
let FLIP = false; // team B phones see the court from the other end
const pv = (x, y, z) => FLIP ? proj(-x, y, -z) : proj(x, y, z);
function trig() { CAM.cp = Math.cos(CAM.pitch); CAM.sp = Math.sin(CAM.pitch); }
function proj(x, y, z) {
  const dx = x - CAM.x, dy = y - CAM.y, dz = z - CAM.z;
  let d = -dz * CAM.cp - dy * CAM.sp; if (d < 0.5) d = 0.5;
  const up = dy * CAM.cp - dz * CAM.sp;
  const k = CAM.f / d;
  return { x: W / 2 + dx * k, y: HOR - up * k, s: k, d };
}

/* ---------------- world constants ---------------- */
const GRAV = 9.8;
const LX = [-1.9, 0, 1.9];
const DZ = 6.6, APZ = 5.6, CZ = 2.75, CY = 3.35;
const BLK_Z = -0.5, LIB_Z = -6.4;

/* ---------------- poses (13 joints: head, neck, shL, shR, elL, elR, haL, haR, hip, knL, knR, ftL, ftR) ---------------- */
const POSES = {};
const defP = (n, a) => { POSES[n] = Float32Array.from(a); };
const mir = a => { const o = Array.from(a); for (let i = 0; i < o.length; i += 2) o[i] = -o[i]; return o; };
defP('stand',   [0,1.74, 0,1.56, -.21,1.5, .21,1.5, -.27,1.2, .27,1.2, -.29,.92, .29,.92, 0,.98, -.11,.52, .11,.52, -.14,0, .14,0]);
defP('ready',   [0,1.42, 0,1.26, -.21,1.2, .21,1.2, -.34,.96, .34,.96, -.22,.76, .22,.76, 0,.78, -.33,.44, .33,.44, -.37,0, .37,0]);
defP('dig',     [0,1.36, 0,1.2, -.2,1.14, .2,1.14, -.12,.92, .12,.92, -.03,.72, .03,.72, 0,.74, -.35,.42, .35,.42, -.4,0, .4,0]);
defP('diveR',   [.82,.6, .66,.58, .62,.74, .66,.42, .9,.66, .92,.44, 1.12,.56, 1.12,.5, .08,.5, -.3,.42, .3,.2, -.66,.28, .42,0]);
defP('diveF',   [0,.42, 0,.4, -.24,.44, .24,.44, -.32,.3, .32,.3, -.08,.22, .08,.22, 0,.5, -.2,.5, .2,.5, -.24,.72, .24,.72]);
defP('jump',    [0,1.76, 0,1.58, -.21,1.54, .22,1.55, -.28,1.88, .44,1.8, -.16,2.18, .3,2.04, 0,1.0, -.2,.6, .2,.62, -.16,.22, .24,.26]);
defP('spike',   [.02,1.76, 0,1.58, -.2,1.52, .22,1.58, -.3,1.3, .2,2.0, -.2,1.08, .12,2.38, 0,1.0, -.16,.58, .16,.55, -.24,.18, .1,.08]);
defP('follow',  [-.04,1.7, -.02,1.53, -.22,1.47, .2,1.5, -.3,1.2, .02,1.3, -.36,.98, -.16,1.0, 0,.98, -.16,.56, .16,.55, -.2,.16, .14,.1]);
defP('lob',     [0,1.76, 0,1.58, -.2,1.53, .22,1.56, -.3,1.3, .18,2.02, -.24,1.06, .1,2.4, 0,1.0, -.16,.58, .16,.55, -.24,.18, .1,.08]);
defP('hold',    [0,1.74, 0,1.56, -.21,1.5, .21,1.5, -.26,1.2, .27,1.2, -.1,1.15, .29,.92, 0,.98, -.11,.52, .11,.52, -.14,0, .14,0]);
defP('toss',    [0,1.76, 0,1.58, -.21,1.52, .22,1.54, -.16,1.9, .42,1.72, -.06,2.24, .32,1.98, 0,.98, -.12,.52, .12,.52, -.16,0, .16,0]);
defP('set',     [0,1.72, 0,1.55, -.2,1.5, .2,1.5, -.3,1.76, .3,1.76, -.09,2.02, .09,2.02, 0,.95, -.16,.5, .16,.5, -.18,0, .18,0]);
defP('setReady',[0,1.74, 0,1.56, -.21,1.5, .21,1.5, -.34,1.62, .34,1.62, -.2,1.88, .2,1.88, 0,.96, -.14,.5, .14,.5, -.17,0, .17,0]);
defP('block',   [0,1.76, 0,1.58, -.2,1.53, .2,1.53, -.2,2.02, .2,2.02, -.15,2.44, .15,2.44, 0,1.0, -.12,.52, .12,.52, -.12,.04, .12,.04]);
defP('blockW',  [0,1.76, 0,1.58, -.2,1.53, .2,1.53, -.44,1.96, .44,1.96, -.66,2.3, .66,2.3, 0,1.0, -.16,.52, .16,.52, -.18,.04, .18,.04]);
defP('blockL',  [-.05,1.76, -.03,1.58, -.23,1.54, .17,1.54, -.42,1.98, .0,2.04, -.58,2.36, -.16,2.46, 0,1.0, -.12,.52, .12,.52, -.12,.04, .12,.04]);
defP('cheer',   [0,1.78, 0,1.6, -.21,1.55, .21,1.55, -.42,1.88, .42,1.88, -.6,2.22, .6,2.22, 0,1.0, -.14,.52, .14,.52, -.18,0, .18,0]);
defP('sad',     [0,1.46, 0,1.4, -.2,1.33, .2,1.33, -.25,1.05, .25,1.05, -.24,.78, .24,.78, 0,.9, -.12,.48, .12,.48, -.15,0, .15,0]);
// defense follow-ups: contact, follow-through, slide, roll, get up
defP('digUp',   [0,1.58, 0,1.42, -.2,1.36, .2,1.36, -.1,1.24, .1,1.24, -.03,1.36, .03,1.36, 0,.86, -.24,.48, .24,.48, -.32,0, .32,0]);
defP('digLow',  [0,1.08, 0,.94, -.2,.88, .2,.88, -.12,.62, .12,.62, -.03,.42, .03,.42, 0,.5, -.46,.34, .46,.34, -.56,0, .56,0]);
defP('overhead',[0,1.55, 0,1.38, -.2,1.33, .2,1.33, -.27,1.6, .27,1.6, -.1,1.84, .1,1.84, 0,.84, -.27,.46, .27,.46, -.32,0, .32,0]);
defP('reflex',  [0,1.36, 0,1.2, -.2,1.14, .2,1.14, -.3,1.3, .3,1.3, -.12,1.48, .12,1.48, 0,.7, -.42,.4, .42,.4, -.5,0, .5,0]);
defP('reachR',  [.3,1.3, .24,1.14, .06,1.1, .42,1.08, .1,.86, .66,.9, .2,.66, .86,.72, .1,.7, -.3,.42, .52,.4, -.5,0, .74,0]);
defP('shankR',  [-.04,1.4, -.02,1.24, -.22,1.18, .18,1.18, -.04,.98, .32,1.02, .18,.9, .44,.96, 0,.76, -.33,.44, .33,.44, -.37,0, .37,0]);
defP('slideR',  [1.0,.2, .84,.2, .8,.32, .84,.12, 1.08,.3, 1.12,.1, 1.3,.24, 1.34,.12, .22,.18, -.1,.22, .04,.08, -.46,.14, -.28,0]);
defP('rollR',   [.5,.5, .46,.42, .3,.46, .6,.4, .34,.3, .66,.28, .46,.2, .7,.2, .42,.26, .62,.52, .3,.5, .74,.3, .2,.28]);
defP('kneel',   [0,1.18, 0,1.02, -.2,.96, .2,.96, -.3,.74, .3,.74, -.22,.54, .22,.54, 0,.56, -.28,.34, .2,.06, -.32,0, .3,.02]);
defP('pancake', [0,.22, 0,.2, -.26,.22, .26,.22, -.44,.16, .4,.14, -.6,.1, .5,.06, 0,.3, -.18,.34, .18,.34, -.22,.5, .22,.5]);
defP('huddle',  [0,1.6, 0,1.44, -.2,1.4, .2,1.4, -.34,1.2, .34,1.2, -.18,1.0, .18,1.0, 0,.92, -.16,.5, .16,.5, -.2,0, .2,0]);
defP('blockReady',[0,1.6, 0,1.44, -.2,1.38, .2,1.38, -.3,1.5, .3,1.5, -.22,1.74, .22,1.74, 0,.86, -.2,.48, .2,.48, -.25,0, .25,0]);
defP('shuffleR',[.08,1.6, .08,1.44, -.12,1.38, .28,1.38, -.2,1.5, .38,1.5, -.14,1.74, .3,1.74, .08,.88, -.1,.48, .34,.46, -.22,0, .5,.04]);
defP('slam',    [0,1.72, 0,1.55, -.2,1.5, .2,1.5, -.22,1.85, .22,1.85, -.12,2.0, .12,2.0, 0,.98, -.14,.5, .14,.5, -.18,.06, .18,.06]);
defP('flex',    [0,1.78, 0,1.6, -.21,1.55, .21,1.55, -.45,1.6, .45,1.6, -.42,1.9, .42,1.9, 0,1.0, -.16,.52, .16,.52, -.2,0, .2,0]);
defP('blockOw', [0,1.74, 0,1.58, -.2,1.53, .2,1.53, -.48,1.9, .48,1.9, -.78,2.1, .78,2.1, 0,1.0, -.14,.52, .14,.52, -.16,.04, .16,.04]);
defP('shrug',   [0,1.74, 0,1.56, -.21,1.52, .21,1.52, -.38,1.3, .38,1.3, -.5,1.42, .5,1.42, 0,.98, -.12,.52, .12,.52, -.15,0, .15,0]);
defP('fist',     [0,1.76, 0,1.58, -.21,1.52, .21,1.52, -.3,1.25, .3,1.8, -.2,1.02, .22,2.08, 0,.98, -.12,.52, .12,.52, -.15,0, .15,0]);
defP('pointFwd', [0,1.74, 0,1.56, -.21,1.5, .21,1.52, -.3,1.22, .46,1.56, -.28,.98, .72,1.62, 0,.98, -.14,.52, .14,.52, -.18,0, .2,0]);
defP('headHands',[0,1.7, 0,1.53, -.21,1.48, .21,1.48, -.38,1.68, .38,1.68, -.12,1.8, .12,1.8, 0,.95, -.12,.5, .12,.5, -.15,0, .15,0]);
defP('kneelSad', [0,1.0, 0,.86, -.2,.8, .2,.8, -.24,.56, .24,.56, -.16,.36, .16,.36, 0,.46, -.2,.06, .2,.06, -.28,.02, .28,.02]);
defP('taunt',    [0,1.78, 0,1.6, -.21,1.55, .21,1.55, -.5,1.6, .5,1.6, -.72,1.78, .72,1.78, 0,1.0, -.16,.52, .16,.52, -.2,0, .2,0]);
defP('duck',     [0,1.1, 0,.96, -.18,.92, .18,.92, -.22,.72, .22,.72, -.08,.9, .08,.9, 0,.6, -.34,.36, .34,.36, -.4,0, .4,0]);
defP('letGo',    [0,1.72, 0,1.55, -.21,1.5, .21,1.5, -.42,1.3, .42,1.3, -.6,1.2, .6,1.2, 0,.96, -.14,.52, .14,.52, -.18,0, .18,0]);
defP('floatServe',[0,1.74, 0,1.56, -.21,1.5, .21,1.54, -.3,1.22, .26,1.84, -.24,.98, .2,2.1, 0,.98, -.16,.52, .16,.52, -.26,0, .2,.02]);
for (const n of ['fist', 'pointFwd', 'floatServe']) POSES[n + 'M'] = Float32Array.from(mir(POSES[n]));
for (const n of ['reachR', 'shankR', 'slideR', 'rollR', 'shuffleR']) POSES[n.slice(0, -1) + 'L'] = Float32Array.from(mir(POSES[n]));
POSES.diveL = Float32Array.from(mir(POSES.diveR));
POSES.blockR = Float32Array.from(mir(POSES.blockL));
for (const n of ['jump', 'spike', 'follow', 'lob', 'hold', 'toss']) POSES[n + 'M'] = Float32Array.from(mir(POSES[n]));

/* ---------------- figures ---------------- */
function Fig(o) {
  const f = { x:0, y:0, z:0, vy:0, air:false, tx:0, tz:0, sx:6, sz:6, pose:Float32Array.from(POSES.stand),
    tgt:'stand', base:'stand', until:0, rate:16, col:C.bone, front:false, band:false, ph:0, moving:false,
    lean:0, leanT:0, lock:false, onLand:null, lane:1, lastMove:-9, moveDir:0 };
  Object.assign(f, o); f.tx = f.x; f.tz = f.z; return f;
}
const me = Fig({ col: C.bone, band: true, sx: 15, sz: 7, spring: true, vx: 0 });
const mate = Fig({ col: C.boneMid });
const oB = Fig({ col: C.opp, front: true });
const oA = Fig({ col: C.opp, front: true });
const FIGS = [me, mate, oB, oA];

function place(f, x, z) { f.seq = null; f.seqLock = false; f.vx = 0; f.x = f.tx = x; f.z = f.tz = z; f.y = 0; f.vy = 0; f.air = false; f.onLand = null; f.lock = false; f.lean = f.leanT = 0; }
function setPose(f, n, dur, rate) { if (!POSES[n]) return; f.seq = null; f.tgt = n; f.until = dur ? G.t + dur : 0; f.rate = rate || 16; }
// pose chain: [[pose, dur, rate, fn?], ...]; the figure stays put until the chain ends
function seq(f, steps) {
  setPose(f, steps[0][0], steps[0][1], steps[0][2]); if (steps[0][3]) steps[0][3]();
  f.seq = steps.slice(1); f.seqLock = true; f.lock = true;
  return steps.reduce((s, p) => s + p[1], 0);
}
// after a point, let a lying figure get up first, then react
function react(f, n, dur, rate) { if (f.seq && f.seq.length) f.seq.push([n, dur, rate]); else setPose(f, n, dur, rate); }
function setBase(f, n) { f.base = n; if (!f.until) f.tgt = n; }
function snapPose(f, n) { f.pose.set(POSES[n]); f.tgt = f.base = n; f.until = 0; }
function jump(f, v) { f.vy = v; f.air = true; }
const boostAt = d => 1 + 0.28 * clamp((d - 10.5) / 10, 0, 1);
function handWorld(f, idx) {
  const b = boostAt(pv(f.x, 0, f.z).d);
  return { x: f.x + f.pose[idx * 2] * b, y: f.y + f.pose[idx * 2 + 1] * b, z: f.z };
}
function updFig(f, dt) {
  const dx = f.tx - f.x, dz = f.tz - f.z;
  if (f.spring) {
    // critically damped spring: quick start, soft arrival, no overshoot
    const w = 30, e = Math.exp(-w * dt), off = f.x - f.tx, tmp = (f.vx + w * off) * dt;
    f.x = f.tx + (off + tmp) * e; f.vx = (f.vx - w * tmp) * e;
    if (Math.abs(f.x - f.tx) < 0.003 && Math.abs(f.vx) < 0.05) { f.x = f.tx; f.vx = 0; }
    f.lean = clamp(f.vx / 24, -0.9, 0.9);
  } else f.x += Math.sign(dx) * Math.min(Math.abs(dx), f.sx * dt);
  f.z += Math.sign(dz) * Math.min(Math.abs(dz), f.sz * dt);
  f.moving = Math.abs(dx) > 0.04 || Math.abs(dz) > 0.04;
  if (f.moving && !f.air) f.ph += dt * 15;
  if (f.air) {
    f.vy -= GRAV * dt; f.y += f.vy * dt;
    if (f.y <= 0) { f.y = 0; f.vy = 0; f.air = false; dust(f.x, f.z, 3); if (f.onLand) { const cb = f.onLand; f.onLand = null; cb(); } }
  }
  if (f.until && G.t >= f.until) {
    if (f.seq && f.seq.length) { const s = f.seq.shift(); f.tgt = s[0]; f.until = G.t + s[1]; f.rate = s[2] || 14; if (s[3]) s[3](); }
    else { f.until = 0; f.tgt = f.base; f.rate = 12; f.seq = null; if (f.seqLock) { f.seqLock = false; f.lock = false; } }
  }
  const tp = POSES[f.tgt], k = Math.min(1, dt * f.rate);
  for (let i = 0; i < 26; i++) f.pose[i] += (tp[i] - f.pose[i]) * k;
  if (!f.spring) f.lean += (f.leanT - f.lean) * Math.min(1, dt * 8);
}

/* ---------------- ball ---------------- */
const ball = { trail: [], x:0, y:1, z:0, vx:0, vy:0, vz:0, mode:'none', p0:null, v:null, t0:0, T:1, holder:null, idx:6, spin:0, spinV:8, fire:false, wob:0, wobF:0 };
function hold(f, idx) { ball.mode = 'held'; ball.holder = f; ball.idx = idx; ball.fire = false; updBall(0); }
function launch(to, T, o = {}) {
  const from = { x: ball.x, y: ball.y, z: ball.z };
  ball.p0 = from;
  ball.v = { x: (to.x - from.x) / T, y: (to.y - from.y) / T + 0.5 * GRAV * T, z: (to.z - from.z) / T };
  ball.t0 = G.t; ball.T = T; ball.mode = 'flight'; ball.holder = null;
  ball.wob = o.wob || 0; ball.wobF = o.wobF || 0; ball.fire = !!o.fire; ball.spinV = o.spin != null ? o.spin : 9;
}
function updBall(dt) {
  if (ball.mode !== 'flight' && ball.trail.length) ball.trail.shift();
  if (ball.mode === 'held') {
    const h = handWorld(ball.holder, ball.idx);
    ball.x = h.x; ball.y = h.y + 0.1; ball.z = h.z - (ball.holder.front ? -0.12 : 0.12);
    return;
  }
  if (ball.mode === 'flight') {
    const t = G.t - ball.t0, u = t / ball.T;
    let x = ball.p0.x + ball.v.x * t;
    const y = ball.p0.y + ball.v.y * t - 0.5 * GRAV * t * t;
    const z = ball.p0.z + ball.v.z * t;
    if (ball.wob && u < 1) x += ball.wob * Math.sin(u * ball.wobF) * Math.sin(Math.PI * u);
    ball.x = x; ball.y = y; ball.z = z; ball.spin += dt * ball.spinV;
    const vyNow = ball.v.y - GRAV * t;
    if (dt > 0) {
      const fast = Math.hypot(ball.v.x, vyNow, ball.v.z) > 9;
      if (fast) { ball.trail.push({ x, y, z }); if (ball.trail.length > 5) ball.trail.shift(); } else if (ball.trail.length) ball.trail.shift();
    }
    if (y < 0.11 && vyNow < 0) {
      ball.y = 0.11; ball.mode = 'free';
      ball.vx = ball.v.x * 0.5; ball.vz = ball.v.z * 0.5; ball.vy = -vyNow * 0.42;
      bounceFx();
    }
    if (ball.fire) for (let i = 0; i < 2; i++) G.parts.push({ x: ball.x + rand(-.08, .08), y: ball.y + rand(-.08, .08), z: ball.z, vx: rand(-.4, .4), vy: rand(.2, 1.2), vz: rand(-.4, .4), age: 0, life: rand(.2, .45), c: pick([C.fire1, C.fire2, C.fire3]), g: -1 });
  } else if (ball.mode === 'free') {
    ball.vy -= GRAV * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.z += ball.vz * dt;
    ball.spin += dt * 4;
    if (ball.y < 0.11 && ball.vy < 0) {
      ball.y = 0.11;
      if (Math.abs(ball.vy) > 1.2) { ball.vy = -ball.vy * 0.45; ball.vx *= 0.7; ball.vz *= 0.7; bounceFx(); }
      else { ball.vy = 0; ball.vx *= 0.92; ball.vz *= 0.92; }
    }
  }
}
function bounceFx() { dust(ball.x, ball.z, 5); SFX.bounce(); }

/* ---------------- particles & popups ---------------- */
function dust(x, z, n) {
  for (let i = 0; i < n; i++) G.parts.push({ x, y: 0.05, z, vx: rand(-1.2, 1.2), vy: rand(.6, 1.6), vz: rand(-.6, .6), age: 0, life: rand(.25, .5), c: pick([C.boneDim, C.line, C.court2]) });
}
function sparks(x, y, z, n, cols) {
  for (let i = 0; i < n; i++) G.parts.push({ x, y, z, vx: rand(-2.5, 2.5), vy: rand(-1, 2.5), vz: rand(-2, 2), age: 0, life: rand(.2, .45), c: pick(cols || [C.bone, C.accent]) });
}
function updParts(dt) {
  const P = G.parts;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i]; p.age += dt;
    if (p.age > p.life) { P.splice(i, 1); continue; }
    p.vy -= (p.g != null ? p.g : GRAV) * dt * (p.g != null ? 1 : 0.6);
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < 0) { p.y = 0; p.vy *= -0.3; }
  }
}
function popup(s, col = C.bone, sc = 2, x = null, y = null, dur = 1.0) {
  let yy = y != null ? y : Math.round(H * 0.3);
  if (y == null) { for (const p of G.pops) if (p.big && G.t - p.t0 < 0.6 && Math.abs(p.y - yy) < 16) yy = p.y + 18; }
  G.pops.push({ s, col, sc, x: x != null ? x : W / 2, y: yy, t0: G.t, dur, big: y == null });
}
// expanding pixel ring at the ball instead of a word
function burst(col, big) { G.fx.push({ x: ball.x, y: ball.y, z: ball.z, t0: G.t, dur: big ? 0.32 : 0.2, col, r1: big ? 15 : 8 }); }

/* ---------------- sound ---------------- */
let AC = null, muted = store.get('muted', false);
function audioInit() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
  if (AC && AC.state === 'suspended') AC.resume().catch(() => {});
}
function tone(freq, dur, type = 'square', vol = 0.06, slide = 0, delay = 0) {
  if (!AC || muted) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + dur + 0.02);
}
let noiseBuf = null;
function noise(dur, vol = 0.1, freq = 1800, delay = 0) {
  if (!AC || muted) return;
  if (!noiseBuf) { noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.5, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t = AC.currentTime + delay, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(f); f.connect(g); g.connect(AC.destination); s.start(t); s.stop(t + dur + 0.02);
}
const SFX = {
  spike() { noise(0.12, 0.35, 2600); tone(220, 0.1, 'square', 0.07, -140); },
  dig() { tone(150, 0.08, 'triangle', 0.16, -40); noise(0.05, 0.12, 900); },
  set() { tone(520, 0.05, 'square', 0.04); tone(780, 0.05, 'square', 0.03, 0, 0.04); },
  lob() { tone(400, 0.12, 'triangle', 0.08, 200); },
  block() { noise(0.16, 0.4, 600); tone(90, 0.16, 'square', 0.1, -40); },
  bounce() { tone(110, 0.06, 'triangle', 0.08, -30); },
  serve() { noise(0.1, 0.3, 2000); tone(260, 0.08, 'square', 0.05, -120); },
  toss() { tone(300, 0.1, 'triangle', 0.05, 250); },
  tick() { tone(1200, 0.03, 'square', 0.025); },
  step() { noise(0.03, 0.05, 3500); },
  slide() { noise(0.22, 0.09, 1200); },
  thud() { tone(70, 0.1, 'triangle', 0.14, -20); noise(0.06, 0.08, 400); },
  touch() { tone(640, 0.04, 'square', 0.05, -200); noise(0.05, 0.12, 2400); },
  plan() { tone(98, 0.14, 'square', 0.06, -10); tone(87, 0.2, 'square', 0.06, -10, 0.15); },
  err() { tone(160, 0.1, 'square', 0.04, -60); },
  whistle() { tone(2050, 0.16, 'sine', 0.05); tone(2250, 0.22, 'sine', 0.045, 0, 0.18); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.1, 'square', 0.045, 0, i * 0.07)); },
  lose() { [392, 330, 247].forEach((f, i) => tone(f, 0.14, 'square', 0.04, 0, i * 0.1)); },
  fire() { noise(0.5, 0.3, 500); tone(110, 0.5, 'sawtooth', 0.06, 400); },
  crowd() { noise(0.4, 0.07, 900); noise(0.3, 0.05, 1500, 0.08); },
  perfect(n) { const f = 990 * Math.pow(1.122, Math.min(6, n - 1)); tone(f, 0.07, 'square', 0.035); tone(f * 1.5, 0.12, 'triangle', 0.04, 0, 0.05); },
  match(w) { (w ? [523, 659, 784, 1046, 784, 1046] : [392, 349, 330, 262]).forEach((f, i) => tone(f, 0.16, 'square', 0.05, 0, i * 0.13)); }
};
function vib(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }

/* ---------------- game state ---------------- */
const G = {
  mode: 'menu', phase: 'idle', paused: false, t: 0, slow: 0, shake: 0, flash: 0, netWob: 0, hype: 0,
  level: store.get('level', 1), score: [0, 0], server: 1, meter: 0, combo: 0, stop: 0, fire: false,
  ev: [], parts: [], pops: [], fx: [], bump: [-9, -9], fade: 0, fadeV: 0, incoming: null, attack: null, serve: null,
  hist: { L: 0, R: 0, LOB: 0 }, rally: 0, stats: null, crowd: []
};
function newStats() { return { perfect: 0, digs: 0, saves: 0, kills: 0, aces: 0, blocked: 0, maxRally: 0, fires: 0 }; }
G.stats = newStats();
function at(t, fn) { G.ev.push({ t, fn }); }
function after(dt, fn) { at(G.t + dt, fn); }
function runEv() {
  for (let i = 0; i < G.ev.length; i++) { const e = G.ev[i]; if (G.t >= e.t) { G.ev.splice(i, 1); i--; e.fn(); } }
}
function D() {
  const base = [0.1, 0.33, 0.5][G.level] || 0.33;
  const prog = (G.score[0] + G.score[1]) / 28, lead = (G.score[0] - G.score[1]) / 14;
  return clamp(base + prog * 0.4 + lead * 0.35, 0, 1);
}
function shake(n) { if (!reduceMotion) G.shake = Math.max(G.shake, n); }
function slowmo(s) { G.slow = Math.max(G.slow, s); }
// gesture hints: icons only, shown the first few times, then never again
const HINTS = { serve: 'TAP', toss: '← ↑ →', defend: '← →', tip: '↑', attack: '↙ ↘ ↑', block: '← → ↑ ↓ TAP', set: 'TAP ← → ↑' };
const hintSeen = store.get('hints', {});
let hint = '', hintT = 0;
function setHint(key) {
  hint = '';
  if (!HINTS[key] || (hintSeen[key] || 0) >= 3) return;
  hintSeen[key] = (hintSeen[key] || 0) + 1; store.set('hints', hintSeen);
  hint = HINTS[key]; hintT = G.t;
}

/* ---------------- rally setup ---------------- */
const MSET = { x: 0.8, z: 0.7 }, OSET = { x: -0.6, z: -0.75 };
const RING = 0.75;
// balance knobs (tuned with simulated players)
const BAL = {
  libNear: { perfect: 0.4, good: 0.7, weak: 0.9 },
  libFar: { perfect: 0.05, good: 0.2, weak: 0.45 },
  libRead: [0.45, 0.4],
  lobLR: { perfect: 0.55, good: 0.7, weak: 0.85 },
  lobW: { perfect: 0.08, good: 0.2, weak: 0.45 },
  lobD: 0.92,
  tool: { perfect: 0.16, good: 0.07, weak: 0.02 }, touch: 0.14, touchSave: [0.65, 0.85],
  // serve: ace chance per quality, extra when aimed away from the receiver; scaled down per level and for every ace in a row
  ace: { perfect: 0.1, good: 0.035, weak: 0 }, aceAway: 0.06, aceLv: [1.15, 0.8, 0.5], aceRun: 0.4, aceCord: [0.55, 0.4, 0.25],
  serveWin: [[0.1, 0.2], [0.08, 0.18], [0.06, 0.15]], srvRead: [0, 0.35, 0.6],
  badRecv: { perfect: 0.2, good: 0.1, weak: 0.04 }, badRecvLv: [1.2, 0.8, 0.5],
  oppServeT: [1.2, 0.85], oppSpikeT: [0.75, 0.48], oppSetT: [0.88, 0.66], markDelay: [0.06, 0.16],
  tip: [0.14, 0.12], diveOk: [0.8, 0.45], stuff: [0.45, 0.25], reboundT: [0.75, 0.5],
  meterMax: 8,
  blockGraze: 0.05 // P3: base chance an attack grazes the block (Block-Anschlag)
};
function resetCourt() {
  G.ev.length = 0; G.incoming = null; G.attack = null; G.serve = null; G.oppAtk = null; G.rally = 0;
  place(mate, MSET.x, MSET.z); snapPose(mate, 'stand');
  place(oB, 0, BLK_Z); snapPose(oB, 'setReady');
  const rd = G.server === 0 && G.lastAim != null && Math.random() < (BAL.srvRead[G.level] || 0);
  place(oA, rd ? clamp(G.lastAim * 0.7, -2.4, 2.4) : pick([-2.4, 0, 2.4]), LIB_Z); snapPose(oA, 'ready');
  for (const f of FIGS) { f.sx = 6; f.sz = 6; }
  me.sx = 15; me.sz = 7; me.dash = false;
  ball.fire = false;
}
function startRally() {
  if (G.mode !== 'play') return;
  resetCourt();
  G.fadeV = -5;
  if (AI.huddle) {
    // new game plan: the opponents put their heads together, eyes flare
    AI.huddle = false; AI.planT = G.t;
    after(0.25, () => { setPose(oB, 'huddle', 0.7, 10); if (G.server === 0) setPose(oA, 'huddle', 0.7, 10); SFX.plan(); });
  }
  if (G.server === 0) {
    me.lane = 1; place(me, 0.3, 9.4); snapPose(me, 'hold'); setBase(me, 'hold');
    CAM.z = me.z + CAM0.off - 0.6; // the fade hides the camera jump
    hold(me, 6);
    G.phase = 'serveReady';
    setHint('serve');
  } else {
    me.lane = 1; place(me, 0, DZ); snapPose(me, 'ready');
    CAM.z = DZ + CAM0.off;
    place(oA, pick([-1.6, 0, 1.6]), -9.6); snapPose(oA, 'holdM');
    hold(oA, 6);
    G.phase = 'wait';
    setHint('');
    after(0.55, () => SFX.whistle());
    after(1.0, oppToss);
  }
}
function addMeter(n) {
  if (G.mode !== 'play' || G.fire) return;
  G.meter = clamp(G.meter + n, 0, BAL.meterMax);
  if (G.meter >= BAL.meterMax) { G.fire = true; after(0.4, () => { G.flash = 0.5; SFX.fire(); }); }
}
// long rallies: the skeletons start to sweat
function sweat() {
  for (const f of FIGS) if (Math.random() < 0.5) G.parts.push({ x: f.x + f.pose[0] + rand(-0.1, 0.1), y: f.y + f.pose[1] + 0.12, z: f.z, vx: rand(-0.6, 0.6), vy: rand(0.6, 1.3), vz: 0, age: 0, life: rand(0.35, 0.6), c: pick(['#9fd6ff', '#cfeaff']) });
}
function rallyTick() {
  G.rally++;
  if (G.rally >= 6) sweat();
  if (G.rally >= 4) { G.hype = Math.max(G.hype, 0.5 + G.rally * 0.05); if (G.rally % 2 === 0) SFX.crowd(); }
}
function timingPop(q) {
  if (q === 'perfect') {
    G.combo++; G.stats.perfect++; addMeter(1);
    burst(C.accent, true); sparks(ball.x, ball.y, ball.z, 6, [C.accent, C.fire1]); SFX.perfect(G.combo);
    if (G.combo === 5 || G.combo === 8) { G.hype = 3; SFX.crowd(); }
   
  } else { G.combo = 0; if (q === 'good') burst(C.bone, false); }
}

/* ---------------- our defense ---------------- */
function incoming(type, lane, x, z, T, markDelay) {
  const inc = G.incoming = { type, lane, x, z, tArr: G.t + T, tMark: G.t + markDelay, done: false, tac: null };
  G.phase = 'defend';
  setHint(type === 'tip' ? 'tip' : type === 'out' ? '' : 'defend');
  after(T, resolveDefense);
  // split step: a little hop as the ball is struck
  if (!me.air && !me.lock && type !== 'block') { jump(me, 1.5); setPose(me, 'ready', 0.2, 20); }
  return inc;
}
function moveLane(d) {
  const nl = clamp(me.lane + d, 0, 2);
  if (nl === me.lane) return;
  me.lane = nl; me.tx = LX[nl]; me.sx = 15; me.lastMove = G.t; me.moveDir = d;
  me.arriveT = G.t + 0.12;
  dust(me.x, me.z, 2); SFX.step();
  if (nl === 1) tone(700, 0.03, 'square', 0.02); // the middle lane clicks
  if (!me.lock && !me.air) setPose(me, d < 0 ? 'reachL' : 'reachR', 0.1, 26); // push-off step
}
function dash() {
  const inc = G.incoming; if (!inc || inc.done || me.dash) return;
  me.dash = true; me.sz = 13;
  if (inc.type === 'tip') { me.tz = inc.z + 0.3; me.tx = inc.x; me.sx = 9; }
  else me.tz = 2.6;
  me.lastMove = G.t; me.arriveT = G.t + Math.abs(me.tz - me.z) / me.sz; SFX.step();
}
// defense animations for any figure; side = -1 left, 1 right (world x)
function slideFx(f, side, dist) {
  return () => {
    // my figure stays on screen: on an outer lane it slides inward of the reach
    const lim = f === me || (f === oA && G.mode === 'mp') ? 0.85 : 4.2;
    SFX.slide(); f.tx = clamp(f.x + side * dist, -lim, lim); if (!f.spring) f.sx = 3;
    for (let i = 0; i < 6; i++) G.parts.push({ x: f.x + side * rand(0, .5), y: .05, z: f.z + rand(-.15, .15), vx: -side * rand(.3, 1.4), vy: rand(.3, 1), vz: rand(-.3, .3), age: 0, life: rand(.3, .55), c: pick([C.boneDim, C.line, C.court2]) });
  };
}
function thud(f) { return () => { SFX.thud(); dust(f.x, f.z, 4); }; }
function defAnim(f, kind, side) {
  const S = side < 0 ? 'L' : 'R';
  const near = f === me || (f === oA && G.mode === 'mp');
  if (near && (kind === 'dive' || kind === 'miss') && Math.abs(f.x + side * 1.1) > 2.2) f.tx = clamp(f.x, -0.85, 0.85);
  switch (kind) {
    case 'clean': return seq(f, [['dig', .12, 34], ['digUp', .2, 14]]);
    case 'low': return seq(f, [['digLow', .1, 38], ['digUp', .22, 12]]);
    case 'free': return seq(f, [['overhead', .16, 28], ['set', .18, 16]]);
    case 'reflex': return seq(f, [['reflex', .1, 42], ['digUp', .2, 14]]);
    case 'reach': return seq(f, [['reach' + S, .14, 32], ['digUp', .18, 14]]);
    case 'dive': return seq(f, [['dive' + S, .2, 30], ['slide' + S, .16, 18, slideFx(f, side, .35)], ['roll' + S, .14, 16, thud(f)], ['kneel', .16, 14]]);
    case 'pancake': return seq(f, [['diveF', .14, 30], ['pancake', .2, 22, slideFx(f, 0, 0)], ['kneel', .18, 12]]);
    case 'shank': return seq(f, [['shank' + S, .18, 32], ['reach' + S, .16, 14], ['ready', .2, 10]]);
    case 'miss': return seq(f, [['dive' + S, .3, 22], ['slide' + S, .5, 16, slideFx(f, side, .5)], ['roll' + S, .2, 14, thud(f)], ['kneel', .3, 10]]);
    case 'missTip': return seq(f, [['diveF', .25, 24], ['pancake', .6, 18, slideFx(f, 0, 0)], ['kneel', .3, 10]]);
    case 'lunge': return seq(f, [['reach' + S, .5, 18], ['ready', .2, 10]]);
  }
  return 0;
}
function resolveDefense() {
  const inc = G.incoming; if (!inc || inc.done) return;
  if (inc.type === 'out') { resolveOut(inc); return; }
  inc.done = true; G.incoming = null;
  const dx = Math.abs(me.x - inc.x), dz = Math.abs(me.z - inc.z);
  const ok = dx < 0.95 && dz < (inc.type === 'tip' ? 1.0 : 1.5);
  me.dash = false;
  const late = G.t - (me.arriveT || 0) < 0.08;
  if (ok && (!late || Math.random() < lerp(BAL.diveOk[0], BAL.diveOk[1], D()))) { AI.defended(inc, false); ourDig(inc, late); return; }
  AI.defended(inc, true);
  G.phase = 'dead'; setHint('');
  const side = inc.x < me.x - 0.05 ? -1 : inc.x > me.x + 0.05 ? 1 : (me.moveDir || 1);
  if (ok) {
    // got there, but too late to control it: the ball shanks off the arms
    defAnim(me, inc.type === 'tip' ? 'missTip' : 'shank', side);
    SFX.dig(); dust(ball.x, ball.z, 5);
    launch({ x: ball.x + side * rand(4, 6), y: 0, z: rand(7, 11) }, 0.9, { spin: 18 });
    after(0.7, () => point(1, 'LATE!'));
    return;
  }
  if (dx < 2.6) defAnim(me, inc.type === 'tip' ? 'missTip' : 'miss', side);
  else defAnim(me, 'lunge', side);
  after(0.45, () => point(1, inc.type === 'block' ? 'BLOCKED!' : inc.type === 'tip' ? 'TIP!' : 'MISSED'));
}
// a ball flying out: whoever stays in its way touches it and loses the point
function outBall(lane, T, md) {
  launch({ x: LX[lane], y: 1.35, z: DZ + 0.1 }, T, { spin: 18 });
  return incoming('out', lane, LX[lane], DZ + 0.1, T, md);
}
function resolveOut(inc) {
  inc.done = true; G.incoming = null; G.phase = 'dead'; setHint('');
  if (me.lane === inc.lane) {
    setPose(me, 'reflex', 0.5, 40); SFX.dig(); sparks(ball.x, ball.y, ball.z, 5, [C.bone]);
    launch({ x: ball.x + pick([-1, 1]) * rand(4, 6), y: 0, z: rand(8, 11) }, 0.7, { spin: 20 });
    after(0.35, () => react(me, 'headHands', 1, 12));
    after(0.75, () => point(1, 'TOUCHED'));
  } else {
    // good eyes: arms wide, the ball sails past
    seq(me, [['letGo', 0.7, 22]]);
    launch({ x: ball.x + rand(-0.3, 0.3), y: 0, z: DZ + 3.6 }, 0.32, { spin: 18 });
    after(0.25, () => { SFX.bounce(); G.hype = 1.2; });
    after(0.7, () => point(0, 'OUT'));
  }
}
// the ball smacks into the net and drops down on the hitter's side
function intoNet(fromZsign, x, cb) {
  launch({ x, y: rand(1.6, 2.1), z: fromZsign * 0.12 }, 0.3, { spin: 20 });
  after(0.3, () => { G.netWob = 1; SFX.block(); shake(2); launch({ x: x + rand(-0.4, 0.4), y: 0, z: fromZsign * rand(0.5, 1.1) }, 0.45, { spin: -6 }); });
  after(1.0, cb);
}
function ourDig(inc, late) {
  const clean = inc.type !== 'tip' && !late;
  const side = me.moveDir < 0 ? -1 : 1, off = inc.x - me.x;
  let kind;
  if (inc.type === 'tip') { kind = 'pancake'; G.stats.saves++; addMeter(1); }
  else if (!clean) { kind = 'dive'; G.stats.saves++; addMeter(1); slowmo(0.2); }
  else if (inc.type === 'block') kind = 'reflex';
  else if (inc.type === 'free') kind = 'free';
  else if (Math.abs(off) > 0.42) kind = 'reach';
  else kind = inc.type === 'spike' ? 'low' : 'clean';
  const dur = defAnim(me, kind, kind === 'reach' ? Math.sign(off) : side);
  if (inc.type === 'tip') me.lane = inc.lane;
  SFX.dig(); dust(ball.x, ball.z, 6); sparks(ball.x, ball.y, ball.z, kind === 'dive' || kind === 'pancake' ? 7 : 4, [C.bone]); vib(12);
  G.stats.digs++; rallyTick();
  if (kind === 'dive' && inc.type !== 'block' && Math.random() < 0.16) { ourOverpass(); return; }
  // scrambled digs drift off target and the setter has to chase them
  const wild = kind === 'dive' || kind === 'pancake' ? 1 : kind === 'reach' || kind === 'reflex' ? 0.45 : 0.12;
  const tgt = { x: clamp(MSET.x + rand(-1.3, 1.3) * wild, -2.6, 3.2), y: 2.55 + rand(0, .7) * wild, z: clamp(MSET.z + rand(-.2, 1.2) * wild, 0.5, 2.2) };
  launch({ x: tgt.x, y: tgt.y, z: tgt.z + 0.12 }, 1.0, { spin: 4 });
  mate.tx = tgt.x; mate.tz = tgt.z; mate.sx = mate.sz = 5;
  after(0.6, () => setPose(mate, 'setReady', 0.5));
  G.phase = 'pass'; setHint('');
  after(Math.max(0.4, Math.min(0.72, dur)), () => { me.lock = false; me.tx = LX[me.lane]; me.sx = 15; me.tz = APZ; me.sz = 7; setBase(me, 'ready'); });
  after(1.0, ourSet);
}

function ourOverpass() {
  G.phase = 'oppPlay'; setHint('');
  const x = clamp(rand(-1.6, 1.2), -2.5, 2.5);
  launch({ x, y: 2.9, z: -0.8 }, 1.0, { spin: 6 });
  oB.tx = x; oB.tz = -0.6; oB.sx = oB.sz = 7;
  after(0.25, () => setPose(mate, 'headHands', 0.6, 14));
  after(0.4, () => { me.lock = false; me.tx = LX[me.lane]; me.sx = 15; me.tz = DZ; me.sz = 7; setBase(me, 'ready'); });
  after(0.58, () => { jump(oB, 3.8); setPose(oB, 'jumpM', 0, 18); });
  after(1.0, () => {
    setPose(oB, 'spikeM', 0.2, 40); setBase(oB, 'setReady'); SFX.spike(); shake(3); G.stop = 0.05; sparks(ball.x, ball.y, ball.z, 6, [C.bone, C.bad]);
    const lane = (Math.random() * 3) | 0, T = lerp(0.62, 0.5, D());
    launch({ x: LX[lane], y: 0.85, z: DZ + 0.1 }, T, { spin: 22 });
    incoming('spike', lane, LX[lane], DZ + 0.1, T, 0.06);
  });
}

/* ---------------- our attack ---------------- */
function ourSet() {
  if (G.mode !== 'play') return;
  const d = D();
  setPose(mate, 'set', 0.3); SFX.set();
  const lane = me.lane;
  const Cp = { x: LX[lane] + 0.12, y: CY, z: CZ };
  const T = 0.9;
  launch(Cp, T, { spin: 3 });
  const tc = G.t + T;
  const A = G.attack = { tc, C: Cp, lane, hit: false, lock: 0, block: decideBlock(d), shown: null, tac: null };
  G.phase = 'attack';
  setHint('attack');
  // blocker follows the set
  oB.tx = clamp(Cp.x, -2.8, 2.8); oB.tz = BLK_Z; oB.sx = oB.sz = 7; setBase(oB, 'setReady'); setPose(oB, 'setReady');
  const lead = lerp(0.72, 0.4, d);
  // against players who read the block, show one side and switch late
  const side = A.block === 'L' || A.block === 'R';
  const pFake = clamp((d > 0.45 ? 0.4 * d : 0) + AI.k() * 0.45 * Math.max(0, AI.readRate() - 0.4) * AI.adapt('bFake'), 0, [0.22, 0.4, 0.55][G.level]);
  const fake = side && Math.random() < pFake;
  A.tac = fake ? 'bFake' : side ? 'bSide' : A.block === 'W' ? 'bWide' : 'bDeep';
  if (fake) {
    at(tc - 0.78, () => showBlock(A.block === 'L' ? 'R' : 'L'));
    at(tc - Math.max(0.36, lead * 0.8), () => showBlock(A.block));
  } else at(tc - lead, () => showBlock(A.block));
  if (A.block !== 'D') at(tc - 0.3, () => { if (G.attack === A) jump(oB, 3.4); });
  // the back defender reads the block and covers the open side
  at(tc - lead + 0.1, () => {
    if (G.attack !== A) return;
    const pRead = BAL.libRead[0] + BAL.libRead[1] * d + AI.k() * 0.25 * Math.max(0, AI.readRate() - 0.5) + (PLANS[AI.plan].libRead || 0);
    if ((A.block === 'L' || A.block === 'R') && Math.random() < Math.min(0.95, pRead)) { oA.tx = clamp(Cp.x + (A.block === 'L' ? 2.4 : -2.4), -3.6, 3.6); oA.sx = 5; }
    else if (A.block === 'W') { oA.tx = clamp(Cp.x * 0.5, -2, 2); oA.sx = 4; }
  });
  // our approach + jump
  at(tc - 0.8, () => { me.tz = 3.3; me.sz = Math.max(3, (me.z - 3.3) / 0.4); me.lock = false; setBase(me, 'stand'); });
  at(tc - 0.43, () => { jump(me, 4.25); setPose(me, 'jump', 0, 18); setBase(me, 'jump'); me.tz = 2.9; me.sz = 1.2; });
  at(tc + 0.2, lateHit);
}
function decideBlock(d) {
  const h = G.hist, tot = h.L + h.R + h.LOB + 1;
  const k = AI.k(), sideM = AI.adapt('bSide');
  const w = {
    L: (1 + (1 + k) * h.L / tot) * sideM,
    R: (1 + (1 + k) * h.R / tot) * sideM,
    W: (d < 0.1 ? 0.1 * k : 0.45 + 0.4 * d + 0.3 * (h.L + h.R) / tot) * AI.adapt('bWide'),
    D: (d < 0.05 ? 0.1 * k : 0.15 + 0.3 * d + 2.0 * h.LOB / tot) * AI.adapt('bDeep')
  };
  let r = Math.random() * (w.L + w.R + w.W + w.D);
  for (const k of ['L', 'R', 'W', 'D']) { r -= w[k]; if (r <= 0) return k; }
  return 'L';
}
function showBlock(side) {
  const A = G.attack; if (!A || A.hit) return;
  A.shown = side; SFX.tick();
  if (side === 'D') { oB.tz = -2.4; oB.sz = 5; setBase(oB, 'ready'); setPose(oB, 'ready'); }
  else {
    oB.tz = BLK_Z; oB.sx = 7;
    oB.tx = clamp(A.C.x + (side === 'L' ? -0.45 : side === 'R' ? 0.45 : 0), -3, 3);
    const p = side === 'L' ? 'blockL' : side === 'R' ? 'blockR' : 'blockW';
    setBase(oB, p); setPose(oB, p, 0, 22);
  }
}
function swipeAttack(dir) {
  const A = G.attack; if (!A || A.hit || G.t < A.lock) return;
  const dt = G.t - A.tc;
  if (dt < -0.3) { burst(C.bad, false); SFX.err(); A.lock = G.t + 0.15; return; }
  if (dt > 0.2) return;
  A.hit = true;
  const adt = Math.abs(dt);
  const q = adt < 0.075 ? 'perfect' : adt < 0.17 ? 'good' : 'weak';
  for (const k in G.hist) G.hist[k] *= 0.8;
  G.hist[dir] += 1;
  AI.sawAttack(A, dir);
  timingPop(q);
  setPose(me, dir === 'LOB' ? 'lob' : 'spike', 0.14, 40);
  setBase(me, 'follow');
  me.onLand = () => { setBase(me, 'ready'); setPose(me, 'ready'); if (G.phase !== 'defend') { me.tz = DZ; me.sz = 6; } else { me.tz = 3.3; me.sz = 4; } };
  G.phase = 'over';
  setHint('');
  rallyTick();
  const sideX = dir === 'L' ? -1 : 1;
  if (G.fire && dir !== 'LOB' && q !== 'weak') { fireball(sideX); return; }
  if (dir === 'LOB') { lob(q); return; }
  const blocked = A.block === 'W' || A.block === dir;
  if (blocked) {
    // a hit into the block can glance off the hands: out (our point) or up into their court
    const r = Math.random(), tool = BAL.tool[q];
    if (r < tool) blockOut(sideX);
    else if (r < tool + BAL.touch) blockTouch(sideX);
    else doBlocked(sideX);
  }
  else spike(sideX, q);
}
function lateHit() {
  const A = G.attack; if (!A || A.hit || G.mode !== 'play') return;
  A.hit = true; G.phase = 'over'; setHint(''); G.combo = 0;
  burst(C.bad, false); SFX.err();
  setPose(me, 'lob', 0.25); setBase(me, 'follow');
  me.onLand = () => { setBase(me, 'ready'); me.tz = DZ; me.sz = 6; };
  rallyTick();
  const tx = rand(-1.5, 1.5);
  launch({ x: tx, y: 0.8, z: -6.2 }, 1.15, { spin: 3 });
  oA.tx = tx; oA.tz = -6.2; oA.sx = oA.sz = 7;
  after(1.15, () => { defAnim(oA, 'free', 1); SFX.dig(); oppPass(); });
}
function spike(sideX, q) {
  const A = G.attack, d = D();
  const tx = clamp(A.C.x + sideX * rand(2.0, 2.8), -4.1, 4.1), tz = -rand(6.0, 8.2);
  if (q === 'weak' && Math.random() < 0.22) {
    SFX.spike(); shake(1);
    if (Math.random() < 0.5) intoNet(1, A.C.x + sideX * 0.6, () => point(1, 'NET'));
    else {
      launch({ x: tx * 1.1, y: 0, z: -rand(10, 11.5) }, 0.6, { spin: 20 });
      after(0.3, () => seq(oA, [['letGo', 0.8, 20]]));
      after(0.9, () => point(1, 'OUT'));
    }
    after(0.7, () => react(me, 'headHands', 1, 12));
    return;
  }
  const T = { perfect: 0.34, good: 0.42, weak: 0.54 }[q];
  const libDist = Math.abs(oA.tx - tx);
  let p = (libDist < 1.7 ? BAL.libNear : BAL.libFar)[q];
  p *= 0.7 + 0.5 * d; if (A.block === 'D') p += 0.15; p = clamp(p, 0, 0.92);
  SFX.spike(); shake(q === 'perfect' ? 3 : 2); vib(18); G.stop = q === 'perfect' ? 0.07 : 0.04;
  sparks(ball.x, ball.y, ball.z, q === 'perfect' ? 10 : 5);
  if (Math.random() < p) {
    launch({ x: tx, y: 0.55, z: tz }, T, { spin: 20 });
    oA.tx = tx; oA.tz = tz + 0.2; oA.sx = oA.sz = 10;
    after(T, () => {
      const far = libDist > 1.0;
      defAnim(oA, far ? 'dive' : libDist > 0.45 ? 'reach' : 'low', tx < oA.x ? -1 : 1);
      SFX.dig(); AI.blockResult(A, 0.5);
      if (far && Math.random() < 0.22) oppOverpass(); else oppPass(false, far);
    });
  } else if (libDist < 1.3 && Math.random() < 0.5) {
    // gets a piece of it, but it flies off the arms into the stands
    launch({ x: tx, y: 0.55, z: tz }, T, { spin: 20 });
    oA.tx = tx; oA.tz = tz + 0.2; oA.sx = oA.sz = 10;
    after(T, () => {
      const sd = tx < 0 ? -1 : 1;
      defAnim(oA, 'shank', sd); SFX.dig(); sparks(ball.x, ball.y, ball.z, 5, [C.bone]);
      launch({ x: sd * rand(5.5, 7), y: 0, z: tz - rand(1, 3) }, 0.8, { spin: 24 });
    });
    after(T + 0.9, () => { G.stats.kills++; AI.blockResult(A, 0); point(0, 'POINT!'); });
  } else {
    launch({ x: tx, y: 0, z: tz }, T, { spin: 20 });
    oA.tx = lerp(oA.x, tx, 0.45); oA.sx = 6;
    const side = tx < oA.x ? -1 : 1;
    after(T * 0.6, () => defAnim(oA, Math.abs(oA.x - tx) < 2.4 ? 'miss' : 'lunge', side));
    after(T + 0.25, () => { G.stats.kills++; AI.blockResult(A, 0); point(0, q === 'perfect' ? 'KILL!' : 'POINT!'); });
  }
}
// their dig flies straight over the net: our setter jumps and slams it
function oppOverpass() {
  G.phase = 'over'; rallyTick();
  const x = clamp(rand(-1.2, 1.6), -2.5, 2.5);
  launch({ x, y: 2.9, z: 0.8 }, 1.05, { spin: 6 });
  mate.tx = x; mate.tz = 0.9; mate.sx = mate.sz = 6;
  after(0.62, () => { jump(mate, 3.8); setPose(mate, 'jump', 0, 18); });
  after(1.05, () => {
    setPose(mate, 'spike', 0.2, 40); setBase(mate, 'stand'); SFX.spike(); shake(3); G.stop = 0.06; sparks(ball.x, ball.y, ball.z, 8);
    const kx = rand(-3, 3), kz = -rand(2.5, 6);
    oA.tx = lerp(oA.x, kx, 0.5); oA.sx = 8;
    if (Math.random() < 0.85) {
      launch({ x: kx, y: 0, z: kz }, 0.32, { spin: 24 });
      after(0.2, () => defAnim(oA, 'miss', kx < oA.x ? -1 : 1));
      after(0.7, () => { G.stats.kills++; point(0, 'POINT!'); });
    } else {
      launch({ x: kx, y: 0.55, z: kz }, 0.4, { spin: 24 });
      oA.tx = kx; oA.tz = kz - 0.2; oA.sx = oA.sz = 12;
      after(0.4, () => { defAnim(oA, 'dive', kx < oA.x ? -1 : 1); SFX.dig(); oppPass(false, true); });
    }
  });
}
function doBlocked(sideX) {
  const d = D();
  const hx = oB.x + sideX * 0.3;
  launch({ x: hx, y: oB.y + 2.25, z: BLK_Z + 0.3 }, 0.1, { spin: 20 });
  SFX.spike();
  after(0.1, () => {
    if (G.mode !== 'play') return;
    SFX.block(); shake(4); G.netWob = 1; vib(30); G.stop = 0.08;
    G.stats.blocked++;
    sparks(ball.x, ball.y, ball.z, 8, [C.bone, C.bad]);
    if (Math.random() < lerp(BAL.stuff[0], BAL.stuff[0] + BAL.stuff[1], d)) {
      const sx = ball.x + rand(-0.6, 0.6), sz = rand(0.6, 1.6);
      launch({ x: sx, y: 0, z: sz }, 0.3, { spin: -20 });
      AI.blockResult(G.attack, 1);
      G.phase = 'dead'; setHint('');
      // the mate throws a hand out, too late
      after(0.12, () => defAnim(mate, Math.abs(mate.x - sx) < 1.6 ? 'miss' : 'lunge', sx < mate.x ? -1 : 1));
      after(0.75, () => point(1, 'BLOCKED!'));
      return;
    }
    AI.blockResult(G.attack, 0.6);
    const others = [0, 1, 2].filter(l => l !== me.lane);
    const rl = Math.random() < 0.4 ? me.lane : pick(others);
    const T = lerp(BAL.reboundT[0], BAL.reboundT[1], d);
    launch({ x: LX[rl], y: 0.8, z: 3.3 }, T, { spin: -14 });
    incoming('block', rl, LX[rl], 3.3, T, 0);
    if (!me.air) { me.tz = 3.3; me.sz = 4; }
  });
}
function blockOut(sideX) {
  const hx = oB.x + sideX * 0.35;
  launch({ x: hx, y: oB.y + 2.3, z: BLK_Z + 0.3 }, 0.1, { spin: 20 });
  SFX.spike();
  after(0.1, () => {
    SFX.touch(); SFX.block(); shake(3); G.netWob = 0.7; G.stop = 0.06;
    sparks(ball.x, ball.y, ball.z, 8, [C.bone, C.accent]); burst(C.accent, true);
    AI.blockResult(G.attack, 0);
    setPose(oB, 'blockW', 0.25, 30);
    const tx = sideX * rand(5.6, 6.8);
    launch({ x: tx, y: 0, z: -rand(5, 9) }, 0.8, { spin: 25 });
    oA.tx = clamp(tx, -4.3, 4.3); oA.sx = 8;
    after(0.45, () => defAnim(oA, 'lunge', sideX));
    after(0.95, () => { G.stats.kills++; point(0, 'BLOCK OUT!'); });
  });
}
// glanced off the fingertips, up into their court: their back defender has to chase it
function blockTouch(sideX) {
  const A = G.attack, d = D();
  const hx = oB.x + sideX * 0.4;
  launch({ x: hx, y: oB.y + 2.35, z: BLK_Z + 0.3 }, 0.1, { spin: 20 });
  SFX.spike();
  after(0.1, () => {
    if (G.mode !== 'play') return;
    SFX.touch(); G.netWob = 0.5; G.stop = 0.05; shake(2);
    sparks(ball.x, ball.y, ball.z, 6, [C.bone, C.accent]); burst(C.bone, false);
    setPose(oB, sideX < 0 ? 'blockL' : 'blockR', 0.2, 34);
    const tx = clamp(hx + sideX * rand(1.2, 2.6), -4.2, 4.2), tz = -rand(4.5, 7.5), T = 1.0;
    launch({ x: tx, y: 0.5, z: tz }, T, { spin: 14 });
    G.phase = 'over';
    const save = Math.random() < lerp(BAL.touchSave[0], BAL.touchSave[1], d);
    oA.tx = save ? tx : lerp(oA.x, tx, 0.7); oA.tz = save ? tz + 0.2 : lerp(oA.z, tz, 0.7); oA.sx = oA.sz = 9;
    if (save) after(T, () => { defAnim(oA, 'dive', tx < oA.x ? -1 : 1); SFX.dig(); AI.blockResult(A, 0.4); oppPass(false, true); });
    else {
      after(T * 0.8, () => defAnim(oA, 'miss', tx < oA.x ? -1 : 1));
      after(T + 0.3, () => { G.stats.kills++; AI.blockResult(A, 0); point(0, 'POINT!'); });
    }
  });
}
function lob(q) {
  const A = G.attack, d = D();
  const tx = clamp(A.C.x * 0.5 + rand(-1.2, 1.2), -3.5, 3.5), tz = -rand(2.6, 3.8);
  const T = 1.05;
  let p = A.block === 'D' ? BAL.lobD : (A.block === 'W' ? BAL.lobW : BAL.lobLR)[q];
  p = clamp(p * (0.75 + 0.4 * d), 0, 0.95);
  SFX.lob();
  const digger = A.block === 'D' ? oB : oA;
  if (Math.random() < p) {
    launch({ x: tx, y: 0.6, z: tz }, T, { spin: 3 });
    digger.tx = tx; digger.tz = tz - 0.1; digger.sx = digger.sz = 7;
    after(T, () => {
      defAnim(digger, Math.abs(digger.x - tx) > 0.5 ? 'reach' : 'free', tx < digger.x ? -1 : 1); SFX.dig();
      AI.blockResult(A, 0.5); oppPass(true);
    });
  } else {
    launch({ x: tx, y: 0, z: tz }, T, { spin: 3 });
    oA.tx = lerp(oA.x, tx, 0.6); oA.tz = lerp(oA.z, tz, 0.5); oA.sx = oA.sz = 5;
    after(T * 0.8, () => defAnim(oA, 'missTip', 1));
    after(T + 0.25, () => { G.stats.kills++; AI.blockResult(A, 0); point(0, A.block === 'W' ? 'OUTSMARTED!' : 'LOB POINT!'); });
  }
}
function fireball(sideX) {
  const A = G.attack;
  G.fire = false; G.meter = 0; G.stats.fires++;
  const tx = clamp(A.C.x + sideX * 2.6, -4.1, 4.1), tz = -rand(6.5, 8.2);
  launch({ x: tx, y: 0, z: tz }, 0.32, { fire: true, spin: 30 });
  SFX.fire(); SFX.spike(); shake(6); slowmo(0.35); G.flash = 1; vib(40); G.stop = 0.1;
  sparks(ball.x, ball.y, ball.z, 16, [C.fire1, C.fire2, C.fire3]);
  after(0.2, () => setPose(oB, 'sad', 1.2));
  after(0.18, () => defAnim(oA, 'miss', tx < oA.x ? -1 : 1));
  after(0.7, () => { G.stats.kills++; point(0, 'POINT!'); });
}

/* ---------------- our serve ---------------- */
function toss() {
  if (G.phase !== 'serveReady') return;
  G.phase = 'serveToss';
  setPose(me, 'toss', 0.7); setBase(me, 'toss'); SFX.toss();
  launch({ x: me.x + 0.05, y: 1.6, z: me.z - 0.6 }, 1.3, { spin: 2 });
  const tp = G.t + 0.65;
  G.serve = { tp, hit: false, lock: 0 };
  setHint('toss');
  at(tp - 0.42, () => { if (G.serve && !G.serve.hit) { jump(me, 4.0); setPose(me, 'jump', 0, 18); me.tz = me.z - 0.45; me.sz = 1.3; } });
  at(tp + 0.3, () => { if (G.serve && !G.serve.hit) serveHit(0, true); });
}
function serveHit(h, auto) {
  const S = G.serve; if (!S || S.hit || G.t < S.lock) return;
  const dt = G.t - S.tp;
  if (!auto && dt < -0.32) { burst(C.bad, false); SFX.err(); S.lock = G.t + 0.15; return; }
  S.hit = true;
  const adt = Math.abs(dt), win = BAL.serveWin[G.level] || BAL.serveWin[1];
  const q = auto ? 'weak' : adt < win[0] ? 'perfect' : adt < win[1] ? 'good' : 'weak';
  timingPop(q);
  setPose(me, 'spike', 0.15, 40); setBase(me, 'follow'); SFX.serve(); shake(q === 'perfect' ? 2 : 1);
  sparks(ball.x, ball.y, ball.z, q === 'perfect' ? 8 : 3);
  const back = () => { setBase(me, 'ready'); me.tx = LX[me.lane]; me.tz = DZ; me.sx = 12; me.sz = 7; };
  if (me.air) me.onLand = back; else after(0.3, back);
  G.phase = 'served'; setHint('');
  const aimX = [-3, 0, 3][h + 1];
  G.lastAim = aimX;
  const run = G.aceRun || 0, lv = G.level;
  G.aceRun = 0; // set again below only if this one is an ace
  const tx = clamp(aimX + rand(-0.5, 0.5), -4, 4), tz = LIB_Z - rand(0, 1.2);
  const T = { perfect: 0.9, good: 1.02, weak: 1.2 }[q];
  const d = D();
  const fault = auto ? 0.3 : q === 'weak' ? 0.12 : 0.015;
  if (Math.random() < fault) {
    if (Math.random() < 0.6) { intoNet(1, tx * 0.4, () => point(1, 'NET')); after(0.5, () => react(me, 'headHands', 1, 12)); }
    else {
      // long, over everyone
      launch({ x: tx, y: 0, z: -rand(10, 11.5) }, T * 1.05, { spin: 14 });
      oA.tx = tx; oA.sx = 4; after(T * 0.5, () => seq(oA, [['letGo', 0.8, 20]]));
      after(T + 0.4, () => point(1, 'OUT'));
    }
    return;
  }
  let ace = BAL.ace[q];
  if (q !== 'weak' && Math.random() < 0.06) {
    // net cord: it hops over the tape and drops short
    launch({ x: tx * 0.5, y: 2.47, z: 0.05 }, 0.6, { spin: 4 });
    after(0.6, () => { G.netWob = 0.6; SFX.tick(); sparks(ball.x, ball.y, ball.z, 4, [C.bone]); });
    const sx = tx * 0.6, sz = -rand(1.2, 2.0);
    after(0.6, () => {
      oA.tx = sx; oA.tz = sz - 0.2; oA.sx = oA.sz = 11;
      if (Math.random() > (BAL.aceCord[lv] || 0.4) * Math.pow(BAL.aceRun, run)) {
        launch({ x: sx, y: 0.35, z: sz }, 0.6, { spin: 2 });
        after(0.6, () => { defAnim(oA, 'pancake', 1); SFX.dig(); freeBall(); });
      } else {
        launch({ x: sx, y: 0, z: sz }, 0.6, { spin: 2 });
        after(0.4, () => defAnim(oA, 'missTip', 1));
        G.aceRun = run + 1;
        after(0.95, () => { G.stats.aces++; addMeter(1); point(0, 'ACE!'); });
      }
    });
    return;
  }
  if (Math.abs(oA.x - aimX) > 1.5 && q !== 'weak') ace += BAL.aceAway;
  ace *= (1.1 - 0.5 * d) * (BAL.aceLv[lv] || 0.8) * Math.pow(BAL.aceRun, run);
  if (Math.random() < ace) {
    G.aceRun = run + 1;
    launch({ x: tx, y: 0, z: tz }, T, { spin: 14 });
    oA.tx = lerp(oA.x, tx, 0.55); oA.sx = 6;
    after(T * 0.72, () => defAnim(oA, 'miss', tx < oA.x ? -1 : 1));
    after(T + 0.3, () => { G.stats.aces++; addMeter(1); point(0, 'ACE!'); });
  } else {
    launch({ x: tx, y: 0.8, z: tz }, T, { spin: 14 });
    oA.tx = tx; oA.tz = tz + 0.15; oA.sx = oA.sz = 8;
    after(T, () => {
      defAnim(oA, Math.abs(oA.x - tx) > 0.5 ? 'reach' : 'clean', tx < oA.x ? -1 : 1); SFX.dig();
      if (Math.random() < BAL.badRecv[q] * (BAL.badRecvLv[lv] || 1)) freeBall(); else oppPass();
    });
  }
}
function freeBall() {
  const lane = pickLane();
  launch({ x: LX[lane], y: 0.85, z: DZ + 0.1 }, 1.35, { spin: 3 });
  rallyTick();
  incoming('free', lane, LX[lane], DZ + 0.1, 1.35, 0.2);
}

/* ---------------- points ---------------- */
const WINP = ['cheer', 'fist', 'flex', 'pointFwd'], LOSEP = ['sad', 'headHands', 'kneelSad'];
const mirP = (f, n) => f.front && POSES[n + 'M'] ? n + 'M' : n;
function celebrate(f, win, long) {
  const n = win ? pick(long ? ['cheer', 'flex', 'fist'] : WINP) : pick(long ? LOSEP : ['sad', 'headHands']);
  react(f, mirP(f, n), 1.25, 12);
  if (win && n === 'cheer' && !f.air && !f.lock) jump(f, 2.4);
}
function point(w, txt) {
  if (G.phase === 'point' || G.mode !== 'play') return;
  G.ev.length = 0; G.phase = 'point'; G.incoming = null; G.attack = null; G.serve = null; G.oppAtk = null;
  G.score[w]++; G.why = (w ? '-' : '+') + txt;
  AI.point(w);
  G.stats.maxRally = Math.max(G.stats.maxRally, G.rally);
 
  setHint('');
  me.lock = false; me.dash = false; oA.leanT = 0;
  const long = G.rally >= 4;
  G.bump[w] = G.t;
  G.streak = w === 0 ? (G.streak || 0) + 1 : 0;
  if (w === 0) {
    G.hype = long ? 2.4 : 1.4;
   
    // point runs: the crowd gets louder
    if (G.streak === 3 || G.streak === 5 || G.streak === 8) { G.hype = 3.5; after(0.2, () => SFX.crowd()); vib(40); }
    celebrate(me, true, long); after(0.12, () => celebrate(mate, true, long)); SFX.win(); vib(25);
    react(oA, mirP(oA, pick(LOSEP)), 1.1, 10); react(oB, mirP(oB, pick(['sad', 'headHands'])), 1.1, 10);
    addMeter(long ? 2 : 1);
  } else {
    if (!G.fire) G.meter = Math.max(0, G.meter - 3);
    G.combo = 0;
    celebrate(me, false, long); react(mate, pick(['sad', 'headHands']), 1.1, 10); SFX.lose();
    celebrate(oB, true, long); after(0.1, () => { celebrate(oA, true, long); if (Math.random() < 0.3) react(oA, 'taunt', 0.8, 14); });
  }
  G.server = w; // whoever wins the point serves next
  const [a, b] = G.score;
  if ((a >= 15 || b >= 15) && Math.abs(a - b) >= 2) {
    // the winning point lingers: slow motion, confetti, the crowd goes up
    if (w === 0) { slowmo(0.8); confetti(); G.hype = 5; SFX.crowd(); after(0.3, () => SFX.crowd()); }
    after(1.8, gameOver); return;
  }
  after(1.15, () => { G.fadeV = 6; });
  after(1.35, () => { startRally(); if (Math.max(a, b) >= 14 && a !== b) popup('MATCH POINT', C.accent); });
}

