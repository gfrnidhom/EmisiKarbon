import { useEmbed } from "./embed"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertTriangle, ArrowUpRight, Inbox, Loader2, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { t } from "@/lib/i18n"

/** Panel putih untuk konten penting (dipakai header detail). */
export function HeroCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-2xl bg-card px-6 py-6 sm:px-7", className)}>{children}</section>
}

/** Info ringkas: teks biasa dipisah garis. */
export function HeroChip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 text-sm text-muted-foreground not-first:before:mr-2 not-first:before:text-border not-first:before:content-['|']", className)}>{children}</span>
}

export function PageHeader({ title, description, actions, icon: Icon, badge, meta }: { title: string; description?: ReactNode; actions?: ReactNode; icon?: LucideIcon; badge?: ReactNode; meta?: ReactNode }) {
  const { embedded } = useEmbed()
  // ditanam di wizard: judul ringkas, tindakan tetap tersedia
  if (embedded) return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {/* judul sudah ditampilkan oleh langkah wizard — cukup penjelasan & tindakan */}
        {badge && <div className="mb-1 flex flex-wrap items-center gap-2">{badge}</div>}
        {description && <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
  return (
    <div className="mb-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {Icon && <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card text-primary"><Icon className="size-5" /></span>}
            <h1 className="text-[1.75rem] font-semibold tracking-tight sm:text-4xl">{title}</h1>
            {badge}
          </div>
          {description && <p className="mt-2 max-w-3xl text-[0.9375rem] leading-relaxed text-muted-foreground">{description}</p>}
          {meta && <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>}
      </div>
    </div>
  )
}

/** Kartu angka — gaya sama dengan kartu KPI dasbor (judul, lingkaran ikon/panah, angka besar, keterangan). */
export function StatCard({ label, value, sub, icon: Icon, tone = "default", onClick, footer, className, featured }: {
  label: string; value: ReactNode; sub?: ReactNode; icon?: LucideIcon; tone?: "default" | "leaf" | "warn" | "scope1" | "scope2" | "scope3"; onClick?: () => void; footer?: ReactNode; className?: string; featured?: boolean
}) {
  const toneCls = {
    default: "text-primary", leaf: "text-leaf", warn: "text-amber-600 dark:text-amber-400",
    scope1: "text-scope1", scope2: "text-amber-700 dark:text-scope2", scope3: "text-scope3",
  }[tone]
  return (
    <div role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick}
      className={cn("group flex min-h-40 flex-col rounded-2xl p-6 transition-shadow",
        featured ? "bg-gradient-to-br from-primary to-primary-deep text-white dark:from-primary/55 dark:to-primary-deep" : "bg-card dark:ring-1 dark:ring-white/[0.04]",
        onClick && "cursor-pointer hover:ring-1 hover:ring-primary/25", className)}>
      <div className="flex items-start justify-between gap-3">
        <span className={cn("text-[0.9375rem] leading-snug font-medium", featured ? "text-white" : "text-foreground")}>{label}</span>
        {(Icon || onClick) && (
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full transition-transform", onClick && "group-hover:rotate-45",
            featured ? "bg-white text-primary-deep" : onClick ? "border border-foreground/25 text-foreground" : cn("border border-border", toneCls))}>
            {onClick ? <ArrowUpRight className="size-[1.125rem]" /> : Icon && <Icon className="size-[1.125rem]" />}
          </span>
        )}
      </div>
      <div className="mt-auto pt-5">
        <div className="text-[2.125rem] leading-tight font-semibold tracking-tight tabular">{value}</div>
        {sub && <div className={cn("mt-2 text-[0.8125rem] leading-snug", featured ? "text-white/80" : "text-muted-foreground")}>{sub}</div>}
        {footer}
      </div>
    </div>
  )
}

