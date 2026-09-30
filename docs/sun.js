// Solar position for Horseshoe Canyon Ranch and sun/shade state by wall aspect.
(function () {
  const LAT = 36.005, LON = -93.29;
  const RAD = Math.PI / 180;
  const ASPECT = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };

  // date: JS Date (absolute instant). Returns {alt, az} in degrees.
  function position(date) {
    const d = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
    const g = ((357.529 + 0.98560028 * d) % 360) * RAD;
    const q = (280.459 + 0.98564736 * d) % 360;
    const L = ((q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) % 360) * RAD;
    const e = (23.439 - 0.00000036 * d) * RAD;
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
    const dec = Math.asin(Math.sin(e) * Math.sin(L));
    const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
    const ha = (gmst * 15 + LON) * RAD - ra;
    const lat = LAT * RAD;
    const alt = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha));
    const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(ha));
    return { alt: alt / RAD, az: ((az / RAD) + 360) % 360 };
  }

  // Central time for a local calendar date + decimal hour. Handles CDT/CST.
  function instant(ymd, hour) {
    const [y, m, d] = ymd.split('-').map(Number);
    const h = Math.floor(hour), mi = Math.round((hour - h) * 60);
    // CDT from 2nd Sun of March to 1st Sun of Nov
    const marSun = 8 + (7 - new Date(Date.UTC(y, 2, 8)).getUTCDay()) % 7;
    const novSun = 1 + (7 - new Date(Date.UTC(y, 10, 1)).getUTCDay()) % 7;
    const md = m * 100 + d;
    const dst = md > 300 + marSun && md < 1100 + novSun || (md === 300 + marSun && h >= 2) || (md === 1100 + novSun && h < 2);
    const offset = dst ? 5 : 6;
    return new Date(Date.UTC(y, m - 1, d, h + offset, mi));
  }

  // state: 'sun' | 'shade' | 'dark' | 'partial' | 'varies'
  function state(aspect, shady, ymd, hour) {
    const p = position(instant(ymd, hour));
    if (p.alt < -0.8) return 'dark';
    if (!(aspect in ASPECT)) return aspect === 'shade' ? 'shade' : 'varies';
    const onFace = p.alt > 5 && Math.cos((p.az - ASPECT[aspect]) * RAD) > 0.17;
    if (!onFace) return 'shade';
    return shady ? 'partial' : 'sun';
  }

  function daylight(ymd) {
    let rise = null, set = null;
    for (let m = 0; m < 24 * 60; m += 2) {
      const a = position(instant(ymd, m / 60)).alt;
      if (a > -0.83 && rise === null) rise = m / 60;
      if (a > -0.83) set = m / 60;
    }
    return { rise, set };
  }

  // windows of direct sun on a face, as [[startHour,endHour],...]
  function windows(aspect, ymd) {
    if (!(aspect in ASPECT)) return [];
    const out = []; let s = null, prev = null;
    for (let m = 0; m < 24 * 60; m += 5) {
      const h = m / 60, p = position(instant(ymd, h));
      const on = p.alt > 5 && Math.cos((p.az - ASPECT[aspect]) * RAD) > 0.17;
      if (on && s === null) s = h;
      if (!on && s !== null) { out.push([s, prev]); s = null; }
      prev = h;
    }
    if (s !== null) out.push([s, prev]);
    return out;
  }

  function fmt(h) {
    h = ((h % 24) + 24) % 24;
    let hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    if (mm === 60) { hh += 1; mm = 0; }
    const ap = hh < 12 || hh === 24 ? 'am' : 'pm';
    const h12 = hh % 12 || 12;
    return h12 + ':' + String(mm).padStart(2, '0') + ' ' + ap;
  }

  window.Sun = { position, instant, state, daylight, windows, fmt, ASPECT };
})();
