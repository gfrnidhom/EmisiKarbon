// Mesin hitung harian (CALC-01..05, ENG-01..12). Membaca DB → menghitung emisi & serapan per hari.
import { q, json, type Row } from "../db"
import { addDays, daysBetween, daysInMonth, monthOf, todayWIB } from "../lib"
import * as C from "./calc"
import { FE_VERSION, SOURCE_META } from "./factors"
import { ALL_MODE_FACTORS, MODES, modeFactorCode, modeOccupants } from "./modes"

export type Label =
  | "proyeksi" | "input" | "terverifikasi" | "estimasi" | "interpolasi" | "aktual" | "rata-rata" | "rata-rata lama" | "terukur" | "kosong" | "sementara"

export interface Factor { code: string; value: number; version: string; source: string; unit: string; nonNational: boolean; name: string }
export type BasisKind = "bulan_ini" | "terbaru" | "baseline" | "asumsi" | "kosong"
/** Data apa yang dipakai engine untuk angka ini: input bulan ini, data terbaru menggantikan data awal, atau masih data awal baseline. */
export interface Basis { kind: BasisKind; period?: string; text: string }
export interface SourceResult { kg: number; label: Label; scope: 1 | 2 | 3; trace: Trace; basis?: Basis; memo?: { hcfc_kg: number } }
export interface Trace { da: number; daUnit: string; factors: { code: string; name?: string; value: number; unit: string; version: string; source: string }[]; formula: string; recordIds?: number[]; note?: string }
export interface DayResult { date: string; dayType: string; k: number; total: number; scope: Record<1 | 2 | 3, number>; sources: Record<string, SourceResult> }

export const MODE_FACTOR: Record<string, string> = Object.fromEntries(Object.entries(MODES).map(([k, m]) => [k, m.factor]))
/** Jarak harian respons: kolom daily_km; data lama (sekali jalan) = 2 × jarak × faktor antar. */
export const responseDailyKm = (r: Row) => (r.daily_km ?? 2 * (r.distance_km ?? 0) * (r.escort === 2 ? 2 : 1)) as number
/** Ubah satu baris mobility_responses menjadi masukan rumus (faktor dari tabel emission_factors). */
export function toMobilityResp(r: Row, fe: Record<string, Factor>, schoolDays: number): C.MobilityResp & { code: string } {
  const dailyKm = responseDailyKm(r)
  const code = modeFactorCode(r.mode, dailyKm)
  return { dailyKm, occupants: modeOccupants(r.mode, r.occupants), factor: fe[code]?.value ?? 0, daysPerWeek: r.days_per_week ?? schoolDays, count: r.count ?? 1, code }
}
const REF_CODE: Record<string, string> = { R32: "REF_R32", R410A: "REF_R410A", R134A: "REF_R134A", R22: "REF_R22" }

export async function loadFactors(): Promise<Record<string, Factor>> {
  const rows = (await q.all("SELECT * FROM emission_factors WHERE active = 1 AND value IS NOT NULL ORDER BY id"))
  const out: Record<string, Factor> = {}
  for (const r of rows) out[r.code] = { code: r.code, value: r.value, version: r.version, source: r.source, unit: r.unit, nonNational: !!r.non_national, name: r.name }
  return out
}
export const feVersionSet = (f: Record<string, Factor>) => {
  const versions = [...new Set(Object.values(f).map((x) => x.version))].sort()
  return versions.join("+") || FE_VERSION
}

export interface OrgContext {
  org: Row
  population: number
  fe: Record<string, Factor>
  calendar: Map<string, { type: string; pct: number }>
  records: Map<string, Row> // `${source}:${period}` → record aktif
  sessions: { s: Row; avgs: { key: string; factor: string; kgPerDay: number }[]; byDate: Map<string, Row[]> }[]
  surveys: { s: Row; resps: Row[]; date: string }[]
  acUnits: Row[]
  hasTopUp: boolean
  baseline?: Row
  baselineComp: Record<string, Row>
  baselinePopulation: number
  baseLoadKwh: number
  baselineMode?: boolean
}

