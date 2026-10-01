// Minimal offline-capable slippy map using USGS National Map tiles (public domain).
(function () {
  const LAYERS = {
    topo: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
    aerial: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}',
  };
  const MAXNATIVE = 16, MINZ = 12, MAXZ = 19, TS = 256;
  // ranch bounding box used for offline download
  const BBOX = { s: 35.994, w: -93.303, n: 36.016, e: -93.279 };

  const lon2x = (lon, z) => (lon + 180) / 360 * 2 ** z * TS;
  const lat2y = (lat, z) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z * TS; };
  const x2lon = (x, z) => x / TS / 2 ** z * 360 - 180;
  const y2lat = (y, z) => { const n = Math.PI - 2 * Math.PI * y / TS / 2 ** z; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };
  const url = (layer, z, x, y) => LAYERS[layer].replace('{z}', z).replace('{x}', x).replace('{y}', y);

  function create(el, tilesEl, marksEl, opts) {
    const st = { lat: opts.lat, lon: opts.lon, zoom: opts.zoom, layer: opts.layer || 'topo', marks: [], lines: [], onMove: opts.onMove || (() => {}) };
    const SVGNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('class', 'map-lines');
    const markBox = document.createElement('div'); markBox.className = 'map-markbox';
    marksEl.append(svg, markBox);
    const tileImgs = new Map();

    function size() { return { w: el.clientWidth, h: el.clientHeight }; }
    function project(lat, lon) {
      const { w, h } = size(); const z = st.zoom;
      return { x: lon2x(lon, z) - lon2x(st.lon, z) + w / 2, y: lat2y(lat, z) - lat2y(st.lat, z) + h / 2 };
    }
    function render() {
      const { w, h } = size(); if (!w) return;
      const tz = Math.max(MINZ, Math.min(MAXNATIVE, Math.floor(st.zoom)));
      const scale = 2 ** (st.zoom - tz);
      const cx = lon2x(st.lon, tz), cy = lat2y(st.lat, tz);
      const span = TS * scale;
      const x0 = Math.floor((cx - w / 2 / scale) / TS), x1 = Math.floor((cx + w / 2 / scale) / TS);
      const y0 = Math.floor((cy - h / 2 / scale) / TS), y1 = Math.floor((cy + h / 2 / scale) / TS);
      const want = new Set();
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const key = st.layer + '/' + tz + '/' + x + '/' + y; want.add(key);
        let img = tileImgs.get(key);
        if (!img) {
          img = new Image(); img.alt = ''; img.decoding = 'async'; img.draggable = false;
          img.onerror = () => img.classList.add('missing');
          img.src = url(st.layer, tz, x, y); tilesEl.appendChild(img); tileImgs.set(key, img);
        }
        img.style.width = img.style.height = (span + 0.5) + 'px';
        img.style.transform = `translate(${(x * TS - cx) * scale + w / 2}px,${(y * TS - cy) * scale + h / 2}px)`;
      }
      for (const [k, img] of tileImgs) if (!want.has(k)) { img.remove(); tileImgs.delete(k); }
      for (const m of st.marks) {
        const p = project(m.lat, m.lon);
        m.el.style.transform = `translate(${p.x}px,${p.y}px)`;
      }
      svg.setAttribute('width', w); svg.setAttribute('height', h);
      for (const l of st.lines) {
        l.el.setAttribute('d', l.pts.map((q, i) => { const p = project(q[0], q[1]); return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(''));
      }
    }
    function setMarks(list) {
      markBox.textContent = ''; st.marks = list;
      for (const m of list) markBox.appendChild(m.el);
      render();
    }
    function zoomAt(nz, px, py) {
      nz = Math.max(MINZ, Math.min(MAXZ, nz));
      const { w, h } = size();
      if (px == null) { px = w / 2; py = h / 2; }
      const z = st.zoom;
      const gx = lon2x(st.lon, z) + (px - w / 2), gy = lat2y(st.lat, z) + (py - h / 2);
      const lon = x2lon(gx, z), lat = y2lat(gy, z);
      st.zoom = nz;
      st.lon = x2lon(lon2x(lon, nz) - (px - w / 2), nz);
      st.lat = y2lat(lat2y(lat, nz) - (py - h / 2), nz);
      render(); st.onMove(st);
    }
    function panBy(dx, dy) {
      const z = st.zoom;
      st.lon = x2lon(lon2x(st.lon, z) - dx, z);
      st.lat = y2lat(lat2y(st.lat, z) - dy, z);
      render();
    }

    // pointer handling: drag to pan, two-finger pinch to zoom
    const pts = new Map(); let pinch = null, moved = false;
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('.mark')) return;
      el.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = false;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: st.zoom };
      }
    });
    el.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (pts.size === 1) { if (Math.abs(dx) + Math.abs(dy) > 2) moved = true; panBy(dx, dy); }
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()]; const r = el.getBoundingClientRect();
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt(pinch.z + Math.log2(d / pinch.d), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      }
    });
    const end = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size && moved) st.onMove(st); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', e => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomAt(st.zoom - e.deltaY / 300, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    el.addEventListener('dblclick', e => { const r = el.getBoundingClientRect(); zoomAt(st.zoom + 1, e.clientX - r.left, e.clientY - r.top); });
    el.addEventListener('keydown', e => {
      const k = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] }[e.key];
      if (k) { e.preventDefault(); panBy(...k); st.onMove(st); }
      if (e.key === '+' || e.key === '=') zoomAt(st.zoom + 1);
      if (e.key === '-') zoomAt(st.zoom - 1);
    });
    new ResizeObserver(render).observe(el);

    return {
      state: st, render, setMarks, zoomAt, project,
      // lines: [{pts: [[lat, lon], ...], cls: 'css classes'}]
      setLines(list) {
        svg.textContent = '';
        st.lines = list.map(l => { const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('class', l.cls || ''); svg.appendChild(p); return { pts: l.pts, el: p }; });
        render();
      },
      setLayer(l) { st.layer = l; tilesEl.textContent = ''; tileImgs.clear(); render(); st.onMove(st); },
      center(lat, lon, z) { st.lat = lat; st.lon = lon; if (z) st.zoom = z; render(); },
    };
  }

  // list every tile URL needed to view the ranch offline
  function offlineUrls(layers) {
    const out = [];
    for (const layer of layers) for (let z = MINZ; z <= MAXNATIVE; z++) {
      const x0 = Math.floor(lon2x(BBOX.w, z) / TS), x1 = Math.floor(lon2x(BBOX.e, z) / TS);
      const y0 = Math.floor(lat2y(BBOX.n, z) / TS), y1 = Math.floor(lat2y(BBOX.s, z) / TS);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push(url(layer, z, x, y));
    }
    return out;
  }

  window.TopoMap = { create, offlineUrls, LAYERS };
})();
