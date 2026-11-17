// Lembaga: profil, kalender, dasbor, telusuri angka, tugas pemantauan, aktivitas, bukti, notifikasi.
import { Hono } from "hono"
import { mkdirSync } from "fs"
import { q, json } from "../db"
import {
  addDays, daysBetween, assertOrg, assertOrgRole, assertTransition, audit, bad, monthOf, notify, orgUsers, parseJsonCols, requireAuth, sha256, todayWIB, rolesInOrg, daysInMonth,
} from "../lib"
import { computeAvoided, computeDay, computeRange, dayInfo, loadContext, loadTrees, summarize, treeAbsorption, treeBasis, treeDaily, treeStock, feVersionSet } from "../engine/engine"
import { assetEco, closingInfo, dataStartDate, isLocked, markDirty, readDay, readDays, sumEco } from "../engine/ledger"
import { createTask, monitoringTasks, validateActivity, populationOf } from "../engine/services"
import { SOURCE_META } from "../engine/factors"
import { CONFIG } from "../config"

export const org = new Hono()
org.use("*", requireAuth)

const oid = (c: any) => Number(c.req.param("orgId"))
const UPLOAD_DIR = new URL("../../data/uploads/", import.meta.url).pathname
mkdirSync(UPLOAD_DIR, { recursive: true })

// ---------------- profil ----------------
org.get("/:orgId", async (c) => {
  const id = oid(c); (await assertOrg(c, id))
  const o = (await q.get("SELECT o.*, r.name AS region_name FROM organizations o LEFT JOIN regions r ON r.id = o.region_id WHERE o.id = ?", id))
  if (!o) throw bad("Lembaga tidak ditemukan", 404)
  return c.json({ ...parseJsonCols(o, ["polygon", "none_sources"]), myRoles: (await rolesInOrg(c.get("user"), id)) })
})
org.patch("/:orgId", async (c) => {
  const id = oid(c); (await assertOrgRole(c, id, "operator", "admin"))
  const before = (await q.get("SELECT * FROM organizations WHERE id = ?", id))!
  const body = await c.req.json()
  const allowed = ["name", "npsn", "address", "kecamatan", "students", "teachers", "staff", "land_m2", "building_m2", "lat", "lng", "sanitation", "landfill", "school_days_per_week", "base_load_kwh", "none_sources", "polygon"]
  for (const k of allowed) if (k in body) (await q.run(`UPDATE organizations SET ${k} = ? WHERE id = ?`, typeof body[k] === "object" && body[k] !== null ? JSON.stringify(body[k]) : body[k], id))
  const after = (await q.get("SELECT * FROM organizations WHERE id = ?", id))
  ;(await audit(c, "update", "organization", id, before, after))
  // pemicu baseline ulang: perubahan jumlah siswa > 10% (§4.6)
  const warn = before.students && Math.abs(after!.students - before.students) / before.students > 0.1
  ;(await markDirty(id))
  return c.json({ ok: true, rebaselineSuggested: !!warn })
})
org.post("/:orgId/gis-ai", async (c) => {
  const id = oid(c); (await assertOrg(c, id))
  const key = CONFIG.GEMINI_API_KEY
  if (!key) return c.json({ fallback: true })
  const { dataUrl, center, landM2 } = await c.req.json()
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(String(dataUrl ?? ""))
  if (!m) return c.json({ fallback: true })
  const scale = Math.min(1.35, Math.max(0.75, Math.sqrt((Number(landM2) || 12000) / 12000)))
  const lat0 = Number(center?.lat) || -7.2321, lng0 = Number(center?.lng) || 111.7792
  const ll = (x: number, y: number): [number, number] => [
    Number((lat0 + (y * scale) / 110540).toFixed(6)),
    Number((lng0 + (x * scale) / (111320 * Math.cos((lat0 * Math.PI) / 180))).toFixed(6)),
  ]
  try {
    const prompt = `Analisis gambar denah/citra satelit sekolah ini dan ubah menjadi fitur GIS vektor dalam koordinat meter lokal relatif pusat lahan: x dari -60 (Barat/kiri) sampai +60 (Timur/kanan), y dari -50 (Selatan/bawah) sampai +50 (Utara/atas). Kembalikan JSON murni dengan format: {"features":[{"type":"boundary"|"building"|"field"|"garden"|"parking"|"path"|"water"|"gate","name":"nama singkat Bahasa Indonesia","pts":[[x,y],...]}]}. Wajib ada 1 boundary (4 titik mengelilingi lahan), gedung-gedung (building, 4 titik persegi panjang tiap gedung), lapangan (field), kebun/taman (garden), parkir (parking), jalur jalan (path, 2-4 titik), dan 1 gerbang (gate, 1 titik).`
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: m[1], data: m[2] } }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    })
    if (!res.ok) return c.json({ fallback: true })
    const out: any = await res.json()
    const raw = JSON.parse(out?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}")
    const valid = new Set(["boundary", "building", "field", "garden", "parking", "path", "water", "gate"])
    const features = (Array.isArray(raw.features) ? raw.features : [])
      .filter((f: any) => valid.has(f?.type) && Array.isArray(f?.pts) && f.pts.length >= (f.type === "gate" ? 1 : f.type === "path" ? 2 : 3))
      .map((f: any) => ({ type: f.type, name: f.name ? String(f.name) : undefined, coords: f.pts.map(([x, y]: [number, number]) => ll(Number(x) || 0, Number(y) || 0)) }))
    if (features.length < 3) return c.json({ fallback: true })
    return c.json({ features, mode: "ai-server" })
  } catch {
    return c.json({ fallback: true })
  }
})

