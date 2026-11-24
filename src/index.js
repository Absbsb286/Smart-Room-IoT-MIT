// src/index.js
// Smart Room IoT - MIT App Inventor bridge
// MQTT (ESP32 <-> broker) <-> REST (HP App Inventor <-> server ini)

const express = require('express');
const config = require('./config');
const mqtt = require('./mqtt-cache');
const { router, rateLimit } = require('./routes');

const app = express();
app.disable('x-powered-by');

// App Inventor mengirim body apa adanya (content-type form) - terima keduanya.
app.use(express.json({ limit: '8kb' }));
app.use(express.urlencoded({ extended: false, limit: '8kb' }));

// CORS: hanya origin yang diizinkan lewat env ALLOWED_ORIGINS.
// Default kosong = tanpa header CORS (app App Inventor native tidak memerlukannya).
// Ini menutup temuan "Access-Control-Allow-Origin: *" pada audit.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allow = config.allowedOrigins;
  if (origin && (allow.includes('*') || allow.includes(origin))) {
    res.set('Access-Control-Allow-Origin', allow.includes('*') ? '*' : origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-Mobile-Token');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'smartroom-mit-bridge',
    uptime: Math.round(process.uptime()),
    mqtt: mqtt.isConnected(),
    device: config.deviceId,
    mobile: { token: !!config.mobileToken },
    ts: new Date().toISOString(),
  });
});

app.use('/api/mobile', rateLimit, router);

// 404
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'not_found' });
});

// error handler
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[HTTP] error:', err.message);
  res.status(400).json({ ok: false, error: 'bad_request' });
});

const server = app.listen(config.port, () => {
  console.log('===========================================');
  console.log(`[HTTP] Smart Room MIT bridge listening on :${config.port}`);
  console.log(`[HTTP] Device: ${config.deviceId} | MQTT: ${config.mqtt.host}:${config.mqtt.port}`);
  console.log(`[HTTP] MOBILE_TOKEN: ${config.mobileToken ? 'set' : 'MISSING (endpoint /api/mobile akan 503)'}`);
  console.log('===========================================');
});

mqtt.connect();

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