export async function loadContext(orgId: number, opts: { baselineMode?: boolean } = {}): Promise<OrgContext> {
  const org = (await q.get("SELECT * FROM organizations WHERE id = ?", orgId))!
  const population = (org.students ?? 0) + (org.teachers ?? 0) + (org.staff ?? 0)
  const fe = (await loadFactors())
  const calendar = new Map<string, { type: string; pct: number }>()
  for (const r of (await q.all("SELECT * FROM calendar_days WHERE org_id = ?", orgId))) calendar.set(r.date, { type: r.type, pct: r.attendance_pct ?? 100 })
  const records = new Map<string, Row>()
  for (const r of (await q.all("SELECT * FROM activity_records WHERE org_id = ? AND superseded = 0 ORDER BY revision", orgId))) {
    const key = `${r.source}:${r.period}`
    const meta = json(r.meta, {} as any)
    if (r.source === "ac") {
      const prev = records.get(key)
      // beberapa unit AC bisa diisi ulang di bulan yang sama → digabung per gas
      if (prev) { prev._list.push({ ...r, meta }); continue }
      records.set(key, { ...r, meta, _list: [{ ...r, meta }] })
    } else records.set(key, { ...r, meta })
  }
  const sessions = (await Promise.all((await q.all("SELECT * FROM waste_sessions WHERE org_id = ? ORDER BY start_date", orgId)).map(async (s) => {
    const w = (await q.all("SELECT * FROM waste_weighings WHERE session_id = ?", s.id))
    const dates = new Set(w.map((x) => x.date))
    const nDays = Math.max(dates.size, 1)
    const agg = new Map<string, { factor: string; kg: number }>()
    const byDate = new Map<string, Row[]>()
    for (const x of w) {
      const key = `${x.category}|${x.treatment}`
      const a = agg.get(key) ?? { factor: x.factor_code, kg: 0 }
      a.kg += x.kg
      agg.set(key, a)
      byDate.set(x.date, [...(byDate.get(x.date) ?? []), x])
    }
    return { s, avgs: [...agg.entries()].map(([key, a]) => ({ key, factor: a.factor, kgPerDay: a.kg / nDays })), byDate }
  }))).filter((x) => x.avgs.length > 0)
  const surveys = (await Promise.all((await q.all("SELECT * FROM mobility_surveys WHERE org_id = ? ORDER BY period, id", orgId)).map(async (s) => ({
    s, resps: (await q.all("SELECT * FROM mobility_responses WHERE survey_id = ?", s.id)), date: s.period || s.created_at.slice(0, 10),
  })))).filter((x) => x.resps.length > 0)
  const acUnits = (await q.all("SELECT * FROM assets WHERE org_id = ? AND type = 'ac' AND status = 'hidup'", orgId)).map((a) => ({ ...a, meta: json(a.meta, {} as any) }))
  const hasTopUp = [...records.keys()].some((k) => k.startsWith("ac:"))
  const baseline = opts.baselineMode ? undefined : (await q.get(
    "SELECT * FROM baselines WHERE org_id = ? AND status IN ('terkunci','terverifikasi','diajukan','menunggu_kepsek','draf','perlu_perbaikan') ORDER BY CASE status WHEN 'terkunci' THEN 0 ELSE 1 END, version DESC LIMIT 1", orgId))
  const baselineComp: Record<string, Row> = {}
  if (baseline) for (const c of (await q.all("SELECT * FROM baseline_components WHERE baseline_id = ?", baseline.id))) baselineComp[c.source] = c
  return {
    org, population, fe, calendar, records, sessions, surveys, acUnits, hasTopUp, baseline, baselineComp,
    baselinePopulation: baseline?.population || population,
    baseLoadKwh: org.base_load_kwh ?? 0,
    baselineMode: !!opts.baselineMode,
  }
}

/** Jenis hari default: Minggu libur; Sabtu libur bila 5 hari sekolah. */
export function dayInfo(ctx: OrgContext, date: string) {
  const ov = ctx.calendar.get(date)
  if (ov) {
    const k = ov.type === "libur" ? 0 : ov.type === "khusus" ? ov.pct / 100 : 1
    return { type: ov.type, k }
  }
  const dow = new Date(date + "T00:00:00Z").getUTCDay()
  if (dow === 0 || (dow === 6 && (ctx.org.school_days_per_week ?? 6) < 6)) return { type: "libur", k: 0 }
  return { type: "aktif", k: 1 }
}
function monthCounts(ctx: OrgContext, ym: string) {
  let active = 0, holiday = 0, kSum = 0
  const n = daysInMonth(ym)
  for (let i = 1; i <= n; i++) {
    const d = `${ym}-${String(i).padStart(2, "0")}`
    const k = dayInfo(ctx, d).k
    if (k > 0) active++
    else holiday++
    kSum += k
  }
  // kSum = hari aktif setara (hari "khusus" 50% dihitung 0,5) — pembagi agar jumlah sebulan = data bulanan
  return { active, holiday, n, kSum }
}
const recLabel = (r: Row): Label =>
  r.method === "estimasi" ? "estimasi" : r.method === "interpolasi" ? "interpolasi" : ["terverifikasi", "terkunci"].includes(r.status) ? "terverifikasi" : "input"
const fx = (v: number, d = 1) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: d }).format(v)
const fRef = (f: Factor | undefined) => f ? [{ code: f.code, name: f.name, value: f.value, unit: f.unit, version: f.version, source: f.source }] : []