// ---------------- kalender akademik (ENG-10) ----------------
org.get("/:orgId/calendar", async (c) => {
  const id = oid(c); (await assertOrg(c, id))
  const month = c.req.query("month") ?? todayWIB().slice(0, 7)
  const ctx = (await loadContext(id))
  const n = daysInMonth(month)
  const days = []
  // jenis hari = aturan kalender; emisi hanya dari buku engine (hari yang belum terjadi/tanpa data → null)
  const stored = new Map((await readDays(id, `${month}-01`, `${month}-${String(n).padStart(2, "0")}`)).map((x) => [x.date, x.total]))
  for (let i = 1; i <= n; i++) {
    const d = `${month}-${String(i).padStart(2, "0")}`
    const ov = (await q.get("SELECT * FROM calendar_days WHERE org_id = ? AND date = ?", id, d))
    const r = dayInfo(ctx, d)
    days.push({ date: d, type: r.type, k: r.k, note: ov?.note ?? null, attendance: ov?.attendance_pct ?? (r.k * 100), override: !!ov, total: stored.get(d) ?? null })
  }
  return c.json(days)
})
org.put("/:orgId/calendar/:date", async (c) => {
  const id = oid(c); (await assertOrgRole(c, id, "operator", "admin"))
  const date = c.req.param("date")
  const { type, attendance_pct, note } = await c.req.json()
  if (type === "default") (await q.run("DELETE FROM calendar_days WHERE org_id = ? AND date = ?", id, date))
  else {
    if (!["aktif", "libur", "ujian", "khusus"].includes(type)) throw bad("Jenis hari tidak valid")
    ;(await q.run("INSERT INTO calendar_days(org_id, date, type, attendance_pct, note) VALUES (?,?,?,?,?) ON CONFLICT(org_id, date) DO UPDATE SET type=excluded.type, attendance_pct=excluded.attendance_pct, note=excluded.note",
      id, date, type, type === "khusus" ? Math.min(Math.max(Number(attendance_pct ?? 50), 0), 100) : 100, note ?? null))
  }
  ;(await audit(c, "calendar", "organization", id, null, { date, type, attendance_pct, note }))
  ;(await markDirty(id))
  return c.json({ ok: true })
})

