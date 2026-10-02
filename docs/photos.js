// Wall photos: take a picture at a wall, mark where each climb starts, see the marks later on the map's wall sheet
// and in route details. Photos stay on this phone (IndexedDB); the notes export carries them to a partner.
(function () {
  const DB = 'hhh-photos', STORE = 'photos', MAXPX = 1600;
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { const s = r.result.createObjectStore(STORE, { keyPath: 'id' }); s.createIndex('area', 'area'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(STORE, mode); const out = fn(t.objectStore(STORE)); t.oncomplete = () => res(out && 'result' in out ? out.result : out); t.onerror = () => rej(t.error); }); };
  const all = () => tx('readonly', s => s.getAll());
  const byArea = async area => (await all()).filter(p => p.area === area).sort((a, b) => a.taken < b.taken ? -1 : 1);
  const put = rec => tx('readwrite', s => s.put(rec));
  const del = id => tx('readwrite', s => s.delete(id));

  let C = null; // context from app.js
  const urls = new Map(); // blob URLs, one per photo id
  const urlOf = p => { let u = urls.get(p.id); if (!u || u.blob !== p.blob) { if (u) URL.revokeObjectURL(u.url); u = { blob: p.blob, url: URL.createObjectURL(p.blob) }; urls.set(p.id, u); } return u.url; };

  const metres = (a, b) => { const t = Math.PI / 180, x = (b.lon - a.lon) * t * Math.cos((a.lat + b.lat) / 2 * t), y = (b.lat - a.lat) * t; return 6371000 * Math.hypot(x, y); };
  function nearestWall(pos) {
    let best = null;
    for (const [name, a] of Object.entries(C.AREAS())) { if (a.lat == null) continue; const d = metres(pos, a); if (!best || d < best.d) best = { name, d }; }
    return best;
  }
  function here(timeout = 8000) {
    const last = C.lastFix && C.lastFix();
    if (last && Date.now() - last.t < 60000) return Promise.resolve(last);
    return new Promise(res => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lon: p.coords.longitude, t: Date.now() }), () => res(null), { enableHighAccuracy: true, timeout, maximumAge: 30000 });
    });
  }
  async function shrink(file) {
    const img = new Image(); const u = URL.createObjectURL(file); img.src = u;
    try { await img.decode(); } finally { URL.revokeObjectURL(u); }
    const s = Math.min(1, MAXPX / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * s); cv.height = Math.round(img.naturalHeight * s);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.82));
    return { blob, w: cv.width, h: cv.height };
  }
  const routesAt = area => C.ROUTES().filter(r => r.area === area).sort((a, b) => (a.n ?? 1e9) - (b.n ?? 1e9) || (a.walk ?? 1e9) - (b.walk ?? 1e9));
  const label = r => r.n != null ? String(r.n) : '•';

  // ---------- dialogs ----------
  function fullDialog(title) {
    const d = document.createElement('dialog'); d.className = 'photo-dlg';
    const head = el('header', 'pd-head'); const h = el('h2', null, title);
    const x = el('button', 'd-close', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.onclick = () => d.close();
    head.append(h, x); d.appendChild(head); document.body.appendChild(d);
    d.addEventListener('close', () => d.remove()); d.showModal(); return { d, h };
  }
  const el = (t, c, txt) => C.el(t, c, txt);

  // markers drawn over an image box; positions are fractions of the photo
  function drawMarks(box, rec, opts = {}) {
    box.querySelectorAll('.pm').forEach(n => n.remove());
    const byId = Object.fromEntries(C.ROUTES().map(r => [r.id, r]));
    for (const m of rec.marks) {
      const r = byId[m.rid]; if (!r) continue;
      const st = C.planState(r.id);
      const b = el('button', 'pm' + (st ? ' ' + st : '') + (opts.sel === m.rid ? ' sel' : '') + (opts.focus && opts.focus !== m.rid ? ' dim' : ''), label(r));
      b.type = 'button'; b.style.left = (m.x * 100) + '%'; b.style.top = (m.y * 100) + '%';
      b.setAttribute('aria-label', `${r.name} ${r.g}`); b.dataset.rid = m.rid;
      if (opts.onMark) opts.onMark(b, m, r);
      box.appendChild(b);
    }
  }

  // ---------- editor ----------
  async function edit(rec, isNew) {
    const { d, h } = fullDialog(isNew ? 'Mark the climbs' : 'Edit marks');
    rec = Object.assign({ marks: [] }, rec);
    // wall picker
    const top = el('div', 'pd-top');
    const sel = el('select'); sel.setAttribute('aria-label', 'Wall');
    const names = Object.keys(C.AREAS()).filter(a => C.ROUTES().some(r => r.area === a)).sort();
    for (const a of names) sel.add(new Option(a, a));
    sel.value = rec.area || names[0];
    const near = el('span', 'hint small', rec.near || '');
    top.append(sel, near); d.appendChild(top);
    // photo with zoom
    const zoomRow = el('div', 'pd-zoom'); let zoom = 1;
    const scroller = el('div', 'pd-scroll'), box = el('div', 'pd-box'), img = el('img'); img.src = urlOf(rec); img.alt = 'Wall photo'; img.draggable = false;
    box.appendChild(img); scroller.appendChild(box); d.appendChild(scroller);
    const ar = (rec.w && rec.h) ? rec.w / rec.h : 1.5; // fit the whole photo at 1x, zoom multiplies
    const fit = () => { box.style.width = `min(${zoom * 100}%, calc(52vh * ${ar.toFixed(4)} * ${zoom}))`; }; fit();
    for (const z of [1, 2, 3]) { const b = el('button', 'chip', z + '×'); b.type = 'button'; b.setAttribute('aria-pressed', z === 1); b.onclick = () => { zoom = z; fit(); zoomRow.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); }; zoomRow.appendChild(b); }
    const help = el('p', 'hint small pd-help'); zoomRow.appendChild(help); d.appendChild(zoomRow);
    // route list
    const list = el('div', 'pd-routes'); d.appendChild(list);
    let cur = null;
    const placed = () => new Set(rec.marks.map(m => m.rid));
    function renderList() {
      list.textContent = ''; const P = placed();
      const rs = routesAt(sel.value);
      if (cur && !rs.some(r => r.id === cur)) cur = null;
      if (!cur) { const nx = rs.find(r => !P.has(r.id)); cur = nx ? nx.id : null; }
      for (const r of rs) {
        const b = el('button', 'pd-r' + (P.has(r.id) ? ' done' : '') + (cur === r.id ? ' cur' : '')); b.type = 'button';
        b.append(el('span', 'pd-n', label(r)), el('span', 'pd-g', r.g), el('span', 'pd-name', r.name), el('span', 'pd-ok', P.has(r.id) ? '✓' : ''));
        b.onclick = () => { cur = r.id; renderList(); redraw(); };
        list.appendChild(b);
      }
      const r = rs.find(x => x.id === cur);
      help.textContent = r ? `Tap the photo where #${label(r)} ${r.name} starts.` + (P.has(r.id) ? ' Drag its mark to move it.' : '') : rs.length ? 'All marked. Tap a route to move its mark.' : 'No comp routes at this wall.';
      rm.hidden = !(cur && P.has(cur));
    }
    function redraw() {
      drawMarks(box, rec, { sel: cur, onMark: (b, m) => {
        b.onpointerdown = e => {
          e.preventDefault(); e.stopPropagation(); cur = m.rid; renderList(); b.setPointerCapture(e.pointerId); let moved = false;
          b.onpointermove = ev => { const R = box.getBoundingClientRect(); m.x = Math.min(1, Math.max(0, (ev.clientX - R.left) / R.width)); m.y = Math.min(1, Math.max(0, (ev.clientY - R.top) / R.height)); b.style.left = m.x * 100 + '%'; b.style.top = m.y * 100 + '%'; moved = true; };
          b.onpointerup = () => { b.onpointermove = b.onpointerup = null; redraw(); };
        };
      } });
    }
    box.addEventListener('click', e => {
      if (e.target.closest('.pm') || !cur) return;
      const R = box.getBoundingClientRect(); const x = (e.clientX - R.left) / R.width, y = (e.clientY - R.top) / R.height;
      const m = rec.marks.find(k => k.rid === cur); if (m) { m.x = x; m.y = y; } else rec.marks.push({ rid: cur, x, y });
      if (!m) cur = null; // move on to the next unmarked route
      renderList(); redraw();
    });
    // actions
    const act = el('div', 'btnrow pd-act');
    const rm = el('button', 'btn', 'Remove mark'); rm.type = 'button'; rm.onclick = () => { rec.marks = rec.marks.filter(m => m.rid !== cur); renderList(); redraw(); };
    const save = el('button', 'btn primary', 'Save'); save.type = 'button';
    save.onclick = async () => { rec.area = sel.value; delete rec.near; await put(rec); d.close(); C.onPhotos(rec.area); };
    const delB = el('button', 'btn danger', isNew ? 'Discard' : 'Delete photo'); delB.type = 'button';
    delB.onclick = async () => { if (!isNew) await del(rec.id); d.close(); C.onPhotos(rec.area); };
    act.append(save, rm, delB); d.appendChild(act);
    sel.onchange = () => { if (rec.marks.length && !confirmSwitch()) { sel.value = rec.area; return; } rec.marks = []; rec.area = sel.value; near.textContent = ''; cur = null; renderList(); redraw(); };
    const confirmSwitch = () => true; // marks belong to a wall; switching walls clears them
    rec.area = sel.value;
    await img.decode().catch(() => {});
    renderList(); redraw();
  }

  // ---------- capture ----------
  const fileIn = document.createElement('input'); fileIn.type = 'file'; fileIn.accept = 'image/*'; fileIn.setAttribute('capture', 'environment'); fileIn.hidden = true;
  document.body.appendChild(fileIn);
  let pending = null;
  function capture(area) {
    // open the camera straight from the tap (phones require it), look up where we are meanwhile
    pending = { area, where: area ? null : here() };
    fileIn.value = ''; fileIn.click();
  }
  fileIn.onchange = async () => {
    const f = fileIn.files[0]; if (!f || !pending) return;
    const job = pending; pending = null;
    const { blob, w, h } = await shrink(f);
    let area = job.area, nearTxt = '';
    if (!area) {
      const pos = await job.where; const nw = pos && nearestWall(pos);
      if (nw && nw.d < 400) { area = nw.name; nearTxt = `GPS: ${Math.round(nw.d)} m from ${nw.name}`; }
      else nearTxt = pos ? 'GPS: not near a wall. Pick it above.' : 'No GPS fix. Pick the wall above.';
    }
    edit({ id: 'ph' + Date.now().toString(36), area, taken: new Date().toISOString(), w, h, blob, marks: [], near: nearTxt }, true);
  };

  // ---------- viewing ----------
  function thumb(rec, opts = {}) {
    const box = el('div', 'pv-box'); const img = el('img'); img.src = urlOf(rec); img.alt = 'Photo of ' + rec.area; img.loading = 'lazy';
    box.appendChild(img); drawMarks(box, rec, { focus: opts.focus, sel: opts.focus, onMark: (b, m, r) => { b.onclick = e => { e.stopPropagation(); C.openDetail(r.id); }; } });
    return box;
  }
  function view(rec) {
    const { d } = fullDialog(rec.area);
    const sc = el('div', 'pd-scroll'); const box = thumb(rec); box.style.width = `min(100%, calc(52vh * ${((rec.w / rec.h) || 1.5).toFixed(4)}))`; sc.appendChild(box); d.appendChild(sc);
    d.querySelectorAll('.pm').forEach(b => b.addEventListener('click', () => d.close()));
    d.appendChild(el('p', 'hint small pd-help', `${rec.marks.length} climbs marked · ${new Date(rec.taken).toLocaleDateString()}. Tap a mark for the route. Orange marks are in your plan, green ones are done.`));
    const act = el('div', 'btnrow pd-act'); const b = el('button', 'btn primary', 'Edit marks'); b.type = 'button'; b.onclick = () => { d.close(); edit(rec, false); };
    act.appendChild(b); d.appendChild(act);
  }
  // a wall's photos for the map sheet
  async function section(area) {
    const wrap = el('div', 'photos');
    const head = el('div', 'photos-head'); head.appendChild(el('h3', null, 'Photos'));
    const add = el('button', 'btn', '📷 Add photo'); add.type = 'button'; add.onclick = () => capture(area); head.appendChild(add);
    wrap.appendChild(head);
    let ps = []; try { ps = await byArea(area); } catch (e) { wrap.appendChild(el('p', 'hint small', 'Photos aren\'t available in this browser.')); return wrap; }
    if (!ps.length) wrap.appendChild(el('p', 'hint small', 'No photos yet. Take one from the base of the wall and mark where each climb starts.'));
    const row = el('div', 'photo-row');
    for (const p of ps) { const t = thumb(p); t.classList.add('mini'); t.onclick = () => view(p); t.querySelectorAll('.pm').forEach(b => { b.onclick = e => { e.stopPropagation(); view(p); }; }); row.appendChild(t); }
    wrap.appendChild(row);
    return wrap;
  }
  // the photo(s) showing one route, for the route detail
  async function forRoute(rid) {
    let ps = []; try { ps = (await all()).filter(p => p.marks.some(m => m.rid === rid)); } catch (e) { return null; }
    if (!ps.length) return null;
    const wrap = el('div', 'photos'); wrap.appendChild(el('h3', null, 'Where it starts'));
    for (const p of ps) { const t = thumb(p, { focus: rid }); t.onclick = () => view(p); wrap.appendChild(t); }
    return wrap;
  }

  // ---------- export / import (data URLs inside the notes export) ----------
  const toDataUrl = blob => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
  async function exportAll() { try { return Promise.all((await all()).map(async p => ({ id: p.id, area: p.area, taken: p.taken, w: p.w, h: p.h, marks: p.marks, data: await toDataUrl(p.blob) }))); } catch (e) { return []; } }
  async function importAll(list) {
    let n = 0; if (!Array.isArray(list)) return 0;
    const have = Object.fromEntries((await all()).map(p => [p.id, p]));
    for (const p of list) {
      if (!p || !p.id || !p.data) continue;
      const blob = await (await fetch(p.data)).blob();
      const old = have[p.id];
      if (old && old.marks.length >= (p.marks || []).length) continue;
      await put({ id: p.id, area: p.area, taken: p.taken, w: p.w, h: p.h, marks: p.marks || [], blob }); n++;
    }
    return n;
  }

  window.WallPhotos = { init(ctx) { C = ctx; }, capture, section, forRoute, exportAll, importAll, count: async () => { try { return (await all()).length; } catch (e) { return 0; } } };
})();
