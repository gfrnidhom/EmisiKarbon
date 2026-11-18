// Rumus inti mesin hitung JejakHijau (PRD §7). Fungsi murni — tanpa akses DB — agar bisa diuji golden dataset.
import { C_TO_CO2, GWP } from "./factors"

/** §7.1  E_CO2e = DA × (FE_CO2 + 28·FE_CH4 + 265·FE_N2O) */
export function co2e(da: number, fe: { co2?: number; ch4?: number; n2o?: number; co2e?: number }) {
  if (fe.co2e !== undefined) return da * fe.co2e
  return da * ((fe.co2 ?? 0) + GWP.CH4 * (fe.ch4 ?? 0) + GWP.N2O * (fe.n2o ?? 0))
}

/** §7.1 Alokasi harian dari data bulanan: hari aktif & hari libur */
export function allocateMonthly(eMonth: number, nActive: number, nHoliday: number, eBase: number) {
  if (nActive <= 0) return { active: 0, holiday: nHoliday > 0 ? eMonth / nHoliday : 0 }
  // Beban dasar libur melebihi tagihan → bagi rata agar total bulan tetap = tagihan (konservasi massa)
  if (nHoliday * eBase >= eMonth) { const flat = eMonth / (nActive + nHoliday); return { active: flat, holiday: flat } }
  return { active: (eMonth - nHoliday * eBase) / nActive, holiday: eBase }
}

/** §7.3 Refrigeran */
export function refrigerantTopUp(kgTopUp: number, gwp: number) {
  return kgTopUp * gwp
}
export function refrigerantLeak(chargeKg: number, leakRate: number, gwp: number) {
  return chargeKg * leakRate * gwp // per tahun
}

/** §7.7 Sampah harian */
export interface WasteAvg { kgPerDay: number; factor: number }
export function wasteDaily(k: number, nNow: number, nBaseline: number, avgs: WasteAvg[]) {
  const ratio = nBaseline > 0 ? nNow / nBaseline : 1
  return k * ratio * avgs.reduce((s, a) => s + a.kgPerDay * a.factor, 0)
}

/** §7.8 Mobilitas: km per hari aktif = jarak harian ÷ penumpang × (hari/minggu ÷ hari sekolah) */
export interface MobilityResp {
  dailyKm: number // jarak harian: total km pulang-pergi per hari (termasuk perjalanan pengantar)
  occupants: number // o (1 untuk faktor per penumpang-km)
  factor: number // FE moda kg CO2e/km
  daysPerWeek: number // h
  count?: number // jumlah orang yang diwakili baris ini (default 1)
}
export function mobilityKm(r: MobilityResp, schoolDays: number) {
  const n = r.count ?? 1
  return (n * r.dailyKm) / Math.max(r.occupants, 1) * (r.daysPerWeek / schoolDays)
}
export function mobilityDaily(resps: MobilityResp[], schoolDays: number, nPopulation: number) {
  const nResp = resps.reduce((s, r) => s + (r.count ?? 1), 0)
  const e = resps.reduce((s, r) => s + mobilityKm(r, schoolDays) * r.factor, 0)
  const responseRate = nPopulation > 0 ? nResp / nPopulation : 0
  const extrapolated = nResp > 0 ? e * (nPopulation / nResp) : 0
  return { raw: e, extrapolated, nResp, responseRate, flagged: responseRate < 0.7 }
}