// ---------------- dasbor sekolah (REP-01) ----------------
org.get("/:orgId/dashboard", async (c) => {
  const id = oid(c); (await assertOrg(c, id))
  const today = c.req.query("date") ?? todayWIB()
  const ctx = (await loadContext(id))
  const days30 = (await readDays(id, addDays(today, -29), today, ctx))
  const monthStart = today.slice(0, 8) + "01"
  const monthDays = (await readDays(id, monthStart, today, ctx))
  // hanya dari database: hari tanpa baris (belum ada data) tidak dikarang
  const empty = { date: today, dayType: "aktif", k: 1, total: 0, scope: { 1: 0, 2: 0, 3: 0 }, sources: {}, partial: true, fraction: null, tree: { absorbed: 0, released: 0, stock: 0, count: 0, active: 0 } }
  const todayR: any = days30.find((d) => d.date === today) ?? empty
  const yesterday = days30.find((d) => d.date === addDays(today, -1)) ?? null
  // angka utama memakai hari yang sudah ditutup (s.d. kemarin); hari ini tetap tersedia terpisah sebagai sementara
  const month = summarize(monthDays.filter((d) => !d.partial))
  const last30 = summarize(days30)
  const pop = populationOf(ctx.org)
  // vs baseline (§7.11): emisi per hari aktif per orang ÷ nilai baseline − 1, per sumber
  const b = ctx.baseline
  const vsBaseline: Record<string, { current: number; baseline: number; change: number | null }> = {}
  // intensitas hanya dari hari yang sudah ditutup (hari ini masih berjalan)
  const activeDays = days30.filter((d) => d.k > 0 && !d.partial)
  for (const src of Object.keys(SOURCE_META)) {
    const bc = ctx.baselineComp[src]
    const cur = activeDays.length ? activeDays.reduce((s, d) => s + (d.sources[src]?.kg ?? 0), 0) / activeDays.length / Math.max(pop, 1) : 0
    const base = bc ? bc.daily_active_kg / Math.max(ctx.baselinePopulation, 1) : 0
    vsBaseline[src] = { current: cur, baseline: base, change: base > 0 ? cur / base - 1 : null }
  }
  const curTotal = activeDays.length ? activeDays.reduce((s, d) => s + d.total, 0) / activeDays.length / Math.max(pop, 1) : 0
  const baseTotal = b ? Object.values(ctx.baselineComp).reduce((s, x) => s + x.daily_active_kg, 0) / Math.max(ctx.baselinePopulation, 1) : 0
  const eco = sumEco(monthDays)
  const trees = (await loadTrees(id))
  const stock = { stock: todayR.tree.stock || days30.at(-1)?.tree.stock || 0, count: todayR.tree.count || days30.at(-1)?.tree.count || 0 }
  const absorbMonth = { absorbed: eco.trees.absorbed, released: eco.trees.released }
  const avoided = { ...eco.avoided, ...(await assetEco(id, monthStart, today)) }
  const confidence = Object.fromEntries(Object.keys(SOURCE_META).map((s) => {
    const labels = last30.bySource[s]?.labels ?? {}
    const tot = Object.values(labels).reduce((a, b) => a + b, 0)
    const strong = (labels.terverifikasi ?? 0) + (labels.aktual ?? 0) + (labels.terukur ?? 0)
    const share = tot ? strong / tot : 0
    return [s, share >= 0.8 ? "tinggi" : share >= 0.4 ? "sedang" : "rendah"]
  }))
  return c.json({
    date: today,
    org: { id: ctx.org.id, name: ctx.org.name, population: pop, building_m2: ctx.org.building_m2 },
    baseline: b ? { id: b.id, version: b.version_label, status: b.status, locked: b.status === "terkunci" } : null,
    feVersion: feVersionSet(ctx.fe),
    today: todayR, yesterday, dayBefore: days30.find((d) => d.date === addDays(today, -2)) ?? null, closing: (await closingInfo(id)),
    month: { ...month, label: monthOf(today) },
    trend: days30.map((d) => ({ date: d.date, total: d.total, type: d.dayType, partial: !!d.partial, scope1: d.scope[1], scope2: d.scope[2], scope3: d.scope[3], labels: Object.fromEntries(Object.entries(d.sources).map(([k, v]) => [k, v.label])) })),
    vsBaseline, intensity: { current: curTotal, baseline: baseTotal, change: baseTotal ? curTotal / baseTotal - 1 : null },
    trees: { ...stock, absorbedMonth: absorbMonth.absorbed, releasedMonth: absorbMonth.released, absorbedToday: todayR.tree.absorbed, absorbedYesterday: yesterday?.tree.absorbed ?? 0, basis: treeBasis(trees, today) },
    avoided, confidence, strongShare: last30.strongShare,
    tasks: (await monitoringTasks(id)),
  })
})

