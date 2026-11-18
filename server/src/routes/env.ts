/**
 * Konfigurasi Sistem & Lingkungan (khusus Admin): semua variabel di `server/.env`, termasuk database.
 *   GET  /api/admin/env           → daftar variabel (rahasia disamarkan) + status perlu muat ulang
 *   PUT  /api/admin/env           → simpan perubahan { changes: {KEY: nilai|null}, confirm: [KEY…] }
 *   POST /api/admin/env/test-db   → uji koneksi database { url } tanpa mengganti apa pun
 *   POST /api/admin/env/restart   → muat ulang server (hanya bila berjalan dengan `bun --watch`)
 */
import { Hono } from "hono"
import { existsSync, accessSync, constants, utimesSync } from "fs"
import { dirname } from "path"
import { CONFIG, STARTED, reloadLiveConfig } from "../config"
import { DIALECT, getSetting, setSetting } from "../db"
import { ENV_KEYS, ENV_META, ENV_PATH, maskDbUrl, maskSecret, readEnvFile, writeEnvFile } from "../env-file"
import { audit, bad, requireAuth, requireRole } from "../lib"

export const envAdmin = new Hono()
envAdmin.use("*", requireAuth, requireRole("admin"))

/** Nilai bawaan pengembangan — tidak aman dipakai di produksi. */
const INSECURE: Record<string, string> = { JWT_SECRET: "dev-jejakhijau-secret-ganti-di-produksi", QR_SECRET: "dev-qr-hmac-secret", DEMO_PASSWORD: "lestari123" }
const isWatch = () => process.execArgv.includes("--watch")
const shown = (key: string, v?: string | null) => {
  const m = ENV_META.find((x) => x.key === key)
  return m?.kind === "secret" ? maskSecret(v) : m?.kind === "dburl" ? maskDbUrl(v) : (v ?? "")
}
/** Nilai yang sedang dipakai proses server sekarang. */
const running = (key: string): string => {
  const c: any = CONFIG
  if (key === "PORT") return String(CONFIG.PORT)
  if (key === "ANDROID_SHA256") return CONFIG.ANDROID_SHA256.join(", ")
  if (key === "DEV_SHOW_OTP") return String(CONFIG.DEV_SHOW_OTP)
  if (key in STARTED) return String((STARTED as any)[key] ?? "")
  return c[key] === undefined || c[key] === null ? "" : String(c[key])
}

function view() {
  const file = readEnvFile()
  return {
    path: "server/.env",
    exists: existsSync(ENV_PATH),
    watch: isWatch(),
    startedAt: STARTED.at,
    database: { dialect: DIALECT, url: maskDbUrl(STARTED.DATABASE_URL), path: DIALECT === "sqlite" ? STARTED.DB_PATH : null },
    items: ENV_META.map((m) => {
      const inFile = Object.prototype.hasOwnProperty.call(file, m.key)
      const fileVal = inFile ? file[m.key] : null
      const cur = running(m.key)
      return {
        ...m,
        inFile,
        value: m.kind === "secret" || m.kind === "dburl" ? shown(m.key, fileVal ?? cur) : (fileVal ?? cur),
        hasValue: !!(fileVal ?? cur),
        insecure: INSECURE[m.key] !== undefined && (fileVal ?? cur) === INSECURE[m.key],
        pendingRestart: !m.live && inFile && fileVal !== (m.key === "PORT" ? String(STARTED.PORT) : String((STARTED as any)[m.key] ?? "")),
      }
    }),
  }
}

/** Uji koneksi tanpa menyentuh koneksi yang sedang dipakai. */
async function testDatabase(url: string) {
  if (!url) {
    const p = process.env.DB_PATH || CONFIG.DB_PATH
    const dir = dirname(p)
    try { accessSync(dir, constants.W_OK) } catch { return { ok: false, error: `Folder ${dir} tidak bisa ditulisi` } }
    return { ok: true, dialect: "sqlite", detail: `SQLite di ${p}${existsSync(p) ? " (berkas sudah ada)" : " (berkas baru akan dibuat)"}` }
  }
  if (!/^postgres(ql)?:\/\//.test(url)) return { ok: false, error: "Format harus postgres://pengguna:katasandi@host:port/namadb" }
  const { SQL } = await import("bun")
  const sql = new SQL(url, { max: 1, idleTimeout: 2, connectionTimeout: 6 })
  try {
    const [v] = await sql`SELECT version() AS v, current_database() AS db`
    const [t] = await sql`SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`
    let orgs: number | null = null
    try { const [o] = await sql`SELECT COUNT(*)::int AS n FROM organizations`; orgs = o.n } catch { /* belum ada tabel */ }
    return {
      ok: true, dialect: "postgres", database: v.db, version: String(v.v).split(" ").slice(0, 2).join(" "), tables: t.n, organizations: orgs,
      detail: orgs === null ? "Database kosong — struktur tabel & data contoh akan dibuat saat server dimuat ulang." : `${t.n} tabel · ${orgs} lembaga terdaftar`,
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) }
  } finally {
    await sql.close().catch(() => {})
  }
}

