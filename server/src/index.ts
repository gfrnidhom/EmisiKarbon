import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { HTTPException } from "hono/http-exception"
import { serveStatic } from "hono/bun"
import { existsSync } from "fs"
import { q } from "./db"
import { auth } from "./routes/auth"
import { org, notifications, files, autoSubmit } from "./routes/org"
import { field } from "./routes/field"
import { wf } from "./routes/workflow"
import { admin, program, pub } from "./routes/admin"
import { iot, ingestIot, pairIot, pingIot } from "./routes/iot"
import { footprint } from "./routes/footprint"
import { crud } from "./routes/crud"
import { runDailyJob, runSlaEscalation } from "./engine/services"
import { WIB_OFFSET_MS } from "./lib"
import { CONFIG } from "./config"

// seed otomatis saat DB kosong
if (!(await q.get("SELECT 1 FROM organizations LIMIT 1"))) {
  console.log("[seed] database kosong — mengisi data pilot…")
  await import("./seed")
}
// Pengembangan: akun demo tanpa kata sandi diberi kata sandi demo (atur DEMO_PASSWORD; dimatikan saat NODE_ENV=production)
if (!CONFIG.IS_PROD) {
  const demoPw = CONFIG.DEMO_PASSWORD
  const empty = await q.all<{ id: number }>("SELECT id FROM users WHERE password_hash IS NULL")
  if (empty.length) {
    const h = await Bun.password.hash(demoPw)
    for (const u of empty) await q.run("UPDATE users SET password_hash = ? WHERE id = ?", h, u.id)
    console.log(`[dev] ${empty.length} akun demo diberi kata sandi "${demoPw}"`)
  }
}

const app = new Hono()
app.use("*", logger())
app.use("/api/*", cors())

// rate limiting sederhana (NFR-07)
const hits = new Map<string, { n: number; t: number }>()
app.use("/api/*", async (c, next) => {
  const key = (c.req.header("x-forwarded-for") ?? "local") + (/^\/api\/auth\/(otp|login|register|invite)/.test(c.req.path) ? ":auth" : "")
  const now = Date.now()
  const h = hits.get(key) ?? { n: 0, t: now }
  if (now - h.t > 60_000) { h.n = 0; h.t = now }
  h.n++
  hits.set(key, h)
  if (h.n > (key.endsWith(":auth") ? 30 : 1200)) return c.json({ error: "Terlalu banyak permintaan, coba lagi sebentar" }, 429)
  await next()
})

app.get("/api/health", (c) => c.json({ ok: true, time: new Date().toISOString() }))
// Endpoint perangkat IoT (tanpa login, autentikasi lewat token di URL)
const devIp = (c: any) => c.req.header("x-forwarded-for") ?? (c.env?.requestIP ? c.env.requestIP(c.req.raw)?.address : null) ?? null
const devBody = (c: any) => c.req.json().catch(() => ({}))
app.post("/api/public/iot/:token/pair", async (c) => c.json(await pairIot(c.req.param("token"), await devBody(c), devIp(c))))
app.post("/api/public/iot/:token/ping", async (c) => c.json(await pingIot(c.req.param("token"), await devBody(c), devIp(c))))
app.post("/api/public/iot/:token", async (c) => c.json(await ingestIot(c.req.param("token"), await devBody(c), devIp(c))))
app.route("/api/auth", auth)
app.route("/api/me", footprint)
app.route("/api/public", pub)
app.route("/api/orgs", org)
app.route("/api/notifications", notifications)
app.route("/api/files", files)
app.route("/api", field)
app.route("/api", wf)
app.route("/api", iot)
app.route("/api", crud)
app.route("/api/admin", admin)
app.route("/api/program", program)

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
  console.error(err)
  return c.json({ error: "Terjadi kesalahan server" }, 500)
})

// Digital Asset Links untuk APK Android (TWA): membuktikan aplikasi & domain milik pemilik yang sama,
// sehingga APK tampil layar penuh tanpa bilah alamat. Isi lewat .env:
//   ANDROID_PACKAGE=id.sekolahlestari.petugas
//   ANDROID_SHA256=AA:BB:…   (sidik jari kunci penandatangan; boleh beberapa, pisahkan koma — mis. kunci lokal + kunci Play Console)
app.get("/.well-known/assetlinks.json", (c) => {
  const pkg = CONFIG.ANDROID_PACKAGE
  const prints = CONFIG.ANDROID_SHA256
  if (!pkg || !prints.length) return c.json([])
  return c.json([{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: prints } }])
})

