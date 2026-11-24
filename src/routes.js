// src/routes.js
// REST bridge untuk aplikasi MIT App Inventor.
//
// Kontrak dengan blok App Inventor (project SmartRoom #16477254):
//   GET  /api/mobile/values?token=...  -> teks polos "a|b|c|..." (1 field per sensor/aktuator)
//   POST /api/mobile/cmd?token=...      -> { actuator, state, override_s }
//   POST /api/mobile/config?token=...   -> { interval_live_s, interval_log_s, thr:{...} }
//
// Keamanan: header X-Mobile-Token ATAU query ?token= harus sama dengan MOBILE_TOKEN.
// Kalau MOBILE_TOKEN kosong -> 503 (tidak ada kontrol alat tanpa kunci).

const express = require('express');
const config = require('./config');
const mqtt = require('./mqtt-cache');

const router = express.Router();

const ACTUATORS = ['fan', 'ac', 'heater', 'window', 'lamp'];
const CMD_STATES = ['on', 'off', 'open', 'close'];

const CONFIG_DEFAULTS = {
  interval_live_s: 10,
  interval_log_s: 300,
  mode: 'manual',
  thr: {
    temp_max: 28,
    temp_min: 20,
    gas_max: 600,
    noise_max: 500,
    light_min: 100,
  },
};

// Rentang identik dengan ConfigSection web (smart-room-iot).
const THR_RULES = {
  temp_max: (v) => v >= 10 && v <= 60,
  temp_min: (v) => v >= -10 && v <= 45,
  gas_max: (v) => v >= 0 && v <= 10000,
  noise_max: (v) => v >= 0 && v <= 5000,
  light_min: (v) => v >= 0 && v <= 100000,
};

// ---------------------------------------------------------------- middleware
const hits = new Map(); // ip -> { n, reset }

function rateLimit(req, res, next) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  let slot = hits.get(ip);
  if (!slot || now > slot.reset) {
    slot = { n: 0, reset: now + 10000 };
  }
  slot.n += 1;
  hits.set(ip, slot);
  if (slot.n > 60) {
    return res.status(429).json({ ok: false, error: 'rate_limited' });
  }
  return next();
}

function requireToken(req, res, next) {
  if (!config.mobileToken) {
    return res.status(503).json({ ok: false, error: 'token_not_configured' });
  }
  const given = req.headers['x-mobile-token'] || req.query.token || '';
  if (given !== config.mobileToken) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  return next();
}

function currentConfig() {
  const remote = mqtt.getLast('config');
  if (!remote || typeof remote !== 'object') return { ...CONFIG_DEFAULTS, thr: { ...CONFIG_DEFAULTS.thr } };
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

  // K2: config bisa berbentuk nested ({thr:{...}}) atau flat (kunci langsung).
  const remoteThr = remote.thr && typeof remote.thr === 'object' ? remote.thr : {};
  const thr = { ...CONFIG_DEFAULTS.thr };
  for (const key of Object.keys(CONFIG_DEFAULTS.thr)) {
    if (remoteThr[key] !== undefined) thr[key] = num(remoteThr[key], thr[key]);
    else if (remote[key] !== undefined) thr[key] = num(remote[key], thr[key]);
  }

  return {
    interval_live_s: num(remote.interval_live_s, CONFIG_DEFAULTS.interval_live_s),
    interval_log_s: num(remote.interval_log_s, CONFIG_DEFAULTS.interval_log_s),
    mode: remote.mode === 'auto' ? 'auto' : 'manual',
    thr,
  };
}

// ------------------------------------------------------------------- routes
router.get('/version', (req, res) => {
  res.json({ ok: true, name: 'smartroom-mit-bridge', version: 1 });
});

router.get('/ping', requireToken, (req, res) => {
  res.json({ ok: true, mqtt: mqtt.isConnected(), device: config.deviceId, ts: Date.now() });
});

