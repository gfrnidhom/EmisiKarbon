/**
 * Buku harian emisi ("tutup buku") — ENGINE MENULIS, HALAMAN HANYA MEMBACA.
 *
 *  - Engine menghitung lalu MENYIMPAN ke database (day_ledger + calculation_results): emisi per sumber (dengan jejak rumus),
 *    serapan & stok pohon, dan emisi terhindar per hari. Dasbor, rapor, grafik, Telusuri Angka hanya membaca tabel ini.
 *  - Hari dimulai dari DATA PERTAMA lembaga (input, timbangan, survei, ukur pohon, sensor, periode baseline).
 *    Sebelum itu tidak ada baris apa pun — engine tidak mengarang data.
 *  - Hari yang sudah lewat ditutup "final" (job 00.30 WIB + catch-up). Hari ini disimpan "sementara"
 *    (porsi jam berjalan; sumber bersensor IoT memakai bacaan nyata) dan diperbarui tiap 10 menit & segera setelah ada input.
 *  - Data terlambat → hari terbuka dihitung ulang; bulan M terkunci setelah tgl 15 bulan M+1 (sesudahnya hanya hitung ulang Admin).
 *  - Faktor emisi/baseline baru tidak mengubah hari final otomatis — Admin memicu hitung ulang.
 */
import { q, json } from "../db"
import { addDays, daysInMonth, monthOf, todayWIB } from "../lib"
import * as C from "./calc"
import { computeDay, dayInfo, feVersionSet, loadContext, loadTrees, treeAbsorption, treeDaily, treeStock, type DayResult, type OrgContext, type TreeModel } from "./engine"
import { IOT_CATEGORIES, carbonFactor, categoryOf } from "../routes/iot"

export const LOCK_DAY = 15
const WIB_MS = 7 * 3600e3

export function isLocked(date: string, today = todayWIB()) {
  const [y, m] = date.split("-").map(Number)
  return today > new Date(Date.UTC(y, m, LOCK_DAY)).toISOString().slice(0, 10)
}
export function firstOpenDate(today = todayWIB()) {
  const [y, m, d] = today.split("-").map(Number)
  return d <= LOCK_DAY ? new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10) : `${today.slice(0, 7)}-01`
}

/** Tanggal data nyata pertama lembaga — tidak ada baris buku sebelum tanggal ini. */
export async function dataStartDate(orgId: number): Promise<string | null> {
  const c: (string | null | undefined)[] = [
    // catatan: periode baseline BUKAN data — hari baru muncul setelah ada data nyata (tagihan, timbangan, survei, ukur, sensor)
    ((await q.get<{ d: string }>("SELECT MIN(period) AS d FROM activity_records WHERE org_id = ?", orgId))?.d ?? null) && (await q.get<{ d: string }>("SELECT MIN(period) AS d FROM activity_records WHERE org_id = ?", orgId))!.d + "-01",
    (await q.get<{ d: string }>("SELECT MIN(w.date) AS d FROM waste_weighings w JOIN waste_sessions s ON s.id = w.session_id WHERE s.org_id = ?", orgId))?.d,
    (await q.get<{ d: string }>("SELECT MIN(COALESCE(period, substr(created_at, 1, 10))) AS d FROM mobility_surveys WHERE org_id = ?", orgId))?.d,
    (await q.get<{ d: string }>("SELECT MIN(m.date) AS d FROM tree_measurements m JOIN assets a ON a.id = m.asset_id WHERE a.org_id = ?", orgId))?.d,
    // waktu sensor tersimpan UTC → ubah ke tanggal WIB
    await (async () => { const m = (await q.get<{ d: string }>("SELECT MIN(r.at) AS d FROM iot_readings r JOIN iot_devices v ON v.id = r.device_id WHERE v.org_id = ?", orgId))?.d; return m ? new Date(Date.parse(m.replace(" ", "T") + "Z") + WIB_MS).toISOString().slice(0, 10) : null })(),
  ]
  const ds = c.filter((x): x is string => !!x && /^\d{4}-\d{2}-\d{2}/.test(x)).map((x) => x.slice(0, 10)).sort()
  return ds[0] ?? null
}

