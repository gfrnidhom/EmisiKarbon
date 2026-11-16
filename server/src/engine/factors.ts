// Pustaka faktor emisi default — versi FE-2026.1
// Sumber: PRD JejakHijau v2.0 §7.2 dan file "Perhitungan Emisi Karbon.xlsx" (sheet Faktor_Emisi).

export const GWP = { CH4: 28, N2O: 265 } as const // IPCC AR5
export const C_TO_CO2 = 44 / 12
export const FE_VERSION = "FE-2026.1"

// --- Parameter IPCC 2006 Vol.5 untuk sampah (sheet Sampah_Air_Limbah) ---
export const WASTE_PARAMS = { DOCf: 0.5, F: 0.5, MCF: 0.6, OX: 0 }
export const DOC = { makanan: 0.15, kebun: 0.2, kertas: 0.4, kayu: 0.43, tekstil: 0.24, plastik: 0 }

/** FE TPA per kg = DOC × DOCf × MCF × F × 16/12 × (1 − OX) × GWP_CH4 */
export function landfillFactor(doc: number, p = WASTE_PARAMS, gwpCh4: number = GWP.CH4) {
  return doc * p.DOCf * p.MCF * p.F * (16 / 12) * (1 - p.OX) * gwpCh4
}
/** Pengomposan: (CH4 4 g/kg × 28 + N2O 0,24 g/kg × 265) / 1000 */
export const compostFactor = (4 * GWP.CH4 + 0.24 * GWP.N2O) / 1000
/** Pembakaran terbuka plastik (IPCC 2006 Vol.5 Bab 5):
 *  CO2 fosil = bahan kering 1 × fraksi C 0,75 × fraksi fosil 1 × oksidasi 0,58 × 44/12
 *  + CH4 6.500 g/t × GWP 28 + N2O 150 g/t × GWP 265 (Tabel 5.3 & 5.6, pembakaran terbuka) */
export const plasticBurnFactor = 0.75 * 1 * 0.58 * C_TO_CO2 + (6500 / 1e6) * GWP.CH4 + (150 / 1e6) * GWP.N2O
/** Air limbah septik per orang-hari di sekolah: BOD 40 g × Bo 0,6 × MCF 0,5 × fraksi 0,33 × GWP */
export const wastewaterPerPersonDay = (40 / 1000) * 0.6 * 0.5 * 0.33 * GWP.CH4

export interface FactorSeed {
  code: string
  category: string
  name: string
  value: number
  unit: string
  gas: string
  scope: string
  source: string
  url?: string
  nonNational?: boolean
  note?: string
}

