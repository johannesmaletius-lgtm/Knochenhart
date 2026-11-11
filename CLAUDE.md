# Volleyskull (Knochenhart)

Browser volleyball game (2 vs 2 skeletons), PWA, no build step, no framework. Plain HTML/CSS/JS.
Project plan and fixed game rules: `docs/FABLE_PROMPTS.md`.

## File map
| File | Content |
|---|---|
| `index.html` | markup + CSS (menus, shop, skills, scoreboard, MP lobby, overlays), loads the scripts below, registers `sw.js` |
| `js/engine.js` | helpers (`$`, `clamp`, `lerp`, `rand`), `store`, pixel font + `text()`, drawing primitives, camera `CAM`/`proj`, world constants (`LX`, `DZ`, ...), `POSES`, figures (`me`, `mate`, `oA`, `oB`, `FIGS`), `ball`, particles/popups, sound `SFX`, game state `G`, hints, balance `BAL`, rally setup, our defense/attack/serve (skill hooks: timing tiers, faults, dive, lob aim, float, fireball lock, `hitPop` EARLY/LATE), `point()` |
| `js/skills.js` | `SKILLS` table (skills 60..99, OVR, costs, income, timing/net-fault/recycle curves, unlocks, perks, dig/dive/mate block, AI profile), helpers (`ovr`, `levelCost`, `unlocked`, `perk`), pure P3 decisions (`timingErr`, `hitTier`, `hitFault`, `blockRoll`, `stuffChance`, `recycleP`, `lateSaveP`, `diveReach`, `fireMax`, `aiProfile`), `PROFILE` (`knochenhart.skills`), `?ovr=NN`, `RNG` (`?seed=N`); also a Node module |
| `js/hybrid.js` | P4 Hybrid MP rules, pure (`hyRotate`, `hySlot`/`hyFig`/`hyCtl`, `hyPlan`, `hyTouch`, `hySetLane`, `hyLaneResult`, `hyAttackDir`, `hyLobLane`, bot mates); numbers in `SKILLS.hy`; also a Node module |
| `js/ai.js` | opponent brain `AI`/`PLANS`, opponent serve, opponent offense (pass, set, attack), our net block vs. it (`mateGraze`, `mateStuff`) |
| `js/ui.js` | menu demo, game lifecycle (`startGame`, `gameOver`, pause), input (`onSwipe`, `onTap`, pointer/keys), menu button wiring |
| `js/shop.js` | coins, `SKINS`, skull portraits `skinIcon`, unlock progress, shop screen, confetti |
| `js/profile.js` | player id `PID` + name (`knochenhart.pid/name`), local leaderboard (`lbAdd`/`leaderboardAdd`, `knochenhart.board`), P5 peer profiles (`profClean`/`profWire`/`meetNew`), skill screen `#skillOv` (levels, OVR, radar, badge perks); pure helpers also a Node module |
| `js/skillgames.js` | P6 Skill Games: pure budget/spend/check/auto spread (`sgBudget`, `sgUp`/`sgDown`, `sgCheck`, `sgAuto`, `sgEnter`/`sgLeave`; Node module), SP flow (`#sgBtn`, `SG`), MP spend round (`mpGoReq`, `sgMp*`, msgs `sgo`/`sgp`/`sgr`); numbers `SKILLS.sg` |
| `js/campaign.js` | P7 campaign: pure ladder (`caStatus`/`caWin`/`caReward`/`caNext`, `caProfile` OVR+focus, `caDiff` AI level + `D()` base, `caLoad`/`caSave` `knochenhart.camp`; Node module), SP flow (`#caBtn`, `#campOv`, `CA`, `caStart`/`caOver`/`caEnd`); numbers `SKILLS.camp` |
| `js/social.js` | P5: MP profiles (`mpProfIn`/`mpProfSlots`, lobby card `#mpCard`), met players -> board (`playerMet`), emotes (`#emoBtn`/`#emoMenu`, `emoteGate`, `drawEmotes`); numbers `SKILLS.social` |
| `js/mp.js` | multiplayer: `MP` state, transport (Trystero/WebRTC, BroadcastChannel with `?bc`), lobby (+ Hybrid toggle `#mpHy`), host match rules (`mp*`, Hybrid hooks `st.hy`), input relay, snapshot sync, MP UI wiring |
| `js/render.js` | canvas rendering (`render()`, figures, net, ball, HUD), HTML scoreboard `BD`/`updBoard`, dither fade, main loop (`update`, `frame`) |
| `js/main.js` | sizing (`resize`), `boot()`, debug handle `window.__kh` (must stay last) |
| `sw.js` | offline cache (`CACHE` version + `ASSETS` list) |
| `lib/trystero.min.js`, `fonts/`, `icons/`, `manifest.webmanifest` | WebRTC lib (loaded on demand by `loadPeer()`), static assets |

