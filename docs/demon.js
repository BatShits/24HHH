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

  // the angel: a woman with long auburn hair, a halo, wings and her own headlamp
  function angel({ size = 120, label = 'Angel' } = {}) {
    const HAIR = '#B4441C';
    return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">` +
      `<ellipse cx="-34" cy="350" rx="240" ry="18" transform="rotate(105 -34 350)" fill="#E4D8C4" stroke="#B9A88C" stroke-width="2"/><ellipse cx="-5" cy="336" rx="226" ry="18" transform="rotate(104 -5 336)" fill="#E4D8C4" stroke="#B9A88C" stroke-width="2"/><ellipse cx="22" cy="326" rx="213" ry="18" transform="rotate(103 22 326)" fill="#E4D8C4" stroke="#B9A88C" stroke-width="2"/><ellipse cx="48" cy="320" rx="199" ry="18" transform="rotate(102 48 320)" fill="#E4D8C4" stroke="#B9A88C" stroke-width="2"/><ellipse cx="72" cy="318" rx="186" ry="18" transform="rotate(101 72 318)" fill="#E4D8C4" stroke="#B9A88C" stroke-width="2"/><ellipse cx="94" cy="319" rx="172" ry="18" transform="rotate(100 94 319)" fill="#E4D8C4" stroke="#B9A88C" stroke-width="2"/><ellipse cx="114" cy="325" rx="159" ry="18" transform="rotate(99 114 325)" fill="#E4D8C4" stroke="#B9A88C" stroke-width="2"/><ellipse cx="133" cy="334" rx="145" ry="18" transform="rotate(98 133 334)" fill="#E4D8C4" stroke="#B9A88C" stroke-width="2"/><ellipse cx="150" cy="348" rx="132" ry="18" transform="rotate(97 150 348)" fill="#E4D8C4" stroke="#B9A88C" stroke-width="2"/><ellipse cx="165" cy="365" rx="118" ry="18" transform="rotate(96 165 365)" fill="#E4D8C4" stroke="#B9A88C" stroke-width="2"/><ellipse cx="178" cy="386" rx="105" ry="18" transform="rotate(95 178 386)" fill="#E4D8C4" stroke="#B9A88C" stroke-width="2"/><ellipse cx="-9" cy="211" rx="100" ry="20" transform="rotate(112 -9 211)" fill="#F0E7D8" stroke="#C9B99E" stroke-width="2"/><ellipse cx="16" cy="205" rx="95" ry="20" transform="rotate(111 16 205)" fill="#F0E7D8" stroke="#C9B99E" stroke-width="2"/><ellipse cx="40" cy="203" rx="90" ry="20" transform="rotate(110 40 203)" fill="#F0E7D8" stroke="#C9B99E" stroke-width="2"/><ellipse cx="62" cy="206" rx="85" ry="20" transform="rotate(109 62 206)" fill="#F0E7D8" stroke="#C9B99E" stroke-width="2"/><ellipse cx="83" cy="212" rx="80" ry="20" transform="rotate(107 83 212)" fill="#F0E7D8" stroke="#C9B99E" stroke-width="2"/><ellipse cx="103" cy="222" rx="75" ry="20" transform="rotate(106 103 222)" fill="#F0E7D8" stroke="#C9B99E" stroke-width="2"/><ellipse cx="121" cy="236" rx="70" ry="20" transform="rotate(105 121 236)" fill="#F0E7D8" stroke="#C9B99E" stroke-width="2"/><ellipse cx="137" cy="254" rx="66" ry="20" transform="rotate(104 137 254)" fill="#F0E7D8" stroke="#C9B99E" stroke-width="2"/><ellipse cx="153" cy="276" rx="61" ry="20" transform="rotate(103 153 276)" fill="#F0E7D8" stroke="#C9B99E" stroke-width="2"/><ellipse cx="166" cy="302" rx="56" ry="20" transform="rotate(102 166 302)" fill="#F0E7D8" stroke="#C9B99E" stroke-width="2"/><ellipse cx="178" cy="332" rx="51" ry="20" transform="rotate(101 178 332)" fill="#F0E7D8" stroke="#C9B99E" stroke-width="2"/><ellipse cx="0" cy="151" rx="43" ry="20" transform="rotate(130 0 151)" fill="#FAF5EC" stroke="#D8CAB3" stroke-width="2"/><ellipse cx="47" cy="150" rx="40" ry="20" transform="rotate(127 47 150)" fill="#FAF5EC" stroke="#D8CAB3" stroke-width="2"/><ellipse cx="87" cy="166" rx="36" ry="20" transform="rotate(123 87 166)" fill="#FAF5EC" stroke="#D8CAB3" stroke-width="2"/><ellipse cx="123" cy="197" rx="33" ry="20" transform="rotate(120 123 197)" fill="#FAF5EC" stroke="#D8CAB3" stroke-width="2"/><ellipse cx="152" cy="244" rx="30" ry="20" transform="rotate(117 152 244)" fill="#FAF5EC" stroke="#D8CAB3" stroke-width="2"/><ellipse cx="177" cy="306" rx="27" ry="20" transform="rotate(114 177 306)" fill="#FAF5EC" stroke="#D8CAB3" stroke-width="2"/><polyline points="185,273 179,252 172,233 165,215 157,198 149,183 141,170 132,158 122,148 112,139 101,131 90,125 79,121 67,118 54,116 41,116 28,118" fill="none" stroke="#FAF5EC" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="546" cy="350" rx="240" ry="18" transform="rotate(75 546 350)" fill="#E4D8C4" stroke="#B9A88C" stroke-width="2"/><ellipse cx="517" cy="336" rx="226" ry="18" transform="rotate(76 517 336)" fill="#E4D8C4" stroke="#B9A88C" stroke-width="2"/><ellipse cx="490" cy="326" rx="213" ry="18" transform="rotate(77 490 326)" fill="#E4D8C4" stroke="#B9A88C" stroke-width="2"/><ellipse cx="464" cy="320" rx="199" ry="18" transform="rotate(78 464 320)" fill="#E4D8C4" stroke="#B9A88C" stroke-width="2"/><ellipse cx="440" cy="318" rx="186" ry="18" transform="rotate(79 440 318)" fill="#E4D8C4" stroke="#B9A88C" stroke-width="2"/><ellipse cx="418" cy="319" rx="172" ry="18" transform="rotate(80 418 319)" fill="#E4D8C4" stroke="#B9A88C" stroke-width="2"/><ellipse cx="398" cy="325" rx="159" ry="18" transform="rotate(81 398 325)" fill="#E4D8C4" stroke="#B9A88C" stroke-width="2"/><ellipse cx="379" cy="334" rx="145" ry="18" transform="rotate(82 379 334)" fill="#E4D8C4" stroke="#B9A88C" stroke-width="2"/><ellipse cx="362" cy="348" rx="132" ry="18" transform="rotate(83 362 348)" fill="#E4D8C4" stroke="#B9A88C" stroke-width="2"/><ellipse cx="347" cy="365" rx="118" ry="18" transform="rotate(84 347 365)" fill="#E4D8C4" stroke="#B9A88C" stroke-width="2"/><ellipse cx="334" cy="386" rx="105" ry="18" transform="rotate(85 334 386)" fill="#E4D8C4" stroke="#B9A88C" stroke-width="2"/><ellipse cx="521" cy="211" rx="100" ry="20" transform="rotate(68 521 211)" fill="#F0E7D8" stroke="#C9B99E" stroke-width="2"/><ellipse cx="496" cy="205" rx="95" ry="20" transform="rotate(69 496 205)" fill="#F0E7D8" stroke="#C9B99E" stroke-width="2"/><ellipse cx="472" cy="203" rx="90" ry="20" transform="rotate(70 472 203)" fill="#F0E7D8" stroke="#C9B99E" stroke-width="2"/><ellipse cx="450" cy="206" rx="85" ry="20" transform="rotate(71 450 206)" fill="#F0E7D8" stroke="#C9B99E" stroke-width="2"/><ellipse cx="429" cy="212" rx="80" ry="20" transform="rotate(73 429 212)" fill="#F0E7D8" stroke="#C9B99E" stroke-width="2"/><ellipse cx="409" cy="222" rx="75" ry="20" transform="rotate(74 409 222)" fill="#F0E7D8" stroke="#C9B99E" stroke-width="2"/><ellipse cx="391" cy="236" rx="70" ry="20" transform="rotate(75 391 236)" fill="#F0E7D8" stroke="#C9B99E" stroke-width="2"/><ellipse cx="375" cy="254" rx="66" ry="20" transform="rotate(76 375 254)" fill="#F0E7D8" stroke="#C9B99E" stroke-width="2"/><ellipse cx="359" cy="276" rx="61" ry="20" transform="rotate(77 359 276)" fill="#F0E7D8" stroke="#C9B99E" stroke-width="2"/><ellipse cx="346" cy="302" rx="56" ry="20" transform="rotate(78 346 302)" fill="#F0E7D8" stroke="#C9B99E" stroke-width="2"/><ellipse cx="334" cy="332" rx="51" ry="20" transform="rotate(79 334 332)" fill="#F0E7D8" stroke="#C9B99E" stroke-width="2"/><ellipse cx="512" cy="151" rx="43" ry="20" transform="rotate(50 512 151)" fill="#FAF5EC" stroke="#D8CAB3" stroke-width="2"/><ellipse cx="465" cy="150" rx="40" ry="20" transform="rotate(53 465 150)" fill="#FAF5EC" stroke="#D8CAB3" stroke-width="2"/><ellipse cx="425" cy="166" rx="36" ry="20" transform="rotate(57 425 166)" fill="#FAF5EC" stroke="#D8CAB3" stroke-width="2"/><ellipse cx="389" cy="197" rx="33" ry="20" transform="rotate(60 389 197)" fill="#FAF5EC" stroke="#D8CAB3" stroke-width="2"/><ellipse cx="360" cy="244" rx="30" ry="20" transform="rotate(63 360 244)" fill="#FAF5EC" stroke="#D8CAB3" stroke-width="2"/><ellipse cx="335" cy="306" rx="27" ry="20" transform="rotate(66 335 306)" fill="#FAF5EC" stroke="#D8CAB3" stroke-width="2"/><polyline points="327,273 333,252 340,233 347,215 355,198 363,183 371,170 380,158 390,148 400,139 411,131 422,125 433,121 445,118 458,116 471,116 484,118" fill="none" stroke="#FAF5EC" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<ellipse cx="256" cy="72" rx="96" ry="22" fill="none" stroke="${GOLD}" stroke-width="14"/>` +
      `<path d="M256 96 C160 96 112 172 112 272 C112 362 98 432 74 512 L438 512 C414 432 400 362 400 272 C400 172 352 96 256 96 Z" fill="${HAIR}"/>` +
      `<path d="M224 368 L288 368 L296 486 L216 486 Z" fill="#E3B694"/>` +
      `<path d="M108 512 C122 462 176 438 222 432 Q256 474 290 432 C336 438 390 462 404 512 Z" fill="${BONE}"/>` +
      `<path d="M256 394 C204 394 170 346 168 286 C166 214 204 166 256 166 C308 166 346 214 344 286 C342 346 308 394 256 394 Z" fill="#EBC2A2"/>` +
      `<path d="M170 232 C220 214 292 214 342 232 L342 250 C292 232 220 232 170 250 Z" fill="#2B4A5E"/>` +
      `<path d="M166 276 C160 190 208 138 268 140 C320 142 352 186 350 252 C332 212 302 196 262 194 C226 210 194 238 166 276 Z" fill="${HAIR}"/>` +
      `<path d="M168 290 C164 250 168 236 176 226 L180 300 Z M344 290 C348 250 344 236 336 226 L332 300 Z" fill="${HAIR}"/>` +
      `<rect x="230" y="206" width="52" height="40" rx="10" fill="${BONE}"/><circle cx="256" cy="226" r="13" fill="${GOLD}"/>` +
      `<path d="M192 282 Q214 270 236 278" fill="none" stroke="#9A3A18" stroke-width="5" stroke-linecap="round"/>` +
      `<path d="M276 278 Q298 270 320 282" fill="none" stroke="#9A3A18" stroke-width="5" stroke-linecap="round"/>` +
      `<path d="M196 302 Q214 288 234 302 Q214 313 196 302 Z" fill="#FFFFFF"/><path d="M278 302 Q298 288 316 302 Q298 313 278 302 Z" fill="#FFFFFF"/>` +
      `<circle cx="215" cy="301" r="8" fill="#3E6E8E"/><circle cx="297" cy="301" r="8" fill="#3E6E8E"/>` +
      `<circle cx="215" cy="301" r="3.5" fill="#1B1412"/><circle cx="297" cy="301" r="3.5" fill="#1B1412"/>` +
      `<circle cx="218" cy="298" r="2" fill="#FFFFFF"/><circle cx="300" cy="298" r="2" fill="#FFFFFF"/>` +
      `<path d="M190 302 Q214 282 238 300" fill="none" stroke="#2A1A14" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M274 300 Q298 282 322 302" fill="none" stroke="#2A1A14" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M192 300 L182 293 M196 296 L189 288 M320 300 L330 293 M316 296 L323 288" fill="none" stroke="#2A1A14" stroke-width="3" stroke-linecap="round"/>` +
      `<circle cx="198" cy="336" r="16" fill="#E39A86" fill-opacity="0.35"/><circle cx="314" cy="336" r="16" fill="#E39A86" fill-opacity="0.35"/>` +
      `<path d="M256 306 Q252 330 248 338 Q256 344 264 338" fill="none" stroke="#C99A7E" stroke-width="3" stroke-linecap="round"/>` +
      `<path d="M232 362 Q245 353 256 359 Q267 353 280 362 Q256 367 232 362 Z" fill="#B84A52"/>` +
      `<path d="M232 362 Q256 384 280 362 Q256 369 232 362 Z" fill="#CF6468"/></svg>`;
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
    setTimeout(end, reduce ? 1800 : 5000);
  }

  window.Demon = { svg, angel, splash };
  if (document.body) splash(); else document.addEventListener('DOMContentLoaded', splash);
})();
