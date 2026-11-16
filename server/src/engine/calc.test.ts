// Golden dataset dari "Perhitungan Emisi Karbon.xlsx" (sheet Kalk_*). Wajib lulus di CI (NFR-14, UAT-09/16).
import { describe, expect, test } from "bun:test"
import * as C from "./calc"
import { DEFAULT_FACTORS, compostFactor, landfillFactor, DOC, wastewaterPerPersonDay } from "./factors"

const fe = (code: string) => DEFAULT_FACTORS.find((f) => f.code === code)!.value
const close = (a: number, b: number, tolPct = 0.5) => expect(Math.abs(a - b) / Math.max(Math.abs(b), 1e-9) * 100).toBeLessThanOrEqual(tolPct)

describe("Faktor turunan (Sampah_Air_Limbah)", () => {
  test("FE TPA makanan = 0,84; kertas = 2,24; kompos = 0,1756", () => {
    close(landfillFactor(DOC.makanan), 0.84, 0.01)
    close(landfillFactor(DOC.kertas), 2.24, 0.01)
    close(landfillFactor(DOC.kebun), 1.12, 0.01)
    close(compostFactor, 0.1756, 0.01)
  })
  test("air limbah per orang-hari = 0,11088 kg CO2e", () => close(wastewaterPerPersonDay, 0.11088, 0.01))
})

describe("Kalk_Sampah: sesi 8 hari → rata-rata", () => {
  const rows: [string, number[]][] = [
    ["WS_KOMPOS", [9, 7, 8, 8, 9, 7, 8, 8]],
    ["WS_MAKANAN_TPA", [9, 8, 8, 7, 9, 7, 8, 8]],
    ["WS_DAUR_ULANG", [7, 5, 6, 6, 7, 5, 6, 6]],
    ["WS_KERTAS_TPA", [3, 3, 3, 3, 4, 2, 3, 3]],
    ["WS_DAUR_ULANG", [5, 5, 6, 4, 6, 4, 5, 5]],
    ["WS_RESIDU_TPA", [8, 8, 8, 7, 9, 8, 8, 8]],
  ]
  const avgs = rows.map(([code, v]) => ({ kgPerDay: v.reduce((a, b) => a + b) / v.length, factor: fe(code) }))
  test("emisi sampah per hari aktif = 14,8448 kg CO2e", () => close(C.wasteDaily(1, 645, 645, avgs), 14.8448, 0.01))
  test("hari libur = 0", () => expect(C.wasteDaily(0, 645, 645, avgs)).toBe(0))
  test("skala warga (ENG-07)", () => close(C.wasteDaily(1, 700, 645, avgs), 14.8448 * 700 / 645, 0.01))
})

describe("Kalk_Mobilitas", () => {
  const S = 6
  const r = (count: number, mode: string, d: number, f: 1 | 2, o: number) => ({ count, factor: fe(mode), distanceKm: d, escort: f, occupants: o, daysPerWeek: 6 })
  const resps = [
    r(120, "TR_MOTOR", 4, 1, 1), r(80, "TR_MOTOR", 5, 1, 2), r(150, "TR_MOTOR", 3, 2, 1), r(60, "TR_MOTOR", 4, 1, 1),
    r(10, "TR_SEDAN", 6, 2, 1), r(40, "TR_ANGKOT", 5, 1, 8), r(185, "TR_AKTIF", 1, 1, 1),
  ]
  test("km kendaraan motor = 3640", () => expect(resps.slice(0, 4).reduce((s, x) => s + C.mobilityKm(x, S), 0)).toBeCloseTo(3640, 6))
  test("emisi harian = 370,23 kg CO2e (respons 100%)", () => {
    const m = C.mobilityDaily(resps, S, 645)
    close(m.extrapolated, 370.23, 0.01)
    expect(m.flagged).toBe(false)
  })
  test("respons < 70% ditandai & diekstrapolasi", () => {
    const m = C.mobilityDaily(resps, S, 1000)
    expect(m.flagged).toBe(true)
    close(m.extrapolated, 370.23 * 1000 / 645, 0.01)
  })
})