## How the scripts fit together
- Classic `<script src>` tags (no ES modules), all `'use strict'`, loaded in this order: engine, skills, hybrid, ai, ui, shop, profile, skillgames, campaign, mp, social, render, main. They share one global scope: top-level `const`/`let`/`function`
  of one file are visible in all others.
- Load-time code may only use the same or earlier files; calls inside functions are fine.
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
- Serve the repo root with any static server (`python3 -m http.server`); Playwright is available. Console: `window.__kh` (`G`, `MP`, `SG`, `CA`, `prof()`, `slotProf`, `caForceWin(i)`, ...).
- Node checks live in `tests/` (no npm deps): `node tests/skills.test.js`, `node tests/profile.test.js`, `node tests/probabilities.test.js` (all skill rolls, 10k each), `node tests/hybrid.test.js` (P4 rules), `node tests/social.test.js` (P5 profile cleaning, board dedupe, emote limit), `node tests/skillgames.test.js` (P6), `node tests/campaign.test.js` (P7), `node tests/sim-progress.js` (days to 99, also with campaign bonus). Exit code != 0 = fail.
- MP test: two tabs with `?bc` in one browser context (create, `#mpHy`, join with the code, Start). They share localStorage
  (same `pid`): give the 2nd page its own in-memory `localStorage` via an init script to test profiles/board.
- P5 profiles: join sends `{t:'prof'}` (`profWire`), host cleans it (`profClean`: skills 60..99, known perks, name) into
  `MP.slots[i].prof` and resyncs; clients clean the lobby list again. Emotes: `{t:'emo'}` -> host limit per slot -> fx `emo`.
- Classic MP also uses the skills since P5 (spike/lob tiers + net faults, recycle); EARLY/LATE pops stay Hybrid-only. Hybrid (host decides, `MP.st.hy`): `MP.rot` = rotation
  (side-out rotates the team winning the serve, applied at next `mpRally`), `st.sw[t]` = front player dug -> back sets, front
  attacks (`hitIx`); `MP.fig` = my position, `MP.role` = my controls. Skills per slot: `slotProf(i)` reads `MP.slots[i].prof`
  (filled on join; default `SKILLS.hy.defLv` 60, bots `aiProfile`): spike/lob tiers + net faults, recycle vs. stuff. EARLY/LATE via fx `hp`.
- Hybrid decisions: lanes are team-local 0 left / 1 middle / 2 right ("hinten" = right lane, back set over the setter);
  tap = middle; straight up = dump; hitter may change lane until `laneLock` s before the hit, then one lane off = free ball
  ("Danke-Ball"), two off = floor. Aimed lob ↖/↗ needs no Lob 75 in Hybrid. Double touch is a guard (`mpContact`), the
  dig -> set -> attack plan avoids it; the block counts as the blocking team's touch. Bot setters set the hitter's lane.
- P6 Skill Games: temp profile (`tmp`+`sg`, all 60, budget = `share` x `totalCost()`) edited on `#skillOv` (`pfSG` mode). SP swaps `PROFILE`
  for the match (`sgEnter`), `gameOver`/`menuScene` swap back; computer = `SG.opp`. MP: host `sgCheck`s into `MP.st.sgp` (wins in `slotProf`), never `prof`/board. Coins as normal (`coinMul` 1).
- P7 Campaign: real `PROFILE`; `caStart` sets `oA/oB.skin`, `CA.opp` (`oppProf`), `G.level` (unsaved, `caEnd` restores) + `CA.d` (`D()`). Win: normal coins + stage bonus (full once), next stage, Again = Next; no menu record.
