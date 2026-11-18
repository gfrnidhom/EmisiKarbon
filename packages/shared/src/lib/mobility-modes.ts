import { Bike, Bus, BusFront, Car, CarTaxiFront, Footprints, Motorbike, Plane, TrainFront, Van, type LucideIcon } from "lucide-react"
import { tl } from "@/lib/i18n"

/** Moda survei mobilitas — kunci sama dengan server/src/engine/modes.ts.
 *  private = kendaraan pribadi: responden mengisi jumlah penumpang. */
export const MOBILITY_MODES: { v: string; id: string; en: string; icon: LucideIcon; color: string; private?: boolean }[] = [
  { v: "jalan", id: "Jalan kaki", en: "Walking", icon: Footprints, color: "var(--leaf)" },
  { v: "sepeda", id: "Sepeda", en: "Bicycle", icon: Bike, color: "oklch(0.7 0.12 140)" },
  { v: "motor", id: "Sepeda motor", en: "Motorcycle", icon: Motorbike, color: "var(--scope3)", private: true },
  { v: "ojek", id: "Ojek / ojol", en: "Motorbike taxi", icon: Motorbike, color: "oklch(0.72 0.14 60)" },
  { v: "mobil", id: "Mobil pribadi", en: "Private car", icon: Car, color: "var(--scope1)", private: true },
  { v: "taksi", id: "Taksi / taksi online", en: "Taxi / ride-hailing", icon: CarTaxiFront, color: "oklch(0.75 0.15 90)", private: true },
  { v: "antar_jemput", id: "Mobil antar-jemput", en: "School shuttle van", icon: Van, color: "oklch(0.62 0.1 200)" },
  { v: "angkot", id: "Angkot", en: "Minibus (angkot)", icon: Bus, color: "var(--scope2)" },
  { v: "bus", id: "Bus sekolah / kota", en: "School / city bus", icon: BusFront, color: "oklch(0.6 0.1 300)" },
  { v: "bus_besar", id: "Bus besar", en: "Large coach", icon: BusFront, color: "oklch(0.5 0.1 300)" },
  { v: "kereta", id: "Kereta / KRL", en: "Train / commuter rail", icon: TrainFront, color: "oklch(0.55 0.12 250)" },
  { v: "pesawat", id: "Pesawat", en: "Plane", icon: Plane, color: "oklch(0.55 0.18 25)" },
]
export const modeLabel = (v: string) => { const m = MOBILITY_MODES.find((x) => x.v === v); return m ? tl(m.id, m.en) : v }
export const modeColor = (v: string) => MOBILITY_MODES.find((x) => x.v === v)?.color ?? "gray"