// ---------------- telusuri angka (CALC-05) ----------------
org.get("/:orgId/trace", async (c) => {
  const id = oid(c); (await assertOrg(c, id))
  const date = c.req.query("date") ?? todayWIB()
  const source = c.req.query("source")
  if (date > todayWIB()) throw bad("Tanggal belum terjadi — engine tidak menghitung masa depan", 422)
  const ctx = (await loadContext(id))
  // angka & rumus dibaca dari database (hasil engine), bukan dihitung saat halaman dibuka
  const r = await readDay(id, date)
  const first = await dataStartDate(id)
  if (!r) return c.json({ date, empty: true, dataStart: first, reason: first && date < first ? "sebelum_data" : "belum_dihitung", sources: {}, total: 0, scope: { 1: 0, 2: 0, 3: 0 }, population: ctx.population })
  const pick = source ? { [source]: r.sources[source] } : r.sources
  const out: any = {}
  for (const [k, s] of Object.entries(pick)) {
    if (!s) continue
    const recs = (await Promise.all((s.trace.recordIds ?? []).map(async (rid) => {
      const rec = (await q.get("SELECT * FROM activity_records WHERE id = ?", rid))
      if (!rec) return null
      const ev = json<number[]>(rec.evidence_ids, [])
      return { ...parseJsonCols(rec, ["meta", "flags", "evidence_ids"]), evidence: ev.length ? (await q.all(`SELECT id, filename, sha256, mime FROM evidence WHERE id IN (${ev.join(",")})`)) : [] }
    }))).filter(Boolean)
    out[k] = { ...s, meta: SOURCE_META[k], records: recs }
  }
  const ratio = ctx.population / Math.max(ctx.baselinePopulation, 1)
  const baselineBySource = Object.fromEntries(Object.entries(ctx.baselineComp).map(([k, x]: [string, any]) => [k, (r.k > 0 ? x.daily_active_kg : x.daily_holiday_kg) * ratio]))
  const currentFe = feVersionSet(ctx.fe)
  return c.json({
    date, dayType: r.dayType, k: r.k, total: r.total, scope: r.scope, population: ctx.population, partial: r.partial, fraction: r.fraction,
    stored: r.partial ? null : { total: r.total, revision: r.revision, closedAt: r.closedAt, locked: isLocked(date), feVersion: r.feVersion, differs: r.feVersion !== currentFe },
    updatedAt: r.closedAt,
    baseline: ctx.baseline?.version_label ?? null, feVersion: r.feVersion, sources: out,
    baselineBySource, baselineTotal: Object.values(baselineBySource).reduce((a, b) => a + b, 0) || null,
    treeUptake: { kg: r.tree.absorbed, trees: r.tree.active },
  })
})

org.get("/:orgId/series", async (c) => {
  const id = oid(c); (await assertOrg(c, id))
  const start = c.req.query("start")!, end = c.req.query("end")!
  if (!start || !end) throw bad("start & end wajib")
  if (daysBetween(start, end) > 400) throw bad("Rentang maksimal 400 hari")
  const ctx = await loadContext(id)
  const days = await readDays(id, start, end, ctx)
  // ekspektasi baseline harian (profil hari aktif/libur × rasio warga) untuk pembanding grafik
  const ratio = ctx.population / Math.max(ctx.baselinePopulation, 1)
  const bc = Object.values(ctx.baselineComp)
  const baselineOf = (k: number) => (bc.length ? bc.reduce((s, x: any) => s + (k > 0 ? x.daily_active_kg : x.daily_holiday_kg), 0) * ratio : null)
  return c.json({
    baseline: ctx.baseline ? { version: ctx.baseline.version_label, status: ctx.baseline.status } : null,
    population: ctx.population,
    days: days.map((d) => ({ date: d.date, total: d.total, k: d.k, scope: d.scope, type: d.dayType, partial: !!d.partial, baseline: baselineOf(d.k), sources: Object.fromEntries(Object.entries(d.sources).map(([k, v]) => [k, { kg: v.kg, label: v.label }])) })),
    summary: summarize(days),
  })
})

