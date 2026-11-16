import { useState, type ReactNode } from "react"
import { ArrowDownRight, ArrowUpRight, Bike, Droplets, FileText, Flame, Fuel, Recycle, Snowflake, Zap, type LucideIcon } from "lucide-react"
import { num } from "@/lib/format"
import { cn } from "@/lib/utils"

/* Komponen gaya dasbor yang dipakai bersama semua halaman: kartu KPI, batang kapsul, gauge bersegmen. */

export const SRC_ICON: Record<string, LucideIcon> = { listrik: Zap, mobilitas: Bike, air_limbah: Droplets, sampah: Recycle, sampah_lokal: Recycle, lpg: Flame, kertas: FileText, ac: Snowflake, genset: Fuel }
export const hatch = (c = "var(--primary)") => ({ backgroundImage: `repeating-linear-gradient(135deg, color-mix(in srgb, ${c} 55%, transparent) 0 2.5px, transparent 2.5px 8px)` })

/** Kotak indikator kecil "[▲ 5]" seperti di referensi. */
export function Delta({ value, good, text, invert }: { value: string; good: boolean | null; text: string; invert?: boolean }) {
  const up = value.startsWith("+")
  return (
    <span className={cn("inline-flex items-center gap-2 text-[0.8125rem]", invert ? "text-white/85" : good === null ? "text-muted-foreground" : good ? "text-primary" : "text-amber-700 dark:text-amber-400")}>
      <span className={cn("inline-flex h-5 items-center gap-0.5 rounded-md border px-1 text-[0.625rem] font-semibold tabular", invert ? "border-white/40" : "border-current/40")}>
        {value.replace(/^[+−-]/, "")}{up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      </span>
      {text}
    </span>
  )
}

export function StatTile({ title, value, unit, foot, featured, onClick, icon: Icon }: { title: string; value: ReactNode; unit?: string; foot?: ReactNode; featured?: boolean; onClick?: () => void; icon?: LucideIcon }) {
  return (
    <button type="button" disabled={!onClick} onClick={onClick} className={cn("group relative flex min-h-48 disabled:cursor-default flex-col overflow-hidden rounded-2xl p-6 text-left transition-shadow",
      featured ? "bg-gradient-to-br from-primary to-primary-deep text-white dark:from-primary/55 dark:to-primary-deep" : "bg-card hover:ring-1 hover:ring-primary/25 dark:ring-1 dark:ring-white/[0.04]")}>
      <div className="flex items-start justify-between gap-3">
        <span className={cn("text-[1.0625rem] font-medium", featured ? "text-white" : "text-foreground")}>{title}</span>
        {(onClick || Icon) && <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full transition-transform", onClick && "group-hover:rotate-45",
          featured ? "bg-white text-primary-deep" : onClick ? "border border-foreground/25 text-foreground" : "border border-border text-primary")}>{onClick ? <ArrowUpRight className="size-[1.125rem]" /> : Icon && <Icon className="size-[1.125rem]" />}</span>}
      </div>
      <div className="mt-auto pt-6">
        <div className="flex items-baseline gap-2"><span className="text-5xl leading-none font-semibold tracking-tight tabular">{value}</span><span className={cn("text-sm", featured ? "text-white/75" : "text-muted-foreground")}>{unit}</span></div>
        {foot && <div className="mt-4">{foot}</div>}
      </div>
    </button>
  )
}

/** Batang kapsul 7 hari / 7 minggu. Arsir = hari libur. */
export function PillBars({ bars, onPick, format = (v) => `${num(v, 0)} kg`, height = 240, selected }: { bars: { key: string; label: string; value: number; hatched?: boolean; current?: boolean; date?: string }[]; onPick?: (b: any) => void; format?: (v: number) => string; height?: number; selected?: string | null }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(...bars.map((b) => b.value), 1)
  const peak = bars.reduce((a, b, i) => (b.value > bars[a].value ? i : a), 0)
  const labelAt = hover ?? (selected ? bars.findIndex((b) => b.key === selected) : bars.findIndex((b) => b.current))
  const isSel = (b: { key: string; current?: boolean }) => (selected ? b.key === selected : b.current)
  return (
    <div className="grid items-end gap-2 sm:gap-4" style={{ height, gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>
      {bars.map((b, i) => {
        const h = b.value ? Math.max(18, (b.value / max) * 100) : 18
        const fill = b.hatched ? undefined : i === peak ? "var(--primary-deep)" : isSel(b) ? "color-mix(in srgb, var(--primary) 55%, var(--card))" : "var(--primary)"
        return (
          <button key={b.key} onClick={() => onPick?.(b)} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className="flex h-full flex-col items-center justify-end gap-2.5">
            <div className="relative flex w-full flex-1 items-end justify-center">
              <div className={cn("relative w-full max-w-16 rounded-full transition-all duration-500 hover:brightness-110", b.hatched && "ring-1 ring-primary/30 ring-inset")}
                style={{ height: `${h}%`, background: fill, ...(b.hatched ? hatch() : {}) }}>
                {labelAt === i && (
                  <span className="absolute -top-9 left-1/2 -translate-x-1/2 rounded-md border border-primary/30 bg-card px-1.5 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap text-primary tabular shadow-sm">
                    {format(b.value)}
                    <span className="absolute top-full left-1/2 mt-[3px] size-2 -translate-x-1/2 rounded-full border-2 border-primary bg-card" />
                  </span>
                )}
              </div>
            </div>
            <span className={cn("truncate text-xs sm:text-sm", isSel(b) ? "font-semibold text-foreground" : "text-muted-foreground")}>{b.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Setengah lingkaran bersegmen (data kuat / sedang / proyeksi). */
export function SegmentGauge({ parts, value, label }: { parts: { v: number; color: string; hatched?: boolean }[]; value: string; label: string }) {
  const W = 260, R = 100, cx = W / 2, cy = 120, sw = 34
  const pt = (f: number) => [cx - R * Math.cos(Math.PI * f), cy - R * Math.sin(Math.PI * f)]
  let acc = 0
  const total = parts.reduce((s, p) => s + p.v, 0) || 1
  return (
    <svg viewBox={`0 0 ${W} 150`} className="mx-auto w-full max-w-[18.75rem]">
      <defs><pattern id="g-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="var(--card)" /><rect width="2.6" height="7" fill="color-mix(in srgb, var(--primary) 55%, transparent)" /></pattern></defs>
      <path d={`M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}`} fill="none" stroke="var(--muted)" strokeWidth={sw} />
      {parts.map((p, i) => {
        const a = acc / total, b = (acc += p.v) / total
        if (b - a < 0.001) return null
        const [x1, y1] = pt(a), [x2, y2] = pt(Math.min(b, 0.999))
        return <path key={i} d={`M${x1},${y1} A${R},${R} 0 0 1 ${x2},${y2}`} fill="none" stroke={p.hatched ? "url(#g-hatch)" : p.color} strokeWidth={sw} strokeLinecap={i === 0 ? "round" : "butt"} className="transition-all duration-700" />
      })}
      <text x={cx} y={cy - 8} textAnchor="middle" className="fill-foreground" fontSize={44} fontWeight={600}>{value}</text>
      <text x={cx} y={cy + 16} textAnchor="middle" className="fill-primary" fontSize={13}>{label}</text>
    </svg>
  )
}

