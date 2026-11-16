import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/** Kit tampilan aplikasi Petugas (.fapp): kartu lembut berradius besar, tombol bulat, chip pil, tile pastel. */

export type Tone = "mint" | "lime" | "teal" | "sand" | "sky" | "rose" | "tint"
export const toneBg = (t: Tone) => (t === "tint" ? "var(--f-tint-soft)" : `var(--f-${t})`)
const TONE_FG: Record<Tone, string> = {
  mint: "text-emerald-700 dark:text-emerald-300", lime: "text-lime-700 dark:text-lime-300", teal: "text-teal-700 dark:text-teal-300",
  sand: "text-amber-700 dark:text-amber-300", sky: "text-sky-700 dark:text-sky-300", rose: "text-rose-600 dark:text-rose-300", tint: "text-[var(--f-tint)]",
}
export const toneFg = (t: Tone) => TONE_FG[t]

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("f-card", className)}>{children}</div>
}

/** Tombol bulat putih (kembali, notifikasi, menu). */
export const circleCls = "flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--f-card)] shadow-[var(--f-shadow)] transition-transform active:scale-95"

/** Gelembung ikon bulat berwarna pastel. */
export function Bubble({ icon: Icon, tone = "tint", size = "md" }: { icon: LucideIcon; tone?: Tone; size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "size-12" : size === "sm" ? "size-8" : "size-10"
  const g = size === "lg" ? "size-6" : size === "sm" ? "size-4" : "size-5"
  return <span className={cn("flex shrink-0 items-center justify-center rounded-full", box, toneFg(tone))} style={{ background: toneBg(tone) }}><Icon className={g} /></span>
}

export function Chip({ children, tone, className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cn("inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium", tone ? toneFg(tone) : "text-[var(--f-muted)]", className)} style={{ background: tone ? toneBg(tone) : "var(--f-soft)" }}>{children}</span>
}

/** Tombol pil utama (hitam di mode terang, terang di mode gelap). */
export function PillButton({ children, to, onClick, className }: { children: ReactNode; to?: string; onClick?: () => void; className?: string }) {
  const cls = cn("inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[var(--f-ink)] px-5 text-sm font-medium text-[var(--f-ink-fg)] transition-transform active:scale-95", className)
  return to ? <Link to={to} className={cls}>{children}</Link> : <button type="button" onClick={onClick} className={cls}>{children}</button>
}

export function SectionHead({ title, to, linkLabel }: { title: string; to?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between px-0.5">
      <h2 className="text-[1.0625rem] font-medium">{title}</h2>
      {to && linkLabel && <Link to={to} className="text-sm font-medium text-[var(--f-tint)]">{linkLabel}</Link>}
    </div>
  )
}

/** Tile kategori pastel: label kiri atas, ikon besar di kanan bawah (seperti ilustrasi). */
export function Tile({ to, label, icon: Icon, tone, badge }: { to: string; label: string; icon: LucideIcon; tone: Tone; badge?: ReactNode }) {
  return (
    <Link to={to} className="group relative block h-[5.5rem] overflow-hidden rounded-[1.25rem] p-3 transition-transform active:scale-95 md:h-28 md:p-4" style={{ background: toneBg(tone) }}>
      <span className="relative z-10 block truncate pr-4 text-[0.8125rem] font-medium md:text-sm">{label}</span>
      {badge && <span className="absolute top-1.5 right-1.5 z-10 rounded-full bg-[var(--f-ink)] px-1.5 py-0.5 text-[0.625rem] font-semibold text-[var(--f-ink-fg)]">{badge}</span>}
      <span className="absolute -right-3 -bottom-3 size-16 rounded-full bg-white/45 dark:bg-white/5 md:size-20" />
      <Icon className={cn("absolute right-2.5 bottom-2.5 size-9 transition-transform group-hover:-rotate-6 md:right-3.5 md:bottom-3.5 md:size-11", toneFg(tone))} strokeWidth={1.6} />
    </Link>
  )
}

/** Garis rute putus-putus dengan ikon di ujung (gaya tiket). */
export function Route({ left, leftSub, right, rightSub, mid, icon: Icon }: { left: ReactNode; leftSub?: ReactNode; right: ReactNode; rightSub?: ReactNode; mid?: ReactNode; icon: LucideIcon }) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 leading-tight"><div className="text-[0.9375rem] font-semibold">{left}</div>{leftSub && <div className="mt-0.5 text-[0.6875rem] text-[var(--f-muted)]">{leftSub}</div>}</div>
      <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
        {mid && <span className="truncate text-[0.6875rem] text-[var(--f-muted)]">{mid}</span>}
        <div className="flex w-full items-center text-[var(--f-muted)]/60">
          <span className="size-1.5 shrink-0 rounded-full bg-[var(--f-ink)]" />
          <span className="f-dash h-[2px] flex-1" />
          <Icon className="size-4 shrink-0 text-[var(--f-ink)]" />
        </div>
      </div>
      <div className="min-w-0 text-right leading-tight"><div className="text-[0.9375rem] font-semibold">{right}</div>{rightSub && <div className="mt-0.5 text-[0.6875rem] text-[var(--f-muted)]">{rightSub}</div>}</div>
    </div>
  )
}

export function EmptyCard({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return <Card className="flex items-center gap-3 p-5 text-sm text-[var(--f-muted)]"><Bubble icon={Icon} tone="mint" />{text}</Card>
}