// Rapor karbon bulanan: emisi per bulan per sumber vs ekspektasi baseline (REP-01/BASE-09)
org.get("/:orgId/monthly", async (c) => {
  const id = oid(c); (await assertOrg(c, id))
  const today = todayWIB()
  // Rentang: ?start=&end= (bebas, maks 800 hari) atau ?months=N bulan terakhir. Kelompok: hari (≤ 62 hari) atau bulan.
  let start: string, end = today
  if (c.req.query("start")) {
    start = String(c.req.query("start")); end = String(c.req.query("end") ?? today)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) throw bad("Rentang tanggal tidak valid")
    if (end > today) end = today
    if (daysBetween(start, end) > 800) throw bad("Rentang maksimal 800 hari")
  } else {
    const months = Math.min(Math.max(Number(c.req.query("months") ?? 12), 1), 24)
    const [y, m] = today.split("-").map(Number)
    start = new Date(Date.UTC(y, m - months, 1)).toISOString().slice(0, 10)
  }
  const group = c.req.query("group") === "month" || c.req.query("group") === "day" ? c.req.query("group")! : daysBetween(start, end) <= 62 ? "day" : "month"
  const ctx = (await loadContext(id))
  const days = (await readDays(id, start, end, ctx))
  const out = new Map<string, any>()
  for (const d of days) {
    const key = group === "day" ? d.date : d.date.slice(0, 7)
    const row = out.get(key) ?? { month: key, total: 0, scope: { 1: 0, 2: 0, 3: 0 }, sources: {} as Record<string, number>, labels: {} as Record<string, number>, srcLabels: {} as Record<string, Record<string, number>>, activeDays: 0, days: 0, baseline: 0 }
    row.days++; if (d.k > 0) row.activeDays++
    row.total += d.total
    for (const [src, s] of Object.entries(d.sources)) {
      row.sources[src] = (row.sources[src] ?? 0) + s.kg
      row.scope[s.scope] += s.kg
      row.labels[s.label] = (row.labels[s.label] ?? 0) + s.kg
      const sl = (row.srcLabels[src] ??= {}); sl[s.label] = (sl[s.label] ?? 0) + s.kg
      const bc = ctx.baselineComp[src]
      if (bc) row.baseline += (d.k > 0 ? bc.daily_active_kg : bc.daily_holiday_kg) * (ctx.population / Math.max(ctx.baselinePopulation, 1))
    }
    out.set(key, row)
  }
  const rows = [...out.values()]
  const pop = Math.max(ctx.population, 1)
  return c.json({
    baseline: ctx.baseline ? { version: ctx.baseline.version_label, status: ctx.baseline.status, perPersonActiveDay: Object.values(ctx.baselineComp).reduce((s: number, x: any) => s + x.daily_active_kg, 0) / Math.max(ctx.baselinePopulation, 1) } : null,
    population: ctx.population, feVersion: feVersionSet(ctx.fe),
    start, end, group,
    months: rows.map((r) => ({ ...r, perPersonActiveDay: r.activeDays ? r.total / r.activeDays / pop : 0, partial: group === "day" ? r.month === today : r.month === today.slice(0, 7) })), closing: (await closingInfo(id)),
  })
})

org.get("/:orgId/tasks", async (c) => { const id = oid(c); (await assertOrg(c, id)); return c.json((await monitoringTasks(id))) })

// ---------------- fase data: Survei Awal (baseline) vs Input Berkala (pemantauan) ----------------
async function phaseInfo(orgId: number) {
  const b = await q.get("SELECT id, version_label, status, period_start, period_end FROM baselines WHERE org_id = ? ORDER BY version DESC LIMIT 1", orgId)
  if (!b) return { baseline: null, start: null as string | null, end: null as string | null, editable: false, locked: false, monitoringFrom: null as string | null }
  const start = monthOf(b.period_start), end = monthOf(b.period_end)
  return {
    baseline: { id: b.id, version: b.version_label, status: b.status },
    start, end, editable: ["draf", "perlu_perbaikan"].includes(b.status), locked: b.status === "terkunci",
    monitoringFrom: monthOf(addDays(b.period_end, 1)),
  }
}
const phaseOf = (p: Awaited<ReturnType<typeof phaseInfo>>, period: string) => p.start && period >= p.start && period <= p.end! ? "baseline" : p.start && period < p.start ? "pra_baseline" : "pemantauan"
org.get("/:orgId/data-phase", async (c) => { const id = oid(c); (await assertOrg(c, id)); return c.json(await phaseInfo(id)) })

