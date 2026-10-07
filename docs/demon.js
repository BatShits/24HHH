// The demon: opening screen (headlamp flickers on, eyes glow, he snarls, then hands off to the app).
// Loaded first thing in <body> so the splash covers the app while it starts. Tap to skip.
(function () {
  const SKIN = '#A3201C', COAL = '#171211', BONE = '#F3E9DC', GOLD = '#F2A541';
  const EYE_L = 'M178 307 L242 324 Q218 335 192 325 Z', EYE_R = 'M334 307 L270 324 Q294 335 320 325 Z';
  const closedMouth = `<path d="M198 400 Q256 396 314 400" fill="none" stroke="${COAL}" stroke-width="9" stroke-linecap="round"/>` +
    `<path d="M215 400 L232 399 L224 430 Z" fill="${BONE}"/><path d="M297 400 L280 399 L288 430 Z" fill="${BONE}"/>`;
  const openMouth = `<path d="M192 392 Q256 370 320 392 L306 432 Q256 456 206 432 Z" fill="${COAL}"/>` +
    ['M206 391 L224 388 L215 424', 'M230 385 L245 383 L237 401', 'M249 382 L263 382 L256 399', 'M267 383 L282 385 L275 401', 'M288 388 L306 391 L297 424',
      'M228 438 L244 442 L236 424', 'M248 443 L264 443 L256 428', 'M268 442 L284 438 L276 424'].map(d => `<path d="${d} Z" fill="${BONE}"/>`).join('');
  // head; mouth: 'open' | 'closed' | 'both' (both = animated); lit: lamp and eyes on (else they animate on)
  function svg({ size = 300, mouth = 'open', anim = false, label = 'Horseshoe Hell demon' } = {}) {
    const lamp = anim ? `<circle cx="256" cy="241" r="19" fill="#3A302C"/><circle class="dm-lamp" cx="256" cy="241" r="19" fill="${GOLD}"/>` : `<circle cx="256" cy="241" r="19" fill="${GOLD}"/>`;
    const eyes = anim ? `<path d="${EYE_L}" fill="#4A1512"/><path d="${EYE_R}" fill="#4A1512"/><g class="dm-eyes"><path d="${EYE_L}" fill="${GOLD}"/><path d="${EYE_R}" fill="${GOLD}"/></g>`
      : `<path d="${EYE_L}" fill="${GOLD}"/><path d="${EYE_R}" fill="${GOLD}"/>`;
    const m = mouth === 'both' ? `<g class="dm-closed">${closedMouth}</g><g class="dm-open">${openMouth}</g>` : mouth === 'open' ? openMouth : closedMouth;
    return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">` +
      `<g transform="translate(256 256) scale(1.1) translate(-256 -282)">` +
      `<path d="M170 218 C140 184 128 136 140 82 C164 128 196 158 224 180 Z" fill="${SKIN}"/>` +
      `<path d="M131 126 L146 136 L139 145 L158 150 L152 161 L172 166" fill="none" stroke="${COAL}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M146 136 L156 128" fill="none" stroke="${COAL}" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M342 218 C372 184 384 136 372 82 C348 128 316 158 288 180 Z" fill="${SKIN}"/>` +
      `<path d="M256 482 C196 454 134 398 134 306 C134 218 186 168 256 168 C326 168 378 218 378 306 C378 398 316 454 256 482 Z" fill="${SKIN}"/>` +
      `<rect x="136" y="232" width="240" height="26" fill="${COAL}"/><rect x="222" y="210" width="68" height="62" rx="14" fill="${BONE}"/>` + lamp +
      `<path d="M168 275 L248 299 L245 309 L170 287 Z" fill="${COAL}"/><path d="M344 275 L264 299 L267 309 L342 287 Z" fill="${COAL}"/>` + eyes +
      `<ellipse cx="214" cy="321" rx="4" ry="6" fill="${COAL}"/><ellipse cx="298" cy="321" rx="4" ry="6" fill="${COAL}"/>` +
      `<path d="M232 352 L256 362 L280 352" fill="none" stroke="${COAL}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>` + m +
      `</g>` + (anim ? `<circle class="dm-glow" cx="256" cy="211" r="58" fill="${GOLD}"/>` : '') + `</svg>`;
  }

  // ---- opening screen ----
  function splash() {
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const d = document.createElement('div');
    d.id = 'splash'; d.className = reduce ? 'calm' : ''; d.setAttribute('role', 'presentation');
    d.innerHTML = `<div class="sp-stage">${svg({ size: 240, mouth: 'both', anim: !reduce, label: 'The demon wakes up' })}` +
      `<div class="sp-title">HORSESHOE HELL</div><div class="sp-sub">FIELD GUIDE</div></div>`;
    document.body.appendChild(d);
    let gone = false;
    const end = () => { if (gone) return; gone = true; d.classList.add('out'); setTimeout(() => d.remove(), 350); };
    d.addEventListener('click', end);
    setTimeout(end, reduce ? 1400 : 3400);
  }

  window.Demon = { svg, splash };
  if (document.body) splash(); else document.addEventListener('DOMContentLoaded', splash);
})();