/** Emisi terhindar satu hari (kompos, bank sampah, PLTS) — logika sama dengan computeAvoided. */
function avoidedDay(ctx: OrgContext, d: string) {
  const fe = ctx.fe
  const out = { kompos_kg: 0, kompos: 0, kertas_kg: 0, kertas: 0, material_kg: 0, plts_kwh: 0, plts: 0 }
  const { k } = dayInfo(ctx, d)
  if (k > 0) {
    const applicable = ctx.sessions.filter((x) => x.s.start_date <= d)
    const use = applicable.length ? applicable.slice(-2) : []
    const ratio = ctx.baselinePopulation ? ctx.population / ctx.baselinePopulation : 1
    for (const s of use) for (const a of s.avgs) {
      const kg = (a.kgPerDay / use.length) * k * ratio
      const [cat, treat] = a.key.split("|")
      if (treat === "kompos") { out.kompos_kg += kg; out.kompos += C.avoidedCompost(kg, fe[cat === "kebun" ? "WS_KEBUN_TPA" : "WS_MAKANAN_TPA"]?.value ?? 0, fe.WS_KOMPOS?.value ?? 0) }
      if (treat === "bank_sampah" && cat === "kertas") { out.kertas_kg += kg; out.kertas += kg * (fe.WS_KERTAS_TPA?.value ?? 0) }
      if (treat === "bank_sampah" && cat !== "kertas") out.material_kg += kg
    }
  }
  const r = ctx.records.get(`plts:${monthOf(d)}`)
  if (r) { out.plts_kwh = r.quantity / daysInMonth(monthOf(d)); out.plts = out.plts_kwh * (fe[ctx.org.grid_code ?? "EL_JAMALI"]?.value ?? fe.EL_JAMALI?.value ?? 0.87) }
  return out
}

/** Bacaan sensor IoT hari ini (sejak 00.00 WIB) per sumber → kg CO2e. */
async function sensorToday(orgId: number) {
  const today = todayWIB()
  const midnightUtc = new Date(Date.parse(today + "T00:00:00Z") - WIB_MS).toISOString().replace("T", " ").slice(0, 19)
  const out: Record<string, { kg: number; qty: number; unit: string; devices: string[] }> = {}
  for (const d of await q.all("SELECT * FROM iot_devices WHERE org_id = ? AND status = 'aktif'", orgId)) {
    const cat = categoryOf(d), c = IOT_CATEGORIES[cat]
    if (!c || c.effect !== "emisi" || !c.source) continue
    const last = await q.get<{ value: number }>("SELECT value FROM iot_readings WHERE device_id = ? AND at >= ? ORDER BY at DESC LIMIT 1", d.id, midnightUtc)
    const before = await q.get<{ value: number }>("SELECT value FROM iot_readings WHERE device_id = ? AND at < ? ORDER BY at DESC LIMIT 1", d.id, midnightUtc)
    if (!last || !before) continue
    const f = await carbonFactor(orgId, cat)
    if (!f) continue
    const qty = Math.max(last.value - before.value, 0)
    const o = (out[c.source] ??= { kg: 0, qty: 0, unit: c.unit, devices: [] })
    o.kg += qty * f.value; o.qty += qty; o.devices.push(d.name)
  }
  return out
}

function dayFraction() {
  const now = new Date(Date.now() + WIB_MS)
  return Math.min((now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds()) / 86400, 1)
}