// ---------------- data aktivitas (ACT-01) ----------------
org.get("/:orgId/activities", async (c) => {
  const id = oid(c); (await assertOrg(c, id))
  const source = c.req.query("source")
  const phase = c.req.query("phase")
  const rows = (await q.all(`SELECT a.*, u.name AS creator FROM activity_records a LEFT JOIN users u ON u.id = a.created_by WHERE a.org_id = ? AND a.superseded = 0 ${source ? "AND a.source = ?" : ""} ORDER BY a.period DESC, a.source`, ...(source ? [id, source] : [id])))
  const ph = await phaseInfo(id)
  return c.json(rows.map((r) => ({ ...parseJsonCols(r, ["meta", "flags", "evidence_ids"]), phase: phaseOf(ph, r.period) })).filter((r) => !phase || r.phase === phase))
})
org.get("/:orgId/activities/:id/history", async (c) => {
  const id = oid(c); (await assertOrg(c, id))
  const rec = (await q.get("SELECT * FROM activity_records WHERE id = ? AND org_id = ?", Number(c.req.param("id")), id))
  if (!rec) throw bad("Tidak ditemukan", 404)
  const rows = (await q.all("SELECT a.*, u.name AS creator FROM activity_records a LEFT JOIN users u ON u.id = a.created_by WHERE org_id = ? AND source = ? AND period = ? ORDER BY revision DESC", id, rec.source, rec.period))
  const findings = (await q.all("SELECT * FROM findings WHERE object_type = 'activity' AND object_id IN (" + rows.map((r) => r.id).join(",") + ")"))
  return c.json({ revisions: rows.map((r) => parseJsonCols(r, ["meta", "flags", "evidence_ids"])), findings })
})
org.post("/:orgId/activities", async (c) => {
  const id = oid(c); (await assertOrgRole(c, id, "operator", "petugas", "admin"))
  const u = c.get("user")
  const b = await c.req.json()
  const source = String(b.source)
  if (!["listrik", "plts", "lpg", "genset", "ac", "kertas"].includes(source)) throw bad("Sumber tidak dikenal")
  if (!/^\d{4}-\d{2}$/.test(b.period)) throw bad("Periode harus YYYY-MM")
  const qty = Number(b.quantity)
  if (!(qty >= 0)) throw bad("Kuantitas tidak valid")
  // Pemisahan fase: Survei Awal hanya untuk bulan periode acuan, Input Berkala hanya untuk bulan sesudahnya
  if (b.context === "survei" || b.context === "berkala") {
    const ph = await phaseInfo(id)
    const where = phaseOf(ph, b.period)
    if (b.context === "survei") {
      if (!ph.baseline) throw bad("Tetapkan periode Survei Awal terlebih dahulu", 409)
      if (where !== "baseline") throw bad(`Bulan ${b.period} di luar periode acuan (${ph.start} s.d. ${ph.end})`, 409)
      if (!ph.editable) throw bad("Survei Awal sedang diproses/terkunci — data periode acuan tidak dapat diubah", 409)
    } else {
      if (!ph.baseline) throw bad("Mulai Survei Awal dulu — input berkala dibuka setelah periode acuan ditetapkan", 409)
      if (where !== "pemantauan") throw bad(`Bulan ${b.period} termasuk periode Survei Awal. Isi lewat halaman Survei Awal.`, 409)
    }
  }
  // bukti harus milik lembaga yang sama
  const evIds: number[] = []
  for (const e of (Array.isArray(b.evidence_ids) ? b.evidence_ids : []).map(Number)) if (await q.get("SELECT 1 FROM evidence WHERE id = ? AND org_id = ?", e, id)) evIds.push(e)
  const unit = source === "plts" ? "kWh" : source === "ac" ? "kg" : SOURCE_META[source]?.unit
  // terkunci → tidak dapat diubah (BASE-07)
  const locked = (await q.get("SELECT 1 FROM baselines WHERE org_id = ? AND status = 'terkunci' AND ? BETWEEN substr(period_start,1,7) AND substr(period_end,1,7)", id, b.period))
  const existing = source === "ac" ? null : (await q.get("SELECT * FROM activity_records WHERE org_id = ? AND source = ? AND period = ? AND superseded = 0", id, source, b.period))
  if (existing && (existing.status === "terkunci" || locked)) throw bad("Data periode ini terkunci (bagian baseline/rapor terbit). Gunakan baseline ulang.", 409)
  if (existing && ["diajukan"].includes(existing.status)) throw bad("Data sedang diverifikasi; tunggu hasilnya", 409)
  // koreksi atas data terverifikasi → revisi baru berstatus Draf
  let revision = 1, parent = null
  if (existing) {
    revision = existing.revision + 1; parent = existing.id
    ;(await q.run("UPDATE activity_records SET superseded = 1 WHERE id = ?", existing.id))
  }
  const r = (await q.run(
    "INSERT INTO activity_records(org_id, source, period, quantity, unit, meta, method, revision, parent_id, status, evidence_ids, created_by, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    id, source, b.period, qty, unit, JSON.stringify(b.meta ?? {}), b.method ?? "aktual", revision, parent, "draf", JSON.stringify(evIds), u.id, b.note ?? null))
  const rec = (await q.get("SELECT * FROM activity_records WHERE id = ?", Number(r.lastInsertRowid)))!
  const v = (await validateActivity(rec))
  ;(await q.run("UPDATE activity_records SET flags = ? WHERE id = ?", JSON.stringify(v.flags), rec.id))
  ;(await audit(c, existing ? "revise" : "create", "activity", rec.id, existing ?? null, rec))
  if (b.submit) await submitActivity(c, rec.id)
  ;(await markDirty(id))
  return c.json(parseJsonCols((await q.get("SELECT * FROM activity_records WHERE id = ?", rec.id))!, ["meta", "flags", "evidence_ids"]))
})
org.post("/:orgId/activities/:id/submit", async (c) => {
  const id = oid(c); (await assertOrgRole(c, id, "operator", "petugas", "admin"))
  const rec = (await q.get("SELECT org_id FROM activity_records WHERE id = ?", Number(c.req.param("id"))))
  if (!rec || rec.org_id !== id) throw bad("Data tidak ditemukan di lembaga ini", 404)
  await submitActivity(c, Number(c.req.param("id")))
  return c.json({ ok: true })
})
async function submitActivity(c: any, recId: number) {
  const rec = (await q.get("SELECT * FROM activity_records WHERE id = ?", recId))
  if (!rec) throw bad("Tidak ditemukan", 404)
  assertTransition(rec.status, "diajukan")
  ;(await markDirty(rec.org_id))
  // Kelengkapan bukti: data listrik tanpa foto tagihan tidak bisa diajukan (§5.3)
  if (rec.source === "listrik" && rec.method === "aktual" && json(rec.evidence_ids, []).length === 0 && !json<any>(rec.meta, {}).iot_device) throw bad("Data listrik wajib melampirkan foto/PDF tagihan atau riwayat token", 422)
  const v = (await validateActivity(rec))
  const u = c?.get?.("user")
  // Data dari operator/admin langsung disahkan; data petugas monitoring menunggu ACC operator
  const mine = u ? (await rolesInOrg(u, rec.org_id)) : []
  if (mine.includes("operator") || mine.includes("admin")) {
    ;(await q.run("UPDATE activity_records SET status = 'terverifikasi', submitted_by = ?, verified_by = ?, flags = ?, updated_at = datetime('now') WHERE id = ?", u.id, u.id, JSON.stringify(v.flags), recId))
    ;(await q.run("UPDATE verification_tasks SET status = 'dibatalkan' WHERE object_type = 'activity' AND object_id = ? AND status = 'terbuka'", recId))
    ;(await audit(c, "approve_self", "activity", recId, { status: rec.status }, { status: "terverifikasi" }))
    return
  }
  ;(await q.run("UPDATE activity_records SET status = 'diajukan', submitted_by = ?, flags = ?, updated_at = datetime('now') WHERE id = ?", u?.id ?? null, JSON.stringify(v.flags), recId))
  ;(await createTask(rec.org_id, "activity", recId, `${SOURCE_META[rec.source]?.label ?? rec.source} ${rec.period}: ${rec.quantity} ${rec.unit}`, v.priority, v.flags.join("; ") || undefined))
  ;(await audit(c, "submit", "activity", recId, { status: rec.status }, { status: "diajukan" }))
}
// ACT-04: pengajuan otomatis data bulan lalu pada tanggal 10
export async function autoSubmit() {
  const lastMonth = monthOf(addDays(todayWIB().slice(0, 7) + "-01", -1))
  const drafts = (await q.all("SELECT * FROM activity_records WHERE status = 'draf' AND period = ? AND superseded = 0", lastMonth))
  let n = 0
  for (const r of drafts) {
    if (r.source === "listrik" && json(r.evidence_ids, []).length === 0) continue
    const v = (await validateActivity(r))
    ;(await q.run("UPDATE activity_records SET status = 'diajukan', flags = ? WHERE id = ?", JSON.stringify(v.flags), r.id))
    ;(await createTask(r.org_id, "activity", r.id, `${SOURCE_META[r.source]?.label ?? r.source} ${r.period}`, v.priority))
    n++
  }
  return n
}

// ---------------- bukti (evidence) ----------------
org.post("/:orgId/evidence", async (c) => {
  const id = oid(c); (await assertOrgRole(c, id, "operator", "petugas", "admin"))
  const form = await c.req.formData()
  const file = form.get("file") as File | null
  if (!file) throw bad("Berkas wajib")
  if (file.size > 8 * 1024 * 1024) throw bad("Maksimal 8 MB")
  const buf = await file.arrayBuffer()
  const hash = sha256(buf)
  const dup = (await q.get("SELECT id, org_id FROM evidence WHERE sha256 = ?", hash))
  const flags: string[] = []
  if (dup) flags.push("Bukti diragukan: foto sama dipakai ulang")
  const takenAt = String(form.get("taken_at") ?? "")
  if (takenAt && (Date.now() - Date.parse(takenAt)) / 86400000 > 7) flags.push("Bukti diragukan: foto diambil > 7 hari sebelum input")
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "")
  const path = `${hash}.${ext}`
  await Bun.write(UPLOAD_DIR + path, buf)
  const r = (await q.run("INSERT INTO evidence(org_id, filename, mime, size, sha256, path, taken_at, lat, lng, uploaded_by, flags) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    id, file.name, file.type, file.size, hash, path, takenAt || null, form.get("lat") ? Number(form.get("lat")) : null, form.get("lng") ? Number(form.get("lng")) : null, c.get("user").id, JSON.stringify(flags)))
  ;(await audit(c, "upload", "evidence", r.lastInsertRowid, null, { filename: file.name, sha256: hash }))
  return c.json({ id: Number(r.lastInsertRowid), sha256: hash, flags, url: `/api/files/${r.lastInsertRowid}` })
})

// ---------------- notifikasi ----------------
export const notifications = new Hono()
notifications.use("*", requireAuth)
notifications.get("/", async (c) => c.json((await q.all("SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50", c.get("user").id))))
notifications.post("/read", async (c) => { (await q.run("UPDATE notifications SET read = 1 WHERE user_id = ?", c.get("user").id)); return c.json({ ok: true }) })

export const files = new Hono()
files.use("*", requireAuth)
files.get("/:id", async (c) => {
  const e = (await q.get("SELECT * FROM evidence WHERE id = ?", Number(c.req.param("id"))))
  if (!e) throw bad("Tidak ditemukan", 404)
  ;(await assertOrg(c, e.org_id))
  return new Response(Bun.file(UPLOAD_DIR + e.path), { headers: { "Content-Type": e.mime || "application/octet-stream", "Cache-Control": "private, max-age=86400" } })
})

export { notify, orgUsers }
