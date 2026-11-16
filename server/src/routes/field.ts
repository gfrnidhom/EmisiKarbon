// Pohon & aset ber-QR (TREE-*), sampah (ENG-01/02), mobilitas (ACT-02, ENG-08), jasa lingkungan (ENV-*).
import { Hono } from "hono"
import { q, json } from "../db"
import { addDays, assertOrg, assertOrgRole, audit, bad, daysBetween, monthOf, qrSign, qrVerify, randomToken, requireAuth, sha256, todayWIB, parseJsonCols, rowId } from "../lib"
import { buildTree, computeAvoided, loadContext, loadTrees, mobilityFromSurvey, speciesEq, treeAbsorption, treeAt, treeDaily, treeStock, computeRange, MODE_FACTOR } from "../engine/engine"
import { assetEco, dataStartDate, markDirty, readDays, sumEco } from "../engine/ledger"
import * as C from "../engine/calc"

export const field = new Hono()
field.use("*", requireAuth)
const oid = (c: any) => Number(c.req.param("orgId"))

// ======================= ASET & POHON =======================
async function nextCode(orgId: number, type: string) {
  const o = (await q.get("SELECT short FROM organizations WHERE id = ?", orgId))!
  const prefix = { pohon: "PH", biopori: "BP", komposter: "KP", panel: "PV", ac: "AC", genset: "GS", bank_sampah: "BS", atap: "AT" }[type] ?? "AS"
  // nomor terbesar + 1 (bukan jumlah + 1) agar tidak bentrok setelah ada aset yang dihapus
  const base = `${o.short}-${prefix}-`
  const rows = await q.all<{ code: string }>("SELECT code FROM assets WHERE code LIKE ?", `${base}%`)
  const max = rows.reduce((m, r) => Math.max(m, Number(r.code.slice(base.length)) || 0), 0)
  return `${base}${String(max + 1).padStart(4, "0")}`
}
export async function treeSummary(a: any, date = todayWIB()) {
  const sp = (await q.get("SELECT * FROM species WHERE id = ?", a.species_id))
  const ms = (await q.all("SELECT * FROM tree_measurements WHERE asset_id = ? AND measurer_role = 'operator' AND status != 'ditolak' ORDER BY date, id", a.id))
  if (!sp) return { last: null, state: null }
  const t = buildTree(a, sp, ms)
  const st = treeAt(t, date)
  const last = ms[ms.length - 1]
  return {
    species: sp.local_name, scientific: sp.scientific, model: sp.equation === "chave" ? "Model umum (Chave 2014)" : "Alometrik jenis",
    last: last ? { date: last.date, dbh: last.dbh, height: last.height } : null,
    state: st, extrapolated: st ? C.isExtrapolated(speciesEq(sp), st.dbh) : false,
    dueRemeasure: last ? daysBetween(last.date, date) >= 180 : false, daysSince: last ? daysBetween(last.date, date) : null,
    growthHistory: t.growthHistory,
  }
}

field.get("/orgs/:orgId/assets", async (c) => {
  const id = oid(c); (await assertOrg(c, id))
  const type = c.req.query("type")
  const rows = (await q.all(`SELECT a.*, s.local_name AS species_name, s.scientific AS species_scientific, s.description AS species_description FROM assets a LEFT JOIN species s ON s.id = a.species_id WHERE a.org_id = ? ${type ? "AND a.type = ?" : ""} ORDER BY a.code`, ...(type ? [id, type] : [id])))
  return c.json((await Promise.all(rows.map(async (a) => {
    const base = parseJsonCols(a, ["meta", "flags"])
    if (a.type !== "pohon") return base
    const s = (await treeSummary(a))
    return { ...base, last: s.last, dbhNow: s.state?.dbh ?? null, stock: s.state?.stock ?? 0, label: s.state?.label, stopped: s.state?.stopped, dueRemeasure: s.dueRemeasure, daysSince: s.daysSince }
  }))))
})