// Sajikan tiga aplikasi web sesuai domain (monorepo apps/*):
//   domain utama → apps/web · admin.<domain> → apps/admin · petugas.<domain> → apps/petugas
// Nama host bisa ditetapkan pasti lewat config.ts / .env: ADMIN_HOST=admin.sekolahlestari.id, FIELD_HOST=petugas.sekolahlestari.id
const APPS_DIR = new URL("../../apps/", import.meta.url).pathname
type AppKind = "web" | "admin" | "petugas"
function appOfHost(host = ""): AppKind {
  const h = host.split(":")[0].toLowerCase()
  if (CONFIG.ADMIN_HOST && h === CONFIG.ADMIN_HOST) return "admin"
  if (CONFIG.FIELD_HOST && h === CONFIG.FIELD_HOST) return "petugas"
  if (h.startsWith("admin.")) return "admin"
  if (h.startsWith("petugas.")) return "petugas"
  return "web"
}
const statics: Partial<Record<AppKind, { root: string; mw: ReturnType<typeof serveStatic> }>> = {}
function staticFor(k: AppKind) {
  if (statics[k]) return statics[k]
  const root = `${APPS_DIR}${k}/dist/`
  if (!existsSync(root + "index.html")) return null // belum di-build — dicek ulang tiap permintaan
  return (statics[k] = { root, mw: serveStatic({ root }) })
}
app.use("/*", async (c, next) => {
  if (c.req.path.startsWith("/api")) return next()
  const s = staticFor(appOfHost(c.req.header("host")))
  if (!s) return next()
  return s.mw(c, next)
})
app.get("*", (c) => {
  if (c.req.path.startsWith("/api")) return c.notFound()
  const s = staticFor(appOfHost(c.req.header("host")))
  return s ? c.html(Bun.file(s.root + "index.html").text() as any) : c.text("Aplikasi belum di-build. Jalankan: bun run build", 503)
})

// Penjadwal: tutup buku harian 00.30 WIB (CALC-02) — hari kemarin disimpan sebagai angka resmi, eskalasi SLA, pengajuan otomatis tgl 10 (ACT-04)
let lastRun = ""
setInterval(async () => {
  const wib = new Date(Date.now() + WIB_OFFSET_MS)
  const day = wib.toISOString().slice(0, 10)
  if (wib.getUTCHours() === 0 && wib.getUTCMinutes() >= 30 && lastRun !== day) {
    lastRun = day
    try {
      const r = (await runDailyJob())
      const esc = (await runSlaEscalation())
      const sub = wib.getUTCDate() === 10 ? (await autoSubmit()) : 0
      console.log(`[job] tutup buku ${r.date}: ${r.orgs} lembaga, ${r.closed} hari ditutup, ${r.changed} berubah, ${r.ms.toFixed(0)} ms; eskalasi ${esc}; auto-ajukan ${sub}`)
      if (r.ms > 30 * 60 * 1000) console.error("[ALERT] job hitung melewati 30 menit")
    } catch (e) {
      console.error("[ALERT] job hitung gagal", e)
    }
  }
}, 60_000)

// Engine tiap 10 menit: catch-up hari terlewat, hitung ulang hari terbuka bila ada data baru, perbarui hari ini (sementara)
setInterval(async () => {
  try { await runDailyJob() } catch (e) { console.error("[ALERT] engine 10 menit gagal", e) }
}, 10 * 60 * 1000)

// Catch-up saat server menyala: tutup hari-hari yang terlewat selama server mati (tidak menunggu 00.30)
setTimeout(async () => {
  try { const r = await runDailyJob(); if (r.closed) console.log(`[tutup buku] catch-up ${r.closed} hari (${r.changed} berubah), ${r.ms.toFixed(0)} ms`) }
  catch (e) { console.error("[ALERT] catch-up tutup buku gagal", e) }
  // migrasi klasifikasi scope baseline lama (sampah diolah di sekolah → komponen tersendiri); idempoten
  try { const { splitLegacyWasteComponents } = await import("./engine/services"); const m = await splitLegacyWasteComponents(); if (m.length) console.log("[baseline] sampah dipecah (Scope 1/3):", m) }
  catch (e) { console.error("[ALERT] migrasi komponen sampah baseline gagal", e) }
}, 3000)

const port = CONFIG.PORT
console.log(`🌳 Sekolah Lestari API berjalan di http://localhost:${port}`)
export default { port, fetch: app.fetch }