const LABEL_STYLE: Record<string, string> = {
  proyeksi: "bg-muted text-muted-foreground border-dashed border-muted-foreground/40",
  sementara: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-dashed border-amber-500/40",
  input: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
  "input operator": "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
  terverifikasi: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  terkunci: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200 border-emerald-600/30",
  estimasi: "bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/25",
  interpolasi: "bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-500/25",
  aktual: "bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/25",
  terukur: "bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/25",
  "rata-rata": "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20",
  "rata-rata lama": "bg-orange-500/12 text-orange-700 dark:text-orange-300 border-orange-500/25",
  kosong: "bg-muted text-muted-foreground",
  "non-nasional": "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/20",
}
const QUALITY_TEXT: Record<string, string> = { sementara: "Sementara", proyeksi: "Proyeksi", terverifikasi: "Disahkan", terkunci: "Terkunci", estimasi: "Estimasi", interpolasi: "Interpolasi", aktual: "Aktual", terukur: "Terukur", "rata-rata": "Rata-rata", "rata-rata lama": "Rata-rata lama", kosong: "Kosong", "non-nasional": "Non-nasional" }
export function QualityBadge({ label, className }: { label?: string | null; className?: string }) {
  if (!label) return null
  return <Badge variant="outline" className={cn(LABEL_STYLE[label] ?? "", className)}>{label === "input" ? t("Input operator") : t(QUALITY_TEXT[label] ?? label)}</Badge>
}

const STATUS: Record<string, [string, string]> = {
  draf: ["Draf", "bg-muted text-foreground/70"],
  menunggu_kepsek: ["Diajukan", "bg-amber-500/12 text-amber-700 dark:text-amber-300"],
  diajukan: ["Diajukan", "bg-sky-500/12 text-sky-700 dark:text-sky-300"],
  perlu_perbaikan: ["Perlu perbaikan", "bg-red-500/12 text-red-700 dark:text-red-300"],
  terverifikasi: ["Disahkan", "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"],
  terkunci: ["Terkunci", "bg-emerald-700/15 text-emerald-800 dark:text-emerald-200"],
  perlu_tinjau: ["Perlu tinjau ulang", "bg-orange-500/12 text-orange-700"],
  terbuka: ["Terbuka", "bg-sky-500/12 text-sky-700 dark:text-sky-300"],
  selesai: ["Selesai", "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"],
  lolos: ["Lolos", "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"],
  gagal_diperluas: ["Gagal → diperluas", "bg-red-500/12 text-red-700"],
  rencana: ["Direncanakan", "bg-muted"],
  aktif: ["Aktif", "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"],
  ditutup: ["Ditutup", "bg-muted"],
  berjalan: ["Berjalan", "bg-sky-500/12 text-sky-700 dark:text-sky-300"],
  hidup: ["Hidup", "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"],
  mati: ["Mati", "bg-red-500/12 text-red-700"],
  ditebang: ["Ditebang", "bg-red-500/12 text-red-700"],
  belum_dipasang: ["QR belum dipasang", "bg-muted"],
}
export function StatusBadge({ status, className }: { status?: string | null; className?: string }) {
  if (!status) return null
  const [label, cls] = STATUS[status] ?? [status, "bg-muted"]
  const shown = t(label)
  return <Badge variant="secondary" className={cn("border-transparent", cls, className)}>{shown}</Badge>
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card/60 px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-background ring-1 ring-border"><Icon className="size-5 text-muted-foreground" /></div>
      <div>
        <p className="font-medium">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <AlertTriangle className="size-6 text-destructive" />
      <p className="text-sm">{(error as Error)?.message ?? t("Gagal memuat data")}</p>
      {!navigator.onLine && <p className="text-xs text-muted-foreground">{t("Anda sedang offline — data tersimpan akan tampil bila tersedia di cache.")}</p>}
      {retry && <Button variant="outline" size="sm" onClick={retry}>{t("Coba lagi")}</Button>}
    </div>
  )
}
export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  )
}
export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cn("size-4 animate-spin", className)} />

export function Field({ label, hint, children, className, error }: { label: string; hint?: ReactNode; children: ReactNode; className?: string; error?: string }) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function SimpleSelect({ value, onChange, options, placeholder, className, size }: {
  value: string | null | undefined; onChange: (v: string) => void; options: { value: string; label: ReactNode }[]; placeholder?: string; className?: string; size?: "sm" | "default"
}) {
  return (
    <Select value={value ?? null} onValueChange={(v) => v !== null && onChange(String(v))} items={options}>
      <SelectTrigger className={cn("w-full", className)} size={size}>
        <SelectValue placeholder={placeholder ?? t("Pilih…")} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

export function Meter({ value, className, tone = "primary" }: { value: number; className?: string; tone?: "primary" | "warn" | "danger" }) {
  const c = tone === "danger" ? "bg-destructive" : tone === "warn" ? "bg-amber-500" : "bg-primary"
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className={cn("h-full rounded-full transition-all duration-500", c)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}
