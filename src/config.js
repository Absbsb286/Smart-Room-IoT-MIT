// src/config.js
// Konfigurasi bridge. Semua rahasia dibaca dari environment variable
// (file .env lokal / Environment Variables di Render) - TIDAK hardcode.

require('dotenv').config();

function required(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    console.warn(`[Config] ${name} belum di-set`);
    return '';
  }
  return v;
}

module.exports = {
  mqtt: {
    host: required('MQTT_HOST'),
    port: parseInt(process.env.MQTT_PORT || '8883', 10),
    username: process.env.MQTT_USERNAME || '',
    password: process.env.MQTT_PASSWORD || '',
    clientId: process.env.MQTT_CLIENT_ID || `smartroom-mit-bridge-${Date.now() % 100000}`,
    // Broker EMQX producción memakai TLS (mqtts://)
    tls: process.env.MQTT_TLS !== 'false',
  },
  deviceId: process.env.DEVICE_ID || 'room1',
  port: parseInt(process.env.PORT || '3002', 10),
  // Daftar origin yang boleh mengakses bridge dari browser (CORS).
  // Kosong = tidak ada header CORS (paling aman; app native tidak butuh CORS).
  // Contoh: https://smart-room-iot-eight.vercel.app,https://admin.example.com
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // Token untuk APP (isi di TextBox12 pada aplikasi App Inventor).
  // Kalau kosong -> endpoint /api/mobile/* membalas 503 (kontrol alat tanpa kunci dicegah).
  mobileToken: process.env.MOBILE_TOKEN || '',
};
