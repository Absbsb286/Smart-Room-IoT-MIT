# Smart-Room-IoT-MIT — REST bridge untuk aplikasi MIT App Inventor

Service kecil yang menjembatani **MQTT broker (ESP32)** ↔ **HTTP (HP App Inventor)**.

> Proyek ini **mandiri**. Tidak mengubah repo `smart-room-iot` (frontend) maupun
> `smart-room-iot-server` (backend web). Topik MQTT, broker, dan payload **sama persis**
> dengan proyek yang sudah ada — tidak ada topik baru.

```
ESP32 ──MQTT──▶ broker EMQX ──MQTT──▶ smartroom-bridge (Render) ──HTTPS──▶ App Inventor
```

## Kenapa perlu service ini?

MIT App Inventor **tidak punya komponen MQTT** dan tidak bisa jadi server yang hidup
terus. Jadi HP hanya bisa menarik data lewat HTTP (`Web` component). Service ini
menyubscribe data dari ESP, menyimpannya, lalu menyajikannya sebagai REST.

Pola ini sama dengan proyek **DashboardLDR** yang dulu (Clock 1 detik → Web.Get → tampilkan),
bedanya hanya sumber datanya: dulu langsung dari HTTP server ESP, sekarang lewat backend.

## Endpoint

| Method | Path | Auth | Fungsi |
|---|---|---|---|
| GET | `/health` | – | status service, koneksi MQTT |
| GET | `/api/mobile/version` | – | cek versi (tanpa token) |
| GET | `/api/mobile/ping` | token | cek token + status MQTT |
| GET | `/api/mobile/values` | token | **teks polos** `a\|b\|c\|…` (dipakai app) |
| GET | `/api/mobile/snapshot` | token | JSON lengkap (debug/kurasi) |
| POST | `/api/mobile/cmd` | token | `{actuator,state,override_s}` → publish `cmd/{actuator}` |
| POST | `/api/mobile/config` | token | threshold + interval → publish `config` (retained) |

Auth: header `X-Mobile-Token` **atau** query `?token=`. Kalau `MOBILE_TOKEN` belum di-set,
semua endpoint `/api/mobile/*` membalas `503 token_not_configured` (kontrol alat tanpa kunci dicegah).

`/api/mobile/values` urutannya:

```
temp | hum | gas | noise | light | fan | ac | heater | window | lamp | mode | status
```

Contoh: `27.4|61|312|208|512|off|off|off|closed|off|auto|online`

## Topik MQTT yang dipakai (identik dengan backend web)

- subscribe: `smartroom/room1/live`, `/state`, `/status`, `/config`, `/log`
- publish: `smartroom/room1/cmd/{fan|ac|heater|window|lamp}`, `smartroom/room1/config`

## Menjalankan lokal

```powershell
cd "D:\smartroom mit\backend-bridge"
npm install
Copy-Item .env.example .env    # lalu isi nilainya
npm start
npm run smoke                  # uji endpoint (tidak mengirim perintah aktuator)
```

## Status produksi (19 Nov 2026)

| Item | Nilai |
|---|---|
| Render service | `smartroom-bridge` (`srv-dbv5nt9srm7s73bgk21g`) |
| Plan / region | **Free** ($0, 0.1 CPU / 512 MB) · Singapore |
| Build / Start | `npm ci` / `npm start` · health check `/health` |
| Status | **Deploy succeeded** |
| Repo | `Absbsb286/Smart-Room-IoT-MIT` (public), branch `main` |
| `/health` | `{"status":"ok","mqtt":true,"device":"room1","mobile":{"token":true}}` |

> Repo dibuat **public** karena Render GitHub App hanya terotorisasi 1 repo dan perubahan
> installation butuh verifikasi email (terblokir). Tidak ada resource berbayar yang dipakai.

Catatan operasional: `/api/mobile/values` mengembalikan `-|-|-|-|-|…` bila ESP32 tidak mengirim
topik `smartroom/room1/live` (state & status tetap terbaca → sisi bridge sehat).

## tools/local-env-server.js

Utilitas **sekali pakai** untuk menyajikan env var ke `http://127.0.0.1:3999` supaya kredensial
bisa diisi ke dashboard Render **tanpa ditulis di log/chat**:

```powershell
node tools/local-env-server.js
# ambil nilainya di browser / curl, lalu hentikan prosesnya (Ctrl+C)
```

Folder ini tidak mengubah file apa pun dan tidak perlu tetap berjalan di Render.

## Deploy ke Render (free)

1. Push repo ini ke GitHub (sudah ada repo `Smart-Room-IoT-MIT`).
2. Render → **New → Web Service** → pilih repo `Smart-Room-IoT-MIT`.
   - Region: Singapore · Plan: **Free** · Root Directory: (kosong) · Build: `npm ci` · Start: `npm start`
   - Health Check Path: `/health`
3. Environment Variables (wajib):
   - `MQTT_HOST`, `MQTT_PORT=8883`, `MQTT_USERNAME`, `MQTT_PASSWORD`
   - `DEVICE_ID=room1`, `MQTT_TLS=true`
   - `MOBILE_TOKEN` = token yang sama dengan diisi di aplikasi
4. Deploy → cek `https://<service>.onrender.com/health` → `"mqtt":true`.

Alternatif: repo ini sudah berisi `render.yaml` (Blueprint), jadi bisa dibuat lewat
**New → Blueprint** dengan mengisi env var yang ditandai `sync: false`.

> **Free tier:** service tidur setelah ±15 menit tanpa request._request pertama setelah tidur
> butuh 30–60 detik (cold start) → aplikasi akan zeigt `Status: Error` dulu, lalu polling
> berikutnya (3 detik kemudian) berhasil. Tidak ada biaya, tidak ada kartu kredit.

## Hubungkan ke aplikasi App Inventor

Di Screen1 aplikasi `SmartRoom` (#16477254):

- `TextBox11` → `https://<service>.onrender.com`
- `TextBox12` → nilai `MOBILE_TOKEN`
- Tekan **Save Thresholds** (disimpan di TinyDB HP)

Blok aplikasi: `Clock1.Timer` (3 detik) → `Web1.Get /api/mobile/values` →
`Web1.GotText` → `split("|")` → update label sensor/aktuator; tombol ON/OFF →
`Web1.PostText /api/mobile/cmd`; tombol Save → `Web1.PostText /api/mobile/config`;
switch AUTO → perbandingan threshold di HP lalu kirim perintah bila status ESP berbeda.

## Keamanan

- Token wajib untuk semua endpoint `/api/mobile/*` (dikosongkan → 503).
- Rate limit 60 request / 10 detik / IP.
- Validasi aktuator (`fan,ac,heater,window,lamp`) dan state (`on,off,open,close`).
- Validasi rentang threshold sama dengan ConfigSection web
  (`temp_max` 10–60, `temp_min` −10–45, `gas_max` 0–10000, `noise_max` 0–5000,
  `light_min` 0–100000, `temp_max` harus ≥ `temp_min`+3).
- Body maks 8 KB. `.env` tidak ikut ter-commit (`.gitignore`).

## Struktur

```
backend-bridge/
├── package.json
├── render.yaml
├── .env.example
├── src/
│   ├── index.js       # HTTP server
│   ├── config.js      # baca env
│   ├── mqtt-cache.js  # koneksi MQTT + cache pesan terakhir
│   └── routes.js      # endpoint REST
└── test/
    └── smoke-test.js
```
