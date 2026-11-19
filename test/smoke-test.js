// test/smoke-test.js
// Uji cepat bridge yang sedang jalan di http://localhost:3002
// Jalankan: npm run smoke
//
// CATATAN: test ini SENGAJA tidak mengirim perintah aktuator / config,
// supaya tidak mengubah kondisi ESP32 sungguhan.

const BASE = process.env.BRIDGE_URL || 'http://localhost:3002';
const TOKEN = process.env.MOBILE_TOKEN || '';

async function hit(path, opts = {}) {
  const url = `${BASE}${path}`;
  const headers = {
    ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    ...(opts.headers || {}),
  };
  // unless opts.noAuth, kirim token yang benar
  if (!opts.noAuth) headers['X-Mobile-Token'] = TOKEN;
  const res = await fetch(url, { ...opts, headers });
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 300) };
}

(async () => {
  console.log(`Bridge  : ${BASE}`);
  console.log(`Token   : ${TOKEN ? 'ada' : 'KOSONG (pakai MOBILE_TOKEN dari .env)'}`);
  console.log('');

  const checks = [
    ['GET /health', '/health', {}],
    ['GET /api/mobile/version', '/api/mobile/version', {}],
    ['GET /api/mobile/ping', '/api/mobile/ping', {}],
    ['GET /api/mobile/values', '/api/mobile/values', {}],
    ['GET /api/mobile/snapshot', '/api/mobile/snapshot', {}],
    ['GET /api/mobile/ping (tanpa token)', '/api/mobile/ping', { noAuth: true }],
    [
      'POST /api/mobile/cmd (aktuator ngawur)',
      '/api/mobile/cmd',
      { method: 'POST', body: JSON.stringify({ actuator: 'televisi', state: 'on' }) },
    ],
  ];

  for (const [name, path, opts] of checks) {
    try {
      const r = await hit(path, opts);
      console.log(`${r.status === 200 || r.status === 400 || r.status === 401 ? 'OK ' : '?? '} ${name}\n     -> ${r.status} ${r.body}`);
    } catch (e) {
      console.log(`ERR ${name}\n     -> ${e.message}`);
    }
  }

  console.log('\nSelesai. (tidak ada perintah aktuator yang dikirim)');
})();
