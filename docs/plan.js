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
    trad: 'Trad laps (target count)',
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
  const TARGET_DEFAULT = { 24: { laps: 100, score: 12000, height: 5280, trad: 55 }, 12: { laps: 65, score: 8000, height: 3000, trad: 40 } };
  const IDLE_LABEL = 'Nothing left that fits your settings';
  const MANUAL_PACE = { conservative: 1.2, standard: 1, aggressive: 0.85 }; // lead-time multiplier for hand-built plans
  const UNIT = { laps: 'laps', score: 'points', height: 'feet', trad: 'trad laps' };
  let WALKW = 9; // walking minutes count 9x against a wall's climbing value (strong preference for staying put)
  const START_AREA = 'The Park';
  // Canyon crossings: West + North walls are one side, East walls the other; the valley floor is neutral.
  const MAX_CROSS = { 12: 1, 24: 2 };
  const CROSS_PEN = [30, 240]; // minutes-equivalent for the first and second crossing (one is best)
  const TUNE = { turns: 1, move: 24, back: 180, valley: 6, reverse: 60, zone: 500, special: 900 }; // minutes-equivalent: any move, returning to a wall already left, valley detours
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
      return m * (plan.manual ? (MANUAL_PACE[plan.intensity] || 1) : (plan.paceF || 1));
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
    const sunPref = plan => plan.sunPref || (plan.avoidSun === false ? 'none' : 'shade');
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
      for (const k of WHO) s[k] = { pts: 0, laps: 0, ft: 0, trad: 0, zones: new Set(), specials: new Set(), east: false, hours: new Set(), done: new Set(), hardHour: {}, grades: {} };
      return s;
    }
    function applyRoute(plan, stats, r, who, t1) {
      const hr = Math.floor(t1 - plan.start);
      for (const k of who) {
        const s = stats[k]; if (s.done.has(r.id)) continue;
        s.done.add(r.id); s.laps++; s.pts += r.pts || 0; s.ft += r.ht || 0; if (r.type === 'trad') s.trad++;
        if (r.zn != null) s.zones.add(r.zn); if (r.sp) s.specials.add(r.sp); if (r.side === 'East') s.east = true;
        s.hours.add(hr); const gl = gradeLabel(r.gu, r.g); s.grades[gl] = (s.grades[gl] || 0) + 1;
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
      const gls = goalsOf(plan).map(g => g === 'qualify' ? 'full' : g);
      const goal = gls.includes('golden') ? 'golden' : gls.includes('full') ? 'full' : gls[0]; // the coverage goal (if any) drives the zone tour
      const numGoals = gls.filter(g => UNIT[g]).map(g => [g, targetOf(plan, g)]);
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
      // walls the climber wants to start with, in order (fresh builds only)
      const forced = (plan.startWalls || []).filter(a => byArea[a]);
      let fi = items.length ? forced.length : 0, fArr = t; // fArr: when we reached the current wall
      const tourFrom = fi < forced.length ? forced[forced.length - 1] : area, tourG = fi < forced.length ? (GRP[tourFrom] || curG) : curG;
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
        const first = tourG || (dh(plan, t).hour < 10 ? 'E' : 'W'), second = first === 'W' ? 'E' : 'W';
        const segs = [zones.filter(z => zg(z) !== second), zones.filter(z => zg(z) === second)];
        let cur = tourFrom;
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
            const bucket = GU2(gradeLabel(r.gu, r.g));
            // separate grade ranges: sport (and mixed) use gmin/gmax, trad uses tmin/tradMax
            const isTrad = r.type === 'trad', lo = isTrad ? plan.tmin : plan.gmin, hi = isTrad ? plan.tradMax : plan.gmax;
            if (lo && bucket < GU2(lo)) continue;
            if (hi && bucket > GU2(hi)) continue;
            if (plan.darkMax && pre.lt !== 'day' && bucket > GU2(plan.darkMax)) continue;

            if (r.v && r.v.includes('stiff') && bucket >= GU2(gradeLabel(c.os, ''))) continue; // no stiff-for-grade routes at or above onsight // hardest grade after dark
            if (plan.warm) { // warm-up routes first, then ramp up one grade step every two routes
              const wn = plan.warmN ?? 3, base = Math.max(GU2(plan.warm), lo ? GU2(lo) : -99);
              if (bucket > base + (s.laps < wn ? 0 : 1 + Math.floor((s.laps - wn) / 2))) continue;
            }
            const lim = plan.gradeMax && plan.gradeMax[gradeLabel(r.gu, r.g)]; if (lim != null && (s.grades[gradeLabel(r.gu, r.g)] || 0) >= lim) continue;
            if (earlyHard && tt - plan.start >= 12 && gu >= c.os) continue;
            who.push(k);
          }
          if (!who.length) return null;
          let mins = 1; for (const k of who) mins += leadMin(plan, r, cl[k], tt, pre);
          let v = 0;
          for (const k of who) {
            const s = stats[k]; let x = 0;
            // numeric goals add up; one that's already met for this climber counts for much less
            for (const [g, T] of numGoals) {
              const met = g === 'laps' ? s.laps >= T : g === 'height' ? s.ft >= T : g === 'trad' ? s.trad >= T : s.pts >= T;
              x += (g === 'score' ? (r.pts || 0) : g === 'laps' ? 120 : g === 'trad' ? (r.type === 'trad' ? 260 : 60) : (r.ht || 40) * 3) * (met ? 0.2 : 1);
            }
            if (goal === 'full' || goal === 'golden') {
              x += s.laps < F.laps[goal === 'golden' ? 'golden' : 'full'] ? 300 : 0;
              x += (r.pts || 0) * (goal === 'golden' ? 0.6 : 0.2);
              const needZone = plan.format === '24' || goal === 'golden' || s.zones.size < 12;
              if (r.zn != null && needZone && !s.zones.has(r.zn) && !(seen && seen.has(k + 'z' + r.zn))) x += !tour.length || nz.has(r.zn) ? TUNE.zone : 150;
              if (r.sp && !s.specials.has(r.sp)) x += !tour.length || nz.has(r.zn) || s.zones.has(r.zn) ? TUNE.special : 150; // don't leave a special's wall without it
              if (goal === 'golden' && r.type === 'trad' && s.trad < F.trad.golden) x += 220;
            }
            if (plan.side.east && !s.east && r.side === 'East' && !(seen && seen.has(k + 'east'))) x += gls.length === 1 && goal === 'score' ? 300 : 900;
            if (plan.side.over60 && (r.ht || 0) >= 60) x *= 1.3;
            if (plan.side.soft && r.v && r.v.includes('soft')) x *= 1.15;
            if (r.v && r.v.includes('stiff')) x *= 0.85;
            if (!gls.includes('score')) { // without a points goal, lean hard on mid and lower grades
              const rel = GU2(gradeLabel(r.gu, r.g)) - cl[k].os;
              x *= rel <= -5 ? 0.95 : rel <= -1 ? 1.2 : rel <= 0 ? 0.8 : 0.5;
            }
            if (earlyHard && tt - plan.start < 12 && (r.gu ?? -6) >= cl[k].os - 1) x *= 1.25 + 0.15 * Math.max(0, (r.gu ?? -6) - cl[k].os);
            if (plan.darkMax && pre.lt === 'day' && GU2(gradeLabel(r.gu, r.g)) > GU2(plan.darkMax)) x *= 1.5; // get the routes you can't do in the dark done while it's light
            v += x;
          }
          if (pre.lt !== 'day' && r.type === 'trad') v *= 0.8;
          return { r, who, mins, v };
        };
        // score each wall: best routes there for about H minutes, against the walk to reach it.
        // First pass keeps the sweep (at most TUNE.turns turnarounds per side); relax only if nothing fits.
        let best = null, bestRate = 0;
        // chosen starting walls: only the current one, or the next one once it beats staying
        let allowed = null;
        if (fi < forced.length) {
          if (area !== forced[fi] || t - fArr < H / 60) allowed = new Set([forced[fi]]); // at least ~45 min of climbing at each chosen wall
          else if (fi + 1 < forced.length) allowed = new Set([forced[fi], forced[fi + 1]]);
        }
        for (const strict of [true, false]) { if (best) break;
        for (const [a, rs] of Object.entries(byArea)) {
          if (allowed && !allowed.has(a)) continue;
          const isF = !!allowed;
          const w = walkMin(area, a, plan);
          if (t + (w + 5) / 60 > end) continue;
          const g = GRP[a]; let pen = 0;
          if (isF) { if (g && curG && g !== curG) pen += CROSS_PEN[0]; }
          else if (g && curG && g !== curG) {
            if (crossings >= maxCross) continue;
            if (crossings >= 1 && end - t < 3) continue; // no second crossing late in the event
            if (tourSide && tourSide === curG) continue;
            pen += CROSS_PEN[Math.min(crossings, CROSS_PEN.length - 1)];
          } else if (tourSide && g && g !== tourSide && !curG) continue;
          if (!isF) {
          // coverage plans follow the zone tour in order: no skipping ahead to a later zone's wall
          if (openTour.length && WZ[a] && !WZ[a].has(openTour[0]) && [...WZ[a]].some(z => openTour.includes(z))) continue;
          if (a !== area) pen += TUNE.move;          // every move costs setup time
          if (left.has(a)) pen += TUNE.back;
          const rev = dir && POS[a] != null && lastPos != null && Math.abs(POS[a] - lastPos) > 2 && Math.sign(POS[a] - lastPos) !== dir;
          if (rev) { if (strict && turns >= TUNE.turns) continue; pen += TUNE.reverse; }
          if (strict && left.has(a) && !rev && a !== area) continue; // never double back past a wall without turning round
          }
          if (GRP[a] === null && a !== area) pen += TUNE.valley; // detours onto the valley floor
          let sunF = 1;
          const sp = sunPref(plan);
          // shade: the West and North walls are under tree cover, so the thing to dodge is the open East side in the afternoon sun
          if (sp === 'shade' && rs[0].side === 'East' && hh >= 12 && pre.lt === 'day') { const st = sunAt(plan, rs[0], t + w / 60); sunF = st === 'sun' ? 0.4 : st === 'partial' ? 0.65 : 0.9; }
          else if (sp === 'sun' && pre.lt === 'day') { const st = sunAt(plan, rs[0], t + w / 60); sunF = st === 'sun' ? 1 : st === 'partial' ? 0.85 : st === 'shade' ? 0.65 : 0.8; }
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
          if (strict && !isF && a !== area && w > 4 && used < 20 && !(openTour.length && WZ[a] && WZ[a].has(openTour[0]))) continue;
          const rate = val * sunF / ((plan.walkWeight ?? WALKW) * w + used + pen);
          if (rate > bestRate) { bestRate = rate; best = { first: opts[0], w, a }; }
        } }
        if (!best && fi < forced.length) { fi++; continue; } // a chosen wall with nothing (more) to climb: move on
        if (!best) { // nothing climbable fits the settings right now: one idle block, not a string of rests
          const last = items[items.length - 1];
          if (last && last.idle) last.min += 10; else items.push({ type: 'break', min: 10, label: IDLE_LABEL, idle: true });
          t += 10 / 60; continue;
        }
        if (fi < forced.length) { if (best.a === forced[fi + 1]) fi++; else if (area === forced[forced.length - 1] && fi === forced.length - 1 && best.a !== area) fi = forced.length; }
        const pick = best.first;
        if (pick.r.area !== area) fArr = t + best.w / 60;
        items.push({ rid: pick.r.id, who: pick.who });
        t += (best.w + pick.mins) / 60;
        { const g = GRP[pick.r.area]; if (g && curG && g !== curG) { crossings++; dir = 0; turns = 0; } if (g) curG = g; if (pick.r.area !== area) left.add(area);
          const q = POS[pick.r.area]; if (q != null) { if (lastPos != null && Math.abs(q - lastPos) > 2) { const d = Math.sign(q - lastPos); if (dir && d !== dir) turns++; dir = d; } lastPos = q; } }
        area = pick.r.area;
        for (const k of pick.who) { const s = stats[k]; if ((pick.r.gu ?? -6) > cl[k].os) s.hardHour[hr] = (s.hardHour[hr] || 0) + 1; }
        applyRoute(plan, stats, pick.r, pick.who, t);
      }
      // trim trailing rests
      while (items.length && items[items.length - 1].type === 'break' && (items[items.length - 1].idle || items[items.length - 1].label === 'Rest')) items.pop();
      plan.items = items; plan.built = new Date().toISOString();
    }

    // ---------- targets and required pace ----------
    // a plan can chase several goals at once (e.g. 100 laps AND 5,280 ft); all of them must be met
    const goalsOf = plan => (Array.isArray(plan.goals) ? plan.goals : plan.goal ? [plan.goal] : []).filter(g => GOALS[g]); // new plans start with no goals
    function targetOf(plan, g = goalsOf(plan)[0]) {
      if (!UNIT[g]) return null;
      const t = plan.targets && plan.targets[g];
      return t > 0 ? t : TARGET_DEFAULT[plan.format][g];
    }
    function lapTarget(plan) {
      const F = FORMATS[plan.format]; let L = null;
      for (const g of goalsOf(plan)) {
        const n = g === 'laps' ? targetOf(plan, g) : g === 'full' || g === 'qualify' ? F.laps.full : g === 'golden' ? F.laps.golden : null;
        if (n != null) L = Math.max(L || 0, n);
      }
      return L; // score / height only: known after the plan is built
    }
    function goalMet(plan, g, s, a) {
      const T = targetOf(plan, g);
      switch (g) {
        case 'laps': return s.laps >= T;
        case 'score': return s.pts + bonusPts(plan, s, a) >= T;
        case 'height': return s.ft >= T;
        case 'trad': return s.trad >= T;
        case 'full': return a.full;
        case 'golden': return a.golden;
        default: return a.qual;
      }
    }
    // Contingency: each goal should be done this many hours before the end (lost phone, a queue for a must-have route...).
    const BUFFER = { full: { 24: 4, 12: 2 }, qualify: { 24: 4, 12: 2 }, golden: { 24: 2, 12: 1 }, laps: { 24: 2, 12: 1 }, score: { 24: 2, 12: 1 }, height: { 24: 2, 12: 1 }, trad: { 24: 2, 12: 1 } };
    const bufferOf = (plan, g) => ((BUFFER[g] || {})[plan.format] || 0) * (plan.bufF ?? 1);
    // when each goal is first met by both climbers (absolute hours), replaying the plan route by route
    function goalTimes(plan, tl) {
      tl = tl || timeline(plan, plan.items);
      const gs = goalsOf(plan), out = Object.fromEntries(gs.map(g => [g, null])); if (!gs.length) return out;
      const st = blankStats(plan), F = FORMATS[plan.format];
      for (const row of tl.rows) {
        if (row.kind !== 'route') continue;
        applyRoute(plan, st, row.r, row.who, row.t1);
        const hrNow = Math.floor(row.t1 - plan.start);
        for (const g of gs) {
          if (out[g] != null) continue;
          const ok = WHO.every(k => { const s = st[k], a = achievements(plan, s);
            if (g === 'score') { // count the One Each Hour bonus if every hour so far has a route (it's on track)
              const onTrack = F.hourBonus && Array.from({ length: hrNow }, (_, h) => s.hours.has(h)).every(Boolean);
              return s.pts + (s.east ? 300 : 0) + (onTrack ? F.hourBonus : 0) >= targetOf(plan, g); }
            return goalMet(plan, g, s, a); });
          if (ok) out[g] = row.t1;
        }
      }
      return out;
    }
    function meets(plan) {
      const end = plan.start + FORMATS[plan.format].dur, gt = goalTimes(plan);
      return goalsOf(plan).every(g => gt[g] != null && gt[g] <= end - bufferOf(plan, g) + 1e-6);
    }
    const goalText = plan => goalsOf(plan).map(g => GOALS[g].replace(/ \(.*\)/, '').toLowerCase() + (targetOf(plan, g) ? ' ' + targetOf(plan, g).toLocaleString() : '')).join(' + ');
    // Build the plan at the slowest steady pace that still reaches the target.
    // paceF multiplies every lead's time: below 1 means faster than the base model, above 1 slower.
    function build(plan) {
      plan.manual = false;
      let lo = 0.3, hi = 3, bestItems = null;
      // full contingency buffer if possible, else half, else none
      let ok = false;
      for (const f of [1, 0.5, 0]) { plan.bufF = f; plan.paceF = lo; optimize(plan, 0); if (meets(plan)) { ok = true; break; } }
      if (!ok) { plan.unreachable = true; return; }
      plan.unreachable = false; bestItems = plan.items;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2; plan.paceF = mid; optimize(plan, 0);
        if (meets(plan)) { lo = mid; bestItems = plan.items; } else hi = mid;
      }
      plan.paceF = lo; plan.items = bestItems;
      polish(plan);
    }

    // ---------- walking polish ----------
    // After the optimizer, reorder whole wall stops and fold revisits into the first visit wherever that cuts
    // walking and the plan still keeps every rule (grade caps by time, dark limit, warm-up ramp, hard laps per
    // hour, crossings, event end) and still meets its goals.
    function stopsOf(items) {
      const stops = []; let cur = null;
      for (const it of items) {
        const r = it.rid && byId[it.rid];
        if (r) { if (!cur || cur.area !== r.area) { cur = { area: r.area, items: [] }; stops.push(cur); } cur.items.push(it); }
        else if (cur) cur.items.push(it); else { cur = { area: null, items: [it] }; stops.push(cur); }
      }
      return stops;
    }
    const flat = stops => stops.flatMap(s => s.items);
    function stopWalk(plan, stops) { let w = 0, a = START_AREA; for (const s of stops) { if (!s.area) continue; w += walkMin(a, s.area, plan); a = s.area; } return w; }
    function keepsRules(plan, items) {
      const F = FORMATS[plan.format], end = plan.start + F.dur, I = INTENSITY[plan.intensity] || INTENSITY.standard;
      const saved = plan.items; plan.items = items;
      try {
        const tl = timeline(plan, items);
        if (tl.t > end + 0.01) return false;
        if (countCrossings(plan) > (MAX_CROSS[plan.format] ?? 1)) return false;
        const cl = Object.fromEntries(WHO.map(k => [k, climber(plan, k)]));
        const laps = { me: 0, partner: 0 }, hard = { me: {}, partner: {} };
        for (const row of tl.rows) {
          if (row.kind !== 'route') continue;
          const r = row.r, gu = r.gu ?? -6, bucket = GU2(gradeLabel(r.gu, r.g)), rel = (row.t0 - plan.start) / F.dur, hr = Math.floor(row.t1 - plan.start);
          for (const k of row.who) {
            const c = cl[k];
            if (gu > ceilingAt(plan, c, rel) + 0.01) return false;
            if (plan.darkMax && row.light !== 'day' && bucket > GU2(plan.darkMax)) return false;
            if (plan.earlyHard && plan.format === '24' && row.t0 - plan.start >= 12 && gu >= c.os) return false;
            if (plan.warm) { const lo = r.type === 'trad' ? plan.tmin : plan.gmin, wn = plan.warmN ?? 3, base = Math.max(GU2(plan.warm), lo ? GU2(lo) : -99);
              if (bucket > base + (laps[k] < wn ? 0 : 1 + Math.floor((laps[k] - wn) / 2))) return false; }
            if (gu > c.os) { hard[k][hr] = (hard[k][hr] || 0) + 1; if (hard[k][hr] > I.hard) return false; }
            laps[k]++;
          }
        }
        return meets(plan);
      } finally { plan.items = saved; }
    }
    function polish(plan) {
      if (!plan.items.length) return;
      let stops = stopsOf(plan.items), cost = stopWalk(plan, stops);
      for (let iter = 0; iter < 80; iter++) {
        const cands = [];
        const n = stops.length;
        // fold a later visit to a wall into an earlier one
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (stops[i].area && stops[i].area === stops[j].area) {
          const s2 = stops.map(s => ({ area: s.area, items: s.items }));
          s2[i] = { area: s2[i].area, items: s2[i].items.concat(s2[j].items) }; s2.splice(j, 1);
          const m = stopsOf(flat(s2)); cands.push([stopWalk(plan, m) - cost, m]);
        }
        // move one whole stop somewhere else
        for (let k = 0; k < n; k++) { if (!stops[k].area) continue;
          for (let p = 0; p <= n; p++) { if (p === k || p === k + 1) continue;
            const s2 = stops.slice(); const [mv] = s2.splice(k, 1); s2.splice(p > k ? p - 1 : p, 0, mv);
            const d = stopWalk(plan, s2) - cost; if (d < -0.5) cands.push([d, stopsOf(flat(s2))]);
          } }
        cands.sort((a, b) => a[0] - b[0]);
        let moved = false;
        for (const [d, m] of cands) { if (d > -0.5) break; const it = flat(m); if (keepsRules(plan, it)) { stops = m; cost += d; moved = true; break; } }
        if (!moved) break;
      }
      plan.items = flat(stops);
    }

    // ---------- plan CRUD ----------
    function newPlan(fmt) {
      fmt = fmt || '24';
      const p = { id: 'p' + Date.now().toString(36), name: (fmt === '24' ? '24-hour' : '12-hour') + ' plan', format: fmt, date: defaultDate(fmt), start: FORMATS[fmt].startHour,
        goals: [], targets: {}, side: { east: true, over60: false, soft: true }, divs: {}, intensity: 'standard', avoidSun: true, reach: true, items: [] };
      state.plans.push(p); state.active = p.id; save(); return p;
    }

    // ---------- rendering ----------
    let editing = null; // index of item whose actions are open
    const setupOpen = {}; // plan id -> setup panel open?
    const collapsedStops = {}; // plan id -> Set of collapsed stop keys
    function render() {
      const y = window.scrollY; requestAnimationFrame(() => window.scrollTo(0, y)); // keep your place while editing
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
      if (plan.items.length) renderSummary(body, plan);
      if (plan.items.length || plan.manual) renderItems(body, plan);
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
      // stays as the user left it across re-renders; collapses only after a (re)build
      const d = el('details', 'setup'); d.open = setupOpen[plan.id] ?? !plan.items.length;
      d.addEventListener('toggle', () => { setupOpen[plan.id] = d.open; });
      d.appendChild(el('summary', null, `${FORMATS[plan.format].label}, ` + (goalsOf(plan).length ? `optimizing for ${goalText(plan)}` : 'no goals picked yet')));
      const upd = fn => () => { fn(); save(); render(); };
      const name = el('input'); name.type = 'text'; name.value = plan.name; name.onchange = () => { plan.name = name.value.trim() || plan.name; save(); render(); };
      d.appendChild(field('Plan name', name));
      d.appendChild(field('Event', chipRow([['24', '24-hour'], ['12', '12-hour']], plan.format, v => upd(() => { plan.format = v; plan.date = defaultDate(v); plan.start = FORMATS[v].startHour; plan.items = []; })())));
      const date = el('input'); date.type = 'date'; date.value = plan.date; date.onchange = () => { if (date.value) { plan.date = date.value; save(); render(); } };
      d.appendChild(field('Start date', date, `Runs ${[plan.start, plan.start + FORMATS[plan.format].dur].map(h => { const x = dh(plan, h); return x.wd + ' ' + Sun.fmt(x.hour); }).join(' to ')} (fixed by the rules). Defaults to the last full weekend of September.`));
      const sel = goalsOf(plan);
      const g = chipRow(Object.entries(GOALS).map(([k, v]) => [k, v.replace(/ \(.*\)/, '')]), Object.fromEntries(sel.map(k => [k, true])), v => upd(() => {
        let n = sel.includes(v) ? sel.filter(x => x !== v) : [...sel, v];
        plan.goals = n; plan.goal = n[0];
      })(), false);
      const F = FORMATS[plan.format];
      const gHint = { score: `Favors soft, shaded, high-point routes. ${F.pts.qualify.toLocaleString()} points (bonuses included) qualifies for next year.`, laps: `Fastest routes you can lead cleanly. ${F.laps.qualify} laps qualifies for next year.`, trad: `Trad leads count toward this. ${F.trad.qualify} trad laps qualifies for next year.`, height: F.ft ? `Favors tall routes. ${F.ft.toLocaleString()} ft also qualifies for next year.` : 'Favors tall routes.',
        full: `${F.laps.full} routes, ${plan.format === '24' ? 'all 24' : '12'} zones, and one end route at each end of the horseshoe (west: Hickadelic Jazzgrass, Meatcake, Catholic Boat, Elephant Ear or Wuwei; east: Orange Crush, Montezuma's Toe or Revenge, Purple Nehi or Supersoul Sureshot).`, golden: `${F.laps.golden} routes, ${F.trad.golden} trad, ${F.pts.golden.toLocaleString()} points and Full Horseshoe.`,
        qualify: 'Plans for the Full Horseshoe, the cheapest qualifying path for most teams.' };
      d.appendChild(field('Optimize for', g, (sel.length > 1 ? 'Pick as many as you like; the plan has to hit all of them. ' : sel.length ? 'Pick one or more. ' : 'Nothing picked yet. Pick one or more goals to get a recommended plan, or build it yourself below.') + sel.map(k => gHint[k]).join(' ')));
      const tbox = el('div', 'targets');
      for (const k of sel.filter(k => UNIT[k])) {
        const ti = el('input'); ti.type = 'number'; ti.inputMode = 'numeric'; ti.min = 1; ti.step = k === 'laps' || k === 'trad' ? 1 : 100; ti.value = targetOf(plan, k); ti.setAttribute('aria-label', GOALS[k]);
        ti.onchange = () => { plan.targets = plan.targets || {}; plan.targets[k] = Math.max(1, Math.round(+ti.value || 0)); save(); render(); };
        const row = el('div', 'target-row'); row.append(ti, el('span', null, UNIT[k] + ' per climber')); tbox.appendChild(row);
      }
      if (tbox.childNodes.length) d.appendChild(field(tbox.childNodes.length > 1 ? 'Targets' : 'Target', tbox));
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
      // grade range and warm-up
      const gradeList = [...new Set(comp().map(r => gradeLabel(r.gu, r.g)))].filter(L => L !== '?' && L !== '5th').sort((a, b) => GU2(a) - GU2(b));
      const gSel = (val, none, onPick, aria) => { const s = el('select'); s.setAttribute('aria-label', aria); s.add(new Option(none, '')); for (const L of gradeList) s.add(new Option(L, L)); s.value = val || ''; s.onchange = () => { onPick(s.value || undefined); save(); render(); }; return s; };
      const rg = el('div', 'target-row');
      rg.append(gSel(plan.gmin, 'Lowest: any', v => { plan.gmin = v; }, 'Lowest sport grade'), el('span', null, 'to'), gSel(plan.gmax, 'Highest: any', v => { plan.gmax = v; }, 'Highest sport grade'));
      d.appendChild(field('Sport grade range', rg));
      const tk = el('div', 'target-row');
      tk.append(gSel(plan.tmin, 'Lowest: any', v => { plan.tmin = v; }, 'Lowest trad grade'), el('span', null, 'to'), gSel(plan.tradMax, 'Highest: any', v => { plan.tradMax = v; }, 'Highest trad grade'));
      d.appendChild(field('Trad grade range', tk, 'Only routes in these ranges get planned; division and push level can still cap the top.'));
      const dk = el('div', 'target-row'); dk.append(gSel(plan.darkMax, 'No limit', v => { plan.darkMax = v; }, 'Hardest grade after dark'));
      const dl = Sun.daylight(plan.date);
      d.appendChild(field('Hardest grade after dark', dk, plan.darkMax ? `From dusk (about ${Sun.fmt(dl.set)}) until it's light again (about ${Sun.fmt(dl.rise)}), nothing harder than ${plan.darkMax}; harder routes get pulled into daylight.` : 'Optional. Caps the grade for climbing in the dark.'));
      const wu = el('div', 'target-row'); const wn = el('input'); wn.type = 'number'; wn.min = 1; wn.max = 20; wn.inputMode = 'numeric'; wn.value = plan.warmN ?? 3; wn.setAttribute('aria-label', 'Number of warm-up routes');
      wn.onchange = () => { plan.warmN = Math.max(1, Math.min(20, Math.round(+wn.value || 3))); save(); render(); };
      const wsel = gSel(plan.warm, 'No warm-up', v => { plan.warm = v; }, 'Warm-up grade'); wsel.style.flex = '1 1 100%';
      wu.classList.add('wrap'); wu.append(wsel, el('span', null, 'or easier for the first'), wn, el('span', null, 'routes'));
      d.appendChild(field('Warm-up', wu, plan.warm ? `Each of you starts with ${plan.warmN ?? 3} routes at ${plan.warm} or easier.` : 'Pick a grade to start the plan with easier routes.'));
      d.appendChild(field('How hard to push', chipRow(Object.entries(INTENSITY).map(([k, v]) => [k, v.label]), plan.intensity, v => upd(() => { plan.intensity = v; plan.breakMin = undefined; })()),
        { conservative: 'Stays at or below onsight; one harder lap per hour per climber.', standard: 'Up to one grade over onsight early, easing off overnight; two harder laps per hour.', aggressive: 'Up to two grades over onsight early (capped at project grade); three harder laps per hour.' }[plan.intensity]));
      const I = INTENSITY[plan.intensity] || INTENSITY.standard;
      const bi = el('input'); bi.type = 'number'; bi.inputMode = 'numeric'; bi.min = 0; bi.max = 30; bi.value = breakMin(plan);
      bi.onchange = () => { const v = Math.max(0, Math.min(30, Math.round(+bi.value || 0))); plan.breakMin = v === I.breaks ? undefined : v; save(); render(); };
      const brow = el('div', 'target-row'); brow.append(bi, el('span', null, 'minutes per hour'));
      d.appendChild(field('Breaks', brow, `Suggested for ${I.label} ${I.breaks} min per hour. Taken as one break each hour. Walking between walls is ${I.walkName}.`));
      const sp0 = sunPref(plan);
      d.appendChild(field('Sun or shade', chipRow([['shade', 'I prefer to climb in the shade'], ['sun', 'I prefer to climb in direct sun'], ['none', 'No preference']], sp0,
        v => upd(() => { plan.sunPref = v; })()), { sun: 'Favors walls in direct sun whenever it\'s light out.', shade: 'Keeps you off the sunny East side in the afternoon. The West and North walls are under tree cover, so they stay fair game.', none: 'Sun and shade don\'t affect the plan.' }[sp0] || ''));
      // starting walls, in order
      const sw = el('div', 'startwalls'); const list = (plan.startWalls ||= []);
      list.forEach((a, i) => { const c = el('button', 'chip-x', `${i + 1}. ${a.replace(/^The /, '')} ×`); c.type = 'button'; c.setAttribute('aria-label', 'Remove ' + a); c.onclick = upd(() => list.splice(i, 1)); sw.appendChild(c); });
      const addSel = el('select'); addSel.add(new Option(list.length ? 'Then…' : 'Add a wall…', ''));
      const wallsAll = [...new Set(comp().map(r => r.area))].filter(a => !list.includes(a) && AREAS()[a]);
      const sideOrder = { West: 0, North: 1, East: 2, Valley: 3 };
      const sideOf = a => (comp().find(r => r.area === a) || {}).side || 'Valley';
      wallsAll.sort((x, y) => (sideOrder[sideOf(x)] - sideOrder[sideOf(y)]) || ((linePos(AREAS()[x]) ?? 0) - (linePos(AREAS()[y]) ?? 0)));
      let og = null, lastSide = null;
      for (const a of wallsAll) { const sd = sideOf(a); if (sd !== lastSide) { og = document.createElement('optgroup'); og.label = sd === 'Valley' ? 'Valley floor' : sd + ' side'; addSel.appendChild(og); lastSide = sd; } og.appendChild(new Option(a, a)); }
      addSel.onchange = () => { if (addSel.value) { list.push(addSel.value); save(); render(); } };
      sw.appendChild(addSel);
      d.appendChild(field('Start at', sw, list.length ? 'The plan starts at these walls in this order, staying at each until moving on pays off, then plans the rest itself.' : 'Optional. Pick walls to start with, in order; the planner takes it from there.'));
      d.appendChild(field('Options', chipRow([['together', 'Same routes for both'], ['reach', 'Skip routes too reachy']], { together: plan.together !== false, reach: plan.reach !== false },
        v => upd(() => { plan[v] = plan[v] === false; })(), false)));
      if (plan.format === '24') {
        const lab2 = el('label', 'checkline'); const cb2 = el('input'); cb2.type = 'checkbox'; cb2.checked = !!plan.earlyHard;
        cb2.onchange = () => { plan.earlyHard = cb2.checked; save(); render(); };
        lab2.append(cb2, el('span', null, 'Harder climbs in the first 12 hours only'));
        d.appendChild(field('First half', lab2, `Routes at or above onsight only before ${Sun.fmt((plan.start + 12) % 24)}; the second half sticks to routes below onsight.`));
      }
      const missing = WHO.filter(k => !(profiles[k] || {}).onsight);
      if (missing.length) d.appendChild(el('p', 'warn', 'Add onsight and project grades in the You tab for ' + missing.map(k => k === 'me' ? 'you' : 'your partner').join(' and ') + '. Until then the planner assumes a 5.9 onsight.'));
      const go = el('button', 'btn primary', plan.items.length ? 'Rebuild recommended plan' : 'Build recommended plan'); go.type = 'button';
      if (!goalsOf(plan).length) { go.disabled = true; go.title = 'Pick at least one goal first'; }
      go.onclick = () => {
        if (plan.items.some(i => i.done) && !confirm('Rebuilding replaces the whole plan, including checked-off routes. Continue?')) return;
        go.disabled = true; go.textContent = 'Building…';
        setTimeout(() => { build(plan); setupOpen[plan.id] = false; save(); render(); ctx.onPlanChange(); }, 30);
      };
      const mine = el('button', 'btn', 'Build it myself'); mine.type = 'button';
      mine.onclick = () => {
        if (plan.items.length && !confirm('Start an empty plan? This clears the current one.')) return;
        plan.items = []; plan.manual = true; editing = null; save(); render(); ctx.onPlanChange();
      };
      const br = el('div', 'btnrow'); br.append(go, mine); d.appendChild(br);
      d.appendChild(el('p', 'hint small', plan.manual ? `Hand-built plan: add walls and routes below. Timing uses your push level (${(INTENSITY[plan.intensity] || INTENSITY.standard).label}) for climbing and walking, plus check-ins and breaks.` : 'Or build it yourself: pick walls and routes, and the timing is worked out from your push level.'));
      body.appendChild(d);
    }

    function countCrossings(plan) {
      let g0 = null, n = 0;
      for (const it of plan.items) { const r = it.rid && byId[it.rid]; if (!r) continue; const g = sideGroup(r.side); if (g && g0 && g !== g0) n++; if (g) g0 = g; }
      return n;
    }
    // routes per grade, per climber (horizontal bars; one bar when you both lead the same routes)
    function gradeLabel(gu, g) {
      if (gu == null) return g && /5th/i.test(g) ? '5th' : '?';
      if (gu < 0) return '5.' + (10 + Math.round(gu));
      return '5.' + (10 + Math.floor(gu / 4)) + 'abcd'[Math.min(3, Math.floor(gu % 4))];
    }
    const GU2 = L => { const m = /^5\.(\d+)([abcd])?/.exec(L); if (!m) return -9; const n = +m[1]; return n >= 10 ? (n - 10) * 4 + (m[2] ? 'abcd'.indexOf(m[2]) : 0) : n - 10; };
    function gradeChart(plan, tl) {
      const counts = {}, order = {};
      for (const row of tl.rows) if (row.kind === 'route') {
        const L = gradeLabel(row.r.gu, row.r.g); order[L] = row.r.gu ?? -9;
        for (const k of row.who) ((counts[L] ||= { me: 0, partner: 0 })[k]++);
      }
      const labels = Object.keys(counts).sort((a, b) => order[a] - order[b]);
      const same = labels.every(L => counts[L].me === counts[L].partner);
      const max = Math.max(1, ...labels.flatMap(L => [counts[L].me, counts[L].partner]));
      const box = el('figure', 'gradechart');
      box.appendChild(el('figcaption', null, 'Routes by grade'));
      const names = WHO.map(k => climber(plan, k).name);
      for (const L of labels) {
        const row = el('div', 'gc-row'); row.appendChild(el('span', 'gc-l', L));
        const bars = el('span', 'gc-bars');
        for (const [i, k] of (same ? [[0, 'me']] : WHO.map((k, i) => [i, k]))) {
          const n = counts[L][k]; const line = el('span', 'gc-line');
          const b = el('span', 'gc-bar ' + (same ? 'both' : 'c' + i)); b.style.width = (n / max * 100) + '%';
          line.title = `${L}: ${n} route${n === 1 ? '' : 's'}${same ? ' each' : ' for ' + names[i]}`;
          line.append(b, el('span', 'gc-n', n)); bars.appendChild(line);
        }
        row.appendChild(bars); box.appendChild(row);
      }
      const key = el('p', 'gc-key');
      if (same) key.textContent = 'Same routes for both of you';
      else names.forEach((n, i) => { const s2 = el('span'); s2.append(el('i', 'gc-sw c' + i), document.createTextNode(n)); key.appendChild(s2); });
      box.appendChild(key);
      // grade limits: cap how many routes of a grade each climber gets, then rebuild
      const lims = plan.gradeMax || {};
      const limBox = el('div', 'gc-limits');
      const sel = el('select'); sel.setAttribute('aria-label', 'Grade to limit'); sel.add(new Option('Limit a grade…', ''));
      const allGrades = [...new Set(comp().map(r => gradeLabel(r.gu, r.g)))].filter(L => L !== '?').sort((a, b) => GU2(a) - GU2(b));
      for (const L of allGrades) sel.add(new Option(L + (counts[L] ? ` (${Math.max(counts[L].me, counts[L].partner)} now)` : ''), L));
      const num = el('input'); num.type = 'number'; num.min = 0; num.inputMode = 'numeric'; num.placeholder = 'max'; num.setAttribute('aria-label', 'Most routes of that grade per climber');
      sel.onchange = () => { if (sel.value && counts[sel.value]) num.value = Math.max(0, Math.max(counts[sel.value].me, counts[sel.value].partner) - 1); num.focus(); };
      const addL = el('button', 'btn', 'Set'); addL.type = 'button';
      addL.onclick = () => { if (!sel.value || num.value === '') return; plan.gradeMax = { ...lims, [sel.value]: Math.max(0, Math.round(+num.value)) }; save(); render(); };
      const row1 = el('div', 'gc-limrow'); row1.append(sel, num, addL); limBox.appendChild(row1);
      const keys = Object.keys(lims).sort((a, b) => GU2(a) - GU2(b));
      if (keys.length) {
        const chips = el('div', 'gc-limrow');
        for (const L of keys) { const c = el('button', 'chip-x', `${L} ≤ ${lims[L]} ×`); c.type = 'button'; c.setAttribute('aria-label', 'Remove the ' + L + ' limit');
          c.onclick = () => { const n = { ...lims }; delete n[L]; plan.gradeMax = n; save(); render(); }; chips.appendChild(c); }
        limBox.appendChild(chips);
        const over = keys.some(L => counts[L] && Math.max(counts[L].me, counts[L].partner) > lims[L]);
        const go = el('button', 'btn' + (over ? ' primary' : ''), 'Recalculate with these limits'); go.type = 'button';
        go.onclick = () => { if (plan.items.some(i => i.done) && !confirm('Recalculating replaces the whole plan, including checked-off routes. Continue?')) return;
          go.disabled = true; go.textContent = 'Recalculating…'; setTimeout(() => { build(plan); save(); render(); ctx.onPlanChange(); }, 30); };
        limBox.appendChild(go);
      }
      box.appendChild(limBox);
      return box;
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
      // efficiency: share of moving time (walking + climbing) spent climbing; breaks and check-in stops don't count
      let walkM = 0, climbM = 0;
      for (const r of tl.rows) { const m = (r.t1 - r.t0) * 60; if (r.kind === 'walk') walkM += m; else if (r.kind === 'route') climbM += m; }
      const pct = climbM + walkM ? climbM / (climbM + walkM) * 100 : 0;
      const letter = pct >= 92 ? 'A' : pct >= 88 ? 'B' : pct >= 84 ? 'C' : pct >= 80 ? 'D' : 'F';
      const hm = m => m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`;
      const teamRow = (label, text, title) => { const tr = el('tr', 'team'); const td = el('td', null, text); td.colSpan = WHO.length; if (title) tr.title = title; tr.append(el('th', null, label), td); tbl.appendChild(tr); };
      { const gt = goalTimes(plan, tl), gs = goalsOf(plan), end = plan.start + F.dur;
        if (gs.length) {
          const times = gs.map(g => gt[g]); const last = times.some(x => x == null) ? null : Math.max(...times);
          const aim = Math.max(...gs.map(g => (BUFFER[g] || {})[plan.format] || 0));
          const spare = last == null ? null : end - last;
          teamRow('Goals met by', last == null ? 'Not reached' : `${fmtAbs(plan, last, true)} · ${spare.toFixed(1)} h buffer (aim ${aim} h)`,
            gs.map(g => `${GOALS[g].replace(/ \(.*\)/, '')}: ${gt[g] == null ? 'not reached' : fmtAbs(plan, gt[g], true)}`).join('; '));
          const gr = tbl.lastChild; gr.classList.add('goalsby'); tbl.insertBefore(gr, tbl.children[1]); // first row under the names
          if (last != null && spare < aim - 0.05) sec.appendChild(el('p', 'warn', `Only ${spare.toFixed(1)} h spare after your goals (aim ${aim} h). There's little room for a lost phone or a queue at a must-have route; a harder push level, a higher division or a lower target would buy time.`));
        } }
      teamRow('Efficiency', `${letter} · ${Math.round(pct)}% climbing`, 'A: 92%+ of moving time climbing, B: 88%+, C: 84%+, D: 80%+, F: under 80%. Breaks and check-in stops are left out; walks to check-in count.');
      teamRow('Walk : climb', `1 : ${walkM ? (climbM / walkM).toFixed(1) : '∞'} (${hm(walkM)} walking, ${hm(climbM)} climbing)`);
      const grid = el('div', 'sumgrid'); grid.append(tbl, gradeChart(plan, tl)); sec.appendChild(grid);
      const lb = grid.querySelector('.gc-limits'); if (lb) sec.appendChild(lb); // full width under the table and chart
      // why the two lists differ: the inputs each climber was planned with, and routes only one of you leads
      const solo = WHO.map(k => plan.items.filter(it => it.who && it.who.length === 1 && it.who[0] === k).length);
      const inp = WHO.map(k => { const c = climber(plan, k), p = c.raw;
        return `${c.name}: onsight ${p.onsight || '5.9 (not set)'}, project ${p.project || 'not set'}, ${DIVS[c.div].label}${p.ht ? ', ' + Math.floor(p.ht / 12) + "'" + (p.ht % 12) + '"' : ', height not set'}`; });
      sec.appendChild(el('p', 'hint small', `Planned with ${inp.join('; ')}.` + (solo[0] + solo[1] ? ` Routes only one of you leads: ${climber(plan, 'me').name} ${solo[0]}, ${climber(plan, 'partner').name} ${solo[1]} (the other belays). These come from different grades, divisions or reach.` : ' You lead the same routes.')));
      const idleM = tl.rows.filter(r => r.kind === 'break' && r.i != null && plan.items[r.i] && plan.items[r.i].idle).reduce((a, r) => a + (r.t1 - r.t0) * 60, 0);
      if (idleM >= 10) { const firstIdle = tl.rows.find(r => r.kind === 'break' && r.i != null && plan.items[r.i] && plan.items[r.i].idle);
        sec.appendChild(el('p', 'warn', `${Math.round(idleM / 60 * 10) / 10} h with nothing to climb, from ${fmtAbs(plan, firstIdle.t0, true)}: you've used up every route that fits your settings within reach. Loosen the hardest grade after dark, the grade range or grade limits, or the hardest trad grade, then rebuild.`)); }
      const cx = countCrossings(plan);
      sec.appendChild(el('p', 'hint small', `Canyon crossings: ${cx} (limit ${MAX_CROSS[plan.format]}${plan.format === '24' ? ', one is best' : ''}).`));
      const climbing = Math.max(...WHO.map(k => tl.stats[k].laps));
      const rp = el('p', 'pace-calc');
      rp.textContent = `Required pace: ${(climbing / F.dur).toFixed(1)} laps per hour per climber (${climbing} laps over ${F.dur} hours).`;
      sec.appendChild(rp);
      if (plan.unreachable) sec.appendChild(el('p', 'warn', `This plan can't reach ${goalText(plan)} for both climbers even at a very fast pace. Try a lower target, a harder push setting, or a higher division.`));
      sec.appendChild(el('p', 'hint small', `Plan ends ${fmtAbs(plan, tl.t, true)}; event ends ${fmtAbs(plan, plan.start + F.dur, true)}.${tl.t > plan.start + F.dur + 0.01 ? ' The plan runs past the end, so trim a route or two.' : ''}`));
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
      let stop = 0, lastArea = null; const groups = []; // groups: one per wall stop, in plan order
      const fold = (collapsedStops[plan.id] ||= new Set()); const seenArea = {}; // stop key = wall + nth visit, survives reorders of other walls
      const dragHandle = label => { const b = el('button', 'drag', '⠿'); b.type = 'button'; b.setAttribute('aria-label', label); return b; };
      // drag and drop (pointer events, so it works with touch): routes move one at a time, walls move with all their routes
      const startDrag = (e, kind, idx, srcLi, grp) => {
        e.preventDefault(); const h = e.currentTarget; h.setPointerCapture(e.pointerId);
        const moving = kind === 'route' ? [srcLi] : groups[idx].members;
        // a route only moves within its own wall
        const own = kind === 'route' ? grp.members.filter(x => x.classList.contains('p-route')) : null;
        const targets = kind === 'route' ? own.filter(x => x !== srcLi) : groups.filter((g, j) => j !== idx).map(g => g.el);
        const endEl = kind === 'route' ? own[own.length - 1] : null;
        let lo = -Infinity, hi = Infinity;
        if (kind === 'route') { const r0 = srcLi.getBoundingClientRect(), a = own[0].getBoundingClientRect(), z = endEl.getBoundingClientRect(); lo = a.top - r0.top; hi = z.bottom - r0.bottom; }
        const y0 = e.clientY + window.scrollY; let lastY = e.clientY, target = undefined, scroller = 0;
        moving.forEach(m => m.classList.add('dragging'));
        const mark = () => {
          const y = lastY; let t = null;
          for (const x of targets) { const rc = x.getBoundingClientRect(); if (y < rc.top + rc.height / 2) { t = x; break; } }
          if (t !== target) { list.querySelectorAll('.drop-before,.drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
            if (t) t.classList.add('drop-before'); else if (endEl) endEl.classList.add('drop-after'); else list.classList.add('drop-end');
            if (t || !endEl) list.classList.toggle('drop-end', !t && !endEl); target = t; }
          const dy = Math.max(lo, Math.min(hi, lastY + window.scrollY - y0)); moving.forEach(m => m.style.transform = `translateY(${dy}px)`);
        };
        const onMove = ev => { lastY = ev.clientY; mark(); };
        scroller = setInterval(() => { const edge = 70, H = window.innerHeight; const v = lastY < edge + 40 ? -14 : lastY > H - edge - 60 ? 14 : 0; if (v) { window.scrollBy(0, v); mark(); } }, 30);
        const onUp = () => {
          clearInterval(scroller); h.removeEventListener('pointermove', onMove); h.removeEventListener('pointerup', onUp); h.removeEventListener('pointercancel', onUp);
          moving.forEach(m => { m.classList.remove('dragging'); m.style.transform = ''; });
          list.querySelectorAll('.drop-before,.drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after')); list.classList.remove('drop-end');
          if (target === undefined) return;
          const items = plan.items;
          if (kind === 'route') {
            const to = target ? +target.dataset.i : +endEl.dataset.i + 1; if (to === idx || to === idx + 1) return;
            const [it] = items.splice(idx, 1); items.splice(to > idx ? to - 1 : to, 0, it);
          } else {
            const g = groups[idx], s0 = g.start, s1 = idx + 1 < groups.length ? groups[idx + 1].start : items.length;
            const tg = target ? groups.find(x => x.el === target) : null; const to = tg ? tg.start : items.length;
            if (to === s0 || to === s1) return;
            const block = items.splice(s0, s1 - s0); items.splice(to > s0 ? to - block.length : to, 0, ...block);
          }
          editing = null; save(); render(); ctx.onPlanChange();
        };
        h.addEventListener('pointermove', onMove); h.addEventListener('pointerup', onUp); h.addEventListener('pointercancel', onUp);
        mark();
      };
      const whoLabel = w => w.length === 2 ? 'Both' : w[0] === 'me' ? climber(plan, 'me').name : climber(plan, 'partner').name;
      // where the goals are all met: everything after that line is optional
      const gtL = goalTimes(plan, tl), gsL = goalsOf(plan);
      const doneAt = gsL.length && gsL.every(g => gtL[g] != null) ? Math.max(...gsL.map(g => gtL[g])) : null;
      let lineDrawn = doneAt == null;
      for (const row of tl.rows) {
        if (!lineDrawn && row.t0 >= doneAt - 1e-6 && !(row.kind === 'route' && Math.abs(row.t1 - doneAt) < 1e-6)) {
          lineDrawn = true; const end = plan.start + FORMATS[plan.format].dur;
          list.appendChild(el('li', 'p-goalline', `Goals met at ${fmtAbs(plan, doneAt, true)} · ${(end - doneAt).toFixed(1)} h buffer. Everything below is optional.`));
        }
        if (row.kind === 'walk') { list.appendChild(el('li', 'p-walk light-' + row.light, `${(INTENSITY[plan.intensity] || INTENSITY.standard).walk >= 120 ? 'Jog' : 'Walk'} ${Math.max(1, Math.round((row.t1 - row.t0) * 60))} min to ${placeName(row.to)}`)); continue; }
        if (row.kind === 'checkin' || row.kind === 'break') {
          const li = el('li', 'p-break ' + row.kind + (row.auto ? ' auto' : '')); li.append(el('span', 'p-time', fmtAbs(plan, row.t0, true)), el('span', null, `${row.label}, ${Math.round((row.t1 - row.t0) * 60)} min`));
          if (row.i != null) { const x = el('button', 'icon', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Remove break'); x.onclick = () => { plan.items.splice(row.i, 1); save(); render(); ctx.onPlanChange(); }; li.appendChild(x); }
          list.appendChild(li); continue;
        }
        const r = row.r;
        if (r.area !== lastArea) { stop++; lastArea = r.area; groups.push({ start: row.i, el: null, members: [] });
          const key = r.area + '#' + (seenArea[r.area] = (seenArea[r.area] || 0) + 1);
          const h = el('li', 'p-stop'); h.dataset.key = key; if (fold.has(key)) h.classList.add('folded');
          const tg = el('button', 'p-fold', fold.has(key) ? '▸' : '▾'); tg.type = 'button'; tg.setAttribute('aria-expanded', !fold.has(key)); tg.setAttribute('aria-label', (fold.has(key) ? 'Show' : 'Hide') + ' routes at ' + r.area);
          tg.onclick = () => { fold.has(key) ? fold.delete(key) : fold.add(key); render(); };
          h.append(tg, el('span', 'p-stopn', stop), el('span', 'p-stopname', r.area), el('span', 'p-time', fmtAbs(plan, row.t0, true)));
          const G = groups[groups.length - 1];
          const addB = el('button', 'p-add', '+ Add'); addB.type = 'button'; addB.setAttribute('aria-label', 'Add a route at ' + r.area);
          addB.onclick = () => { const gi = groups.indexOf(G); openPicker(plan, gi + 1 < groups.length ? groups[gi + 1].start : plan.items.length, r.area); };
          const gh = dragHandle('Drag to move ' + r.area + ' and its routes'); h.append(addB, gh); G.el = h; G.members.push(h);
          gh.addEventListener('pointerdown', e => startDrag(e, 'wall', groups.indexOf(G)));
          list.appendChild(h); }
        const li = el('li', 'p-route' + (row.done ? ' done' : '')); li.dataset.i = row.i;
        const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!row.done; cb.setAttribute('aria-label', 'Done: ' + r.name);
        cb.onchange = () => { const it = plan.items[row.i]; it.done = cb.checked ? new Date().toISOString() : undefined; save(); render(); ctx.onPlanChange(); };
        const main = el('button', 'p-main'); main.type = 'button';
        main.append(el('span', 'p-time', Sun.fmt(dh(plan, row.t0).hour)), el('span', 'grade ' + (ctx.feelOf(r) ? 'feel-' + ctx.feelOf(r) : ''), r.g), el('span', 'p-name', r.name));
        const tags = el('span', 'p-tags');
        tags.append(el('span', 'pts', r.pts));
        tags.appendChild(el('span', 'who', whoLabel(row.who)));
        if (row.sun === 'sun' && row.light === 'day') tags.appendChild(el('span', 'tag sun', 'Sun'));
        if (row.light !== 'day') tags.appendChild(el('span', 'tag night', row.light === 'night' ? 'Dark' : dh(plan, row.t0).hour < 12 ? 'Dawn' : 'Dusk'));
        if (r.sp) tags.appendChild(el('span', 'tag special', (r.sp === 'E' ? 'East' : 'West') + ' end'));
        tags.appendChild(el('span', 'tag ' + (r.type === 'trad' ? 'trad' : 'sport'), r.type === 'trad' ? 'Trad' : r.type === 'mixed' ? 'Mixed' : 'Sport'));
        main.appendChild(tags);
        main.onclick = () => { editing = editing === row.i ? null : row.i; render(); };
        const hd = dragHandle('Drag to reorder ' + r.name + ' within ' + r.area); const Gr = groups[groups.length - 1]; hd.addEventListener('pointerdown', e => startDrag(e, 'route', row.i, li, Gr));
        li.append(cb, main, hd); groups[groups.length - 1].members.push(li);
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
      // collapsed walls: hide their routes and breaks, show a count on the header
      let hide = false, cnt = null;
      for (const li of list.children) {
        if (li.classList.contains('p-stop')) { hide = li.classList.contains('folded'); cnt = { li, n: 0 }; li._cnt = cnt; continue; }
        if (li.classList.contains('p-walk') || li.classList.contains('p-goalline')) continue;
        if (li.classList.contains('p-route') && cnt) cnt.n++;
        if (hide && !li.classList.contains('checkin')) li.hidden = true;
      }
      for (const h of list.querySelectorAll('.p-stop.folded')) h.insertBefore(el('span', 'p-count', h._cnt.n + (h._cnt.n === 1 ? ' route' : ' routes')), h.querySelector('.p-time'));
      const bar = el('div', 'btnrow fold-bar');
      const allKeys = [...list.querySelectorAll('.p-stop')].map(h => h.dataset.key);
      const bF = el('button', 'btn', 'Collapse all walls'); bF.type = 'button'; bF.onclick = () => { allKeys.forEach(k => fold.add(k)); render(); };
      const bE = el('button', 'btn', 'Expand all'); bE.type = 'button'; bE.onclick = () => { fold.clear(); render(); };
      bar.append(bF, bE); body.appendChild(bar);
      body.appendChild(list);
      const add = el('div', 'btnrow');
      const wsel = el('select'); wsel.setAttribute('aria-label', 'Add routes from a wall'); wsel.add(new Option(plan.items.length ? 'Add routes from a wall…' : 'Start at a wall…', ''));
      const sideOrder = { West: 0, North: 1, East: 2, Valley: 3 }, sideOf = a => (comp().find(r => r.area === a) || {}).side || 'Valley';
      const walls = [...new Set(comp().map(r => r.area))].filter(a => AREAS()[a]).sort((x, y) => (sideOrder[sideOf(x)] - sideOrder[sideOf(y)]) || ((linePos(AREAS()[x]) ?? 0) - (linePos(AREAS()[y]) ?? 0)));
      let og = null, ls = null;
      for (const a of walls) { const sd = sideOf(a); if (sd !== ls) { og = document.createElement('optgroup'); og.label = sd === 'Valley' ? 'Valley floor' : sd + ' side'; wsel.appendChild(og); ls = sd; } og.appendChild(new Option(a, a)); }
      wsel.onchange = () => { if (wsel.value) openPicker(plan, plan.items.length, wsel.value); wsel.value = ''; };
      body.appendChild(wsel); wsel.classList.add('wall-add');
      const b1 = el('button', 'btn', 'Add route at end'); b1.type = 'button'; b1.onclick = () => openPicker(plan, plan.items.length);
      const b2 = el('button', 'btn', 'Add break at end'); b2.type = 'button'; b2.onclick = () => { plan.items.push({ type: 'break', min: 15, label: 'Break' }); save(); render(); };
      add.append(b1, b2); body.appendChild(add);
    }

    // picker: suggestions ranked by fit at the insertion point
    function openPicker(plan, at, wall) {
      const d = $('#detail'); d.textContent = '';
      const tl = normRows(timeline(plan, plan.items, at));
      const head = el('header', 'd-head'); const t = el('div', 'd-title');
      t.append(el('h2', null, wall ? 'Add a route at ' + wall : 'Add a route'), el('p', null, wall ? 'Tap routes to add them in order; close when done' : `At about ${fmtAbs(plan, tl.t, true)}${tl.area ? ', near ' + tl.area : ''}`));
      const close = el('button', 'd-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close'); close.onclick = () => d.close();
      head.append(t, close); d.appendChild(head);
      const q = el('input', 'search'); q.type = 'search'; q.placeholder = 'Search all routes'; q.style.margin = '0 16px 8px'; q.style.width = 'calc(100% - 32px)';
      d.appendChild(q);
      const ol = el('ol', 'routes compact picker'); d.appendChild(ol);
      const rel = (tl.t - plan.start) / FORMATS[plan.format].dur;
      const cl = Object.fromEntries(WHO.map(k => [k, climber(plan, k)]));
      const inPlan = Object.fromEntries(WHO.map(k => [k, new Set(plan.items.filter(it => it.rid && it.who && it.who.includes(k)).map(it => it.rid))]));
      const cands = comp().filter(r => !wall || r.area === wall).map(r => {
        const who = WHO.filter(k => !tl.stats[k].done.has(r.id) && !inPlan[k].has(r.id) && (r.gu ?? -6) <= DIVS[cl[k].div].max);
        const okNow = who.filter(k => (r.gu ?? -6) <= ceilingAt(plan, cl[k], rel) + 0.01);
        const w = walkMin(tl.area, r.area, plan);
        let mins = w + 1; for (const k of (okNow.length ? okNow : who)) mins += leadMin(plan, r, cl[k], tl.t);
        return { r, who: okNow.length ? okNow : who, mins, w, score: ((r.pts || 0) * (okNow.length || 0.3)) / mins };
      }).filter(c => c.who.length);
      const draw = () => {
        ol.textContent = '';
        const term = q.value.trim().toLowerCase();
        const list = (term ? cands.filter(c => (c.r.name + ' ' + c.r.area + ' ' + c.r.n).toLowerCase().includes(term)) : cands.slice().sort(wall ? (a, b) => (a.r.gu ?? -9) - (b.r.gu ?? -9) : (a, b) => b.score - a.score)).slice(0, wall ? 200 : 60);
        if (!list.length) ol.appendChild(el('li', 'hint', wall ? 'Every route here that you can climb is already in the plan.' : 'No matches.'));
        for (const c of list) {
          const li = el('li', 'route');
          const whoTxt = c.who.length === WHO.length ? '' : ', ' + climber(plan, c.who[0]).name + ' only';
          li.append(el('span', 'grade ' + (ctx.feelOf(c.r) ? 'feel-' + ctx.feelOf(c.r) : ''), c.r.g), (() => { const m = el('span', 'mid'); m.append(el('span', 'name', c.r.name), el('span', 'sub', wall ? `${c.r.type || 'sport'}, ${c.r.ht || '?'} ft, about ${Math.round(c.mins - c.w)} min${whoTxt}` : `${c.r.area}, ${c.w ? Math.round(c.w) + ' min walk' : 'here'}, ${Math.round(c.mins - c.w)} min to climb${whoTxt}`)); return m; })(), el('span', 'right', c.r.pts));
          li.onclick = () => {
            plan.items.splice(at, 0, { rid: c.r.id, who: c.who }); save(); render(); ctx.onPlanChange();
            if (!wall) return d.close();
            at++; cands.splice(cands.indexOf(c), 1); li.remove(); // wall picker stays open so you can add several
            if (!ol.querySelector('li.route')) d.close();
          };
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

    return { _build: build, _meets: meets, _opt: optimize, _tl: (p) => timeline(p, p.items), _polish: polish, _keeps: keepsRules, _cross: countCrossings, _tune: o => Object.assign(TUNE, o), setWalkWeight: v => { WALKW = v; }, render, mapData, active, span() { const p = active(); return p && p.items.length ? { date: p.date, start: p.start, end: p.start + FORMATS[p.format].dur, now: clockAbs(p) } : null; }, state: () => state, exportState: () => state, importState(s) { if (s && Array.isArray(s.plans)) { for (const p of s.plans) if (!state.plans.some(x => x.id === p.id)) state.plans.push(fixStart(p)); save(); } } };
  };
})();
