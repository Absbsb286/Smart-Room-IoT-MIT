// src/mqtt-cache.js
// Satu-satunya bagian yang bicara MQTT. Bridge ini:
//   1. subscribe topik data ESP  -> menyimpan pesan terakhir (cache)
//   2. publish topik perintah     -> meneruskan perintah dari aplikasi HP
//
// Topik & payload IDENTIK dengan smart-room-iot-server (tidak ada topik baru):
//   subscribe : smartroom/<device>/live | state | status | config
//   publish   : smartroom/<device>/cmd/<actuator> , smartroom/<device>/config

const mqtt = require('mqtt');
const config = require('./config');

let client = null;
let connected = false;

const lastByTopic = {};
const lastTsByTopic = {};
const messageHandlers = new Set();

function topicBase() {
  return `smartroom/${config.deviceId}`;
}

function connect() {
  const proto = config.mqtt.tls ? 'mqtts' : 'mqtt';
  const url = `${proto}://${config.mqtt.host}:${config.mqtt.port}`;

  client = mqtt.connect(url, {
    username: config.mqtt.username || undefined,
    password: config.mqtt.password || undefined,
    clientId: config.mqtt.clientId,
    rejectUnauthorized: true,
    reconnectPeriod: 5000,
    connectTimeout: 15000,
    clean: true,
  });

  client.on('connect', () => {
    connected = true;
    console.log(`[MQTT] terhubung ke ${config.mqtt.host}:${config.mqtt.port}`);
    const topics = ['live', 'log', 'state', 'status', 'config'].map((t) => `${topicBase()}/${t}`);
    client.subscribe(topics, { qos: 1 }, (err) => {
      if (err) console.error('[MQTT] gagal subscribe:', err.message);
      else console.log('[MQTT] subscribe:', topics.join(', '));
    });
  });

  client.on('message', (topic, payload) => {
    const short = topic.replace(`${topicBase()}/`, '');
    let data;
    try {
      data = JSON.parse(payload.toString());
    } catch {
      data = { raw: payload.toString() };
    }
    lastByTopic[short] = data;
    lastTsByTopic[short] = Date.now();
    messageHandlers.forEach((fn) => {
      try {
        fn(short, data);
      } catch (e) {
        console.error('[MQTT] handler error:', e.message);
      }
    });
  });

  client.on('error', (err) => console.error('[MQTT] error:', err.message));
  client.on('reconnect', () => console.log('[MQTT] reconnect...'));
  client.on('offline', () => {
    connected = false;
    console.log('[MQTT] offline');
  });
  client.on('close', () => {
    connected = false;
  });
}

function isConnected() {
  return !!(client && client.connected);
}

function publishCmd(actuator, state, overrideS = 0) {
  if (!isConnected()) return false;
  const payload = { state, override_s: Number(overrideS) || 0 };
  client.publish(`${topicBase()}/cmd/${actuator}`, JSON.stringify(payload), { qos: 1 }, (err) => {
    if (err) console.error('[MQTT] publish cmd error:', err.message);
    else console.log(`[MQTT] -> cmd/${actuator}`, payload);
  });
  return true;
}

function publishConfig(cfg) {
  if (!isConnected()) return false;
  client.publish(`${topicBase()}/config`, JSON.stringify(cfg), { qos: 1, retain: true }, (err) => {
    if (err) console.error('[MQTT] publish config error:', err.message);
    else console.log('[MQTT] -> config (retained)', cfg);
  });
  return true;
}

function getLast(topic) {
  return lastByTopic[topic] || null;
}

function getSnapshot() {
  const now = Date.now();
  const age = (t) => (lastTsByTopic[t] ? now - lastTsByTopic[t] : null);
  return {
    live: lastByTopic.live || null,
    state: lastByTopic.state || null,
    status: lastByTopic.status || null,
    config: lastByTopic.config || null,
    ages: { live: age('live'), state: age('state'), status: age('status'), config: age('config') },
    ts: now,
  };
}

module.exports = {
  connect,
  isConnected,
  publishCmd,
  publishConfig,
  getLast,
  getSnapshot,
  onMessage: (fn) => messageHandlers.add(fn),
};
