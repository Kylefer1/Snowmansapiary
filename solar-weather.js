(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SolarWeather = api;
    if (root.document) {
      const start = function () { api.mount(root.document, root); };
      if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once: true });
      else start();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MINUTE = 60000;
  const ENDPOINTS = Object.freeze({
    wind: 'https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json',
    field: 'https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json',
    kp: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json'
  });
  const MAX_AGE = Object.freeze({ wind: 30 * MINUTE, field: 30 * MINUTE, kp: 6 * 60 * MINUTE });
  const VALUE_KEYS = { wind: ['proton_speed', 'speed'], field: ['bz_gsm', 'bz'], kp: ['kp', 'estimated_kp'] };

  function utcTime(value) {
    if (typeof value !== 'string' || !value.trim()) return NaN;
    let text = value.trim().replace(' ', 'T');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/i.test(text)) return NaN;
    const pieces = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    const year = Number(pieces[1]);
    const month = Number(pieces[2]);
    const day = Number(pieces[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || Number(pieces[4]) > 23 || Number(pieces[5]) > 59) return NaN;
    if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) text += 'Z';
    return Date.parse(text);
  }

  function rowsOf(payload) {
    if (!Array.isArray(payload)) return payload && typeof payload === 'object' ? [payload] : [];
    if (!payload.length) return [];
    if (Array.isArray(payload[0])) {
      const header = payload[0];
      return payload.slice(1).filter(Array.isArray).map(function (row) {
        const result = {};
        header.forEach(function (key, index) { result[String(key).toLowerCase()] = row[index]; });
        return result;
      });
    }
    return payload.filter(function (row) { return row && typeof row === 'object' && !Array.isArray(row); });
  }

  function numeric(value) {
    if (value === null || value === undefined || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) return NaN;
    const result = Number(value);
    return Number.isFinite(result) ? result : NaN;
  }

  function latest(kind, payload, now) {
    if (!VALUE_KEYS[kind]) throw new Error('Unknown space-weather reading');
    const at = now === undefined ? Date.now() : now;
    let newest = null;
    rowsOf(payload).forEach(function (raw) {
      const row = {};
      Object.keys(raw).forEach(function (key) { row[key.toLowerCase()] = raw[key]; });
      const timestamp = utcTime(row.time_tag || row.timestamp || row.time);
      const key = VALUE_KEYS[kind].find(function (name) { return Object.prototype.hasOwnProperty.call(row, name); });
      const value = numeric(key === undefined ? undefined : row[key]);
      const valid = Number.isFinite(value) && (kind === 'wind' ? value > 0 && value <= 5000 : kind === 'kp' ? value >= 0 && value <= 9 : Math.abs(value) <= 2000);
      if (!valid || !Number.isFinite(timestamp) || timestamp > at + 5 * MINUTE) return;
      if (!newest || timestamp > newest.timestamp) newest = { value: value, timestamp: timestamp, time: new Date(timestamp).toISOString() };
    });
    return newest;
  }

  function isStale(kind, reading, now) {
    return !reading || !Number.isFinite(reading.timestamp) || (now === undefined ? Date.now() : now) - reading.timestamp > MAX_AGE[kind];
  }

  function createClient(options) {
    const settings = options || {};
    const fetcher = settings.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    const now = settings.now || Date.now;
    const schedule = settings.setTimeout || setTimeout;
    const cancel = settings.clearTimeout || clearTimeout;
    const cacheMs = settings.cacheMs === undefined ? 5 * MINUTE : settings.cacheMs;
    const timeoutMs = settings.timeoutMs === undefined ? 8000 : settings.timeoutMs;
    const readings = {};
    let checkedAt = null;
    let errors = [];
    let inFlight = null;
    function snapshot(fromCache) {
      return { readings: Object.assign({}, readings), errors: errors.slice(), checkedAt: checkedAt, fromCache: Boolean(fromCache) };
    }
    async function request(kind) {
      if (!fetcher) throw new Error('Fetch is unavailable');
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      let timer;
      const timeout = new Promise(function (_, reject) {
        timer = schedule(function () {
          if (controller) controller.abort();
          reject(new Error('Space-weather request timed out'));
        }, timeoutMs);
      });
      const download = (async function () {
        const response = await fetcher(ENDPOINTS[kind], { signal: controller ? controller.signal : undefined, cache: 'no-cache' });
        if (!response || !response.ok) throw new Error('Space-weather feed is unavailable');
        const reading = latest(kind, await response.json(), now());
        if (!reading) throw new Error('Space-weather feed contains no valid readings');
        return reading;
      })();
      try { return await Promise.race([download, timeout]); }
      finally { cancel(timer); }
    }
    function refresh(options) {
      const force = Boolean(options && options.force);
      if (inFlight) return inFlight;
      if (!force && checkedAt !== null && now() >= checkedAt && now() - checkedAt < cacheMs) return Promise.resolve(snapshot(true));
      const keys = Object.keys(ENDPOINTS);
      inFlight = (async function () {
        const results = await Promise.allSettled(keys.map(request));
        errors = [];
        results.forEach(function (result, index) {
          const kind = keys[index];
          if (result.status === 'fulfilled') {
            // A temporary upstream rollback should not replace a newer observation.
            if (!readings[kind] || result.value.timestamp >= readings[kind].timestamp) readings[kind] = result.value;
          } else errors.push(kind);
        });
        checkedAt = now();
        return snapshot(false);
      })().finally(function () { inFlight = null; });
      return inFlight;
    }
    return { refresh: refresh, snapshot: function () { return snapshot(false); } };
  }

  function formatTime(timestamp) {
    return new Date(timestamp).toISOString().replace('T', ' ').replace(/:\d{2}\.\d{3}Z$/, ' UTC');
  }

  function mount(doc, environment) {
    const env = environment || (typeof globalThis !== 'undefined' ? globalThis : {});
    const panel = doc.getElementById('weatherPanel');
    if (!panel) return null;
    if (panel.__solarWeather) return panel.__solarWeather;
    const button = doc.getElementById('weatherRefresh');
    const status = doc.getElementById('weatherStatus');
    const nodes = {
      wind: [doc.getElementById('windValue'), doc.getElementById('windTime')],
      field: [doc.getElementById('fieldValue'), doc.getElementById('fieldTime')],
      kp: [doc.getElementById('kpValue'), doc.getElementById('kpTime')]
    };
    if (!button || !status || Object.values(nodes).some(function (pair) { return !pair[0] || !pair[1]; })) return null;
    const now = env.Date && env.Date.now ? env.Date.now.bind(env.Date) : Date.now;
    const client = createClient({ fetch: typeof env.fetch === 'function' ? env.fetch.bind(env) : null, now: now });
    let activated = false;
    let inView = false;
    let busy = false;
    let disposed = false;
    let observer;
    function paint(result) {
      let oldCount = 0;
      Object.keys(nodes).forEach(function (kind) {
        const reading = result.readings[kind];
        const valueNode = nodes[kind][0];
        const timeNode = nodes[kind][1];
        if (!reading) {
          valueNode.textContent = 'Unavailable';
          timeNode.textContent = 'No observation received';
          timeNode.removeAttribute('datetime');
          return;
        }
        const old = isStale(kind, reading, now());
        if (old) oldCount++;
        valueNode.textContent = kind === 'wind' ? Math.round(reading.value) + ' km/s' : kind === 'field' ? (reading.value > 0 ? '+' : '') + reading.value + ' nT' + (reading.value < 0 ? ' (southward)' : reading.value > 0 ? ' (northward)' : '') : String(Number(reading.value.toFixed(2)));
        timeNode.dateTime = reading.time;
        const prefix = old || result.errors.includes(kind) ? 'Last available: ' : kind === 'kp' ? '3-hour period beginning ' : 'Observed ';
        timeNode.textContent = prefix + formatTime(reading.timestamp) + (kind === 'kp' && (old || result.errors.includes(kind)) ? ' (3-hour period start)' : '');
      });
      const received = Object.keys(result.readings).length;
      if (!received) status.textContent = 'NOAA readings are unavailable right now. Try refreshing later.';
      else if (result.errors.length) status.textContent = 'Some NOAA feeds are unavailable. Shown readings retain their original observation times.';
      else if (oldCount) status.textContent = 'Checked ' + formatTime(result.checkedAt) + '. Some observations are older than expected; their times are shown above.';
      else status.textContent = 'NOAA readings checked ' + formatTime(result.checkedAt) + '. Kp describes a three-hour interval. These readings do not guarantee visible auroras.';
    }
    async function refresh(force) {
      if (disposed || busy || doc.hidden) return;
      activated = true;
      busy = true;
      button.disabled = true;
      panel.setAttribute('aria-busy', 'true');
      status.textContent = 'Checking NOAA for the latest published readings...';
      try {
        const result = await client.refresh({ force: Boolean(force) });
        if (!disposed) paint(result);
      } finally {
        busy = false;
        if (!disposed) {
          button.disabled = false;
          panel.setAttribute('aria-busy', 'false');
        }
      }
    }
    const onClick = function () { refresh(true); };
    const onVisibility = function () { if (!doc.hidden && activated && inView) refresh(false); };
    button.addEventListener('click', onClick);
    doc.addEventListener('visibilitychange', onVisibility);
    if (typeof env.IntersectionObserver === 'function') {
      observer = new env.IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.target === panel) {
            inView = entry.isIntersecting;
            if (inView) refresh(false);
          }
        });
      }, { rootMargin: '100px' });
      observer.observe(panel);
    } else { inView = true; refresh(false); }
    const interval = env.setInterval ? env.setInterval(function () {
      if (activated && inView && !doc.hidden) refresh(false);
    }, 5 * MINUTE) : null;
    const mounted = {
      client: client,
      refresh: refresh,
      dispose: function () {
        disposed = true;
        if (observer) observer.disconnect();
        if (interval !== null && env.clearInterval) env.clearInterval(interval);
        button.removeEventListener('click', onClick);
        doc.removeEventListener('visibilitychange', onVisibility);
        delete panel.__solarWeather;
      }
    };
    panel.__solarWeather = mounted;
    return mounted;
  }
  return { endpoints: ENDPOINTS, maxAge: MAX_AGE, utcTime: utcTime, latest: latest, isStale: isStale, createClient: createClient, mount: mount };
});