/** Hitung satu hari dan simpan. mode final = hari lalu; sementara = hari ini. */
async function storeDay(orgId: number, date: string, ctx: OrgContext, trees: TreeModel[], mode: "final" | "sementara", force = false) {
  const prev = await q.get<{ total: number; revision: number; status: string }>("SELECT total, revision, status FROM day_ledger WHERE org_id = ? AND date = ?", orgId, date)
  if (mode === "final" && prev?.status === "final" && !force && isLocked(date)) return false
  let d: DayResult = computeDay(ctx, date)
  let fraction = 1
  if (mode === "sementara") {
    fraction = dayFraction()
    const sensor = await sensorToday(orgId)
    const pctTxt = `${Math.round(fraction * 100)}%`
    const sources: DayResult["sources"] = {}
    for (const [src, s] of Object.entries(d.sources)) {
      const sn = sensor[src]
      sources[src] = sn
        ? { ...s, kg: sn.kg, label: "terukur", basis: { kind: "bulan_ini", period: date, text: `Bacaan sensor IoT hari ini: ${sn.qty.toFixed(1)} ${sn.unit} (${sn.devices.join(", ")})` }, trace: { ...s.trace, da: sn.qty, daUnit: sn.unit, formula: `Bacaan nyata sensor IoT sejak pukul 00.00 WIB: ${sn.qty.toFixed(2)} ${sn.unit} × faktor emisi.` } }
        : { ...s, kg: s.kg * fraction, label: s.kg ? "sementara" : s.label, trace: { ...s.trace, formula: `Hari ini belum selesai: ${pctTxt} dari perkiraan satu hari (${s.kg.toFixed(2)} kg). Final saat tutup buku 00.30 WIB. — ${s.trace.formula}` } }
    }
    const scope = { 1: 0, 2: 0, 3: 0 } as Record<1 | 2 | 3, number>
    let total = 0
    for (const s of Object.values(sources)) { scope[s.scope] += s.kg; total += s.kg }
    d = { ...d, sources, scope, total }
  }
  const tu = treeDaily(trees, date, date)[0]
  const ts = treeStock(trees, date)
  const rel = treeAbsorption(trees, date, date).released
  const av = avoidedDay(ctx, date)
  const f = mode === "sementara" ? fraction : 1
  const changed = !prev || prev.status !== mode || Math.abs(prev.total - d.total) > 1e-6
  const rev = prev ? prev.revision + (changed && prev.status === "final" ? 1 : 0) : 1
  const fev = feVersionSet(ctx.fe), blv = ctx.baseline?.version_label ?? null
  await q.run(`INSERT INTO day_ledger(org_id, date, k, day_type, total, scope1, scope2, scope3, fe_version, baseline_version, revision, closed_at, status, fraction,
      tree_absorbed, tree_released, tree_stock, tree_count, tree_active, av_kompos_kg, av_kompos, av_kertas_kg, av_kertas, av_material_kg, av_plts_kwh, av_plts)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(org_id, date) DO UPDATE SET k=excluded.k, day_type=excluded.day_type, total=excluded.total, scope1=excluded.scope1, scope2=excluded.scope2, scope3=excluded.scope3,
      fe_version=excluded.fe_version, baseline_version=excluded.baseline_version, revision=excluded.revision, closed_at=excluded.closed_at, status=excluded.status, fraction=excluded.fraction,
      tree_absorbed=excluded.tree_absorbed, tree_released=excluded.tree_released, tree_stock=excluded.tree_stock, tree_count=excluded.tree_count, tree_active=excluded.tree_active,
      av_kompos_kg=excluded.av_kompos_kg, av_kompos=excluded.av_kompos, av_kertas_kg=excluded.av_kertas_kg, av_kertas=excluded.av_kertas, av_material_kg=excluded.av_material_kg,
      av_plts_kwh=excluded.av_plts_kwh, av_plts=excluded.av_plts`,
    orgId, date, d.k, d.dayType, d.total, d.scope[1], d.scope[2], d.scope[3], fev, blv, rev, mode, mode === "sementara" ? fraction : null,
    (tu?.absorbed ?? 0) * f, rel * f, ts.stock, ts.count, tu?.active ?? 0,
    av.kompos_kg * f, av.kompos * f, av.kertas_kg * f, av.kertas * f, av.material_kg * f, av.plts_kwh * f, av.plts * f)
  await q.run("DELETE FROM calculation_results WHERE org_id = ? AND date = ?", orgId, date)
  for (const [src, s] of Object.entries(d.sources))
    await q.run("INSERT INTO calculation_results(org_id, date, source, co2e, label, scope, basis, trace, fe_version, baseline_version, revision) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      orgId, date, src, s.kg, s.label, s.scope, s.basis ? JSON.stringify(s.basis) : null, JSON.stringify(s.trace), fev, blv, rev)
  return changed
}

/** Tutup (final) hari [start, end] — dibatasi dari data pertama sampai kemarin. */
export async function closeDays(orgId: number, start: string, end: string, opts: { ctx?: OrgContext; force?: boolean; onlyMissing?: boolean } = {}) {
  const yesterday = addDays(todayWIB(), -1)
  const first = await dataStartDate(orgId)
  if (!first) return { closed: 0, changed: 0 }
  if (start < first) start = first
  if (end > yesterday) end = yesterday
  if (start > end) return { closed: 0, changed: 0 }
  const ctx = opts.ctx ?? (await loadContext(orgId))
  const trees = await loadTrees(orgId)
  const have = opts.onlyMissing ? new Set((await q.all<{ date: string }>("SELECT date FROM day_ledger WHERE org_id = ? AND status = 'final' AND date BETWEEN ? AND ?", orgId, start, end)).map((r) => r.date)) : null
  let closed = 0, changed = 0
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (have?.has(d)) continue
    closed++
    if (await storeDay(orgId, d, ctx, trees, "final", !!opts.force)) changed++
  }
  const last = (await q.get<{ d: string }>("SELECT MAX(date) AS d FROM day_ledger WHERE org_id = ? AND status = 'final'", orgId))?.d ?? null
  await q.run("INSERT INTO ledger_state(org_id, last_closed) VALUES (?, ?) ON CONFLICT(org_id) DO UPDATE SET last_closed = excluded.last_closed, updated_at = datetime('now')", orgId, last)
  return { closed, changed }
}