describe("Kalk_Harian (UAT-16): satu hari aktif = 368,7 kg CO2e", () => {
  const listrik = C.allocateMonthly(2100 * fe("EL_JAMALI"), 22, 8, 15 * fe("EL_JAMALI"))
  const lpg = (18 / 22) * fe("LPG_BI")
  const motor = 2900 * fe("TR_MOTOR")
  const mobil = 150 * fe("TR_SEDAN")
  const sampah = 14.8448
  test("listrik hari aktif 78,3; libur 13,05", () => {
    close(listrik.active, 78.3, 0.01)
    close(listrik.holiday, 13.05, 0.01)
  })
  test("total 368,66", () => close(listrik.active + lpg + motor + mobil + sampah, 368.66, 0.01))
})

describe("Refrigeran", () => {
  test("R-32 0,8 kg × 3% × 675 = 16,2 kg/th", () => close(C.refrigerantLeak(0.8, 0.03, 675), 16.2, 0.001))
})

describe("Kalk_Pohon #TREE-001 Mahoni", () => {
  const sp = { equation: "mahoni" as const, a: 0.044, b: 2.541, density: 0.49, carbonFraction: 0.47, rootRatio: 0, carbonTree: true }
  const days = 181 // 15 Jan → 15 Jul 2026
  const s0 = C.treeStockCO2(sp, 24)
  const s1 = C.treeStockCO2(sp, 24.6)
  test("stok t0 = 0,044 × 24^2,541 × 44/12", () => close(s0, 0.044 * Math.pow(24, 2.541) * 44 / 12, 0.0001))
  test("serapan terukur = stok t1 − stok t0 (ENG-04)", () => expect(s1 - s0).toBeGreaterThan(0))
  test("riap terkalibrasi 1,21 cm/th dan wajar", () => {
    const g = C.calibratedGrowth(24, 24.6, days)
    close(g, 1.2099, 0.05)
    expect(C.growthCheck(g, 24, 24.6)).toBe("wajar")
  })
  test("DBH turun > 5% → periksa", () => expect(C.growthCheck(0, 24, 22)).toBe("periksa"))
  test("Chave 2014 contoh ρ0,49 D24 H11 + akar 0,24", () => {
    const chave = { equation: "chave" as const, density: 0.49, carbonFraction: 0.47, rootRatio: 0.24, carbonTree: true }
    const agb = 0.0673 * Math.pow(0.49 * 24 * 24 * 11, 0.976)
    close(C.treeStockCO2(chave, 24, 11), agb * 1.24 * 0.47 * 44 / 12, 0.0001)
  })
  test("Jati lokal Siregar 2011: 0,054 × D^2,579 (tanpa tinggi)", () => {
    const jati = { equation: "power" as const, a: 0.054, b: 2.579, density: 0.6, carbonFraction: 0.47, rootRatio: 0.24, carbonTree: true }
    close(C.treeStockCO2(jati, 30), 0.054 * Math.pow(30, 2.579) * 1.24 * 0.47 * 44 / 12, 0.0001)
  })
  test("persamaan lokal dengan tinggi dipakai bila H diukur", () => {
    const sp2 = { equation: "power" as const, a: 0.054, b: 2.579, ah: 0.015, bh: 1.084, density: 0.6, carbonFraction: 0.47, rootRatio: 0.24, carbonTree: true }
    close(C.treeStockCO2(sp2, 30, 15), 0.015 * Math.pow(30 * 30 * 15, 1.084) * 1.24 * 0.47 * 44 / 12, 0.0001)
    close(C.treeStockCO2(sp2, 30), 0.054 * Math.pow(30, 2.579) * 1.24 * 0.47 * 44 / 12, 0.0001) // tanpa tinggi → a·D^b
  })
  test("Chave 2005 hutan lembap tanpa tinggi", () => {
    const c5 = { equation: "chave2005" as const, density: 0.55, carbonFraction: 0.47, rootRatio: 0.24, carbonTree: true }
    const l = Math.log(25), agb = 0.55 * Math.exp(-1.499 + 2.148 * l + 0.207 * l * l - 0.0281 * l * l * l)
    close(C.treeStockCO2(c5, 25), agb * 1.24 * 0.47 * 44 / 12, 0.0001)
  })
  test("pohon DBH < 5 cm / palem tanpa stok", () => {
    expect(C.treeStockCO2(sp, 4)).toBe(0)
    expect(C.treeStockCO2({ ...sp, carbonTree: false }, 30)).toBe(0)
  })
  test("diameter setara batang bercabang", () => close(C.equivalentDbh([3, 4]), 5, 0.0001))
})

