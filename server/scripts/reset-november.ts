/**
 * Reset data transaksi + isi data demo November 2026 (1 Nov s.d. kemarin).
 * TETAP: akun & peran, sekolah, faktor emisi, jenis pohon, konfigurasi, kalender sekolah, aset (pohon/AC/biopori/sensor), log audit.
 * DIHAPUS: input bulanan, bukti, baseline, timbangan, survei, ukur pohon, bacaan sensor, rapor, persetujuan, temuan, buku engine, notifikasi.
 * Cadangan database dibuat terpisah sebelum skrip ini dijalankan (data/backups).
 */
import { q, transaction } from "../src/db"
import { addDays, todayWIB } from "../src/lib"
import * as C from "../src/engine/calc"
import { dayInfo, loadContext } from "../src/engine/engine"
import { WASTE_FACTOR } from "../src/routes/field"
import { runAll } from "../src/engine/ledger"

const today = todayWIB()
const MONTH = today.slice(0, 7)            // bulan ini
const START = `${MONTH}-01`
const YESTERDAY = addDays(today, -1)
let seed = 20261101
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
const jitter = (v: number, p: number) => v * (1 + (rnd() * 2 - 1) * p)
const id = (r: { lastInsertRowid: number | bigint }) => Number(r.lastInsertRowid)

// ---------- ambil referensi sebelum dihapus ----------
const orgs = await q.all("SELECT * FROM organizations ORDER BY id")
const ops = Object.fromEntries((await q.all("SELECT org_id, user_id FROM role_assignments WHERE role = 'operator'")).map((r) => [r.org_id, r.user_id]))
const pets = Object.fromEntries((await q.all("SELECT org_id, user_id FROM role_assignments WHERE role = 'petugas'")).map((r) => [r.org_id, r.user_id]))
const lastAct: Record<string, any> = {}
for (const r of await q.all("SELECT * FROM activity_records WHERE superseded = 0 ORDER BY period")) lastAct[`${r.org_id}:${r.source}`] = r
const lastDbh = new Map<number, any>()
for (const m of await q.all("SELECT * FROM tree_measurements ORDER BY date")) lastDbh.set(m.asset_id, m)
const respTpl: Record<number, any[]> = {}
for (const o of orgs) {
  const sv = await q.get("SELECT id FROM mobility_surveys WHERE org_id = ? ORDER BY COALESCE(period, created_at) DESC LIMIT 1", o.id)
  respTpl[o.id] = sv ? await q.all("SELECT * FROM mobility_responses WHERE survey_id = ?", sv.id) : []
}
const wasteTpl: Record<number, Record<string, number>> = {}
for (const o of orgs) {
  const s = await q.get("SELECT id FROM waste_sessions WHERE org_id = ? ORDER BY start_date DESC LIMIT 1", o.id)
  const rows = s ? await q.all("SELECT category, treatment, AVG(kg) AS kg FROM waste_weighings WHERE session_id = ? GROUP BY category, treatment", s.id) : []
  wasteTpl[o.id] = Object.fromEntries(rows.map((r) => [`${r.category}|${r.treatment}`, r.kg]))
}