/** Hapus baris sebelum data pertama (sisa versi lama yang menghitung hari tanpa data). */
async function purgeBeforeStart(orgId: number) {
  const first = await dataStartDate(orgId)
  const cut = first ?? "9999-12-31"
  await q.run("DELETE FROM calculation_results WHERE org_id = ? AND date < ?", orgId, cut)
  await q.run("DELETE FROM day_ledger WHERE org_id = ? AND date < ?", orgId, cut)
}

/** Satu putaran engine untuk satu lembaga: catch-up final, hitung ulang hari terbuka (bila ada data baru), simpan hari ini (sementara). */
const running = new Set<number>()
export async function runOrg(orgId: number, opts: { forceOpen?: boolean } = {}) {
  if (running.has(orgId)) return { closed: 0, changed: 0 }
  running.add(orgId)
  try {
    const today = todayWIB(), yesterday = addDays(today, -1)
    await q.run("DELETE FROM day_ledger WHERE org_id = ? AND date > ?", orgId, today)
    await q.run("DELETE FROM calculation_results WHERE org_id = ? AND date > ?", orgId, today)
    await purgeBeforeStart(orgId)
    const ctx = await loadContext(orgId)
    const first = await dataStartDate(orgId)
    if (!first) return { closed: 0, changed: 0 }
    const st = await q.get<{ dirty: number }>("SELECT dirty FROM ledger_state WHERE org_id = ?", orgId)
    // 1) hari yang belum pernah final (catch-up, termasuk kemarin sesudah tengah malam)
    const r1 = await closeDays(orgId, first, yesterday, { ctx, onlyMissing: true })
    // 2) data baru → hitung ulang hari yang masih terbuka
    let r2 = { closed: 0, changed: 0 }
    if (st?.dirty || opts.forceOpen) {
      await q.run("UPDATE ledger_state SET dirty = 0 WHERE org_id = ?", orgId)
      r2 = await closeDays(orgId, firstOpenDate(), yesterday, { ctx })
      // Survei Awal yang masih draf/perbaikan belum "disahkan": hari periode acuan ikut diperbarui walau bulannya sudah
      // lewat tanggal tutup buku, dan komponen baseline dihitung ulang (data sampah/aset/energi/bukti bisa berubah kapan saja).
      const bl = await q.get<{ id: number; period_start: string; period_end: string; status: string }>("SELECT id, period_start, period_end, status FROM baselines WHERE org_id = ? ORDER BY version DESC LIMIT 1", orgId)
      if (bl && ["draf", "perlu_perbaikan"].includes(bl.status)) {
        const r3 = await closeDays(orgId, bl.period_start, bl.period_end, { ctx, force: true })
        r2 = { closed: r2.closed + r3.closed, changed: r2.changed + r3.changed }
        const { recomputeBaseline } = await import("./services")
        await recomputeBaseline(bl.id)
      }
    }
    // 2b) bulan yang baru terkunci tanpa tagihan: proyeksi diganti "kosong" (bulan lampau tidak boleh berisi perkiraan)
    const stale = await q.all<{ date: string }>("SELECT DISTINCT date FROM calculation_results WHERE org_id = ? AND label = 'proyeksi' AND date < ? ORDER BY date", orgId, firstOpenDate())
    if (stale.length) { const tr = await loadTrees(orgId); for (const x of stale) await storeDay(orgId, x.date, ctx, tr, "final", true) }
    // 3) hari ini sementara
    if (first <= today) await storeDay(orgId, today, ctx, await loadTrees(orgId), "sementara")
    return { closed: r1.closed + r2.closed, changed: r1.changed + r2.changed }
  } finally { running.delete(orgId) }
}