/** Hitung satu hari untuk satu lembaga. */
export function computeDay(ctx: OrgContext, date: string): DayResult {
  const { fe } = ctx
  const { type, k } = dayInfo(ctx, date)
  const ym = monthOf(date)
  const mc = monthCounts(ctx, ym)
  const sources: Record<string, SourceResult> = {}
  const gridCode = fe[ctx.org.grid_code ?? "EL_JAMALI"] ? (ctx.org.grid_code ?? "EL_JAMALI") : "EL_JAMALI"
  const grid = fe[gridCode] ?? fe.EL_NAS
  const none: string[] = json(ctx.org.none_sources, [])
  const monthName = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" })
  /** Data terbaru menggantikan data awal: bila bulan ini belum diinput, pakai catatan aktual terakhir (≤ 6 bulan) sebelum jatuh ke baseline. */
  // Bulan yang masih "terbuka" (tagihan bisa masih datang): bulan ini, dan bulan lalu sampai tgl 15.
  const todayStr = todayWIB()
  const openFrom = Number(todayStr.slice(8, 10)) <= 15 ? new Date(Date.UTC(Number(todayStr.slice(0, 4)), Number(todayStr.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7) : todayStr.slice(0, 7)
  const latest = (source: string) => {
    if (ctx.baselineMode) return null // perhitungan baseline: bulan kosong ditangani interpolasi yang terlihat
    // bulan lampau tanpa data tidak diisi perkiraan — dibiarkan kosong agar terlihat & dilengkapi
    if (ym < openFrom) return null
    for (let i = 1; i <= 6; i++) {
      const [y, m] = ym.split("-").map(Number)
      const pm = new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7)
      const r = ctx.records.get(`${source}:${pm}`)
      if (r && !(ctx.baseline && pm < String(ctx.baseline.period_start ?? "").slice(0, 7))) return { r, pm, mc: monthCounts(ctx, pm) }
    }
    return null
  }

  // ---- Listrik (Scope 2) ----
  {
    const r = ctx.records.get(`listrik:${ym}`)
    const baseLoad = (r?.meta?.base_load_kwh ?? ctx.baseLoadKwh) || 0
    if (r) {
      const a = C.allocateMonthly(r.quantity, mc.active, mc.holiday, baseLoad)
      const kwh = k > 0 ? a.active : a.holiday
      sources.listrik = {
        kg: kwh * grid.value, label: recLabel(r), scope: 2,
        trace: { da: kwh, daUnit: "kWh", factors: fRef(grid), recordIds: [r.id], formula: k > 0 ? `Tagihan bulan ini ${fx(r.quantity)} kWh dikurangi beban dasar hari libur (${mc.holiday} hari × ${fx(baseLoad)} kWh), lalu dibagi rata ke ${mc.active} hari aktif = ${fx(kwh)} kWh hari ini. Dikalikan faktor grid ${fx(grid.value, 3)} kg CO₂e/kWh.` : `Hari libur hanya memakai beban dasar (kulkas, pompa, lampu keamanan) ${fx(baseLoad)} kWh × faktor grid ${fx(grid.value, 3)} kg CO₂e/kWh.` },
      }
    } else if (latest("listrik")) {
      const L = latest("listrik")!
      const lb = (L.r.meta?.base_load_kwh ?? ctx.baseLoadKwh) || 0
      const a = C.allocateMonthly(L.r.quantity, L.mc.active, L.mc.holiday, lb)
      const kwh = k > 0 ? a.active : a.holiday
      sources.listrik = { kg: kwh * grid.value, label: "proyeksi", scope: 2, trace: { da: kwh, daUnit: "kWh", factors: fRef(grid), recordIds: [L.r.id],
        formula: `Tagihan bulan ini belum diinput, jadi dipakai data aktual terakhir (${monthName(L.pm)}: ${fx(L.r.quantity)} kWh) — bukan lagi data awal baseline. Pola harinya: ${fx(kwh)} kWh untuk ${k > 0 ? "hari aktif" : "hari libur"} × faktor grid ${fx(grid.value, 3)} kg CO₂e/kWh.` } }
    } else {
      const bc = null as any
      const kg = 0
      sources.listrik = { kg, label: "kosong", scope: 2, trace: { da: kg / grid.value, daUnit: "kWh", factors: fRef(grid), formula: bc ? `Tagihan bulan ini belum diinput, jadi dipakai proyeksi dari profil harian baseline ${ctx.baseline?.version_label} (${k > 0 ? "hari aktif" : "hari libur"}).` : "Belum ada data" } }
    }
  }
  // ---- LPG (Scope 1) — dipakai kantin/lab pada hari aktif ----
  monthlyActive("lpg", fe.LPG_BI, "kg", 1)
  // ---- Kertas (Scope 3, non-nasional) ----
  monthlyActive("kertas", fe.PAPER_RIM, "rim", 3)
  // ---- Genset solar B40 (Scope 1) — dibagi rata ke semua hari bulan itu ----
  {
    const f = fe.SOLAR_BI, frac = fe.B40_FOSIL?.value ?? 0.6
    // GHG Protocol / IPCC: hanya CO₂ dari porsi fosil yang dihitung; CO₂ biogenik (porsi biodiesel) dilaporkan terpisah,
    // sedangkan CH₄ & N₂O tetap dihitung untuk seluruh volume bahan bakar.
    const co2Only = fe.FUEL_SOLAR_IPCC?.value ?? 2.6765
    const perLiter = co2Only * frac + Math.max(f.value - co2Only, 0)
    const gensetNote = (l: number) => `CO₂ fosil ${fx(co2Only, 4)} × ${fx(frac * 100, 0)}% (porsi fosil B40) + CH₄/N₂O ${fx(Math.max(f.value - co2Only, 0), 4)} kg CO₂e/liter (seluruh volume) = ${fx(perLiter, 3)} kg CO₂e/liter. CO₂ biogenik ${fx(l * co2Only * (1 - frac), 2)} kg dilaporkan terpisah (tidak masuk total, GHG Protocol).`
    const r = ctx.records.get(`genset:${ym}`)
    if (r) {
      const liters = r.quantity / mc.n
      sources.genset = { kg: liters * perLiter, label: recLabel(r), scope: 1, trace: { da: liters, daUnit: "liter", factors: [...fRef(fe.FUEL_SOLAR_IPCC), ...fRef(f), ...fRef(fe.B40_FOSIL)], recordIds: [r.id], formula: `Pemakaian solar ${fx(r.quantity)} liter sebulan dibagi rata ke ${mc.n} hari = ${fx(liters, 2)} liter/hari. ${gensetNote(liters)}` } }
    } else if (latest("genset")) {
      const L = latest("genset")!
      const liters = L.r.quantity / L.mc.n
      sources.genset = { kg: liters * perLiter, label: "proyeksi", scope: 1, trace: { da: liters, daUnit: "liter", factors: [...fRef(fe.FUEL_SOLAR_IPCC), ...fRef(f), ...fRef(fe.B40_FOSIL)], recordIds: [L.r.id],
        formula: `Data bulan ini belum diinput, jadi dipakai data aktual terakhir (${monthName(L.pm)}: ${fx(L.r.quantity)} liter ÷ ${L.mc.n} hari = ${fx(liters, 2)} liter/hari). ${gensetNote(liters)}` } }
    } else proj("genset", 1)
  }
  // ---- AC & refrigeran (Scope 1) ----
  {
    const r = ctx.records.get(`ac:${ym}`)
    if (ctx.hasTopUp) {
      const list: Row[] = r?._list ?? []
      // HCFC (R-22) dikendalikan Protokol Montreal → memo item, tidak masuk total GRK (IPCC/GHG Protocol)
      const isHcfc = (g?: string) => (g ?? "R32") === "R22"
      const kgYear = list.filter((x) => !isHcfc(x.meta?.gas)).reduce((s, x) => s + x.quantity * (fe[REF_CODE[x.meta?.gas ?? "R32"]]?.value ?? 677), 0)
      const memo = list.filter((x) => isHcfc(x.meta?.gas)).reduce((s, x) => s + x.quantity * (fe.REF_R22?.value ?? 1760), 0)
      sources.ac = { kg: kgYear / mc.n, ...(memo ? { memo: { hcfc_kg: memo / mc.n } } : {}), label: r ? recLabel(r) : "kosong", scope: 1, trace: { da: list.reduce((s, x) => s + x.quantity, 0) / mc.n, daUnit: "kg isi ulang", factors: list.flatMap((x) => fRef(fe[REF_CODE[x.meta?.gas ?? "R32"]])), recordIds: list.map((x) => x.id), formula: "Refrigeran yang diisi ulang saat servis bulan ini (kg) × GWP jenis gas (AR5; R-22/HCFC dicatat terpisah, tidak masuk total), dibagi rata ke jumlah hari dalam bulan (metode isi ulang, IPCC)." } }
    } else {
      const leak = fe.REF_LEAK?.value ?? 0.03
      let kgYear = 0
      // buku harian: hanya unit yang sudah terdaftar. Baseline: inventaris AC saat onboarding mewakili periode acuan.
      const units = ctx.baselineMode ? ctx.acUnits : ctx.acUnits.filter((u) => String(u.planted_at ?? u.meta.installed_at ?? u.created_at ?? "").slice(0, 10) <= date)
      for (const u of units) if ((u.meta.gas ?? "R32") !== "R22") kgYear += C.refrigerantLeak(Number(u.meta.charge_kg ?? 0.8), leak, fe[REF_CODE[u.meta.gas ?? "R32"]]?.value ?? 677)
      sources.ac = { kg: kgYear / 365, label: units.length ? "estimasi" : "kosong", scope: 1, trace: { da: units.length, daUnit: "unit AC", factors: fRef(fe.REF_LEAK), formula: `Belum ada catatan servis, jadi diperkirakan dari ${units.length} unit AC yang sudah terdaftar: muatan refrigeran × laju bocor ${fx(leak * 100, 0)}% per tahun × GWP gas (AR5), dibagi 365 hari (default IPCC). Unit ber-R-22 (HCFC) tidak dihitung — dilaporkan terpisah sesuai Protokol Montreal.` } }
    }
  }
  // ---- Sampah — ENG-01/02, §7.7 ----
  // GHG Protocol: sampah yang diolah DI SEKOLAH (kompos, dibakar) = emisi langsung → Scope 1 (sumber "sampah_lokal");
  // sampah yang dikirim ke TPA/pihak lain = Scope 3 kategori 5 (sumber "sampah").
  {
    const ONSITE = new Set(["WS_KOMPOS", "WS_PLASTIK_BAKAR"])
    const splitLocal = (base: SourceResult, localKg: number, localDa: number, codes: string[]) => {
      if (localKg <= 0) return
      sources.sampah_lokal = { ...base, kg: localKg, scope: 1,
        trace: { da: localDa, daUnit: base.trace.daUnit, factors: codes.filter((c) => ONSITE.has(c)).flatMap((c) => fRef(fe[c])),
          formula: `Bagian sampah yang diolah di sekolah (dikompos / dibakar) — emisi langsung Scope 1 menurut GHG Protocol. ${base.trace.formula}` } }
      sources.sampah = { ...base, kg: base.kg - localKg, trace: { ...base.trace, formula: `Bagian yang dikirim ke TPA / bank sampah (Scope 3 kategori 5). ${base.trace.formula}` } }
    }
    const applicable = ctx.sessions.filter((x) => x.s.start_date <= date)
    const inSession = applicable.find((x) => x.byDate.has(date))
    if (inSession && k > 0) {
      const w = inSession.byDate.get(date)!
      const kg = w.reduce((s, x) => s + x.kg * (fe[x.factor_code]?.value ?? 0), 0)
      sources.sampah = { basis: { kind: "bulan_ini", period: date, text: `Penimbangan hari ini (sesi ${inSession.s.kind})` }, kg, label: "aktual", scope: 3, trace: { da: w.reduce((s, x) => s + x.kg, 0), daUnit: "kg ditimbang", factors: [...new Set(w.map((x) => x.factor_code))].flatMap((c) => fRef(fe[c])), formula: "Hari ini ada penimbangan, jadi dipakai berat aktual tiap jenis sampah × faktor sesuai perlakuannya (kompos, TPA, bank sampah)." } }
      const loc = w.filter((x) => ONSITE.has(x.factor_code))
      splitLocal(sources.sampah, loc.reduce((s, x) => s + x.kg * (fe[x.factor_code]?.value ?? 0), 0), loc.reduce((s, x) => s + x.kg, 0), [...new Set(w.map((x) => x.factor_code))])
    } else {
      // Data terbaru menggantikan data awal: begitu ada sesi ulang, sesi baseline tidak dipakai lagi
      const repeats = applicable.filter((x) => x.s.kind !== "baseline")
      // buku harian: sebelum sesi timbang pertama = kosong. Baseline: sesi onboarding dipakai sebagai sampel yang mewakili periode acuan.
      const use = repeats.length ? repeats.slice(-2) : applicable.length ? applicable.slice(-2) : ctx.baselineMode ? ctx.sessions.slice(0, 1) : []
      const merged = new Map<string, { factor: string; kg: number }>()
      for (const s of use) for (const a of s.avgs) {
        const m = merged.get(a.key) ?? { factor: a.factor, kg: 0 }
        m.kg += a.kgPerDay / use.length
        merged.set(a.key, m)
      }
      const avgs = [...merged.values()].map((m) => ({ kgPerDay: m.kg, factor: fe[m.factor]?.value ?? 0 }))
      const kg = C.wasteDaily(k, ctx.population, ctx.baselinePopulation, avgs)
      const localAvgs = [...merged.values()].filter((m) => ONSITE.has(m.factor)).map((m) => ({ kgPerDay: m.kg, factor: fe[m.factor]?.value ?? 0 }))
      const localKg = C.wasteDaily(k, ctx.population, ctx.baselinePopulation, localAvgs)
      const latest = use[use.length - 1]
      const old = latest && daysBetween(latest.s.start_date, date) > 183
      sources.sampah = {
        basis: !use.length ? { kind: "kosong", text: "Belum ada sesi penimbangan" } : repeats.length ? { kind: "terbaru", period: latest?.s.start_date, text: `Rata-rata ${use.length} sesi ulang terakhir (sesi baseline tidak dipakai lagi)` } : { kind: "baseline", period: latest?.s.start_date, text: "Masih memakai sesi penimbangan baseline" },
        kg, label: !use.length ? "kosong" : !applicable.length ? "proyeksi" : old ? "rata-rata lama" : "rata-rata", scope: 3,
        trace: { da: avgs.reduce((s, a) => s + a.kgPerDay, 0) * k, daUnit: "kg/hari (rata-rata)", factors: [...merged.values()].flatMap((m) => fRef(fe[m.factor])), formula: k > 0 ? `Rata-rata timbangan ${use.length} sesi ${repeats.length ? "ulang" : "baseline"} terakhir (${fx(avgs.reduce((s, a) => s + a.kgPerDay, 0))} kg/hari) × faktor tiap jenis & perlakuan, disesuaikan jumlah warga (${fx(ctx.population, 0)} kini ÷ ${fx(ctx.baselinePopulation, 0)} saat baseline)${k < 1 ? ` dan kehadiran ${fx(k * 100, 0)}%` : ""}.` : "Hari libur: tidak ada timbulan sampah sekolah." },
      }
      splitLocal(sources.sampah, localKg, localAvgs.reduce((s, a) => s + a.kgPerDay, 0) * k, [...merged.values()].map((m) => m.factor))
    }
  }
  // ---- Mobilitas (Scope 3) — ENG-08, §7.8 ----
  {
    // buku harian: sebelum survei pertama = kosong. Baseline: survei onboarding mewakili periode acuan (metode sampling).
    const sv = [...ctx.surveys].reverse().find((x) => x.date <= date) ?? (ctx.baselineMode ? ctx.surveys[0] : undefined)
    if (sv && k > 0) {
      const m = mobilityFromSurvey(ctx, sv)
      const svIdx = ctx.surveys.indexOf(sv)
      sources.mobilitas = { basis: svIdx > 0 ? { kind: "terbaru", period: sv.date, text: `Survei terbaru: ${sv.s.title ?? sv.date}` } : { kind: "baseline", period: sv.date, text: `Survei awal: ${sv.s.title ?? sv.date}` }, kg: m.kg * k, label: m.flagged ? "estimasi" : "aktual", scope: 3, trace: { da: m.km * k, daUnit: "km kendaraan", factors: ALL_MODE_FACTORS.filter((c) => fe[c]).flatMap((c) => fRef(fe[c])), formula: `Dari survei mobilitas (respons ${fx(m.rate * 100, 0)}%): jarak harian (km pulang-pergi per hari) tiap responden × faktor moda dari tabel faktor emisi (motor, ojek, mobil, taksi, antar-jemput, angkot, bus, kereta, pesawat; jalan kaki & sepeda = 0), dibagi jumlah penumpang (angkutan umum: muatan rata-rata), × hari per minggu ÷ hari sekolah, lalu diskalakan ke seluruh ${fx(ctx.population, 0)} warga. Total ${fx(m.km * k, 0)} km kendaraan hari ini.`, note: m.flagged ? "Respons < 70% — ditandai" : undefined } }
    } else sources.mobilitas = { kg: 0, label: sv ? "aktual" : "kosong", scope: 3, trace: { da: 0, daUnit: "km", factors: [], formula: "Hari libur: perjalanan ke sekolah tidak dihitung." } }
  }
  // ---- Air limbah ----
  // GHG Protocol: tangki septik milik sekolah = sumber langsung (Scope 1); limbah ke saluran/IPAL di luar sekolah = Scope 3 kat. 5.
  {
    const f = fe.WW_ORG_HARI
    const mult = ctx.org.sanitation === "septik" ? 1 : ctx.org.sanitation === "saluran" ? 0.2 : 0
    const kg = k * ctx.population * (f?.value ?? 0) * mult
    const onsite = ctx.org.sanitation === "septik"
    const mcf = 0.5 * mult
    sources.air_limbah = { kg, label: "estimasi", scope: onsite ? 1 : 3, trace: { da: k * ctx.population, daUnit: "orang-hari", factors: fRef(f), formula: k > 0 ? `${fx(k * ctx.population, 0)} orang hadir × ${fx((f?.value ?? 0) * mult, 4)} kg CO₂e per orang-hari. Asal faktor (IPCC 2006 Vol.5 Bab 6): BOD 40 g/orang/hari × kapasitas metana 0,6 × MCF ${fx(mcf, 2)} (${ctx.org.sanitation === "septik" ? "tangki septik" : ctx.org.sanitation === "saluran" ? "saluran/drainase" : "IPAL aerobik"}) × 33% waktu di sekolah × GWP metana 28. ${onsite ? "Tangki septik milik sekolah → Scope 1." : "Diolah di luar sekolah → Scope 3."}` : "Hari libur: tidak ada warga di sekolah." } }
  }

  for (const [src, r] of Object.entries(sources)) {
    if (r.basis) continue
    if (r.label === "kosong") { r.basis = { kind: "kosong", text: "Belum ada data" }; continue }
    if (ctx.records.has(`${src}:${ym}`)) { r.basis = { kind: "bulan_ini", period: ym, text: `Input ${monthName(ym)}` }; continue }
    if (r.label === "proyeksi" && r.trace.recordIds?.length) {
      const rec = [...ctx.records.values()].find((x) => x.id === r.trace.recordIds![0])
      r.basis = { kind: "terbaru", period: rec?.period, text: `Data aktual terakhir: ${rec ? monthName(rec.period) : "-"}` }; continue
    }
    if (r.label === "proyeksi") { r.basis = { kind: "baseline", text: `Profil harian baseline ${ctx.baseline?.version_label ?? ""}`.trim() }; continue }
    r.basis = { kind: "asumsi", text: src === "air_limbah" ? `Jumlah warga terbaru (${ctx.population}) × faktor sanitasi` : src === "ac" ? `${ctx.acUnits.length} unit AC terdaftar × laju bocor default` : "Faktor default" }
  }
  for (const s of none) if (sources[s] && sources[s].label === "kosong") delete sources[s]
  const scope = { 1: 0, 2: 0, 3: 0 } as Record<1 | 2 | 3, number>
  let total = 0
  for (const s of Object.values(sources)) { scope[s.scope] += s.kg; total += s.kg }
  return { date, dayType: type, k, total, scope, sources }

  function proj(source: string, sc: 1 | 2 | 3) {
    // tidak ada data bulan ini & tidak ada data aktual sebelumnya → kosong (profil baseline hanya pembanding, bukan sumber data)
    const bc = null as any
    const kg = 0
    sources[source] = { kg, label: "kosong", scope: sc, trace: { da: 0, daUnit: SOURCE_META[source]?.unit ?? "", factors: [], formula: bc ? `Data bulan ini belum diinput, jadi dipakai proyeksi dari profil harian baseline ${ctx.baseline?.version_label}.` : "Belum ada data untuk sumber ini." } }
  }
  function monthlyActive(source: string, f: Factor | undefined, unit: string, sc: 1 | 2 | 3) {
    const r = ctx.records.get(`${source}:${ym}`)
    if (!r) {
      const L = latest(source)
      if (!L) return proj(source, sc)
      const qty = k > 0 && L.mc.kSum > 0 ? (L.r.quantity / L.mc.kSum) * k : 0
      sources[source] = { kg: qty * (f?.value ?? 0), label: "proyeksi", scope: sc, trace: { da: qty, daUnit: unit, factors: fRef(f), recordIds: [L.r.id],
        formula: k > 0 ? `Data bulan ini belum diinput, jadi dipakai data aktual terakhir (${monthName(L.pm)}: ${fx(L.r.quantity)} ${unit} ÷ ${fx(L.mc.kSum)} hari aktif setara = ${fx(qty, 2)} ${unit}/hari) × faktor ${fx(f?.value ?? 0, 3)} ${f?.unit ?? ""}.` : `Hari libur: tidak ada pemakaian ${unit === "kg" ? "LPG (kantin tutup)" : unit}.` } }
      return
    }
    const qty = k > 0 && mc.kSum > 0 ? (r.quantity / mc.kSum) * k : 0
    sources[source] = { kg: qty * (f?.value ?? 0), label: recLabel(r), scope: sc, trace: { da: qty, daUnit: unit, factors: fRef(f), recordIds: [r.id], formula: k > 0 ? `Pemakaian bulan ini ${fx(r.quantity)} ${unit} dibagi rata ke ${fx(mc.kSum)} hari aktif setara = ${fx(qty, 2)} ${unit} hari ini, × faktor ${fx(f?.value ?? 0, 3)} ${f?.unit ?? ""}${f?.nonNational ? " (faktor non-nasional, DEFRA)" : ""}.` : `Hari libur: tidak ada pemakaian ${unit === "kg" ? "LPG (kantin tutup)" : unit}.` } }
  }
}

const mobilityCache = new WeakMap<Row, { kg: number; km: number; rate: number; flagged: boolean }>()
export function mobilityFromSurvey(ctx: OrgContext, sv: { s: Row; resps: Row[] }) {
  const hit = mobilityCache.get(sv.s)
  if (hit) return hit
  const schoolDays = ctx.org.school_days_per_week ?? 6
  const toResp = (r: Row): C.MobilityResp => toMobilityResp(r, ctx.fe, schoolDays)
  const classes: Record<string, number> = json(sv.s.classes, {})
  const N = ctx.population
  const all = sv.resps.map(toResp)
  const overall = C.mobilityDaily(all, schoolDays, N)
  const perPerson = overall.nResp ? overall.raw / overall.nResp : 0
  const perPersonKm = overall.nResp ? all.reduce((s, r) => s + C.mobilityKm(r, schoolDays), 0) / overall.nResp : 0
  let kg = overall.extrapolated
  let km = perPersonKm * N
  // ekstrapolasi per kelas bila ukuran kelas diketahui
  if (Object.keys(classes).length) {
    kg = 0; km = 0
    let covered = 0
    for (const [cls, size] of Object.entries(classes)) {
      const rs = sv.resps.filter((r) => r.class_name === cls).map(toResp)
      const n = rs.reduce((s, r) => s + (r.count ?? 1), 0)
      if (n > 0) {
        kg += (rs.reduce((s, r) => s + C.mobilityKm(r, schoolDays) * r.factor, 0) / n) * size
        km += (rs.reduce((s, r) => s + C.mobilityKm(r, schoolDays), 0) / n) * size
        covered += size
      }
    }
    kg += perPerson * Math.max(N - covered, 0)
    km += perPersonKm * Math.max(N - covered, 0)
  }
  const res = { kg, km, rate: overall.responseRate, flagged: overall.flagged }
  mobilityCache.set(sv.s, res)
  return res
}

export async function computeRange(orgId: number, start: string, end: string, ctxIn?: OrgContext) {
  const ctx = ctxIn ?? (await loadContext(orgId))
  const out: DayResult[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(computeDay(ctx, d))
  return out
}

// ======================= POHON (ENG-03..06, §7.9) =======================
export interface TreeState { dbh: number; stock: number; label: Label; growth: number; growthSource: "default" | "terukur"; stopped: boolean }
export interface TreeModel { asset: Row; species: Row; ms: Row[]; growthHistory: { from: string; growth: number; source: string }[] }

export async function loadTrees(orgId: number): Promise<TreeModel[]> {
  const species = new Map((await q.all("SELECT * FROM species")).map((s) => [s.id, s]))
  const trees = (await q.all("SELECT * FROM assets WHERE org_id = ? AND type = 'pohon'", orgId))
  const ms = (await q.all(
    "SELECT m.* FROM tree_measurements m JOIN assets a ON a.id = m.asset_id WHERE a.org_id = ? AND m.measurer_role = 'operator' AND m.status != 'ditolak' ORDER BY m.date, m.id", orgId))
  const byTree = new Map<number, Row[]>()
  for (const m of ms) byTree.set(m.asset_id, [...(byTree.get(m.asset_id) ?? []), m])
  return trees.map((a) => buildTree(a, species.get(a.species_id) ?? species.values().next().value!, byTree.get(a.id) ?? []))
}
export function buildTree(asset: Row, species: Row, ms: Row[]): TreeModel {
  // ENG-05 kalibrasi riap: ukur ulang pertama → riap pohon itu; berikutnya rata-rata 2 selang terakhir
  const growthHistory: TreeModel["growthHistory"] = [{ from: ms[0]?.date ?? "", growth: species.growth_default, source: "default" }]
  const intervals: number[] = []
  for (let i = 1; i < ms.length; i++) {
    const days = daysBetween(ms[i - 1].date, ms[i].date)
    if (days < 30) continue
    intervals.push(C.calibratedGrowth(ms[i - 1].dbh, ms[i].dbh, days))
    const last2 = intervals.slice(-2)
    const g = last2.reduce((a, b) => a + b, 0) / last2.length
    growthHistory.push({ from: ms[i].date, growth: Math.max(g, 0), source: "terukur" })
  }
  return { asset, species, ms, growthHistory }
}
export const speciesEq = (s: Row): C.SpeciesEq => ({
  equation: s.equation, a: s.a, b: s.b, ah: s.ah, bh: s.bh, density: s.density, carbonFraction: s.carbon_fraction, rootRatio: s.root_ratio ?? 0,
  carbonTree: !!s.carbon_tree, dbhMin: s.dbh_min, dbhMax: s.dbh_max,
})
/** Keadaan pohon pada tanggal tertentu. undefined = belum masuk inventaris. */
export function treeAt(t: TreeModel, date: string): TreeState | undefined {
  const { ms, species } = t
  if (!ms.length || date < ms[0].date) return undefined
  if (t.asset.dead_at && date >= t.asset.dead_at) return { dbh: 0, stock: 0, label: "terukur", growth: 0, growthSource: "terukur", stopped: true }
  const eq = speciesEq(species)
  let i = ms.length - 1
  while (i > 0 && ms[i].date > date) i--
  const m = ms[i]
  const g = [...t.growthHistory].reverse().find((h) => h.from <= date) ?? t.growthHistory[0]
  if (i < ms.length - 1) {
    // ENG-04 rekonsiliasi: interpolasi linear di antara dua pengukuran aktual
    const n = ms[i + 1]
    const span = daysBetween(m.date, n.date)
    const dbh = m.dbh + (n.dbh - m.dbh) * (daysBetween(m.date, date) / span)
    return { dbh, stock: C.treeStockCO2(eq, dbh, m.height), label: "terukur", growth: g.growth, growthSource: g.source as any, stopped: false }
  }
  const since = daysBetween(m.date, date)
  const stopped = since > 365 // ENG-06
  const dbh = C.projectDbh(m.dbh, g.growth, Math.min(since, 365))
  return { dbh, stock: C.treeStockCO2(eq, dbh, m.height), label: since === 0 ? "terukur" : "proyeksi", growth: g.growth, growthSource: g.source as any, stopped }
}
/** Serapan periode untuk pohon yang sama (pohon baru bukan serapan; pohon mati = pelepasan). */
export function treeAbsorption(trees: TreeModel[], start: string, end: string) {
  let absorbed = 0, released = 0
  const prev = addDays(start, -1)
  for (const t of trees) {
    const a = treeAt(t, prev)
    const b = treeAt(t, end)
    if (!a) {
      // masuk inventaris di tengah periode: hitung dari pengukuran pertama
      if (!b || !t.ms.length) continue
      const first = treeAt(t, t.ms[0].date)!
      absorbed += Math.max(b.stock - first.stock, 0)
      continue
    }
    if (!b) continue
    if (t.asset.dead_at && t.asset.dead_at >= start && t.asset.dead_at <= end) released += a.stock
    else absorbed += b.stock - a.stock
  }
  return { absorbed, released, net: absorbed - released }
}
/** Serapan harian (kg CO₂/hari) = stok hari ini − stok kemarin, untuk pohon yang sama. Pohon berhenti diproyeksikan (>12 bln tanpa ukur) = 0. */
export function treeDaily(trees: TreeModel[], start: string, end: string) {
  const out: { date: string; absorbed: number; active: number }[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) {
    let absorbed = 0, active = 0
    for (const t of trees) {
      const a = treeAt(t, addDays(d, -1)), b = treeAt(t, d)
      if (!a || !b || (t.asset.dead_at && t.asset.dead_at <= d)) continue
      const diff = b.stock - a.stock
      if (diff > 0) { absorbed += diff; active++ }
    }
    out.push({ date: d, absorbed, active })
  }
  return out
}
/** Dasar data pohon: sudah diukur ulang (riap terukur menggantikan data awal) vs masih data awal (riap default jenis). */
export function treeBasis(trees: TreeModel[], date: string) {
  let remeasured = 0, initialOnly = 0, stopped = 0, lastMeasured = ""
  for (const t of trees) {
    const s = treeAt(t, date)
    if (!s || (t.asset.dead_at && t.asset.dead_at <= date)) continue
    const ms = t.ms.filter((m) => m.date <= date)
    if (ms.length >= 2) remeasured++
    else initialOnly++
    if (s.stopped) stopped++
    const last = ms[ms.length - 1]?.date ?? ""
    if (last > lastMeasured) lastMeasured = last
  }
  return { remeasured, initialOnly, stopped, lastMeasured }
}
export function treeStock(trees: TreeModel[], date: string) {
  let stock = 0, count = 0, stopped = 0
  for (const t of trees) {
    const s = treeAt(t, date)
    if (!s || s.stock === 0 && t.asset.status !== "hidup") continue
    stock += s.stock; count++
    if (s.stopped) stopped++
  }
  return { stock, count, stopped }
}

// ======================= EMISI TERHINDAR (ENG-09, §7.10) =======================
export async function computeAvoided(orgId: number, start: string, end: string, ctxIn?: OrgContext) {
  const ctx = ctxIn ?? (await loadContext(orgId))
  const fe = ctx.fe
  let kompos = 0, bankKertas = 0, bankMaterial = 0, plts = 0
  const kgK = { kompos: 0, kertas: 0, material: 0 }
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const { k } = dayInfo(ctx, d)
    if (k <= 0) continue
    const applicable = ctx.sessions.filter((x) => x.s.start_date <= d)
    const use = applicable.length ? applicable.slice(-2) : ctx.sessions.slice(0, 1)
    const ratio = ctx.baselinePopulation ? ctx.population / ctx.baselinePopulation : 1
    for (const s of use) for (const a of s.avgs) {
      const kg = (a.kgPerDay / use.length) * k * ratio
      const [cat, treat] = a.key.split("|")
      if (treat === "kompos") { kgK.kompos += kg; kompos += C.avoidedCompost(kg, fe[cat === "kebun" ? "WS_KEBUN_TPA" : "WS_MAKANAN_TPA"]?.value ?? 0, fe.WS_KOMPOS?.value ?? 0) }
      if (treat === "bank_sampah" && cat === "kertas") { kgK.kertas += kg; bankKertas += kg * (fe.WS_KERTAS_TPA?.value ?? 0) }
      if (treat === "bank_sampah" && cat !== "kertas") kgK.material += kg
    }
  }
  bankMaterial = kgK.material
  let pltsKwh = 0
  for (let m = monthOf(start); m <= monthOf(end); m = monthOf(addDays(m + "-28", 7))) {
    const r = ctx.records.get(`plts:${m}`)
    if (!r) continue
    const n = daysInMonth(m)
    const s = m === monthOf(start) ? Number(start.slice(8)) : 1
    const e = m === monthOf(end) ? Number(end.slice(8)) : n
    pltsKwh += (r.quantity * (e - s + 1)) / n
  }
  plts = pltsKwh * (fe[ctx.org.grid_code ?? "EL_JAMALI"]?.value ?? fe.EL_JAMALI?.value ?? 0.87)
  const assets = (await q.all("SELECT * FROM assets WHERE org_id = ? AND type IN ('biopori','atap') AND status = 'hidup'", orgId)).map((a: Row) => ({ ...a, meta: json(a.meta, {} as any) }) as Row)
  const biopori = assets.filter((a) => a.type === "biopori")
  const bioporiL = biopori.reduce((s, a) => s + C.bioporiLiters(a.meta.diameter_cm ?? 10, a.meta.depth_cm ?? 100), 0)
  const roofM2 = assets.filter((a) => a.type === "atap").reduce((s, a) => s + (a.meta.area_m2 ?? 0), 0)
  const rain = (await q.all<{ mm: number }>("SELECT mm FROM rainfall WHERE org_id = ? AND period BETWEEN ? AND ?", orgId, monthOf(start), monthOf(end)))
  const rainMm = rain.reduce((s, r) => s + r.mm, 0)
  return {
    kompos: { kg: kgK.kompos, co2e: kompos },
    bankKertas: { kg: kgK.kertas, co2e: bankKertas },
    bankMaterial: { kg: bankMaterial },
    plts: { kwh: pltsKwh, co2e: plts },
    totalCo2e: kompos + bankKertas + plts,
    biopori: { count: biopori.length, liters: bioporiL },
    rainHarvest: { roofM2, rainMm, liters: C.rainHarvestLiters(roofM2, rainMm) },
  }
}

// ======================= RINGKASAN PERIODE =======================
export function summarize(days: DayResult[]) {
  const bySource: Record<string, { kg: number; labels: Record<string, number> }> = {}
  const scope = { 1: 0, 2: 0, 3: 0 }
  let total = 0, strong = 0, activeDays = 0
  for (const d of days) {
    if (d.k > 0) activeDays++
    for (const [src, s] of Object.entries(d.sources)) {
      const b = (bySource[src] ??= { kg: 0, labels: {} })
      b.kg += s.kg
      b.labels[s.label] = (b.labels[s.label] ?? 0) + s.kg
      scope[s.scope] += s.kg
      total += s.kg
      if (["aktual", "terukur", "terverifikasi"].includes(s.label)) strong += s.kg
    }
  }
  return { total, scope, bySource, activeDays, days: days.length, strongShare: total ? strong / total : 0 }
}

export { todayWIB }
