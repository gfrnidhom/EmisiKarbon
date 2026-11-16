# APK Android — Sekolah Lestari

APK dibuat dari PWA dengan **Trusted Web Activity (TWA)** lewat [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap).
APK membuka aplikasi Petugas (`apps/petugas`) di `https://petugas.<domain>/` layar penuh (tanpa bilah alamat).
Akun staf yang login di APK dipindahkan ke `admin.<domain>` di browser.
Karena isi aplikasi diambil dari server, **pembaruan fitur tidak perlu build APK ulang** — cukup deploy web.

## Syarat

| Kebutuhan | Keterangan |
|---|---|
| Domain HTTPS | Aplikasi sudah online, mis. `https://petugas.sekolahlestari.id` (hasil `bun run build` disajikan server). TWA tidak bisa memakai `localhost`. |
| JDK 17 | Bubblewrap/Gradle belum mendukung JDK 25. Saat pertama dijalankan, Bubblewrap menawarkan mengunduh JDK 17 — jawab **Yes**. Atau `brew install openjdk@17`. |
| Android SDK | Sudah ada di `/opt/homebrew/share/android-commandlinetools`. Bila Bubblewrap bertanya lokasi SDK, isi path itu. |

## Langkah

```bash
./android/build-apk.sh petugas.sekolahlestari.id
```

Skrip akan:
1. Memeriksa manifest PWA di domain tersebut.
2. Membuat kunci tanda tangan `android/sekolah-lestari.keystore` (sekali saja; Anda diminta membuat kata sandi).
3. Membuat proyek Android dari `twa-manifest.template.json` dan membangun:
   - `android/build/app-release-signed.apk` — kirim ke HP petugas dan pasang langsung.
   - `android/build/app-release-bundle.aab` — untuk unggah ke Google Play Console.
4. Menampilkan dua baris untuk `.env` server:

```
ANDROID_PACKAGE=id.sekolahlestari.app
ANDROID_SHA256=AB:CD:…
```

Tambahkan ke `.env` server produksi lalu restart. Cek `https://<domain>/.well-known/assetlinks.json` — harus berisi paket dan sidik jari tadi.
Tanpa langkah ini APK tetap jalan, tetapi tampil dengan bilah alamat browser di atas.

## Rilis berikutnya

Pembaruan isi aplikasi cukup deploy web. Build APK ulang hanya bila ikon, nama, warna, atau pintasan berubah:

```bash
APP_VERSION=1.0.1 APP_CODE=2 ./android/build-apk.sh petugas.sekolahlestari.id
```

## Google Play

Bila memakai *Play App Signing*, Google menandatangani ulang aplikasi dengan kuncinya sendiri. Salin sidik jari SHA-256 dari
Play Console → *Setup → App signing*, lalu tambahkan ke `.env` dengan koma:

```
ANDROID_SHA256=<sidik jari kunci lokal>,<sidik jari Play Console>
```

## Penting

- **Simpan `sekolah-lestari.keystore` dan kata sandinya dengan aman** (di luar repo; sudah di-`.gitignore`). Kehilangan kunci = aplikasi tidak bisa diperbarui di Play Store.
- Ubah paket (`APP_ID`) hanya sebelum rilis pertama; sesudahnya paket tidak bisa diganti.
- Kamera (scan QR) dan GPS (ukur pohon) berjalan seperti di Chrome; izin diminta saat pertama dipakai.
