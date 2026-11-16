import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeft, ArrowRight, Check, Info, Minus, Plus, Save, Users, X } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ErrorState, PageSkeleton, Spinner } from "@/components/common"
import { api } from "@/lib/api"
import { fmtMonth, num, pct, todayWIB } from "@/lib/format"
import { tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { APPLIANCE_ICON, Cylinder, DEFAULT_DATA, FLIGHT_ICON, FOOD_ICON, Footprints, ITEM_ICON, METHOD_ICON, MODE_ICON, SECTORS, sectorLabel, STEP_ICON, type FootprintData } from "./lib"

const STEPS = [
  { k: "home", id: "Rumah", en: "Home", sectors: ["home"] },
  { k: "transport", id: "Transportasi", en: "Transport", sectors: ["transport"] },
  { k: "flight", id: "Penerbangan", en: "Flights", sectors: ["flight"] },
  { k: "food", id: "Makanan", en: "Food", sectors: ["food"] },
  { k: "waste", id: "Sampah", en: "Waste", sectors: ["waste"] },
  { k: "result", id: "Hasil", en: "Result", sectors: [] as string[] },
] as const

function Stepper({ value, onChange, step = 1, max = 99, suffix }: { value: number; onChange: (v: number) => void; step?: number; max?: number; suffix?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Button type="button" size="icon-sm" variant="outline" onClick={() => onChange(Math.max(0, +(value - step).toFixed(2)))} aria-label="−"><Minus /></Button>
      <Input type="number" inputMode="decimal" min={0} max={max} step="any" value={value} onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))} className="h-9 w-16 rounded-full px-2 text-center font-semibold tabular" />
      <Button type="button" size="icon-sm" variant="outline" onClick={() => onChange(Math.min(max, +(value + step).toFixed(2)))} aria-label="+"><Plus /></Button>
      {suffix && <span className="ml-1 text-xs text-muted-foreground">{suffix}</span>}
    </div>
  )
}
function Section({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return <div className="space-y-4"><div><h3 className="text-lg font-semibold">{title}</h3>{desc && <p className="text-sm text-muted-foreground">{desc}</p>}</div>{children}</div>
}
/** Kartu pilihan berikon (pengganti dropdown). */
function IconTile({ icon: I, label, sub, active, onClick, color = "var(--primary)" }: { icon: any; label: string; sub?: string; active?: boolean; onClick: () => void; color?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn("group relative flex flex-col items-center gap-2 rounded-2xl p-4 text-center transition-all", active ? "bg-primary/10 ring-2 ring-primary" : "bg-muted/50 hover:-translate-y-0.5 hover:bg-muted")}>
      {active && <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" /></span>}
      <span className={cn("flex size-14 items-center justify-center rounded-2xl transition-transform group-hover:scale-105", active ? "text-white" : "")} style={{ background: active ? color : `color-mix(in srgb, ${color} 14%, transparent)`, color: active ? undefined : color }}><I className="size-7" strokeWidth={1.8} /></span>
      <span className="text-sm leading-tight font-medium">{label}</span>
      {sub && <span className="text-[0.6875rem] leading-tight text-muted-foreground">{sub}</span>}
    </button>
  )
}
function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={cn("rounded-full px-4 py-2 text-sm transition-all", active ? "bg-primary font-medium text-primary-foreground shadow" : "bg-muted/60 hover:bg-muted")}>{children}</button>
}

