# Horseshoe Hell Field Guide

Offline phone app for planning and climbing 24 Hours of Horseshoe Hell at Horseshoe Canyon Ranch, Arkansas.

**Open it:** https://batshits.github.io/24HHH/ (after GitHub Pages is turned on, see below)

## What it does
- Every route on the 2026 comp scorecard (plus Mountain Project routes not on it), with comp points, style, height and walking order.
- Mountain Project grade analysis: crowd grade votes, first-try send rates, and soft/stiff/reach/polish mentions, rolled into a soft / on grade / stiff verdict and a points-bargain score.
- Sun clock: pick a date and time, and every route and wall shows sun, partial sun, shade or dark, calculated for the ranch from each wall's direction.
- Map on USGS topo or aerial imagery, with wall markers colored by sun and shade. "Save map for offline" stores the ranch tiles on the phone.
- Per-climber notes (status, how the grade felt, beta) saved on the phone, with export/import.
- Headlamp red mode for night laps.

## Install on a phone
1. Open the link above with signal.
- **iPhone:** in Safari, tap Share, then Add to Home Screen.
- **Android:** in Chrome, tap the menu, then Install app (or Add to Home screen).
2. Open the app from the home screen once, then open the Notes tab and tap **Save map for offline**.
After that it works with no signal. Updates download automatically the next time the app opens with signal.

## Turn on GitHub Pages (one time)
Repo **Settings > Pages**: Source **Deploy from a branch**, Branch **main**, folder **/docs**, Save. The repo must be public on a free GitHub plan.

## Layout
- `docs/` the app (static files served by GitHub Pages)
- `docs/data/routes.json`, `areas.json` generated data
- `data-src/` source tables (route master CSV, target list, comp positions, wall aspects)
- `tools/build_data.py` rebuilds `docs/data/*` and stamps the version into `docs/sw.js`

Data sources: 2026 Horseshoe Hell scorecard (horseshoehellapp.com), Mountain Project (pulled Sep 30, 2026), USGS The National Map (public domain map tiles).
