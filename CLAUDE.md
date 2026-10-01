# Working on this repo

Offline PWA for 24 Hours of Horseshoe Hell (Zack and his partner). Served by GitHub Pages from `/docs`. No build tooling or dependencies: plain HTML/CSS/JS.

- After changing anything in `docs/` or `data-src/`, run `python3 tools/build_data.py`. It regenerates `docs/data/*.json`, and stamps a new version into `docs/sw.js` and `docs/version.js` so phones pick up the update.
- Keep it working offline: every new file the app needs must be added to `SHELL` in `docs/sw.template.js` (edit the template, never `docs/sw.js`).
- Map tiles: USGS National Map, native max zoom 16; the app overzooms to 19. Offline region is `BBOX` in `docs/map.js`.
- Notes live in each phone's localStorage (`hhh.notes`). Exports are JSON files `hhh-notes-<climber>-<date>.json`; merge them into `data-src/` when Zack sends one.
- Don't commit verbatim Mountain Project comment text (the repo is public); keep derived numbers and short area notes only.
- Times shown to users use 12-hour format (1:30 pm). Filenames use ISO dates.
- Planner (`docs/plan.js`): recommends a plan from format (12/24), goal with target (laps / points / feet, or an achievement), side goals, per-climber division (defaults from profile project grade), intensity (Don't Hurt Me / Bring it On! / I am Death Incarnate!!) and options; one counted lap per route per climber. Wall-level rolling-horizon optimizer (45 min look-ahead, walking weighted 1.5x); coverage goals first build a zone tour (nearest neighbour + 2-opt) and follow it. No user-specific pace: `build()` binary-searches a lead-time multiplier (paceF) for the slowest steady pace that still meets the target; the UI shows required pace as target laps / event hours (laps per hour per climber). Walking: straight line x1.3 at a push-level speed (50 / 90 / 140 m/min: stroll, fast walk, jog) plus 2 / 1 / 0.5 min; replace with trail distances once trails exist. Check-ins: the plan walks to `CHECKIN_LOC` (one Trading Post point until the four station locations are known) from wherever it is when the window opens, 10 min there, then walks on. Breaks: `plan.breakMin` minutes once an hour, defaulting from push level (15 / 5 / 0).
- Zone map (`data-src/aspects.py` ZONE_OF): 14 zones confirmed from Zack's 2026 results, the rest provisional. Specials: #10 Hickadelic Jazzgrass, #651 Orange Crush.
- Quick optimizer testing without a browser: load `docs/sun.js` and `docs/plan.js` in Node with a stub ctx; `Planner(...)._opt(plan)` and `._tl(plan)`.
