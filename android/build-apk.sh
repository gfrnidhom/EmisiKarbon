#!/usr/bin/env bash
# Build APK Android (Trusted Web Activity) dari PWA Sekolah Lestari.
#
# Pemakaian:   ./android/build-apk.sh petugas.sekolahlestari.id
#   Argumen 1 = domain HTTPS tempat aplikasi sudah online (tanpa https://).
#
# Variabel opsional:
#   APP_ID       paket Android      (bawaan: id.sekolahlestari.app)
#   APP_VERSION  versi tampilan     (bawaan: 1.0.0)
#   APP_CODE     nomor versi (naikkan tiap rilis)  (bawaan: 1)
#   KEYSTORE     berkas kunci tanda tangan         (bawaan: android/sekolah-lestari.keystore)
#
# Hasil: android/build/app-release-signed.apk (pasang langsung di HP) dan app-release-bundle.aab (unggah ke Play Store).
set -euo pipefail

HOST="${1:-}"
if [[ -z "$HOST" ]]; then echo "Pakai: $0 <domain-https>   contoh: $0 petugas.sekolahlestari.id"; exit 1; fi
HOST="${HOST#https://}"; HOST="${HOST%%/*}"
APP_ID="${APP_ID:-id.sekolahlestari.app}"
APP_VERSION="${APP_VERSION:-1.0.0}"
APP_CODE="${APP_CODE:-1}"
DIR="$(cd "$(dirname "$0")" && pwd)"
KEYSTORE="${KEYSTORE:-$DIR/sekolah-lestari.keystore}"
ALIAS="sekolah-lestari"
OUT="$DIR/build"

# Android SDK (Homebrew: brew install --cask android-commandlinetools) & JDK 17 (Bubblewrap/Gradle belum mendukung JDK 25)
export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
if [[ -z "${JAVA_HOME:-}" ]] && /usr/libexec/java_home -v 17 >/dev/null 2>&1; then export JAVA_HOME="$(/usr/libexec/java_home -v 17)"; fi

echo "→ Memeriksa manifest PWA di https://$HOST/manifest.webmanifest"
curl -fsS "https://$HOST/manifest.webmanifest" >/dev/null || { echo "✗ Manifest tidak bisa dibuka. Pastikan aplikasi sudah online di https://$HOST (hasil 'bun run build')."; exit 1; }

# 1. Kunci tanda tangan — buat SEKALI, simpan aman. Kehilangan kunci = tidak bisa memperbarui aplikasi di Play Store.
if [[ ! -f "$KEYSTORE" ]]; then
  echo "→ Membuat kunci tanda tangan baru: $KEYSTORE (Anda akan diminta membuat kata sandi)"
  keytool -genkeypair -v -keystore "$KEYSTORE" -alias "$ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Sekolah Lestari, O=Sekolah Lestari, C=ID"
fi
SHA256="$(keytool -list -v -keystore "$KEYSTORE" -alias "$ALIAS" 2>/dev/null | awk '/SHA256:/{print $2; exit}')"

# 2. Konfigurasi TWA dari template
mkdir -p "$OUT"
sed -e "s#__HOST__#$HOST#g" -e "s#__APP_ID__#$APP_ID#g" -e "s#__VERSION__#$APP_VERSION#g" -e "s#__CODE__#$APP_CODE#g" \
    -e "s#__KEYSTORE__#$KEYSTORE#g" -e "s#__ALIAS__#$ALIAS#g" "$DIR/twa-manifest.template.json" > "$OUT/twa-manifest.json"

# 3. Bangun proyek Android & APK
cd "$OUT"
npx --yes @bubblewrap/cli@1.27.0 update --skipVersionUpgrade --manifest=./twa-manifest.json
npx --yes @bubblewrap/cli@1.27.0 build --manifest=./twa-manifest.json

echo
echo "✓ Selesai:"
echo "   APK  : $OUT/app-release-signed.apk   (kirim ke HP petugas & pasang)"
echo "   AAB  : $OUT/app-release-bundle.aab   (untuk Google Play Console)"
echo
echo "Langkah terakhir — tambahkan ke .env server di https://$HOST lalu restart server:"
echo "   ANDROID_PACKAGE=$APP_ID"
echo "   ANDROID_SHA256=$SHA256"
echo "Cek: https://$HOST/.well-known/assetlinks.json harus menampilkan paket & sidik jari di atas."
