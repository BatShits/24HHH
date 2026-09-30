# Working on this repo

Offline PWA for 24 Hours of Horseshoe Hell (Zack and his partner). Served by GitHub Pages from `/docs`. No build tooling or dependencies: plain HTML/CSS/JS.

- After changing anything in `docs/` or `data-src/`, run `python3 tools/build_data.py`. It regenerates `docs/data/*.json`, and stamps a new version into `docs/sw.js` and `docs/version.js` so phones pick up the update.
- Keep it working offline: every new file the app needs must be added to `SHELL` in `docs/sw.template.js` (edit the template, never `docs/sw.js`).
- Map tiles: USGS National Map, native max zoom 16; the app overzooms to 19. Offline region is `BBOX` in `docs/map.js`.
- Notes live in each phone's localStorage (`hhh.notes`). Exports are JSON files `hhh-notes-<climber>-<date>.json`; merge them into `data-src/` when Zack sends one.
- Don't commit verbatim Mountain Project comment text (the repo is public); keep derived numbers and short area notes only.
- Times shown to users use 12-hour format (1:30 pm). Filenames use ISO dates.
