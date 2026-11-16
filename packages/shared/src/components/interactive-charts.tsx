// Komponen grafik interaktif: angka beranimasi, sparkline, penjelajah emisi (brush/toggle/crosshair),
// donut interaktif, heatmap kalender, gauge, dan diverging bar.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Area, Bar, Brush, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, AreaChart } from "recharts"
import { fmtDate, num, pct, SOURCES } from "@/lib/format"
import { tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// ---------------- angka beranimasi ----------------
export function useCountUp(target: number, duration = 900) {
  const [v, setV] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    const start = performance.now(), a = from.current
    let raf = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      const e = 1 - Math.pow(1 - p, 3)
      setV(a + (target - a) * e)
      if (p < 1) raf = requestAnimationFrame(step)
      else from.current = target
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return v
}
export function CountUp({ value, format }: { value: number; format: (v: number) => string }) {
  const v = useCountUp(value)
  return <>{format(v)}</>
}

// ---------------- sparkline ----------------
export function Sparkline({ data, color = "var(--primary)", height = 44, id }: { data: number[]; color?: string; height?: number; id: string }) {
  const rows = data.map((v, i) => ({ i, v }))
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs><linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.35} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
          <Area dataKey="v" type="monotone" stroke={color} strokeWidth={1.8} fill={`url(#sp-${id})`} dot={false} animationDuration={700} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------------- penjelajah emisi ----------------
export type ExplorerMode = "scope" | "source" | "total"
export interface ExplorerDay { date: string; total: number; type: string; baseline: number | null; scope: Record<string, number>; sources: Record<string, { kg: number; label: string }> }
const SCOPE_SERIES = [
  { key: "scope1", label: "Scope 1", color: "var(--scope1)" },
  { key: "scope2", label: "Scope 2", color: "var(--scope2)" },
  { key: "scope3", label: "Scope 3", color: "var(--scope3)" },
]
export function EmissionExplorer({ days, mode, chartType, showBaseline, showAverage, focus, onPick, height = 340, monthly = false }: {
  days: ExplorerDay[]; mode: ExplorerMode; chartType: "area" | "bar"; showBaseline: boolean; showAverage: boolean; focus?: string | null; onPick?: (date: string) => void; height?: number; monthly?: boolean
}) {
  const series = useMemo(() => {
    if (mode === "scope") return SCOPE_SERIES
    if (mode === "total") return [{ key: "total", label: tl("Total emisi", "Total emissions"), color: "var(--primary)" }]
    const keys = new Set<string>()
    for (const d of days) for (const [k, v] of Object.entries(d.sources)) if (v.kg > 0) keys.add(k)
    return [...keys].sort((a, b) => days.reduce((s, d) => s + (d.sources[b]?.kg ?? 0), 0) - days.reduce((s, d) => s + (d.sources[a]?.kg ?? 0), 0))
      .map((k) => ({ key: k, label: SOURCES[k]?.label ?? k, color: SOURCES[k]?.color ?? "gray" }))
  }, [days, mode])
  const rows = useMemo(() => days.map((d) => {
    const r: any = { date: d.date, total: d.total, baseline: !monthly && (d.type === "libur" || !d.total) ? null : d.baseline, type: d.type }
    if (mode === "scope") { r.scope1 = d.scope[1]; r.scope2 = d.scope[2]; r.scope3 = d.scope[3] }
    else if (mode === "source") for (const s of series) r[s.key] = d.sources[s.key]?.kg ?? 0
    return r
  }), [days, mode, series, monthly])
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [hover, setHover] = useState<string | null>(null)
  useEffect(() => setHidden(new Set()), [mode])
  const active = hover ?? focus ?? null
  const visible = series.filter((s) => !hidden.has(s.key))
  const avg = rows.length ? rows.reduce((s, r) => s + visible.reduce((a, v) => a + (r[v.key] ?? 0), 0), 0) / rows.length : 0
  const toggle = (k: string) => setHidden((h) => { const n = new Set(h); n.has(k) ? n.delete(k) : n.add(k); if (n.size === series.length) n.delete(k); return n })
  const opacity = (k: string) => (active && active !== k ? 0.18 : 1)
  const long = rows.length > 45

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {series.map((s) => (
          <button key={s.key} onClick={() => toggle(s.key)} onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}
            className={cn("group inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all", hidden.has(s.key) ? "bg-transparent text-muted-foreground line-through opacity-60 ring-1 ring-border" : "bg-muted/70 hover:bg-muted", active === s.key && "ring-2 ring-primary/30")}>
            <span className="size-3 rounded-full transition-transform group-hover:scale-125" style={{ background: hidden.has(s.key) ? "transparent" : s.color, border: `2px solid ${s.color}` }} />
            {s.label}
          </button>
        ))}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 10, right: 12, left: 0, bottom: 0 }} barCategoryGap={rows.length > 20 ? "18%" : "26%"} onClick={(e: any) => e?.activeLabel && onPick?.(String(e.activeLabel))}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`ex-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.42} /><stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="2 7" stroke="var(--border)" />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={10} minTickGap={28} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => fmtDate(v, monthly || long ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" })} />
            <YAxis tickLine={false} axisLine={false} width={48} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => (v >= 1000 ? `${num(v / 1000, 1)}t` : num(v))} />
            <Tooltip cursor={chartType === "bar" ? ({ fill: "var(--muted)", fillOpacity: 0.8, radius: 14 } as any) : { stroke: "var(--primary)", strokeOpacity: 0.5, strokeWidth: 1.5, strokeDasharray: "4 4" }} content={<ExplorerTooltip series={visible} monthly={monthly} />} />
            {visible.map((s) => chartType === "bar"
              ? <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} fillOpacity={opacity(s.key)} maxBarSize={52}
                  radius={visible.length === 1 ? [999, 999, 999, 999] : s.key === visible[visible.length - 1].key ? [999, 999, 0, 0] : s.key === visible[0].key ? [0, 0, 999, 999] : 0} animationDuration={650} />
              : <Area key={s.key} dataKey={s.key} stackId="a" type="monotone" stroke={s.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={opacity(s.key)} fill={`url(#ex-${s.key})`} fillOpacity={opacity(s.key)} activeDot={{ r: 5, strokeWidth: 3, stroke: "var(--card)" }} animationDuration={750} />)}
            {showBaseline && <Line dataKey="baseline" type="monotone" connectNulls stroke="var(--foreground)" strokeOpacity={0.45} strokeWidth={2} strokeLinecap="round" strokeDasharray="1 7" dot={false} activeDot={false} animationDuration={600} />}
            {showAverage && <ReferenceLine y={avg} stroke="var(--primary)" strokeDasharray="2 4" label={{ value: `${tl("rata-rata", "avg")} ${num(avg, 0)} kg`, position: "insideTopRight", fontSize: 11, fill: "var(--primary)" }} />}
            {rows.length > (monthly ? 8 : 14) && <Brush dataKey="date" height={20} travellerWidth={10} stroke="color-mix(in srgb, var(--primary) 45%, transparent)" fill="var(--muted)" tickFormatter={(v) => fmtDate(String(v), monthly ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" })} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
function ExplorerTooltip({ active, payload, label, series, monthly }: any) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const items = series.map((s: any) => ({ ...s, v: row[s.key] ?? 0 })).filter((s: any) => s.v > 0).sort((a: any, b: any) => b.v - a.v)
  const total = items.reduce((s: number, i: any) => s + i.v, 0)
  const vsB = row.baseline ? total / row.baseline - 1 : null
  return (
    <div className="min-w-56 rounded-2xl bg-popover/95 p-3.5 text-xs shadow-xl ring-1 ring-border backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-semibold">{fmtDate(String(label), monthly ? { month: "long", year: "numeric" } : { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[0.625rem] font-medium capitalize", row.type === "libur" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}>{row.type}</span>
      </div>
      <div className="space-y-1.5">
        {items.map((i: any) => (
          <div key={i.key} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: i.color }} />
            <span className="truncate text-muted-foreground">{i.label}</span>
            <span className="font-mono tabular">{num(i.v, 1)}</span>
            <span className="w-9 text-right text-[0.625rem] text-muted-foreground">{pct(total ? i.v / total : 0)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between border-t pt-2 font-semibold"><span>Total</span><span className="font-mono">{num(total, 1)} kg CO₂e</span></div>
      {vsB !== null && <div className={cn("mt-1 text-right text-[0.6875rem] font-medium", vsB <= 0 ? "text-emerald-600" : "text-amber-600")}>{vsB > 0 ? "+" : ""}{num(vsB * 100, 1)}% vs baseline</div>}
      <div className="mt-1.5 text-[0.625rem] text-muted-foreground">{monthly ? tl("Klik untuk rincian bulan", "Click for monthly details") : tl("Klik untuk menelusuri angka", "Click to trace the numbers")}</div>
    </div>
  )
}

// ---------------- donut interaktif (SVG murni) ----------------
export function InteractiveDonut({ data, size = 220, centerLabel, centerValue, onSelect, selected }: {
  data: { key: string; label: string; value: number; color: string }[]; size?: number; centerLabel: string; centerValue: string; onSelect?: (k: string | null) => void; selected?: string | null
}) {
  const [hover, setHover] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const t = setTimeout(() => setMounted(true), 30); return () => clearTimeout(t) }, [])
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  const R = size / 2, w = R * 0.24, rm = R * 0.84 - w / 2
  const cap = w / 2 / rm, gap = 0.035
  let acc = -Math.PI / 2
  const arcs = data.map((d) => {
    const a0 = acc, a1 = acc + (d.value / total) * Math.PI * 2 * (mounted ? 1 : 0.0001)
    acc = a1
    return { ...d, a0, a1 }
  })
  const focusKey = hover ?? selected ?? null
  const f = data.find((d) => d.key === focusKey)
  const arc = (a0: number, a1: number, rr: number) => {
    const p = (a: number) => `${R + rr * Math.cos(a)},${R + rr * Math.sin(a)}`
    return `M${p(a0)} A${rr},${rr} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`
  }
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="overflow-visible">
        <circle cx={R} cy={R} r={rm} fill="none" stroke="var(--muted)" strokeWidth={w} opacity={0.6} />
        {arcs.map((a) => {
          const on = focusKey === a.key, mid = (a.a0 + a.a1) / 2, push = on ? 5 : 0
          const span = a.a1 - a.a0, round = span > 2 * cap + gap * 2
          const s0 = a.a0 + (round ? cap + gap / 2 : gap / 4), s1 = a.a1 - (round ? cap + gap / 2 : gap / 4)
          if (s1 <= s0) return null
          return (
            <path key={a.key} d={arc(s0, s1, rm)} fill="none" stroke={a.color} strokeWidth={on ? w + 6 : w} strokeLinecap={round ? "round" : "butt"}
              opacity={focusKey && !on ? 0.3 : 1} transform={`translate(${Math.cos(mid) * push},${Math.sin(mid) * push})`}
              style={{ transition: "all 450ms cubic-bezier(.2,.8,.2,1)", cursor: "pointer" }}
              onMouseEnter={() => setHover(a.key)} onMouseLeave={() => setHover(null)} onClick={() => onSelect?.(selected === a.key ? null : a.key)} />
          )
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {f ? (
          <>
            <span className="max-w-[60%] truncate text-xs text-muted-foreground">{f.label}</span>
            <span className="text-xl font-semibold tabular">{num(f.value / 1000, 2)} t</span>
            <span className="text-xs font-medium" style={{ color: f.color }}>{pct(f.value / total, 1)}</span>
          </>
        ) : (
          <><span className="text-xl font-semibold tabular">{centerValue}</span><span className="text-xs text-muted-foreground">{centerLabel}</span></>
        )}
      </div>
    </div>
  )
}

// ---------------- heatmap kalender ----------------
/** Heatmap ala GitHub yang mengisi lebar kartu: kolom = minggu, baris = Sen..Min.
 *  Skala warna memakai rentang hari aktif (persentil 5–95) agar variasi terlihat; hari libur abu-abu netral. */
export function CalendarHeatmap({ days, onPick }: { days: { date: string; total: number; type: string; k?: number }[]; onPick?: (d: string) => void }) {
  const [hover, setHover] = useState<{ d: any; x: number; y: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const isOff = (d: { type: string; k?: number }) => d.type === "libur" || d.k === 0
  const active = days.filter((d) => !isOff(d)).map((d) => d.total).sort((a, b) => a - b)
  const q = (p: number) => active.length ? active[Math.min(active.length - 1, Math.max(0, Math.round(p * (active.length - 1))))] : 0
  const lo = q(0.05), hi = Math.max(q(0.95), lo + 1)
  const LEVELS = [22, 40, 58, 76, 94]
  const level = (v: number) => Math.min(4, Math.max(0, Math.floor(((v - lo) / (hi - lo)) * 5)))
  const color = (d: { total: number; type: string; k?: number }) => isOff(d) ? "var(--muted)" : `color-mix(in srgb, var(--primary) ${LEVELS[level(d.total)]}%, var(--card))`

  // susun kolom per minggu (Senin di atas)
  type Cell = (typeof days)[number] | null
  const weeks: Cell[][] = []
  let week: Cell[] = []
  if (days.length) { const dow = (new Date(days[0].date + "T00:00:00Z").getUTCDay() + 6) % 7; for (let i = 0; i < dow; i++) week.push(null) }
  for (const d of days) { week.push(d); if (week.length === 7) { weeks.push(week); week = [] } }
  if (week.length) weeks.push([...week, ...Array(7 - week.length).fill(null)])
  // label bulan: satu kali per bulan, di kolom yang memuat tanggal 1
  const monthStart = weeks.map((w) => w.find((c) => c && c.date.endsWith("-01"))?.date ?? null)
  const firstStart = monthStart.findIndex(Boolean)
  const monthLabel = weeks.map((w, i) => {
    if (monthStart[i]) return fmtDate(monthStart[i]!, { month: "short" }).replace(".", "")
    // kolom pertama diberi label bulan berjalan bila ada ruang sebelum label berikutnya
    if (i === 0 && (firstStart === -1 || firstStart >= 3)) return fmtDate(w.find(Boolean)!.date, { month: "short" }).replace(".", "")
    return ""
  })
  const DOW = tl("Sen,Sel,Rab,Kam,Jum,Sab,Min", "Mon,Tue,Wed,Thu,Fri,Sat,Sun").split(",")
  const cols = `2.25rem repeat(${weeks.length}, minmax(0, 1fr))`
  const peak = days.reduce((a, b) => (b.total > (a?.total ?? -1) ? b : a), days[0])
  const avgActive = active.length ? active.reduce((s, v) => s + v, 0) / active.length : 0

  return (
    <div ref={box} className="relative space-y-4">
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: cols }}>
        <span />
        {monthLabel.map((m, i) => <span key={i} className="truncate text-[0.625rem] font-medium text-muted-foreground">{m}</span>)}
        {DOW.map((dn, r) => (
          <div key={dn} className="contents">
            <span className={cn("flex items-center text-[0.625rem] text-muted-foreground", r % 2 === 1 && "opacity-0 sm:opacity-100")}>{dn}</span>
            {weeks.map((w, c) => {
              const d = w[r]
              return d ? (
                <button key={c} aria-label={d.date} onClick={() => onPick?.(d.date)}
                  className="aspect-square w-full rounded-[0.1875rem] transition-all duration-150 hover:z-10 hover:scale-[1.35] hover:shadow-md hover:ring-2 hover:ring-primary/50"
                  style={{ background: color(d) }}
                  onMouseEnter={(e) => { const r0 = e.currentTarget.getBoundingClientRect(), p = box.current!.getBoundingClientRect(); setHover({ d, x: r0.left - p.left + r0.width / 2, y: r0.top - p.top }) }}
                  onMouseLeave={() => setHover(null)} />
              ) : <span key={c} />
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-[0.6875rem] text-muted-foreground">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <span>{tl("Rata-rata hari aktif", "Avg active day")} <b className="text-foreground tabular">{num(avgActive, 0)} kg</b></span>
          {peak && <button className="hover:text-foreground" onClick={() => onPick?.(peak.date)}>{tl("Puncak", "Peak")} <b className="text-foreground tabular">{num(peak.total, 0)} kg</b> · {fmtDate(peak.date, { day: "numeric", month: "short" })}</button>}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="mr-1 inline-flex items-center gap-1"><span className="size-3 rounded-[0.1875rem] bg-muted ring-1 ring-border" />{tl("Libur", "Holiday")}</span>
          <span className="tabular">{num(lo, 0)}</span>
          {LEVELS.map((l) => <span key={l} className="size-3 rounded-[0.1875rem]" style={{ background: `color-mix(in srgb, var(--primary) ${l}%, var(--card))` }} />)}
          <span className="tabular">{num(hi, 0)} kg</span>
        </div>
      </div>
      {hover && (
        <div className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg ring-1 ring-border" style={{ left: hover.x, top: hover.y - 6 }}>
          <b className="tabular">{num(hover.d.total, 1)} kg CO₂e</b>
          <span className="text-muted-foreground"> · {fmtDate(hover.d.date, { weekday: "short", day: "numeric", month: "short" })} · <span className="capitalize">{hover.d.type}</span></span>
        </div>
      )}
    </div>
  )
}

// ---------------- gauge setengah lingkaran ----------------
export function Gauge({ value, baseline, target, unit, size = 240, children }: { value: number; baseline: number | null; target?: number | null; unit: string; size?: number; children?: ReactNode }) {
  const max = Math.max(value, baseline ?? 0, 0.0001) * 1.35
  const v = useCountUp(value)
  const R = size / 2 - 14, cx = size / 2, cy = size / 2
  const pt = (x: number) => { const a = Math.PI * (1 - Math.min(x / max, 1)); return [cx + R * Math.cos(a), cy - R * Math.sin(a)] }
  const arc = (x: number) => { const [ex, ey] = pt(x); return `M${cx - R},${cy} A${R},${R} 0 0 1 ${ex},${ey}` }
  const good = baseline ? value <= baseline : true
  const tick = (x: number | null | undefined, color: string, label: string) => {
    if (!x) return null
    const a = Math.PI * (1 - Math.min(x / max, 1)), [x1, y1] = [cx + (R - 12) * Math.cos(a), cy - (R - 12) * Math.sin(a)], [x2, y2] = [cx + (R + 12) * Math.cos(a), cy - (R + 12) * Math.sin(a)]
    return <g><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={2.5} strokeLinecap="round" /><text x={x2 + (Math.cos(a) * 4)} y={y2 - 4} fontSize={10} textAnchor="middle" fill={color}>{label}</text></g>
  }
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 26} className="overflow-visible">
        <defs><linearGradient id="gauge-g" x1="0" x2="1"><stop offset="0%" stopColor="var(--leaf)" /><stop offset="100%" stopColor={good ? "var(--primary)" : "oklch(0.75 0.16 70)"} /></linearGradient></defs>
        <path d={`M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}`} fill="none" stroke="var(--muted)" strokeWidth={16} strokeLinecap="round" />
        <path d={arc(v)} fill="none" stroke="url(#gauge-g)" strokeWidth={16} strokeLinecap="round" />
        {tick(baseline, "var(--foreground)", "baseline")}
        {tick(target, "var(--primary)", tl("target", "target"))}
        <text x={cx} y={cy - 12} textAnchor="middle" className="fill-foreground" fontSize={30} fontWeight={600}>{num(v, 3)}</text>
        <text x={cx} y={cy + 8} textAnchor="middle" className="fill-muted-foreground" fontSize={11}>{unit}</text>
      </svg>
      {children}
    </div>
  )
}

// ---------------- diverging bar (perubahan vs baseline) ----------------
export function DivergingBars({ items, onPick }: { items: { key: string; label: string; color: string; change: number | null; value: string }[]; onPick?: (k: string) => void }) {
  const lim = Math.max(0.1, ...items.map((i) => Math.abs(i.change ?? 0)))
  return (
    <div className="space-y-2.5">
      {items.map((i) => {
        const w = i.change === null ? 0 : (Math.abs(i.change) / lim) * 50
        const down = (i.change ?? 0) < 0
        return (
          <button key={i.key} onClick={() => onPick?.(i.key)} className="group grid w-full grid-cols-[130px_1fr_70px] items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60 sm:grid-cols-[170px_1fr_80px]">
            <span className="flex min-w-0 items-center gap-2 text-sm"><span className="size-2.5 shrink-0 rounded-full" style={{ background: i.color }} /><span className="truncate">{i.label}</span></span>
            <span className="relative h-6 rounded-md bg-muted/50">
              <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
              <span className={cn("absolute inset-y-1 rounded-sm transition-all duration-700 ease-out group-hover:brightness-110", down ? "right-1/2 bg-emerald-500/80" : "left-1/2 bg-amber-500/80")} style={{ width: `${w}%` }} />
            </span>
            <span className="text-right text-sm"><span className={cn("font-semibold tabular", i.change === null ? "text-muted-foreground" : down ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600")}>{i.change === null ? "–" : `${i.change > 0 ? "+" : ""}${num(i.change * 100, 1)}%`}</span><span className="block text-[0.625rem] text-muted-foreground">{i.value}</span></span>
          </button>
        )
      })}
    </div>
  )
}
