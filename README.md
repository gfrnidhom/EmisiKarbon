# Sekolah Lestari — Dashboard Emisi Karbon (PWA)

Implementasi PRD JejakHijau v2.0: emisi GRK lembaga dan serapan karbon pohon dihitung tiap hari tanpa input harian.
Alurnya baseline → verifikasi → mesin hitung harian → pemantauan berkala.

| Lapisan | Teknologi |
|---|---|
| Backend | **Bun** + Hono, **PostgreSQL 17** (`Bun.SQL`, cadangan SQLite), JWT + refresh token, email + kata sandi (hash Argon2id via `Bun.password`) |
| Frontend | React 19 + Vite, **shadcn/ui** (Base UI), Tailwind v4, TanStack Query, Recharts, Leaflet |
| PWA | `vite-plugin-pwa` (Workbox): bisa dipasang, cache API NetworkFirst, antrian offline IndexedDB + Idempotency-Key |

## Menjalankan

```bash
bun install && bun install --cwd server
bun run seed        # isi ulang data pilot (SMPN 1 Ngasem & SMPN 2 Purwosari)
bun run build       # build ketiga aplikasi ke apps/*/dist
bun run start       # API + tiga aplikasi di port 3000 (lihat tabel domain)
```

### Monorepo & domain

| Folder | Domain produksi | Lokal (`bun run start`) | Untuk |
|---|---|---|---|
| `apps/web` | `sekolahlestari.id` | http://localhost:3000 | Beranda, metodologi, survei tanpa login, QR pohon, cek keaslian rapor, jejak karbon pribadi |
| `apps/admin` | `admin.sekolahlestari.id` | http://admin.localhost:3000 | Admin, Operator, Kepala Sekolah |
| `apps/petugas` | `petugas.sekolahlestari.id` | http://petugas.localhost:3000 | Aplikasi ponsel Petugas Monitoring (dibungkus APK, lihat `android/`) |
| `packages/shared` | — | — | Komponen UI, tema, api/auth/i18n, halaman fitur, konfigurasi Vite bersama (`@/…`) |
| `server` | semua domain, `/api` | — | API, database, engine tutup buku; memilih build sesuai host |

- Server memilih aplikasi dari nama host: awalan `admin.` / `petugas.`, atau tetapkan pasti lewat `ADMIN_HOST` / `FIELD_HOST`.
- Sesi login terpisah per domain. Pindah domain (mis. operator login di domain utama) memakai kode sekali pakai 60 detik (`/api/auth/handoff`), jadi tidak perlu login ulang.
- Hot reload: `bun run dev:api` (3000) lalu `bun run dev:web` (5173), `bun run dev:admin` (5174), `bun run dev:petugas` (5175); semuanya mem-proxy `/api` ke 3000.
- Bila alamat produksi tidak mengikuti pola subdomain, atur `VITE_URL_WEB`, `VITE_URL_ADMIN`, `VITE_URL_PETUGAS` saat build.
Uji golden dataset: `bun run test`.

**Masuk:** buka `/login` di domain mana saja (akun diarahkan ke aplikasi sesuai peran), masuk dengan email + kata sandi, atau pilih salah satu akun demo. Di mode pengembangan, akun yang belum punya kata sandi otomatis diberi kata sandi demo `lestari123` saat server dimulai (atur lewat `DEMO_PASSWORD`; tidak berjalan bila `NODE_ENV=production`).

**Daftar:** `/daftar` hanya membuat akun **pengguna umum** (peran `user`) yang membuka kalkulator **Jejak Karbon Saya** (`/jejak`). Akun staf sekolah, verifikator, dinas, dan admin dibuat lewat undangan; penerima undangan menetapkan kata sandi sendiri di `/masuk?undangan=…`. Login dengan kode OTP sudah dinonaktifkan (endpoint lama mengembalikan 410).
Akun demo: operator, kepala sekolah (tiap sekolah), dua verifikator, pengelola program, dan admin.

Variabel produksi: `JWT_SECRET`, `QR_SECRET`, `DATABASE_URL`/`DB_PATH`, `PORT`, `NODE_ENV=production`.

## Dwibahasa & tampilan

