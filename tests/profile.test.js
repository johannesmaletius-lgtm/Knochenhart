// Assertions for the pure leaderboard/name helpers in js/profile.js (sort, dedupe, cap, sanitising).
// Usage: node tests/profile.test.js   (exit 1 on any failure)
'use strict';
const P = require('../js/profile.js');
let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } };

// names: sanitised, length-capped, never empty
ok(P.nameClean('  Bone   Crusher ', 12) === 'Bone Crusher', 'name trims and collapses spaces');
ok(P.nameClean('<b>x</b>&"', 12) === 'bxb', 'name strips markup characters');
ok(P.nameClean('ABCDEFGHIJKLMNOP', 12) === 'ABCDEFGHIJKL', 'name capped at max');
ok(P.nameClean('', 12) === 'Player' && P.nameClean(null, 12) === 'Player' && P.nameClean('???', 12) === 'Player', 'empty name -> Player');

// entries: invalid ids rejected, numbers coerced
ok(P.lbEntry({ name: 'x', ovr: 70 }) === null, 'entry without id rejected');
ok(P.lbEntry({ id: 'a'.repeat(33), ovr: 70 }) === null, 'overlong id rejected');
const e = P.lbEntry({ id: 'a', name: 'A', ovr: '71.6' }, 12);
ok(e.ovr === 72 && e.name === 'A' && typeof e.sk === 'object' && e.t === 0, 'entry normalised');

// add: sorted by OVR desc, ties by name, dedupe by id (newest data wins)
let L = [];
L = P.lbAdd(L, { id: 'a', name: 'Ann', ovr: 70, t: 1 }, 50);
L = P.lbAdd(L, { id: 'b', name: 'Bob', ovr: 80, t: 2 }, 50);
L = P.lbAdd(L, { id: 'c', name: 'Cid', ovr: 70, t: 3 }, 50);
ok(L.map(x => x.id).join() === 'b,a,c', 'sorted by OVR then name (got ' + L.map(x => x.id).join() + ')');
L = P.lbAdd(L, { id: 'a', name: 'Ann2', ovr: 90, t: 4 }, 50);
ok(L.length === 3 && L[0].id === 'a' && L[0].name === 'Ann2', 'same id replaced, not duplicated');
ok(P.lbRank(L, 'b') === 2 && P.lbRank(L, 'zz') === 0, 'rank lookup');
ok(P.lbAdd(L, { name: 'bad' }, 50).length === 3, 'invalid entry ignored');
ok(P.lbAdd(null, { id: 'x', ovr: 60 }, 50).length === 1, 'missing list treated as empty');
ok(P.lbAdd([{ id: 'q' }, 'junk', null], { id: 'x', ovr: 60 }, 50).length === 2, 'junk stored entries dropped');

// cap: drops the longest-unseen others, never the entry just added
let C = [];
for (let i = 0; i < 6; i++) C = P.lbAdd(C, { id: 'p' + i, name: 'P' + i, ovr: 99 - i, t: 10 + i }, 5);
ok(C.length === 5 && !C.some(x => x.id === 'p0'), 'cap drops oldest (t) entry');
C = P.lbAdd(C, { id: 'low', name: 'Low', ovr: 1, t: 100 }, 5);
ok(C.length === 5 && C.some(x => x.id === 'low') && !C.some(x => x.id === 'p1'), 'new low entry kept, next oldest dropped');
const big = P.lbAdd(C, { id: 'me', name: 'Me', ovr: 50, t: 0 }, Infinity);
ok(big.length === 6 && big[big.length - 2].id === 'me', 'view merge without cap keeps everyone');

console.log(fails ? fails + '/' + n + ' FAILED' : 'all ' + n + ' passed');
process.exit(fails ? 1 : 0);