/** §7.4 & §7.9 Pohon */
export interface SpeciesEq {
  /** mahoni   : C = a·D^b (kg karbon langsung, persamaan lokal Perhutani)
   *  power    : AGB = a·D^b  — atau a_h·(D²H)^b_h bila tinggi diukur & koefisien tersedia (persamaan lokal jenis)
   *  chave    : Chave et al. 2014 bila ada tinggi, Ketterings et al. 2001 bila tidak (model umum + berat jenis)
   *  chave2005: Chave et al. 2005 hutan lembap tanpa tinggi (model umum + berat jenis) */
  equation: "mahoni" | "chave" | "power" | "chave2005"
  a?: number | null
  b?: number | null
  ah?: number | null
  bh?: number | null
  density: number
  carbonFraction: number
  rootRatio: number
  carbonTree: boolean
  dbhMin?: number
  dbhMax?: number
}
export function equivalentDbh(stems: number[]) {
  return Math.sqrt(stems.reduce((s, d) => s + d * d, 0))
}
/** Stok CO2 (kg) satu pohon. */
export function treeStockCO2(sp: SpeciesEq, dbh: number, heightM?: number | null) {
  if (!sp.carbonTree || dbh < 5) return 0
  if (sp.equation === "mahoni") {
    // C total = a × DBH^b (kg C) → × 44/12
    return (sp.a ?? 0.044) * Math.pow(dbh, sp.b ?? 2.541) * C_TO_CO2
  }
  let agb: number
  const hasH = !!heightM && heightM > 0
  if (sp.equation === "power" && hasH && sp.ah && sp.bh) {
    // persamaan lokal dengan tinggi: AGB = a_h × (D²H)^b_h
    agb = sp.ah * Math.pow(dbh * dbh * heightM!, sp.bh)
  } else if (sp.equation === "power" && sp.a && sp.b) {
    agb = sp.a * Math.pow(dbh, sp.b)
  } else if (sp.equation === "chave2005" && !hasH) {
    // Chave et al. 2005, hutan tropis lembap (tanpa tinggi): AGB = ρ × exp(−1,499 + 2,148 lnD + 0,207 (lnD)² − 0,0281 (lnD)³)
    const l = Math.log(dbh)
    agb = sp.density * Math.exp(-1.499 + 2.148 * l + 0.207 * l * l - 0.0281 * l * l * l)
  } else if (hasH) {
    // Chave et al. 2014: AGB = 0,0673 × (ρ D² H)^0,976
    agb = 0.0673 * Math.pow(sp.density * dbh * dbh * heightM, 0.976)
  } else {
    // Ketterings 2001 (tanpa tinggi): AGB = 0,11 × ρ × D^2,62
    agb = 0.11 * sp.density * Math.pow(dbh, 2.62)
  }
  const total = agb * (1 + (sp.rootRatio ?? 0))
  return total * sp.carbonFraction * C_TO_CO2
}
export function isExtrapolated(sp: SpeciesEq, dbh: number) {
  return sp.dbhMax !== undefined && sp.dbhMax > 0 && (dbh < (sp.dbhMin ?? 0) || dbh > sp.dbhMax)
}
/** D(t) = D_ukur + r × (t − t_ukur)/365 */
export function projectDbh(dbhLast: number, growth: number, days: number) {
  return dbhLast + growth * (days / 365)
}
/** r_pohon = (D2 − D1) / ((t2 − t1)/365) */
export function calibratedGrowth(d1: number, d2: number, days: number) {
  return days > 0 ? (d2 - d1) / (days / 365) : 0
}
export function growthCheck(growth: number, dPrev: number, dNew: number) {
  return growth >= 0 && growth <= 6 && dNew >= dPrev * 0.95 ? "wajar" : "periksa"
}

/** §7.10 Emisi terhindar */
export function avoidedCompost(kg: number, feLandfill: number, feCompost: number) {
  return kg * (feLandfill - feCompost)
}
export const bioporiLiters = (diameterCm: number, depthCm: number) =>
  Math.PI * Math.pow(diameterCm / 200, 2) * (depthCm / 100) * 1000
export const rainHarvestLiters = (roofM2: number, rainMm: number, coef = 0.8) => roofM2 * rainMm * coef

/** Baseline: skor kelengkapan */
export function completenessScore(filled: Record<string, boolean>, weights: Record<string, number>) {
  const total = Object.values(weights).reduce((s, w) => s + w, 0)
  const got = Object.entries(weights).reduce((s, [k, w]) => s + (filled[k] ? w : 0), 0)
  return total > 0 ? (got / total) * 100 : 0
}

/** Interpolasi bulan hilang (≤ 2 bulan) = rata-rata bulan bersebelahan */
export function interpolateMonths(values: (number | null)[]) {
  const out = [...values]
  const labels: ("aktual" | "interpolasi" | "kosong")[] = values.map((v) => (v === null ? "kosong" : "aktual"))
  let i = 0
  while (i < out.length) {
    if (out[i] !== null) { i++; continue }
    let j = i
    while (j < out.length && out[j] === null) j++
    const gap = j - i
    const prev = i > 0 ? out[i - 1] : null
    const next = j < out.length ? out[j] : null
    if (gap <= 2 && (prev !== null || next !== null)) {
      const fill = prev !== null && next !== null ? (prev + next) / 2 : (prev ?? next)!
      for (let k = i; k < j; k++) { out[k] = fill; labels[k] = "interpolasi" }
    }
    i = j
  }
  return { values: out, labels }
}
