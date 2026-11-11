# Volleyskull (Knochenhart)

Browser volleyball game (2 vs 2 skeletons), PWA, no build step, no framework. Plain HTML/CSS/JS.
Project plan and fixed game rules: `docs/FABLE_PROMPTS.md`.

## File map
| File | Content |
|---|---|
| `index.html` | markup + CSS (menus, shop, skills, scoreboard, MP lobby, overlays), loads the scripts below, registers `sw.js` |
| `js/engine.js` | helpers (`$`, `clamp`, `lerp`, `rand`), `store`, pixel font + `text()`, drawing primitives, camera `CAM`/`proj`, world constants (`LX`, `DZ`, ...), `POSES`, figures (`me`, `mate`, `oA`, `oB`, `FIGS`), `ball`, particles/popups, sound `SFX`, game state `G`, hints, balance `BAL`, rally setup, our defense/attack/serve (skill hooks: timing tiers, faults, dive, lob aim, float, fireball lock, `hitPop` EARLY/LATE), `point()` |
| `js/skills.js` | `SKILLS` table (skills 60..99, OVR, costs, income, timing/net-fault/recycle curves, unlocks, perks, dig/dive/mate block, AI profile), helpers (`ovr`, `levelCost`, `unlocked`, `perk`), pure P3 decisions (`timingErr`, `hitTier`, `hitFault`, `blockRoll`, `stuffChance`, `recycleP`, `lateSaveP`, `diveReach`, `fireMax`, `aiProfile`), `PROFILE` (`knochenhart.skills`), `?ovr=NN`, `RNG` (`?seed=N`); also a Node module |
| `js/ai.js` | opponent brain `AI`/`PLANS`, opponent serve, opponent offense (pass, set, attack), our net block vs. it (`mateGraze`, `mateStuff`) |
| `js/ui.js` | menu demo, game lifecycle (`startGame`, `gameOver`, pause), input (`onSwipe`, `onTap`, pointer/keys), menu button wiring |
| `js/shop.js` | coins, `SKINS`, skull portraits `skinIcon`, unlock progress, shop screen, confetti |
| `js/profile.js` | player id `PID` + name (`knochenhart.pid/name`), local leaderboard (`lbAdd`/`leaderboardAdd`, `knochenhart.board`), skill screen `#skillOv` (levels, OVR, radar, badge perks); pure helpers also a Node module |
| `js/mp.js` | multiplayer: `MP` state, transport (Trystero/WebRTC, BroadcastChannel with `?bc`), lobby, host match rules (`mp*`), input relay, snapshot sync, MP UI wiring |
| `js/render.js` | canvas rendering (`render()`, figures, net, ball, HUD), HTML scoreboard `BD`/`updBoard`, dither fade, main loop (`update`, `frame`) |
| `js/main.js` | sizing (`resize`), `boot()`, debug handle `window.__kh` (must stay last) |
| `sw.js` | offline cache (`CACHE` version + `ASSETS` list) |
| `lib/trystero.min.js` | WebRTC lib, loaded on demand by `loadPeer()` |
| `fonts/`, `icons/`, `manifest.webmanifest` | static assets |

## How the scripts fit together
- Classic `<script src>` tags (no ES modules), all `'use strict'`, loaded in this order:
  engine, skills, ai, ui, shop, profile, mp, render, main. They share one global scope: top-level `const`/`let`/`function`
  of one file are visible in all others.
- Code that runs at load time may only use things from the same or earlier files
  (functions from later files are not defined yet). Calls inside functions are fine.
- New top-level names must not clash with existing ones (or with browser globals like `name`, `top`, `screen`).
- New file: add a `<script>` tag in `index.html` in the right order **and** add it to `ASSETS` in `sw.js`.

## Working rules
- Big files: never read them whole. `grep -n` first, then read with offset/limit; change with Edit, not by rewriting the file.
- One phase = one commit; afterwards a short summary (max. 5 lines).
- All numbers (curves, costs, thresholds, probabilities) live in **one** table (`SKILLS`/`BAL`), never scattered in code.
- Check every probability with a headless Node script (10k rolls) against the target values, not by playing.
- Debug URL params: `?ovr=99` = all skills 99 for this page load (not saved), `?seed=1` = deterministic `RNG` for skill rolls; `?bc` = multiplayer over BroadcastChannel (same browser), `?lag=ms`, `?relay=`.
- Saving: use the existing `store.get/set` (keys are stored as `knochenhart.*`).
- Offline/PWA must keep working: on every change to cached files bump `CACHE` in `sw.js`; new files go into `ASSETS`.
- No behaviour changes in refactors; keep the UI language and style as is.

## Testing
- Serve the repo root with any static server (e.g. `python3 -m http.server`) and open `index.html`.
- Debug handle in the console: `window.__kh` (`G`, `MP`, `AI`, `ball`, `startGame`, `onSwipe`, `onTap`, ...).
- Node checks live in `tests/` (no npm deps): `node tests/skills.test.js`, `node tests/profile.test.js`, `node tests/probabilities.test.js` (all skill rolls, 10k each), `node tests/sim-progress.js` (days until all skills 99). Exit code != 0 = fail.
- Playwright is available in the dev container for browser smoke tests.
- Skill effects are singleplayer only so far; `js/mp.js` still uses the old fixed rules (`BAL.stuff`, `BAL.meterMax`).