// Teks polos: dipakai App Inventor (split + select list item, tanpa parse JSON).
// Urutan: temp|hum|gas|noise|light|fan|ac|heater|window|lamp|mode|status
router.get('/values', requireToken, (req, res) => {
  const snap = mqtt.getSnapshot();
  const live = snap.live || {};
  const st = snap.state || {};
  const pick = (v) => (v === undefined || v === null || v === '' ? '-' : String(v));
  // K3: firmware lama hanya mengirim "light"; firmware baru mengirim "lightRaw".
  // Terima keduanya supaya kolom cahaya tidak pernah "-" saat sensor mengirim.
  const lightVal = (live.lightRaw === undefined || live.lightRaw === null || live.lightRaw === '')
    ? live.light
    : live.lightRaw;
  const line = [
    pick(live.temp),
    pick(live.hum),
    pick(live.gas),
    pick(live.noise),
    pick(lightVal),
    pick(st.fan),
    pick(st.ac),
    pick(st.heater),
    pick(st.window),
    pick(st.lamp),
    pick(st.mode),
    pick(snap.status && (snap.status.raw || snap.status.status)),
  ].join('|');

  res.set('Cache-Control', 'no-store');
  res.type('text/plain; charset=utf-8').send(line);
});

// JSON lengkap (debug/kurasi).
router.get('/snapshot', requireToken, (req, res) => {
  const snap = mqtt.getSnapshot();
  res.json({
    ok: true,
    mqtt: mqtt.isConnected(),
    device: config.deviceId,
    live: snap.live,
    state: snap.state,
    status: snap.status,
    config: currentConfig(),
    ages: snap.ages,
    ts: snap.ts,
  });
});

// Perintah aktuator manual (tombol ON/OFF di app).
router.post('/cmd', requireToken, (req, res) => {
  const body = req.body || {};
  const actuator = String(body.actuator || '').toLowerCase();
  const state = String(body.state || '').toLowerCase();
  const overrideS = Number(body.override_s || body.override || 0) || 0;

  if (!ACTUATORS.includes(actuator)) {
    return res.status(400).json({ ok: false, error: 'bad_actuator', allowed: ACTUATORS });
  }
  if (!CMD_STATES.includes(state)) {
    return res.status(400).json({ ok: false, error: 'bad_state', allowed: CMD_STATES });
  }
  if (!mqtt.isConnected()) {
    return res.status(503).json({ ok: false, error: 'mqtt_offline' });
  }

  mqtt.publishCmd(actuator, state, overrideS);
  return res.json({ ok: true, actuator, state, override_s: overrideS });
});

// Threshold + interval (tombol Save Thresholds di app).
router.post('/config', requireToken, (req, res) => {
  const body = req.body || {};
  const base = currentConfig();
  const inThr = body.thr && typeof body.thr === 'object' ? body.thr : body;
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

  const next = {
    interval_live_s: num(body.interval_live_s, base.interval_live_s),
    interval_log_s: num(body.interval_log_s, base.interval_log_s),
    mode: base.mode,
    thr: { ...base.thr },
  };

  if (body.mode !== undefined && body.mode !== null && body.mode !== '') {
    const m = String(body.mode).toLowerCase();
    if (m !== 'manual' && m !== 'auto') {
      return res.status(400).json({ ok: false, error: 'bad_mode', allowed: ['manual', 'auto'] });
    }
    next.mode = m;
  }

  if (next.interval_live_s < 2 || next.interval_live_s > 3600) {
    return res.status(400).json({ ok: false, error: 'bad_interval_live_s' });
  }
  if (next.interval_log_s < 10 || next.interval_log_s > 86400) {
    return res.status(400).json({ ok: false, error: 'bad_interval_log_s' });
  }

  for (const key of Object.keys(THR_RULES)) {
    if (inThr[key] === undefined || inThr[key] === null || inThr[key] === '') continue;
    const v = Number(inThr[key]);
    if (!Number.isFinite(v)) {
      return res.status(400).json({ ok: false, error: `bad_${key}` });
    }
    if (!THR_RULES[key](v)) {
      return res.status(400).json({ ok: false, error: `bad_${key}`, value: v });
    }
    next.thr[key] = v;
  }

  if (next.thr.temp_max <= next.thr.temp_min + 3) {
    return res.status(400).json({
      ok: false,
      error: 'temp_max_must_exceed_temp_min_by_3',
      thr: next.thr,
    });
  }

  if (!mqtt.isConnected()) {
    return res.status(503).json({ ok: false, error: 'mqtt_offline' });
  }

  mqtt.publishConfig(next);
  return res.json({ ok: true, config: next });
});

module.exports = { router, rateLimit, CONFIG_DEFAULTS, ACTUATORS };
