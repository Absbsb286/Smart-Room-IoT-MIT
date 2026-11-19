// tools/local-env-server.js
// Utilitas sekali pakai: menyajikan env var bridge ke http://127.0.0.1:3999
// supaya credential bisa diisi ke dashboard Render tanpa ditulis di log/chat.
//
// Jalankan: node tools/local-env-server.js
// Hentikan setelah selesai (Ctrl+C). Tidak mengubah file apa pun.

const fs = require('fs');
const path = require('path');
const http = require('http');

const root = path.join(__dirname, '..');
const env = {};
fs.readFileSync(path.join(root, '.env'), 'utf8')
  .split(/\r?\n/)
  .forEach((line) => {
    if (!line || line.trim().startsWith('#')) return;
    const i = line.indexOf('=');
    if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  });

const tokenFile = path.join(root, '..', 'MOBILE-TOKEN.txt');
const token = fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8').trim() : env.MOBILE_TOKEN;

const payload = {
  MQTT_HOST: env.MQTT_HOST,
  MQTT_PORT: env.MQTT_PORT || '8883',
  MQTT_USERNAME: env.MQTT_USERNAME,
  MQTT_PASSWORD: env.MQTT_PASSWORD,
  MQTT_CLIENT_ID: 'smartroom-mit-bridge-001',
  MQTT_TLS: 'true',
  DEVICE_ID: env.DEVICE_ID || 'room1',
  MOBILE_TOKEN: token,
};

http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  })
  .listen(3999, '127.0.0.1', () => {
    console.log('env server siap di http://127.0.0.1:3999 (hentikan setelah dipakai)');
  });
