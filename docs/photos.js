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
  // load a picked photo robustly (iOS can reject img.decode() on big camera images, and toBlob can return null)
  function loadImg(file) {
    return new Promise((res, rej) => {
      const img = new Image(), u = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(u); res(img); };
      img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('This photo format couldn\'t be opened. In iPhone Settings > Camera > Formats, choose Most Compatible, or pick a JPEG.')); };
      img.src = u;
    });
  }
  async function shrink(file) {
    let src, W, H;
    try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); W = src.width; H = src.height; }
    catch (e) { src = await loadImg(file); W = src.naturalWidth; H = src.naturalHeight; }
    const s = Math.min(1, MAXPX / Math.max(W, H));
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(W * s)); cv.height = Math.max(1, Math.round(H * s));
    cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
    if (src.close) src.close();
    let blob = await new Promise(r => { try { cv.toBlob(r, 'image/jpeg', 0.82); } catch (e) { r(null); } });
    if (!blob) { try { blob = await (await fetch(cv.toDataURL('image/jpeg', 0.82))).blob(); } catch (e) { blob = null; } }
    if (!blob || blob.size < 1000) return { blob: file, w: W, h: H }; // keep the original if shrinking failed
    return { blob, w: cv.width, h: cv.height };
  }
  // small copy for lists and rows: decoding dozens of full-size photos at once can crash a phone
  async function makeThumb(blob, px = 480) {
    let src; try { src = await createImageBitmap(blob); } catch (e) { src = await loadImg(blob); }
    const W = src.width || src.naturalWidth, H = src.height || src.naturalHeight, s = Math.min(1, px / Math.max(W, H));
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(W * s)); cv.height = Math.max(1, Math.round(H * s));
    cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height); if (src.close) src.close();
    return await new Promise(r => { try { cv.toBlob(r, 'image/jpeg', 0.75); } catch (e) { r(null); } });
  }
  async function ensureThumb(rec) {
    if (rec.thumb) return rec;
    try { rec.thumb = await makeThumb(rec.blob); if (rec.thumb) await put(rec); } catch (e) { /* fall back to the full photo */ }
    return rec;
  }
  const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
  function toast(msg) { let t = document.getElementById('photoToast'); if (!t) { t = el('div', 'photo-toast'); t.id = 'photoToast'; document.body.appendChild(t); } t.textContent = msg; t.hidden = !msg; }
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
    save.onclick = async () => { rec.area = sel.value; delete rec.near; if (!rec.thumb) { try { rec.thumb = await makeThumb(rec.blob); } catch (e) { /* none */ } } await put(rec); persist(); d.close(); C.onPhotos(rec.area); };
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
  // Taking the picture happens inside the app (live camera + shutter). Handing off to the phone's camera
  // app (<input capture>) loses the picture in home-screen apps, so the file picker is only for the photo library.
  const fileIn = document.createElement('input'); fileIn.type = 'file'; fileIn.accept = 'image/*';
  fileIn.className = 'photo-input'; fileIn.tabIndex = -1; fileIn.setAttribute('aria-hidden', 'true');
  document.body.appendChild(fileIn);
  let pending = null;
  function capture(area) {
    const job = { area, where: area ? null : here() };
    const { d } = fullDialog(area ? 'Photo of ' + area : 'Wall photo');
    const v = el('video', 'cam-video'); v.setAttribute('playsinline', ''); v.muted = true; v.autoplay = true;
    const st = el('p', 'hint small cam-st', 'Starting the camera…');
    const row = el('div', 'cam-row');
    const lib = el('button', 'btn', 'Photo library'); lib.type = 'button';
    const shut = el('button', 'cam-shutter'); shut.type = 'button'; shut.setAttribute('aria-label', 'Take the picture'); shut.disabled = true;
    const spacer = el('span', 'cam-spacer');
    row.append(lib, shut, spacer); d.append(v, st, row);
    let stream = null;
    const stop = () => { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; v.srcObject = null; };
    d.addEventListener('close', stop);
    lib.onclick = () => { stop(); d.close(); pending = job; fileIn.value = ''; fileIn.click(); };
    (async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { st.textContent = 'This browser can\'t use the camera here. Take the photo with the camera app, then tap Photo library.'; return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } } });
        if (!d.open) return stop();
        v.srcObject = stream; await v.play().catch(() => {});
        shut.disabled = false; st.textContent = 'Frame the base of the wall, then tap the shutter.';
      } catch (e) { st.textContent = 'Camera not available (' + (e.name || 'error') + '). Allow camera access for this app, or take the photo with the camera app and tap Photo library.'; }
    })();
    shut.onclick = async () => {
      if (!v.videoWidth) return;
      const W = v.videoWidth, H = v.videoHeight, sc = Math.min(1, MAXPX / Math.max(W, H));
      const cv = document.createElement('canvas'); cv.width = Math.round(W * sc); cv.height = Math.round(H * sc);
      cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
      stop(); d.close();
      let blob = await new Promise(r => { try { cv.toBlob(r, 'image/jpeg', 0.85); } catch (e) { r(null); } });
      if (!blob) blob = await (await fetch(cv.toDataURL('image/jpeg', 0.85))).blob();
      finish(job, { blob, w: cv.width, h: cv.height });
    };
  }
  async function finish(job, img) {
    try {
      let area = job.area, nearTxt = '';
      if (!area) {
        toast('Finding the nearest wall…');
        const pos = await withTimeout(job.where, 5000); const nw = pos && nearestWall(pos);
        if (nw && nw.d < 400) { area = nw.name; nearTxt = `GPS: ${Math.round(nw.d)} m from ${nw.name}`; }
        else nearTxt = pos ? 'GPS: not near a wall. Pick it above.' : 'No GPS fix. Pick the wall above.';
      }
      toast('');
      await edit({ id: 'ph' + Date.now().toString(36), area, taken: new Date().toISOString(), w: img.w, h: img.h, blob: img.blob, marks: [], near: nearTxt }, true);
    } catch (e) { fail(e); }
  }
  const fail = e => { toast(''); const { d } = fullDialog('Photo didn\'t load'); d.appendChild(el('p', 'pd-msg', (e && e.message) || String(e))); };
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files && fileIn.files[0]; if (!f) return;
    const job = pending || { area: null, where: here() }; pending = null;
    toast('Loading photo…');
    try { await finish(job, await shrink(f)); } catch (e) { fail(e); }
    fileIn.value = '';
  });

  // ---------- viewing ----------
  const thumbUrls = new Map();
  const thumbUrlOf = p => { if (!p.thumb) return urlOf(p); let u = thumbUrls.get(p.id); if (!u || u.blob !== p.thumb) { if (u) URL.revokeObjectURL(u.url); u = { blob: p.thumb, url: URL.createObjectURL(p.thumb) }; thumbUrls.set(p.id, u); } return u.url; };
  function thumb(rec, opts = {}) {
    const box = el('div', 'pv-box'); box.style.aspectRatio = `${rec.w || 3} / ${rec.h || 2}`;
    const img = el('img'); img.alt = 'Photo of ' + rec.area; img.loading = 'lazy'; img.decoding = 'async';
    if (!opts.lazy) img.src = opts.full ? urlOf(rec) : thumbUrlOf(rec);
    box.appendChild(img); drawMarks(box, rec, { focus: opts.focus, sel: opts.focus, onMark: (b, m, r) => { b.onclick = e => { e.stopPropagation(); C.openDetail(r.id); }; } });
    return box;
  }
  const arOf = rec => (rec.w && rec.h) ? rec.w / rec.h : 1.5;
  // full-screen viewer: swipe between a set of photos, zoom with pinch, double-tap or the +/- buttons
  function view(list, start = 0, focus = null) {
    if (!Array.isArray(list)) list = [list];
    const { d, h } = fullDialog(list[start].area);
    const car = el('div', 'pv-car'); d.appendChild(car);
    const slides = list.map(rec => {
      const sl = el('div', 'pv-slide'); const box = thumb(rec, { focus, lazy: true });
      box.querySelectorAll('.pm').forEach(b => { const rid = b.dataset.rid; b.onclick = e => { e.stopPropagation(); d.close(); C.openDetail(rid); }; });
      sl.appendChild(box); car.appendChild(sl);
      return { rec, sl, box, z: 1, base: 0 };
    });
    const info = el('p', 'hint small pv-info'); d.appendChild(info);
    const bar = el('div', 'pv-bar');
    const btn = (t, lab, fn) => { const b = el('button', 'pv-btn', t); b.type = 'button'; b.setAttribute('aria-label', lab); b.onclick = fn; bar.appendChild(b); return b; };
    let cur = start;
    const bPrev = btn('‹', 'Previous photo', () => go(cur - 1));
    const bOut = btn('−', 'Zoom out', () => zoomTo(slides[cur], slides[cur].z / 1.5));
    const bFit = btn('Fit', 'Fit the photo', () => zoomTo(slides[cur], 1));
    const bIn = btn('+', 'Zoom in', () => zoomTo(slides[cur], slides[cur].z * 1.5));
    const bNext = btn('›', 'Next photo', () => go(cur + 1));
    d.appendChild(bar);
    const act = el('div', 'btnrow pd-act'); const bEd = el('button', 'btn primary', 'Edit marks'); bEd.type = 'button'; bEd.onclick = () => { const r = slides[cur].rec; d.close(); edit(r, false); };
    const bDel = el('button', 'btn danger', 'Delete photo'); bDel.type = 'button'; let armed = 0;
    bDel.onclick = async () => {
      if (Date.now() - armed > 4000) { armed = Date.now(); bDel.textContent = 'Tap again to delete'; setTimeout(() => { if (Date.now() - armed >= 4000) bDel.textContent = 'Delete photo'; }, 4100); return; }
      armed = 0; bDel.textContent = 'Delete photo';
      const r = slides[cur].rec; await del(r.id);
      slides[cur].sl.remove(); slides.splice(cur, 1); list.splice(cur, 1);
      C.onPhotos(r.area);
      if (!slides.length) { d.close(); return; }
      cur = Math.min(cur, slides.length - 1); layout(); car.scrollLeft = cur * car.clientWidth; status();
    };
    act.append(bEd, bDel); d.appendChild(act);

    function layout() {
      const W = car.clientWidth, H = car.clientHeight;
      for (const s of slides) { s.base = Math.min(W, H * arOf(s.rec)); size(s); }
    }
    function size(s) { s.box.style.width = Math.round(s.base * s.z) + 'px'; s.sl.classList.toggle('zoomed', s.z > 1.01); car.classList.toggle('locked', slides[cur].z > 1.01); }
    function zoomTo(s, z, cx, cy) {
      z = Math.max(1, Math.min(6, z)); const sl = s.sl;
      if (cx == null) { cx = sl.clientWidth / 2; cy = sl.clientHeight / 2; }
      const R = s.box.getBoundingClientRect(), S = sl.getBoundingClientRect();
      const fx = (cx + S.left - R.left) / R.width, fy = (cy + S.top - R.top) / R.height; // point under the fingers, as a fraction of the photo
      s.z = z; size(s);
      const R2 = s.box.getBoundingClientRect();
      sl.scrollLeft += (R2.left - S.left) + fx * R2.width - cx; sl.scrollTop += (R2.top - S.top) + fy * R2.height - cy;
      status();
    }
    function status() {
      // only the photos around the current one are decoded at full size
      slides.forEach((s, i) => { const img = s.box.querySelector('img'); if (Math.abs(i - cur) <= 1) { const u = urlOf(s.rec); if (img.getAttribute('src') !== u) img.src = u; } else if (img.getAttribute('src')) img.removeAttribute('src'); });
      const r = slides[cur].rec;
      h.textContent = r.area;
      info.textContent = (list.length > 1 ? `${cur + 1} of ${list.length} · ` : '') + `${r.marks.length} marked` + (slides[cur].z > 1.01 ? ` · ${slides[cur].z.toFixed(1)}×` : '') + ' · tap a mark for its route · orange = in plan, green = done';
      bPrev.disabled = cur === 0; bNext.disabled = cur === list.length - 1; bOut.disabled = bFit.disabled = slides[cur].z <= 1.01; bIn.disabled = slides[cur].z >= 5.99;
      bPrev.hidden = bNext.hidden = list.length < 2;
    }
    function go(i) {
      if (i < 0 || i >= list.length) return;
      if (slides[cur].z > 1.01) { slides[cur].z = 1; size(slides[cur]); }
      cur = i; car.classList.remove('locked'); car.scrollTo({ left: i * car.clientWidth, behavior: 'smooth' }); status();
    }
    car.addEventListener('scroll', () => { const i = Math.round(car.scrollLeft / Math.max(1, car.clientWidth)); if (i !== cur && slides[i]) { if (slides[cur].z > 1.01) { slides[cur].z = 1; size(slides[cur]); } cur = i; status(); } }, { passive: true });
    // pinch and double-tap on each slide
    for (const s of slides) {
      const pts = new Map(); let pinch = null, lastTap = 0;
      s.sl.addEventListener('pointerdown', e => { pts.set(e.pointerId, e); if (pts.size === 2) { const [a, b] = [...pts.values()]; const S = s.sl.getBoundingClientRect(); pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z: s.z, cx: (a.clientX + b.clientX) / 2 - S.left, cy: (a.clientY + b.clientY) / 2 - S.top }; } });
      s.sl.addEventListener('pointermove', e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, e); if (pinch && pts.size === 2) { const [a, b] = [...pts.values()]; zoomTo(s, pinch.z * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pinch.d, pinch.cx, pinch.cy); } });
      const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
      s.sl.addEventListener('pointerup', e => {
        up(e); if (e.target.closest('.pm')) return;
        const now = Date.now(); if (now - lastTap < 300) { const S = s.sl.getBoundingClientRect(); zoomTo(s, s.z > 1.01 ? 1 : 2.5, e.clientX - S.left, e.clientY - S.top); lastTap = 0; } else lastTap = now;
      });
      s.sl.addEventListener('pointercancel', up);
    }
    const ro = new ResizeObserver(() => { layout(); car.scrollLeft = cur * car.clientWidth; }); ro.observe(car);
    d.addEventListener('close', () => ro.disconnect());
    layout(); car.scrollLeft = start * car.clientWidth; status();
  }
  // a wall's photos for the map sheet
  async function section(area) {
    const wrap = el('div', 'photos');
    const head = el('div', 'photos-head'); head.appendChild(el('h3', null, 'Photos'));
    const add = el('button', 'btn', '📷 Add photo'); add.type = 'button'; add.onclick = () => capture(area); head.appendChild(add);
    wrap.appendChild(head);
    let ps = []; try { ps = await Promise.all((await byArea(area)).map(ensureThumb)); } catch (e) { wrap.appendChild(el('p', 'hint small', 'Photos aren\'t available in this browser.')); return wrap; }
    if (!ps.length) wrap.appendChild(el('p', 'hint small', 'No photos yet. Take one from the base of the wall and mark where each climb starts.'));
    const row = el('div', 'photo-row');
    ps.forEach((p, i) => { const t = thumb(p); t.classList.add('mini'); t.style.width = `calc(var(--thumb-h) * ${arOf(p).toFixed(4)})`; t.onclick = () => view(ps, i); t.querySelectorAll('.pm').forEach(b => { b.onclick = e => { e.stopPropagation(); view(ps, i); }; }); row.appendChild(t); });
    wrap.appendChild(row);
    return wrap;
  }
  // the photo(s) showing one route, for the route detail
  async function forRoute(rid) {
    let ps = []; try { ps = await Promise.all((await all()).filter(p => p.marks.some(m => m.rid === rid)).map(ensureThumb)); } catch (e) { return null; }
    if (!ps.length) return null;
    const wrap = el('div', 'photos'); wrap.appendChild(el('h3', null, 'Where it starts'));
    const row = el('div', 'photo-row'); ps.forEach((p, i) => { const t = thumb(p, { focus: rid }); t.classList.add('mini'); t.style.width = `calc(var(--thumb-h) * ${arOf(p).toFixed(4)})`; t.onclick = () => view(ps, i, rid); t.querySelectorAll('.pm').forEach(b => { b.onclick = e => { e.stopPropagation(); view(ps, i, rid); }; }); row.appendChild(t); }); wrap.appendChild(row);
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

  // list every photo on this phone with delete buttons (Climber Setup)
  let manageGen = 0;
  async function manage(box) {
    const gen = ++manageGen;
    let ps = []; try { ps = (await all()).sort((a, b) => a.taken < b.taken ? 1 : -1); for (const p of ps) await ensureThumb(p); } catch (e) { box.textContent = ''; box.appendChild(el('p', 'hint small', 'Photos aren\'t available in this browser.')); return; }
    if (gen !== manageGen) return; // a newer refresh is on its way
    box.textContent = '';
    if (!ps.length) { box.appendChild(el('p', 'hint small', 'No wall photos on this phone.')); return; }
    const u = await usage(); const mb = x => (x / 1048576).toFixed(x < 10485760 ? 1 : 0) + ' MB';
    box.appendChild(el('p', 'hint small', `${u.n} photos, ${mb(u.bytes)}` + (u.quota ? ` of about ${u.quota > 2 ** 30 ? (u.quota / 2 ** 30).toFixed(1) + ' GB' : mb(u.quota)} this app may use.` : '.')));
    const ul = el('ul', 'ph-list');
    ps.forEach((p, i) => {
      const li = el('li', 'ph-item'); const im = el('img'); im.loading = 'lazy'; im.src = thumbUrlOf(p); im.alt = ''; im.onclick = () => view(ps, i);
      const tx = el('div', 'ph-tx'); tx.append(el('strong', null, p.area || 'No wall'), el('span', 'hint small', `${(t => t.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + Sun.fmt(t.getHours() + t.getMinutes() / 60))(new Date(p.taken))} · ${p.marks.length} marked`));
      const x = el('button', 'btn danger', 'Delete'); x.type = 'button'; let armed = 0;
      x.onclick = async () => { if (Date.now() - armed > 4000) { armed = Date.now(); x.textContent = 'Sure?'; return; } await del(p.id); C.onPhotos(p.area); manage(box); };
      li.append(im, tx, x); ul.appendChild(li);
    });
    box.appendChild(ul);
    const row = el('div', 'btnrow'); const all_ = el('button', 'btn danger', `Delete all ${ps.length} photos`); all_.type = 'button'; let armed = 0;
    all_.onclick = async () => { if (Date.now() - armed > 4000) { armed = Date.now(); all_.textContent = 'Tap again to delete all'; return; } for (const p of ps) await del(p.id); manage(box); };
    row.appendChild(all_); box.appendChild(row);
  }

  async function usage() {
    let n = 0, bytes = 0; try { for (const p of await all()) { n++; bytes += (p.blob && p.blob.size || 0) + (p.thumb && p.thumb.size || 0); } } catch (e) { /* none */ }
    let quota = null; try { if (navigator.storage && navigator.storage.estimate) quota = (await navigator.storage.estimate()).quota; } catch (e) { /* none */ }
    let persisted = null; try { if (navigator.storage && navigator.storage.persisted) persisted = await navigator.storage.persisted(); } catch (e) { /* none */ }
    return { n, bytes, quota, persisted };
  }
  // ask the browser not to clear our storage when the phone is low on space
  const persist = () => { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* none */ } };

  window.WallPhotos = { manage, usage, persist, init(ctx) { C = ctx; }, capture, section, forRoute, exportAll, importAll, count: async () => { try { return (await all()).length; } catch (e) { return 0; } } };
})();
