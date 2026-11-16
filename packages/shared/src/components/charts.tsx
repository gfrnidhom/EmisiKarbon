import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { fmtDate, num } from "@/lib/format"
import { t } from "@/lib/i18n"
import { InteractiveDonut } from "./interactive-charts"

const scopeConfig = {
  scope1: { label: t("Scope 1"), color: "var(--scope1)" },
  scope2: { label: t("Scope 2"), color: "var(--scope2)" },
  scope3: { label: t("Scope 3"), color: "var(--scope3)" },
} satisfies ChartConfig

export function ScopeTrendChart({ data, onPick, height = 260 }: { data: any[]; onPick?: (date: string) => void; height?: number }) {
  return (
    <ChartContainer config={scopeConfig} className="w-full" style={{ height }}>
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }} onClick={(e: any) => e?.activeLabel && onPick?.(e.activeLabel)}>
        <defs>
          {(["scope1", "scope2", "scope3"] as const).map((k) => (
            <linearGradient key={k} id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={`var(--color-${k})`} stopOpacity={0.55} />
              <stop offset="95%" stopColor={`var(--color-${k})`} stopOpacity={0.05} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="2 7" stroke="var(--border)" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={(v) => fmtDate(v, { day: "numeric", month: "short" })} />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => num(v)} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => fmtDate(String(v), { weekday: "long", day: "numeric", month: "long" })} formatter={(v, n) => (
          <div className="flex w-full justify-between gap-4"><span className="text-muted-foreground">{scopeConfig[n as keyof typeof scopeConfig]?.label}</span><span className="font-mono">{num(Number(v), 1)} {t("kg")}</span></div>
        )} />} />
        <Area dataKey="scope3" stackId="a" type="monotone" stroke="var(--color-scope3)" fill="url(#g-scope3)" strokeWidth={2.5} strokeLinecap="round" isAnimationActive={false}/>
        <Area dataKey="scope2" stackId="a" type="monotone" stroke="var(--color-scope2)" fill="url(#g-scope2)" strokeWidth={2.5} strokeLinecap="round" isAnimationActive={false}/>
        <Area dataKey="scope1" stackId="a" type="monotone" stroke="var(--color-scope1)" fill="url(#g-scope1)" strokeWidth={2.5} strokeLinecap="round" isAnimationActive={false}/>
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  )
}

/** Donut — memakai donut interaktif berujung bulat yang sama dengan dasbor. */
export function DonutChart({ data, height = 220, centerLabel, centerValue }: { data: { key: string; label: string; value: number; color: string }[]; height?: number; centerLabel?: string; centerValue?: string }) {
  return <InteractiveDonut data={data} size={height} centerLabel={centerLabel ?? ""} centerValue={centerValue ?? num(data.reduce((s, d) => s + d.value, 0))} />
}

export function BarsChart({ data, xKey, bars, height = 240, xFormat }: { data: any[]; xKey: string; bars: { key: string; label: string; color: string; stack?: string }[]; height?: number; xFormat?: (v: any) => string }) {
  const config = Object.fromEntries(bars.map((b) => [b.key, { label: b.label, color: b.color }])) as ChartConfig
  const single = bars.length === 1 && !bars[0].stack
  const maxIdx = single ? data.reduce((m, r, i) => ((r[bars[0].key] ?? 0) > (data[m]?.[bars[0].key] ?? 0) ? i : m), 0) : -1
  const stacked = bars.filter((b) => b.stack)
  return (
    <ChartContainer config={config} className="w-full" style={{ height }}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 6" />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={10} tickFormatter={xFormat} />
        <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v) => num(v)} />
        <ChartTooltip cursor={{ fill: "var(--muted)", radius: 12 } as any} content={<ChartTooltipContent />} />
        {bars.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
        {bars.map((b) => {
          const top = !b.stack || stacked[stacked.length - 1]?.key === b.key
          return (
            <Bar key={b.key} dataKey={b.key} stackId={b.stack} fill={`var(--color-${b.key})`} maxBarSize={44} radius={top ? [999, 999, b.stack ? 0 : 999, b.stack ? 0 : 999] : 0} isAnimationActive={false}>
              {single && data.map((_, i) => <Cell key={i} fill={i === maxIdx ? "var(--primary-deep)" : `var(--color-${b.key})`} />)}
            </Bar>
          )
        })}
      </BarChart>
    </ChartContainer>
  )
}

export function GrowthChart({ data, height = 260, field = "dbh", unit = "cm" }: { data: any[]; height?: number; field?: "dbh" | "stock"; unit?: string }) {
  const rows = data.map((d) => ({ ...d, proj: d.label === "proyeksi" ? d[field] : null, meas: d.label !== "proyeksi" ? d[field] : null, point: d.measured ? d[field] : null }))
  // sambungkan garis proyeksi dengan titik terakhir terukur
  const firstProj = rows.findIndex((r) => r.proj !== null)
  if (firstProj > 0) rows[firstProj - 1].proj = rows[firstProj - 1].meas
  const config = { meas: { label: t("Terukur / rekonsiliasi"), color: "var(--leaf)" }, proj: { label: t("Proyeksi riap"), color: "var(--muted-foreground)" }, point: { label: t("Pengukuran"), color: "var(--primary)" } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="w-full" style={{ height }}>
      <ComposedChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="2 7" stroke="var(--border)" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} tickFormatter={(v) => fmtDate(v, { month: "short", year: "2-digit" })} />
        <YAxis tickLine={false} axisLine={false} width={44} domain={["auto", "auto"]} tickFormatter={(v) => num(v, field === "dbh" ? 1 : 0)} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => fmtDate(String(v))} formatter={(v, n) => v === null ? null : <div className="flex w-full justify-between gap-4"><span className="text-muted-foreground">{config[n as keyof typeof config]?.label}</span><span className="font-mono">{num(Number(v), field === "dbh" ? 2 : 1)} {unit}</span></div>} />} />
        <Line dataKey="meas" type="monotone" stroke="var(--color-meas)" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
        <Line dataKey="proj" type="monotone" stroke="var(--color-proj)" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls isAnimationActive={false} />
        <Line dataKey="point" stroke="transparent" dot={{ r: 4, fill: "var(--color-point)", stroke: "var(--card)", strokeWidth: 2 }} activeDot={false} isAnimationActive={false} />
        <ChartLegend content={<ChartLegendContent />} />
      </ComposedChart>
    </ChartContainer>
  )
}

export function MiniArea({ data, dataKey, height = 48, color = "var(--primary)" }: { data: any[]; dataKey: string; height?: number; color?: string }) {
  return (
    <ChartContainer config={{ [dataKey]: { label: dataKey, color } }} className="w-full" style={{ height }}>
      <AreaChart data={data} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
        <Area dataKey={dataKey} type="monotone" stroke={color} fill={color} fillOpacity={0.15} strokeWidth={1.5} dot={false}  isAnimationActive={false}/>
      </AreaChart>
    </ChartContainer>
  )
}
