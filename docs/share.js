// Plan sharing: pack a plan (plus both climber profiles) into a short code, show it as a QR code, scan one back in.
// Works offline. Uses vendor/qrcode.js to draw codes and BarcodeDetector or vendor/jsQR.js to read them.
(function () {
  const b64u = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = str => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };
  const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

  // plan -> compact object: routes as [id, who, minutes-after-start done], who 0 both / 1 me / 2 partner
  function pack(plan, profiles, from) {
    const p = Object.assign({}, plan); delete p.items;
    const it = plan.items.map(x => {
      if (!x.rid) return x;
      const id = /^c\d+$/.test(x.rid) ? +x.rid.slice(1) : x.rid;
      const w = x.who && x.who.length === 1 ? (x.who[0] === 'me' ? 1 : 2) : 0;
      if (!x.done) return w ? [id, w] : id;
      const [y, m, d] = plan.date.split('-').map(Number);
      const mins = Math.round((new Date(x.done) - new Date(Date.UTC(y, m - 1, d))) / 60000); // minutes after plan-date midnight UTC
      return [id, w, mins];
    });
    return { v: 1, from, p, it, pr: profiles };
  }
  function unpack(o) {
    if (!o || o.v !== 1 || !o.p || !Array.isArray(o.it)) throw new Error('not a plan');
    const plan = Object.assign({}, o.p);
    const [y, m, d] = plan.date.split('-').map(Number);
    plan.items = o.it.map(x => {
      if (x && typeof x === 'object' && !Array.isArray(x)) return x;
      const [id, w = 0, mins] = Array.isArray(x) ? x : [x];
      const it = { rid: typeof id === 'number' ? 'c' + id : id, who: w === 1 ? ['me'] : w === 2 ? ['partner'] : ['me', 'partner'] };
      if (mins != null) it.done = new Date(Date.UTC(y, m - 1, d) + mins * 60000).toISOString();
      return it;
    });
    return { plan, profiles: o.pr || null, from: o.from || '' };
  }
  async function encode(plan, profiles, from) {
    const bytes = new TextEncoder().encode(JSON.stringify(pack(plan, profiles, from)));
    if (window.CompressionStream) { try { return 'z' + b64u(await pipe(bytes, new CompressionStream('deflate-raw'))); } catch (e) { /* fall through */ } }
    return 'j' + b64u(bytes);
  }
  async function decode(text) {
    const m = String(text || '').trim().match(/(?:#p=|^)([zj])([A-Za-z0-9_-]+)\s*$/);
    if (!m) throw new Error('no code');
    let bytes = unb64u(m[2]);
    if (m[1] === 'z') { if (!window.DecompressionStream) throw new Error('This browser is too old to open shared plans.'); bytes = await pipe(bytes, new DecompressionStream('deflate-raw')); }
    return unpack(JSON.parse(new TextDecoder().decode(bytes)));
  }
  const linkFor = code => location.origin + location.pathname.replace(/[^/]*$/, '') + '#p=' + code;

  function qrSvg(text) {
    const q = window.qrcode(0, 'L'); q.addData(text, 'Byte'); q.make();
    return q.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  }

  // camera scanner: resolves with the decoded text, or null if closed
  function scan(dlg, video, statusEl) {
    return new Promise(async resolve => {
      let stream = null, timer = 0, done = false;
      const finish = v => { if (done) return; done = true; clearInterval(timer); if (stream) stream.getTracks().forEach(t => t.stop()); video.srcObject = null; resolve(v); };
      dlg.addEventListener('close', () => finish(null), { once: true });
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); }
      catch (e) { statusEl.textContent = 'Camera not available. Paste the shared link below instead.'; return; }
      video.srcObject = stream; video.setAttribute('playsinline', ''); video.muted = true; await video.play().catch(() => {});
      let det = null;
      try { if ('BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats()).includes('qr_code')) det = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { det = null; }
      const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
      statusEl.textContent = 'Point the camera at the plan\'s QR code.';
      let busy = false;
      timer = setInterval(async () => {
        if (busy || !video.videoWidth) return; busy = true;
        try {
          if (det) { const r = await det.detect(video); if (r.length) return finish(r[0].rawValue); }
          else if (window.jsQR) {
            const s = Math.min(1, 800 / Math.max(video.videoWidth, video.videoHeight));
            cv.width = Math.round(video.videoWidth * s); cv.height = Math.round(video.videoHeight * s);
            cx.drawImage(video, 0, 0, cv.width, cv.height);
            const r = window.jsQR(cx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, { inversionAttempts: 'dontInvert' });
            if (r && r.data) return finish(r.data);
          }
        } catch (e) { /* keep trying */ } finally { busy = false; }
      }, 250);
    });
  }

  window.PlanShare = { encode, decode, linkFor, qrSvg, scan };
})();
