/* Horseshoe Hell field guide — offline route browser, sun/shade clock, map, notes. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };

  const GRADES = ['5.2', '5.4', '5.5', '5.6', '5.7', '5.8', '5.9', '5.10a', '5.10b', '5.10c', '5.10d', '5.11a', '5.11b', '5.11c', '5.11d', '5.12a', '5.12b', '5.12c', '5.12d', '5.13a', '5.13b', '5.13c', '5.14a'];
  const GU = g => { const m = /^5\.(\d+)([abcd])?/.exec(g); const n = +m[1]; return n >= 10 ? (n - 10) * 4 + ('abcd'.indexOf(m[2] || 'a')) : n - 10; };
  const STATUS = [['want', 'Want to try'], ['tried', 'Tried'], ['sent', 'Sent'], ['skip', 'Skip']];
  const FEEL = [['soft', 'Soft'], ['on', 'On grade'], ['stiff', 'Stiff']];

  const defaults = { q: '', gmin: '5.2', gmax: '5.14a', side: [], type: [], feel: [], sun: [], list: [], fit: [], sort: 'walk', date: '', hour: 13, theme: 'auto', tab: 'routes', layer: 'topo', map: null, mapMode: 'all' };
  const ui = Object.assign({}, defaults, store.get('hhh.ui', {}));
  if (!Array.isArray(ui.fit)) ui.fit = [];
  let notes = store.get('hhh.notes', {});
  const blankProfile = () => ({ name: '', age: '', onsight: '', project: '', ht: '', ape: 0 });
  let profiles = store.get('hhh.profiles', null);
  if (!profiles) { profiles = { me: blankProfile(), partner: blankProfile() }; profiles.me.name = store.get('hhh.climber', ''); }
  const saveProfiles = () => store.set('hhh.profiles', profiles);
  const myName = () => profiles.me.name || '';
  let ROUTES = [], AREAS = {}, TRAILS = null;
  const save = () => store.set('hhh.ui', ui);

  // ---------- date + clock ----------
  function defaultDate() {
    // Friday of the next comp weekend (last full weekend of September)
    const fri = y => { for (let d = 29; d >= 1; d--) { const dt = new Date(Date.UTC(y, 8, d)); if (dt.getUTCDay() === 6) return new Date(Date.UTC(y, 8, d - 1)); } };
    const now = new Date(); let f = fri(now.getFullYear()); if (now > new Date(f.getTime() + 2 * 86400000)) f = fri(now.getFullYear() + 1);
    return f.toISOString().slice(0, 10);
  }
  if (!ui.date) ui.date = defaultDate();

  function sunFor(r) {
    const a = AREAS[r.area]; if (!a) return 'varies';
    return Sun.state(a.aspect, a.shady, ui.date, ui.hour);
  }
  const SUNLABEL = { sun: 'Sun', partial: 'Partial sun', shade: 'Shade', dark: 'Dark', varies: 'Varies' };

  function drawDial() {
    const c = $('#dialCanvas'), box = $('#dial');
    const dpr = window.devicePixelRatio || 1, w = box.clientWidth, h = box.clientHeight;
    c.width = w * dpr; c.height = h * dpr; c.style.width = w + 'px'; c.style.height = h + 'px';
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    const col = n => css.getPropertyValue(n).trim();
    const pad = 12, W = w - pad * 2, sky = h - 16;
    // sky: altitude of the sun across 24h
    for (let i = 0; i < W; i++) {
      const hr = i / W * 24; const alt = Sun.position(Sun.instant(ui.date, hr)).alt;
      g.fillStyle = alt > 5 ? col('--sky-day') : alt > -0.8 ? col('--sky-low') : alt > -12 ? col('--sky-dusk') : col('--sky-night');
      g.fillRect(pad + i, 0, 1, sky);
    }
    // sun path curve
    g.beginPath(); g.lineWidth = 2; g.strokeStyle = col('--sun');
    for (let i = 0; i <= W; i += 2) {
      const hr = i / W * 24, alt = Sun.position(Sun.instant(ui.date, hr)).alt;
      const y = sky - 4 - Math.max(0, alt) / 70 * (sky - 10);
      if (alt < 0) { g.moveTo(pad + i, sky - 4); continue; }
      g.lineTo(pad + i, y);
    }
    g.stroke();
    // hour ticks
    g.fillStyle = col('--dial-ink'); g.font = '600 10px ' + css.getPropertyValue('--font');
    g.textAlign = 'center';
    for (const t of [0, 6, 12, 18, 24]) {
      const x = pad + t / 24 * W; g.fillRect(x - 0.5, sky, 1, 3);
      if (t > 0 && t < 24) g.fillText(t === 12 ? 'noon' : Sun.fmt(t).replace(':00', ''), x, h - 2);
    }
    // cursor
    const x = pad + ui.hour / 24 * W;
    g.fillStyle = col('--cursor'); g.fillRect(x - 1.5, 0, 3, sky);
    g.beginPath(); g.arc(x, sky / 2, 6, 0, Math.PI * 2); g.fill();
    // drag hint: arrows either side of the cursor
    const ay = sky / 2;
    for (const d of [-1, 1]) { const ax = x + d * 13; g.beginPath(); g.moveTo(ax + d * 6, ay); g.lineTo(ax, ay - 5); g.lineTo(ax, ay + 5); g.closePath(); g.fill(); }
  }

  function updateClock() {
    $('#hour').value = ui.hour; $('#date').value = ui.date;
    $('#clockTime').textContent = Sun.fmt(ui.hour);
    const dl = Sun.daylight(ui.date);
    const p = Sun.position(Sun.instant(ui.date, ui.hour));
    $('#clockSun').textContent = `Sunrise ${Sun.fmt(dl.rise)}, sunset ${Sun.fmt(dl.set)}` + (p.alt < -0.8 ? '. Dark now.' : '');
    drawDial();
  }

  // ---------- filters ----------
  function buildGradeSelects() {
    // the filter panel and the quick bar above the list share ui.gmin / ui.gmax
    for (const [id, key] of [['gmin', 'gmin'], ['gmax', 'gmax'], ['qgmin', 'gmin'], ['qgmax', 'gmax']]) {
      const s = $('#' + id); if (!s) continue; s.textContent = '';
      for (const g of GRADES) s.add(new Option(g, g));
      s.value = ui[key];
      s.onchange = () => { ui[key] = s.value; save(); for (const o of ['gmin', 'qgmin', 'gmax', 'qgmax']) { const e = $('#' + o); if (e) e.value = ui[o.replace('q', '')]; } syncChips(); renderList(); };
    }
    const nb = $('#qnoabove');
    if (nb) nb.onchange = () => { ui.fit = nb.checked ? [...new Set([...ui.fit, 'noabove'])] : ui.fit.filter(x => x !== 'noabove'); save(); syncChips(); renderList(); };
  }
  function syncChips() {
    $$('.chips[data-key]').forEach(box => {
      const k = box.dataset.key; const v = ui[k];
      box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', Array.isArray(v) ? v.includes(b.dataset.v) : v === b.dataset.v));
    });
    if ($('#qnoabove')) $('#qnoabove').checked = ui.fit.includes('noabove');
    for (const o of ['gmin', 'qgmin', 'gmax', 'qgmax']) { const e = $('#' + o); if (e && e.options.length) e.value = ui[o.replace('q', '')]; }
    const n = ['side', 'type', 'feel', 'sun', 'list', 'fit'].reduce((a, k) => a + ui[k].length, 0) + (ui.gmin !== defaults.gmin || ui.gmax !== defaults.gmax ? 1 : 0);
    $('#filterCount').textContent = n ? `(${n})` : '';
  }
  $$('.chips[data-key]').forEach(box => box.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const k = box.dataset.key;
    if (Array.isArray(ui[k])) { const i = ui[k].indexOf(b.dataset.v); i < 0 ? ui[k].push(b.dataset.v) : ui[k].splice(i, 1); }
    else ui[k] = b.dataset.v;
    save(); syncChips();
    if (k === 'theme') applyTheme(); else { renderList(); renderMap(); }
  }));

  // ---------- climber fit ----------
  function fitOf(r, p) {
    if (!p || !p.onsight || r.gu == null) return '';
    const os = GU(p.onsight), pg = p.project ? GU(p.project) : os + 2;
    if (r.gu <= os + 0.01) return 'onsight';
    if (r.gu < pg - 0.4) return 'push';
    if (r.gu <= pg + 0.6) return 'project';
    return 'beyond';
  }
  const FITLABEL = { onsight: 'Onsight range', push: 'Push', project: 'Project', beyond: 'Above project' };
  function reachOf(r, p) {
    if (!r.reach || !p || !p.ht) return '';
    const span = +p.ht + (+p.ape || 0);   // wingspan in inches
    const many = r.reach >= 4;
    // most reach complaints on Mountain Project come from climbers 5'1" to 5'5"
    if (span <= 64 || (many && span <= 66)) return 'high';
    if (span <= 67 || (many && span <= 68.5)) return 'moderate';
    return 'low';
  }
  const fmtHt = i => i ? `${Math.floor(i / 12)}'${i % 12}"` : '';
  function feelOf(r) { const v = r.v || ''; return v.includes('soft') ? 'soft' : v.includes('stiff') ? 'stiff' : v === 'on grade' ? 'on' : ''; }
  function matches(r) {
    if (r.gu != null) { if (r.gu < GU(ui.gmin) - 0.01 || r.gu > GU(ui.gmax) + 0.01) return false; }
    if (ui.side.length && !ui.side.includes(r.side)) return false;
    if (ui.type.length && !ui.type.includes(r.type)) return false;
    if (ui.feel.length && !ui.feel.includes(feelOf(r))) return false;
    if (ui.sun.length) { const s = sunFor(r); const k = s === 'partial' ? 'sun' : s === 'dark' ? 'shade' : s; if (!ui.sun.includes(k)) return false; }
    if (ui.fit.length) {
      const f = fitOf(r, profiles.me);
      const want = ui.fit.filter(x => x !== 'noreach' && x !== 'noabove');
      if (want.length && !want.includes(f)) return false;
      if (ui.fit.includes('noabove') && f === 'beyond') return false;
      if (ui.fit.includes('noreach') && ['high', 'moderate'].includes(reachOf(r, profiles.me))) return false;
    }
    if (ui.list.length) {
      for (const l of ui.list) {
        if (l === 'target' && r.tier !== 'target') return false;
        if (l === 'avoid' && r.tier !== 'avoid for points') return false;
        if (l === 'z26' && !r.z26) return false;
        if (l === 'mine' && !notes[r.id]) return false;
        if (l === 'comp' && !r.n) return false;
      }
    }
    if (ui.q) {
      const q = ui.q.toLowerCase();
      const hay = (r.name + ' ' + (r.zone || '') + ' ' + (r.area || '') + ' ' + (r.n || '') + ' ' + (r.g || '')).toLowerCase();
      if (!q.split(/\s+/).every(t => hay.includes(t))) return false;
    }
    return true;
  }
  const SORTS = {
    walk: (a, b) => (a.walk ?? 1e9) - (b.walk ?? 1e9),
    pts: (a, b) => (b.pts || 0) - (a.pts || 0),
    bar: (a, b) => (b.bar ?? -1e9) - (a.bar ?? -1e9),
    soft: (a, b) => (b.sc ?? -1e9) - (a.sc ?? -1e9),
    grade: (a, b) => (a.gu ?? 99) - (b.gu ?? 99),
    num: (a, b) => (a.n || 1e9) - (b.n || 1e9),
  };

  // ---------- list ----------
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function renderList() {
    const list = ROUTES.filter(matches).sort(SORTS[ui.sort] || SORTS.walk);
    $('#count').textContent = `${list.length} of ${ROUTES.length} routes`;
    const ol = $('#routes'); ol.textContent = '';
    const frag = document.createDocumentFragment();
    // group by wall, walls in walking order round the canyon; the chosen sort applies within each wall
    const wallOf = r => r.area || r.zone || 'Other';
    const wallRank = {}; for (const r of ROUTES) { const w = wallOf(r); if (r.walk != null) wallRank[w] = Math.min(wallRank[w] ?? 1e9, r.walk); }
    const groups = new Map();
    for (const r of list) { const w = wallOf(r); if (!groups.has(w)) groups.set(w, []); groups.get(w).push(r); }
    const ordered = [...groups.keys()].sort((a, b) => (wallRank[a] ?? 1e9) - (wallRank[b] ?? 1e9) || a.localeCompare(b));
    const flat = [];
    for (const w of ordered) flat.push({ head: w, n: groups.get(w).length, side: groups.get(w)[0].side }, ...groups.get(w));
    const fold = new Set(ui.foldWalls || []); let folded = false;
    $('#foldAll').textContent = ordered.length && ordered.every(w => fold.has(w)) ? 'Expand all walls' : 'Collapse all walls';
    $('#foldAll').hidden = !ordered.length;
    for (const r of flat) {
      if (r.head) {
        folded = fold.has(r.head);
        const h = el('li', 'wall-head' + (folded ? ' folded' : '')); h.dataset.wall = r.head; h.tabIndex = 0; h.setAttribute('role', 'button'); h.setAttribute('aria-expanded', !folded);
        h.append(el('span', 'wall-fold', folded ? '▸' : '▾'), el('span', 'wall-name', r.head), el('span', 'wall-meta', `${r.side ? (r.side === 'Valley' ? 'Valley floor' : r.side + ' side') + ', ' : ''}${r.n} route${r.n === 1 ? '' : 's'}`));
        frag.appendChild(h); continue;
      }
      if (folded) continue;
      const li = el('li', 'route'); li.dataset.id = r.id; li.tabIndex = 0; li.setAttribute('role', 'button');
      const g = el('span', 'grade ' + (feelOf(r) ? 'feel-' + feelOf(r) : ''), r.g || '?');
      const mid = el('span', 'mid');
      const nm = el('span', 'name', r.name);
      if (r.tier === 'target') nm.appendChild(el('span', 'flag target', 'Target'));
      if (r.tier === 'avoid for points') nm.appendChild(el('span', 'flag avoid', 'Avoid'));
      const fit = fitOf(r, profiles.me); if (fit && fit !== 'onsight') nm.appendChild(el('span', 'flag fit-' + fit, FITLABEL[fit]));
      const rch = reachOf(r, profiles.me); if (rch === 'high' || rch === 'moderate') nm.appendChild(el('span', 'flag reach-' + rch, 'Reachy'));
      const sub = el('span', 'sub', [r.n ? 'No. ' + r.n : 'Not in comp', r.type, r.ht ? r.ht + ' ft' : ''].filter(Boolean).join(', '));
      mid.append(nm, sub);
      const n = notes[r.id];
      if (n && (n.status || n.text)) mid.appendChild(el('span', 'mynote status-' + (n.status || 'note'), n.status ? STATUS.find(s => s[0] === n.status)[1] : 'Note'));
      const right = el('span', 'right');
      right.appendChild(el('span', 'pts', r.pts ? r.pts : ''));
      const s = sunFor(r); const sd = el('span', 'sun-dot ' + s); sd.title = SUNLABEL[s]; sd.setAttribute('aria-label', SUNLABEL[s]);
      right.appendChild(sd);
      li.append(g, mid, right); frag.appendChild(li);
    }
    ol.appendChild(frag);
    if (!list.length) { const li = el('li', 'empty', 'No routes match. Clear a filter or widen the grade range.'); ol.appendChild(li); }
  }
  // wall headers fold their routes away; the folded set is remembered
  const toggleWall = w => { const f = new Set(ui.foldWalls || []); f.has(w) ? f.delete(w) : f.add(w); ui.foldWalls = [...f]; save(); renderList(); };
  $('#routes').addEventListener('click', e => { const h = e.target.closest('.wall-head'); if (h) return toggleWall(h.dataset.wall); const li = e.target.closest('.route'); if (li) openDetail(li.dataset.id); });
  $('#routes').addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const h = e.target.closest('.wall-head'); if (h) { e.preventDefault(); return toggleWall(h.dataset.wall); } const li = e.target.closest('.route'); if (li && e.key === 'Enter') openDetail(li.dataset.id); });
  $('#foldAll').onclick = () => {
    const walls = [...$('#routes').querySelectorAll('.wall-head')].map(h => h.dataset.wall);
    const all = walls.every(w => (ui.foldWalls || []).includes(w));
    ui.foldWalls = all ? [] : [...new Set([...(ui.foldWalls || []), ...walls])]; save(); renderList();
  };

  // ---------- detail ----------
  function row(dl, k, v) { if (v == null || v === '') return; dl.append(el('dt', null, k), el('dd', null, v)); }
  function openDetail(id) {
    const r = ROUTES.find(x => x.id === id); if (!r) return;
    const d = $('#detail'); d.textContent = '';
    const head = el('header', 'd-head');
    head.append(el('span', 'grade big ' + (feelOf(r) ? 'feel-' + feelOf(r) : ''), r.g || '?'));
    const t = el('div', 'd-title'); t.append(el('h2', null, r.name), el('p', null, [r.n ? 'No. ' + r.n : 'Not on the comp scorecard', r.area || r.zone].filter(Boolean).join(', ')));
    head.appendChild(t);
    const close = el('button', 'd-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close'); close.onclick = () => d.close();
    head.appendChild(close); d.appendChild(head);

    const facts = el('dl', 'facts');
    row(facts, 'Points', r.pts); row(facts, 'Style', r.type); row(facts, 'Height', r.ht ? r.ht + ' ft' : '');
    row(facts, 'MP grade', r.mpg && r.mpg !== r.g ? r.mpg : ''); row(facts, 'MP stars', r.stars != null ? r.stars.toFixed(1) : '');
    row(facts, 'Climbed 2026', r.z26 ? 'Yes' : '');
    d.appendChild(facts);
    const phSlot = el('div'); d.appendChild(phSlot);
    if (window.WallPhotos) WallPhotos.forRoute(r.id).then(w => { if (w) { w.classList.add('d-sec'); phSlot.appendChild(w); } });

    // sun
    const a = AREAS[r.area];
    const sunSec = el('section', 'd-sec'); sunSec.appendChild(el('h3', null, 'Sun and shade'));
    if (a) {
      const w = Sun.windows(a.aspect, ui.date);
      const face = { N: 'north', NE: 'northeast', E: 'east', SE: 'southeast', S: 'south', SW: 'southwest', W: 'west', NW: 'northwest' }[a.aspect];
      sunSec.appendChild(el('p', null, face ? `Wall faces ${face}${a.basis === 'geo' ? ' (estimated from canyon side)' : ''}. Direct sun ${w.length ? w.map(x => Sun.fmt(x[0]) + ' to ' + Sun.fmt(x[1])).join(', ') : 'none'} on ${new Date(ui.date + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}.` : a.note));
      if (a.shady) sunSec.appendChild(el('p', 'hint', 'Trees or terrain keep this area shadier than the wall direction suggests.'));
      if (face && a.note) sunSec.appendChild(el('p', 'hint', a.note));
      sunSec.appendChild(el('p', 'now ' + sunFor(r), `At ${Sun.fmt(ui.hour)}: ${SUNLABEL[sunFor(r)]}`));
    } else sunSec.appendChild(el('p', 'hint', 'No wall direction on file yet.'));
    d.appendChild(sunSec);

    // grade feel
    const g = el('section', 'd-sec'); g.appendChild(el('h3', null, 'How the grade climbs'));
    const lines = [];
    if (r.votes) lines.push(`${r.votes} grade votes on Mountain Project${r.dg != null ? `, averaging ${Math.abs(r.dg) < 0.15 ? 'right at the comp grade' : Math.abs(r.dg).toFixed(1) + (r.dg < 0 ? ' grades easier' : ' grades harder') + ' than the comp grade'}` : ''}.`);
    if (r.ft != null) lines.push(`${Math.round(r.ft * 100)}% of logged leads went first try${r.ftp != null && Math.abs(r.ftp) >= 0.05 ? (r.ftp > 0 ? ', above' : ', below') + ' average for the grade' : ''}.`);
    const m = []; if (r.soft) m.push(`${r.soft} call it soft`); if (r.stiff) m.push(`${r.stiff} call it stiff`); if (r.reach) m.push(`${r.reach} mention reach`); if (r.pol) m.push(`${r.pol} mention polish`);
    if (m.length) lines.push('Comments and tick notes: ' + m.join(', ') + '.');
    if (r.bar) lines.push(r.bar > 0 ? `Pays about ${r.bar} points more than its crowd grade usually earns.` : `Pays about ${-r.bar} points less than its crowd grade usually earns.`);
    if (!lines.length) lines.push('Not enough Mountain Project data to judge.');
    lines.forEach(l => g.appendChild(el('p', null, l)));
    if (r.v && r.v !== 'no data') g.appendChild(el('p', 'verdict feel-' + feelOf(r), 'Verdict: ' + r.v));
    if (r.tnote) g.appendChild(el('p', 'tnote', r.tnote));
    if (planner && r.n) {
      const ap = el('button', 'btn', 'Add to plan'); ap.type = 'button';
      ap.onclick = () => { const p = planner.active(); if (!p) { ap.textContent = 'Start a plan in the Planning tab first'; return; } p.items.push({ rid: r.id, who: ['me', 'partner'] }); store.set('hhh.plans', planner.state()); ap.textContent = 'Added to ' + p.name; ap.disabled = true; renderMap(); };
      g.appendChild(ap);
    }
    if (r.mp) { const aEl = el('a', 'ext', 'Open on Mountain Project'); aEl.href = 'https://www.mountainproject.com/route/' + r.mp; aEl.target = '_blank'; aEl.rel = 'noopener'; g.appendChild(aEl); }
    d.appendChild(g);

    // fit for each climber
    const people = [profiles.me, profiles.partner].filter(p => p.name || p.onsight || p.ht);
    if (people.length) {
      const fs = el('section', 'd-sec'); fs.appendChild(el('h3', null, 'For the two of you'));
      for (const p of people) {
        const f = fitOf(r, p), rc = reachOf(r, p);
        const bits = [];
        if (f) bits.push(FITLABEL[f].toLowerCase());
        if (r.reach) bits.push(rc ? `${rc} reach risk at ${fmtHt(+p.ht)}${p.ape ? ` (${p.ape > 0 ? '+' : ''}${p.ape} in ape)` : ''}` : 'reach mentioned; add height to judge');
        fs.appendChild(el('p', null, `${p.name || 'Unnamed climber'}: ${bits.length ? bits.join(', ') : 'set grades in Climber Setup'}.`));
      }
      d.appendChild(fs);
    }

    // notes
    const n = Object.assign({ status: '', feel: '', text: '' }, notes[r.id]);
    const ns = el('section', 'd-sec'); ns.appendChild(el('h3', null, myName() ? `${myName()}'s notes` : 'Your notes'));
    const mk = (opts, key) => {
      const box = el('div', 'chips single');
      for (const [v, label] of opts) {
        const b = el('button', null, label); b.type = 'button'; b.setAttribute('aria-pressed', n[key] === v);
        b.onclick = () => { n[key] = n[key] === v ? '' : v; box.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b && n[key] === v)); commit(); };
        box.appendChild(b);
      }
      return box;
    };
    ns.append(mk(STATUS, 'status'), el('p', 'sublabel', 'How it felt'), mk(FEEL, 'feel'));
    const ta = el('textarea'); ta.rows = 4; ta.placeholder = 'Beta, gear, where the crux is, how long it took'; ta.value = n.text;
    ta.oninput = () => { n.text = ta.value; clearTimeout(ta._t); ta._t = setTimeout(commit, 400); };
    ns.appendChild(ta);
    function commit() {
      if (!n.status && !n.feel && !n.text.trim()) delete notes[r.id];
      else notes[r.id] = { status: n.status, feel: n.feel, text: n.text, updated: new Date().toISOString(), name: r.name };
      store.set('hhh.notes', notes); renderList();
    }
    d.appendChild(ns);
    d.showModal();
  }
  $('#detail').addEventListener('click', e => { if (e.target.id === 'detail') e.target.close(); });

  // ---------- map ----------
  let map = null;
  function initMap() {
    if (map) return;
    const m = ui.map || { lat: 36.0058, lon: -93.2908, zoom: 15.3 };
    map = TopoMap.create($('#map'), $('#mapTiles'), $('#mapMarks'), { ...m, layer: ui.layer, onMove: s => { ui.map = { lat: s.lat, lon: s.lon, zoom: s.zoom }; save(); $('#map').classList.toggle('labels', s.zoom >= 16.6); } });
    $('#map').classList.toggle('labels', map.state.zoom >= 16.6);
    $('#layer').textContent = ui.layer === 'topo' ? 'Aerial' : 'Topo';
    renderMap();
  }
  // trails from OpenStreetMap: footpaths dashed, roads solid
  function trailLines() {
    if (!TRAILS) return [];
    const foot = l => /footway|path|steps|track/.test(l.t);
    // white casing under every line so trails stand out from the topo contours and the aerial photo
    return [...TRAILS.lines.map(l => ({ pts: l.pts, cls: 'trail trail-case' + (foot(l) ? '' : ' road') })),
      ...TRAILS.lines.map(l => ({ pts: l.pts, cls: 'trail ' + (foot(l) ? 'trail-foot' : 'trail-road') }))];
  }
  function renderMap() {
    if (!map) return;
    $('#mapMode').textContent = ui.mapMode === 'plan' ? 'All' : 'Plan';
    $('#mapLegend').classList.toggle('plan', ui.mapMode === 'plan');
    $('#play').hidden = !(ui.mapMode === 'plan' && planner && planner.span());
    if ($('#play').hidden && playTimer) { clearInterval(playTimer); playTimer = 0; $('#play').textContent = '▶'; }
    const pd = ui.mapMode === 'plan' && planner ? planner.mapData() : null;
    $('#planBanner').hidden = !(ui.mapMode === 'plan');
    if (ui.mapMode === 'plan') {
      $('#planBanner').textContent = pd ? `${pd.plan.name} · ${pd.stops.length} walls · ${pd.stops.reduce((a, s) => a + s.count, 0)} routes` : 'No plan yet. Build one in the Planning tab.';
      const marks = [];
      if (pd) {
        for (const s of pd.stops) {
          if (s.lat == null) continue;
          const b = el('button', 'mark planstop' + (s.done === s.count ? ' complete' : ''));
          b.type = 'button'; b.setAttribute('aria-label', `${s.area}, ${s.count} planned routes, first arrival ${s.label}`);
          b.append(el('span', 'mark-n', s.count), el('span', 'mark-t', s.label), el('span', 'mark-l', s.area.replace(/^The /, '')));
          b.onclick = () => openArea(s.area);
          marks.push({ lat: s.lat, lon: s.lon, el: b });
        }
        if (pd.exp) { const e = el('span', 'expected'); e.title = pd.expLabel; e.appendChild(el('span', 'exp-l', pd.expLabel)); marks.push({ lat: pd.exp.lat, lon: pd.exp.lon, el: e }); }
        map.setLines([...trailLines(), ...pd.segs.map(s => ({ pts: s.pts, cls: 'seg light-' + s.light }))]);
      } else map.setLines(trailLines());
      if (me) marks.push(me);
      map.setMarks(marks); return;
    }
    map.setLines(trailLines());
    const list = ROUTES.filter(matches);
    const marks = [];
    for (const [name, a] of Object.entries(AREAS)) {
      if (a.lat == null) continue;
      const rs = list.filter(r => r.area === name);
      const s = Sun.state(a.aspect, a.shady, ui.date, ui.hour);
      const b = el('button', 'mark ' + s + (rs.length ? '' : ' none'));
      b.type = 'button'; b.setAttribute('aria-label', `${name}, ${rs.length} routes, ${SUNLABEL[s]}`);
      b.append(el('span', 'mark-n', rs.length), el('span', 'mark-l', name.replace(/^The /, '')));
      b.onclick = () => openArea(name);
      marks.push({ lat: a.lat, lon: a.lon, el: b });
    }
    if (me) marks.push(me);
    map.setMarks(marks);
  }
  function openArea(name) {
    const sh = $('#areaSheet'); sh.textContent = ''; sh.hidden = false;
    const a = AREAS[name];
    const h = el('header', 'sheet-head'); h.append(el('h2', null, name));
    const x = el('button', 'd-close', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.onclick = () => { sh.hidden = true; }; h.appendChild(x);
    sh.appendChild(h);
    const w = Sun.windows(a.aspect, ui.date);
    sh.appendChild(el('p', 'hint', (w.length ? 'Direct sun ' + w.map(v => Sun.fmt(v[0]) + ' to ' + Sun.fmt(v[1])).join(', ') + '. ' : '') + (a.note || '')));
    const ol = el('ol', 'routes compact');
    ROUTES.filter(r => r.area === name && matches(r)).sort(SORTS.walk).forEach(r => {
      const li = el('li', 'route'); li.dataset.id = r.id;
      li.append(el('span', 'grade ' + (feelOf(r) ? 'feel-' + feelOf(r) : ''), r.g), el('span', 'mid', r.name), el('span', 'right', r.pts || ''));
      li.onclick = () => openDetail(r.id); ol.appendChild(li);
    });
    if (!ol.children.length) ol.appendChild(el('li', 'empty', 'No routes here match your filters.'));
    sh.appendChild(ol);
    sh.dataset.area = name;
    if (window.WallPhotos) WallPhotos.section(name).then(w => { if (sh.dataset.area === name && !sh.hidden) sh.insertBefore(w, ol); });
  }
  $('#snap').onclick = () => WallPhotos.capture(null);
  $('#mapMode').onclick = () => { ui.mapMode = ui.mapMode === 'plan' ? 'all' : 'plan'; save(); renderMap(); };
  $('#zin').onclick = () => map.zoomAt(map.state.zoom + 1);
  $('#zout').onclick = () => map.zoomAt(map.state.zoom - 1);
  $('#layer').onclick = () => { ui.layer = ui.layer === 'topo' ? 'aerial' : 'topo'; save(); $('#layer').textContent = ui.layer === 'topo' ? 'Aerial' : 'Topo'; map.setLayer(ui.layer); };
  let me = null, watch = null;
  $('#locate').onclick = () => {
    if (!navigator.geolocation) return;
    if (watch != null) { navigator.geolocation.clearWatch(watch); watch = null; me = null; $('#locate').removeAttribute('aria-pressed'); renderMap(); return; }
    $('#locate').setAttribute('aria-pressed', 'true');
    let first = true;
    watch = navigator.geolocation.watchPosition(p => {
      me = { lat: p.coords.latitude, lon: p.coords.longitude, el: el('span', 'me'), t: Date.now() };
      if (first) { map.center(me.lat, me.lon); first = false; }
      renderMap();
    }, () => { $('#locate').removeAttribute('aria-pressed'); watch = null; }, { enableHighAccuracy: true, maximumAge: 10000 });
  };

  // ---------- plan ----------
  let planner = null;
  function renderPlan() { if (planner) planner.render(); }
  function renderReference(b) {
    const dl = Sun.daylight(ui.date);
    b.appendChild(el('h3', null, 'Where the shade is'));
    b.appendChild(el('p', 'hint', `For ${new Date(ui.date + 'T12:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}: sunrise ${Sun.fmt(dl.rise)}, sunset ${Sun.fmt(dl.set)}. Change the date in the bar at the top.`));
    const sides = [['East side (west-facing walls)', 'W'], ['West side (east-facing walls)', 'E'], ['North Forty (south-facing)', 'S'], ['The Arcade and Street Fighter (northeast-facing)', 'NE']];
    const tbl = el('table', 'shade-table'); const tb = el('tbody');
    for (const [label, asp] of sides) {
      const w = Sun.windows(asp, ui.date);
      const tr = el('tr'); tr.append(el('th', null, label), el('td', null, w.length ? 'Sun ' + w.map(v => Sun.fmt(v[0]) + ' to ' + Sun.fmt(v[1])).join(', ') : 'Shaded all day'));
      tb.appendChild(tr);
    }
    tbl.appendChild(tb); b.appendChild(tbl);
    b.appendChild(el('p', null, 'Rule of thumb: East side in the morning, West side after noon, North Forty early, late, and overnight.'));

    b.appendChild(el('h3', null, 'Target list'));
    b.appendChild(el('p', 'hint', 'Routes the Mountain Project data says climb easier than the comp pays for, 5.8 to 5.11a. Tap one for details.'));
    const bands = {};
    ROUTES.filter(r => r.tier === 'target').forEach(r => { const k = r.g.replace(/[+-]$/, '').replace(/^(5\.1[01])[abcd]$/, (m0, p) => p === '5.10' ? (/[ab]$/.test(r.g) ? '5.10a/b' : '5.10c/d') : p); (bands[k] = bands[k] || []).push(r); });
    for (const k of Object.keys(bands).sort((a, c) => GU(a.split('/')[0]) - GU(c.split('/')[0]))) {
      b.appendChild(el('h4', null, k));
      const ol = el('ol', 'routes compact');
      bands[k].sort((x, y) => (y.pts || 0) - (x.pts || 0)).forEach(r => {
        const li = el('li', 'route'); li.dataset.id = r.id;
        const s = sunFor(r); const sd = el('span', 'sun-dot ' + s); sd.title = SUNLABEL[s];
        const right = el('span', 'right'); right.append(el('span', 'pts', r.pts), sd);
        li.append(el('span', 'grade feel-' + (feelOf(r) || 'on'), r.g), el('span', 'mid', r.name + ', ' + (r.area || '')), right);
        li.onclick = () => openDetail(r.id); ol.appendChild(li);
      });
      b.appendChild(ol);
    }
    b.appendChild(el('h3', null, 'Avoid for points'));
    const av = el('ol', 'routes compact');
    ROUTES.filter(r => r.tier === 'avoid for points').forEach(r => {
      const li = el('li', 'route'); li.dataset.id = r.id;
      li.append(el('span', 'grade feel-stiff', r.g), el('span', 'mid', r.name), el('span', 'right', r.pts));
      li.onclick = () => openDetail(r.id); av.appendChild(li);
    });
    b.appendChild(av);
  }

  // ---------- notes export/import ----------
  function renderProfiles() {
    const box = $('#profiles'); box.textContent = '';
    for (const [key, title] of [['me', 'You (this phone)'], ['partner', 'Partner']]) {
      const p = profiles[key];
      const card = el('fieldset', 'profile'); card.appendChild(el('legend', null, title));
      const field = (label, input) => { const l = el('label', 'field'); l.append(label, input); card.appendChild(l); return input; };
      const txt = field('Name', el('input')); txt.type = 'text'; txt.value = p.name; txt.autocomplete = key === 'me' ? 'nickname' : 'off';
      txt.oninput = () => { p.name = txt.value.trim(); saveProfiles(); };
      const age = field('Age', el('input')); age.type = 'number'; age.inputMode = 'numeric'; age.min = 10; age.max = 90; age.value = p.age;
      age.oninput = () => { p.age = age.value ? +age.value : ''; saveProfiles(); };
      const gsel = (label, k) => {
        const s = el('select'); s.add(new Option('Not set', '')); for (const g of GRADES) s.add(new Option(g, g)); s.value = p[k];
        s.onchange = () => { p[k] = s.value; saveProfiles(); renderList(); };
        return field(label, s);
      };
      gsel('Onsight grade (confident first try)', 'onsight'); gsel('Project grade (hardest you can redpoint)', 'project');
      const hrow = el('div', 'ht-row');
      const ft = el('select'), inch = el('select');
      ft.add(new Option('ft', '')); for (let f = 4; f <= 7; f++) ft.add(new Option(f + ' ft', f));
      for (let i = 0; i < 12; i++) inch.add(new Option(i + ' in', i));
      if (p.ht) { ft.value = Math.floor(p.ht / 12); inch.value = p.ht % 12; }
      const setHt = () => { p.ht = ft.value ? (+ft.value) * 12 + (+inch.value) : ''; saveProfiles(); renderList(); };
      ft.onchange = setHt; inch.onchange = setHt; hrow.append(ft, inch);
      const hl = el('div', 'field'); hl.append(el('span', null, 'Height'), hrow); card.appendChild(hl);
      const ape = el('select');
      for (let i = -4; i <= 8; i++) ape.add(new Option(i === 0 ? 'Even (wingspan = height)' : `${i > 0 ? '+' : '−'}${Math.abs(i)} in`, i));
      ape.value = p.ape || 0; ape.onchange = () => { p.ape = +ape.value; saveProfiles(); renderList(); };
      field('Ape index (wingspan minus height)', ape);
      box.appendChild(card);
    }
  }
  function noteStatus(msg) { $('#noteStatus').textContent = msg || `${Object.keys(notes).length} routes have notes on this phone.`; }
  $('#btnExport').onclick = async () => {
    const payload = { app: 'hhh-field-guide', version: 2, climber: myName() || 'unknown', exported: new Date().toISOString(), profiles, notes, plans: planner ? planner.exportState() : undefined, photos: window.WallPhotos && $('#expPhotos').checked ? await WallPhotos.exportAll() : undefined };
    const name = `hhh-notes-${(myName() || 'climber').toLowerCase().replace(/\W+/g, '-')}-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
    const file = new File([blob], name, { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); noteStatus('Exported ' + name); return; }
    } catch (e) { if (e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    noteStatus('Exported ' + name);
  };
  $('#fileImport').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text()); let n = 0;
      for (const [id, v] of Object.entries(data.notes || {})) {
        if (!notes[id] || (v.updated || '') > (notes[id].updated || '')) { notes[id] = v; n++; }
      }
      // a partner's export: take their profile as this phone's partner profile
      let pmsg = '';
      if (data.profiles && data.profiles.me && data.climber && data.climber !== myName()) {
        profiles.partner = Object.assign(blankProfile(), data.profiles.me); saveProfiles(); renderProfiles(); pmsg = ` Partner profile updated from ${data.climber}.`;
      }
      if (data.plans && planner) planner.importState(data.plans);
      if (data.photos && window.WallPhotos) { const k = await WallPhotos.importAll(data.photos); if (k) pmsg += ` ${k} wall photos added.`; }
      store.set('hhh.notes', notes); renderList(); noteStatus(`Imported ${n} notes from ${data.climber || 'file'}.${pmsg}`);
    } catch (err) { noteStatus('That file isn\'t a notes export from this app.'); }
    e.target.value = '';
  };

  // ---------- offline ----------
  async function offlineStatus() {
    const s = $('#offlineStatus');
    if (!('serviceWorker' in navigator) || !window.caches) { s.textContent = 'This browser can\'t save the app for offline use.'; return; }
    const keys = await caches.keys();
    const app = keys.some(k => k.startsWith('hhh-app-'));
    const tiles = keys.includes('hhh-tiles') ? (await (await caches.open('hhh-tiles')).keys()).length : 0;
    s.textContent = (app ? 'The app and route data are saved on this phone. ' : 'The app will save itself for offline use after this first visit. ') +
      (tiles ? `${tiles} map tiles saved.` : 'Map tiles are not saved yet.');
  }
  $('#btnTiles').onclick = async () => {
    const btn = $('#btnTiles'), st = $('#tileStatus'); btn.disabled = true;
    const urls = TopoMap.offlineUrls(['topo', 'aerial']);
    const cache = await caches.open('hhh-tiles'); let ok = 0, fail = 0;
    for (let i = 0; i < urls.length; i += 6) {
      await Promise.all(urls.slice(i, i + 6).map(async u => {
        try { if (await cache.match(u)) { ok++; return; } const r = await fetch(u, { mode: 'cors' }); if (r.ok) { await cache.put(u, r); ok++; } else fail++; } catch (e) { fail++; }
      }));
      st.textContent = `Saving map: ${ok + fail} of ${urls.length}`;
    }
    st.textContent = fail ? `Saved ${ok} tiles, ${fail} failed. Try again with better signal.` : `Map saved: ${ok} tiles for topo and aerial.`;
    btn.disabled = false; offlineStatus();
  };

  // ---------- theme ----------
  function applyTheme() { document.documentElement.dataset.theme = ui.theme; requestAnimationFrame(drawDial); }

  // ---------- tabs ----------
  function showTab(t) {
    ui.tab = t; save();
    $$('.view').forEach(v => v.hidden = v.dataset.view !== t);
    $$('.tabs button').forEach(b => b.dataset.tab === t ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
    if (t !== 'map' && playTimer) stopPlay();
    if (t === 'map') { initMap(); renderMap(); requestAnimationFrame(() => map.render()); }
    if (t === 'plan') renderPlan();
    $('#clock').hidden = t === 'go'; // Go Time runs on real time, not the planning clock
    if (t === 'go' && planner) planner.renderGo($('#goBody'));
    if (t === 'me') { renderProfiles(); noteStatus(); offlineStatus(); if (window.WallPhotos) { WallPhotos.manage($('#photoList')); WallPhotos.usage().then(u => { $('#expPhotosInfo').textContent = u.n ? `(${u.n}, about ${Math.max(1, Math.round(u.bytes * 1.37 / 1048576))} MB)` : '(none yet)'; }); } }
  }
  $$('.tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));

  // ---------- wiring ----------
  $('#q').value = ui.q;
  $('#q').oninput = e => { ui.q = e.target.value.trim(); save(); renderList(); };
  $('#btnFilters').onclick = () => { const f = $('#filters'); f.hidden = !f.hidden; $('#btnFilters').setAttribute('aria-expanded', !f.hidden); };
  $('#sort').value = ui.sort; $('#sort').onchange = e => { ui.sort = e.target.value; save(); renderList(); };
  $('#btnReset').onclick = () => { Object.assign(ui, { gmin: defaults.gmin, gmax: defaults.gmax, side: [], type: [], feel: [], sun: [], list: [], fit: [] }); save(); buildGradeSelects(); syncChips(); renderList(); renderMap(); };
  let raf = 0;
  const onTime = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { updateClock(); renderList(); renderMap(); if (ui.tab === 'plan') renderPlan(); }); };
  $('#hour').oninput = e => { ui.hour = +e.target.value; save(); onTime(); };
  $('#date').onchange = e => { if (e.target.value) { ui.date = e.target.value; save(); onTime(); } };
  $('#btnNow').onclick = () => {
    const n = new Date(); const ct = new Date(n.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    ui.date = ct.getFullYear() + '-' + String(ct.getMonth() + 1).padStart(2, '0') + '-' + String(ct.getDate()).padStart(2, '0');
    ui.hour = Math.round((ct.getHours() + ct.getMinutes() / 60) * 4) / 4; save(); onTime();
  };
  // play the plan: step the clock 15 minutes at a time from the start of the event (or from the current time if it's inside the event)
  let playTimer = 0;
  const stopPlay = () => { clearInterval(playTimer); playTimer = 0; $('#play').textContent = '▶'; $('#play').setAttribute('aria-label', 'Play the plan in 15-minute steps'); onTime(); };
  $('#play').onclick = () => {
    if (playTimer) return stopPlay();
    const sp = planner && planner.span(); if (!sp) return;
    let T = sp.now >= sp.start && sp.now < sp.end - 0.01 ? Math.round(sp.now * 4) / 4 : sp.start;
    const [y, m, d] = sp.date.split('-').map(Number);
    const setT = () => { const day = new Date(Date.UTC(y, m - 1, d + Math.floor(T / 24))); ui.date = day.toISOString().slice(0, 10); ui.hour = T - Math.floor(T / 24) * 24; save(); updateClock(); renderMap(); };
    $('#play').textContent = '❚❚'; $('#play').setAttribute('aria-label', 'Pause');
    setT();
    playTimer = setInterval(() => { T += 0.25; if (T > sp.end) return stopPlay(); setT(); }, 450);
  };
  $('#hour').addEventListener('input', () => { if (playTimer) stopPlay(); });
  window.addEventListener('resize', () => requestAnimationFrame(drawDial));
  new ResizeObserver(() => document.documentElement.style.setProperty('--clock-h', $('#clock').offsetHeight + 'px')).observe($('#clock'));

  async function boot() {
    applyTheme(); buildGradeSelects(); syncChips(); updateClock();
    try {
      const [r, a] = await Promise.all([fetch('data/routes.json').then(x => x.json()), fetch('data/areas.json').then(x => x.json())]);
      ROUTES = r; AREAS = a;
      TRAILS = await fetch('data/trails.json').then(x => x.json()).catch(() => null);
    } catch (e) { $('#count').textContent = 'Route data didn\'t load. Open the app once with signal so it can save itself.'; return; }
    planner = window.Planner({ $, el, store, GU, profiles, ROUTES: () => ROUTES, AREAS: () => AREAS, TRAILS: () => TRAILS, ui, feelOf, openDetail, showTab, saveUi: save,
      onPlanChange: () => renderMap(), onProfiles: () => { saveProfiles(); renderProfiles(); renderList(); }, renderReference, onClock: () => updateClock() });
    WallPhotos.init({ el, ROUTES: () => ROUTES, AREAS: () => AREAS, openDetail, lastFix: () => me,
      planState: rid => { const p = planner.active(); const it = p && p.items.find(i => i.rid === rid); return it ? (it.done ? 'done' : 'plan') : null; },
      onPhotos: area => { if (ui.tab === 'me') WallPhotos.manage($('#photoList')); const sh = $('#areaSheet'); if (!sh.hidden && sh.dataset.area === area) openArea(area); else if (ui.tab === 'map') openArea(area); } });
    renderList(); showTab(ui.tab);
    // a shared plan link: #p=<code>
    const takeHash = () => { if (/^#p=/.test(location.hash)) { const h = location.hash; history.replaceState(null, '', location.pathname + location.search); planner.importShared(h); } };
    takeHash(); window.addEventListener('hashchange', takeHash);
    $('#buildInfo').textContent = 'Version ' + (window.HHH_VERSION || 'dev') + '.';
    if ('serviceWorker' in navigator) {
      // Pick up new versions: check on launch and whenever the app comes back to the foreground, then reload once the new version takes over.
      const hadController = !!navigator.serviceWorker.controller; let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
        const check = () => { if (navigator.onLine) reg.update().catch(() => {}); };
        check(); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      }).catch(() => {});
    }
  }
  boot();
})();
