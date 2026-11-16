import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { CalendarRange, Check } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { addDays, fmtDate, todayWIB } from "@/lib/format"
import { tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export type PeriodKey = "today" | "yesterday" | "7d" | "1m" | "6m" | "1y" | "custom"
export type Period = { key: PeriodKey; start: string; end: string; label: string; days: number }

const PRESETS: { key: Exclude<PeriodKey, "custom">; id: string; en: string }[] = [
  { key: "today", id: "Hari ini", en: "Today" },
  { key: "yesterday", id: "Kemarin", en: "Yesterday" },
  { key: "7d", id: "1 minggu", en: "1 week" },
  { key: "1m", id: "1 bulan", en: "1 month" },
  { key: "6m", id: "6 bulan", en: "6 months" },
  { key: "1y", id: "1 tahun", en: "1 year" },
]

const monthsBack = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() - n); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10) }
const span = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1

export function resolvePeriod(key: PeriodKey, from?: string | null, to?: string | null): Period {
  const today = todayWIB()
  let start = today, end = today
  if (key === "yesterday") start = end = addDays(today, -1)
  else if (key === "7d") start = addDays(today, -6)
  else if (key === "1m") start = monthsBack(today, 1)
  else if (key === "6m") start = monthsBack(today, 6)
  else if (key === "1y") start = monthsBack(today, 12)
  else if (key === "custom" && from && to) { start = from <= to ? from : to; end = from <= to ? to : from; if (end > today) end = today }
  const p = PRESETS.find((x) => x.key === key)
  const label = p ? tl(p.id, p.en) : start === end ? fmtDate(start) : `${fmtDate(start)} – ${fmtDate(end)}`
  return { key, start, end, label, days: span(start, end) }
}

/** Periode tersimpan di URL (?range=7d atau ?range=custom&from=…&to=…) agar bisa dibagikan & bertahan saat muat ulang. */
export function usePeriod(defaultKey: PeriodKey = "1m") {
  const [params, setParams] = useSearchParams()
  const raw = params.get("range") as PeriodKey | null
  const key: PeriodKey = raw && (raw === "custom" || PRESETS.some((p) => p.key === raw)) ? raw : defaultKey
  const period = resolvePeriod(key, params.get("from"), params.get("to"))
  const set = (k: PeriodKey, from?: string, to?: string) => {
    const next = new URLSearchParams(params)
    next.set("range", k)
    if (k === "custom" && from && to) { next.set("from", from); next.set("to", to) } else { next.delete("from"); next.delete("to") }
    setParams(next, { replace: true })
  }
  return [period, set] as const
}

/** Pilihan periode: Hari ini · Kemarin · 1 minggu · 1 bulan · 6 bulan · 1 tahun · Kustom. */
export function PeriodFilter({ value, onChange, className }: { value: Period; onChange: (k: PeriodKey, from?: string, to?: string) => void; className?: string }) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(value.start)
  const [to, setTo] = useState(value.end)
  const today = todayWIB()
  const pill = (active: boolean) => cn("inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition-colors", active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")
  return (
    <div className={cn("flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-card p-1 ring-1 ring-border [scrollbar-width:none]", className)} role="group" aria-label={tl("Periode", "Period")}>
      {PRESETS.map((p) => <button key={p.key} type="button" className={pill(value.key === p.key)} onClick={() => onChange(p.key)}>{tl(p.id, p.en)}</button>)}
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setFrom(value.start); setTo(value.end) } }}>
        <PopoverTrigger render={<button type="button" className={pill(value.key === "custom")} />}>
          <CalendarRange className="size-4" />{value.key === "custom" ? value.label : tl("Kustom", "Custom")}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3">
          <div className="text-sm font-semibold">{tl("Rentang kustom", "Custom range")}</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs text-muted-foreground">{tl("Dari", "From")}<Input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} className="h-9" /></label>
            <label className="space-y-1 text-xs text-muted-foreground">{tl("Sampai", "To")}<Input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="h-9" /></label>
          </div>
          {from && to && <p className="text-xs text-muted-foreground">{span(from, to)} {tl("hari", "days")}{span(from, to) > 800 ? tl(" · maksimal 800 hari", " · max 800 days") : ""}</p>}
          <Button className="w-full" disabled={!from || !to || from > to || span(from, to) > 800} onClick={() => { onChange("custom", from, to); setOpen(false) }}><Check /> {tl("Terapkan", "Apply")}</Button>
        </PopoverContent>
      </Popover>
    </div>
  )
}
