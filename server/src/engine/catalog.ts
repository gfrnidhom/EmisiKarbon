// Katalog lengkap faktor emisi (Database_Faktor_Emisi) — gabungan faktor mesin hitung FE-2026.1,
// tabel grid/transportasi/BBM dari "Perhitungan Emisi Karbon.xlsx", dan basis data referensi (ELEC/REF/GAS/TRN/PRC/AGR/WST/CAP).
// status: referensi = siap dipakai · perlu_verifikasi = angka ilustrasi · belum_diisi = nilai kosong (tidak dipakai mesin)
import { DEFAULT_FACTORS, type FactorSeed } from "./factors"

export type FactorStatus = "referensi" | "perlu_verifikasi" | "belum_diisi"
export interface CatalogFactor extends Omit<FactorSeed, "value"> {
  value: number | null
  extId: string
  nameEn: string
  activityUnit: string
  gwpBasis: string
  status: FactorStatus
}

// Metadata tampilan untuk faktor yang dipakai mesin hitung
const ENGINE_META: Record<string, [string, string, string, string?]> = {
  // code: [extId, nameEn, activityUnit, gwpBasis]
  GWP_CH4: ["GAS-001", "Methane (CH₄) direct emission — GWP", "kg CH₄", "GWP AR5 (non-fossil)"],
  GWP_N2O: ["GAS-002", "Nitrous oxide (N₂O) — GWP", "kg N₂O", "GWP AR5"],
  EL_JAMALI: ["ELEC-001", "Grid electricity Java-Madura-Bali (incl. East Java)", "kWh", "-"],
  EL_NAS: ["ELEC-002", "Grid electricity national average (fallback)", "kWh", "-"],
  LPG_BI: ["FUEL-001", "LPG (stationary combustion)", "kg", "-"],
  SOLAR_BI: ["FUEL-002", "Diesel / solar (generic)", "liter", "-"],
  B40_FOSIL: ["FUEL-003", "Fossil share of B40 biodiesel", "fraction", "-"],
  BENSIN_BI: ["FUEL-004", "Gasoline RON 92", "liter", "-"],
  TR_MOTOR: ["TRN-010", "Motorcycle RON 92", "km", "-"],
  TR_SEDAN: ["TRN-011", "Car / sedan RON 92", "km", "-"],
  TR_ANGKOT: ["TRN-012", "Angkot minibus (per vehicle-km)", "km", "-"],
  TR_BUS_SDG: ["TRN-013", "Medium bus / microbus diesel", "km", "-"],
  TR_AKTIF: ["TRN-014", "Walking / cycling", "km", "-"],
  REF_R22: ["REF-001", "R-22 (HCFC-22)", "kg refrigerant", "GWP AR5"],
  REF_R32: ["REF-002", "R-32 (HFC-32)", "kg refrigerant", "GWP AR5"],
  REF_R134A: ["REF-003", "R-134a (HFC-134a)", "kg refrigerant", "GWP AR5"],
  REF_R410A: ["REF-004", "R-410A (HFC blend)", "kg refrigerant", "GWP AR5"],
  REF_LEAK: ["REF-007", "Annual leak rate, split AC (default)", "fraction/year", "-"],
  WS_MAKANAN_TPA: ["WST-010", "Food waste to landfill (MCF 0.6)", "kg", "GWP AR5"],
  WS_KEBUN_TPA: ["WST-011", "Garden/leaf waste to landfill (MCF 0.6)", "kg", "GWP AR5"],
  WS_KERTAS_TPA: ["WST-012", "Paper to landfill (MCF 0.6)", "kg", "GWP AR5"],
  WS_KOMPOS: ["WST-013", "Composting (CH₄ + N₂O)", "kg", "GWP AR5"],
  WS_PLASTIK_BAKAR: ["WST-014", "Open burning of plastic", "kg", "-"],
  WS_DAUR_ULANG: ["WST-015", "To waste bank / recycling", "kg", "-"],
  WS_RESIDU_TPA: ["WST-016", "Plastic & inert residue to landfill", "kg", "-"],
  WW_ORG_HARI: ["WW-001", "Septic wastewater per person-day at school", "person-day", "GWP AR5"],
  PAPER_RIM: ["PRC-010", "A4 80 gsm paper per ream (2.5 kg)", "ream", "-"],
  C_FRAKSI: ["TREE-001", "Biomass carbon fraction", "kg biomass", "-"],
}