export const DEFAULT_FACTORS: FactorSeed[] = [
  { code: "GWP_CH4", category: "GWP", name: "GWP metana (100 th)", value: 28, unit: "kg CO2e/kg CH4", gas: "CH4", scope: "-", source: "IPCC AR5; dipakai KLHK" },
  { code: "GWP_N2O", category: "GWP", name: "GWP N2O (100 th)", value: 265, unit: "kg CO2e/kg N2O", gas: "N2O", scope: "-", source: "IPCC AR5" },
  { code: "EL_JAMALI", category: "Listrik", name: "Grid Jawa-Madura-Bali (termasuk Jawa Timur)", value: 0.87, unit: "kg CO2e/kWh", gas: "CO2e", scope: "2", source: "DJK ESDM 2019 via Kalkulator Hijau BI v2", url: "https://gatrik.esdm.go.id/frontend/download_index/?kode_category=emisi_pl" },
  { code: "EL_NAS", category: "Listrik", name: "Listrik rata-rata nasional (fallback)", value: 0.79, unit: "kg CO2e/kWh", gas: "CO2e", scope: "2", source: "DJK ESDM 2019 via Kalkulator Hijau BI v2" },
  { code: "LPG_BI", category: "Bahan bakar", name: "LPG (pembakaran stasioner)", value: 3.015, unit: "kg CO2e/kg", gas: "CO2e", scope: "1", source: "Kalkulator Hijau BI v2 (pembanding IPCC 2,98)" },
  { code: "SOLAR_BI", category: "Bahan bakar", name: "Minyak solar (generik)", value: 2.779, unit: "kg CO2e/liter", gas: "CO2e", scope: "1", source: "Kalkulator Hijau BI v2" },
  { code: "B40_FOSIL", category: "Bahan bakar", name: "Porsi fosil biosolar B40", value: 0.6, unit: "fraksi", gas: "-", scope: "1", source: "Kepmen ESDM 341.K/EK.01/MEM.E/2024" },
  { code: "BENSIN_BI", category: "Bahan bakar", name: "Bensin RON 92", value: 2.305, unit: "kg CO2e/liter", gas: "CO2e", scope: "1", source: "Kalkulator Hijau BI v2" },
  { code: "TR_MOTOR", category: "Transportasi", name: "Sepeda motor RON 92", value: 0.082, unit: "kg CO2e/km", gas: "CO2e", scope: "3", source: "Kalkulator Hijau BI v2" },
  { code: "TR_SEDAN", category: "Transportasi", name: "Mobil sedan/pribadi RON 92", value: 0.235, unit: "kg CO2e/km", gas: "CO2e", scope: "3", source: "Kalkulator Hijau BI v2" },
  { code: "TR_ANGKOT", category: "Transportasi", name: "Angkot RON 92 (per km kendaraan)", value: 0.307, unit: "kg CO2e/km", gas: "CO2e", scope: "3", source: "Kalkulator Hijau BI v2", note: "Dibagi penumpang rata-rata (asumsi 8)" },
  { code: "TR_BUS_SDG", category: "Transportasi", name: "Bus sedang/microbus solar", value: 0.663, unit: "kg CO2e/km", gas: "CO2e", scope: "3", source: "Kalkulator Hijau BI v2" },
  { code: "TR_AKTIF", category: "Transportasi", name: "Jalan kaki / sepeda", value: 0, unit: "kg CO2e/km", gas: "CO2e", scope: "3", source: "-" },
  { code: "REF_R32", category: "Refrigeran", name: "HFC-32 (R-32)", value: 677, unit: "GWP", gas: "HFC", scope: "1", source: "IPCC AR5 (konsisten dengan GWP CH4/N2O); Kigali/KLHK memakai AR4 = 675" },
  { code: "REF_R410A", category: "Refrigeran", name: "R-410A", value: 1923.5, unit: "GWP", gas: "HFC", scope: "1", source: "IPCC AR5 (50% HFC-32 + 50% HFC-125); Kigali/KLHK AR4 = 2.087,5" },
  { code: "REF_R134A", category: "Refrigeran", name: "HFC-134a", value: 1300, unit: "GWP", gas: "HFC", scope: "1", source: "IPCC AR5; Kigali/KLHK AR4 = 1.430" },
  { code: "REF_R22", category: "Refrigeran", name: "R-22 (HCFC)", value: 1760, unit: "GWP", gas: "HCFC", scope: "1", source: "IPCC AR5; dilaporkan terpisah (Protokol Montreal), tidak masuk total", note: "Memo item — di luar keranjang gas Kyoto/Paris" },
  { code: "REF_LEAK", category: "Refrigeran", name: "Laju bocor tahunan AC split (default)", value: 0.03, unit: "fraksi/tahun", gas: "-", scope: "1", source: "IPCC 2019 Refinement Vol.3 Tabel 7.9" },
  { code: "WS_MAKANAN_TPA", category: "Sampah", name: "Sisa makanan ke TPA (MCF 0,6)", value: landfillFactor(DOC.makanan), unit: "kg CO2e/kg", gas: "CH4", scope: "3", source: "IPCC 2006 Vol. 5" },
  { code: "WS_KEBUN_TPA", category: "Sampah", name: "Daun/kebun ke TPA (MCF 0,6)", value: landfillFactor(DOC.kebun), unit: "kg CO2e/kg", gas: "CH4", scope: "3", source: "IPCC 2006 Vol. 5" },
  { code: "WS_KERTAS_TPA", category: "Sampah", name: "Kertas ke TPA (MCF 0,6)", value: landfillFactor(DOC.kertas), unit: "kg CO2e/kg", gas: "CH4", scope: "3", source: "IPCC 2006 Vol. 5" },
  { code: "WS_KOMPOS", category: "Sampah", name: "Pengomposan (CH4 + N2O)", value: compostFactor, unit: "kg CO2e/kg", gas: "CH4+N2O", scope: "3", source: "IPCC 2006 Vol. 5 Bab 4" },
  { code: "WS_PLASTIK_BAKAR", category: "Sampah", name: "Plastik dibakar terbuka", value: plasticBurnFactor, unit: "kg CO2e/kg", gas: "CO2+CH4+N2O", scope: "3", source: "IPCC 2006 Vol. 5 Bab 5 (Tabel 5.3 & 5.6)" },
  { code: "WS_DAUR_ULANG", category: "Sampah", name: "Ke bank sampah / daur ulang", value: 0, unit: "kg CO2e/kg", gas: "-", scope: "3", source: "-", note: "Dicatat sebagai emisi terhindar" },
  { code: "WS_RESIDU_TPA", category: "Sampah", name: "Plastik & residu inert ke TPA", value: 0, unit: "kg CO2e/kg", gas: "-", scope: "3", source: "IPCC 2006 (DOC = 0)" },
  { code: "WW_ORG_HARI", category: "Air limbah", name: "Air limbah septik per orang-hari di sekolah", value: wastewaterPerPersonDay, unit: "kg CO2e/orang-hari", gas: "CH4", scope: "3", source: "IPCC 2006 Vol. 5 Bab 6" },
  { code: "PAPER_RIM", category: "Kertas", name: "Kertas A4 80 gsm per rim (2,5 kg)", value: 2.3, unit: "kg CO2e/rim", gas: "CO2e", scope: "3", source: "DEFRA 2025 (paper, primary)", nonNational: true },
  { code: "C_FRAKSI", category: "Pohon", name: "Fraksi karbon biomassa", value: 0.47, unit: "kg C/kg biomassa", gas: "-", scope: "serapan", source: "SNI 7724:2011" },
]

