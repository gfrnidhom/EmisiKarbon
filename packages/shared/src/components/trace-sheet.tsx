import { useEffect, useState } from "react"
import { SourceLabel } from "@/components/source-label"
import { useQuery } from "@tanstack/react-query"
import { ArrowUpRight, ChevronDown, FileText, Sigma, X as Times, Equal, Zap } from "lucide-react"
import { Link } from "react-router-dom"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { api, fileUrl } from "@/lib/api"
import { fmtDate, groupByScope, num, pct, SOURCES } from "@/lib/format"
import { t, tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { PageSkeleton, QualityBadge, StatusBadge } from "./common"
import { BasisChip } from "./data-basis"

/** Angka yang ramah dibaca: ribuan dipisah, desimal secukupnya. */
const nice = (v: number | null | undefined) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "–"
  const a = Math.abs(v)
  return num(v, a === 0 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : 4)
}
const factorValue = (v: number) => num(v, Math.abs(v) >= 100 ? 1 : Math.abs(v) >= 1 ? 3 : 4)

/** CALC-05: klik angka → DA, FE, sumber dokumen, versi, rumus */
export function TraceSheet({ orgId, date, source, open, onOpenChange }: { orgId: number; date: string | null; source?: string | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["trace", orgId, date, source], enabled: open && !!date,
    queryFn: () => api<any>(`/orgs/${orgId}/trace?date=${date}${source ? `&source=${source}` : ""}`),
  })
  // urutan baku: Scope 1 → 2 → 3, lalu urutan sumber yang sama di semua halaman
  const entries: [string, any][] = data ? groupByScope(Object.entries<any>(data.sources).filter(([, v]) => v), ([k]) => k, null, ([, v]) => v.scope).flatMap((g) => g.items) : []
  const total = entries.reduce((s, [, v]) => s + v.kg, 0)
  const [openKey, setOpenKey] = useState<string | null>(null)
  useEffect(() => { setOpenKey(source ?? entries[0]?.[0] ?? null) }, [data]) // eslint-disable-line

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader className="sticky top-0 z-10 border-b bg-background/95 px-6 pt-6 pb-4 backdrop-blur">
          <SheetTitle className="flex items-center gap-2 text-lg"><span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Sigma className="size-4" /></span>{t("Telusuri angka")}</SheetTitle>
          {date && <Link to={`/app/trace?date=${date}${source ? `&source=${source}` : ""}`} onClick={() => onOpenChange(false)} className="absolute top-5 right-14 inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">{tl("Buka halaman detail", "Open full page")} <ArrowUpRight className="size-3.5" /></Link>}
          <SheetDescription className="flex flex-wrap items-center gap-2">
            {date && fmtDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            {data && <Badge variant="secondary" className="capitalize">{tl("hari", "day")} {data.dayType}{data.k > 0 && data.k < 1 ? ` · ${pct(data.k)}` : ""}</Badge>}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-6 py-5">
          {isLoading || !data ? <PageSkeleton /> : (
            <>
              {/* ringkasan */}
              {!source && (
                <section className="rounded-2xl bg-muted/50 p-5">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">{tl("Total emisi hari ini", "Total emissions this day")}</p>
                      <p className="mt-1 text-3xl font-semibold tracking-tight tabular">{num(total, 1)} <span className="text-base font-normal text-muted-foreground">kg CO₂e</span></p>
                    </div>
                    <div className="text-right text-[0.6875rem] leading-5 text-muted-foreground">
                      <div>Baseline <b className="text-foreground">{data.baseline ?? "–"}</b></div>
                    </div>
                  </div>
                  <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-muted">
                    {entries.map(([k, s]) => <button key={k} title={`${SOURCES[k]?.label}: ${num(s.kg, 1)} kg`} onClick={() => setOpenKey(k)} className="h-full transition-opacity hover:opacity-80" style={{ width: `${total ? (s.kg / total) * 100 : 0}%`, background: SOURCES[k]?.color }} />)}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                    {entries.map(([k, s]) => (
                      <button key={k} onClick={() => setOpenKey(k)} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                        <span className="size-2 rounded-full" style={{ background: SOURCES[k]?.color }} />{SOURCES[k]?.label}<b className="text-foreground tabular">{pct(total ? s.kg / total : 0, total && s.kg / total < 0.1 ? 1 : 0)}</b>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* rincian per sumber */}
              <div className="space-y-3">
                {entries.map(([k, s]) => {
                  const isOpen = openKey === k
                  return (
                    <section key={k} className={cn("overflow-hidden rounded-2xl bg-muted/40 transition-all", isOpen && "bg-card ring-1 ring-primary/30")}>
                      <button onClick={() => setOpenKey(isOpen ? null : k)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-muted/40">
                        <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: SOURCES[k]?.color }} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{SOURCES[k]?.label ?? k}</span>
                            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[0.625rem] font-medium text-muted-foreground">Scope {s.scope}</span>
                            <QualityBadge label={s.label} />
                            <BasisChip kind={s.basis?.kind} />
                          </div>
                          {!source && <div className="mt-1 text-xs text-muted-foreground">{pct(total ? s.kg / total : 0, 1)} {tl("dari total hari ini", "of today's total")}</div>}
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold tabular">{num(s.kg, 1)}</div>
                          <div className="text-[0.625rem] text-muted-foreground">kg CO₂e</div>
                        </div>
                        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                      </button>

                      {isOpen && (
                        <div className="space-y-5 border-t bg-muted/20 px-5 py-5">
                          {/* langkah perhitungan */}
                          <div>
                            <p className="mb-2 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">{tl("Perhitungan", "Calculation")}</p>
                            <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 text-center">
                              <div className="rounded-xl bg-card p-3 ring-1 ring-border">
                                <div className="text-[0.625rem] text-muted-foreground">{t("Data aktivitas")}</div>
                                <div className="mt-0.5 font-semibold tabular">{nice(s.trace.da)}</div>
                                <div className="text-[0.625rem] text-muted-foreground">{s.trace.daUnit}</div>
                              </div>
                              <Times className="size-3.5 text-muted-foreground" />
                              <div className="rounded-xl bg-card p-3 ring-1 ring-border">
                                <div className="text-[0.625rem] text-muted-foreground">{t("Faktor emisi")}</div>
                                <div className="mt-0.5 font-semibold tabular">{s.trace.factors.length === 1 ? factorValue(s.trace.factors[0].value) : s.trace.factors.length ? tl(`${s.trace.factors.length} faktor`, `${s.trace.factors.length} factors`) : "–"}</div>
                                <div className="text-[0.625rem] text-muted-foreground">{s.trace.factors.length === 1 ? s.trace.factors[0].unit : tl("lihat tabel", "see table")}</div>
                              </div>
                              <Equal className="size-3.5 text-muted-foreground" />
                              <div className="rounded-xl bg-primary/10 p-3 ring-1 ring-primary/20">
                                <div className="text-[0.625rem] text-primary">{tl("Emisi", "Emissions")}</div>
                                <div className="mt-0.5 font-semibold text-primary tabular">{num(s.kg, 1)}</div>
                                <div className="text-[0.625rem] text-primary/80">kg CO₂e</div>
                              </div>
                            </div>
                          </div>

                          {/* rumus */}
                          <div>
                            <p className="mb-2 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">{t("Rumus")}</p>
                            <p className="rounded-xl bg-card px-4 py-3 text-sm leading-relaxed ring-1 ring-border">{s.trace.formula}</p>
                            {s.basis?.text && <p className="mt-2 text-xs text-muted-foreground">{tl("Dasar data:", "Data basis:")} <b className="font-medium text-foreground">{s.basis.text}</b></p>}
                            {s.trace.note && <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">{s.trace.note}</p>}
                          </div>

                          {/* Data Khusus Pembacaan Sensor IoT Listrik PLN */}
                          {s.iot && (
                            <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-emerald-500/10 via-primary/5 to-transparent p-4">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-3">
                                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                                    <Zap className="size-4.5" />
                                  </span>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-foreground text-sm">{s.iot.name}</span>
                                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[0.625rem] font-semibold text-emerald-700 dark:text-emerald-300">
                                        <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        {tl("Terhubung", "Connected")}
                                      </span>
                                    </div>
                                    <p className="truncate text-xs text-muted-foreground mt-0.5">
                                      {s.iot.location ?? "Panel Listrik"} · {s.iot.firmware ?? "ESP32-PZEM004T"} {s.iot.rssi != null ? `· ${s.iot.rssi} dBm` : ""}
                                    </p>
                                  </div>
                                </div>
                                <Link to="/app/iot" onClick={() => onOpenChange(false)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline shrink-0">
                                  {tl("Kelola IoT", "Manage IoT")} <ArrowUpRight className="size-3" />
                                </Link>
                              </div>

                              {s.iot.lastReading && (
                                <div className="mt-3 flex items-center justify-between rounded-xl bg-background/80 px-3 py-2 ring-1 ring-border/50 text-xs">
                                  <span className="text-muted-foreground">{tl("Angka meter kumulatif saat ini:", "Current cumulative meter reading:")}</span>
                                  <span className="font-mono text-sm font-bold text-foreground tabular">{num(s.iot.lastReading.value, 1)} {s.iot.unit}</span>
                                </div>
                              )}

                              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                <div className="rounded-xl border border-primary/25 bg-primary/10 p-2.5">
                                  <div className="text-[0.625rem] font-medium text-primary uppercase tracking-wide">{tl("Hari ini", "Today")}</div>
                                  <div className="mt-1 text-base font-bold tabular text-foreground">{num(s.iot.periods?.today?.value ?? 0, 1)} <span className="text-xs font-normal text-muted-foreground">{s.iot.unit}</span></div>
                                  <div className="mt-0.5 text-[0.6875rem] font-semibold text-primary tabular">{num(s.iot.periods?.today?.kg ?? 0, 1)} kg CO₂e</div>
                                </div>
                                <div className="rounded-xl bg-background/80 p-2.5 ring-1 ring-border/50">
                                  <div className="text-[0.625rem] font-medium text-muted-foreground uppercase tracking-wide">{tl("Minggu ini", "This week")}</div>
                                  <div className="mt-1 text-base font-bold tabular text-foreground">{num(s.iot.periods?.thisWeek?.value ?? 0, 1)} <span className="text-xs font-normal text-muted-foreground">{s.iot.unit}</span></div>
                                  <div className="mt-0.5 text-[0.6875rem] text-muted-foreground tabular">{num(s.iot.periods?.thisWeek?.kg ?? 0, 1)} kg CO₂e</div>
                                </div>
                                <div className="rounded-xl bg-background/80 p-2.5 ring-1 ring-border/50">
                                  <div className="text-[0.625rem] font-medium text-muted-foreground uppercase tracking-wide">{tl("Bulan ini", "This month")}</div>
                                  <div className="mt-1 text-base font-bold tabular text-foreground">{num(s.iot.periods?.thisMonth?.value ?? 0, 1)} <span className="text-xs font-normal text-muted-foreground">{s.iot.unit}</span></div>
                                  <div className="mt-0.5 text-[0.6875rem] text-muted-foreground tabular">{num(s.iot.periods?.thisMonth?.kg ?? 0, 1)} kg CO₂e</div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* faktor */}
                          {s.trace.factors.length > 0 && (
                            <div>
                              <p className="mb-2 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">{t("Faktor emisi")}</p>
                              <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
                                {s.trace.factors.map((f: any, i: number) => (
                                  <div key={i} className="grid grid-cols-[1fr_auto] gap-3 border-b px-4 py-2.5 last:border-0">
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-medium">{f.name}</div>
                                      <SourceLabel source={f.source} compact className="mt-1" />
                                    </div>
                                    <div className="text-right">
                                      <div className="text-sm font-semibold tabular">{factorValue(f.value)}</div>
                                      <div className="text-[0.625rem] text-muted-foreground">{f.unit}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* data & bukti */}
                          {s.records?.length > 0 && (
                            <div>
                              <p className="mb-2 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">{tl("Data sumber & bukti", "Source data & evidence")}</p>
                              <div className="space-y-2">
                                {s.records.map((r: any) => (
                                  <div key={r.id} className="rounded-xl bg-card px-4 py-3 ring-1 ring-border">
                                    <div className="flex flex-wrap items-center gap-2 text-sm">
                                      <span className="font-medium">{tl("Periode", "Period")} {r.period}</span>
                                      <span className="tabular text-muted-foreground">{num(r.quantity, 1)} {r.unit}</span>
                                      <span className="text-[0.6875rem] text-muted-foreground">rev {r.revision}</span>
                                      <StatusBadge status={r.status} className="ml-auto" />
                                    </div>
                                    {r.evidence.length > 0 && (
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {r.evidence.map((e: any) => (
                                          <a key={e.id} href={fileUrl(e.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-primary/8 px-2.5 py-1 text-xs text-primary hover:bg-primary/15"><FileText className="size-3.5" />{e.filename}</a>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
