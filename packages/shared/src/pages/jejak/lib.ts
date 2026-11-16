import { Bike, Flame, Home, Plane, Trash2, Utensils, Zap, type LucideIcon } from "lucide-react"
import { tl } from "@/lib/i18n"

export const SECTORS: Record<string, { id: string; en: string; color: string; icon: LucideIcon }> = {
  transport: { id: "Transportasi", en: "Transport", color: "oklch(0.55 0.12 155)", icon: Bike },
  flight: { id: "Penerbangan", en: "Flights", color: "oklch(0.62 0.07 210)", icon: Plane },
  home: { id: "Rumah (listrik & LPG)", en: "Home (power & LPG)", color: "oklch(0.34 0.07 160)", icon: Home },
  food: { id: "Makanan", en: "Food", color: "oklch(0.76 0.13 78)", icon: Utensils },
  waste: { id: "Sampah", en: "Waste", color: "oklch(0.62 0.09 112)", icon: Trash2 },
}
export const sectorLabel = (k: string) => tl(SECTORS[k]?.id ?? k, SECTORS[k]?.en ?? k)
export const ITEM_ICON = (key: string): LucideIcon => (key === "listrik" ? Zap : key === "lpg" ? Flame : SECTORS[key.startsWith("tr-") ? "transport" : key.startsWith("fl-") ? "flight" : key.startsWith("fd-") ? "food" : key === "sampah" ? "waste" : "home"]?.icon ?? Home)

export type FootprintData = {
  v: 2; household: number
  transport: { mode: string; kmWeek: number; share?: number }[]
  flights: { band: string; trips: number; roundTrip: boolean }[]
  electricity: { method: "kwh" | "tagihan" | "alat"; kwh: number; rupiah: number; tariff: string; grid: string; appliances: Record<string, { count: number; hours: number }> }
  lpg: number
  waste: { kgWeek: number; sortedPct: number }
  food: Record<string, number>
}
export const DEFAULT_DATA: FootprintData = {
  v: 2, household: 3,
  transport: [{ mode: "motor", kmWeek: 60 }],
  flights: [],
  electricity: { method: "kwh", kwh: 150, rupiah: 220000, tariff: "r1_1300", grid: "EL_JAMALI", appliances: { lampu_led: { count: 6, hours: 8 }, kulkas: { count: 1, hours: 12 }, tv: { count: 1, hours: 5 }, rice_cooker: { count: 1, hours: 4 } } },
  lpg: 6,
  waste: { kgWeek: 5, sortedPct: 0 },
  food: { beras: 14, ayam: 3, telur: 4, ikan: 2, tahu: 3, sayur: 7 },
}