/** Wizard modern: lingkaran ikon terhubung garis progres, dengan emisi tiap langkah. */
function WizardSteps({ step, setStep, kg }: { step: number; setStep: (i: number) => void; kg: (k: string) => number }) {
  return (
    <div className="rounded-3xl bg-card p-4 sm:p-5">
      <ol className="relative grid grid-cols-6">
        <span className="absolute top-6 right-[8.33%] left-[8.33%] h-1 rounded-full bg-muted" />
        <span className="absolute top-6 left-[8.33%] h-1 rounded-full bg-primary transition-all duration-500" style={{ width: `${(step / (STEPS.length - 1)) * 83.34}%` }} />
        {STEPS.map((s, i) => {
          const I = STEP_ICON[s.k]; const done = i < step, cur = i === step
          const val = s.sectors.reduce((a, k) => a + kg(k), 0)
          return (
            <li key={s.k} className="relative flex flex-col items-center">
              <button onClick={() => setStep(i)} aria-current={cur ? "step" : undefined} aria-label={tl(s.id, s.en)}
                className={cn("relative z-10 flex size-12 items-center justify-center rounded-full transition-all duration-300",
                  cur ? "scale-110 bg-primary text-primary-foreground shadow-lg ring-4 ring-primary/20" : done ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground ring-2 ring-border hover:text-foreground")}>
                <I className="size-5" />
                {done && <span className="absolute -right-0.5 -bottom-0.5 flex size-4.5 items-center justify-center rounded-full bg-card text-primary ring-2 ring-card"><Check className="size-3" /></span>}
              </button>
              <span className={cn("mt-2 hidden text-xs font-medium sm:block", cur ? "text-foreground" : "text-muted-foreground")}>{tl(s.id, s.en)}</span>
              {s.k !== "result" && <span className={cn("hidden text-[0.6875rem] tabular sm:block", val > 0 ? "text-primary" : "text-muted-foreground/60")}>{num(val, 0)} kg</span>}
            </li>
          )
        })}
      </ol>
      <div className="mt-3 text-center text-sm font-medium sm:hidden">{step + 1}/{STEPS.length} · {tl(STEPS[step].id, STEPS[step].en)}</div>
    </div>
  )
}

/** Kalkulator jejak karbon bertahap — hasil langsung terhitung di server dengan faktor resmi. */
export default function FootprintCalculator() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const { data: all, isLoading, error } = useQuery({ queryKey: ["footprint"], queryFn: () => api<any>("/me/footprint") })
  const period = params.get("bulan") ?? todayWIB().slice(0, 7)
  const [step, setStep] = useState(0)
  const [d, setD] = useState<FootprintData | null>(null)
  const [debounced, setDebounced] = useState<string>("")

  useEffect(() => {
    if (!all) return
    const e = all.entries.find((x: any) => x.period === period) ?? all.entries[all.entries.length - 1]
    setD(structuredClone(e?.data ?? DEFAULT_DATA))
  }, [all, period])
  useEffect(() => { if (!d) return; const id = setTimeout(() => setDebounced(JSON.stringify(d)), 250); return () => clearTimeout(id) }, [d])
  const preview = useQuery({ queryKey: ["footprint-preview", debounced], enabled: !!debounced, placeholderData: (p) => p, queryFn: () => api<any>("/me/footprint/preview", { method: "POST", json: { data: JSON.parse(debounced) } }) })
  const save = useMutation({
    mutationFn: () => api(`/me/footprint/${period}`, { method: "PUT", json: { data: d } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["footprint"] }); toast.success(tl(`Jejak karbon ${fmtMonth(period)} tersimpan`, `Footprint for ${fmtMonth(period)} saved`)); nav("/footprint") },
    onError: (e: Error) => toast.error(e.message),
  })
  const ref = all?.reference
  const res = preview.data
  const set = (patch: Partial<FootprintData>) => setD((x) => (x ? { ...x, ...patch } : x))
  const exists = useMemo(() => all?.entries.some((x: any) => x.period === period), [all, period])
  const kg = (k: string) => res?.sectors?.[k] ?? 0
  const itemKg = (key: string) => res?.items?.find((i: any) => i.key === key)?.kgMonth ?? 0

  if (isLoading || !d) return <PageSkeleton />
  if (error) return <ErrorState error={error} />
  const e = d.electricity
  const ap = e.appliances ?? {}
  const stepKey = STEPS[step].k
  const toggleMode = (k: string) => set({ transport: d.transport.some((t) => t.mode === k) ? d.transport.filter((t) => t.mode !== k) : [...d.transport, { mode: k, kmWeek: k === "sepeda" ? 10 : 30 }] })
  const addFlight = (band: string) => set({ flights: [...d.flights, { band, trips: 1, roundTrip: true }] })

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to="/footprint" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{tl("Ringkasan", "Overview")}</Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{tl("Hitung jejak karbonmu", "Calculate your footprint")}</h1>
          <p className="mt-1 text-muted-foreground">{tl("Ketuk ikon yang sesuai dengan kebiasaanmu. Perkiraan saja sudah cukup.", "Tap the icons that match your habits. Rough estimates are fine.")}</p>
        </div>
        <div className="flex items-center gap-2"><span className="text-sm text-muted-foreground">{tl("Bulan", "Month")}</span><Input type="month" value={period} max={todayWIB().slice(0, 7)} onChange={(ev) => ev.target.value && setParams({ bulan: ev.target.value }, { replace: true })} className="w-44" /></div>
      </div>

      <WizardSteps step={step} setStep={setStep} kg={kg} />

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardContent key={stepKey} className="animate-fade-up space-y-8 py-2">
            {stepKey === "home" && (
              <>
                <Section title={tl("Penghuni rumah", "Household")} desc={tl("Emisi rumah (listrik, LPG, sampah) dibagi rata ke semua penghuni.", "Home emissions (power, LPG, waste) are split across everyone at home.")}>
                  <div className="flex flex-wrap items-center gap-2">
                    {[1, 2, 3, 4, 5, 6].map((n) => <button key={n} type="button" onClick={() => set({ household: n })} className={cn("flex size-12 flex-col items-center justify-center rounded-2xl text-sm font-semibold transition-all", d.household === n ? "bg-primary text-primary-foreground shadow" : "bg-muted/60 hover:bg-muted")}><Users className="mb-0.5 size-3.5 opacity-70" />{n}</button>)}
                    <Stepper value={d.household} onChange={(v) => set({ household: Math.max(1, Math.round(v)) })} max={30} suffix={tl("orang", "people")} />
                  </div>
                </Section>
                <Section title={tl("Listrik rumah", "Home electricity")} desc={tl("Pilih cara yang paling mudah untukmu.", "Choose whichever is easiest for you.")}>
                  <div className="grid grid-cols-3 gap-3">
                    {([["kwh", "Saya tahu kWh", "I know the kWh", "dari struk/token"], ["tagihan", "Dari tagihan", "From my bill", "nominal rupiah"], ["alat", "Dari peralatan", "From appliances", "hitung per alat"]] as const).map(([k, a, b, s]) => (
                      <IconTile key={k} icon={METHOD_ICON[k]} label={tl(a, b)} sub={s} active={e.method === k} onClick={() => set({ electricity: { ...e, method: k } })} color="oklch(0.34 0.07 160)" />
                    ))}
                  </div>
                  {e.method === "kwh" && <div className="flex flex-wrap items-center gap-3"><Input type="number" min={0} value={e.kwh} onChange={(ev) => set({ electricity: { ...e, kwh: Math.max(0, Number(ev.target.value) || 0) } })} className="h-12 w-40 text-lg font-semibold" /><span className="text-sm text-muted-foreground">kWh/{tl("bulan", "month")}</span></div>}
                  {e.method === "tagihan" && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3"><span className="text-sm font-medium">Rp</span><Input type="number" min={0} step={1000} value={e.rupiah} onChange={(ev) => set({ electricity: { ...e, rupiah: Math.max(0, Number(ev.target.value) || 0) } })} className="h-12 w-48 text-lg font-semibold" /><span className="text-sm text-muted-foreground">/{tl("bulan", "month")} ≈ <b className="text-foreground">{num(res?.kwh ?? 0, 0)} kWh</b></span></div>
                      <div><div className="mb-2 text-sm font-medium">{tl("Daya / golongan", "Power class")}</div><div className="flex flex-wrap gap-2">{ref.tariffs.map((t: any) => <Chip key={t.k} active={e.tariff === t.k} onClick={() => set({ electricity: { ...e, tariff: t.k } })}>{t.label}</Chip>)}</div>
                        <p className="mt-2 text-xs text-muted-foreground">{tl("Tarif perkiraan", "Estimated tariff")} Rp {num(ref.tariffs.find((t: any) => t.k === e.tariff)?.rpPerKwh ?? 0, 0)}/kWh · {tl("cek tarif PLN terbaru", "check the latest PLN rates")}</p></div>
                    </div>
                  )}
                  {e.method === "alat" && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {ref.appliances.map((a: any) => {
                        const cur = ap[a.k] ?? { count: 0, hours: a.hours }; const I = APPLIANCE_ICON[a.k] ?? Cylinder
                        const upd = (p: Partial<typeof cur>) => set({ electricity: { ...e, appliances: { ...ap, [a.k]: { ...cur, ...p } } } })
                        return (
                          <div key={a.k} className={cn("space-y-2.5 rounded-2xl p-3.5 transition-colors", cur.count > 0 ? "bg-primary/8 ring-1 ring-primary/25" : "bg-muted/40")}>
                            <div className="flex items-center gap-3"><span className={cn("flex size-10 items-center justify-center rounded-xl", cur.count > 0 ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}><I className="size-5" /></span><div className="min-w-0"><div className="truncate text-sm font-medium">{a.label}</div><div className="text-xs text-muted-foreground">±{a.watt} W</div></div></div>
                            <div className="flex flex-wrap items-center gap-3"><Stepper value={cur.count} onChange={(v) => upd({ count: Math.round(v) })} max={50} suffix={tl("unit", "units")} />{cur.count > 0 && <Stepper value={cur.hours} onChange={(v) => upd({ hours: v })} max={24} suffix={tl("jam/hari", "h/day")} />}</div>
                          </div>
                        )
                      })}
                      <p className="text-xs text-muted-foreground sm:col-span-2">{tl("Total dari peralatan", "Appliance total")} ≈ <b className="text-foreground">{num(res?.applianceKwh ?? 0, 0)} kWh</b>/{tl("bulan", "month")}</p>
                    </div>
                  )}
                  <div><div className="mb-2 text-sm font-medium">{tl("Wilayah jaringan listrik", "Grid region")}</div>
                    <div className="flex flex-wrap gap-2">{ref.grids.map((g: any) => <Chip key={g.code} active={e.grid === g.code} onClick={() => set({ electricity: { ...e, grid: g.code } })}>{g.name.replace(/^(Listrik\s+)?(grid\s+)?/i, "").replace(/\s*\(.*\)/, "")} <span className="opacity-60">· {num(g.value, 2)}</span></Chip>)}</div></div>
                </Section>
                <Section title={tl("Gas LPG per bulan", "LPG per month")} desc={tl("Tabung melon = 3 kg, tabung biru = 12 kg.", "Small cylinder = 3 kg, blue cylinder = 12 kg.")}>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                    {[[0, "Tidak pakai"], [3, "1 × 3 kg"], [6, "2 × 3 kg"], [9, "3 × 3 kg"], [12, "1 × 12 kg"], [24, "2 × 12 kg"]].map(([v, l]) => (
                      <IconTile key={v} icon={Cylinder} label={`${v} kg`} sub={String(l)} active={d.lpg === v} onClick={() => set({ lpg: Number(v) })} color="oklch(0.62 0.15 40)" />
                    ))}
                  </div>
                </Section>
              </>
            )}

            {stepKey === "transport" && (
              <Section title={tl("Transportasi darat", "Ground transport")} desc={tl("Ketuk semua kendaraan yang kamu pakai, lalu atur jarak per minggunya.", "Tap every mode you use, then set its weekly distance.")}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {ref.transport.map((m: any) => <IconTile key={m.k} icon={MODE_ICON[m.k]} label={m.label} sub={m.factor ? `${num(m.factor, 3)} kg/km` : tl("tanpa emisi", "zero emissions")} active={d.transport.some((t) => t.mode === m.k)} onClick={() => toggleMode(m.k)} color={m.factor ? "oklch(0.55 0.12 155)" : "oklch(0.6 0.13 145)"} />)}
                </div>
                {d.transport.length > 0 && (
                  <div className="space-y-3">
                    {d.transport.map((t, i) => {
                      const m = ref.transport.find((x: any) => x.k === t.mode); const I = MODE_ICON[t.mode]
                      const upd = (p: any) => set({ transport: d.transport.map((x, j) => (j === i ? { ...x, ...p } : x)) })
                      return (
                        <div key={t.mode + i} className="rounded-2xl bg-muted/40 p-4">
                          <div className="flex items-center gap-3">
                            <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"><I className="size-5" /></span>
                            <div className="min-w-0 flex-1"><div className="font-medium">{m?.label}</div><div className="text-xs text-muted-foreground">{m?.per === "penumpang" && m.occupancy > 1 ? tl(`per penumpang (asumsi ${m.occupancy} penumpang)`, `per passenger (assuming ${m.occupancy})`) : m?.source}</div></div>
                            <span className="text-right text-sm font-semibold text-primary tabular">{num(itemKg(`tr-${t.mode}`), 1)}<span className="block text-[0.625rem] font-normal text-muted-foreground">kg/bln</span></span>
                            <Button size="icon-sm" variant="ghost" onClick={() => toggleMode(t.mode)} aria-label={tl("Hapus", "Remove")}><X /></Button>
                          </div>
                          <div className="mt-3 flex flex-wrap items-end gap-5">
                            <div className="min-w-56 flex-1"><div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>{tl("km per minggu", "km per week")}</span><b className="text-foreground tabular">{t.kmWeek} km</b></div>
                              <input type="range" className="range w-full" min={0} max={500} step={5} value={t.kmWeek} onChange={(ev) => upd({ kmWeek: Number(ev.target.value) })} style={{ ["--pct" as any]: `${(t.kmWeek / 500) * 100}%` }} /></div>
                            {m?.shareable && <div className="text-xs"><div className="mb-1 text-muted-foreground">{tl("Berbagi dengan", "Shared by")}</div><Stepper value={t.share ?? 1} onChange={(v) => upd({ share: Math.max(1, Math.round(v)) })} max={8} suffix={tl("orang", "people")} /></div>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Section>
            )}

            {stepKey === "flight" && (
              <Section title={tl("Penerbangan dalam setahun", "Flights in a year")} desc={tl("Ketuk jenis penerbangan untuk menambahkannya. Dihitung kelas ekonomi; emisi tahunan dibagi 12 bulan.", "Tap a flight type to add it. Economy class; yearly emissions are spread over 12 months.")}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {ref.flights.map((f: any) => { const [title, ex] = f.label.split(" ("); return <IconTile key={f.k} icon={FLIGHT_ICON[f.k]} label={title} sub={ex ? ex.replace(")", "") : `±${num(f.km)} km`} active={d.flights.some((x) => x.band === f.k)} onClick={() => addFlight(f.k)} color="oklch(0.55 0.1 230)" /> })}
                </div>
                {d.flights.length === 0 ? <p className="flex items-center gap-2 rounded-2xl bg-muted/40 p-4 text-sm text-muted-foreground"><Footprints className="size-4" />{tl("Tidak terbang tahun ini? Lewati saja langkah ini.", "Didn't fly this year? Just skip this step.")}</p> : (
                  <div className="space-y-3">
                    {d.flights.map((f, i) => {
                      const b = ref.flights.find((x: any) => x.k === f.band); const I = FLIGHT_ICON[f.band]
                      const upd = (p: any) => set({ flights: d.flights.map((x, j) => (j === i ? { ...x, ...p } : x)) })
                      return (
                        <div key={i} className="flex flex-wrap items-center gap-3 rounded-2xl bg-muted/40 p-4">
                          <span className="flex size-11 items-center justify-center rounded-xl text-white" style={{ background: "oklch(0.55 0.1 230)" }}><I className="size-5" /></span>
                          <div className="min-w-40 flex-1"><div className="font-medium">{b?.label.split(" (")[0]}</div><div className="text-xs text-muted-foreground">±{num(b?.km ?? 0)} km {tl("per penerbangan", "per flight")} · {num(itemKg(`fl-${f.band}`), 1)} kg/{tl("bln", "mo")}</div></div>
                          <Stepper value={f.trips} onChange={(v) => upd({ trips: Math.round(v) })} max={50} suffix={tl("kali/tahun", "times/yr")} />
                          <div className="flex rounded-full bg-card p-1 ring-1 ring-border">{[true, false].map((rt) => <button key={String(rt)} onClick={() => upd({ roundTrip: rt })} className={cn("rounded-full px-3 py-1.5 text-xs font-medium", f.roundTrip === rt ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{rt ? tl("Pulang-pergi", "Return") : tl("Sekali jalan", "One way")}</button>)}</div>
                          <Button size="icon-sm" variant="ghost" onClick={() => set({ flights: d.flights.filter((_, j) => j !== i) })} aria-label={tl("Hapus", "Remove")}><X /></Button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Section>
            )}

            {stepKey === "food" && (
              <Section title={tl("Makanan per minggu", "Food per week")} desc={tl("Ketuk + untuk jumlah porsi dalam seminggu. Daging merah punya jejak paling besar.", "Tap + for portions per week. Red meat has the largest footprint.")}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {ref.foods.map((f: any) => {
                    const v = d.food[f.k] ?? 0; const I = FOOD_ICON[f.k] ?? Footprints
                    const heavy = f.perPortion >= 1
                    return (
                      <div key={f.k} className={cn("flex flex-col items-center gap-2 rounded-2xl p-4 text-center transition-all", v > 0 ? "bg-primary/8 ring-1 ring-primary/25" : "bg-muted/40")}>
                        <span className="flex size-14 items-center justify-center rounded-2xl" style={{ background: `color-mix(in srgb, ${heavy ? "oklch(0.6 0.16 35)" : "oklch(0.6 0.13 145)"} ${v > 0 ? 100 : 15}%, transparent)`, color: v > 0 ? "white" : heavy ? "oklch(0.55 0.16 35)" : "oklch(0.5 0.13 145)" }}><I className="size-7" strokeWidth={1.8} /></span>
                        <div><div className="text-sm leading-tight font-medium">{f.label}</div><div className="text-[0.6875rem] text-muted-foreground">{f.portionLabel} · {num(f.perPortion, 2)} kg</div></div>
                        <Stepper value={v} onChange={(x) => set({ food: { ...d.food, [f.k]: Math.round(x) } })} max={50} />
                      </div>
                    )
                  })}
                </div>
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" />{ref.foods[0]?.source}</p>
              </Section>
            )}

            {stepKey === "waste" && (
              <Section title={tl("Sampah rumah", "Household waste")} desc={tl("Sampah organik di TPA menghasilkan metana. Mengompos jauh lebih rendah emisinya.", "Organic waste in landfill releases methane. Composting emits far less.")}>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                  {[[2, "Sedikit"], [5, "Sedang"], [8, "Banyak"], [12, "Sangat banyak"], [20, "Keluarga besar"]].map(([v, l]) => <IconTile key={v} icon={ITEM_ICON("sampah")} label={`${v} kg`} sub={`${l} /${tl("minggu", "week")}`} active={d.waste.kgWeek === v} onClick={() => set({ waste: { ...d.waste, kgWeek: Number(v) } })} color="oklch(0.62 0.09 112)" />)}
                </div>
                <div><div className="mb-1 flex justify-between text-sm"><span>{tl("Atau atur sendiri", "Or set your own")}</span><b className="tabular">{d.waste.kgWeek} kg/{tl("minggu", "week")}</b></div>
                  <input type="range" className="range w-full" min={0} max={40} step={0.5} value={d.waste.kgWeek} onChange={(ev) => set({ waste: { ...d.waste, kgWeek: Number(ev.target.value) } })} style={{ ["--pct" as any]: `${(d.waste.kgWeek / 40) * 100}%` }} /></div>
                <div><div className="mb-2 text-sm font-medium">{tl("Berapa yang dipilah/dikompos?", "How much is sorted/composted?")}</div>
                  <div className="flex flex-wrap gap-2">{[0, 25, 50, 75, 100].map((p) => <Chip key={p} active={d.waste.sortedPct === p} onClick={() => set({ waste: { ...d.waste, sortedPct: p } })}>{p}%</Chip>)}</div></div>
              </Section>
            )}

            {stepKey === "result" && res && (
              <Section title={tl("Hasil perhitungan", "Your result")} desc={`${fmtMonth(period)} · ${d.household} ${tl("orang di rumah", "people at home")}`}>
                <div className="grid gap-3 sm:grid-cols-5">
                  {Object.keys(SECTORS).map((k) => { const I = SECTORS[k].icon; return (
                    <button key={k} onClick={() => setStep(STEPS.findIndex((s) => (s.sectors as readonly string[]).includes(k)))} className="rounded-2xl bg-muted/50 p-3 text-center hover:bg-muted">
                      <I className="mx-auto size-6" style={{ color: SECTORS[k].color }} /><div className="mt-1.5 text-lg font-semibold tabular">{num(kg(k), 0)}</div><div className="truncate text-[0.6875rem] text-muted-foreground">{sectorLabel(k).split(" (")[0]}</div>
                    </button>
                  ) })}
                </div>
                <div className="space-y-1">
                  {[...res.items].sort((a: any, b: any) => b.kgMonth - a.kgMonth).map((i: any) => { const I = ITEM_ICON(i.key); return (
                    <div key={i.key} className="flex items-center gap-3 rounded-xl px-1 py-2">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${SECTORS[i.sector]?.color} 16%, transparent)`, color: SECTORS[i.sector]?.color }}><I className="size-4" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{i.label}</span><span className="block truncate text-xs text-muted-foreground">{i.detail}</span></span>
                      <span className="text-sm font-semibold tabular">{num(i.kgMonth, 1)} kg</span>
                    </div>
                  ) })}
                </div>
              </Section>
            )}

            <div className="flex items-center justify-between border-t pt-5">
              <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft /> {tl("Kembali", "Back")}</Button>
              {step < STEPS.length - 1
                ? <Button size="lg" onClick={() => setStep(step + 1)}>{tl("Lanjut", "Next")}: {tl(STEPS[step + 1].id, STEPS[step + 1].en)} <ArrowRight /></Button>
                : <Button size="lg" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? <Spinner /> : <Save />} {exists ? tl("Perbarui", "Update") : tl("Simpan hasil", "Save result")}</Button>}
            </div>
          </CardContent>
        </Card>

        {/* ---------- panel hasil langsung ---------- */}
        <div className="space-y-4 lg:sticky lg:top-24">
          <div className="relative overflow-hidden rounded-3xl bg-primary-deep p-6 text-white">
            <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: "repeating-radial-gradient(circle at 110% 120%, transparent 0 14px, rgb(255 255 255 / 0.05) 14px 16px)" }} />
            <div className="relative">
              <div className="flex items-center justify-between text-sm text-white/75">{tl("Perkiraan per bulan", "Monthly estimate")}{preview.isFetching && <Spinner />}</div>
              <div className="mt-1 flex items-baseline gap-2"><span className="text-5xl font-semibold tracking-tight tabular">{num(res?.total ?? 0, 0)}</span><span className="text-white/75">kg CO₂e</span></div>
              <div className="mt-1 text-sm text-white/75">≈ {num(((res?.total ?? 0) * 12) / 1000, 2)} t/{tl("tahun", "year")}</div>
            </div>
          </div>
          <Card>
            <CardContent className="space-y-3">
              {Object.keys(SECTORS).map((k) => { const I = SECTORS[k].icon; return (
                <button key={k} onClick={() => setStep(STEPS.findIndex((s) => (s.sectors as readonly string[]).includes(k)))} className="block w-full text-left">
                  <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><I className="size-4" style={{ color: SECTORS[k].color }} />{sectorLabel(k)}</span><b className="tabular">{num(kg(k), 0)} kg</b></div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${res?.total ? (kg(k) / res.total) * 100 : 0}%`, background: SECTORS[k].color }} /></div>
                </button>
              ) })}
              <p className="pt-1 text-xs text-muted-foreground">{res?.total ? `${sectorLabel([...Object.keys(SECTORS)].sort((a, b) => kg(b) - kg(a))[0])} ${tl("menyumbang", "makes up")} ${pct(Math.max(...Object.keys(SECTORS).map(kg)) / res.total, 0)}` : ""}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
