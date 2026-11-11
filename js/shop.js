'use strict';
// shop: coins, skins, skull portraits, unlock progress, confetti
/* ---------------- coins, skins, shop ---------------- */
// bone color, headband, optional accessory; bought with coins (SKILLS.earn per win, also spent on skills)
const SKINS = [
  { id: 'knochen', n: 'Bone', p: 0, bone: '#dcdcd2', band: '#f2c25e', d: 'The classic. Clean bones, gold band.' },
  { id: 'neon', n: 'Neon', p: 30, bone: '#8dffa8', band: '#ff5ad1', d: 'Glows under the gym lights.' },
  { id: 'nacht', n: 'Night', p: 40, bone: '#6f7f88', band: '#a77bff', d: 'Dark bones for late matches.' },
  { id: 'eis', n: 'Ice', p: 60, bone: '#a9dcff', band: '#ffffff', d: 'Cold as a perfect block.' },
  { id: 'lava', n: 'Lava', p: 80, bone: '#ff8a4c', band: '#ffe08a', fx: 'ember', d: 'Smoulders. Sparks fly off the skull.' },
  { id: 'pirat', n: 'Pirate', p: 100, bone: '#dcdcd2', band: '#d2482f', acc: 'bandana', d: 'Bandana and eye patch. Arr.' },
  { id: 'teufel', n: 'Devil', p: 120, bone: '#e86a5a', band: '#2b0f0f', acc: 'horns', d: 'Red bones, two horns, no mercy.' },
  { id: 'kuerbis', n: 'Pumpkin', p: 150, bone: '#dcdcd2', band: '#3d6b2f', acc: 'pumpkin', d: 'A carved pumpkin for a head.' },
  { id: 'geist', n: 'Ghost', p: 180, bone: '#e8f4ff', band: '#9fd6ff', alpha: 0.55, d: 'Half there. Hard to read.' },
  { id: 'koenig', n: 'King', p: 250, bone: '#f2c25e', band: '#d2482f', acc: 'crown', d: 'Golden bones and a crown. Rule the court.' }
];
const RARITY = p => p === 0 ? ['Starter', '#97a39b'] : p <= 60 ? ['Rare', '#6fb8ff'] : p <= 150 ? ['Epic', '#c08bff'] : ['Legendary', '#f5c85f'];
// pixel skull portraits for the shop and the scoreboard, drawn once per skin
const ICONS = {};
const SKULL_PX = ['...#####...', '.#########.', '###########', '###########', '##EEE#EEE##', '##EEE#EEE##', '###########', '.####.####.', '..#######..', '..#.#.#.#..'];
const PUMPKIN_PX = ['..###.###..', '.#########.', '###########', '###########', '##Y#####Y##', '#YYY###YYY#', '###########', '##YYYYYYY##', '.##Y#Y#Y##.', '..#######..'];
function shadeHex(h, f) {
  const n = parseInt(h.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => clamp(Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f), 0, 255));
  return '#' + c.map(v => (v < 16 ? '0' : '') + v.toString(16)).join('');
}
function skinIcon(k, opp) {
  const key = opp ? '_opp' : k.id; if (ICONS[key]) return ICONS[key];
  const IW = 15, IH = 17, ox = 2, oy = 5, g = [];
  for (let y = 0; y < IH; y++) g.push(new Array(IW).fill(null));
  const put = (x, y, c) => { x += ox; y += oy; if (x >= 0 && x < IW && y >= 0 && y < IH) g[y][x] = c; };
  const acc = opp ? null : k.acc, bone = opp ? C.opp : k.bone;
  const map = acc === 'pumpkin' ? PUMPKIN_PX : SKULL_PX, base = acc === 'pumpkin' ? '#e07b2a' : bone;
  map.forEach((row, y) => {
    for (let x = 0; x < 11; x++) {
      const ch = row[x]; if (ch === '.') continue;
      if (ch === 'E') { put(x, y, C.ink); continue; }
      if (ch === 'Y') { put(x, y, '#ffe08a'); continue; }
      // light from the top left: highlight that edge, shade the bottom right
      const edgeR = x === 10 || row[x + 1] === '.', edgeB = y === map.length - 1 || map[y + 1][x] === '.';
      const edgeT = y === 0 || map[y - 1][x] === '.', edgeL = x === 0 || row[x - 1] === '.';
      let c = base;
      if (acc === 'pumpkin' && (x === 3 || x === 7)) c = '#c4621a';
      else if (edgeR || edgeB) c = shadeHex(base, -0.28);
      else if (edgeT || edgeL) c = shadeHex(base, 0.35);
      put(x, y, c);
    }
  });
  if (acc === 'pumpkin') { put(5, -1, '#3d6b2f'); put(5, -2, '#3d6b2f'); put(6, -2, '#5c9a44'); }
  else {
    put(3, 5, C.eye); put(7, 5, C.eye);
    if (!opp && acc !== 'bandana') for (let x = 0; x < 11; x++) if (SKULL_PX[3][x] === '#') put(x, 3, x === 10 || x === 0 ? shadeHex(k.band, -0.25) : k.band);
  }
  if (acc === 'bandana') {
    for (let y = 0; y < 3; y++) for (let x = 0; x < 11; x++) if (SKULL_PX[y][x] === '#') put(x, y, y === 0 ? shadeHex(k.band, 0.25) : k.band);
    put(11, 2, k.band); put(12, 1, k.band); put(12, 3, k.band);
    for (let x = 2; x <= 4; x++) { put(x, 4, C.ink); put(x, 5, C.ink); }
    put(1, 3, C.ink); put(5, 3, C.ink);
  } else if (acc === 'horns') {
    const hc = '#3a1414', hl = '#6b2a2a';
    for (const [x, y] of [[1, 0], [2, 0], [0, -1], [1, -1], [0, -2], [-1, -3]]) put(x, y, x === 1 && y === -1 ? hl : hc);
    for (const [x, y] of [[9, 0], [8, 0], [10, -1], [9, -1], [10, -2], [11, -3]]) put(x, y, x === 9 && y === -1 ? hl : hc);
  } else if (acc === 'crown') {
    for (let x = 2; x <= 8; x++) { put(x, -1, '#c9892c'); put(x, -2, x < 5 ? '#fff0a8' : '#ffd75a'); }
    put(2, -3, '#ffd75a'); put(5, -3, '#ffd75a'); put(8, -3, '#ffd75a'); put(5, -4, '#fff0a8'); put(5, -2, C.bad);
  }
  if (!opp && k.fx === 'ember') { put(2, -2, C.fire2); put(5, -3, C.fire1); put(8, -2, C.fire2); put(4, -1, C.fire3); put(7, -4, C.fire1); }
  // dark outline around everything
  const out = g.map(r => r.slice());
  for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) if (!g[y][x] && ((g[y - 1] && g[y - 1][x]) || (g[y + 1] && g[y + 1][x]) || g[y][x - 1] || g[y][x + 1])) out[y][x] = '#050a09';
  const c = document.createElement('canvas'); c.width = IW; c.height = IH;
  const x2 = c.getContext('2d');
  if (!opp && k.alpha) x2.globalAlpha = 0.62;
  for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) if (out[y][x]) { x2.fillStyle = out[y][x]; x2.fillRect(x, y, 1, 1); }
  return (ICONS[key] = c.toDataURL());
}
const SKIN = {}; for (const k of SKINS) SKIN[k.id] = k;
let coins = store.get('coins', 0);
const owned = new Set(store.get('skins', ['knochen']));
let mySkin = SKIN[store.get('skin', 'knochen')] ? store.get('skin', 'knochen') : 'knochen';
function updCoins() { for (const el of document.querySelectorAll('#menuCoins .n, #shopCoins')) el.textContent = coins; }
function addCoins(n) { coins += n; store.set('coins', coins); updCoins(); }
function showCoinWin(win) {
  const el = $('#ovCoins'); el.hidden = !win;
  if (win) {
    // first win of the day pays double
    const bonus = store.get('bonusDay', 0) !== today();
    if (bonus) store.set('bonusDay', today());
    const n = Math.round((bonus ? SKILLS.earn.daily : SKILLS.earn.win) * sgCoinMul());
    addCoins(n);
    el.querySelector('.n').textContent = '+' + n;
    $('#ovBonus').textContent = bonus ? 'Daily bonus' : '';
    setTimeout(() => { tone(1320, 0.06, 'square', 0.04); tone(1760, 0.1, 'square', 0.04, 0, 0.07); if (bonus) tone(2093, 0.14, 'square', 0.04, 0, 0.16); }, 450);
  }
}
const today = () => { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
// progress toward the cheapest skin you do not have yet
function nextHTML() {
  const k = SKINS.filter(x => !owned.has(x.id)).sort((a, b) => a.p - b.p)[0];
  if (!k) return '';
  const f = Math.min(1, coins / k.p);
  return '<img class="px" alt="" src="' + skinIcon(k) + '"><b>' + k.n + '</b><span class="bar"><i style="width:' + (f * 100).toFixed(1) + '%"></i></span>'
    + (coins >= k.p ? 'Ready!' : Math.min(coins, k.p) + '/' + k.p);
}
function updOverMeta() { $('#ovNext').innerHTML = nextHTML(); }
function updMenuMeta() {
  const nx = nextHTML(), daily = store.get('bonusDay', 0) !== today();
  $('#menuNext').innerHTML = nx;
  $('#menuDaily').hidden = !daily;
  $('#shopBadge').hidden = !SKINS.some(k => !owned.has(k.id) && coins >= k.p);
}
// match-winning confetti
function confetti() {
  for (let i = 0; i < 80; i++) G.parts.push({ x: rand(-4.5, 4.5), y: rand(2.5, 5.5), z: rand(-3, DZ), vx: rand(-0.6, 0.6), vy: rand(-0.5, 0.8), vz: rand(-0.3, 0.3), age: 0, life: rand(1.4, 2.6), c: pick([C.accent, C.bone, C.good, C.fire1, C.fire2]), g: 1.6 });
}
let shopSel = mySkin;
function shopOpen() { shopSel = mySkin; showOnly('shop'); shopDraw(); }
function shopDraw() {
  updCoins();
  const list = $('#skinList');
  const sc = list.scrollTop;
  list.innerHTML = SKINS.map(k => {
    const have = owned.has(k.id), rc = RARITY(k.p)[1];
    return '<button class="skin' + (have ? ' owned' : coins < k.p ? ' locked' : '') + (k.id === mySkin ? ' on' : '') + '" style="--rc:' + rc + '" data-id="' + k.id + '" aria-pressed="' + (k.id === shopSel) + '" aria-label="' + k.n + '">'
      + '<img class="px" alt="" src="' + skinIcon(k) + '"><b>' + k.n + '</b><em>'
      + (k.id === mySkin ? 'Equipped' : have ? 'Owned' : '<span class="coin"></span>' + k.p) + '</em></button>';
  }).join('');
  list.scrollTop = sc;
  const k = SKIN[shopSel], have = owned.has(k.id), btn = $('#shopAct'), [rn, rc] = RARITY(k.p);
  $('#shopFeat').style.setProperty('--rc', rc);
  $('#featImg').src = skinIcon(k); $('#featRar').textContent = rn; $('#featName').textContent = k.n; $('#featDesc').textContent = k.d;
  btn.disabled = k.id === mySkin || (!have && coins < k.p);
  btn.className = 'btn' + (k.id === mySkin ? ' ghost' : '');
  btn.innerHTML = k.id === mySkin ? 'Equipped' : have ? 'Equip' : coins >= k.p ? 'Buy <span class="coin"></span>' + k.p : (k.p - coins) + ' more coins';
  me.skin = shopSel; // live preview on the skeleton below
}
$('#skinList').addEventListener('click', e => { const b = e.target.closest('.skin'); if (!b) return; shopSel = b.dataset.id; SFX.tick(); shopDraw(); });
$('#shopAct').addEventListener('click', () => {
  const k = SKIN[shopSel]; if (!k) return;
  if (!owned.has(k.id)) {
    if (coins < k.p) return;
    addCoins(-k.p); owned.add(k.id); store.set('skins', [...owned]); SFX.win();
  }
  mySkin = k.id; store.set('skin', mySkin); shopDraw();
});
for (const id of ['#shopBtn', '#menuCoins']) $(id).addEventListener('click', () => { audioInit(); shopOpen(); });
$('#shopOk').addEventListener('click', () => { me.skin = mySkin; SFX.tick(); showOnly('menu'); });
updCoins();

