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
    conservative: { label: "Don't Hurt Me", ceil: [0, -1, -2, -1], hard: 1, walk: 70, walkPrep: 2, breaks: 10, walkName: 'an easy walk (about 4.2 km/h)' },
    standard: { label: 'Bring it On!', ceil: [1, 0, -1, 0], hard: 2, walk: 90, walkPrep: 1, breaks: 5, walkName: 'a fast walk (about 5.4 km/h)' },
    aggressive: { label: 'I am Death Incarnate!!', ceil: [2, 1, 0, 1], hard: 3, walk: 140, walkPrep: 0.5, breaks: 0, walkName: 'a steady jog (about 8.4 km/h)' },
  };
  const WHO = ['me', 'partner'];
  const TARGET_DEFAULT = { 24: { laps: 100, score: 12000, height: 5280, trad: 55 }, 12: { laps: 65, score: 8000, height: 3000, trad: 40 } };
  const PATH_MODES = ['loopW', 'loopE', 'uE', 'uW'];
  const CORE_MODES = ['coreW', 'uW']; // path shapes that start in the North Forty core (both head West first)
  // "Start in the North Forty core": on unless turned off; coverage goals and chosen start walls decide the start themselves
  const coreOn = plan => plan.coreFirst !== false && !['full', 'golden'].some(g => (plan.goals || (plan.goal ? [plan.goal] : [])).includes(g)) && !(plan.startWalls || []).length;
  const PATH_WINDOW = 2; // how many climbable walls ahead the planner may pick from
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
    // The valley-floor crags (The Park, The Carrion Cube) aren't comp zones and sit off the walking line; no top team
    // used them, so the planner leaves them out. They stay in the Routes tab.
    const NO_PLAN_AREAS = new Set(['The Park', 'The Carrion Cube']);
    const comp = () => ROUTES().filter(r => r.n && !NO_PLAN_AREAS.has(r.area));

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
      const lt = pre ? pre.lt : light(plan, abs);
      return m * slowF(plan, abs, lt) * (plan.manual ? (MANUAL_PACE[plan.intensity] || 1) : (plan.paceF || 1));
    }
    // From timed logs of 26 top 2025-26 climbers: 24-hour laps per 6-hour block about 26/28/24/21%, 12-hour per 3-hour block about 29/22/25/24%.
    // Leads get slower as the hours pile up and slower again in the dark. plan.fatigue === false turns this off.
    const FATIGUE = { 24: 0.01, 12: 0.012 }, DARK_SLOW = 1.05;
    const CORE_H = { 24: 6, 12: 4 }; // hours to favour the North Forty core at the start (top 12-hour teams stayed in zones 8-15; 24-hour teams were split, so it's an option)
    function slowF(plan, abs, lt) {
      if (plan.fatigue === false) return lt && lt !== 'day' ? 1.1 : 1;
      const hrs = Math.max(0, abs - plan.start), k = push(plan).slow;
      return (1 + (FATIGUE[plan.format] ?? 0.01) * k * hrs) * (lt && lt !== 'day' ? 1 + (DARK_SLOW - 1) * k : 1);
    }
    // Bring it On! is the learned case; Death Incarnate holds pace better, Don't Hurt Me slows a lot more.
    const SLOW_SCALE = { aggressive: 0.75, standard: 1, conservative: 2 };
    // Don't Hurt Me and Bring it On! aren't sped up to meet goals: they plan at a fixed steady pace (paceF; 1 = base model)
    // and the app says what that reaches. Calibrated with a 5.10a-onsight team: Bring it On! matches the top 2026
    // Intermediates (about 114 laps on the 24, 69 on the 12); Don't Hurt Me just about qualifies (about 74 / 41).
    // Only I am Death Incarnate!! searches for whatever pace the goals need (fatigue and night slowdown still apply).
    const FIXED_PACE = { conservative: { 24: 0.75, 12: 0.65 }, standard: { 24: 0.6, 12: 0.6 } };
    // Minutes per route for the changeover (pull the rope, swap ends, tie in), by push level.
    const CHANGEOVER = { conservative: 3, standard: 1.5, aggressive: 1 };
    // Effective push settings. Death Incarnate scales from Bring it On!'s settings (effort 0) to all-out (effort 1):
    // the pace search sets plan.effort with the climbing pace, so an easy target doesn't get free time from no breaks and jogging.
    function push(plan) {
      const k = plan && INTENSITY[plan.intensity] ? plan.intensity : 'standard', I = INTENSITY[k];
      const base = { walk: I.walk, walkPrep: I.walkPrep, breaks: I.breaks, change: CHANGEOVER[k], slow: SLOW_SCALE[k] };
      if (k !== 'aggressive' || plan.manual || plan.effort == null) return base;
      const S = INTENSITY.standard, e = Math.max(0, Math.min(1, plan.effort)), mix = (a, b) => a + (b - a) * e;
      return { walk: mix(S.walk, I.walk), walkPrep: mix(S.walkPrep, I.walkPrep), breaks: Math.round(mix(S.breaks, I.breaks)), change: mix(CHANGEOVER.standard, CHANGEOVER.aggressive), slow: mix(SLOW_SCALE.standard, SLOW_SCALE.aggressive) };
    }
    // Death Incarnate's one search knob x: below 0 eases the climbing pace with Bring it On!'s settings;
    // 0 to 1 raises effort (breaks, changeovers, walking, slowdown) and climbing pace together up to all-out.
    function setEffort(plan, x) {
      const pf0 = FIXED_PACE.standard[plan.format] || 0.6;
      plan.effortX = x; plan.effort = Math.max(0, x);
      plan.paceF = x < 0 ? pf0 + (3 - pf0) * -x : pf0 - (pf0 - 0.3) * x;
    }
    const changeMin = plan => push(plan).change;
    const fixedPace = plan => plan._fixedPace ?? ((FIXED_PACE[plan.intensity] || {})[plan.format] || 0);
    // Optional expected line at the easy end routes (plan.lineMin). Off by default: the goal buffer covers waits like this.
    const LINE_DEFAULT = { 12: 0, 24: 0 };
    const lineMin = plan => plan.lineMin ?? LINE_DEFAULT[plan.format] ?? 30;
    function queueMin(plan, r) {
      if (!r.sp) return 0;
      const L = lineMin(plan);
      return (r.gu ?? 0) <= -1 ? L : Math.round(L / 6); // the 5.8 and easier end routes draw the crowd; harder ones have short lines
    }
    const locOf = a => a === CHECKIN ? CHECKIN_LOC : AREAS()[a];
    const placeName = a => a === CHECKIN ? CHECKIN_LOC.name : a;
    // Walking minutes between two walls. Speed follows the push level; distance is straight line x1.3 for trail winding until trails are mapped.
    function walkMin(a, b, plan) {
      if (!a || a === b) return 0;
      const A = locOf(a), B = locOf(b);
      const I = push(plan);
      const da = a === CHECKIN ? (B && B.d && B.d[CHECKIN]) : (A && A.d && A.d[b === CHECKIN ? CHECKIN : b]);
      if (da != null) return I.walkPrep + da / I.walk; // trail distance (OpenStreetMap network)
      if (!A || !B || A.lat == null || B.lat == null) return I.walkPrep + 450 / I.walk;
      const R = 6371000, toR = Math.PI / 180;
      const d = 2 * R * Math.asin(Math.sqrt(Math.sin((B.lat - A.lat) * toR / 2) ** 2 + Math.cos(A.lat * toR) * Math.cos(B.lat * toR) * Math.sin((B.lon - A.lon) * toR / 2) ** 2));
      return I.walkPrep + d * 1.3 / I.walk;
    }
    const sunPref = plan => plan.sunPref || (plan.avoidSun === false ? 'none' : 'shade');
    const breakMin = plan => plan.breakMin != null ? plan.breakMin : push(plan).breaks;
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
        const q = queueMin(plan, r);
        let m = changeMin(plan) + q; for (const k of who) m += leadMin(plan, r, climber(plan, k), t + q / 60);
        const row = { kind: 'route', t0: t, t1: t + m / 60, r, who, i, area: r.area, sun: sunAt(plan, r, t), light: light(plan, t), done: it.done, queue: q };
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
      // THE PATH comes first: one loop round the horseshoe (crossing at the top), decided up front; routes are then picked
      // wall by wall along it, moving forward only. Turning back along the path is allowed only when the way ahead has
      // nothing left (at most once on the 12-hour, twice on the 24-hour).
      const firstSide = tourG || (() => {
        const sp = sunPref(plan), h = dh(plan, t).hour;
        if (sp === 'shade') return h < 13 ? 'E' : 'W';   // East side is shady in the morning, West/North have tree cover later
        if (sp === 'sun') return h < 12 ? 'W' : 'E';
        return walkMin(START_AREA, 'Crackhouse Alley', plan) <= walkMin(START_AREA, 'The Far East', plan) ? 'W' : 'E';
      })();
      // path shapes: a loop round the top (W first or E first), or a U through the valley floor (cross at the south end)
      const sideWalls = Object.keys(byArea).filter(a => GRP[a] && POS[a] != null).sort((x, y) => POS[x] - POS[y]);
      const Wsd = sideWalls.filter(a => GRP[a] === 'W'), Esd = sideWalls.filter(a => GRP[a] === 'E');
      const mode = plan.pathMode || (coreOn(plan) ? 'coreW' : firstSide === 'E' ? 'loopE' : 'loopW');
      // coreW: start in the North Forty core, sweep down the West side, walk back up and cross to the East at the top
      const PATH = mode === 'loopW' ? sideWalls.slice() : mode === 'loopE' ? sideWalls.slice().reverse()
        : mode === 'uE' ? [...Esd, ...Wsd] : mode === 'coreW' ? [...Wsd.slice().reverse(), ...Esd]
        : [...Wsd.slice().reverse(), ...Esd.slice().reverse()];
      // valley-floor walls (The Park, Carrion Cube) sit off the loop: allowed any time, with the valley-detour penalty
      const simple = routingOf(plan) !== 'flexible';
      const PIDX = Object.fromEntries(PATH.map((a, i) => [a, i]));
      let pos = items.length && PIDX[area] != null ? PIDX[area] : -1, pdir = 1, flips = 0;
      const maxFlips = plan.format === '24' ? 2 : 1;
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
          zones.sort((a, b) => (PIDX[rep[a]] ?? 99) - (PIDX[rep[b]] ?? 99));
          zones = [...new Set([...sp, ...zones])].slice(0, Math.max(12, sp.length));
        }
        // one crossing: finish every zone on one side, then cross once. Start on the side that's in shade first
        // (east-facing West side is shady in the afternoon, west-facing East side in the morning), or where we already are.
        const zg = z => GRP[rep[z]];
        // zones in the order the path reaches them
        tour.push(...zones.sort((a, b) => (PIDX[rep[a]] ?? 99) - (PIDX[rep[b]] ?? 99)));
        tour.zg = zg;
      }
      const nextZones = () => { const open = tour.filter(z => !WHO.every(k => stats[k].zones.has(z))); return new Set(open.slice(0, 2)); };
      const earlyHard = plan.format === '24' && !!plan.earlyHard; // harder climbs only in the first 12 hours
      const coreFirst = coreOn(plan);
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
            if (isTrad && plan.noTrad) continue;
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
          // a needed end route is worth its line; the line still counts in full on the timeline
          let mins = changeMin(plan) + queueMin(plan, r) * (r.sp && who.some(k => !stats[k].specials.has(r.sp)) ? 0.3 : 1); for (const k of who) mins += leadMin(plan, r, cl[k], tt, pre);
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
        // pass 0: strict (forward along the path, next few walls); 1: relaxed, may turn back if nothing ahead fits (limited);
        // 2: last resort before idling, may turn back regardless
        for (const mode of [0, 1, 2]) { if (best) break; const strict = mode === 0;
        const cs = [];
        for (const [a, rs] of Object.entries(byArea)) {
          if (allowed && !allowed.has(a)) continue;
          const isF = !!allowed;
          const w = walkMin(area, a, plan);
          if (t + (w + 5) / 60 > end) continue;
          // core first: the first wall of a fresh plan is a North Forty wall (only the last-resort pass may start elsewhere)
          if (coreFirst && mode < 2 && !items.some(it => it.rid) && rs[0].side !== 'North') continue;
          const g = GRP[a]; let pen = 0, back = false;
          if (isF) { if (g && curG && g !== curG) pen += CROSS_PEN[0]; }
          else if (g && curG && g !== curG) {
            if (crossings >= maxCross) continue;
            if (crossings >= 1 && end - t < 3) continue; // no second crossing late in the event
            if (tourSide && tourSide === curG) continue;
            pen += CROSS_PEN[Math.min(crossings, CROSS_PEN.length - 1)];
          } else if (tourSide && g && g !== tourSide && !curG) continue;
          if (!isF) {
          // coverage pacing: with tour zones still open, don't linger at a finished wall past its share of the time left
          if (a === area && openTour.length && !(WZ[a] && openTour.some(z => WZ[a].has(z)))) {
            const deadline = end - Math.max(...gls.map(g => bufferOf(plan, g))), perZone = Math.max(0.25, (deadline - t) / (openTour.length + 1));
            if (t - fArr > perZone) continue;
          }
          // coverage plans follow the zone tour in order: no skipping ahead to a later zone's wall
          if (openTour.length && WZ[a] && !WZ[a].has(openTour[0]) && [...WZ[a]].some(z => openTour.includes(z))) continue;
          if (a !== area) pen += TUNE.move;          // every move costs setup time
          if (left.has(a)) pen += TUNE.back;
          // forward only along the path; turning back only when nothing ahead fits (relaxed pass), and only a few times
          if (simple && a !== area && PIDX[a] != null) {
            const ahead = pdir > 0 ? PIDX[a] > pos : PIDX[a] < pos, resume = PIDX[a] === pos; // resume: back to the wall we left for check-in
            if (!ahead && !resume) { if (strict || (mode === 1 && flips >= maxFlips)) continue; pen += TUNE.reverse; back = true; }
          }
          if (!simple) { // flexible routing: the older sweep rules (limited turnarounds, no doubling back past a wall unless turning round)
            const rev = dir && POS[a] != null && lastPos != null && Math.abs(POS[a] - lastPos) > 2 && Math.sign(POS[a] - lastPos) !== dir;
            if (rev) { if (strict && turns >= TUNE.turns) continue; pen += TUNE.reverse; }
            if (strict && left.has(a) && !rev && a !== area) continue;
          }
          }
          if (GRP[a] === null && a !== area) pen += TUNE.valley; // detours onto the valley floor
          let sunF = 1;
          const sp = sunPref(plan);
          // shade: the West and North walls are under tree cover, so the thing to dodge is the open East side in the afternoon sun
          if (sp === 'shade' && rs[0].side === 'East' && hh >= 12 && pre.lt === 'day') { const st = sunAt(plan, rs[0], t + w / 60); sunF = st === 'sun' ? 0.4 : st === 'partial' ? 0.65 : 0.9; }
          else if (sp === 'sun' && pre.lt === 'day') { const st = sunAt(plan, rs[0], t + w / 60); sunF = st === 'sun' ? 1 : st === 'partial' ? 0.85 : st === 'shade' ? 0.65 : 0.8; }
          // what the top teams do: the dense North Forty core first, while fresh; the ends and the East side later
          if (coreFirst && t - plan.start < CORE_H[plan.format] && rs[0].side !== 'North') sunF *= 0.6;
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
          cs.push({ rate, first: opts[0], w, a, back });
        }
        // strict pass: of the walls ahead on the path, only the next PATH_WINDOW that still have something to climb
        let pick2 = cs;
        if (simple && strict && !allowed) {
          const fw = cs.filter(c => c.a !== area && PIDX[c.a] != null && PIDX[c.a] !== pos && (pdir > 0 ? PIDX[c.a] > pos : PIDX[c.a] < pos))
            .sort((x, y) => Math.abs(PIDX[x.a] - pos) - Math.abs(PIDX[y.a] - pos));
          const ok = new Set(fw.slice(0, PATH_WINDOW).map(c => c.a));
          pick2 = cs.filter(c => !fw.includes(c) || ok.has(c.a));
        }
        if (!strict && pick2.some(c => !c.back)) pick2 = pick2.filter(c => !c.back); // only turn back if nothing ahead fits
        for (const c of pick2) if (c.rate > bestRate) { bestRate = c.rate; best = c; }
        }
        if (!best && fi < forced.length) { fi++; continue; } // a chosen wall with nothing (more) to climb: move on
        if (!best) { // nothing climbable fits the settings right now: one idle block, not a string of rests
          const last = items[items.length - 1];
          if (last && last.idle) last.min += 10; else items.push({ type: 'break', min: 10, label: IDLE_LABEL, idle: true });
          t += 10 / 60; continue;
        }
        if (fi < forced.length) { if (best.a === forced[fi + 1]) fi++; else if (area === forced[forced.length - 1] && fi === forced.length - 1 && best.a !== area) fi = forced.length; }
        const pick = best.first;
        if (pick.r.area !== area) fArr = t + best.w / 60;
        { const q = PIDX[pick.r.area]; if (q != null) {
            if (!allowed && pos >= 0 && q !== pos && (pdir > 0 ? q < pos : q > pos)) { flips++; pdir = -pdir; } // turned back along the path
            pos = q; } }
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
    // Routing: 'simple' walks one clean path round the horseshoe; 'flexible' may double back when a route fits better;
    // auto (default) builds both and keeps the better plan.
    const routingOf = plan => plan.routing === 'simple' || plan.routing === 'flexible' ? plan.routing : (plan.routeUsed || 'simple');
    function buildWith(plan, rt) {
      plan.routeUsed = rt;
      // Death Incarnate finds the slowest steady pace that still meets the goals with the buffer, so a lower target means a
      // gentler pace (not a bigger buffer): the plan shows what the goal actually demands
      // the search runs on setEffort's x: 1 = all-out, -1 = far gentler than Bring it On!
      let lo = 1, hi = -1, bestItems = null;
      const fixed = fixedPace(plan);
      const setP = v => { if (fixed) { plan.paceF = fixed; plan.effort = plan.effortX = undefined; } else setEffort(plan, v); };
      // pick the path shape first: the one that reaches the goals with the least walking
      if (rt === 'simple' && !(plan.startWalls || []).length) {
        let bestMode = null, bestScore = Infinity;
        for (const m of coreOn(plan) ? CORE_MODES : PATH_MODES) {
          plan.pathMode = m; plan.bufF = 1;
          for (const x of fixed ? [0] : [-0.3, 0, 0.5, 1]) { setP(x); optimize(plan, 0); if (meets(plan)) break; }
          const tl = timeline(plan, plan.items); let w = 0; for (const r of tl.rows) if (r.kind === 'walk') w += (r.t1 - r.t0) * 60;
          const sc = (meets(plan) ? 0 : 1e5) - (meets(plan) ? plan.paceF * 300 : 0) + w; // meets first, then the gentlest pace, then least walking
          if (sc < bestScore) { bestScore = sc; bestMode = m; }
        }
        plan.pathMode = bestMode;
      } else plan.pathMode = undefined;
      // full contingency buffer if possible, else half, else none
      let ok = false;
      for (const f of [1, 0.5, 0]) { plan.bufF = f; setP(lo); optimize(plan, 0); if (meets(plan)) { ok = true; break; } }
      // Don't Hurt Me plans at its own steady pace and reports what that reaches; it never speeds up to force a goal
      if (fixed) { plan.unreachable = !ok; if (ok) polish(plan); return; }
      if (!ok) { plan.unreachable = true; return; }
      plan.unreachable = false; bestItems = plan.items;
      for (let i = 0; i < 9; i++) {
        const mid = (lo + hi) / 2; setP(mid); optimize(plan, 0);
        if (meets(plan)) { lo = mid; bestItems = plan.items; } else hi = mid;
      }
      setP(lo); plan.items = bestItems;
      polish(plan);
    }
    // What the plan asks of you, climbing and everything else, at the chosen push level
    function pacingTable(plan, tl, climbM) {
      const P = push(plan), F = FORMATS[plan.format], c = climber(plan, 'me'), I = INTENSITY[plan.intensity] || INTENSITY.standard;
      const tbl = el('table', 'sumtable pacing'); const h = el('tr'); const th = el('th', null, 'Pacing'); th.colSpan = 2; h.appendChild(th); tbl.appendChild(h);
      const row = (k, v, title) => { const tr = el('tr'); tr.append(el('th', null, k), el('td', null, v)); if (title) tr.title = title; tbl.appendChild(tr); };
      if (plan.intensity === 'aggressive' && !plan.manual && plan.effortX != null) {
        const x = plan.effortX;
        row('Effort', x <= 0.005 ? (x < -0.005 ? `Bring it On!'s settings, climbing eased off: this target doesn't need more` : `Bring it On!'s settings`) : `${Math.round(x * 100)}% of the way from Bring it On! to all-out`,
          'Death Incarnate finds the least effort that meets your goals with the buffer: breaks, changeovers, walking speed, slowdown and climbing pace all scale together.');
      }
      const night = plan.start + (plan.format === '24' ? 17 : F.dur - 0.5), refR = { gu: c.os - 2, ht: 60, type: 'sport' };
      const fresh = leadMin(plan, refR, c, plan.start, { lt: 'day' }), late = leadMin(plan, refR, c, night, { lt: light(plan, night) });
      row('Climbing', `60 ft cruiser (onsight - 2): ${fresh.toFixed(1)} min fresh, ${late.toFixed(1)} min ${fmtAbs(plan, night, true)}`,
        'One lead: tying in, climbing, clipping and lowering. Fatigue and the dark add to it later in the event.');
      const laps = tl.rows.filter(r => r.kind === 'route').length;
      if (laps) row('Per route', `${(climbM / laps).toFixed(1)} min average for the pair (both leads + changeover)`);
      row('Walking', `${Math.round(P.walk)} m/min (about ${(P.walk * 60 / 1609.34).toFixed(1)} mph) plus ${P.walkPrep.toFixed(1)} min to pack up at each move`);
      const bm = breakMin(plan); row('Breaks', bm ? `${bm} min every hour (about ${(bm * F.dur / 60).toFixed(1)} h in all)` : 'None');
      row('Slowdown', plan.fatigue === false ? 'Off (only 10% slower in the dark)' : `+${((FATIGUE[plan.format] ?? 0.01) * P.slow * 100).toFixed(1)}% lead time per hour into the event, +${((DARK_SLOW - 1) * P.slow * 100).toFixed(1)}% in the dark`);
      return tbl;
    }
    const walkOf = plan => { let w = 0; for (const r of timeline(plan, plan.items).rows) if (r.kind === 'walk') w += (r.t1 - r.t0) * 60; return w; };
    function build(plan) {
      plan.manual = false;
      if (plan.routing === 'simple' || plan.routing === 'flexible') return buildWith(plan, plan.routing);
      const keys = ['items', 'paceF', 'effort', 'effortX', 'bufF', 'pathMode', 'unreachable', 'routeUsed'];
      const snap = () => Object.fromEntries(keys.map(k => [k, plan[k]]));
      buildWith(plan, 'simple'); const a = snap(), wa = a.unreachable ? 0 : walkOf(plan);
      buildWith(plan, 'flexible'); const b = snap(), wb = b.unreachable ? 0 : walkOf(plan);
      // better = reachable, then more contingency buffer, then a clearly gentler pace (5%+), then less walking
      let pickB;
      if (a.unreachable !== b.unreachable) pickB = a.unreachable;
      else if (a.unreachable) pickB = false;
      else if (a.bufF !== b.bufF) pickB = b.bufF > a.bufF;
      else if (b.paceF > a.paceF * 1.05) pickB = true;
      else if (a.paceF > b.paceF * 1.05) pickB = false;
      else pickB = wb < wa;
      Object.assign(plan, pickB ? b : a);
    }

    // ---------- Go Time: live metrics against the active plan ----------
    function liveStats(plan, now) {
      const F = FORMATS[plan.format], start = plan.start, end = start + F.dur;
      const tl = timeline(plan, plan.items), R = tl.rows.filter(r => r.kind === 'route');
      const [y, m, d] = plan.date.split('-').map(Number), base = new Date(y, m - 1, d);
      const absOf = iso => { const ct = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago' })); return (ct - base) / 3600000; };
      const done = R.filter(r => r.done).map(r => ({ row: r, at: Math.max(start, Math.min(end, absOf(r.done))) })).sort((a, b) => a.at - b.at);
      const st = blankStats(plan); for (const x of done) applyRoute(plan, st, x.row.r, x.row.who, x.at);
      const k = done.length, el_ = Math.max(0, Math.min(now, end) - start);
      // schedule: ahead by what the last check-off banked, but behind once the next climb is overdue
      let delta = null;
      if (now >= start) {
        const d2 = k < R.length ? R[k].t1 - Math.min(now, end) : Infinity;
        const d1 = k ? R[k - 1].t1 - done[k - 1].at : 0;
        delta = k >= R.length ? d1 : Math.min(d1, d2);
      }
      const lastHr = done.filter(x => x.at > now - 1).length;
      const plannedByNow = R.filter(r => r.t1 <= now + 1e-6).length;
      const next = R.find(r => !r.done) || null;
      const nextCk = tl.rows.find(r => r.kind === 'checkin' && r.t1 > now) || null;
      return { F, start, end, now, el: el_, left: Math.max(0, end - Math.max(now, start)), R, done, k, st, delta, lastHr, plannedByNow, next, nextCk, lastAt: k ? done[k - 1].at : null };
    }
    let goTimer = 0;
    function renderGo(box) {
      box.textContent = '';
      clearInterval(goTimer); goTimer = setInterval(() => { if (ui.tab === 'go' && document.visibilityState === 'visible') renderGo(box); }, 30000);
      const plan = active();
      box.appendChild(el('h2', null, 'Go Time!'));
      if (!plan || !plan.items.length) { box.appendChild(el('p', 'hint', 'Build a plan in the Planning tab first. This page then tracks how you\'re doing against it as you tick climbs off.')); return; }
      const now = nowAbs(plan), L = liveStats(plan, now), hm = h => { const t = Math.round(Math.abs(h) * 60); return (t >= 60 ? Math.floor(t / 60) + ' h ' : '') + (t % 60) + ' min'; };
      const statusTxt = now < L.start ? `${plan.name} starts in ${hm(L.start - now)} (${fmtAbs(plan, L.start, true)}).`
        : now >= L.end ? `${plan.name} is over. Final numbers below.`
        : `${plan.name}: hour ${Math.floor(now - L.start) + 1} of ${L.F.dur}, ${hm(L.end - now)} left.`;
      box.appendChild(el('p', 'go-status', statusTxt));
      // schedule tile
      const mins = L.delta == null ? null : Math.round(L.delta * 60);
      const sch = el('div', 'go-sched ' + (mins == null || mins === 0 ? 'even' : mins > 0 ? 'ahead' : 'behind'));
      sch.append(el('span', 'go-big', mins == null ? '–' : (mins > 0 ? '+' : mins < 0 ? '−' : '') + Math.abs(mins)),
        el('span', 'go-lbl', mins == null ? `ahead or behind schedule, in minutes. Starts counting at the gun (${fmtAbs(plan, L.start, true)}).` : mins > 0 ? 'minutes ahead of schedule' : mins < 0 ? 'minutes behind schedule' : 'right on schedule'));
      const rate = L.el >= 1 / 6 ? L.k / L.el : null, plannedRate = L.R.length / L.F.dur;
      const proj = rate != null ? Math.round(L.k + rate * L.left) : null;
      const sgn = (v, unit) => `<b class="${v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero'}">${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}</b> ${unit}`;
      if (now >= L.start) {
        const dr = L.k - L.plannedByNow, lines = el('div', 'go-lines');
        lines.innerHTML = `<span>${sgn(dr, Math.abs(dr) === 1 ? 'route' : 'routes')} vs plan (${L.k} done, ${L.plannedByNow} planned by now)</span>` +
          (rate != null ? `<span>${sgn(+(rate - plannedRate).toFixed(1), 'routes/hour')} vs plan (${rate.toFixed(1)} vs ${plannedRate.toFixed(1)})</span>` : '') +
          (proj != null ? `<span>${sgn(proj - L.R.length, 'routes')} at the finish at this rate (${proj} vs ${L.R.length})</span>` : '');
        sch.appendChild(lines);
      }
      box.appendChild(sch);
      const tiles = [
        ['Routes done', `${L.k}`, `of ${L.R.length} planned · ${L.plannedByNow} planned by now`, now >= L.start ? (L.k >= L.plannedByNow ? 'pos' : 'neg') : ''],
        ['Routes per hour', rate != null ? rate.toFixed(1) : '–', `since the start · plan ${plannedRate.toFixed(1)}`, rate != null ? (rate >= plannedRate - 0.05 ? 'pos' : 'neg') : ''],
        ['Last hour', `${L.lastHr}`, 'routes in the last 60 min'],
        ['Projected', proj != null ? `${proj}` : '–', `routes by the end at this rate · plan ${L.R.length}`, proj != null ? (proj >= L.R.length ? 'pos' : 'neg') : ''],
        ['Since last climb', L.lastAt != null && now >= L.start ? hm(Math.min(now, L.end) - L.lastAt) : '–', L.lastAt != null ? 'ticked at ' + fmtAbs(plan, L.lastAt, true) : 'nothing ticked yet'],
        ['Elapsed', now > L.start ? hm(Math.min(now, L.end) - L.start) : '0 min', `${hm(L.left)} left`],
      ];
      const grid = el('div', 'go-grid');
      for (const [t, v, sub, cls] of tiles) { const c = el('div', 'go-tile'); c.append(el('span', 'go-t', t), el('span', 'go-v' + (cls ? ' ' + cls : ''), v), el('span', 'go-sub', sub)); grid.appendChild(c); }
      box.appendChild(grid);
      // next up
      if (L.next && now < L.end) {
        const n = L.next, late = Math.round((now - n.t0) * 60);
        const nx = el('div', 'go-next'); nx.append(el('span', 'go-t', 'Next up'),
          el('span', 'go-v', `${n.r.g} ${n.r.name}`),
          el('span', 'go-sub', `${n.r.area} · planned ${fmtAbs(plan, n.t0, true)}` + (late > 0 && now >= L.start ? ` (${late} min ago)` : '')));
        box.appendChild(nx);
      }
      if (L.nextCk) box.appendChild(el('p', 'go-ck', `Next check-in: ${L.nextCk.label.replace(/^Check-in,? ?/, '').replace(/[()]/g, '') || 'window'} · planned ${fmtAbs(plan, L.nextCk.t0, true)}` + (now >= L.start ? `, in ${hm(L.nextCk.t0 - now)}` : '')));
      // per climber, against the goals
      const gs = goalsOf(plan), tb = el('table', 'sumtable go-table');
      const hd = el('tr'); hd.append(el('th'), ...WHO.map(k => el('th', null, climber(plan, k).name))); tb.appendChild(hd);
      const hrNow = Math.floor(Math.min(now, L.end) - L.start);
      const rowsT = [
        ['Laps', k => L.st[k].laps, gs.includes('laps') ? targetOf(plan, 'laps') : null],
        ['Points', k => L.st[k].pts + (L.st[k].east ? 300 : 0), gs.includes('score') ? targetOf(plan, 'score') : null],
        ['Feet', k => L.st[k].ft, gs.includes('height') ? targetOf(plan, 'height') : null],
        ['Trad laps', k => L.st[k].trad, gs.includes('trad') ? targetOf(plan, 'trad') : null],
        ['Zones', k => L.st[k].zones.size, gs.some(g => g === 'full' || g === 'golden' || g === 'qualify') ? L.F.zones : null],
        ['Per hour', k => L.el >= 1 / 6 ? (L.st[k].laps / L.el).toFixed(1) : '–', null],
      ];
      for (const [lab, f, T] of rowsT) {
        const tr = el('tr'); tr.appendChild(el('th', null, lab + (T ? ` / ${T.toLocaleString()}` : '')));
        for (const k of WHO) { const v = f(k), td = el('td', null, typeof v === 'number' ? v.toLocaleString() : v);
          if (T && typeof v === 'number') { const bar = el('span', 'go-bar'); const fill = el('span'); fill.style.width = Math.min(100, v / T * 100) + '%'; if (v >= T) td.classList.add('met'); bar.appendChild(fill); td.appendChild(bar); }
          tr.appendChild(td); }
        tb.appendChild(tr);
      }
      if (L.F.hourBonus) { const tr = el('tr'); tr.appendChild(el('th', null, 'One each hour'));
        for (const k of WHO) { const s = L.st[k], miss = Array.from({ length: Math.max(0, hrNow) }, (_, h) => h).filter(h => !s.hours.has(h)).length;
          tr.appendChild(el('td', miss ? 'miss' : null, now < L.start ? '–' : miss ? `${miss} hour${miss > 1 ? 's' : ''} missed` : `on track (+${L.F.hourBonus})`)); }
        tb.appendChild(tr); }
      box.appendChild(tb);
      for (const g of gs.filter(g => !UNIT[g])) {
        const a = WHO.map(k => achievements(plan, L.st[k])), met = a.every(x => g === 'full' ? x.full : g === 'golden' ? x.golden : x.qual);
        box.appendChild(el('p', 'go-ach' + (met ? ' met' : ''), `${GOALS[g].replace(/ \(.*\)/, '')}: ${met ? 'done for both of you' : 'not yet'}` + (!met && g !== 'qualify' ? ` · end routes ${WHO.map(k => L.st[k].specials.size).join(' / ')} of 2` : '')));
      }
      box.appendChild(el('p', 'hint small', 'Tick climbs off in the Planning tab as you finish them. Ahead or behind compares your ticks with the plan\'s times; it updates every 30 seconds.'));
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
      const bScan = el('button', 'btn', 'Scan a plan'); bScan.type = 'button'; bScan.onclick = scanPlan; top.appendChild(bScan);
      if (plan && plan.items.length) { const bSh = el('button', 'btn', 'Share'); bSh.type = 'button'; bSh.onclick = () => sharePlan(plan); top.appendChild(bSh); }
      if (plan) { const bDel = el('button', 'btn ghost', 'Delete'); bDel.type = 'button'; bDel.onclick = () => { state.plans = state.plans.filter(p => p.id !== plan.id); state.active = state.plans[0]?.id || null; save(); render(); ctx.onPlanChange(); }; top.appendChild(bDel); }
      if (!state.plans.length) { body.appendChild(el('h2', null, 'Plan')); body.appendChild(el('p', 'hint', 'Set your goals and the planner recommends a route-by-route plan for both of you. You can then edit it, check routes off on the day and see whether you are ahead or behind.')); const b = el('button', 'btn primary', 'Start a plan'); b.type = 'button'; b.onclick = () => { newPlan('24'); render(); }; const bs = el('button', 'btn', 'Scan a shared plan'); bs.type = 'button'; bs.onclick = scanPlan; const br = el('div', 'btnrow'); br.append(b, bs); body.appendChild(br); renderReference(body); return; }
      body.appendChild(top);
      renderSetup(body, plan);
      if (plan.items.length) renderSummary(body, plan);
      if (plan.items.length || plan.manual) renderItems(body, plan);
      renderReference(body);
    }

    // ---------- sharing a plan by QR code ----------
    function popup(title) {
      const d = document.createElement('dialog'); d.className = 'detail popup';
      const head = el('header', 'd-head'), t = el('div', 'd-title'); t.appendChild(el('h2', null, title)); head.appendChild(t);
      const x = el('button', 'd-close', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.onclick = () => d.close(); head.appendChild(x);
      const body = el('div', 'popup-body'); d.append(head, body); document.body.appendChild(d);
      d.addEventListener('close', () => d.remove()); d.showModal(); return { d, body };
    }
    async function sharePlan(plan) {
      const { body } = popup('Share this plan');
      const code = await window.PlanShare.encode(plan, { me: profiles.me, partner: profiles.partner }, profiles.me.name || '');
      const link = window.PlanShare.linkFor(code);
      const q = el('div', 'qr'); try { q.innerHTML = window.PlanShare.qrSvg(link); } catch (e) { q.textContent = 'This plan is too big for one QR code. Use Send link instead.'; }
      body.append(q, el('p', 'hint', `On the other phone: open this app, go to Planning, tap “Scan a plan” and point it here. It brings over the plan, any climbs already ticked, and both climbers' grades.`));
      const row = el('div', 'btnrow');
      const bSend = el('button', 'btn primary', 'Send link'); bSend.type = 'button';
      const st = el('p', 'hint small');
      bSend.onclick = async () => {
        try { if (navigator.share) { await navigator.share({ title: plan.name, text: `Horseshoe Hell plan: ${plan.name}`, url: link }); return; } } catch (e) { if (e.name === 'AbortError') return; }
        try { await navigator.clipboard.writeText(link); st.textContent = 'Link copied.'; } catch (e) { st.textContent = 'Couldn\'t copy the link on this phone.'; }
      };
      row.appendChild(bSend); body.append(row, st,
        el('p', 'hint small', 'On iPhone, a link opens in Safari, not the home-screen app. If they use the home-screen app, have them scan from inside it, or copy the link and paste it under “Scan a plan”.'));
    }
    function scanPlan() {
      const { d, body } = popup('Scan a plan');
      const v = el('video', 'scan-video'); const st = el('p', 'hint'); st.textContent = 'Starting the camera…';
      const ta = el('textarea', 'paste'); ta.rows = 2; ta.placeholder = 'Or paste a shared link here';
      const go = el('button', 'btn', 'Open pasted link'); go.type = 'button'; go.onclick = () => { d.close(); importShared(ta.value); };
      body.append(v, st, ta, go);
      window.PlanShare.scan(d, v, st).then(txt => { if (txt) { d.close(); importShared(txt); } });
    }
    async function importShared(text) {
      let got; try { got = await window.PlanShare.decode(text); } catch (e) { const { body } = popup('Couldn\'t open that'); body.appendChild(el('p', null, e.message && !/^(no code|not a plan)$/.test(e.message) ? e.message : 'That isn\'t a plan code from this app.')); return; }
      const { plan: inc, profiles: pr, from } = got;
      const { d, body } = popup('Shared plan');
      const nm = k => (pr && pr[k] && pr[k].name) || (k === 'me' ? 'Climber 1' : 'Climber 2');
      const exists = state.plans.some(p => p.id === inc.id);
      body.appendChild(el('p', null, `“${inc.name}”${from ? ' from ' + from : ''}: ${FORMATS[inc.format] ? FORMATS[inc.format].label : ''}, ${inc.items.filter(x => x.rid).length} routes${inc.items.some(x => x.done) ? ', ' + inc.items.filter(x => x.done).length + ' ticked' : ''}.` + (exists ? ' This replaces your copy of it.' : '')));
      const cbL = el('label', 'check'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!pr && !(profiles.me.onsight && profiles.partner.onsight);
      cbL.append(cb, el('span', null, 'Also fill in Climber Setup with both climbers\' grades'));
      if (pr) body.appendChild(cbL);
      body.appendChild(el('p', 'plabel', 'Which one are you?'));
      const row = el('div', 'btnrow');
      for (const k of WHO) {
        const b = el('button', 'btn primary', nm(k)); b.type = 'button';
        b.onclick = () => {
          const swap = k === 'partner', sw = w => w === 'me' ? 'partner' : 'me';
          const plan = JSON.parse(JSON.stringify(inc));
          if (swap) { for (const it of plan.items) if (it.who) it.who = it.who.map(sw); if (plan.divs) plan.divs = { me: plan.divs.partner, partner: plan.divs.me }; }
          fixStart(plan);
          const i = state.plans.findIndex(p => p.id === plan.id); if (i >= 0) state.plans[i] = plan; else state.plans.push(plan);
          state.active = plan.id; save();
          if (pr && cb.checked) { const a = swap ? pr.partner : pr.me, bb = swap ? pr.me : pr.partner; if (a) Object.assign(profiles.me, a); if (bb) Object.assign(profiles.partner, bb); ctx.onProfiles && ctx.onProfiles(); }
          d.close(); ctx.showTab('plan'); render(); ctx.onPlanChange();
        };
        row.appendChild(b);
      }
      body.appendChild(row);
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
        dv.appendChild(field(`${p.name || (k === 'me' ? 'You' : 'Partner')} division`, s, p.project ? `Default from project grade ${p.project}.` : 'Set a project grade in Climber Setup to default this.'));
      }
      d.appendChild(dv);
      // grade range and warm-up
      const gradeList = [...new Set(comp().map(r => gradeLabel(r.gu, r.g)))].filter(L => L !== '?' && L !== '5th').sort((a, b) => GU2(a) - GU2(b));
      const gSel = (val, none, onPick, aria) => { const s = el('select'); s.setAttribute('aria-label', aria); s.add(new Option(none, '')); for (const L of gradeList) s.add(new Option(L, L)); s.value = val || ''; s.onchange = () => { onPick(s.value || undefined); save(); render(); }; return s; };
      const rg = el('div', 'target-row');
      rg.append(gSel(plan.gmin, 'Lowest: any', v => { plan.gmin = v; }, 'Lowest sport grade'), el('span', null, 'to'), gSel(plan.gmax, 'Highest: any', v => { plan.gmax = v; }, 'Highest sport grade'));
      d.appendChild(field('Sport grade range', rg));
      const tk = el('div', 'target-row');
      const nt = el('label', 'checkline'); const ntc = el('input'); ntc.type = 'checkbox'; ntc.checked = !!plan.noTrad;
      ntc.onchange = () => { plan.noTrad = ntc.checked || undefined; save(); render(); };
      nt.append(ntc, el('span', null, 'No trad'));
      tk.append(nt);
      if (!plan.noTrad) tk.append(gSel(plan.tmin, 'Lowest: any', v => { plan.tmin = v; }, 'Lowest trad grade'), el('span', null, 'to'), gSel(plan.tradMax, 'Highest: any', v => { plan.tradMax = v; }, 'Highest trad grade'));
      const tradGoal = goalsOf(plan).filter(g => g === 'trad' || g === 'golden');
      d.appendChild(field('Trad grade range', tk, plan.noTrad ? (tradGoal.length ? `No trad is on, but ${tradGoal.map(g => GOALS[g].replace(/ \(.*\)/, '')).join(' and ')} needs trad laps, so that goal can't be met.` : 'Trad routes are left out of the plan. Mixed routes still count as sport.') : 'Only routes in these ranges get planned; division and push level can still cap the top.'));
      const dk = el('div', 'target-row'); dk.append(gSel(plan.darkMax, 'No limit', v => { plan.darkMax = v; }, 'Hardest grade after dark'));
      const dl = Sun.daylight(plan.date);
      d.appendChild(field('Hardest grade after dark', dk, plan.darkMax ? `From dusk (about ${Sun.fmt(dl.set)}) until it's light again (about ${Sun.fmt(dl.rise)}), nothing harder than ${plan.darkMax}; harder routes get pulled into daylight.` : 'Optional. Caps the grade for climbing in the dark.'));
      const wu = el('div', 'target-row'); const wn = el('input'); wn.type = 'number'; wn.min = 1; wn.max = 20; wn.inputMode = 'numeric'; wn.value = plan.warmN ?? 3; wn.setAttribute('aria-label', 'Number of warm-up routes');
      wn.onchange = () => { plan.warmN = Math.max(1, Math.min(20, Math.round(+wn.value || 3))); save(); render(); };
      const wsel = gSel(plan.warm, 'No warm-up', v => { plan.warm = v; }, 'Warm-up grade'); wsel.style.flex = '1 1 100%';
      wu.classList.add('wrap'); wu.append(wsel, el('span', null, 'or easier for the first'), wn, el('span', null, 'routes'));
      d.appendChild(field('Warm-up', wu, plan.warm ? `Each of you starts with ${plan.warmN ?? 3} routes at ${plan.warm} or easier.` : 'Pick a grade to start the plan with easier routes.'));
      d.appendChild(field('How hard to push', chipRow(Object.entries(INTENSITY).map(([k, v]) => [k, v.label]), plan.intensity, v => upd(() => { plan.intensity = v; plan.breakMin = undefined; plan.effort = plan.effortX = undefined; })()),
        { conservative: 'An easy, steady day: slower leads and changeovers, an easy walk, 10-minute breaks, at or below onsight with one harder lap per hour. Plans at that pace and tells you what it reaches; expect to just qualify for next year.', standard: 'A strong, steady push like the top 2026 Intermediates: up to one grade over onsight early, easing off overnight, two harder laps per hour, quick changeovers and a fast walk. Plans at that pace and tells you what it reaches.', aggressive: 'Going for the win: plans the least effort your goals need, from Bring it On!\'s settings up to all-out (no breaks, the fastest changeovers, a jog between walls, faster leads). The Pacing table shows what your target takes. Fatigue and the night still slow you. Up to two grades over onsight early (capped at project grade); three harder laps per hour.' }[plan.intensity]));
      const I = INTENSITY[plan.intensity] || INTENSITY.standard;
      const bi = el('input'); bi.type = 'number'; bi.inputMode = 'numeric'; bi.min = 0; bi.max = 30; bi.value = breakMin(plan);
      bi.onchange = () => { const v = Math.max(0, Math.min(30, Math.round(+bi.value || 0))); plan.breakMin = plan.intensity === 'aggressive' ? (bi.value === '' ? undefined : v) : v === I.breaks ? undefined : v; save(); render(); };
      const brow = el('div', 'target-row'); brow.append(bi, el('span', null, 'minutes per hour'));
      d.appendChild(field('Breaks', brow, `${plan.intensity === 'aggressive' ? 'Death Incarnate scales from 5 to 0 min per hour with the target unless you set it here.' : `Suggested for ${I.label} ${I.breaks} min per hour.`} Taken as one break each hour.${plan.intensity === 'aggressive' ? ' Clear the box to let it scale again.' : ''} Walking between walls is ${plan.intensity === 'aggressive' ? 'from a fast walk up to a steady jog, with the target' : I.walkName}.`));
      const sp0 = sunPref(plan);
      const rt0 = plan.routing === 'simple' || plan.routing === 'flexible' ? plan.routing : 'auto';
      d.appendChild(field('Routing', chipRow([['auto', 'Best of both'], ['simple', 'Simple path'], ['flexible', 'Flexible']], rt0,
        v => upd(() => { plan.routing = v === 'auto' ? undefined : v; })()),
        { auto: 'Builds a simple path and a flexible plan and keeps whichever meets the goals with more buffer, an easier pace, or less walking.' + ((plan.items || []).length && !plan.manual && plan.routeUsed ? ` This plan uses ${plan.routeUsed === 'flexible' ? 'flexible routing' : 'the simple path'}.` : ''),
          simple: 'One clean pass round the horseshoe with no doubling back. Least walking, but a route you need may not come up at the right time.',
          flexible: 'May turn back for a route that fits better (harder routes in daylight, warm-ups, grade limits). A little more walking, often an easier pace.' }[rt0]));
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
      d.appendChild(field('Options', chipRow([['together', 'Same routes for both'], ['reach', 'Skip routes too reachy'], ['coreFirst', 'Start in the North Forty core'], ['fatigue', 'Slow down at night']], { together: plan.together !== false, reach: plan.reach !== false, coreFirst: plan.coreFirst !== false, fatigue: plan.fatigue !== false },
        v => upd(() => { plan[v] = plan[v] === false; })(), false)));
      if (plan.fatigue !== false) d.appendChild(el('p', 'hint small', (k => `At ${(INTENSITY[plan.intensity] || INTENSITY.standard).label}, leads take about ${((FATIGUE[plan.format] ?? 0.01) * k * 100).toFixed(1)}% longer for each hour into the event and ${Math.round((DARK_SLOW - 1) * k * 100)}% longer in the dark. Bring it On! matches the timed logs of 26 top 2025–2026 climbers; Death Incarnate slows between that and three-quarters as much (it scales with the target), Don't Hurt Me twice as much.`)(push(plan).slow)));
      { const li = el('input'); li.type = 'number'; li.inputMode = 'numeric'; li.min = 0; li.max = 180; li.value = lineMin(plan);
        li.onchange = () => { const v = Math.max(0, Math.min(180, Math.round(+li.value || 0))); plan.lineMin = v === LINE_DEFAULT[plan.format] ? undefined : v; save(); render(); };
        const lr = el('div', 'target-row'); lr.append(li, el('span', null, 'minutes'));
        d.appendChild(field('Line at the 5.8 end routes', lr, 'Optional. Adds a wait at Hickadelic Jazzgrass and the Montezuma routes (harder end routes get a sixth of it). Leave at 0 to rely on the goal buffer instead.')); }
      if (plan.format === '24') {
        const lab2 = el('label', 'checkline'); const cb2 = el('input'); cb2.type = 'checkbox'; cb2.checked = !!plan.earlyHard;
        cb2.onchange = () => { plan.earlyHard = cb2.checked; save(); render(); };
        lab2.append(cb2, el('span', null, 'Harder climbs in the first 12 hours only'));
        d.appendChild(field('First half', lab2, `Routes at or above onsight only before ${Sun.fmt((plan.start + 12) % 24)}; the second half sticks to routes below onsight.`));
      }
      const missing = WHO.filter(k => !(profiles[k] || {}).onsight);
      if (missing.length) d.appendChild(el('p', 'warn', 'Add onsight and project grades in Climber Setup for ' + missing.map(k => k === 'me' ? 'you' : 'your partner').join(' and ') + '. Until then the planner assumes a 5.9 onsight.'));
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
      sec.appendChild(pacingTable(plan, tl, climbM));
      if (plan.unreachable && fixedPace(plan)) {
        // say what Don't Hurt Me actually gets you, rather than speeding the plan up to fake it
        const st = WHO.map(k => tl.stats[k]), a = st.map(x => achievements(plan, x)), lo = f => Math.min(...st.map(f));
        const bits = [`${lo(x => x.laps)} laps`, `${lo((x, i) => x.pts).toLocaleString()} points`];
        if (lo(x => x.trad)) bits.push(`${lo(x => x.trad)} trad`);
        const got = a.every(x => x.full) ? 'Full Horseshoe' : a.every(x => x.qual) ? 'qualifies for next year' : 'not enough to qualify';
        const IL = (INTENSITY[plan.intensity] || INTENSITY.standard).label, nextUp = plan.intensity === 'conservative' ? 'Bring it On! or harder' : 'I am Death Incarnate!!';
        sec.appendChild(el('p', 'warn', `At ${IL}'s steady pace this plan reaches about ${bits.join(', ')} each by the end (${got}). That's short of ${goalText(plan)}. Reaching it takes ${nextUp}${/!$/.test(nextUp) ? '' : '.'}${got === 'not enough to qualify' && !goalsOf(plan).includes('qualify') ? ' At this push level, "Qualify for next year" is the realistic goal.' : ''}`));
      } else if (plan.unreachable) sec.appendChild(el('p', 'warn', `This plan can't reach ${goalText(plan)} for both climbers even at a very fast pace. Try a lower target, a harder push setting, or a higher division.`));
      else if (fixedPace(plan) && !plan.manual) sec.appendChild(el('p', 'hint small', `Planned at ${(INTENSITY[plan.intensity] || INTENSITY.standard).label}'s own steady pace, not sped up to fit the goals.`));
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
      let lineDrawn = doneAt == null, climbN = 0;
      for (const row of tl.rows) {
        if (!lineDrawn && row.t0 >= doneAt - 1e-6 && !(row.kind === 'route' && Math.abs(row.t1 - doneAt) < 1e-6)) {
          lineDrawn = true; const end = plan.start + FORMATS[plan.format].dur;
          list.appendChild(el('li', 'p-goalline', `Goals met at ${fmtAbs(plan, doneAt, true)} · ${(end - doneAt).toFixed(1)} h buffer. Everything below is optional.`));
        }
        if (row.kind === 'walk') { list.appendChild(el('li', 'p-walk light-' + row.light, `${push(plan).walk >= 120 ? 'Jog' : 'Walk'} ${Math.max(1, Math.round((row.t1 - row.t0) * 60))} min to ${placeName(row.to)}`)); continue; }
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
        main.append(el('span', 'p-num', '#' + (++climbN)), el('span', 'p-time', Sun.fmt(dh(plan, row.t0).hour)), el('span', 'grade ' + (ctx.feelOf(r) ? 'feel-' + ctx.feelOf(r) : ''), r.g), el('span', 'p-name', r.name));
        const tags = el('span', 'p-tags');
        tags.append(el('span', 'pts', r.pts));
        tags.appendChild(el('span', 'who', whoLabel(row.who)));
        if (row.sun === 'sun' && row.light === 'day') tags.appendChild(el('span', 'tag sun', 'Sun'));
        if (row.light !== 'day') tags.appendChild(el('span', 'tag night', row.light === 'night' ? 'Dark' : dh(plan, row.t0).hour < 12 ? 'Dawn' : 'Dusk'));
        if (r.sp) tags.appendChild(el('span', 'tag special', (r.sp === 'E' ? 'East' : 'West') + ' end'));
        if (row.queue) tags.appendChild(el('span', 'tag queue', `Line ~${row.queue} min`));
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
      const cands = comp().filter(r => (!wall || r.area === wall) && !(plan.noTrad && r.type === 'trad')).map(r => {
        const who = WHO.filter(k => !tl.stats[k].done.has(r.id) && !inPlan[k].has(r.id) && (r.gu ?? -6) <= DIVS[cl[k].div].max);
        const okNow = who.filter(k => (r.gu ?? -6) <= ceilingAt(plan, cl[k], rel) + 0.01);
        const w = walkMin(tl.area, r.area, plan);
        let mins = w + changeMin(plan) + queueMin(plan, r); for (const k of (okNow.length ? okNow : who)) mins += leadMin(plan, r, cl[k], tl.t);
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

    return { renderGo, importShared, _fixed: FIXED_PACE, _live: liveStats, _build: build, _meets: meets, _opt: optimize, _tl: (p) => timeline(p, p.items), _goalTimes: (p) => goalTimes(p), _polish: polish, _keeps: keepsRules, _cross: countCrossings, _tune: o => Object.assign(TUNE, o), setWalkWeight: v => { WALKW = v; }, render, mapData, active, span() { const p = active(); return p && p.items.length ? { date: p.date, start: p.start, end: p.start + FORMATS[p.format].dur, now: clockAbs(p) } : null; }, state: () => state, exportState: () => state, importState(s) { if (s && Array.isArray(s.plans)) { for (const p of s.plans) if (!state.plans.some(x => x.id === p.id)) state.plans.push(fixStart(p)); save(); } } };
  };
})();
