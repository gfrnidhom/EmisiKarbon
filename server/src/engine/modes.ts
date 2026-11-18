/**
 * Moda perjalanan warga sekolah (survei mobilitas). Semua dihitung dari JARAK HARIAN
 * (total km pulang-pergi per hari) × faktor emisi dari tabel emission_factors.
 *
 *  per = "kendaraan": faktor per km kendaraan → dibagi jumlah penumpang (pribadi: isian responden;
 *                     angkutan umum: minimal muatan rata-rata `load`).
 *  per = "penumpang": faktor sudah per penumpang-km (kereta, pesawat) → tidak dibagi.
 * Pesawat memilih faktor sesuai jarak (pita DEFRA/BI: < 926 km, 926–1.852 km, > 1.852 km).
 */
export interface ModeDef { factor: string; per: "kendaraan" | "penumpang"; load?: number; label: string }

export const MODES: Record<string, ModeDef> = {
  jalan: { factor: "TR_AKTIF", per: "penumpang", label: "Jalan kaki" },
  sepeda: { factor: "TR_AKTIF", per: "penumpang", label: "Sepeda" },
  motor: { factor: "TR_MOTOR", per: "kendaraan", label: "Sepeda motor" },
  ojek: { factor: "TR_MOTOR", per: "kendaraan", label: "Ojek / ojek online" },
  mobil: { factor: "TR_SEDAN", per: "kendaraan", label: "Mobil pribadi" },
  taksi: { factor: "TR_TAKSI", per: "kendaraan", label: "Taksi / taksi online" },
  antar_jemput: { factor: "TR_VAN", per: "kendaraan", load: 8, label: "Mobil antar-jemput" },
  angkot: { factor: "TR_ANGKOT", per: "kendaraan", load: 8, label: "Angkot" },
  bus: { factor: "TR_BUS_SDG", per: "kendaraan", load: 20, label: "Bus sekolah / bus kota" },
  bus_besar: { factor: "TR_BUS_BESAR", per: "kendaraan", load: 40, label: "Bus besar" },
  kereta: { factor: "TR_KAI_EKO", per: "penumpang", label: "Kereta / KRL" },
  pesawat: { factor: "TR_PSW_DOM1", per: "penumpang", label: "Pesawat" },
}
export const MODE_KEYS = Object.keys(MODES)

/** Kode faktor yang dipakai untuk satu respons (pesawat: sesuai pita jarak). */
export function modeFactorCode(mode: string, dailyKm: number) {
  if (mode === "pesawat") {
    // jarak harian pulang-pergi → panjang satu penerbangan ≈ setengahnya
    const leg = dailyKm / 2
    return leg > 1852 ? "TR_PSW_DOM3" : leg >= 926 ? "TR_PSW_DOM2" : "TR_PSW_DOM1"
  }
  return MODES[mode]?.factor ?? "TR_MOTOR"
}
/** Jumlah penumpang pembagi: penumpang-km = 1; angkutan umum minimal muatan rata-rata. */
export function modeOccupants(mode: string, occupants: number | null | undefined) {
  const m = MODES[mode]
  if (!m || m.per === "penumpang") return 1
  return Math.max(occupants ?? 1, m.load ?? 1, 1)
}
/** Kode semua faktor transportasi yang mungkin dipakai (untuk jejak hitung). */
export const ALL_MODE_FACTORS = [...new Set([...Object.values(MODES).map((m) => m.factor), "TR_PSW_DOM2", "TR_PSW_DOM3"])]
