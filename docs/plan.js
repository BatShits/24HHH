/* Plan recommender + editor for 24 Hours of Horseshoe Hell.
   Builds a route-by-route plan for a two-climber team from goals, format, divisions and climber profiles,
   then lets the team edit it and track pace against it. One lap per route per climber counts. */
(function () {
  'use strict';

  const DIVS = {
    rec: { label: 'Recreational (to 5.9, 12-hour only)', max: -0.01 },
    int: { label: 'Intermediate (to 5.10d)', max: 3.99 },
    adv: { label: 'Advanced (to 5.12a)', max: 8.99 },
    eli: { label: 'Elite (5.12b and up)', max: 99 },
  };
  const GOALS = {
    laps: 'Laps (target count)',
    score: 'Score (target points)',
    height: 'Height (target feet)',
    full: 'Full Horseshoe',
    golden: 'Golden Horseshoe',
    qualify: 'Qualify for next year (easiest path)',
  };
  const FORMATS = {
    24: { label: '24-hour', startHour: 10, dur: 24, laps: { full: 70, golden: 100, qualify: 100 }, trad: { golden: 55, qualify: 55 }, pts: { golden: 12000, qualify: 12000 }, zones: 24, ft: 5280, hourBonus: 790,
      checkins: [{ at: 21.5, end: 22.5, label: 'Check-in (9:30–10:30 pm window)' }, { at: 27.5, end: 28.5, label: 'Check-in, eyeballs (3:30–4:30 am window)' }] },
    12: { label: '12-hour', startHour: 7.5, dur: 12, laps: { full: 40, golden: 65, qualify: 65 }, trad: { golden: 40, qualify: 40 }, pts: { golden: 8000, qualify: 8000 }, zones: 12, ft: null, hourBonus: 0,
      checkins: [] },
  };
  const INTENSITY = {
    conservative: { label: "Don't Hurt Me", ceil: [0, -1, -2, -1], hard: 1, walk: 50, walkPrep: 2, breaks: 15, walkName: 'a slow stroll (about 3 km/h)' },
    standard: { label: 'Bring it On!', ceil: [1, 0, -1, 0], hard: 2, walk: 90, walkPrep: 1, breaks: 5, walkName: 'a fast walk (about 5.4 km/h)' },
    aggressive: { label: 'I am Death Incarnate!!', ceil: [2, 1, 0, 1], hard: 3, walk: 140, walkPrep: 0.5, breaks: 0, walkName: 'a steady jog (about 8.4 km/h)' },
  };
  const WHO = ['me', 'partner'];
  const TARGET_DEFAULT = { 24: { laps: 100, score: 12000, height: 5280 }, 12: { laps: 65, score: 8000, height: 3000 } };
  const UNIT = { laps: 'laps', score: 'points', height: 'feet' };
  let WALKW = 2.5;
  const START_AREA = 'The Park';
  // Canyon crossings: West + North walls are one side, East walls the other; the valley floor is neutral.
  const MAX_CROSS = { 12: 1, 24: 2 };
  const CROSS_PEN = [30, 240]; // minutes-equivalent for the first and second crossing (one is best)
  const TUNE = { turns: 1, move: 8, back: 60, valley: 6, reverse: 60, zone: 500, special: 900 }; // minutes-equivalent: any move, returning to a wall already left, valley detours
  // Position along the cliff line, measured round the horseshoe from Crackhouse Alley (southwest) to The Far East (southeast).
  const CANYON_C = { lat: 36.0048, lon: -93.2905 };
  const linePos = a => { if (!a || a.lat == null) return null; const ang = Math.atan2(a.lat - CANYON_C.lat, (a.lon - CANYON_C.lon) * Math.cos(CANYON_C.lat * Math.PI / 180)) * 180 / Math.PI; return ((250 - ang) % 360 + 360) % 360; };
  const sideGroup = side => side === 'East' ? 'E' : side === 'West' || side === 'North' ? 'W' : null;
  // Check-in point. The rules mention four stations without locations; until they're known, use the Trading Post on the valley floor.
  const CHECKIN = '__checkin';
  const CHECKIN_LOC = { lat: 36.0046, lon: -93.2926, name: 'check-in at the Trading Post' }; // starting line by the Trading Post on the valley floor

  window.Planner = function (ctx) {
    const { $, el, store, GU, profiles, ROUTES, AREAS, ui } = ctx;
    const byId = Object.fromEntries(ROUTES().map(r => [r.id, r]));
    const comp = () => ROUTES().filter(r => r.n);

    // ---------- storage ----------
    let state = store.get('hhh.plans', null);
    if (!state || !Array.isArray(state.plans)) state = { active: null, plans: [] };
    // Event hours are fixed by the rules: 12-hour 7:30 am to 7:30 pm, 24-hour 10:00 am to 10:00 am.
    const fixStart = p => { if (p && FORMATS[p.format]) p.start = FORMATS[p.format].startHour; return p; };
    state.plans.forEach(fixStart);
    const save = () => store.set('hhh.plans', state);
    const active = () => state.plans.find(p => p.id === state.active) || null;

    // ---------- dates ----------
    function compFriday(year) { // last full weekend of September -> Friday
      for (let d = 29; d >= 1; d--) { const dt = new Date(Date.UTC(year, 8, d)); if (dt.getUTCDay() === 6 && d + 1 <= 30) return new Date(Date.UTC(year, 8, d - 1)); }
    }
    function defaultDate(fmt) {
      const now = new Date(); let y = now.getFullYear();
      let f = compFriday(y); if (now > new Date(f.getTime() + 86400000 * 2)) f = compFriday(++y);
      if (fmt === '12') f = new Date(f.getTime() - 86400000);
      return f.toISOString().slice(0, 10);
    }
    function dh(plan, abs) { // absolute hours since plan date midnight -> {ymd, hour}
      const [y, m, d] = plan.date.split('-').map(Number);
      const day = Math.floor(abs / 24); const dt = new Date(Date.UTC(y, m - 1, d + day));
      return { ymd: dt.toISOString().slice(0, 10), hour: abs - day * 24, wd: dt.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }) };
    }
    const fmtAbs = (plan, abs, wd) => { const x = dh(plan, abs); return (wd && Math.floor(abs / 24) ? x.wd + ' ' : '') + Sun.fmt(x.hour); };
    function nowAbs(plan) {
      const ct = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      const [y, m, d] = plan.date.split('-').map(Number);
      return (ct - new Date(y, m - 1, d)) / 3600000;
    }
    function clockAbs(plan) {
      const [y, m, d] = plan.date.split('-').map(Number); const [y2, m2, d2] = ui.date.split('-').map(Number);
      return (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y, m - 1, d)) / 3600000 + ui.hour;
    }
    function light(plan, abs) {
      const x = dh(plan, abs); const a = Sun.position(Sun.instant(x.ymd, x.hour)).alt;
      return a > -0.8 ? 'day' : a > -6 ? 'dusk' : 'night';
    }

    // ---------- climbers ----------
    function defaultDiv(p, fmt) {
      if (!p || !p.project) return 'int';
      const g = GU(p.project);
      if (g < 0) return fmt === '24' ? 'int' : 'rec';
      if (g <= 3) return 'int'; if (g <= 8) return 'adv'; return 'eli';
    }
    function climber(plan, key) {
      const p = profiles[key] || {};
      const os = p.onsight ? GU(p.onsight) : -1, pg = p.project ? GU(p.project) : Math.max(os + 2, 1);
      return { key, name: p.name || (key === 'me' ? 'You' : 'Partner'), os, pg, ht: +p.ht || 0, ape: +p.ape || 0, div: (plan.divs && plan.divs[key]) || defaultDiv(p, plan.format), raw: p };
    }
    function ceilingAt(plan, c, rel) { // grade ceiling for this climber at fraction of event elapsed
      const I = INTENSITY[plan.intensity] || INTENSITY.standard;
      const phase = rel < 0.25 ? 0 : rel < 0.6 ? 1 : rel < 0.9 ? 2 : 3;
      return Math.min(c.os + I.ceil[phase], c.pg, DIVS[c.div].max);
    }
    function reachBlocked(r, c) {
      if (!r.reach || !c.ht) return false;
      const span = c.ht + c.ape, many = r.reach >= 4;
      return span <= 64 || (many && span <= 66);
    }
    // Minutes for one clean lead including tie-in, clipping and lowering.
    // Calibrated to the 2026 12-hour: 55 routes each (both led every route) = about 13 min per route for the pair, walking included.
    function leadMin(plan, r, c, abs, pre) {
      const rel = (r.gu ?? 0) - c.os;
      const rate = rel <= -3 ? 18 : rel <= -2 ? 15 : rel <= -1 ? 12 : rel <= 0 ? 9 : rel <= 1 ? 7 : 5; // ft per minute
      let m = 1.5 + (r.ht || 45) / rate + 1;
      if (r.type === 'trad') m = m * 1.35 + 3;
      const lt = pre ? pre.lt : light(plan, abs); if (lt !== 'day') m *= 1.15;
      const hrs = abs - plan.start; if (hrs > 12) m *= 1.1; if (hrs > 18) m *= 1.1;
      return m * (plan.paceF || 1);
    }
    const locOf = a => a === CHECKIN ? CHECKIN_LOC : AREAS()[a];
    const placeName = a => a === CHECKIN ? CHECKIN_LOC.name : a;
    // Walking minutes between two walls. Speed follows the push level; distance is straight line x1.3 for trail winding until trails are mapped.
    function walkMin(a, b, plan) {
      if (!a || a === b) return 0;
      const A = locOf(a), B = locOf(b);
      const I = INTENSITY[plan && plan.intensity] || INTENSITY.standard;
      const da = a === CHECKIN ? (B && B.d && B.d[CHECKIN]) : (A && A.d && A.d[b === CHECKIN ? CHECKIN : b]);
      if (da != null) return I.walkPrep + da / I.walk; // trail distance (OpenStreetMap network)
      if (!A || !B || A.lat == null || B.lat == null) return I.walkPrep + 450 / I.walk;
      const R = 6371000, toR = Math.PI / 180;
      const d = 2 * R * Math.asin(Math.sqrt(Math.sin((B.lat - A.lat) * toR / 2) ** 2 + Math.cos(A.lat * toR) * Math.cos(B.lat * toR) * Math.sin((B.lon - A.lon) * toR / 2) ** 2));
      return I.walkPrep + d * 1.3 / I.walk;
    }
    const breakMin = plan => plan.breakMin != null ? plan.breakMin : (INTENSITY[plan.intensity] || INTENSITY.standard).breaks;
    function sunAt(plan, r, abs) {
      const a = AREAS()[r.area]; if (!a) return 'varies';
      const x = dh(plan, abs); return Sun.state(a.aspect, a.shady, x.ymd, x.hour);
    }

    // ---------- timeline + stats ----------
    function fixedEvents(plan) {
      const F = FORMATS[plan.format];
      return F.checkins.map(c => ({ kind: 'checkin', at: c.at, min: 10, label: c.label })).filter(e => e.at >= plan.start && e.at < plan.start + F.dur);
    }
    // Shared clock for check-ins and hourly breaks, used by both the timeline and the optimizer.
    function fixedClock(plan) {
      const ev = fixedEvents(plan), bm = breakMin(plan);
      return { ei: 0, nextBreak: plan.start + 1,
        // advance st = {t, area} past any check-in or break that's due; returns rows describing them
        step(st) {
          const out = [];
          for (let guard = 0; guard < 6; guard++) {
            const e = ev[this.ei];
            if (e) {
              const w = walkMin(st.area, CHECKIN, plan);
              if (st.t + w / 60 >= e.at) { // leave in time to arrive as the window opens
                this.ei++;
                if (w) { out.push({ kind: 'walk', t0: st.t, t1: st.t + w / 60, from: st.area, to: CHECKIN, light: light(plan, st.t) }); st.t += w / 60; }
                out.push({ kind: 'checkin', t0: st.t, t1: st.t + e.min / 60, label: e.label, area: CHECKIN });
                st.t += e.min / 60; st.area = CHECKIN; continue;
              }
            }
            if (bm > 0 && st.t >= this.nextBreak) {
              out.push({ kind: 'break', t0: st.t, t1: st.t + bm / 60, label: 'Break', area: st.area, auto: true });
              st.t += bm / 60; this.nextBreak = plan.start + Math.floor(st.t - plan.start) + 1; continue;
            }
            break;
          }
          return out;
        } };
    }
    function blankStats(plan) {
      const s = {};
      for (const k of WHO) s[k] = { pts: 0, laps: 0, ft: 0, trad: 0, zones: new Set(), specials: new Set(), east: false, hours: new Set(), done: new Set(), hardHour: {} };
      return s;
    }
    function applyRoute(plan, stats, r, who, t1) {
      const hr = Math.floor(t1 - plan.start);
      for (const k of who) {
        const s = stats[k]; if (s.done.has(r.id)) continue;
        s.done.add(r.id); s.laps++; s.pts += r.pts || 0; s.ft += r.ht || 0; if (r.type === 'trad') s.trad++;
        if (r.zn != null) s.zones.add(r.zn); if (r.sp) s.specials.add(r.sp); if (r.side === 'East') s.east = true;
        s.hours.add(hr);
      }
    }
    function timeline(plan, items, upto) {
      const F = FORMATS[plan.format], end = plan.start + F.dur;
      const clock = fixedClock(plan);
      const rows = [], stats = blankStats(plan);
      let t = plan.start, area = START_AREA;
      const n = upto == null ? items.length : upto;
      const flushEvents = () => { const st = { t, area }; rows.push(...clock.step(st)); t = st.t; area = st.area; };
      for (let i = 0; i < n; i++) {
        const it = items[i];
        flushEvents();
        if (it.type === 'break') { rows.push({ kind: 'break', t0: t, t1: t + it.min / 60, label: it.label || 'Break', i, area }); t += it.min / 60; continue; }
        const r = byId[it.rid]; if (!r) continue;
        const w = walkMin(area, r.area, plan);
        if (w) { rows.push({ kind: 'walk', t0: t, t1: t + w / 60, from: area, to: r.area, light: light(plan, t + w / 120) }); t += w / 60; }
        const who = it.who.filter(k => WHO.includes(k));
        let m = 1; for (const k of who) m += leadMin(plan, r, climber(plan, k), t);
        const row = { kind: 'route', t0: t, t1: t + m / 60, r, who, i, area: r.area, sun: sunAt(plan, r, t), light: light(plan, t), done: it.done };
        rows.push(row); t = row.t1; area = r.area;
        applyRoute(plan, stats, r, who, t);
      }
      if (upto == null) flushEvents();
      return { rows, stats, t, area, end, clock };
    }
    const normRows = tl => tl;

    function achievements(plan, s) {
      const F = FORMATS[plan.format], fmt = plan.format;
      const allZones = fmt === '24' ? s.zones.size >= 24 : s.zones.size >= 12;
      const full = s.laps >= F.laps.full && allZones && s.specials.size >= 2;
      const hoursAll = Array.from({ length: F.dur }, (_, h) => s.hours.has(h)).every(Boolean);
      const total = s.pts + (s.east ? 300 : 0) + (hoursAll ? F.hourBonus : 0); // the app's total_score includes bonuses
      const golden = full && s.laps >= F.laps.golden && s.trad >= F.trad.golden && total >= F.pts.golden && (fmt === '24' || s.zones.size >= 24);
      const qual = full || s.laps >= F.laps.qualify || s.trad >= F.trad.qualify || total >= F.pts.qualify || (F.ft && s.ft >= F.ft);
      return { full, golden, qual, hoursAll, allZones };
    }
    function bonusPts(plan, s, a) { return (s.east ? 300 : 0) + (a.hoursAll && FORMATS[plan.format].hourBonus ? FORMATS[plan.format].hourBonus : 0); }

    // ---------- optimizer ----------
    function optimize(plan, keep) {
      const F = FORMATS[plan.format], end = plan.start + F.dur;
      const items = plan.items.slice(0, keep);
      const tl = normRows(timeline(plan, items));
      let t = tl.t, area = tl.area; const stats = tl.stats;
      const clock = tl.clock;
      const cl = Object.fromEntries(WHO.map(k => [k, climber(plan, k)]));
      const I = INTENSITY[plan.intensity] || INTENSITY.standard;
      const pool = comp().filter(r => r.gu != null || r.g === 'Easy 5th');
      const goal = plan.goal === 'qualify' ? 'full' : plan.goal;
      const byArea = {};
      for (const r of pool) (byArea[r.area] ||= []).push(r);
      const GRP = {}; for (const r of pool) if (GRP[r.area] === undefined) GRP[r.area] = sideGroup(r.side);
      const POS = {}; for (const a of Object.keys(byArea)) POS[a] = GRP[a] ? linePos(AREAS()[a]) : null;
      const WZ = {}; for (const r of pool) if (r.zn != null) (WZ[r.area] ||= new Set()).add(r.zn);
      let dir = 0, lastPos = null, turns = 0; // sweep direction along the cliff line; reversing costs extra and is limited
      const maxCross = MAX_CROSS[plan.format] ?? 1;
      // side state carried over from any kept items
      let curG = null, crossings = 0; const left = new Set(); let prevA = START_AREA;
      for (const it of items) { const r = it.rid && byId[it.rid]; if (!r) continue; const g = sideGroup(r.side);
        if (g && curG && g !== curG) crossings++; if (g) curG = g; if (r.area !== prevA) left.add(prevA); prevA = r.area; }
      // coverage goals: plan a walking tour through every zone first (nearest neighbour + 2-opt), then follow it
      let tour = [];
      if (goal === 'full' || goal === 'golden') {
        const need = plan.format === '24' || goal === 'golden' ? 24 : 12;
        const rep = {}; // zone -> wall to visit for it (specials' walls win)
        for (const r of pool) {
          if (r.zn == null) continue;
          if (r.sp) { rep[r.zn] = r.area; continue; }
          if (!rep[r.zn] || (!pool.some(x => x.sp && x.zn === r.zn) && (byArea[r.area].length > byArea[rep[r.zn]].length))) rep[r.zn] = r.area;
        }
        let zones = Object.keys(rep).map(Number).filter(z => !WHO.every(k => stats[k].zones.has(z)));
        if (need === 12) { // 12-hour: the 12 zones nearest the start, plus the specials' zones
          const sp = pool.filter(r => r.sp).map(r => r.zn);
          zones.sort((a, b) => walkMin(START_AREA, rep[a], plan) - walkMin(START_AREA, rep[b], plan));
          zones = [...new Set([...sp, ...zones])].slice(0, Math.max(12, sp.length));
        }
        // one crossing: finish every zone on one side, then cross once. Start on the side that's in shade first
        // (east-facing West side is shady in the afternoon, west-facing East side in the morning), or where we already are.
        const zg = z => GRP[rep[z]];
        const first = curG || (dh(plan, t).hour < 10 ? 'E' : 'W'), second = first === 'W' ? 'E' : 'W';
        const segs = [zones.filter(z => zg(z) !== second), zones.filter(z => zg(z) === second)];
        let cur = area;
        for (const seg of segs) {
          const start = cur, todo = new Set(seg); let part = [];
          while (todo.size) { let bz = null, bd = 1e9; for (const z of todo) { const d = walkMin(cur, rep[z], plan); if (d < bd) { bd = d; bz = z; } } part.push(bz); todo.delete(bz); cur = rep[bz]; }
          const cost = tr => tr.reduce((acc, z, i) => acc + walkMin(i ? rep[tr[i - 1]] : start, rep[z], plan), 0);
          for (let pass = 0, improved = true; improved && pass < 30; pass++) {
            improved = false;
            for (let i = 0; i < part.length - 1; i++) for (let j = i + 1; j < part.length; j++) {
              const nt = part.slice(0, i).concat(part.slice(i, j + 1).reverse(), part.slice(j + 1));
              if (cost(nt) + 0.01 < cost(part)) { part = nt; improved = true; }
            }
          }
          tour.push(...part); if (part.length) cur = rep[part[part.length - 1]];
        }
        tour.zg = zg;
      }
      const nextZones = () => { const open = tour.filter(z => !WHO.every(k => stats[k].zones.has(z))); return new Set(open.slice(0, 2)); };
      const dayHard = plan.format === '24' && !!plan.dayHard;
      const earlyHard = plan.format === '24' && !!plan.earlyHard; // harder climbs only in the first 12 hours
      const H = plan.horizon ?? 45; // minutes of climbing used to judge a wall
      let guard = 0;
      while (t < end - 0.08 && guard++ < 500) {
        { const st = { t, area }; clock.step(st); if (st.area !== area) dir = 0; t = st.t; area = st.area; }
        const rel = (t - plan.start) / F.dur, hr = Math.floor(t - plan.start);
        const pre = { lt: light(plan, t) }; const hh = dh(plan, t).hour;
        const ceil = Object.fromEntries(WHO.map(k => [k, ceilingAt(plan, cl[k], rel)]));
        const nz = nextZones();
        // may we cross now? Coverage plans cross only once this side's tour zones are done.
        const openTour = tour.filter(z => !WHO.every(k => stats[k].zones.has(z)));
        const tourSide = openTour.length ? tour.zg(openTour[0]) : null;
        // value of one route for the team right now (no walking)
        const evalRoute = (r, tt, seen) => {
          const who = [];
          for (const k of WHO) {
            const c = cl[k], s = stats[k];
            if (s.done.has(r.id)) continue;
            const gu = r.gu ?? -6;
            if (gu > DIVS[c.div].max || gu > ceil[k] + 0.01) continue;
            if (plan.reach !== false && reachBlocked(r, c)) continue;
            if (gu > c.os && (s.hardHour[hr] || 0) >= I.hard) continue;
            if (dayHard && pre.lt !== 'day' && gu >= c.os) continue;
            if (earlyHard && tt - plan.start >= 12 && gu >= c.os) continue;
            who.push(k);
          }
          if (!who.length) return null;
          let mins = 1; for (const k of who) mins += leadMin(plan, r, cl[k], tt, pre);
          let v = 0;
          for (const k of who) {
            const s = stats[k]; let x;
            if (goal === 'score') x = r.pts || 0;
            else if (goal === 'laps') x = 120;
            else if (goal === 'height') x = (r.ht || 40) * 3;
            else {
              x = s.laps < F.laps[goal === 'golden' ? 'golden' : 'full'] ? 300 : 0;
              x += (r.pts || 0) * (goal === 'golden' ? 0.6 : 0.2);
              const needZone = plan.format === '24' || goal === 'golden' || s.zones.size < 12;
              if (r.zn != null && needZone && !s.zones.has(r.zn) && !(seen && seen.has(k + 'z' + r.zn))) x += !tour.length || nz.has(r.zn) ? TUNE.zone : 150;
              if (r.sp && !s.specials.has(r.sp)) x += !tour.length || nz.has(r.zn) || s.zones.has(r.zn) ? TUNE.special : 150; // don't leave a special's wall without it
              if (goal === 'golden' && r.type === 'trad' && s.trad < F.trad.golden) x += 220;
            }
            if (plan.side.east && !s.east && r.side === 'East' && !(seen && seen.has(k + 'east'))) x += goal === 'score' ? 300 : 900;
            if (plan.side.over60 && (r.ht || 0) >= 60) x *= 1.3;
            if (plan.side.soft && r.v && r.v.includes('soft')) x *= 1.15;
            if (r.v && r.v.includes('stiff')) x *= 0.85;
            if (earlyHard && tt - plan.start < 12 && (r.gu ?? -6) >= cl[k].os - 1) x *= 1.25 + 0.15 * Math.max(0, (r.gu ?? -6) - cl[k].os);
            if (dayHard && pre.lt === 'day' && (r.gu ?? -6) >= cl[k].os - 1) x *= 1.25 + 0.15 * Math.max(0, (r.gu ?? -6) - cl[k].os);
            v += x;
          }
          if (pre.lt !== 'day' && r.type === 'trad') v *= 0.8;
          return { r, who, mins, v };
        };
        // score each wall: best routes there for about H minutes, against the walk to reach it.
        // First pass keeps the sweep (at most TUNE.turns turnarounds per side); relax only if nothing fits.
        let best = null, bestRate = 0;
        for (const strict of [true, false]) { if (best) break;
        for (const [a, rs] of Object.entries(byArea)) {
          const w = walkMin(area, a, plan);
          if (t + (w + 5) / 60 > end) continue;
          const g = GRP[a]; let pen = 0;
          if (g && curG && g !== curG) {
            if (crossings >= maxCross) continue;
            if (crossings >= 1 && end - t < 3) continue; // no second crossing late in the event
            if (tourSide && tourSide === curG) continue;
            pen += CROSS_PEN[Math.min(crossings, CROSS_PEN.length - 1)];
          } else if (tourSide && g && g !== tourSide && !curG) continue;
          // coverage plans follow the zone tour in order: no skipping ahead to a later zone's wall
          if (openTour.length && WZ[a] && !WZ[a].has(openTour[0]) && [...WZ[a]].some(z => openTour.includes(z))) continue;
          if (a !== area) pen += TUNE.move;          // every move costs setup time
          if (left.has(a)) pen += TUNE.back;
          const rev = dir && POS[a] != null && lastPos != null && Math.abs(POS[a] - lastPos) > 2 && Math.sign(POS[a] - lastPos) !== dir;
          if (rev) { if (strict && turns >= TUNE.turns) continue; pen += TUNE.reverse; }
          if (strict && left.has(a) && !rev && a !== area) continue; // never double back past a wall without turning round        // going back to a wall already left
          if (GRP[a] === null && a !== area) pen += TUNE.valley; // detours onto the valley floor
          let sunF = 1;
          if (plan.avoidSun !== false && hh >= 10.5 && hh <= 17.5) { const st = sunAt(plan, rs[0], t + w / 60); sunF = st === 'sun' ? 0.55 : st === 'partial' ? 0.8 : 1; }
          const opts = []; for (const r of rs) { const e = evalRoute(r, t + w / 60); if (e && t + (w + e.mins) / 60 <= end && !(strict && plan.together !== false && e.who.length < WHO.length)) opts.push(e); }
          if (!opts.length) continue;
          opts.sort((x, y) => y.v / y.mins - x.v / x.mins);
          // greedy fill of the horizon; zone and east bonuses only count once per climber
          const seen = new Set(); let used = 0, val = 0;
          for (const o of opts) {
            if (used >= H) break;
            const e2 = evalRoute(o.r, t + w / 60, seen) || o;
            val += e2.v; used += e2.mins;
            for (const k of e2.who) { if (o.r.zn != null) seen.add(k + 'z' + o.r.zn); if (o.r.side === 'East') seen.add(k + 'east'); }
          }
          // in the strict pass, don't walk more than a few minutes for a single short climb (unless the zone tour needs that wall)
          if (strict && a !== area && w > 4 && used < 20 && !(openTour.length && WZ[a] && WZ[a].has(openTour[0]))) continue;
          const rate = val * sunF / ((plan.walkWeight ?? WALKW) * w + used + pen);
          if (rate > bestRate) { bestRate = rate; best = { first: opts[0], w, a }; }
        } }
        if (!best) { items.push({ type: 'break', min: 10, label: 'Rest' }); t += 10 / 60; continue; }
        const pick = best.first;
        items.push({ rid: pick.r.id, who: pick.who });
        t += (best.w + pick.mins) / 60;
        { const g = GRP[pick.r.area]; if (g && curG && g !== curG) { crossings++; dir = 0; turns = 0; } if (g) curG = g; if (pick.r.area !== area) left.add(area);
          const q = POS[pick.r.area]; if (q != null) { if (lastPos != null && Math.abs(q - lastPos) > 2) { const d = Math.sign(q - lastPos); if (dir && d !== dir) turns++; dir = d; } lastPos = q; } }
        area = pick.r.area;
        for (const k of pick.who) { const s = stats[k]; if ((pick.r.gu ?? -6) > cl[k].os) s.hardHour[hr] = (s.hardHour[hr] || 0) + 1; }
        applyRoute(plan, stats, pick.r, pick.who, t);
      }
      // trim trailing rests
      while (items.length && items[items.length - 1].type === 'break' && items[items.length - 1].label === 'Rest') items.pop();
      plan.items = items; plan.built = new Date().toISOString();
    }

    // ---------- targets and required pace ----------
    function targetOf(plan) {
      if (!UNIT[plan.goal]) return null;
      const t = plan.targets && plan.targets[plan.goal];
      return t > 0 ? t : TARGET_DEFAULT[plan.format][plan.goal];
    }
    function lapTarget(plan) {
      const F = FORMATS[plan.format];
      if (plan.goal === 'laps') return targetOf(plan);
      if (plan.goal === 'full' || plan.goal === 'qualify') return F.laps.full;
      if (plan.goal === 'golden') return F.laps.golden;
      return null; // score / height: known after the plan is built
    }
    function meets(plan) {
      const tl = timeline(plan, plan.items); const T = targetOf(plan);
      return WHO.every(k => {
        const s = tl.stats[k], a = achievements(plan, s);
        switch (plan.goal) {
          case 'laps': return s.laps >= T;
          case 'score': return s.pts + bonusPts(plan, s, a) >= T;
          case 'height': return s.ft >= T;
          case 'full': return a.full;
          case 'golden': return a.golden;
          default: return a.qual;
        }
      });
    }
    // Build the plan at the slowest steady pace that still reaches the target.
    // paceF multiplies every lead's time: below 1 means faster than the base model, above 1 slower.
    function build(plan) {
      let lo = 0.3, hi = 3, bestItems = null;
      plan.paceF = lo; optimize(plan, 0);
      if (!meets(plan)) { plan.unreachable = true; return; }
      plan.unreachable = false; bestItems = plan.items;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2; plan.paceF = mid; optimize(plan, 0);
        if (meets(plan)) { lo = mid; bestItems = plan.items; } else hi = mid;
      }
      plan.paceF = lo; plan.items = bestItems;
    }

    // ---------- plan CRUD ----------
    function newPlan(fmt) {
      fmt = fmt || '24';
      const p = { id: 'p' + Date.now().toString(36), name: (fmt === '24' ? '24-hour' : '12-hour') + ' plan', format: fmt, date: defaultDate(fmt), start: FORMATS[fmt].startHour,
        goal: 'full', targets: {}, side: { east: true, over60: false, soft: true }, divs: {}, intensity: 'standard', avoidSun: true, reach: true, items: [] };
      state.plans.push(p); state.active = p.id; save(); return p;
    }

    // ---------- rendering ----------
    let editing = null; // index of item whose actions are open
    function render() {
      const body = $('#planBody'); body.textContent = '';
      let plan = active();
      // header: plan picker
      const top = el('div', 'plan-top');
      const sel = el('select'); sel.setAttribute('aria-label', 'Plan');
      for (const p of state.plans) sel.add(new Option(p.name, p.id));
      if (plan) sel.value = plan.id;
      sel.onchange = () => { state.active = sel.value; save(); render(); ctx.onPlanChange(); };
      const bNew = el('button', 'btn', 'New plan'); bNew.type = 'button'; bNew.onclick = () => { newPlan(plan ? plan.format : '24'); render(); ctx.onPlanChange(); };
      top.append(sel, bNew);
      if (plan) { const bDel = el('button', 'btn ghost', 'Delete'); bDel.type = 'button'; bDel.onclick = () => { state.plans = state.plans.filter(p => p.id !== plan.id); state.active = state.plans[0]?.id || null; save(); render(); ctx.onPlanChange(); }; top.appendChild(bDel); }
      if (!state.plans.length) { body.appendChild(el('h2', null, 'Plan')); body.appendChild(el('p', 'hint', 'Set your goals and the planner recommends a route-by-route plan for both of you. You can then edit it, check routes off on the day and see whether you are ahead or behind.')); const b = el('button', 'btn primary', 'Start a plan'); b.type = 'button'; b.onclick = () => { newPlan('24'); render(); }; body.appendChild(b); renderReference(body); return; }
      body.appendChild(top);
      renderSetup(body, plan);
      if (plan.items.length) { renderSummary(body, plan); renderItems(body, plan); }
      renderReference(body);
    }

    function chipRow(opts, val, onPick, single = true) {
      const box = el('div', 'chips' + (single ? ' single' : ''));
      for (const [v, label] of opts) {
        const b = el('button', null, label); b.type = 'button'; b.setAttribute('aria-pressed', single ? val === v : !!val[v]);
        b.onclick = () => onPick(v); box.appendChild(b);
      }
      return box;
    }
    function field(label, node, hint) { const f = el('div', 'pfield'); f.append(el('span', 'plabel', label), node); if (hint) f.appendChild(el('span', 'hint small', hint)); return f; }

    function renderSetup(body, plan) {
      const d = el('details', 'setup'); d.open = !plan.items.length;
      d.appendChild(el('summary', null, `${FORMATS[plan.format].label}, optimizing for ${GOALS[plan.goal].replace(/ \(.*\)/, '').toLowerCase()}${targetOf(plan) ? ' ' + targetOf(plan).toLocaleString() : ''}`));
      const upd = fn => () => { fn(); save(); render(); };
      const name = el('input'); name.type = 'text'; name.value = plan.name; name.onchange = () => { plan.name = name.value.trim() || plan.name; save(); render(); };
      d.appendChild(field('Plan name', name));
      d.appendChild(field('Event', chipRow([['24', '24-hour'], ['12', '12-hour']], plan.format, v => upd(() => { plan.format = v; plan.date = defaultDate(v); plan.start = FORMATS[v].startHour; plan.items = []; })())));
      const date = el('input'); date.type = 'date'; date.value = plan.date; date.onchange = () => { if (date.value) { plan.date = date.value; save(); render(); } };
      d.appendChild(field('Start date', date, `Runs ${[plan.start, plan.start + FORMATS[plan.format].dur].map(h => { const x = dh(plan, h); return x.wd + ' ' + Sun.fmt(x.hour); }).join(' to ')} (fixed by the rules). Defaults to the last full weekend of September.`));
      const g = el('select'); for (const [k, v] of Object.entries(GOALS)) g.add(new Option(v, k)); g.value = plan.goal; g.onchange = () => { plan.goal = g.value; save(); render(); };
      const F = FORMATS[plan.format];
      const gHint = { score: `Favors soft, shaded, high-point routes. ${F.pts.qualify.toLocaleString()} points (bonuses included) qualifies for next year.`, laps: `Fastest routes you can lead cleanly. ${F.laps.qualify} laps qualifies for next year.`, height: F.ft ? `Favors tall routes. ${F.ft.toLocaleString()} ft also qualifies for next year.` : 'Favors tall routes.',
        full: `${F.laps.full} routes, ${plan.format === '24' ? 'all 24' : '12'} zones, and one end route at each end of the horseshoe (west: Hickadelic Jazzgrass, Meatcake, Catholic Boat, Elephant Ear or Wuwei; east: Orange Crush, Montezuma's Toe or Revenge, Purple Nehi or Supersoul Sureshot).`, golden: `${F.laps.golden} routes, ${F.trad.golden} trad, ${F.pts.golden.toLocaleString()} points and Full Horseshoe.`,
        qualify: 'Plans for the Full Horseshoe, the cheapest qualifying path for most teams.' }[plan.goal];
      d.appendChild(field('Optimize for', g, gHint));
      if (UNIT[plan.goal]) {
        const ti = el('input'); ti.type = 'number'; ti.inputMode = 'numeric'; ti.min = 1; ti.step = plan.goal === 'laps' ? 1 : 100; ti.value = targetOf(plan);
        ti.onchange = () => { plan.targets = plan.targets || {}; plan.targets[plan.goal] = Math.max(1, Math.round(+ti.value || 0)); save(); render(); };
        const row = el('div', 'target-row'); row.append(ti, el('span', null, UNIT[plan.goal] + ' per climber'));
        d.appendChild(field('Target', row));
      }
      const L = lapTarget(plan);
      const paceTxt = L ? `${(L / F.dur).toFixed(1)} laps per hour per climber (${L} laps over ${F.dur} hours).` : 'Calculated once the plan is built, from the laps it takes to reach your target.';
      d.appendChild(field('Required pace', el('p', 'pace-calc', paceTxt), L ? 'Average over the whole event, including walking, check-ins and breaks.' : null));
      d.appendChild(field('Also aim for', chipRow([['east', 'East Side bonus'], ['over60', 'Routes over 60 ft'], ['soft', 'Prefer soft-for-grade']], plan.side, v => upd(() => { plan.side[v] = !plan.side[v]; })(), false)));
      // divisions
      const dv = el('div', 'divs');
      for (const k of WHO) {
        const p = profiles[k] || {}; const s = el('select');
        for (const [dk, dd] of Object.entries(DIVS)) { if (dk === 'rec' && plan.format === '24') continue; s.add(new Option(dd.label, dk)); }
        const def = defaultDiv(p, plan.format); s.value = (plan.divs && plan.divs[k]) || def;
        s.onchange = () => { plan.divs = plan.divs || {}; plan.divs[k] = s.value === def ? undefined : s.value; save(); render(); };
        dv.appendChild(field(`${p.name || (k === 'me' ? 'You' : 'Partner')} division`, s, p.project ? `Default from project grade ${p.project}.` : 'Set a project grade in the You tab to default this.'));
      }
      d.appendChild(dv);
      d.appendChild(field('How hard to push', chipRow(Object.entries(INTENSITY).map(([k, v]) => [k, v.label]), plan.intensity, v => upd(() => { plan.intensity = v; plan.breakMin = undefined; })()),
        { conservative: 'Stays at or below onsight; one harder lap per hour per climber.', standard: 'Up to one grade over onsight early, easing off overnight; two harder laps per hour.', aggressive: 'Up to two grades over onsight early (capped at project grade); three harder laps per hour.' }[plan.intensity]));
      const I = INTENSITY[plan.intensity] || INTENSITY.standard;
      const bi = el('input'); bi.type = 'number'; bi.inputMode = 'numeric'; bi.min = 0; bi.max = 30; bi.value = breakMin(plan);
      bi.onchange = () => { const v = Math.max(0, Math.min(30, Math.round(+bi.value || 0))); plan.breakMin = v === I.breaks ? undefined : v; save(); render(); };
      const brow = el('div', 'target-row'); brow.append(bi, el('span', null, 'minutes per hour'));
      d.appendChild(field('Breaks', brow, `Suggested for ${I.label} ${I.breaks} min per hour. Taken as one break each hour. Walking between walls is ${I.walkName}.`));
      d.appendChild(field('Options', chipRow([['together', 'Same routes for both'], ['avoidSun', 'Avoid direct sun midday'], ['reach', 'Skip routes too reachy']], { together: plan.together !== false, avoidSun: plan.avoidSun !== false, reach: plan.reach !== false },
        v => upd(() => { plan[v] = plan[v] === false; })(), false)));
      if (plan.format === '24') {
        const lab = el('label', 'checkline'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!plan.dayHard;
        cb.onchange = () => { plan.dayHard = cb.checked; save(); render(); };
        lab.append(cb, el('span', null, 'Save harder climbs for daylight'));
        d.appendChild(field('Daylight', lab, 'Routes at or above onsight get done in daylight; overnight sticks to routes below onsight.'));
        const lab2 = el('label', 'checkline'); const cb2 = el('input'); cb2.type = 'checkbox'; cb2.checked = !!plan.earlyHard;
        cb2.onchange = () => { plan.earlyHard = cb2.checked; save(); render(); };
        lab2.append(cb2, el('span', null, 'Harder climbs in the first 12 hours only'));
        d.appendChild(field('First half', lab2, `Routes at or above onsight only before ${Sun.fmt((plan.start + 12) % 24)}; the second half sticks to routes below onsight.`));
      }
      const missing = WHO.filter(k => !(profiles[k] || {}).onsight);
      if (missing.length) d.appendChild(el('p', 'warn', 'Add onsight and project grades in the You tab for ' + missing.map(k => k === 'me' ? 'you' : 'your partner').join(' and ') + '. Until then the planner assumes a 5.9 onsight.'));
      const go = el('button', 'btn primary', plan.items.length ? 'Rebuild recommended plan' : 'Build recommended plan'); go.type = 'button';
      go.onclick = () => {
        if (plan.items.some(i => i.done) && !confirm('Rebuilding replaces the whole plan, including checked-off routes. Continue?')) return;
        go.disabled = true; go.textContent = 'Building…';
        setTimeout(() => { build(plan); save(); render(); ctx.onPlanChange(); }, 30);
      };
      d.appendChild(go);
      body.appendChild(d);
    }

    function countCrossings(plan) {
      let g0 = null, n = 0;
      for (const it of plan.items) { const r = it.rid && byId[it.rid]; if (!r) continue; const g = sideGroup(r.side); if (g && g0 && g !== g0) n++; if (g) g0 = g; }
      return n;
    }
    function renderSummary(body, plan) {
      const tl = normRows(timeline(plan, plan.items)); const F = FORMATS[plan.format];
      const sec = el('section', 'psum');
      const tbl = el('table', 'sumtable'); const thead = el('tr'); thead.append(el('th'), ...WHO.map(k => el('th', null, climber(plan, k).name))); tbl.appendChild(thead);
      const ach = Object.fromEntries(WHO.map(k => [k, achievements(plan, tl.stats[k])]));
      const rowOf = (label, f) => { const tr = el('tr'); tr.append(el('th', null, label), ...WHO.map(k => el('td', null, f(tl.stats[k], ach[k], k)))); tbl.appendChild(tr); };
      rowOf('Routes', s => s.laps);
      rowOf('Points', (s, a) => (s.pts + bonusPts(plan, s, a)).toLocaleString());
      rowOf('Height', s => s.ft.toLocaleString() + ' ft');
      rowOf('Trad', s => s.trad);
      rowOf('Zones', s => `${s.zones.size} of 24`);
      const yes = b => b ? 'Yes' : 'No';
      rowOf('One Each Hour', (s, a) => yes(a.hoursAll));
      rowOf('East Side', s => yes(s.east));
      rowOf('Full Horseshoe', (s, a) => yes(a.full));
      rowOf('Golden Horseshoe', (s, a) => yes(a.golden));
      rowOf('Qualifies', (s, a) => yes(a.qual));
      sec.appendChild(tbl);
      // why the two lists differ: the inputs each climber was planned with, and routes only one of you leads
      const solo = WHO.map(k => plan.items.filter(it => it.who && it.who.length === 1 && it.who[0] === k).length);
      const inp = WHO.map(k => { const c = climber(plan, k), p = c.raw;
        return `${c.name}: onsight ${p.onsight || '5.9 (not set)'}, project ${p.project || 'not set'}, ${DIVS[c.div].label}${p.ht ? ', ' + Math.floor(p.ht / 12) + "'" + (p.ht % 12) + '"' : ', height not set'}`; });
      sec.appendChild(el('p', 'hint small', `Planned with ${inp.join('; ')}.` + (solo[0] + solo[1] ? ` Routes only one of you leads: ${climber(plan, 'me').name} ${solo[0]}, ${climber(plan, 'partner').name} ${solo[1]} (the other belays). These come from different grades, divisions or reach.` : ' You lead the same routes.')));
      const cx = countCrossings(plan);
      sec.appendChild(el('p', 'hint small', `Canyon crossings: ${cx} (limit ${MAX_CROSS[plan.format]}${plan.format === '24' ? ', one is best' : ''}).`));
      const climbing = Math.max(...WHO.map(k => tl.stats[k].laps));
      const rp = el('p', 'pace-calc');
      rp.textContent = `Required pace: ${(climbing / F.dur).toFixed(1)} laps per hour per climber (${climbing} laps over ${F.dur} hours).`;
      sec.appendChild(rp);
      if (plan.unreachable) sec.appendChild(el('p', 'warn', `This plan can't reach ${targetOf(plan) ? targetOf(plan).toLocaleString() + ' ' + UNIT[plan.goal] : GOALS[plan.goal]} for both climbers even at a very fast pace. Try a lower target, a harder push setting, or a higher division.`));
      sec.appendChild(el('p', 'hint small', `Plan ends ${fmtAbs(plan, tl.t, true)}; event ends ${fmtAbs(plan, plan.start + F.dur, true)}. Zone numbers for 10 of the 24 zones are a best guess until the organizers confirm the wall list.`));
      // pace
      const done = plan.items.map((it, i) => ({ it, i })).filter(x => x.it.done);
      if (done.length) {
        const last = done[done.length - 1];
        const row = tl.rows.find(r => r.kind === 'route' && r.i === last.i);
        const actualCT = (() => { const t = new Date(new Date(last.it.done).toLocaleString('en-US', { timeZone: 'America/Chicago' })); const [y, m, d] = plan.date.split('-').map(Number); return (t - new Date(y, m - 1, d)) / 3600000; })();
        const delta = Math.round((actualCT - row.t1) * 60);
        const msg = Math.abs(delta) <= 5 ? 'On pace.' : delta > 0 ? `Behind by ${delta} min.` : `Ahead by ${-delta} min.`;
        const pace = el('p', 'pace ' + (Math.abs(delta) <= 5 ? 'on' : delta > 0 ? 'behind' : 'ahead'), `${msg} ${done.length} of ${plan.items.filter(i => i.rid).length} planned routes done.`);
        sec.appendChild(pace);
      }
      const acts = el('div', 'btnrow');
      const bMap = el('button', 'btn primary', 'Show on map'); bMap.type = 'button'; bMap.onclick = () => { ui.mapMode = 'plan'; const T = clockAbs(plan); if (T < plan.start || T > plan.start + FORMATS[plan.format].dur) { ui.date = plan.date; ui.hour = plan.start + 1; ctx.onClock(); } ctx.saveUi(); ctx.showTab('map'); };
      const firstOpen = plan.items.findIndex(i => !i.done);
      const bRe = el('button', 'btn', 'Re-plan the rest'); bRe.type = 'button'; bRe.title = 'Keeps checked-off routes and re-plans everything after them from now.';
      bRe.onclick = () => { optimize(plan, firstOpen < 0 ? plan.items.length : firstOpen); save(); render(); ctx.onPlanChange(); };
      acts.append(bMap, bRe); sec.appendChild(acts);
      body.appendChild(sec);
    }

    function renderItems(body, plan) {
      const tl = normRows(timeline(plan, plan.items));
      const list = el('ol', 'plan-list');
      let stop = 0, lastArea = null;
      const whoLabel = w => w.length === 2 ? 'Both' : w[0] === 'me' ? climber(plan, 'me').name : climber(plan, 'partner').name;
      for (const row of tl.rows) {
        if (row.kind === 'walk') { list.appendChild(el('li', 'p-walk light-' + row.light, `${(INTENSITY[plan.intensity] || INTENSITY.standard).walk >= 120 ? 'Jog' : 'Walk'} ${Math.max(1, Math.round((row.t1 - row.t0) * 60))} min to ${placeName(row.to)}`)); continue; }
        if (row.kind === 'checkin' || row.kind === 'break') {
          const li = el('li', 'p-break ' + row.kind + (row.auto ? ' auto' : '')); li.append(el('span', 'p-time', fmtAbs(plan, row.t0, true)), el('span', null, `${row.label}, ${Math.round((row.t1 - row.t0) * 60)} min`));
          if (row.i != null) { const x = el('button', 'icon', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Remove break'); x.onclick = () => { plan.items.splice(row.i, 1); save(); render(); ctx.onPlanChange(); }; li.appendChild(x); }
          list.appendChild(li); continue;
        }
        const r = row.r;
        if (r.area !== lastArea) { stop++; lastArea = r.area; const h = el('li', 'p-stop'); h.append(el('span', 'p-stopn', stop), el('span', 'p-stopname', r.area), el('span', 'p-time', fmtAbs(plan, row.t0, true))); list.appendChild(h); }
        const li = el('li', 'p-route' + (row.done ? ' done' : '')); li.dataset.i = row.i;
        const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!row.done; cb.setAttribute('aria-label', 'Done: ' + r.name);
        cb.onchange = () => { const it = plan.items[row.i]; it.done = cb.checked ? new Date().toISOString() : undefined; save(); render(); ctx.onPlanChange(); };
        const main = el('button', 'p-main'); main.type = 'button';
        main.append(el('span', 'p-time', Sun.fmt(dh(plan, row.t0).hour)), el('span', 'grade ' + (ctx.feelOf(r) ? 'feel-' + ctx.feelOf(r) : ''), r.g), el('span', 'p-name', r.name));
        const tags = el('span', 'p-tags');
        tags.append(el('span', 'pts', r.pts));
        tags.appendChild(el('span', 'who', whoLabel(row.who)));
        if (row.sun === 'sun' && row.light === 'day') tags.appendChild(el('span', 'tag sun', 'Sun'));
        if (row.light !== 'day') tags.appendChild(el('span', 'tag night', row.light === 'night' ? 'Dark' : 'Dusk'));
        if (r.sp) tags.appendChild(el('span', 'tag special', (r.sp === 'E' ? 'East' : 'West') + ' end'));
        if (r.type === 'trad') tags.appendChild(el('span', 'tag', 'Trad'));
        main.appendChild(tags);
        main.onclick = () => { editing = editing === row.i ? null : row.i; render(); };
        li.append(cb, main);
        if (editing === row.i) {
          const a = el('div', 'p-actions');
          const btn = (label, fn, cls) => { const b = el('button', 'btn ' + (cls || ''), label); b.type = 'button'; b.onclick = () => { fn(); save(); render(); ctx.onPlanChange(); }; a.appendChild(b); };
          const it = plan.items[row.i];
          btn('Who: ' + whoLabel(it.who), () => { it.who = it.who.length === 2 ? ['me'] : it.who[0] === 'me' ? ['partner'] : ['me', 'partner']; });
          btn('Move up', () => { if (row.i > 0) plan.items.splice(row.i - 1, 0, plan.items.splice(row.i, 1)[0]); editing = row.i - 1; });
          btn('Move down', () => { if (row.i < plan.items.length - 1) plan.items.splice(row.i + 1, 0, plan.items.splice(row.i, 1)[0]); editing = row.i + 1; });
          btn('Add route after', () => openPicker(plan, row.i + 1));
          btn('Add break after', () => { plan.items.splice(row.i + 1, 0, { type: 'break', min: 15, label: 'Break' }); });
          btn('Re-plan after this', () => optimize(plan, row.i + 1));
          btn('Route details', () => ctx.openDetail(r.id));
          btn('Remove', () => { plan.items.splice(row.i, 1); editing = null; }, 'danger');
          li.appendChild(a);
        }
        list.appendChild(li);
      }
      body.appendChild(list);
      const add = el('div', 'btnrow');
      const b1 = el('button', 'btn', 'Add route at end'); b1.type = 'button'; b1.onclick = () => openPicker(plan, plan.items.length);
      const b2 = el('button', 'btn', 'Add break at end'); b2.type = 'button'; b2.onclick = () => { plan.items.push({ type: 'break', min: 15, label: 'Break' }); save(); render(); };
      add.append(b1, b2); body.appendChild(add);
    }

    // picker: suggestions ranked by fit at the insertion point
    function openPicker(plan, at) {
      const d = $('#detail'); d.textContent = '';
      const tl = normRows(timeline(plan, plan.items, at));
      const head = el('header', 'd-head'); const t = el('div', 'd-title'); t.append(el('h2', null, 'Add a route'), el('p', null, `At about ${fmtAbs(plan, tl.t, true)}${tl.area ? ', near ' + tl.area : ''}`));
      const close = el('button', 'd-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close'); close.onclick = () => d.close();
      head.append(t, close); d.appendChild(head);
      const q = el('input', 'search'); q.type = 'search'; q.placeholder = 'Search all routes'; q.style.margin = '0 16px 8px'; q.style.width = 'calc(100% - 32px)';
      d.appendChild(q);
      const ol = el('ol', 'routes compact picker'); d.appendChild(ol);
      const rel = (tl.t - plan.start) / FORMATS[plan.format].dur;
      const cl = Object.fromEntries(WHO.map(k => [k, climber(plan, k)]));
      const cands = comp().map(r => {
        const who = WHO.filter(k => !tl.stats[k].done.has(r.id) && (r.gu ?? -6) <= DIVS[cl[k].div].max);
        const okNow = who.filter(k => (r.gu ?? -6) <= ceilingAt(plan, cl[k], rel) + 0.01);
        const w = walkMin(tl.area, r.area, plan);
        let mins = w + 1; for (const k of (okNow.length ? okNow : who)) mins += leadMin(plan, r, cl[k], tl.t);
        return { r, who: okNow.length ? okNow : who, mins, w, score: ((r.pts || 0) * (okNow.length || 0.3)) / mins };
      }).filter(c => c.who.length);
      const draw = () => {
        ol.textContent = '';
        const term = q.value.trim().toLowerCase();
        const list = (term ? cands.filter(c => (c.r.name + ' ' + c.r.area + ' ' + c.r.n).toLowerCase().includes(term)) : cands.slice().sort((a, b) => b.score - a.score)).slice(0, 60);
        for (const c of list) {
          const li = el('li', 'route');
          li.append(el('span', 'grade ' + (ctx.feelOf(c.r) ? 'feel-' + ctx.feelOf(c.r) : ''), c.r.g), (() => { const m = el('span', 'mid'); m.append(el('span', 'name', c.r.name), el('span', 'sub', `${c.r.area}, ${c.w ? Math.round(c.w) + ' min walk' : 'here'}, ${Math.round(c.mins - c.w)} min to climb`)); return m; })(), el('span', 'right', c.r.pts));
          li.onclick = () => { plan.items.splice(at, 0, { rid: c.r.id, who: c.who }); save(); d.close(); render(); ctx.onPlanChange(); };
          ol.appendChild(li);
        }
      };
      q.oninput = draw; draw(); d.showModal();
    }

    function renderReference(body) {
      const d = el('details', 'reference'); d.appendChild(el('summary', null, 'Reference: shade by side and the target list'));
      ctx.renderReference(d); body.appendChild(d);
    }

    // ---------- trail legs for the map ----------
    let G = null;
    function legPts(a, b) {
      const T = ctx.TRAILS && ctx.TRAILS(); const A = locOf(a), B = locOf(b);
      const straight = [[A.lat, A.lon], [B.lat, B.lon]];
      if (!T || T.snap[a] == null || T.snap[b] == null) return straight;
      if (!G) { G = T.nodes.map(() => []); const m = (p, q) => { const t = Math.PI / 180; return 6371000 * Math.hypot((q[1] - p[1]) * t * Math.cos(p[0] * t), (q[0] - p[0]) * t); };
        for (const [i, j] of T.edges) { const w = m(T.nodes[i], T.nodes[j]); G[i].push([j, w]); G[j].push([i, w]); } G.cache = {}; }
      const s = T.snap[a], e = T.snap[b], key = s + '>' + e;
      if (!G.cache[key]) {
        const dist = new Float64Array(G.length).fill(Infinity), prev = new Int32Array(G.length).fill(-1), done = new Uint8Array(G.length);
        dist[s] = 0;
        for (;;) { let u = -1, bd = Infinity; for (let i = 0; i < G.length; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
          if (u < 0 || u === e) break; done[u] = 1;
          for (const [v, w] of G[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; } }
        const path = []; for (let u = e; u >= 0; u = prev[u]) path.unshift(T.nodes[u]);
        G.cache[key] = path[0] && path[0] === T.nodes[s] ? path : [];
      }
      return [[A.lat, A.lon], ...G.cache[key], [B.lat, B.lon]];
    }

    // ---------- map data ----------
    function mapData() {
      const plan = active(); if (!plan || !plan.items.length) return null;
      const tl = normRows(timeline(plan, plan.items)); const A = AREAS();
      const stops = [], segs = []; let cur = null;
      for (const row of tl.rows) {
        if (row.kind === 'route') {
          if (!cur || cur.area !== row.r.area) { cur = { area: row.r.area, arrive: row.t0, depart: row.t1, count: 0, n: stops.length + 1, done: 0 }; stops.push(cur); }
          cur.count++; cur.depart = row.t1; if (row.done) cur.done++;
        }
      }
      for (let i = 1; i < stops.length; i++) {
        const a = A[stops[i - 1].area], b = A[stops[i].area]; if (!a || !b || a.lat == null || b.lat == null) continue;
        segs.push({ pts: legPts(stops[i - 1].area, stops[i].area), light: light(plan, (stops[i - 1].depart + stops[i].arrive) / 2) });
      }
      // expected position at the clock time
      const T = clockAbs(plan); let exp = null;
      if (T >= plan.start && T <= plan.start + FORMATS[plan.format].dur) {
        for (let i = 0; i < stops.length; i++) {
          const s = stops[i], A1 = A[s.area];
          if (T >= s.arrive && T <= s.depart && A1?.lat != null) { exp = { lat: A1.lat, lon: A1.lon }; break; }
          const nx = stops[i + 1];
          if (nx && T > s.depart && T < nx.arrive) {
            const a = A[s.area], b = A[nx.area]; if (a?.lat == null || b?.lat == null) break;
            const f = (T - s.depart) / (nx.arrive - s.depart); exp = { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f }; break;
          }
        }
      }
      const walls = {};
      for (const s of stops) { const w = walls[s.area] ??= { area: s.area, count: 0, done: 0, visits: [], n: s.n }; w.count += s.count; w.done += s.done; w.visits.push(fmtAbs(plan, s.arrive, true)); }
      const wallList = Object.values(walls).map(w => ({ ...w, lat: A[w.area]?.lat, lon: A[w.area]?.lon, est: A[w.area]?.est, label: w.visits[0] + (w.visits.length > 1 ? ` +${w.visits.length - 1}` : '') }));
      return { plan, stops: wallList, nStops: stops.length, segs, exp, expLabel: exp ? 'Planned spot at ' + Sun.fmt(ui.hour) : '' };
    }

    return { _build: build, _meets: meets, _opt: optimize, _tl: (p) => timeline(p, p.items), _cross: countCrossings, _tune: o => Object.assign(TUNE, o), setWalkWeight: v => { WALKW = v; }, render, mapData, active, span() { const p = active(); return p && p.items.length ? { date: p.date, start: p.start, end: p.start + FORMATS[p.format].dur, now: clockAbs(p) } : null; }, state: () => state, exportState: () => state, importState(s) { if (s && Array.isArray(s.plans)) { for (const p of s.plans) if (!state.plans.some(x => x.id === p.id)) state.plans.push(fixStart(p)); save(); } } };
  };
})();
