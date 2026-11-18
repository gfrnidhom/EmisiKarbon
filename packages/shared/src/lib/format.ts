import { locale, t, tl } from "@/lib/i18n"
const nf = (d: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d })
export const num = (v: number | null | undefined, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? "–" : nf(d).format(v))
/** §7.6: kg CO₂e 1 desimal untuk harian */
export const kg = (v: number | null | undefined, d = 1) => `${num(v, d)} kg`
/** ton CO₂e 2 desimal untuk bulanan/tahunan */
export const ton = (v: number | null | undefined, d = 2) => `${num((v ?? 0) / 1000, d)} t`
export const pct = (v: number | null | undefined, d = 0) => (v === null || v === undefined ? "–" : `${num(v * 100, d)}%`)
export const signedPct = (v: number | null | undefined) => (v === null || v === undefined ? "–" : `${v > 0 ? "+" : ""}${num(v * 100, 1)}%`)
export const fmtDate = (iso?: string | null, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  iso ? new Date(iso.length === 10 ? iso + "T00:00:00+07:00" : iso.replace(" ", "T") + (iso.includes("T") || iso.includes("Z") ? "" : "Z")).toLocaleDateString(locale, { timeZone: "Asia/Jakarta", ...opts }) : "–"
export const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso.replace(" ", "T") + (iso.includes("Z") || iso.includes("+") ? "" : "Z")).toLocaleString(locale, { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" }) + " WIB" : "–"
export const fmtMonth = (ym: string) => new Date(ym + "-01T00:00:00+07:00").toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "Asia/Jakarta" })
export const todayWIB = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)
export const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
export const monthAdd = (ym: string, n: number) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7) }

export const SOURCES: Record<string, { label: string; short: string; scope: 1 | 2 | 3; unit: string; color: string }> = {
  listrik: { short: tl("Listrik", "Grid"), label: t("Listrik PLN"), scope: 2, unit: "kWh", color: "var(--scope2)" },
  lpg: { short: "LPG", label: t("LPG"), scope: 1, unit: "kg", color: "oklch(0.76 0.13 78)" },
  genset: { short: "Genset", label: t("Genset"), scope: 1, unit: "liter", color: "oklch(0.6 0.1 45)" },
  ac: { short: "AC", label: t("AC & refrigeran"), scope: 1, unit: "kg", color: "oklch(0.62 0.07 210)" },
  mobilitas: { short: tl("Mobilitas", "Commute"), label: t("Mobilitas"), scope: 3, unit: "km", color: "var(--scope3)" },
  sampah: { short: tl("TPA", "Landfill"), label: t("Sampah ke TPA"), scope: 3, unit: "kg", color: "oklch(0.78 0.12 135)" },
  sampah_lokal: { short: tl("Olah lokal", "On-site"), label: t("Sampah diolah di sekolah"), scope: 1, unit: "kg", color: "oklch(0.66 0.13 110)" },
  air_limbah: { short: tl("Limbah", "Sewage"), label: t("Air limbah"), scope: 3, unit: "orang-hari", color: "oklch(0.68 0.08 178)" },
  kertas: { short: tl("Kertas", "Paper"), label: t("Kertas"), scope: 3, unit: "rim", color: "oklch(0.62 0.09 112)" },
  plts: { short: "PLTS", label: t("PLTS atap"), scope: 2, unit: "kWh", color: "var(--leaf)" },
}
/** Scope sebuah sumber; air limbah bergantung sanitasi sekolah (tangki septik sendiri = Scope 1). */
export const sourceScope = (k: string, org?: { sanitation?: string | null } | null) => (k === "air_limbah" ? (org?.sanitation === "septik" ? 1 : 3) : SOURCES[k]?.scope)
/** Urutan baku sumber di semua halaman: Scope 1 (langsung) → Scope 2 (listrik) → Scope 3 (rantai nilai). */
export const SOURCE_ORDER = ["lpg", "genset", "ac", "sampah_lokal", "air_limbah", "listrik", "mobilitas", "sampah", "kertas"]
export const SCOPE_INFO: Record<1 | 2 | 3, { id: string; en: string; descId: string; descEn: string }> = {
  1: { id: "Scope 1 · Emisi Langsung", en: "Scope 1 · Direct Emissions", descId: "Sumber yang dimiliki/dikendalikan sekolah: pembakaran bahan bakar, refrigeran, sampah diolah di sekolah, tangki septik", descEn: "Sources owned or controlled by the school: fuel combustion, refrigerants, on-site waste, septic tank" },
  2: { id: "Scope 2 · Emisi Tidak Langsung Energi", en: "Scope 2 · Indirect Energy Emissions", descId: "Listrik PLN yang dibeli dan dipakai sekolah (location-based)", descEn: "Purchased grid electricity consumed by the school (location-based)" },
  3: { id: "Scope 3 · Emisi Tidak Langsung Lainnya", en: "Scope 3 · Other Indirect Emissions", descId: "Rantai nilai: perjalanan warga sekolah, sampah ke TPA, kertas, air limbah ke luar sekolah", descEn: "Value chain: commuting, waste to landfill, paper, off-site wastewater" },
}
/** Kelompokkan & urutkan sumber per scope (scope kosong dilewati). `scopeOf` boleh dari data (mis. hasil engine). */
export function groupByScope<T>(items: T[], keyOf: (x: T) => string, org?: { sanitation?: string | null } | null, scopeOf?: (x: T) => number | undefined) {
  const rank = (k: string) => { const i = SOURCE_ORDER.indexOf(k); return i < 0 ? 99 : i }
  return ([1, 2, 3] as const).map((sc) => ({
    scope: sc,
    items: items.filter((x) => (scopeOf?.(x) ?? sourceScope(keyOf(x), org)) === sc).sort((a, b) => rank(keyOf(a)) - rank(keyOf(b))),
  })).filter((g) => g.items.length)
}
export const SCOPE_LABEL = { 1: t("Scope 1 · Emisi Langsung"), 2: t("Scope 2 · Emisi Tidak Langsung Energi"), 3: t("Scope 3 · Emisi Tidak Langsung Lainnya") } as const
