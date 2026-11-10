# Volleyskull: Skill-System & Hybrid-Multiplayer (Fable-Prompts)

## Arbeitsregeln (vor jeder Phase einmal lesen)
- `index.html` hat ~3400 Zeilen. **Nie komplett lesen.** Erst `grep -n`, dann `Read` mit offset/limit, nur `Edit` (kein Write der ganzen Datei).
- Eine Phase = ein Commit. Danach kurze Zusammenfassung (max. 5 Zeilen), keine langen Erklärungen.
- Alle Zahlen (Kurven, Kosten, Schwellen, Wahrscheinlichkeiten) in **einer** Tabelle (`SKILLS`/`BAL`), nie im Code verstreut.
- Jede Wahrscheinlichkeit per Node-Skript (headless, 10k Würfe) gegen die Soll-Werte prüfen, nicht von Hand spielen.
- Debug-URL-Parameter `?ovr=99&seed=1` zum schnellen Testen.
- Speichern: bestehendes `store.get/set('knochenhart.*')`. Offline/PWA (`sw.js`) muss weiter laufen, bei neuen Dateien Cache-Liste ergänzen.

## Festgelegte Regeln
**Skills (je 60→99, kein Respec):** Schlag, Lob, Annahme, Abwehr, Block, Aufschlag. **OVR** = Durchschnitt (Gewichtung in `SKILLS`).
Hochskillen ca. 3 Tage bei normalem Spielen (Ziel: ~20 Matches/Tag); Kosten pro Level aus Zielkurve ableiten, Münzen sind dieselben wie im Shop.

| Schwelle | Freischaltung |
|---|---|
| Lob 75 | Lob links/rechts platzierbar |
| Block 75 | Split-Block |
| Aufschlag 75 | Float-Aufschlag |
| Abwehr 70 | Hechtbagger |
| Schlag 85 | Fireball |
| Skill 90 | Skill-Badge (ein Perk im selben Bereich, z. B. Schlag: Fireball lädt schneller; Block: größeres Zeitfenster; Annahme: gute Annahme trotz schlechtem Timing) |

**Skill-Wirkung auf Timing:** niedriger Skill = schlechtes Timing wird hart bestraft; hoher Skill = schlechtes Timing liefert trotzdem bessere Annahmen/Angriffe.
**Netzfehler:** 0 % bei Timing besser als "okay", 30 % bei sehr schlechtem Timing, dazwischen linear.
**Block-Anschlag (Angriff berührt den Block):** Basis 5 % (Parameter in `BAL`).
**Block recyceln (abgeblockten Ball noch retten):** hängt am Block-Skill des Blockers: Skill 60 → ~70 %, Skill 90 → ~10 %, 99 → ~3 % (Kurve in `SKILLS`).

**Hybrid-Multiplayer (Option in der Lobby):** Blocker und Verteidiger wechseln die Position mit dem Aufschlag wie im offiziellen Volleyball (Rotation nach Aufschlagwechsel), jeder spielt beide Rollen.
- Niemand spielt den Ball zweimal hintereinander.
- Blocker wehrt ab → hinterer Spieler stellt, Blocker greift an.
- Blocker muss dem Mitspieler zuspielen; Swipe = Lane: diagonal oben links = Mitte, rechts = hinten, links = links. Läuft der Angreifer in eine andere Lane an, fällt der Ball auf den Boden oder kann nur noch gebaggert werden ("Danke-Ball").
- Lob links/rechts (kurzer Ball) als Alternative zum Schlag.
- **Early/Late-Anzeige** bei jedem Treffer. Keine Vibration.

**Modi:** Normal (eigener OVR) · Skill Games (extra Modus: alle starten mit 60er-Char, bekommen die Hälfte der Münzen für Max 99, verteilen sie vor dem Match, dann Match) · Singleplayer-Kampagne (auch hier skillen; Gegner = die einzelnen Skins mit eigenem OVR, aufsteigend).
**Social (lokal, kein Backend):** Rangliste lokal (alle bisher getroffenen Spieler + man selbst), Skill-Chart (Radar) mit allen Skills; tritt jemand der Lobby bei, sieht man seine Skills/OVR. Emotes über Schnellmenü in den oberen Ecken.

## Phasen
**P0 Refactor:** `index.html` in `js/*.js` zerlegen (engine, ai, mp, ui, shop), **keine Verhaltensänderung**. `CLAUDE.md` (max. 60 Zeilen) mit Dateikarte und diesen Arbeitsregeln anlegen. `sw.js` anpassen. Manuell kurzer Smoke-Test (Singleplayer-Punkt, MP-Lobby öffnet).

**P1 Skill-Datenmodell:** `SKILLS`-Tabelle (Kurven, Kosten, Schwellen, Badge-Perks), OVR-Berechnung, Speichern, Einnahmekurve gegen Ziel "3 Tage". Node-Skript simuliert Matches/Tag und gibt Tage bis 99 aus.

**P2 Skill-Tree-UI & Profil:** Skill-Screen im Menü (Münzen → Level), OVR, Radar-Chart, Badge-Auswahl ab 90, Rangliste lokal. Mobile-first, bestehender Look (Silkscreen/Jersey 10).

**P3 Skill-Wirkungen (Singleplayer-Engine):** Timing-Skalierung, Netzfehler 0/30 %, Block-Anschlag 5 %, Block-Recycle-Kurve, Early/Late-Anzeige. Schwellen-Features: Lob platzieren, Split-Block, Float, Hechtbagger, Fireball ab 85. Node-Test für alle Wahrscheinlichkeiten.

**P4 Hybrid-MP:** Rollenrotation, Lane-System, Blocker-Zuspiel, Doppelberührung verboten, Danke-Ball, Lob. Option in der Lobby. Host-autoritativ wie bisher (`mpUpdate`).

**P5 MP-Profile & Emotes:** Profil (Name, OVR, Skills, Badges) beim Join übertragen, in Lobby anzeigen, in lokale Rangliste eintragen. Emote-Schnellmenü in den oberen Ecken.

**P6 Skill Games:** Extra Modus mit Budget-Verteilung vor dem Match (nur für dieses Match, ändert dein Profil nicht).

**P7 Kampagne:** Gegner = Skins mit OVR-Staffel, Fortschritt speichern, Münz-Belohnung.

**P8 Balance-Pass:** Node-Simulation mit 60er vs. 99er und Gleich-OVR, Fehlerquoten und Recycle-Kurve prüfen, Zahlen in `SKILLS` nachziehen.

## Zu prüfen (Annahmen von Claude)
- Lane-Zuordnung der Swipes (oben links = Mitte, rechts = hinten, links = links).
- "Block recyceln" = Angreifer-Team rettet den abgeblockten Ball; Quote hängt am Block-Skill des Blockers.
- Aufschlag ab 90 optional Sprungaufschlag.