function validate(key: string, v: string | null) {
  const m = ENV_META.find((x) => x.key === key)!
  if (v === null || v === "") {
    if (["JWT_SECRET", "QR_SECRET"].includes(key)) throw bad(`${m.label} tidak boleh kosong`)
    return
  }
  if (m.kind === "number" && !(Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) < 65536)) throw bad(`${m.label}: angka port 1–65535`)
  if (m.kind === "select" && !m.options!.includes(v)) throw bad(`${m.label}: pilih ${m.options!.join(" / ")}`)
  if (m.kind === "bool" && !["true", "false"].includes(v)) throw bad(`${m.label}: true/false`)
  if (m.kind === "url" && !/^https?:\/\/\S+$/.test(v)) throw bad(`${m.label}: harus diawali http:// atau https://`)
  if (m.kind === "dburl" && !/^postgres(ql)?:\/\/\S+$/.test(v)) throw bad(`${m.label}: format postgres://…`)
  if (["JWT_SECRET", "QR_SECRET"].includes(key) && v.length < 32) throw bad(`${m.label}: minimal 32 karakter`)
  if (key === "DEMO_PASSWORD" && v.length < 6) throw bad(`${m.label}: minimal 6 karakter`)
  if (key === "ANDROID_SHA256" && !v.split(",").every((s) => /^([0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}$/.test(s.trim()))) throw bad(`${m.label}: format AA:BB:… (32 pasang heksadesimal)`)
  if (/[\r\n]/.test(v)) throw bad(`${m.label}: tidak boleh berisi baris baru`)
}

envAdmin.get("/", (c) => c.json(view()))

envAdmin.post("/test-db", async (c) => {
  const { url } = await c.req.json<{ url?: string }>()
  // url kosong/tidak dikirim = uji nilai di .env sekarang
  const target = url === undefined ? (readEnvFile().DATABASE_URL ?? CONFIG.DATABASE_URL) : url.trim()
  return c.json(await testDatabase(target))
})

envAdmin.put("/", async (c) => {
  const { changes = {}, confirm = [] } = await c.req.json<{ changes?: Record<string, string | null>; confirm?: string[] }>()
  const clean: Record<string, string | null> = {}
  for (const [k, raw] of Object.entries(changes)) {
    if (!ENV_KEYS.has(k)) throw bad(`Variabel ${k} tidak dikelola dari sini`)
    const v = raw === null ? null : String(raw).trim()
    validate(k, v)
    const m = ENV_META.find((x) => x.key === k)!
    if (m.danger && !confirm.includes(k)) throw bad(`Konfirmasi diperlukan untuk ${m.label}: ${m.danger}`, 409)
    clean[k] = v
  }
  if (!Object.keys(clean).length) throw bad("Tidak ada perubahan")
  // database baru wajib lolos uji koneksi dulu
  if ("DATABASE_URL" in clean) {
    const t = await testDatabase(clean.DATABASE_URL ?? "")
    if (!t.ok) throw bad(`Uji koneksi database gagal: ${(t as any).error}`, 422)
  }
  const before = readEnvFile()
  writeEnvFile(clean)
  for (const [k, v] of Object.entries(clean)) { if (v === null) delete process.env[k]; else process.env[k] = v }
  reloadLiveConfig()
  // nilai lama dari tabel settings (versi sebelumnya) tidak boleh lagi menimpa .env
  const legacy = await getSetting<Record<string, any>>("env_config", {})
  if (legacy && Object.keys(clean).some((k) => k in legacy)) {
    for (const k of Object.keys(clean)) delete legacy[k]
    await setSetting("env_config", legacy)
  }
  const maskAll = (o: Record<string, any>) => Object.fromEntries(Object.entries(o).filter(([k]) => k in clean).map(([k, v]) => [k, shown(k, v)]))
  await audit(c, "env_update", "settings", "server/.env", maskAll(before), maskAll(clean))
  const v = view()
  return c.json({ ...v, saved: Object.keys(clean), needsRestart: v.items.some((i) => i.pendingRestart) })
})

envAdmin.post("/restart", async (c) => {
  if (!isWatch()) throw bad("Server tidak berjalan dengan `bun --watch`. Nyalakan ulang server secara manual (mis. hentikan lalu jalankan `bun run start`).", 409)
  await audit(c, "env_restart", "settings", "server", null, null)
  // menyentuh berkas sumber memicu mode --watch memuat ulang proses (membaca .env baru)
  setTimeout(() => { const f = new URL("../index.ts", import.meta.url).pathname; const t = new Date(); utimesSync(f, t, t) }, 300)
  return c.json({ ok: true })
})