await transaction(async () => {
  // ---------- 1. hapus data transaksi ----------
  for (const t of ["calculation_results", "day_ledger", "ledger_state", "notifications", "findings", "verification_tasks", "field_samples", "reports",
    "baseline_components", "baselines", "waste_weighings", "waste_sessions", "mobility_responses", "mobility_surveys",
    "iot_readings", "iot_heartbeats", "tree_measurements", "activity_records", "evidence", "rainfall", "env_records"])
    await q.run(`DELETE FROM ${t}`)
  // aset tetap ada, didata (ulang) mulai awal bulan ini
  await q.run("UPDATE assets SET created_at = ? WHERE created_at < ?", `${START} 08:00:00`, `${START} 08:00:00`)
  await q.run("UPDATE iot_devices SET last_seen_at = NULL, paired_at = NULL")

  for (const o of orgs) {
    const op = ops[o.id], pet = pets[o.id] ?? op
    // ---------- 2. input bulanan November (status disahkan) ----------
    for (const src of ["listrik", "lpg", "kertas", "genset", "plts"]) {
      const ref = lastAct[`${o.id}:${src}`]
      if (!ref) continue
      const qty = Math.round(jitter(ref.quantity, 0.06) * 10) / 10
      await q.run(`INSERT INTO activity_records(org_id, source, period, quantity, unit, meta, method, revision, status, created_by, submitted_by, verified_by, note, created_at)
        VALUES (?,?,?,?,?,?,?,1,'terverifikasi',?,?,?,?,?)`, o.id, src, MONTH, qty, ref.unit, ref.meta, "aktual", op, op, op, "Data demo November 2026", `${MONTH}-05 09:00:00`)
    }
    // ---------- 3. ukur pohon awal bulan ----------
    for (const a of await q.all("SELECT id FROM assets WHERE org_id = ? AND type = 'pohon' AND status = 'hidup'", o.id)) {
      const m = lastDbh.get(a.id)
      const dbh = m ? m.dbh : jitter(18, 0.4)
      await q.run(`INSERT INTO tree_measurements(asset_id, date, dbh, height, condition, lat, lng, accuracy, measured_by, measurer_role, status, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, a.id, addDays(START, 1), Math.round(dbh * 10) / 10, m?.height ?? null, m?.condition ?? "sehat", m?.lat ?? null, m?.lng ?? null, m?.accuracy ?? 5, pet, "operator", "terverifikasi", `${addDays(START, 1)} 08:30:00`)
    }
    // ---------- 4. survei mobilitas awal bulan (pola respons terakhir) ----------
    if (respTpl[o.id].length) {
      const sv = id(await q.run("INSERT INTO mobility_surveys(org_id, title, token, period, status, created_by, created_at) VALUES (?,?,?,?,?,?,?)",
        o.id, `Survei perjalanan ${MONTH}`, `nov-${o.id}-${Math.round(rnd() * 1e9).toString(36)}`, addDays(START, 1), "selesai", op, `${addDays(START, 1)} 07:00:00`))
      let i = 0
      for (const r of respTpl[o.id])
        await q.run("INSERT INTO mobility_responses(survey_id, class_name, role, mode, distance_km, escort, occupants, days_per_week, count, device_hash, flags, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
          sv, r.class_name, r.role, r.mode, r.distance_km, r.escort, r.occupants, r.days_per_week, r.count, `nov-${sv}-${i++}`, "[]", `${addDays(START, 1)} 08:00:00`)
    }
    // ---------- 5. penimbangan sampah 5 hari sekolah pertama ----------
    const tpl = wasteTpl[o.id]
    if (Object.keys(tpl).length) {
      const ctx = await loadContext(o.id)
      const dates: string[] = []
      for (let d = START; d <= YESTERDAY && dates.length < 5; d = addDays(d, 1)) if (dayInfo(ctx, d).k > 0) dates.push(d)
      if (dates.length) {
        const s = id(await q.run("INSERT INTO waste_sessions(org_id, kind, start_date, end_date, days, status, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)",
          o.id, "ulang", dates[0], dates[dates.length - 1], dates.length, "selesai", pet, `${dates[0]} 07:00:00`))
        for (const d of dates) for (const [key, kg] of Object.entries(tpl)) {
          const [cat, treat] = key.split("|")
          await q.run("INSERT INTO waste_weighings(session_id, date, category, treatment, factor_code, kg, created_by) VALUES (?,?,?,?,?,?,?)",
            s, d, cat, treat, WASTE_FACTOR[key] ?? "WS_RESIDU_TPA", Math.round(jitter(kg, 0.15) * 100) / 100, pet)
        }
      }
    }
    // ---------- 6. bacaan sensor IoT (meter aktif) 1 Nov 00.00 WIB s.d. sekarang, tiap 15 menit ----------
    const ctx = await loadContext(o.id)
    const rec = ctx.records.get(`listrik:${MONTH}`)
    for (const dev of await q.all("SELECT * FROM iot_devices WHERE org_id = ? AND status = 'aktif' AND kind = 'kwh_meter'", o.id)) {
      const n = 30
      let act = 0, hol = 0
      for (let i = 1; i <= n; i++) { const d = `${MONTH}-${String(i).padStart(2, "0")}`; if (dayInfo(ctx, d).k > 0) act++; else hol++ }
      const alloc = C.allocateMonthly(rec?.quantity ?? 1800, act, hol, o.base_load_kwh ?? 12)
      let value = Math.round(jitter(48000, 0.2))
      const nowMs = Date.now()
      for (let t = Date.parse(`${START}T00:00:00+07:00`); t <= nowMs; t += 15 * 60 * 1000) {
        const wib = new Date(t + 7 * 3600e3)
        const d = wib.toISOString().slice(0, 10), h = wib.getUTCHours()
        const daily = dayInfo(ctx, d).k > 0 ? alloc.active : alloc.holiday
        const w = dayInfo(ctx, d).k > 0 && h >= 7 && h < 15 ? 0.09 : 0.0113 // jam sekolah memakai porsi terbesar
        value += daily * w / 4 * jitter(1, 0.1)
        await q.run("INSERT INTO iot_readings(device_id, at, value) VALUES (?,?,?)", dev.id, new Date(t).toISOString().replace("T", " ").slice(0, 19), Math.round(value * 100) / 100)
      }
      await q.run("UPDATE iot_devices SET last_seen_at = ?, paired_at = ?, rssi = -61, battery = 92 WHERE id = ?", new Date(nowMs).toISOString().replace("T", " ").slice(0, 19), `${START} 00:00:00`, dev.id)
    }
  }
})

// ---------- 7. engine menghitung & menyimpan buku November ----------
const r = await runAll()
const sum = await q.all("SELECT org_id, MIN(date) AS dari, MAX(date) AS sampai, COUNT(*) AS hari, ROUND(SUM(total)::numeric, 0) AS kg FROM day_ledger GROUP BY org_id ORDER BY org_id")
console.log({ engine: r, buku: sum })
process.exit(0)
