import { SCOPE_INFO, kg } from "@/lib/format"
import { tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const DOT = { 1: "var(--scope1)", 2: "var(--scope2)", 3: "var(--scope3)" } as const

/** Judul kelompok scope yang sama di semua halaman (urutan Scope 1 → 2 → 3). */
export function ScopeHeading({ scope, totalKg, className, compact }: { scope: 1 | 2 | 3; totalKg?: number; className?: string; compact?: boolean }) {
  const s = SCOPE_INFO[scope]
  return (
    <div className={cn("flex items-center gap-2 text-xs", className)} title={tl(s.descId, s.descEn)}>
      <span className="size-2 shrink-0 rounded-full" style={{ background: DOT[scope] }} />
      <span className="font-semibold tracking-wide text-foreground/80 uppercase">{tl(s.id, s.en)}</span>
      {!compact && <span className="hidden truncate text-muted-foreground sm:inline">· {tl(s.descId, s.descEn)}</span>}
      {totalKg !== undefined && <span className="ml-auto shrink-0 font-semibold tabular-nums text-foreground/80">{kg(totalKg, 0)}</span>}
    </div>
  )
}