export interface SpeciesSeed {
  local: string
  scientific: string
  equation: "mahoni" | "chave" | "power" | "chave2005"
  a?: number
  b?: number
  density: number
  growth: number
  dbhMin: number
  dbhMax: number
  carbonFraction: number
  rootRatio: number
  carbonTree: boolean
  source: string
}

export const DEFAULT_SPECIES: SpeciesSeed[] = [
  { local: "Mahoni", scientific: "Swietenia macrophylla", equation: "mahoni", a: 0.044, b: 2.541, density: 0.49, growth: 0.9, dbhMin: 5, dbhMax: 60, carbonFraction: 0.47, rootRatio: 0, carbonTree: true, source: "Persamaan mahoni Perhutani (Jurnal AGH)" },
  { local: "Jati", scientific: "Tectona grandis", equation: "power", a: 0.054, b: 2.579, density: 0.6, growth: 1.2, dbhMin: 5, dbhMax: 50, carbonFraction: 0.47, rootRatio: 0.24, carbonTree: true, source: "Siregar (2011): AGB = 0,054 × D^2,579 (persamaan lokal jati)" },
  { local: "Trembesi", scientific: "Samanea saman", equation: "chave", density: 0.52, growth: 1.0, dbhMin: 5, dbhMax: 150, carbonFraction: 0.47, rootRatio: 0.24, carbonTree: true, source: "Chave et al. 2014" },
  { local: "Sengon", scientific: "Falcataria moluccana", equation: "power", a: 0.0272, b: 2.831, density: 0.33, growth: 2.0, dbhMin: 5, dbhMax: 50, carbonFraction: 0.44, rootRatio: 0.24, carbonTree: true, source: "Sugiharto (2002): AGB = 0,0272 × D^2,831 (persamaan lokal sengon)" },
  { local: "Karet", scientific: "Hevea brasiliensis", equation: "power", a: 3.42, b: 1.15, density: 0.55, growth: 0.8, dbhMin: 5, dbhMax: 60, carbonFraction: 0.47, rootRatio: 0.24, carbonTree: true, source: "Saragih dkk. 2016" },
  { local: "Akasia", scientific: "Acacia mangium", equation: "power", a: 0.07, b: 2.58, density: 0.6, growth: 0.8, dbhMin: 5, dbhMax: 60, carbonFraction: 0.47, rootRatio: 0.24, carbonTree: true, source: "Jurnal Sylva Scienteae ULM" },
  { local: "Ketapang", scientific: "Terminalia catappa", equation: "chave", density: 0.59, growth: 0.8, dbhMin: 5, dbhMax: 150, carbonFraction: 0.47, rootRatio: 0.24, carbonTree: true, source: "Chave 2014 (Model umum)" },
  { local: "Lainnya", scientific: "-", equation: "chave", density: 0.6, growth: 0.8, dbhMin: 5, dbhMax: 150, carbonFraction: 0.47, rootRatio: 0.24, carbonTree: true, source: "Chave 2014 + berat jenis (Model umum)" },
  { local: "Palem", scientific: "Arecaceae", equation: "chave", density: 0, growth: 0, dbhMin: 0, dbhMax: 0, carbonFraction: 0, rootRatio: 0, carbonTree: false, source: "Dicatat tanpa stok karbon (MVP)" },
]

/** Bobot kelengkapan baseline (PRD §4.4) */
export const COMPLETENESS_WEIGHTS: Record<string, number> = {
  listrik: 25, mobilitas: 20, sampah: 15, pohon: 15, lpg: 8, ac: 7, genset: 5, air_limbah: 3, kertas: 2,
}
export const REQUIRED_COMPONENTS = ["listrik", "mobilitas", "sampah", "pohon", "profil"]

export const SOURCE_META: Record<string, { label: string; scope: 1 | 2 | 3; unit: string }> = {
  listrik: { label: "Listrik PLN", scope: 2, unit: "kWh" },
  lpg: { label: "LPG", scope: 1, unit: "kg" },
  genset: { label: "Genset (solar B40)", scope: 1, unit: "liter" },
  ac: { label: "AC & refrigeran", scope: 1, unit: "kg" },
  mobilitas: { label: "Mobilitas", scope: 3, unit: "km" },
  sampah: { label: "Sampah ke TPA", scope: 3, unit: "kg" },
  sampah_lokal: { label: "Sampah diolah di sekolah", scope: 1, unit: "kg" },
  air_limbah: { label: "Air limbah", scope: 3, unit: "orang-hari" },
  kertas: { label: "Kertas", scope: 3, unit: "rim" },
}