- UI tersedia dalam **Bahasa Indonesia & English**. Ganti lewat toggle ID/EN di sidebar atau di halaman publik. Teks sumber berbahasa Indonesia menjadi kunci di `packages/shared/src/lib/i18n/en.ts`.
- Semua peran memakai tampilan App yang sama: operator, kepala sekolah, verifikator, pengelola program, admin, dan dinas. Bedanya hanya hak akses; menu tambahan seperti Dasbor Program dan konsol admin muncul sesuai peran.
- Menu: Beranda · Rapor Karbon · Jasa Lingkungan · Peta Aset · Survei Awal · Laporan · Input Berkala (Energi, Sampah, Mobilitas, Pohon, Scan, Kalender) · Verifikasi · Sensor IoT · Faktor Emisi · Pengaturan.
- **Faktor Emisi** berisi 76 faktor, dengan katalog ELEC/FUEL/REF/GAS/TRN/PRC/AGR/WST/CAP/TREE dan status Referensi / Perlu verifikasi / Belum diisi. Admin bisa edit langsung di tabel lalu menekan "Simpan sebagai versi baru"; impor/ekspor Excel dan riwayat versi per faktor juga tersedia.
- **Sensor IoT**: perangkat dipasangkan lewat **QR pairing** yang berisi endpoint dan token. Statusnya dihitung dari heartbeat dan pembacaan, lalu diperbarui otomatis tiap 10 detik:
  - **Terhubung**: perangkat terlihat dalam ≤ 3× interval kirim.
  - **Terlambat**: terlihat dalam ≤ 6 jam terakhir.
  - **Terputus**: tidak terlihat lebih dari 6 jam.
  - **Belum terhubung**: belum pernah mengirim data.
  - **Nonaktif**: dimatikan operator.

  Endpoint perangkat (tanpa login, token di URL):

  | Endpoint | Fungsi |
  |---|---|
  | `POST /api/public/iot/:token/pair` | Handshake pairing |
  | `POST /api/public/iot/:token/ping` | Heartbeat |
  | `POST /api/public/iot/:token` | Kirim pembacaan `{value, at?, rssi?, battery?, firmware?}` |

  Perangkat fisik harus memakai alamat IP jaringan server (mis. `http://192.168.x.x:3000`), bukan `localhost`; dialog QR menyediakan pilihannya. Simulator perangkat tersedia untuk uji tanpa hardware:

  ```bash
  cd server && bun run iot:sim <token> --url http://localhost:3000 --interval 10
  ```

## Database PostgreSQL & TablePlus

Backend memakai **PostgreSQL** bila `DATABASE_URL` di-set (di `server/.env` dan `.env` root). Tanpa variabel itu, backend kembali ke SQLite.

```
DATABASE_URL=postgres://mghofarunnindhom@localhost:5432/carbonemission
```

PostgreSQL 17 dipasang lewat Homebrew dan berjalan sebagai layanan:

```bash
brew services start postgresql@17
```

```bash
brew services stop postgresql@17
```

**Koneksi di TablePlus:** *Create a new connection → PostgreSQL*

| Field | Nilai |
|---|---|
| Host | `127.0.0.1` |
| Port | `5432` |
| User | `mghofarunnindhom` |
| Password | *(kosong, autentikasi lokal trust)* |
| Database | `carbonemission` |

Atau tempel URL `postgres://mghofarunnindhom@127.0.0.1:5432/carbonemission` lewat *Import from URL*.

- Skema dibuat otomatis saat server start (`server/src/schema.ts`). Kueri ditulis sekali lalu diterjemahkan per dialek di `server/src/db.ts`: placeholder `?` → `$n`, `datetime('now')`, `RETURNING id`, dan `INSERT OR IGNORE`.
- `bun run seed` mengosongkan schema `public` lalu mengisi ulang data pilot.
- Tabel `audit_log` dilindungi trigger append-only, sehingga UPDATE/DELETE ditolak database.
- Setelah mengubah `.env`, **restart** server. Restart otomatis `bun --watch` tidak membaca ulang `.env`.

## Struktur

```
server/src/engine/factors.ts   faktor FE-2026.1, parameter IPCC, jenis pohon (dari Excel)
server/src/engine/calc.ts      rumus murni §7 (alokasi harian, sampah, mobilitas, pohon, refrigeran)
server/src/engine/calc.test.ts golden dataset dari "Perhitungan Emisi Karbon.xlsx"
server/src/engine/engine.ts    mesin hitung harian per lembaga + label kualitas + telusuri angka
server/src/engine/services.ts  baseline, kelengkapan, validasi otomatis, antrian, tugas pemantauan, job harian
server/src/routes/*            auth, lembaga/aktivitas, pohon/sampah/mobilitas, baseline/verifikasi/rapor, admin/publik
packages/shared/src/pages/*        halaman fitur (dipakai apps/web, apps/admin, apps/petugas)
apps/*/src/App.tsx                 rute tiap aplikasi
```

## Akurasi (G5)

Hasil uji golden dataset sama dengan Excel:

- Satu hari aktif: **368,66 kg CO₂e** (UAT-16)
- Mobilitas: **370,23 kg/hari**
- Faktor TPA makanan/kertas/kompos: 0,84 / 2,24 / 0,1756
- Riap terkalibrasi #TREE-001: 1,21 cm/th
- Biopori: 7,85 L per lubang

## Belum dikerjakan (perlu layanan eksternal / fase berikutnya)

- Atur ulang kata sandi lewat email (lupa kata sandi) dan Web Push (VAPID). Saat ini notifikasi tampil di aplikasi, dan notifikasi lokal muncul selama PWA terbuka.
- Teks naratif dari server (pesan galat, rumus di panel Telusuri angka) masih berbahasa Indonesia. Judul tugas pemantauan sudah diterjemahkan di klien.
- WhatsApp Business API (V2), OCR struk (P2), portal mitra CSR (V2).
- Geofence memakai radius dari luas lahan, belum poligon PostGIS. Kolom tanggal masih bertipe TEXT dan JSON masih TEXT, belum `timestamptz`/`jsonb`.
- Foto yang diambil saat offline belum ikut antrian (pengukurannya ikut). PDF rapor memakai cetak browser A4.