/** Tandai data baru & jalankan engine untuk lembaga itu (ditunda sebentar agar beberapa input beruntun dihitung sekali). */
const timers = new Map<number, ReturnType<typeof setTimeout>>()
export async function markDirty(orgId: number) {
  await q.run("INSERT INTO ledger_state(org_id, dirty) VALUES (?, 1) ON CONFLICT(org_id) DO UPDATE SET dirty = 1, updated_at = datetime('now')", orgId)
  clearTimeout(timers.get(orgId))
  timers.set(orgId, setTimeout(() => { timers.delete(orgId); runOrg(orgId).catch((e) => console.error("[engine] gagal", orgId, e)) }, 1500))
}

/** Job semua lembaga (00.30 tutup buku + tiap 10 menit hari ini). */
export async function runAll() {
  const t0 = performance.now()
  let closed = 0, changed = 0
  for (const o of await q.all<{ id: number }>("SELECT id FROM organizations")) {
    const r = await runOrg(o.id)
    closed += r.closed; changed += r.changed
  }
  return { date: addDays(todayWIB(), -1), closed, changed, ms: performance.now() - t0 }
}
export const runClosing = runAll

// ======================= PEMBACA (hanya SELECT) =======================
export type LedgerDay = DayResult & { closed: boolean; partial: boolean; fraction: number | null; revision: number; closedAt: string; feVersion: string; tree: { absorbed: number; released: number; stock: number; count: number; active: number }; avoided: { kompos_kg: number; kompos: number; kertas_kg: number; kertas: number; material_kg: number; plts_kwh: number; plts: number } }

function rowToDay(d: any, src: any[]): LedgerDay {
  const sources: DayResult["sources"] = {}
  for (const r of src) sources[r.source] = { kg: r.co2e, label: r.label, scope: (r.scope ?? 3) as 1 | 2 | 3, basis: r.basis ? json(r.basis, undefined) : undefined, trace: json(r.trace, { da: 0, daUnit: "", factors: [], formula: "" }) }
  return {
    date: d.date, dayType: d.day_type, k: d.k, total: d.total, scope: { 1: d.scope1, 2: d.scope2, 3: d.scope3 }, sources,
    closed: d.status === "final", partial: d.status === "sementara", fraction: d.fraction ?? null, revision: d.revision, closedAt: d.closed_at, feVersion: d.fe_version,
    tree: { absorbed: d.tree_absorbed ?? 0, released: d.tree_released ?? 0, stock: d.tree_stock ?? 0, count: d.tree_count ?? 0, active: d.tree_active ?? 0 },
    avoided: { kompos_kg: d.av_kompos_kg ?? 0, kompos: d.av_kompos ?? 0, kertas_kg: d.av_kertas_kg ?? 0, kertas: d.av_kertas ?? 0, material_kg: d.av_material_kg ?? 0, plts_kwh: d.av_plts_kwh ?? 0, plts: d.av_plts ?? 0 },
  }
}