const ref = (extId: string, code: string, category: string, scope: string, name: string, nameEn: string, activityUnit: string, value: number | null, unit: string, gas: string, gwpBasis: string, source: string, status: FactorStatus, url?: string): CatalogFactor =>
  ({ extId, code, category, scope, name, nameEn, activityUnit, value, unit, gas, gwpBasis, source, status, url })

const EXTRA: CatalogFactor[] = [
  // --- Listrik per sistem grid (DJK ESDM 2019 via Kalkulator Hijau BI) ---
  ref("ELEC-003", "EL_SUMATERA", "Listrik", "2", "Listrik grid Sumatera (location-based)", "Grid electricity Sumatra (location-based)", "kWh", 0.94, "kg CO2e/kWh", "CO2e", "-", "DJK ESDM 2019 via Kalkulator Hijau BI v2", "referensi"),
  ref("ELEC-004", "EL_KHATULISTIWA", "Listrik", "2", "Listrik grid Khatulistiwa (Kalimantan Barat)", "Grid electricity Khatulistiwa (West Kalimantan)", "kWh", 1.63, "kg CO2e/kWh", "CO2e", "-", "DJK ESDM 2019 via Kalkulator Hijau BI v2", "referensi"),
  ref("ELEC-005", "EL_MAHAKAM", "Listrik", "2", "Listrik grid Mahakam (Kalimantan Timur)", "Grid electricity Mahakam (East Kalimantan)", "kWh", 1.14, "kg CO2e/kWh", "CO2e", "-", "DJK ESDM 2019 via Kalkulator Hijau BI v2", "referensi"),
  ref("ELEC-006", "EL_SULAWESI", "Listrik", "2", "Listrik dari jaringan sistem Sulawesi (location-based)", "Grid electricity Sulawesi system (location-based)", "kWh", null, "kg CO2e/kWh", "CO2e", "-", "Isi dari faktor emisi GRK sistem ketenagalistrikan terbaru (Ditjen Ketenagalistrikan KESDM)", "belum_diisi"),
  ref("ELEC-007", "EL_BARITO", "Listrik", "2", "Listrik grid Barito (Kalimantan Tengah)", "Grid electricity Barito (Central Kalimantan)", "kWh", 1.31, "kg CO2e/kWh", "CO2e", "-", "DJK ESDM 2019 via Kalkulator Hijau BI v2", "referensi"),
  ref("ELEC-008", "EL_3NUSA", "Listrik", "2", "Listrik grid 3 Nusa (Bali)", "Grid electricity 3 Nusa (Bali)", "kWh", 0.52, "kg CO2e/kWh", "CO2e", "-", "DJK ESDM 2019 via Kalkulator Hijau BI v2", "referensi"),
  ref("ELEC-009", "EL_SULUTGO", "Listrik", "2", "Listrik grid Sulutgo (Gorontalo)", "Grid electricity Sulutgo (Gorontalo)", "kWh", 0.78, "kg CO2e/kWh", "CO2e", "-", "DJK ESDM 2019 via Kalkulator Hijau BI v2", "referensi"),
  ref("ELEC-010", "EL_JAYAPURA", "Listrik", "2", "Listrik grid Jayapura (Papua)", "Grid electricity Jayapura (Papua)", "kWh", 0.51, "kg CO2e/kWh", "CO2e", "-", "DJK ESDM 2019 via Kalkulator Hijau BI v2", "referensi"),
  ref("ELEC-011", "EL_TARAKAN", "Listrik", "2", "Listrik grid Tarakan (Kalimantan Utara)", "Grid electricity Tarakan (North Kalimantan)", "kWh", 0.48, "kg CO2e/kWh", "CO2e", "-", "DJK ESDM 2019 via Kalkulator Hijau BI v2", "referensi"),
  ref("ELEC-012", "EL_BANGKA", "Listrik", "2", "Listrik grid Bangka", "Grid electricity Bangka", "kWh", 0.89, "kg CO2e/kWh", "CO2e", "-", "DJK ESDM 2019 via Kalkulator Hijau BI v2", "referensi"),
  ref("ELEC-013", "EL_BELITUNG", "Listrik", "2", "Listrik grid Belitung", "Grid electricity Belitung", "kWh", 1.41, "kg CO2e/kWh", "CO2e", "-", "DJK ESDM 2019 via Kalkulator Hijau BI v2", "referensi"),
  // --- Bahan bakar turunan IPCC (sheet BBM_Turunan) ---
  ref("FUEL-010", "FUEL_BENSIN_IPCC", "Bahan bakar", "1", "Bensin (motor gasoline) — turunan IPCC", "Motor gasoline — IPCC derived", "liter", +(69300 * 44.3e-6 * 0.74).toFixed(4), "kg CO2/liter", "CO2", "-", "IPCC 2006 Vol.2 Tabel 1.2 & 1.4 (densitas asumsi 0,74)", "referensi"),
  ref("FUEL-011", "FUEL_SOLAR_IPCC", "Bahan bakar", "1", "Solar (gas/diesel oil) — turunan IPCC", "Gas/diesel oil — IPCC derived", "liter", +(74100 * 43e-6 * 0.84).toFixed(4), "kg CO2/liter", "CO2", "-", "IPCC 2006 Vol.2 Tabel 1.2 & 1.4 (densitas asumsi 0,84)", "referensi"),
  ref("FUEL-012", "FUEL_MITAN_IPCC", "Bahan bakar", "1", "Minyak tanah — turunan IPCC", "Kerosene — IPCC derived", "liter", +(71900 * 43.8e-6 * 0.8).toFixed(4), "kg CO2/liter", "CO2", "-", "IPCC 2006 Vol.2 Tabel 1.2 & 1.4 (densitas asumsi 0,80)", "referensi"),
  ref("FUEL-013", "FUEL_LPG_IPCC", "Bahan bakar", "1", "LPG — turunan IPCC (pembanding)", "LPG — IPCC derived (comparison)", "kg", +(63100 * 47.3e-6).toFixed(4), "kg CO2/kg", "CO2", "-", "IPCC 2006 Vol.2 Tabel 1.2 & 1.4", "referensi"),
  // --- Refrigeran & gas khusus ---
  ref("REF-005", "REF_R404A", "Refrigeran", "1", "R-404A (campuran HFC)", "R-404A (HFC blend)", "kg refrigeran", 3943, "kg CO2e/kg", "HFC", "GWP AR5", "IPCC AR5 WG1 (Tabel 8.A.1); AR4 = 3.922", "referensi"),
  ref("REF-008", "REF_R407C", "Refrigeran", "1", "R-407C (AC sentral)", "R-407C (central AC)", "kg refrigeran", 1624, "kg CO2e/kg", "HFC", "GWP AR5", "IPCC AR5 (campuran 23/25/52); Kigali/KLHK AR4 = 1.774", "referensi"),
  ref("REF-006", "GAS_SF6", "Gas khusus", "1", "SF6 (peralatan listrik tegangan tinggi)", "SF₆ (high-voltage electrical equipment)", "kg SF6", 23500, "kg CO2e/kg", "SF6", "GWP AR5", "IPCC AR5 WG1 (Tabel 8.A.1)", "referensi"),
  // --- Transportasi ---
  ref("TRN-001", "TRN_PESAWAT_PENDEK", "Transportasi", "3", "Penerbangan domestik jarak pendek (kelas ekonomi)", "Domestic flight, short haul (economy)", "penumpang-km", 0.15, "kg CO2e/pkm", "CO2e", "-", "ILUSTRASI berbasis pola DEFRA (cek edisi terbaru gov.uk)", "perlu_verifikasi"),
  ref("TRN-002", "TRN_MOBIL_BENSIN", "Transportasi", "3", "Mobil bensin rata-rata", "Average petrol car", "km", 0.17, "kg CO2e/km", "CO2e", "-", "ILUSTRASI berbasis pola DEFRA (cek edisi terbaru)", "perlu_verifikasi"),
  ref("TRN-003", "TRN_MOTOR_ILUS", "Transportasi", "3", "Sepeda motor", "Motorcycle", "km", 0.06, "kg CO2e/km", "CO2e", "-", "ILUSTRASI", "perlu_verifikasi"),
  ref("TRN-004", "TRN_TRUK_TONKM", "Transportasi", "3", "Truk diesel (distribusi, rata-rata)", "Diesel truck (distribution, average)", "ton-km", 0.1, "kg CO2e/ton-km", "CO2e", "-", "ILUSTRASI", "perlu_verifikasi"),
  ref("TRN-005", "TRN_KERETA_ILUS", "Transportasi", "3", "Kereta api", "Train", "penumpang-km", 0.03, "kg CO2e/pkm", "CO2e", "-", "ILUSTRASI", "perlu_verifikasi"),
  ref("TRN-006", "TR_KAI_EKO", "Transportasi", "3", "Kereta api kelas ekonomi", "Train, economy class", "penumpang-km", 0.01219, "kg CO2e/pkm", "CO2e", "-", "KAI (2025) via Kalkulator Hijau BI v2", "referensi"),
  ref("TRN-007", "TR_KAI_BIS", "Transportasi", "3", "Kereta api kelas bisnis", "Train, business class", "penumpang-km", 0.01308, "kg CO2e/pkm", "CO2e", "-", "KAI (2025) via Kalkulator Hijau BI v2", "referensi"),
  ref("TRN-008", "TR_KAI_EKS", "Transportasi", "3", "Kereta api kelas eksekutif", "Train, executive class", "penumpang-km", 0.0175, "kg CO2e/pkm", "CO2e", "-", "KAI (2025) via Kalkulator Hijau BI v2", "referensi"),
  ref("TRN-015", "TR_VAN", "Transportasi", "3", "Van/minibus RON 92", "Van / minibus RON 92", "km", 0.288, "kg CO2e/km", "CO2e", "-", "Kalkulator Hijau BI v2", "referensi"),
  ref("TRN-016", "TR_TAKSI", "Transportasi", "3", "Taksi RON 92", "Taxi RON 92", "km", 0.265, "kg CO2e/km", "CO2e", "-", "Kalkulator Hijau BI v2", "referensi"),
  ref("TRN-017", "TR_BUS_BESAR", "Transportasi", "3", "Bus besar solar CN51", "Large bus diesel CN51", "km", 0.757, "kg CO2e/km", "CO2e", "-", "Kalkulator Hijau BI v2", "referensi"),
  ref("TRN-018", "TR_PICKUP", "Transportasi", "3", "Pickup RON 92", "Pickup RON 92", "km", 0.271, "kg CO2e/km", "CO2e", "-", "Kalkulator Hijau BI v2", "referensi"),
  ref("TRN-019", "TR_TRUK2", "Transportasi", "3", "Truk 2 sumbu solar CN51", "2-axle truck diesel CN51", "km", 0.602, "kg CO2e/km", "CO2e", "-", "Kalkulator Hijau BI v2", "referensi"),
  ref("TRN-020", "TR_TRUK3", "Transportasi", "3", "Truk 3 sumbu solar CN51", "3-axle truck diesel CN51", "km", 0.663, "kg CO2e/km", "CO2e", "-", "Kalkulator Hijau BI v2", "referensi"),
  ref("TRN-021", "TR_PSW_DOM1", "Transportasi", "3", "Pesawat domestik ekonomi < 926 km", "Domestic flight economy < 926 km", "penumpang-km", 0.12, "kg CO2e/pkm", "CO2e", "-", "BI (2026) & DEFRA (2025)", "referensi"),
  ref("TRN-022", "TR_PSW_DOM2", "Transportasi", "3", "Pesawat domestik ekonomi 926–1.852 km", "Domestic flight economy 926–1,852 km", "penumpang-km", 0.089, "kg CO2e/pkm", "CO2e", "-", "BI (2026) & DEFRA (2025)", "referensi"),
  ref("TRN-023", "TR_PSW_DOM3", "Transportasi", "3", "Pesawat domestik ekonomi > 1.852 km", "Domestic flight economy > 1,852 km", "penumpang-km", 0.078, "kg CO2e/pkm", "CO2e", "-", "BI (2026) & DEFRA (2025)", "referensi"),
  ref("TRN-024", "TR_PSW_INT", "Transportasi", "3", "Pesawat internasional ekonomi", "International flight economy", "penumpang-km", 0.06449, "kg CO2e/pkm", "CO2e", "-", "BI (2026) & DEFRA (2025)", "referensi"),
  // --- Pembelian barang ---
  ref("PRC-001", "PRC_KERTAS_HVS", "Pembelian barang", "3", "Kertas HVS A4 (cradle to gate, kategori 1)", "A4 HVS paper (cradle to gate, category 1)", "ton", 1200, "kg CO2e/ton", "CO2e", "-", "ILUSTRASI (gunakan EPD pemasok atau database LCA)", "perlu_verifikasi"),
  ref("PRC-002", "PRC_ATK_EEIO", "Pembelian barang", "3", "Belanja umum ATK (spend-based, EEIO)", "General stationery spend (spend-based, EEIO)", "Rp 1.000", 0.025, "kg CO2e/Rp 1.000", "CO2e", "-", "Perkiraan orde besaran dari EEIO (sekitar 0,3–0,5 kg CO2e per US$, dikonversi ke rupiah)", "perlu_verifikasi"),
  ref("PRC-003", "PRC_PLASTIK_PET", "Pembelian barang", "3", "Plastik PET (bahan baku, kategori 1)", "PET plastic (raw material, category 1)", "ton", 2000, "kg CO2e/ton", "CO2e", "-", "ILUSTRASI (gunakan data pemasok atau LCA)", "perlu_verifikasi"),
  ref("PRC-004", "PRC_BETON", "Pembelian barang", "3", "Beton (campuran)", "Concrete (mix)", "m3", null, "kg CO2e/m3", "CO2e", "-", "Isi dari Environmental Product Declaration (EPD) pemasok", "belum_diisi"),
  ref("PRC-005", "PRC_BAJA", "Pembelian barang", "3", "Baja tulangan", "Reinforcing steel", "ton", null, "kg CO2e/ton", "CO2e", "-", "Isi dari EPD pemasok atau World Steel Association", "belum_diisi"),
  // --- Pertanian ---
  ref("AGR-001", "AGR_N2O_PUPUK", "Pertanian", "1", "N2O langsung dari pupuk nitrogen (metode Tier 1)", "Direct N₂O from nitrogen fertiliser (Tier 1)", "kg N diaplikasikan", 0.01, "kg N2O-N/kg N", "N2O", "-", "IPCC 2006 Vol.4 Ch.11 (EF1 = 0,01)", "referensi"),
  ref("AGR-002", "AGR_N_UREA", "Pertanian", "-", "Kandungan nitrogen urea", "Nitrogen content of urea", "kg urea", 0.46, "kg N/kg urea", "-", "-", "Standar stoikiometri pupuk", "referensi"),
  // --- Limbah ---
  ref("WST-001", "WST_ORGANIK_FOD", "Limbah", "3", "Limbah organik ke TPA (metode FOD)", "Organic waste to landfill (FOD method)", "ton limbah", null, "kg CO2e/ton", "CH4", "GWP AR5/AR6 sesuai kebijakan", "IPCC 2006 Vol.5 Ch.3 (First Order Decay)", "belum_diisi"),
  ref("WST-002", "WST_INSINERASI_MEDIS", "Limbah", "3", "Insinerasi limbah medis", "Medical waste incineration", "ton limbah", null, "kg CO2e/ton", "CO2 dan N2O", "-", "IPCC 2006 Vol.5 Ch.5 (insinerasi)", "belum_diisi"),
  ref("WST-003", "WST_KARTON_TPA", "Limbah", "3", "Kemasan kertas karton ke TPA (ilustrasi, FOD disederhanakan)", "Cardboard packaging to landfill (illustrative, simplified FOD)", "ton kemasan ke TPA", 500, "kg CO2e/ton", "CH4", "GWP AR5", "IPCC 2006 Vol.5 Ch.3 (First Order Decay, disederhanakan)", "perlu_verifikasi"),
  // --- Barang modal ---
  ref("CAP-001", "CAP_MESIN_EEIO", "Barang modal", "3", "Mesin dan peralatan produksi (spend-based, EEIO)", "Machinery & production equipment (spend-based, EEIO)", "Rp 1.000", 0.03, "kg CO2e/Rp 1.000", "CO2e", "-", "Perkiraan orde besaran dari EEIO sektor mesin dan peralatan", "perlu_verifikasi"),
  // --- Pohon ---
  ref("TREE-002", "TREE_AKAR_TAJUK", "Pohon", "serapan", "Rasio akar-tajuk default", "Default root-to-shoot ratio", "kg AGB", 0.24, "fraksi", "-", "-", "IPCC 2006 Vol.4 (studi mahoni 0,31)", "referensi"),
]

export const FULL_CATALOG: CatalogFactor[] = [
  ...DEFAULT_FACTORS.map((f) => {
    const [extId, nameEn, activityUnit, gwpBasis] = ENGINE_META[f.code] ?? [f.code, f.name, "-", "-"]
    return { ...f, extId, nameEn, activityUnit, gwpBasis: gwpBasis ?? "-", status: "referensi" as FactorStatus }
  }),
  ...EXTRA,
]