describe("Jasa lingkungan & utilitas", () => {
  test("biopori Ø10 × 100 cm = 7,85 L", () => close(C.bioporiLiters(10, 100), 7.854, 0.01))
  test("kompos terhindar 8 kg × (0,84 − 0,1756)", () => close(C.avoidedCompost(8, 0.84, 0.1756), 5.3152, 0.01))
  test("panen hujan 120 m² × 15 mm × 0,8 = 1440 L", () => expect(C.rainHarvestLiters(120, 15)).toBe(1440))
  test("skor kelengkapan", () => expect(C.completenessScore({ a: true, b: false }, { a: 75, b: 25 })).toBe(75))
  test("interpolasi ≤ 2 bulan", () => {
    const r = C.interpolateMonths([100, null, 120, null, null, null, 90])
    expect(r.values[1]).toBe(110)
    expect(r.labels[1]).toBe("interpolasi")
    expect(r.values[3]).toBeNull()
  })
})

describe("Kesesuaian IPCC", () => {
  test("Plastik dibakar terbuka = CO2 fosil 1,595 + CH4 0,182 + N2O 0,040 ≈ 1,817 kg CO2e/kg", () => {
    const { plasticBurnFactor } = require("./factors")
    close(plasticBurnFactor, 0.75 * 0.58 * 44 / 12 + 0.0065 * 28 + 0.00015 * 265, 1e-6)
    close(plasticBurnFactor, 1.817, 0.1)
  })
  test("GWP refrigeran konsisten AR5 (sama dengan GWP CH4 28 & N2O 265)", () => {
    expect(fe("GWP_CH4")).toBe(28)
    expect(fe("REF_R32")).toBe(677); expect(fe("REF_R410A")).toBe(1923.5); expect(fe("REF_R134A")).toBe(1300)
  })
  test("Sampah TPA: makanan 0,15×0,5×0,6×0,5×16/12×28 = 0,84", () => close(fe("WS_MAKANAN_TPA"), 0.84, 1e-6))
  test("Air limbah septik: 40 g BOD × 0,6 × 0,5 × 0,33 × 28 = 0,11088 kg/orang-hari", () => close(fe("WW_ORG_HARI"), 0.11088, 1e-6))
})

describe("Konservasi: jumlah harian sebulan = data bulanan", () => {
  test("Tagihan 2.000 kWh, 22 aktif + 8 libur × 15 kWh", () => {
    const a = C.allocateMonthly(2000, 22, 8, 15)
    close(a.active * 22 + a.holiday * 8, 2000, 1e-6)
  })
  test("Beban dasar libur melebihi tagihan tetap konservatif", () => {
    const a = C.allocateMonthly(100, 20, 10, 15)
    close(a.active * 20 + a.holiday * 10, 100, 1e-6)
    expect(a.active).toBeGreaterThanOrEqual(0)
  })
  test("Sebulan penuh libur", () => {
    const a = C.allocateMonthly(300, 0, 30, 15)
    close(a.holiday * 30, 300, 1e-6)
  })
})
