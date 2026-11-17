import { describe, expect, it } from "bun:test"
import { toWibDate, startOfWeekWIB, wibMidnightUtc, IOT_CATEGORIES, categoryOf } from "./iot"

describe("IoT kalkulasi & WIB timezone", () => {
  it("toWibDate mengonversi UTC string ke tanggal WIB (+7)", () => {
    // 2026-11-16 18:00:00 UTC = 2026-11-17 01:00:00 WIB
    expect(toWibDate("2026-11-16 18:00:00")).toBe("2026-11-17")
    // 2026-11-17 02:00:00 UTC = 2026-11-17 09:00:00 WIB
    expect(toWibDate("2026-11-17 02:00:00")).toBe("2026-11-17")
    // 2026-11-16 16:59:59 UTC = 2026-11-16 23:59:59 WIB
    expect(toWibDate("2026-11-16 16:59:59")).toBe("2026-11-16")
  })

  it("wibMidnightUtc menghasilkan batas 00:00 WIB dalam UTC (17:00 hari sebelumnya)", () => {
    expect(wibMidnightUtc("2026-11-17")).toBe("2026-11-16 17:00:00")
  })

  it("startOfWeekWIB menentukan hari Senin minggu berjalan", () => {
    // 2026-11-17 adalah hari Selasa, Seninnya adalah 2026-11-16
    expect(startOfWeekWIB("2026-11-17")).toBe("2026-11-16")
    // 2026-11-16 adalah hari Senin
    expect(startOfWeekWIB("2026-11-16")).toBe("2026-11-16")
    // 2026-11-22 adalah hari Minggu, Seninnya adalah 2026-11-16
    expect(startOfWeekWIB("2026-11-22")).toBe("2026-11-16")
  })

  it("categoryOf mengenali kategori listrik_pln", () => {
    expect(categoryOf({ category: "listrik_pln" })).toBe("listrik_pln")
    expect(categoryOf({ source: "listrik" })).toBe("listrik_pln")
    expect(categoryOf({ kind: "water_meter" })).toBe("air")
    expect(IOT_CATEGORIES.listrik_pln.scope).toBe(2)
  })
})
