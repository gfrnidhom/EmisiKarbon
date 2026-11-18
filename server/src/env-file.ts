/**
 * Pengelola berkas `server/.env` — satu sumber konfigurasi sistem & lingkungan.
 * Dibaca eksplisit saat server mulai (dari folder mana pun server dijalankan), diubah Admin lewat
 * menu Konfigurasi. Komentar & urutan baris dipertahankan; setiap simpan membuat salinan `.env.bak`.
 */
import { existsSync, readFileSync, renameSync, writeFileSync, copyFileSync } from "fs"

export const ENV_PATH = new URL("../.env", import.meta.url).pathname

export type EnvKind = "text" | "secret" | "url" | "number" | "bool" | "select" | "dburl"
export interface EnvMeta {
  key: string; group: string; label: string; help: string; kind: EnvKind
  /** true = langsung aktif setelah disimpan; false = perlu muat ulang server */
  live: boolean
  options?: string[]
  /** peringatan yang harus dikonfirmasi sebelum diubah */
  danger?: string
  placeholder?: string
}

/** Daftar semua variabel yang dikelola dari UI. */
export const ENV_META: EnvMeta[] = [
  { key: "DATABASE_URL", group: "database", label: "Koneksi PostgreSQL", kind: "dburl", live: false,
    help: "Format postgres://pengguna:katasandi@host:5432/namadb. Kosongkan untuk memakai cadangan SQLite.",
    placeholder: "postgres://user:password@localhost:5432/carbonemission",
    danger: "Server akan memakai database lain setelah dimuat ulang. Database kosong otomatis dibuatkan struktur tabel dan diisi data contoh." },
  { key: "DB_PATH", group: "database", label: "Berkas SQLite cadangan", kind: "text", live: false,
    help: "Hanya dipakai bila DATABASE_URL kosong.", placeholder: "server/data/jejakhijau.sqlite" },
  { key: "NODE_ENV", group: "server", label: "Mode server", kind: "select", options: ["development", "production"], live: false,
    help: "production mematikan akun demo & bantuan pengembangan." },
  { key: "PORT", group: "server", label: "Port HTTP", kind: "number", live: false, help: "Port API + ketiga aplikasi web (bawaan 3000)." },
  { key: "ADMIN_HOST", group: "domain", label: "Domain aplikasi Admin", kind: "text", live: true, help: "Kosongkan untuk otomatis admin.<domain>.", placeholder: "admin.sekolahlestari.id" },
  { key: "FIELD_HOST", group: "domain", label: "Domain aplikasi Petugas", kind: "text", live: true, help: "Kosongkan untuk otomatis petugas.<domain>.", placeholder: "petugas.sekolahlestari.id" },
  { key: "JWT_SECRET", group: "security", label: "Kunci token sesi (JWT)", kind: "secret", live: true,
    help: "Minimal 32 karakter acak.", danger: "Semua pengguna akan keluar (logout) dan harus masuk lagi." },
  { key: "QR_SECRET", group: "security", label: "Kunci tanda tangan QR", kind: "secret", live: true,
    help: "Dipakai menandatangani label QR aset.", danger: "SEMUA label QR pohon & aset yang sudah dicetak menjadi tidak valid dan harus dicetak ulang." },
  { key: "GEMINI_API_KEY", group: "integration", label: "Kunci API Gemini", kind: "secret", live: true, help: "Opsional — ekstraksi denah GIS dari gambar." },
  { key: "SIM_URL", group: "integration", label: "URL simulator IoT", kind: "url", live: true, help: "Target bawaan skrip simulator sensor.", placeholder: "http://localhost:3000" },
  { key: "ANDROID_PACKAGE", group: "android", label: "Nama paket APK Petugas", kind: "text", live: true, help: "Untuk Digital Asset Links (TWA).", placeholder: "id.sekolahlestari.app" },
  { key: "ANDROID_SHA256", group: "android", label: "Sidik jari sertifikat APK", kind: "text", live: true, help: "SHA-256; pisahkan dengan koma bila lebih dari satu." },
  { key: "DEMO_PASSWORD", group: "dev", label: "Kata sandi akun demo", kind: "secret", live: true, help: "Hanya berlaku di mode development." },
  { key: "DEV_SHOW_OTP", group: "dev", label: "Tampilkan OTP di layar", kind: "bool", live: true, help: "Bantuan pengembangan; matikan di produksi." },
]
export const ENV_KEYS = new Set(ENV_META.map((m) => m.key))

/** Baca pasangan KEY=VALUE dari `server/.env` (tanda kutip dibuang). */
export function readEnvFile(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[m[1]] = v
  }
  return out
}

/** Muat `server/.env` ke process.env (dipanggil sekali sebelum CONFIG dibaca). */
export function loadEnvFile() {
  for (const [k, v] of Object.entries(readEnvFile())) process.env[k] = v
}

const quote = (v: string) => (/^[A-Za-z0-9_./:@,+\-]*$/.test(v) ? v : `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)

/** Tulis perubahan (null = hapus baris) — mempertahankan komentar & urutan, atomik, dengan cadangan `.env.bak`. */
export function writeEnvFile(changes: Record<string, string | null>) {
  const lines = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8").split(/\r?\n/) : ["# Konfigurasi Sekolah Lestari — dikelola lewat menu Konfigurasi (Admin)"]
  const pending = new Map(Object.entries(changes))
  const out: string[] = []
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/)
    if (m && pending.has(m[1])) {
      const v = pending.get(m[1])!
      pending.delete(m[1])
      if (v !== null) out.push(`${m[1]}=${quote(v)}`)
      continue
    }
    out.push(line)
  }
  while (out.length && out[out.length - 1] === "") out.pop()
  for (const [k, v] of pending) if (v !== null) out.push(`${k}=${quote(v)}`)
  if (existsSync(ENV_PATH)) copyFileSync(ENV_PATH, ENV_PATH + ".bak")
  const tmp = ENV_PATH + ".tmp"
  writeFileSync(tmp, out.join("\n") + "\n", { mode: 0o600 })
  renameSync(tmp, ENV_PATH)
}

/** Samarkan rahasia: tampilkan 4 karakter terakhir saja. */
export const maskSecret = (v?: string | null) => (!v ? "" : v.length <= 4 ? "••••" : `••••${v.slice(-4)}`)
/** Samarkan kata sandi di dalam URL database. */
export const maskDbUrl = (v?: string | null) => (v ? v.replace(/(\/\/[^:/@]+:)([^@]*)(@)/, (_, a, _p, c) => `${a}••••${c}`) : "")
