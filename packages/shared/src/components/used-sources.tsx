import { Link } from "react-router-dom"
import { BookCheck, CircleCheck, CircleAlert } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SourceLabel } from "@/components/source-label"
import { num } from "@/lib/format"
import { tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** Faktor yang benar-benar dipakai engine harian — sisanya di tabel bawah hanya katalog/ilustrasi.
 *  Status "terbaru" dicek manual terhadap penerbitnya (tanggal di CHECKED). */
const CHECKED = "18 Nov 2026"
type Row = { id: string; en: string; codes: string[]; ok: boolean; noteId: string; noteEn: string }
const USED: Row[] = [
  { id: "Listrik PLN", en: "Grid electricity", codes: ["EL_JAMALI"], ok: true,
    noteId: "Penetapan resmi terakhir yang ditemukan: Kepmen ESDM 163.K/HK.02/MEM.S/2021 (inventarisasi 2019). Belum ada Kepmen yang lebih baru.",
    noteEn: "Latest official figure found: MEMR Decree 163.K/2021 (2019 inventory). No newer decree found." },
  { id: "LPG", en: "LPG", codes: ["LPG_BI"], ok: true, noteId: "Sejalan IPCC 2006 (2,98 kg CO₂/kg).", noteEn: "Consistent with IPCC 2006 (2.98 kg CO₂/kg)." },
  { id: "Genset biosolar B40", en: "B40 biodiesel generator", codes: ["FUEL_SOLAR_IPCC", "B40_FOSIL"], ok: true, noteId: "IPCC 2006 + porsi fosil B40 (Kepmen ESDM 341.K/2024).", noteEn: "IPCC 2006 + B40 fossil share (MEMR Decree 341.K/2024)." },
  { id: "AC & refrigeran", en: "AC & refrigerants", codes: ["REF_R32", "REF_R410A", "REF_LEAK"], ok: true, noteId: "GWP IPCC AR5 (dipakai inventarisasi nasional); laju bocor IPCC 2019 Refinement.", noteEn: "IPCC AR5 GWP; leak rate IPCC 2019 Refinement." },
  { id: "Kertas", en: "Paper", codes: ["PAPER_RIM"], ok: false, noteId: "Masih DEFRA 2025. DEFRA/DESNZ 2026 sudah terbit — perbarui lewat versi faktor baru.", noteEn: "Still DEFRA 2025. DEFRA/DESNZ 2026 is out — update via a new factor version." },
  { id: "Sampah ke TPA", en: "Waste to landfill", codes: ["WS_MAKANAN_TPA", "WS_KERTAS_TPA", "WS_KEBUN_TPA"], ok: true, noteId: "IPCC 2006 Vol.5 (MCF 0,6, metode komitmen).", noteEn: "IPCC 2006 Vol.5 (MCF 0.6, commitment method)." },
  { id: "Kompos & plastik dibakar", en: "Compost & open burning", codes: ["WS_KOMPOS", "WS_PLASTIK_BAKAR"], ok: true, noteId: "IPCC 2006 Vol.5 Bab 4 & 5.", noteEn: "IPCC 2006 Vol.5 Ch.4 & 5." },
  { id: "Air limbah", en: "Wastewater", codes: ["WW_ORG_HARI"], ok: true, noteId: "IPCC 2006 Vol.5 Bab 6 (BOD, B₀, MCF).", noteEn: "IPCC 2006 Vol.5 Ch.6." },
  { id: "Perjalanan warga", en: "Commuting", codes: ["TR_MOTOR", "TR_SEDAN", "TR_ANGKOT", "TR_BUS_SDG"], ok: true, noteId: "Kalkulator Hijau Bank Indonesia v2 (faktor kendaraan Indonesia).", noteEn: "Bank Indonesia Green Calculator v2." },
  { id: "Pengali gas (GWP)", en: "Gas multipliers (GWP)", codes: ["GWP_CH4", "GWP_N2O"], ok: true, noteId: "IPCC AR5.", noteEn: "IPCC AR5." },
]

export function UsedSources({ factors }: { factors: Record<string, any>[] }) {
  const byCode = Object.fromEntries(factors.filter((f) => f.active).map((f) => [f.code, f]))
  const publishers = ["KESDM", "IPCC", "Bank Indonesia", "DEFRA", "SNI"]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl"><BookCheck className="size-5 text-primary" />{tl("Sumber data yang dipakai perhitungan", "Data sources used in the calculation")}</CardTitle>
        <CardDescription>
          {tl(`Hanya faktor di daftar ini yang dipakai engine harian; faktor lain di tabel bawah adalah katalog. Dicek ${CHECKED}.`, `Only these factors feed the daily engine; others below are a catalogue. Checked ${CHECKED}.`)}
          {" "}{tl("Penerbit:", "Publishers:")} {publishers.join(" · ")} · {tl("pohon: SNI 7724:2011 & persamaan alometrik di", "trees: SNI 7724:2011 & allometrics in")} <Link to="/admin/species" className="text-primary hover:underline">{tl("Jenis Pohon", "Tree species")}</Link>.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y px-0">
        {USED.map((r) => {
          const fs = r.codes.map((c) => byCode[c]).filter(Boolean)
          const main = fs[0]
          return (
            <div key={r.id} className="grid items-start gap-2 px-6 py-3 sm:grid-cols-[11rem_1fr_minmax(0,1.2fr)] sm:gap-4">
              <div className="font-medium">{tl(r.id, r.en)}</div>
              <div className="min-w-0 text-sm">
                {fs.map((f) => <div key={f.code} className="tabular"><b>{num(f.value, f.value < 1 ? 4 : f.value < 10 ? 3 : Number.isInteger(f.value) ? 0 : 1)}</b> <span className="text-muted-foreground">{f.unit}</span></div>)}
                {main && <div className="mt-1"><SourceLabel source={main.source} url={main.url} compact /></div>}
                {!fs.length && <span className="text-muted-foreground">–</span>}
              </div>
              <div className={cn("flex items-start gap-1.5 text-xs leading-snug", r.ok ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300")}>
                {r.ok ? <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-primary" /> : <CircleAlert className="mt-0.5 size-3.5 shrink-0" />}
                <span><b className="font-medium">{r.ok ? tl("Terbaru", "Up to date") : tl("Ada edisi baru", "Newer edition")}</b> · {tl(r.noteId, r.noteEn)}</span>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