/** Baca hari [start, end] dari database. Hari tanpa baris (sebelum data pertama / belum dihitung) tidak muncul. */
export async function readDays(orgId: number, start: string, end: string, _ctx?: unknown): Promise<LedgerDay[]> {
  const today = todayWIB()
  if (end > today) end = today
  if (start > end) return []
  const days = await q.all("SELECT * FROM day_ledger WHERE org_id = ? AND date BETWEEN ? AND ? ORDER BY date", orgId, start, end)
  const rows = await q.all("SELECT date, source, co2e, label, scope, basis, trace FROM calculation_results WHERE org_id = ? AND date BETWEEN ? AND ?", orgId, start, end)
  const byDate = new Map<string, any[]>()
  for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r])
  return days.map((d) => rowToDay(d, byDate.get(d.date) ?? []))
}
export async function readDay(orgId: number, date: string) { return (await readDays(orgId, date, date))[0] ?? null }

/** Jumlah serapan pohon & emisi terhindar pada rentang, plus stok di hari terakhir yang tersedia. */
export function sumEco(days: LedgerDay[]) {
  const a = { kompos: { kg: 0, co2e: 0 }, bankKertas: { kg: 0, co2e: 0 }, bankMaterial: { kg: 0 }, plts: { kwh: 0, co2e: 0 }, totalCo2e: 0 }
  let absorbed = 0, released = 0
  for (const d of days) {
    a.kompos.kg += d.avoided.kompos_kg; a.kompos.co2e += d.avoided.kompos
    a.bankKertas.kg += d.avoided.kertas_kg; a.bankKertas.co2e += d.avoided.kertas
    a.bankMaterial.kg += d.avoided.material_kg
    a.plts.kwh += d.avoided.plts_kwh; a.plts.co2e += d.avoided.plts
    absorbed += d.tree.absorbed; released += d.tree.released
  }
  a.totalCo2e = a.kompos.co2e + a.bankKertas.co2e + a.plts.co2e
  const last = days[days.length - 1]
  return { avoided: a, trees: { absorbed, released, stock: last?.tree.stock ?? 0, count: last?.tree.count ?? 0 } }
}

export async function closingInfo(orgId: number) {
  const st = await q.get<{ last_closed: string | null }>("SELECT last_closed FROM ledger_state WHERE org_id = ?", orgId)
  const live = await q.get<{ closed_at: string }>("SELECT closed_at FROM day_ledger WHERE org_id = ? AND status = 'sementara' ORDER BY date DESC LIMIT 1", orgId)
  return { lastClosedDate: st?.last_closed ?? null, todayUpdatedAt: live?.closed_at ?? null, dataStart: await dataStartDate(orgId), lockDay: LOCK_DAY, openFrom: firstOpenDate() }
}

/** Data aset pendukung (bukan hitungan harian): biopori & panen air hujan, dibaca dari tabel aset/curah hujan. */
export async function assetEco(orgId: number, start: string, end: string) {
  const assets = (await q.all("SELECT * FROM assets WHERE org_id = ? AND type IN ('biopori','atap') AND status = 'hidup'", orgId)).map((a: any) => ({ ...a, meta: json(a.meta, {} as any) }))
  const biopori = assets.filter((a) => a.type === "biopori")
  const roofM2 = assets.filter((a) => a.type === "atap").reduce((s, a) => s + (a.meta.area_m2 ?? 0), 0)
  const rain = await q.all<{ mm: number }>("SELECT mm FROM rainfall WHERE org_id = ? AND period BETWEEN ? AND ?", orgId, monthOf(start), monthOf(end))
  const rainMm = rain.reduce((s, r) => s + r.mm, 0)
  return {
    biopori: { count: biopori.length, liters: biopori.reduce((s, a) => s + C.bioporiLiters(a.meta.diameter_cm ?? 10, a.meta.depth_cm ?? 100), 0) },
    rainHarvest: { roofM2, rainMm, liters: C.rainHarvestLiters(roofM2, rainMm) },
  }
}
