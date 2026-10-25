(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SolarEarthClouds = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MINUTE = 60000;
  const DAY = 86400000;
  const endpoints = Object.freeze({
    goes: 'https://www.star.nesdis.noaa.gov/GOES/fulldisk_band.php?sat=G19&band=GEOCOLOR&length=12&dim=0',
    epic: 'https://epic.gsfc.nasa.gov/api/natural'
  });
  const cacheTimes = Object.freeze({ goes: 10 * MINUTE, epic: 30 * MINUTE });
  const goesPrefix = 'https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/GEOCOLOR/';

  function utcTime(value) {
    if (typeof value !== 'string') return NaN;
    let text = value.trim().replace(' ', 'T');
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/i);
    if (!match) return NaN;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6] || 0) > 59) return NaN;
    if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) text += 'Z';
    return Date.parse(text);
  }

  function reasonable(timestamp, now) {
    return Number.isFinite(timestamp) && timestamp <= now + 10 * MINUTE && timestamp >= now - 30 * DAY;
  }

  function goesSample(html, now) {
    if (typeof html !== 'string') return null;
    const at = now === undefined ? Date.now() : now;
    const links = /https:\/\/cdn\.star\.nesdis\.noaa\.gov\/GOES19\/ABI\/FD\/GEOCOLOR\/(\d{4})(\d{3})(\d{2})(\d{2})_GOES19-ABI-FD-GEOCOLOR-678x678\.jpg(?=[\s"'<>]|$)/g;
    let newest = null;
    let match;
    while ((match = links.exec(html))) {
      const year = Number(match[1]);
      const day = Number(match[2]);
      const hours = Number(match[3]);
      const minutes = Number(match[4]);
      const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      if (day < 1 || day > (leap ? 366 : 365) || hours > 23 || minutes > 59) continue;
      const capturedAt = Date.UTC(year, 0, day, hours, minutes);
      if (!reasonable(capturedAt, at) || (newest && capturedAt <= newest.capturedAt)) continue;
      newest = {
        source: 'goes',
        url: match[0],
        capturedAt: capturedAt,
        time: new Date(capturedAt).toISOString(),
        credit: 'CIRA/NOAA',
        description: 'GOES-19 view of the Americas. Daytime colors approximate visible light; nighttime clouds use infrared imagery over a static city-lights background.'
      };
    }
    return newest;
  }

  function epicSample(rows, now) {
    if (!Array.isArray(rows)) return null;
    const at = now === undefined ? Date.now() : now;
    let newest = null;
    rows.forEach(function (row) {
      if (!row || typeof row !== 'object' || typeof row.image !== 'string' || !/^epic_1b_\d+$/.test(row.image)) return;
      const capturedAt = utcTime(row.date);
      if (!reasonable(capturedAt, at) || (newest && capturedAt <= newest.capturedAt)) return;
      const date = new Date(capturedAt).toISOString().slice(0, 10).replace(/-/g, '/');
      newest = {
        source: 'epic',
        url: 'https://epic.gsfc.nasa.gov/archive/natural/' + date + '/jpg/' + row.image + '.jpg',
        capturedAt: capturedAt,
        time: new Date(capturedAt).toISOString(),
        credit: 'NASA EPIC Team / NOAA DSCOVR',
        description: 'NASA EPIC natural-color image of Earth\'s sunlit hemisphere. Publication can lag capture by days; this is not a current global weather map.'
      };
      const center = row.centroid_coordinates;
      if (center && typeof center.lat === 'number' && typeof center.lon === 'number' && Number.isFinite(center.lat) && Number.isFinite(center.lon) && Math.abs(center.lat) <= 90 && Math.abs(center.lon) <= 180) newest.center = { lat: center.lat, lon: center.lon };
    });
    return newest;
  }

  function createClient(options) {
    const settings = options || {};
    const fetcher = settings.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    const now = settings.now || Date.now;
    const schedule = settings.setTimeout || setTimeout;
    const cancel = settings.clearTimeout || clearTimeout;
    const timeoutMs = settings.timeoutMs === undefined ? 8000 : settings.timeoutMs;
    const last = new Map();
    const checked = new Map();
    const pending = new Map();
    async function download(source) {
      if (!fetcher) throw new Error('Image metadata cannot be fetched in this browser');
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      let timer;
      const timeout = new Promise(function (_, reject) {
        timer = schedule(function () {
          if (controller) controller.abort();
          reject(new Error('Earth-image metadata request timed out'));
        }, timeoutMs);
      });
      const request = (async function () {
        const response = await fetcher(endpoints[source], { signal: controller ? controller.signal : undefined, cache: 'no-cache' });
        if (!response || !response.ok) throw new Error('Earth-image metadata is unavailable');
        const sample = source === 'goes' ? goesSample(await response.text(), now()) : epicSample(await response.json(), now());
        if (!sample) throw new Error('No valid recent Earth image was published');
        return sample;
      })();
      try { return await Promise.race([request, timeout]); }
      finally { cancel(timer); }
    }
    function refresh(source, options) {
      const kind = source === undefined ? 'goes' : source;
      if (!Object.prototype.hasOwnProperty.call(endpoints, kind)) return Promise.reject(new Error('Unknown Earth-image source'));
      if (pending.has(kind)) return pending.get(kind);
      const force = Boolean(options && options.force);
      const checkedAt = checked.get(kind);
      if (!force && last.has(kind) && checkedAt !== undefined && now() >= checkedAt && now() - checkedAt < cacheTimes[kind]) return Promise.resolve(last.get(kind));
      const result = download(kind).then(function (sample) {
        // Keep the newer observation if an upstream cache briefly rolls back.
        if (!last.has(kind) || sample.capturedAt >= last.get(kind).capturedAt) last.set(kind, sample);
        checked.set(kind, now());
        return last.get(kind);
      }).finally(function () { pending.delete(kind); });
      pending.set(kind, result);
      return result;
    }
    return { refresh: refresh, getLast: function (source) { return last.get(source === undefined ? 'goes' : source) || null; } };
  }
  return { endpoints: endpoints, cacheTimes: cacheTimes, goesSample: goesSample, epicSample: epicSample, createClient: createClient };
});
