/**
 * Konfigurasi terpusat server Sekolah Lestari (JejakHijau).
 * Nilai awal dibaca dari process.env (dengan nilai bawaan), dan dapat diubah langsung
 * oleh Admin melalui menu Pengaturan (disimpan di tabel `settings` dengan kunci `env_config`).
 */

const env = process.env

export interface EnvConfigOverride {
  GEMINI_API_KEY?: string
  ADMIN_HOST?: string
  FIELD_HOST?: string
  ANDROID_PACKAGE?: string
  ANDROID_SHA256?: string | string[]
  DEMO_PASSWORD?: string
  DEV_SHOW_OTP?: boolean
  SIM_URL?: string
  JWT_SECRET?: string
  QR_SECRET?: string
}

export const CONFIG = {
  /** Mode lingkungan: "development" | "production" */
  NODE_ENV: env.NODE_ENV ?? "development",
  IS_PROD: env.NODE_ENV === "production",

  /** Port HTTP server (API + tiga aplikasi frontend) */
  PORT: Number(env.PORT ?? 3000),

  /**
   * Koneksi PostgreSQL utama.
   * Set DATABASE_URL="" (string kosong) bila ingin memaksa memakai cadangan SQLite.
   */
  DATABASE_URL: env.DATABASE_URL ?? "postgres://mghofarunnindhom@localhost:5432/carbonemission",

  /** Lokasi berkas database cadangan SQLite (dipakai bila DATABASE_URL kosong) */
  DB_PATH: env.DB_PATH ?? new URL("../data/jejakhijau.sqlite", import.meta.url).pathname,

  /** Kunci rahasia penandatanganan JWT & QR HMAC */
  JWT_SECRET: env.JWT_SECRET ?? "dev-jejakhijau-secret-ganti-di-produksi",
  QR_SECRET: env.QR_SECRET ?? "dev-qr-hmac-secret",

  /** Kata sandi bawaan untuk akun demo saat mode pengembangan */
  DEMO_PASSWORD: env.DEMO_PASSWORD ?? "lestari123",
  DEV_SHOW_OTP: env.DEV_SHOW_OTP !== "false",

  /** Nama host khusus untuk domain aplikasi (opsional; default memakai awalan subdomain admin.* & petugas.*) */
  ADMIN_HOST: (env.ADMIN_HOST ?? "").toLowerCase(),
  FIELD_HOST: (env.FIELD_HOST ?? "").toLowerCase(),

  /** Konfigurasi Digital Asset Links untuk APK Android (TWA) */
  ANDROID_PACKAGE: env.ANDROID_PACKAGE ?? "",
  ANDROID_SHA256: (env.ANDROID_SHA256 ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean) as string[],

  /** Kunci API Gemini (opsional — untuk ekstraksi denah GIS dari gambar via Gemini Vision) */
  GEMINI_API_KEY: env.GEMINI_API_KEY ?? "",

  /** URL target bawaan untuk simulator IoT */
  SIM_URL: env.SIM_URL ?? "http://localhost:3000",
}

/** Terapkan perubahan konfigurasi dari database (diatur oleh Admin lewat UI Pengaturan). */
export function applyEnvConfig(patch?: EnvConfigOverride | null) {
  if (!patch || typeof patch !== "object") return
  if (typeof patch.GEMINI_API_KEY === "string") CONFIG.GEMINI_API_KEY = patch.GEMINI_API_KEY.trim()
  if (typeof patch.ADMIN_HOST === "string") CONFIG.ADMIN_HOST = patch.ADMIN_HOST.trim().toLowerCase()
  if (typeof patch.FIELD_HOST === "string") CONFIG.FIELD_HOST = patch.FIELD_HOST.trim().toLowerCase()
  if (typeof patch.ANDROID_PACKAGE === "string") CONFIG.ANDROID_PACKAGE = patch.ANDROID_PACKAGE.trim()
  if (patch.ANDROID_SHA256 !== undefined) {
    const raw = Array.isArray(patch.ANDROID_SHA256) ? patch.ANDROID_SHA256.join(",") : String(patch.ANDROID_SHA256)
    CONFIG.ANDROID_SHA256 = raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
  }
  if (typeof patch.DEMO_PASSWORD === "string" && patch.DEMO_PASSWORD.trim()) CONFIG.DEMO_PASSWORD = patch.DEMO_PASSWORD.trim()
  if (typeof patch.DEV_SHOW_OTP === "boolean") CONFIG.DEV_SHOW_OTP = patch.DEV_SHOW_OTP
  if (typeof patch.SIM_URL === "string" && patch.SIM_URL.trim()) CONFIG.SIM_URL = patch.SIM_URL.trim()
  if (typeof patch.JWT_SECRET === "string" && patch.JWT_SECRET.trim()) CONFIG.JWT_SECRET = patch.JWT_SECRET.trim()
  if (typeof patch.QR_SECRET === "string" && patch.QR_SECRET.trim()) CONFIG.QR_SECRET = patch.QR_SECRET.trim()
}

/** Ringkasan konfigurasi yang dikirim ke halaman Pengaturan (khusus Admin). */
export function getEnvConfigView() {
  return {
    GEMINI_API_KEY: CONFIG.GEMINI_API_KEY,
    ADMIN_HOST: CONFIG.ADMIN_HOST,
    FIELD_HOST: CONFIG.FIELD_HOST,
    ANDROID_PACKAGE: CONFIG.ANDROID_PACKAGE,
    ANDROID_SHA256: CONFIG.ANDROID_SHA256.join(", "),
    DEMO_PASSWORD: CONFIG.DEMO_PASSWORD,
    DEV_SHOW_OTP: CONFIG.DEV_SHOW_OTP,
    SIM_URL: CONFIG.SIM_URL,
    JWT_SECRET: CONFIG.JWT_SECRET,
    QR_SECRET: CONFIG.QR_SECRET,
    // Info baca-saja (diatur saat proses server mulai)
    NODE_ENV: CONFIG.NODE_ENV,
    PORT: CONFIG.PORT,
    DIALECT: CONFIG.DATABASE_URL ? "postgres" : "sqlite",
  }
}