// Pendaftaran aset baru (pohon, biopori, AC, …) oleh Operator/Admin; Petugas mengukur aset yang sudah terdaftar
field.post("/orgs/:orgId/assets", async (c) => {
  const id = oid(c); (await assertOrgRole(c, id, "operator", "admin"))
  const b = await c.req.json()
  const type = String(b.type)
  if (!["pohon", "biopori", "komposter", "panel", "ac", "genset", "bank_sampah", "atap"].includes(type)) throw bad("Jenis aset tidak dikenal")
  const flags: string[] = []
  if (type === "pohon" && b.lat && b.lng) {
    // Duplikasi: dua pohon berjarak < 1 m dengan jenis sama → blokir
    const near = (await q.all("SELECT id, code, lat, lng FROM assets WHERE org_id = ? AND type = 'pohon' AND species_id = ? AND status = 'hidup'", id, b.species_id))
      .find((t) => t.lat && haversine(t.lat, t.lng, b.lat, b.lng) < 1)
    if (near && !b.force) throw bad(`Kemungkinan duplikat: ${near.code} berjarak < 1 m dengan jenis sama`, 409)
    if (b.gps_accuracy && b.gps_accuracy > 15) flags.push("Lokasi diragukan: akurasi GPS > 15 m")
    if ((await outsideSite(id, b.lat, b.lng))) flags.push("Lokasi diragukan: di luar batas area sekolah + 20 m")
  }
  const code = b.code && !(await q.get("SELECT 1 FROM assets WHERE code = ?", b.code)) ? b.code : (await nextCode(id, type))
  const r = (await q.run("INSERT INTO assets(org_id, type, code, qr_sig, name, species_id, lat, lng, gps_accuracy, meta, flags, planted_at, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    id, type, code, qrSign(code), b.name ?? null, b.species_id ?? null, b.lat ?? null, b.lng ?? null, b.gps_accuracy ?? null, JSON.stringify(b.meta ?? {}), JSON.stringify(flags), b.planted_at ?? null, c.get("user").id))
  const assetId = Number(r.lastInsertRowid)
  if (type === "pohon" && b.dbh) await (await addMeasurement(c, assetId, { ...b, date: b.date ?? todayWIB() }))
  ;(await audit(c, "create", "asset", assetId, null, b))
  ;(await markDirty(id))
  return c.json({ id: assetId, code, flags })
})

field.get("/assets/:id", async (c) => {
  const a = (await q.get("SELECT a.*, o.name AS org_name, s.local_name AS species_name, s.scientific AS species_scientific, s.description AS species_description FROM assets a JOIN organizations o ON o.id = a.org_id LEFT JOIN species s ON s.id = a.species_id WHERE a.id = ?", (await rowId("assets", c.req.param("id")))))
  if (!a) throw bad("Aset tidak ditemukan", 404)
  ;(await assertOrg(c, a.org_id))
  const all = (await q.all("SELECT m.*, u.name AS measurer FROM tree_measurements m LEFT JOIN users u ON u.id = m.measured_by WHERE asset_id = ? ORDER BY date, id", a.id))
  let series: any[] = []
  const s = a.type === "pohon" ? (await treeSummary(a)) : null
  if (a.type === "pohon" && all.length) {
    const sp = (await q.get("SELECT * FROM species WHERE id = ?", a.species_id))!
    const t = buildTree(a, sp, all.filter((m) => m.measurer_role === "operator" && m.status !== "ditolak"))
    const start = t.ms[0]?.date
    if (start) {
      const end = addDays(todayWIB(), 180)
      const step = Math.max(Math.ceil(daysBetween(start, end) / 60), 7)
      for (let d = start; d <= end; d = addDays(d, step)) {
        const st = treeAt(t, d)
        if (st) series.push({ date: d, dbh: st.dbh, stock: st.stock, label: d > todayWIB() ? "proyeksi" : st.label })
      }
      for (const m of t.ms) series.push({ date: m.date, dbh: m.dbh, stock: C.treeStockCO2(speciesEq(sp), m.dbh, m.height), label: "terukur", measured: true })
      series.sort((x, y) => x.date.localeCompare(y.date))
    }
  }
  return c.json({ ...parseJsonCols(a, ["meta", "flags"]), measurements: all.map((m) => parseJsonCols(m, ["photos", "flags", "stems"])), summary: s, series })
})

// Ubah data aset & status (mati/ditebang = pelepasan karbon) hanya Operator/Admin; Petugas mengukur saja
field.patch("/assets/:id", async (c) => {
  const a = (await q.get("SELECT * FROM assets WHERE id = ?", (await rowId("assets", c.req.param("id")))))
  if (!a) throw bad("Tidak ditemukan", 404)
  ;(await assertOrgRole(c, a.org_id, "operator", "admin"))
  const b = await c.req.json()
  // TREE-06: pohon mati/ditebang = pelepasan stok
  if (b.status && b.status !== a.status) {
    if (!["hidup", "mati", "ditebang"].includes(b.status)) throw bad("Status tidak valid")
    ;(await q.run("UPDATE assets SET status = ?, dead_at = ?, dead_reason = ? WHERE id = ?", b.status, b.status === "hidup" ? null : b.dead_at ?? todayWIB(), b.dead_reason ?? null, a.id))
  }
  for (const k of ["name", "species_id", "lat", "lng"]) if (k in b) (await q.run(`UPDATE assets SET ${k} = ? WHERE id = ?`, b[k], a.id))
  if (b.meta) (await q.run("UPDATE assets SET meta = ? WHERE id = ?", JSON.stringify({ ...json(a.meta, {}), ...b.meta }), a.id))
  ;(await audit(c, "update", "asset", a.id, a, b))
  ;(await markDirty(a.org_id))
  return c.json({ ok: true })
})

field.post("/assets/:id/measurements", async (c) => {
  const a = (await q.get("SELECT * FROM assets WHERE id = ?", (await rowId("assets", c.req.param("id")))))
  if (!a) throw bad("Aset tidak ditemukan", 404)
  ;(await assertOrgRole(c, a.org_id, "operator", "petugas", "admin"))
  if (a.type !== "pohon") throw bad("Pengukuran DBH hanya untuk pohon", 400)
  const b = await c.req.json()
  // Label QR dari Generator batch (belum dipasang / tanpa jenis): pengukuran pertama memasang & mengaktifkan pohon
  if (a.type === "pohon" && (a.status === "belum_dipasang" || !a.species_id)) {
    const sp = b.species_id ? (await q.get("SELECT id FROM species WHERE id = ? AND active = 1", Number(b.species_id))) : null
    if (!sp) throw bad("Pohon ini belum terdaftar jenisnya — pilih jenis pohon pada pengukuran pertama", 422)
    ;(await q.run("UPDATE assets SET species_id = ?, status = 'hidup', lat = COALESCE(?, lat), lng = COALESCE(?, lng), gps_accuracy = COALESCE(?, gps_accuracy), created_at = CASE WHEN status = 'belum_dipasang' THEN datetime('now') ELSE created_at END WHERE id = ?",
      sp.id, b.lat ?? null, b.lng ?? null, b.accuracy ?? null, a.id))
    ;(await audit(c, "activate", "asset", a.id, { status: a.status, species_id: a.species_id }, { status: "hidup", species_id: sp.id }))
  }
  const res = await addMeasurement(c, a.id, { ...b, idempotency_key: c.req.header("Idempotency-Key") ?? b.idempotency_key })
  ;(await markDirty(a.org_id)) // stok & serapan pohon di buku harian ikut diperbarui
  return c.json(res)
})

async function addMeasurement(c: any, assetId: number, b: any) {
  // Idempotency key untuk sinkronisasi offline (§8.2)
  if (b.idempotency_key) {
    const dup = (await q.get("SELECT * FROM tree_measurements WHERE idempotency_key = ?", b.idempotency_key))
    if (dup) return { ...dup, duplicate: true }
  }
  const a = (await q.get("SELECT * FROM assets WHERE id = ?", assetId))!
  const user = c.get("user")
  const isVerifier = !!(await q.get("SELECT 1 FROM verifier_assignments WHERE org_id = ? AND user_id = ?", a.org_id, user.id)) && b.role === "verifikator"
  const stems: number[] | undefined = Array.isArray(b.stems) && b.stems.length > 1 ? b.stems.map(Number) : undefined
  const dbh = stems ? C.equivalentDbh(stems) : Number(b.dbh)
  if (!(dbh > 0)) throw bad("DBH wajib diisi (cm)")
  const flags: string[] = []
  if (dbh < 5 || dbh > 200) flags.push(`DBH ${dbh.toFixed(1)} cm di luar kewajaran (5–200 cm)`)
  if (b.accuracy && b.accuracy > 15) flags.push("Lokasi diragukan: akurasi GPS > 15 m")
  const prev = (await q.get("SELECT * FROM tree_measurements WHERE asset_id = ? AND measurer_role = 'operator' ORDER BY date DESC, id DESC LIMIT 1", assetId))
  const date = b.date ?? todayWIB()
  if (prev && !isVerifier) {
    // Konsistensi waktu: DBH turun > 5% → wajib alasan
    if (dbh < prev.dbh * 0.95 && !b.reason) throw bad("DBH turun > 5% dari pengukuran sebelumnya: pilih alasan (rusak / salah ukur) dan lampirkan foto", 422)
    if (dbh < prev.dbh * 0.95) flags.push(`DBH turun > 5% (${b.reason})`)
    const days = daysBetween(prev.date, date)
    if (days > 0) {
      const g = C.calibratedGrowth(prev.dbh, dbh, days)
      if (days >= 30 && C.growthCheck(g, prev.dbh, dbh) === "periksa") flags.push(`Riap ${g.toFixed(2)} cm/th di luar 0–6 → antrian periksa`)
    }
  }
  const r = (await q.run("INSERT INTO tree_measurements(asset_id, date, dbh, stems, height, condition, photos, lat, lng, accuracy, measured_by, measurer_role, status, reason, flags, idempotency_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    assetId, date, dbh, stems ? JSON.stringify(stems) : null, b.height ?? null, b.condition ?? "baik", JSON.stringify(b.photos ?? []), b.lat ?? null, b.lng ?? null, b.accuracy ?? null,
    user.id, isVerifier ? "verifikator" : "operator", "draf", b.reason ?? null, JSON.stringify(flags), b.idempotency_key ?? null))
  ;(await audit(c, "measure", "asset", assetId, prev ?? null, { dbh, date, role: isVerifier ? "verifikator" : "operator" }))
  let comparison = null
  if (isVerifier) {
    const op = (await q.get("SELECT * FROM tree_measurements WHERE asset_id = ? AND measurer_role = 'operator' ORDER BY date DESC LIMIT 1", assetId))
    if (op) comparison = { operator: op.dbh, verifier: dbh, diffPct: ((dbh - op.dbh) / op.dbh) * 100, pass: Math.abs(dbh - op.dbh) / op.dbh <= 0.05 }
  }
  return { id: Number(r.lastInsertRowid), dbh, flags, comparison }
}

// QR: verifikasi tanda tangan (TREE-01/02)
field.get("/qr/:code", async (c) => {
  const code = c.req.param("code"), sig = c.req.query("s") ?? ""
  if (!qrVerify(code, sig)) throw bad("QR tidak valid atau telah diubah", 403)
  const a = (await q.get("SELECT id, uuid, org_id, type, code, status, species_id, name, meta, created_at FROM assets WHERE code = ?", code))
  if (!a) throw bad("Aset tidak ditemukan", 404)
  ;(await assertOrg(c, a.org_id))
  return c.json(parseJsonCols(a, ["meta"]))
})
field.post("/orgs/:orgId/qr-batch", async (c) => {
  const id = oid(c); (await assertOrgRole(c, id, "operator", "admin"))
  const { type = "pohon", count = 10 } = await c.req.json()
  const n = Math.min(Math.max(Number(count), 1), 200)
  const out = []
  for (let i = 0; i < n; i++) {
    const code = (await nextCode(id, type))
    ;(await q.run("INSERT INTO assets(org_id, type, code, qr_sig, status, created_by) VALUES (?,?,?,?,?,?)", id, type, code, qrSign(code), "belum_dipasang", c.get("user").id))
    out.push({ code, sig: qrSign(code) })
  }
  ;(await audit(c, "qr_batch", "organization", id, null, { type, n }))
  return c.json(out)
})

const haversine = (la1: number, lo1: number, la2: number, lo2: number) => {
  const R = 6371000, toR = Math.PI / 180
  const dLa = (la2 - la1) * toR, dLo = (lo2 - lo1) * toR
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * toR) * Math.cos(la2 * toR) * Math.sin(dLo / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}
async function outsideSite(orgId: number, lat: number, lng: number) {
  const o = (await q.get("SELECT lat, lng, land_m2 FROM organizations WHERE id = ?", orgId))
  if (!o?.lat) return false
  const radius = Math.sqrt((o.land_m2 || 10000) / Math.PI) + 20
  return haversine(o.lat, o.lng, lat, lng) > radius * 1.5
}

// ======================= SAMPAH =======================
field.get("/orgs/:orgId/waste", async (c) => {
  const id = oid(c); (await assertOrg(c, id))
  const ctx = (await loadContext(id))
  const sessions = (await Promise.all((await q.all("SELECT * FROM waste_sessions WHERE org_id = ? ORDER BY start_date DESC", id)).map(async (s) => {
    const w = (await q.all("SELECT * FROM waste_weighings WHERE session_id = ? ORDER BY date", s.id))
    const found = ctx.sessions.find((x) => x.s.id === s.id)
    const total = found?.avgs.reduce((a, b) => a + b.kgPerDay, 0) ?? 0
    const emis = found?.avgs.reduce((a, b) => a + b.kgPerDay * (ctx.fe[b.factor]?.value ?? 0), 0) ?? 0
    const perPerson = ctx.population ? total / ctx.population : 0
    return { ...s, weighings: w, avgs: found?.avgs ?? [], totalKgPerDay: total, co2ePerDay: emis, perPerson, plausible: perPerson >= 0.01 && perPerson <= 0.15, nDays: new Set(w.map((x) => x.date)).size }
  })))
  return c.json({ sessions, population: ctx.population })
})
// Sesi timbang dimulai Operator/Admin; Petugas Monitoring mencatat timbangan harian di sesi itu
field.post("/orgs/:orgId/waste/sessions", async (c) => {
  const id = oid(c); (await assertOrgRole(c, id, "operator", "admin"))
  const b = await c.req.json()
  const kind = b.kind === "baseline" ? "baseline" : "ulang"
  const days = kind === "baseline" ? 8 : 5
  const r = (await q.run("INSERT INTO waste_sessions(org_id, kind, start_date, days, created_by) VALUES (?,?,?,?,?)", id, kind, b.start_date ?? todayWIB(), days, c.get("user").id))
  ;(await audit(c, "create", "waste_session", r.lastInsertRowid, null, b))
  ;(await markDirty(id))
  return c.json({ id: Number(r.lastInsertRowid) })
})
export const WASTE_FACTOR: Record<string, string> = {
  "makanan|kompos": "WS_KOMPOS", "makanan|tpa": "WS_MAKANAN_TPA", "kebun|kompos": "WS_KOMPOS", "kebun|tpa": "WS_KEBUN_TPA",
  "kertas|bank_sampah": "WS_DAUR_ULANG", "kertas|tpa": "WS_KERTAS_TPA", "plastik|bank_sampah": "WS_DAUR_ULANG",
  "plastik|tpa": "WS_RESIDU_TPA", "plastik|bakar": "WS_PLASTIK_BAKAR", "residu|tpa": "WS_RESIDU_TPA",
}
field.post("/waste/sessions/:id/weighings", async (c) => {
  const s = (await q.get("SELECT * FROM waste_sessions WHERE id = ?", (await rowId("waste_sessions", c.req.param("id")))))
  if (!s) throw bad("Sesi tidak ditemukan", 404)
  ;(await assertOrgRole(c, s.org_id, "operator", "petugas", "admin"))
  const { date, entries } = await c.req.json<{ date: string; entries: { category: string; treatment: string; kg: number }[] }>()
  for (const e of entries) {
    const fc = WASTE_FACTOR[`${e.category}|${e.treatment}`]
    if (!fc) throw bad(`Kombinasi ${e.category} → ${e.treatment} tidak dikenal`)
    if (!(e.kg >= 0)) continue
    ;(await q.run("INSERT INTO waste_weighings(session_id, date, category, treatment, factor_code, kg, created_by) VALUES (?,?,?,?,?,?,?) ON CONFLICT(session_id, date, category, treatment) DO UPDATE SET kg = excluded.kg",
      s.id, date, e.category, e.treatment, fc, Number(e.kg), c.get("user").id))
  }
  const nDays = (await q.get<{ n: number }>("SELECT COUNT(DISTINCT date) AS n FROM waste_weighings WHERE session_id = ?", s.id))!.n
  const maxDate = (await q.get<{ d: string }>("SELECT MAX(date) AS d FROM waste_weighings WHERE session_id = ?", s.id))!.d
  ;(await q.run("UPDATE waste_sessions SET status = ?, end_date = ? WHERE id = ?", nDays >= s.days ? "selesai" : "berjalan", maxDate, s.id))
  ;(await audit(c, "weigh", "waste_session", s.id, null, { date, entries }))
  ;(await markDirty(s.org_id))
  return c.json({ ok: true, nDays, complete: nDays >= s.days })
})

// ======================= MOBILITAS =======================
field.get("/orgs/:orgId/mobility", async (c) => {
  const id = oid(c); (await assertOrg(c, id))
  const ctx = (await loadContext(id))
  const surveys = (await Promise.all((await q.all("SELECT * FROM mobility_surveys WHERE org_id = ? ORDER BY created_at DESC", id)).map(async (s) => {
    const resps = (await q.all("SELECT * FROM mobility_responses WHERE survey_id = ?", s.id))
    const classes = json<Record<string, number>>(s.classes, {})
    const byClass = Object.entries(classes).map(([name, size]) => {
      const n = resps.filter((r) => r.class_name === name).reduce((a, r) => a + (r.count ?? 1), 0)
      return { name, size, n, rate: size ? n / size : 0, flagged: size ? n / size < 0.7 : true }
    })
    const byMode: Record<string, { n: number; km: number; kg: number }> = {}
    for (const r of resps) {
      const resp = { distanceKm: r.distance_km, escort: r.escort === 2 ? 2 as const : 1 as const, occupants: r.mode === "angkot" ? Math.max(r.occupants, 8) : r.occupants, factor: ctx.fe[MODE_FACTOR[r.mode]]?.value ?? 0, daysPerWeek: r.days_per_week, count: r.count }
      const km = C.mobilityKm(resp, ctx.org.school_days_per_week ?? 6)
      const m = (byMode[r.mode] ??= { n: 0, km: 0, kg: 0 })
      m.n += r.count ?? 1; m.km += km; m.kg += km * resp.factor
    }
    const result = resps.length ? mobilityFromSurvey(ctx, { s, resps }) : null
    return { ...parseJsonCols(s, ["classes"]), responses: resps.reduce((a, r) => a + (r.count ?? 1), 0), byClass, byMode, result }
  })))
  return c.json({ surveys, population: ctx.population })
})
// Survei mobilitas dibuat & dikelola Operator/Admin; Petugas Monitoring hanya memantau dan membagikan tautannya
field.post("/orgs/:orgId/mobility/surveys", async (c) => {
  const id = oid(c); (await assertOrgRole(c, id, "operator", "admin"))
  const b = await c.req.json()
  const token = randomToken(8)
  const r = (await q.run("INSERT INTO mobility_surveys(org_id, title, token, period, classes, created_by) VALUES (?,?,?,?,?,?)", id, b.title ?? `Survei mobilitas ${todayWIB()}`, token, b.period ?? todayWIB(), JSON.stringify(b.classes ?? {}), c.get("user").id))
  ;(await audit(c, "create", "mobility_survey", r.lastInsertRowid, null, b))
  return c.json({ id: Number(r.lastInsertRowid), token })
})
field.patch("/mobility/surveys/:id", async (c) => {
  const s = (await q.get("SELECT * FROM mobility_surveys WHERE id = ?", (await rowId("mobility_surveys", c.req.param("id")))))
  if (!s) throw bad("Tidak ditemukan", 404)
  ;(await assertOrgRole(c, s.org_id, "operator", "admin"))
  const b = await c.req.json()
  if (b.status) (await q.run("UPDATE mobility_surveys SET status = ? WHERE id = ?", b.status, s.id))
  if (b.classes) (await q.run("UPDATE mobility_surveys SET classes = ? WHERE id = ?", JSON.stringify(b.classes), s.id))
  if (typeof b.title === "string" && b.title.trim()) (await q.run("UPDATE mobility_surveys SET title = ? WHERE id = ?", b.title.trim().slice(0, 120), s.id))
  ;(await audit(c, "update", "mobility_survey", s.id, s, b))
  ;(await markDirty(s.org_id))
  return c.json({ ok: true })
})

// ======================= JASA LINGKUNGAN =======================
field.get("/orgs/:orgId/environment", async (c) => {
  const id = oid(c); (await assertOrg(c, id))
  const start = c.req.query("start") ?? todayWIB().slice(0, 8) + "01"
  let end = c.req.query("end") ?? todayWIB()
  if (end > todayWIB()) end = todayWIB()
  // semua angka harian dibaca dari buku engine (day_ledger); hari sebelum data pertama memang tidak ada
  const days = await readDays(id, start, end)
  const eco = sumEco(days)
  const avoided = { ...eco.avoided, ...(await assetEco(id, start, end)) }
  const rainfall = (await q.all("SELECT * FROM rainfall WHERE org_id = ? ORDER BY period DESC LIMIT 12", id))
  const plts = (await q.all("SELECT period, quantity FROM activity_records WHERE org_id = ? AND source = 'plts' AND superseded = 0 ORDER BY period DESC LIMIT 12", id))
  // per bulan: rentang panjang mengikuti filter (maks 24 bln), rentang pendek tampil 12 bulan terakhir sebagai konteks
  const mFrom = daysBetween(start, end) > 92 ? start : `${monthOf(addDays(end, -330))}-01`
  const mDays = mFrom === start ? days : await readDays(id, mFrom, end)
  const byMonth = new Map<string, { period: string; stock: number; absorbed: number; count: number }>()
  for (const d of mDays) {
    const k = d.date.slice(0, 7)
    const m = byMonth.get(k) ?? { period: k, stock: 0, absorbed: 0, count: 0 }
    m.absorbed += d.tree.absorbed; m.stock = d.tree.stock; m.count = d.tree.count
    byMonth.set(k, m)
  }
  const months = [...byMonth.values()].slice(-24)
  // harian: ikut rentang bila ≤ 92 hari, selain itu 30 hari terakhir
  const dailyDays = daysBetween(start, end) <= 92 ? days : days.slice(-30)
  const dailyRows = dailyDays.map((d) => ({ date: d.date, absorbed: d.tree.absorbed, active: d.tree.active, emission: d.total, dayType: d.dayType, partial: d.partial }))
  const ctx = await loadContext(id)
  const motor = ctx.fe["TR_MOTOR"]?.value ?? 0
  // rincian per jenis pohon: data inventaris & ukur (deskriptif, dari tabel pohon)
  const trees = await loadTrees(id)
  const bySpecies: Record<string, { name: string; scientific: string; count: number; stock: number; daily: number }> = {}
  for (const t of trees) {
    const st = treeAt(t, end)
    if (!st || (st.stock === 0 && t.asset.status !== "hidup")) continue
    const k = t.species?.local_name ?? "?"
    bySpecies[k] ??= { name: k, scientific: t.species?.scientific ?? "", count: 0, stock: 0, daily: 0 }
    bySpecies[k].count++; bySpecies[k].stock += st.stock
    const y = treeAt(t, addDays(end, -1))
    if (y && st.stock > y.stock) bySpecies[k].daily += st.stock - y.stock
  }
  return c.json({ start, end, avoided, rainfall, plts, dataStart: await dataStartDate(id),
    trees: { ...eco.trees, months, daily: dailyRows, motorFactor: motor, species: Object.values(bySpecies).sort((x, y) => y.stock - x.stock) } })
})
field.put("/orgs/:orgId/rainfall/:period", async (c) => {
  const id = oid(c); (await assertOrgRole(c, id, "operator", "admin"))
  const { mm } = await c.req.json()
  ;(await q.run("INSERT INTO rainfall(org_id, period, mm) VALUES (?,?,?) ON CONFLICT(org_id, period) DO UPDATE SET mm = excluded.mm", id, c.req.param("period"), Number(mm)))
  return c.json({ ok: true })
})

export { sha256 }