/** Saran aksi pengurangan dari data & hasil hitungan — perkiraan kg CO₂e per bulan yang bisa dihemat. */
export function suggestions(d: FootprintData, res: any, ref: any) {
  const out: { id: string; en: string; kg: number; icon: LucideIcon }[] = []
  const hh = Math.max(1, d.household || 1)
  const grid = res?.grid?.value ?? 0.87
  const item = (k: string) => res?.items?.find((i: any) => i.key === k)?.kgMonth ?? 0
  const ap = d.electricity.appliances ?? {}
  if (d.electricity.method === "alat" && (ap.lampu_biasa?.count ?? 0) > 0) {
    const a = ap.lampu_biasa; out.push({ id: `Ganti ${a.count} lampu pijar/neon dengan LED`, en: `Replace ${a.count} incandescent/fluorescent bulbs with LED`, kg: ((30 * a.count * a.hours * 30) / 1000) * grid / hh, icon: Zap })
  }
  const acW = (["ac_05", "ac_1", "ac_15"] as const).reduce((s, k) => s + (ap[k]?.count ?? 0) * ({ ac_05: 400, ac_1: 800, ac_15: 1200 } as any)[k], 0)
  if (d.electricity.method === "alat" && acW > 0) out.push({ id: "Kurangi pemakaian AC 1 jam per hari & set 25 °C", en: "Use AC 1 hour less per day & set 25 °C", kg: ((acW * 30) / 1000) * grid / hh, icon: Zap })
  if (d.electricity.method !== "alat" && item("listrik") > 0) out.push({ id: "Hemat listrik 10% (cabut charger, matikan lampu tak terpakai)", en: "Save 10% electricity (unplug chargers, switch off unused lights)", kg: item("listrik") * 0.1, icon: Zap })
  for (const t of d.transport) {
    const kg = item(`tr-${t.mode}`)
    if (["motor", "mobil", "taksi", "ojek"].includes(t.mode) && kg > 0) out.push({ id: `Ganti 25% perjalanan ${ref?.transport?.find((x: any) => x.k === t.mode)?.label.toLowerCase() ?? t.mode} dengan angkutan umum/sepeda`, en: `Swap 25% of ${t.mode} trips for public transport or cycling`, kg: kg * 0.25, icon: Bike })
  }
  if (item("fd-sapi") > 0) out.push({ id: "Kurangi porsi daging sapi separuhnya", en: "Halve your beef portions", kg: item("fd-sapi") * 0.5, icon: Utensils })
  if (item("fd-kambing") > 0) out.push({ id: "Kurangi porsi daging kambing separuhnya", en: "Halve your lamb/goat portions", kg: item("fd-kambing") * 0.5, icon: Utensils })
  if (d.waste.kgWeek > 0 && d.waste.sortedPct < 50 && ref) {
    const kgM = d.waste.kgWeek * 4.345 * ((50 - d.waste.sortedPct) / 100)
    out.push({ id: "Kompos sisa makanan (≥ 50% sampah dipilah)", en: "Compost food scraps (≥ 50% sorted)", kg: (kgM * (ref.wasteTpa - ref.wasteCompost)) / hh, icon: Trash2 })
  }
  if (item("lpg") > 0) out.push({ id: "Tutup panci saat memasak — hemat ±10% LPG", en: "Cover pots while cooking — saves ~10% LPG", kg: item("lpg") * 0.1, icon: Flame })
  return out.filter((s) => s.kg > 0.05).sort((a, b) => b.kg - a.kg)
}

// ---------- ikon SVG per pilihan (lucide) ----------
import {
  AirVent, Bean, Beef, Bike as BicycleIcon, BusFront, Car, CarTaxiFront, CookingPot, Cylinder, Drumstick, Egg, Fish, Footprints, Globe, Ham, Heater, Laptop, Lightbulb,
  Milk, Motorbike, PlaneTakeoff, Plug, Refrigerator, Salad, Shirt, Shrimp, TrainFront, Tv, WashingMachine, Wheat, Droplets, Receipt, CircleCheckBig, Recycle,
} from "lucide-react"
export const MODE_ICON: Record<string, LucideIcon> = { motor: Motorbike, ojek: Motorbike, mobil: Car, taksi: CarTaxiFront, angkot: BusFront, bus: BusFront, kereta: TrainFront, sepeda: BicycleIcon }
export const FLIGHT_ICON: Record<string, LucideIcon> = { dom1: Plane, dom2: Plane, dom3: PlaneTakeoff, int: Globe }
export const FOOD_ICON: Record<string, LucideIcon> = { sapi: Beef, kambing: Ham, udang: Shrimp, keju: Milk, ikan: Fish, babi: Ham, ayam: Drumstick, telur: Egg, beras: Wheat, susu: Milk, tahu: Bean, sayur: Salad }
export const APPLIANCE_ICON: Record<string, LucideIcon> = { lampu_led: Lightbulb, lampu_biasa: Lightbulb, ac_05: AirVent, ac_1: AirVent, ac_15: AirVent, kulkas: Refrigerator, tv: Tv, rice_cooker: CookingPot, mesin_cuci: WashingMachine, pompa: Droplets, dispenser: Droplets, setrika: Shirt, komputer: Laptop, water_heater: Heater }
export const STEP_ICON: Record<string, LucideIcon> = { home: Home, transport: Motorbike, flight: Plane, food: Utensils, waste: Recycle, result: CircleCheckBig }
export const METHOD_ICON: Record<string, LucideIcon> = { kwh: Zap, tagihan: Receipt, alat: Plug }
export { Cylinder, Footprints }
