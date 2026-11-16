import { ExternalLink } from "lucide-react"
import { tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** Lembaga penerbit faktor emisi — supaya kolom "sumber" mudah dibaca orang awam. */
type Org = { short: string; id: string; en: string; tone: string }
const ORGS: Record<string, Org> = {
  kesdm: { short: "KESDM", id: "Kementerian Energi dan Sumber Daya Mineral", en: "Ministry of Energy and Mineral Resources", tone: "bg-amber-500/12 text-amber-800 dark:text-amber-300" },
  klhk: { short: "KLHK", id: "Kementerian Lingkungan Hidup dan Kehutanan", en: "Ministry of Environment and Forestry", tone: "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300" },
  bsn: { short: "SNI", id: "Badan Standardisasi Nasional", en: "National Standardization Agency", tone: "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300" },
  ipcc: { short: "IPCC", id: "Panel Antarpemerintah tentang Perubahan Iklim (PBB)", en: "Intergovernmental Panel on Climate Change (UN)", tone: "bg-sky-500/12 text-sky-800 dark:text-sky-300" },
  bi: { short: "Bank Indonesia", id: "Kalkulator Hijau Bank Indonesia", en: "Bank Indonesia Green Calculator", tone: "bg-indigo-500/12 text-indigo-800 dark:text-indigo-300" },
  kai: { short: "KAI", id: "PT Kereta Api Indonesia", en: "Indonesian Railways (KAI)", tone: "bg-indigo-500/12 text-indigo-800 dark:text-indigo-300" },
  defra: { short: "DEFRA", id: "Pemerintah Inggris (DEFRA) — rujukan internasional", en: "UK Government (DEFRA) — international reference", tone: "bg-violet-500/12 text-violet-800 dark:text-violet-300" },
  supplier: { short: "Data pemasok", id: "Data pemasok / kajian daur hidup (LCA)", en: "Supplier data / life-cycle assessment", tone: "bg-muted text-muted-foreground" },
  estimate: { short: "Perkiraan", id: "Angka perkiraan — perlu diganti data resmi", en: "Estimate — replace with official data", tone: "bg-orange-500/12 text-orange-800 dark:text-orange-300" },
  basic: { short: "Ilmu dasar", id: "Perhitungan kimia/fisika baku", en: "Standard chemistry/physics", tone: "bg-muted text-muted-foreground" },
}

export function sourceInfo(raw?: string | null): { org: Org | null; detail: string } {
  const s = (raw ?? "").trim()
  if (!s || s === "-") return { org: null, detail: "" }
  const L = s.toLowerCase()
  const key =
    /esdm|ketenagalistrikan|djk|kepmen esdm/.test(L) ? "kesdm"
    : /klhk|kigali/.test(L) ? "klhk"
    : /\bsni\b/.test(L) ? "bsn"
    : /\bkai\b/.test(L) ? "kai"
    : /ilustrasi|perkiraan/.test(L) ? "estimate"
    : /kalkulator hijau|\bbi\b|bank indonesia/.test(L) ? "bi"
    : /defra/.test(L) ? "defra"
    : /ipcc/.test(L) ? "ipcc"
    : /epd|lca|pemasok|world steel|eeio/.test(L) ? "supplier"
    : /stoikiometri/.test(L) ? "basic"
    : ""
  // perapian teks rincian agar mudah dibaca
  const detail = s
    .replace(/\bDJK ESDM\b/g, "Ditjen Ketenagalistrikan")
    .replace(/\bvia Kalkulator Hijau BI v2\b/g, "· dikutip dari Kalkulator Hijau BI")
    .replace(/\bVol\.\s?(\d)/g, "Volume $1").replace(/\bCh\.(\d+)/g, "Bab $1").replace(/\bTabel\b/g, "Tabel")
    .replace(/\s+/g, " ").trim()
  return { org: key ? ORGS[key] : null, detail }
}

/** Lencana lembaga + rincian sumber (opsional tautan). */
export function SourceLabel({ source, url, compact, className }: { source?: string | null; url?: string | null; compact?: boolean; className?: string }) {
  const { org, detail } = sourceInfo(source)
  if (!org && !detail) return <span className={cn("text-muted-foreground", className)}>–</span>
  const body = (
    <span className={cn(compact ? "flex w-full min-w-0 flex-col gap-1" : "inline-flex min-w-0 flex-col gap-1", className)}>
      {org && <span title={tl(org.id, org.en)} className={cn("w-fit rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold", org.tone)}>{org.short}</span>}
      {!compact && detail && <span className="text-xs leading-snug text-muted-foreground">{org ? <span className="text-foreground/80">{tl(org.id, org.en)}</span> : null}{org ? " · " : ""}{detail}</span>}
      {compact && detail && <span title={detail} className="block w-full truncate text-xs text-muted-foreground">{detail}</span>}
    </span>
  )
  return url ? <a href={url} target="_blank" rel="noreferrer" className={cn("items-start gap-1 hover:text-primary", compact ? "flex w-full min-w-0" : "inline-flex")}>{body}<ExternalLink className="mt-1 size-3 shrink-0 text-muted-foreground" /></a> : body
}
