import { useEffect, useMemo } from "react"
import { SourceLabel } from "@/components/source-label"
import { Link, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Equal, ExternalLink, FileText, Info, Layers, Sigma, Trees, X as Times, Zap } from "lucide-react"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState, PageHeader, PageSkeleton, QualityBadge, StatusBadge } from "@/components/common"
import { Delta, PillBars, SRC_ICON, StatTile } from "@/components/dash-kit"
import { BasisChip } from "@/components/data-basis"
import { CountUp } from "@/components/interactive-charts"
import { api, fileUrl } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { addDays, fmtDate, num, groupByScope, pct, signedPct, SOURCES, todayWIB } from "@/lib/format"
import { ScopeHeading } from "@/components/scope-group"
import { IotBadge } from "@/components/iot-badge"
import { tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const STRONG = ["aktual", "terukur", "terverifikasi", "terkunci"]
const nice = (v: number | null | undefined) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "–"
  const a = Math.abs(v)
  return num(v, a === 0 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : 4)
}
const factorValue = (v: number) => num(v, Math.abs(v) >= 100 ? 1 : Math.abs(v) >= 1 ? 3 : 4)

/** Halaman detail "Telusuri angka": seluruh rincian perhitungan satu hari, per sumber, dengan pembanding & bukti. */
export default function TracePage() {
  const { orgId } = useAuth()
  const [params, setParams] = useSearchParams()
  const today = todayWIB()
  const date = params.get("date") ?? params.get("tanggal") ?? today
  const source = (params.get("source") ?? params.get("sumber"))
  const set = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) v === null ? p.delete(k) : p.set(k, v)
    setParams(p, { replace: true })
  }

  const trace = useQuery({ queryKey: ["trace-page", orgId, date], enabled: !!orgId, placeholderData: (p) => p, queryFn: () => api<any>(`/orgs/${orgId}/trace?date=${date}`) })
  const series = useQuery({ queryKey: ["series", orgId, "trace", date], enabled: !!orgId, placeholderData: (p) => p, queryFn: () => api<any>(`/orgs/${orgId}/series?start=${addDays(date, -29)}&end=${date}`) })

  const d = trace.data
  const entries: [string, any][] = useMemo(() => (d ? groupByScope(Object.entries<any>(d.sources).filter(([, v]) => v), ([k]) => k, null, ([, v]) => v.scope).flatMap((g) => g.items) : []), [d])
  const sel = source && d?.sources[source] ? source : entries[0]?.[0]
  useEffect(() => { document.getElementById("detail-sumber")?.scrollIntoView({ block: "nearest", behavior: "smooth" }) }, [source])

  if (!orgId) return <ErrorState error={new Error("Akun belum terhubung ke lembaga")} />
  if (trace.isLoading) return <PageSkeleton />
  if (trace.error) return <ErrorState error={trace.error} />

  const days: any[] = series.data?.days ?? []
  const yesterday = days.find((x) => x.date === addDays(date, -1))
  const vsYesterday = yesterday?.total ? d.total / yesterday.total - 1 : null
  const vsBase = d.baselineTotal ? d.total / d.baselineTotal - 1 : null
  const q = { strong: 0, mid: 0, proj: 0 }
  for (const [, s] of entries) { if (STRONG.includes(s.label)) q.strong += s.kg; else if (s.label === "proyeksi") q.proj += s.kg; else q.mid += s.kg }
  const qt = q.strong + q.mid + q.proj || 1
  const s = sel ? d.sources[sel] : null
  const srcTrend = sel ? days.map((x) => ({ key: x.date, date: x.date, label: String(Number(x.date.slice(8))), value: x.sources[sel]?.kg ?? 0, hatched: x.type === "libur" })) : []
  const srcBase = sel ? d.baselineBySource?.[sel] ?? null : null
  const srcVsBase = s && srcBase ? s.kg / srcBase - 1 : null
  const I = (sel && SRC_ICON[sel]) || Layers

  return (
    <div className="space-y-5">
      <PageHeader icon={Sigma} title={tl("Telusuri angka", "Trace the numbers")}
        description={tl("Audit harian: dari mana setiap angka berasal — data aktivitas, faktor emisi, rumus, dasar data, dan bukti dokumennya. Tren bulanan & perbandingan baseline ada di Rapor Karbon.", "Daily audit: where every number comes from — activity data, emission factors, formula, data basis and evidence. Monthly trends & baseline comparison live in the Carbon Report.")}
        meta={<>
          <span className="text-sm font-medium">{fmtDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", d.k > 0 ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground")}>{tl("hari", "day")} {d.dayType}{d.k > 0 && d.k < 1 ? ` · ${pct(d.k)} ${tl("hadir", "attendance")}` : ""}</span>
        </>}
        actions={<>
          <Button variant="outline" render={<Link to="/app" />}><ChevronLeft /> {tl("Dasbor", "Dashboard")}</Button>
          <Button variant="outline" render={<Link to="/app/carbon" />}><Layers /> {tl("Rapor bulanan", "Monthly report")}</Button>
          <div className="flex items-center gap-1 rounded-full bg-card p-1 ring-1 ring-border">
            <Button size="icon-sm" variant="ghost" aria-label={tl("Hari sebelumnya", "Previous day")} onClick={() => set({ date: addDays(date, -1) })}><ChevronLeft /></Button>
            <Input type="date" value={date} max={today} onChange={(e) => e.target.value && set({ date: e.target.value })} className="h-9 w-40 border-0 bg-transparent" />
            <Button size="icon-sm" variant="ghost" aria-label={tl("Hari berikutnya", "Next day")} disabled={date >= today} onClick={() => set({ date: addDays(date, 1) })}><ChevronRight /></Button>
          </div>
          {date !== today && <Button onClick={() => set({ date: null })}><CalendarDays /> {tl("Hari ini", "Today")}</Button>}
        </>} />

      {/* ---------- pilih hari ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{tl("30 hari terakhir", "Last 30 days")}</CardTitle>
          <CardDescription>{tl("Klik batang untuk menelusuri hari lain · arsir = hari libur", "Click a bar to trace another day · hatched = holiday")}</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {days.length ? <PillBars height={150} selected={date} format={(v) => `${num(v, 0)} kg`} onPick={(b) => set({ date: b.key })} bars={days.map((x) => ({ key: x.date, label: String(Number(x.date.slice(8))), value: x.total, hatched: x.type === "libur" }))} /> : <Skeleton className="h-[9.375rem] rounded-2xl" />}
        </CardContent>
      </Card>

      {/* ---------- belum ada data di buku engine ---------- */}
      {d.empty && (
        <div className="rounded-2xl border border-dashed border-border px-5 py-6 text-center text-sm text-muted-foreground">
          {d.reason === "sebelum_data"
            ? tl(`Belum ada data untuk tanggal ini. Pencatatan lembaga dimulai ${d.dataStart}.`, `No data for this date. Recording starts on ${d.dataStart}.`)
            : tl("Tanggal ini belum dihitung engine. Angka muncul setelah engine berjalan (maks. 10 menit).", "This date has not been computed yet. Figures appear after the engine runs (max 10 minutes).")}
        </div>
      )}
      {/* ---------- status tutup buku ---------- */}
      {d.partial && (
        <div className="rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/8 px-5 py-3.5 text-sm">
          <b className="text-amber-700 dark:text-amber-300">{tl("Hari ini masih berjalan — angka sementara.", "Today is still in progress — provisional figures.")}</b>{" "}
          <span className="text-muted-foreground">{tl(`Dihitung ${Math.round((d.fraction ?? 0) * 100)}% dari perkiraan satu hari; sumber bersensor IoT memakai bacaan nyata. Angka final disimpan saat tutup buku pukul 00.30 WIB.`, `Counted at ${Math.round((d.fraction ?? 0) * 100)}% of a full-day estimate; IoT-metered sources use real readings. Final figures are stored at the 00:30 WIB closing.`)}</span>
        </div>
      )}
      {d.stored && (
        <div className={cn("rounded-2xl px-5 py-3.5 text-sm", d.stored.differs ? "border border-amber-500/40 bg-amber-500/8" : "bg-primary/8")}>
          <b>{tl("Angka resmi tersimpan", "Stored official figure")}: {num(d.stored.total, 1)} kg CO₂e</b>
          <span className="text-muted-foreground"> · {tl("revisi", "revision")} {d.stored.revision} · {d.stored.locked ? tl("terkunci", "locked") : tl("masih terbuka s.d. tgl 15 bulan berikutnya", "open until the 15th of next month")}</span>
          {d.stored.differs && <div className="mt-1 text-amber-700 dark:text-amber-300">{tl(`Disimpan dengan versi faktor emisi lama (${d.stored.feVersion}). ${d.stored.locked ? "Admin dapat menjalankan hitung ulang." : "Akan diperbarui otomatis bila ada data baru, atau lewat hitung ulang Admin."}`, `Stored with an older emission-factor version (${d.stored.feVersion}). ${d.stored.locked ? "An Admin can run a recalculation." : "It updates automatically on new data, or via an Admin recalculation."}`)}</div>}
        </div>
      )}

      {/* ---------- KPI ---------- */}
      <div className={cn("grid gap-5 sm:grid-cols-2 xl:grid-cols-4 transition-opacity", trace.isFetching && "opacity-60")}>
        <StatTile featured title={tl("Total emisi hari itu", "Total emissions that day")} unit="kg CO₂e" value={<CountUp value={d.total} format={(v) => num(v, 1)} />}
          foot={vsYesterday !== null ? <Delta invert value={signedPct(vsYesterday)} good={vsYesterday <= 0} text={tl("dibanding hari sebelumnya", "vs previous day")} /> : <span className="text-[0.8125rem] text-white/80">{entries.length} {tl("sumber", "sources")}</span>} />
        <StatTile title={tl("Ekspektasi baseline", "Baseline expectation")} unit="kg CO₂e" icon={Layers} value={d.baselineTotal ? <CountUp value={d.baselineTotal} format={(v) => num(v, 1)} /> : "–"}
          foot={vsBase !== null ? <Delta value={signedPct(vsBase)} good={vsBase <= 0} text={`${tl("vs", "vs")} ${d.baseline}`} /> : <span className="text-[0.8125rem] text-muted-foreground">{tl("Belum ada baseline", "No baseline yet")}</span>} />
        <StatTile title={tl("Per orang", "Per person")} unit="g CO₂e" icon={Info} value={<CountUp value={d.population ? (d.total / d.population) * 1000 : 0} format={(v) => num(v, 0)} />}
          foot={<span className="text-[0.8125rem] text-muted-foreground">{num(d.population)} {tl("warga sekolah", "school members")}</span>} />
        <StatTile title={tl("Serapan pohon hari itu", "Tree uptake that day")} unit="kg CO₂" icon={Trees} value={<CountUp value={d.treeUptake?.kg ?? 0} format={(v) => num(v, 2)} />}
          foot={<span className="text-[0.8125rem] text-primary">{d.treeUptake?.trees ?? 0} {tl("pohon tumbuh · pembanding, bukan pengurang", "trees growing · comparison only")}</span>} />
      </div>

      {/* ---------- rincian per sumber ---------- */}
      <div id="detail-sumber" className="grid scroll-mt-24 items-start gap-5 xl:grid-cols-[340px_1fr]">
        <Card className="xl:sticky xl:top-24">
          <CardHeader><CardTitle className="text-xl">{tl("Sumber emisi", "Emission sources")}</CardTitle><CardDescription>{entries.length} {tl("sumber · dikelompokkan per scope", "sources · grouped by scope")} · {tl("data kuat", "strong data")} {pct(q.strong / qt)}</CardDescription></CardHeader>
          <CardContent className="space-y-1">
            <div className="mb-3 flex h-2.5 overflow-hidden rounded-full bg-muted">
              {entries.map(([k, v]) => <button key={k} title={`${SOURCES[k]?.label}: ${num(v.kg, 1)} kg`} onClick={() => set({ source: k })} className="h-full hover:opacity-80" style={{ width: `${d.total ? (v.kg / d.total) * 100 : 0}%`, background: SOURCES[k]?.color }} />)}
            </div>
            {groupByScope(entries, ([k]) => k, null, ([, v]) => v.scope).map((g) => (
            <div key={g.scope} className="space-y-1 pt-3 first:pt-0">
            <ScopeHeading compact scope={g.scope} totalKg={g.items.reduce((acc, [, v]) => acc + v.kg, 0)} className="pb-1" />
            {g.items.map(([k, v]) => {
              const Ic = SRC_ICON[k] ?? Layers
              return (
                <button key={k} onClick={() => set({ source: k })} className={cn("-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors", sel === k ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/60")}>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${SOURCES[k]?.color} 18%, transparent)`, color: SOURCES[k]?.color }}><Ic className="size-[1.125rem]" /></span>
                  <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 truncate text-sm font-medium">{SOURCES[k]?.label ?? k}{v.iot && <IotBadge source={k} iot={{ [k]: { devices: [{ name: v.iot.name, connection: v.iot.connection ?? "terhubung" }] } }} />}</span><span className="block truncate text-xs text-muted-foreground">Scope {v.scope} · {pct(d.total ? v.kg / d.total : 0, 1)}</span></span>
                  <span className="text-right text-sm font-semibold tabular">{num(v.kg, 1)}<span className="block text-[0.625rem] font-normal text-muted-foreground">kg</span></span>
                </button>
              )
            })}
            </div>
            ))}
          </CardContent>
        </Card>

        {s && sel && (
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <div className="flex items-start gap-4">
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl" style={{ background: `color-mix(in srgb, ${SOURCES[sel]?.color} 18%, transparent)`, color: SOURCES[sel]?.color }}><I className="size-6" /></span>
                  <div className="min-w-0">
                    <CardTitle className="text-2xl">{SOURCES[sel]?.label ?? sel}</CardTitle>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">Scope {s.scope}</span>
                      <QualityBadge label={s.label} /><BasisChip kind={s.basis?.kind} />
                    </div>
                  </div>
                </div>
                <CardAction className="text-right"><div className="text-3xl font-semibold tabular">{num(s.kg, 2)}</div><div className="text-xs text-muted-foreground">kg CO₂e</div></CardAction>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 text-center sm:gap-3">
                  <div className="rounded-2xl bg-muted/60 p-4"><div className="text-xs text-muted-foreground">{tl("Data aktivitas", "Activity data")}</div><div className="mt-1 text-xl font-semibold tabular">{nice(s.trace.da)}</div><div className="text-xs text-muted-foreground">{s.trace.daUnit}</div></div>
                  <Times className="size-4 text-muted-foreground" />
                  <div className="rounded-2xl bg-muted/60 p-4"><div className="text-xs text-muted-foreground">{tl("Faktor emisi", "Emission factor")}</div><div className="mt-1 text-xl font-semibold tabular">{s.trace.factors.length === 1 ? factorValue(s.trace.factors[0].value) : s.trace.factors.length ? `${s.trace.factors.length} ${tl("faktor", "factors")}` : "–"}</div><div className="truncate text-xs text-muted-foreground">{s.trace.factors.length === 1 ? s.trace.factors[0].unit : tl("lihat tabel", "see table")}</div></div>
                  <Equal className="size-4 text-muted-foreground" />
                  <div className="rounded-2xl bg-primary p-4 text-primary-foreground"><div className="text-xs opacity-80">{tl("Emisi", "Emissions")}</div><div className="mt-1 text-xl font-semibold tabular">{num(s.kg, 2)}</div><div className="text-xs opacity-80">kg CO₂e</div></div>
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold">{tl("Cara menghitung", "How it's calculated")}</p>
                  <p className="rounded-2xl bg-muted/50 px-5 py-4 text-[0.9375rem] leading-relaxed">{s.trace.formula}</p>
                  {s.basis?.text && <p className="mt-2 text-sm text-muted-foreground">{tl("Dasar data:", "Data basis:")} <b className="font-medium text-foreground">{s.basis.text}</b></p>}
                  {s.trace.note && <p className="mt-2 rounded-2xl bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-300">{s.trace.note}</p>}
                </div>

                {/* Data Khusus Sensor IoT Listrik PLN */}
                {s.iot && (
                  <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-emerald-500/10 via-primary/5 to-transparent p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3.5">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                          <Zap className="size-5" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground text-base">{s.iot.name}</span>
                            {(() => {
                              const conn = s.iot.connection ?? "terhubung"
                              if (conn === "terhubung") {
                                return (
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-500/25 dark:text-emerald-300">
                                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                                    {tl("Terhubung", "Connected")}
                                  </span>
                                )
                              } else if (conn === "terlambat") {
                                return (
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-500/25 dark:text-amber-300">
                                    <span className="size-2 rounded-full bg-amber-500" />
                                    {tl("Terlambat", "Delayed")}
                                  </span>
                                )
                              } else if (conn === "terputus") {
                                return (
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-500/25 dark:text-rose-300">
                                    <span className="size-2 rounded-full bg-rose-500" />
                                    {tl("Tidak Terhubung", "Disconnected")}
                                  </span>
                                )
                              } else {
                                return (
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground ring-1 ring-border">
                                    {tl("Belum Terhubung", "Not Paired")}
                                  </span>
                                )
                              }
                            })()}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {[s.iot.location, s.iot.firmware, s.iot.rssi != null ? `${s.iot.rssi} dBm` : null].filter(Boolean).join(" · ") || tl("Panel Listrik", "Electrical Panel")}
                          </p>
                        </div>
                      </div>
                      <Link to="/app/iot" className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-background px-3 py-1.5 text-xs font-medium text-primary hover:bg-muted/50">
                        {tl("Kelola Sensor IoT", "Manage IoT Sensor")} <ArrowUpRight className="size-3.5" />
                      </Link>
                    </div>

                    {s.iot.lastReading && (
                      <div className="mt-4 flex items-center justify-between rounded-xl bg-background/80 px-4 py-2.5 ring-1 ring-border/50 text-sm">
                        <span className="text-muted-foreground">{tl("Angka meter kumulatif saat ini:", "Current cumulative meter reading:")}</span>
                        <span className="font-mono text-base font-bold text-foreground tabular">{num(s.iot.lastReading.value, 1)} {s.iot.unit}</span>
                      </div>
                    )}

                    <div className="mt-3.5 grid grid-cols-3 gap-3 text-center">
                      <div className="rounded-xl border border-primary/25 bg-primary/10 p-3">
                        <div className="text-xs font-medium text-primary uppercase tracking-wide">{tl("Hari ini", "Today")}</div>
                        <div className="mt-1 text-lg font-bold tabular text-foreground">{num(s.iot.periods?.today?.value ?? 0, 1)} <span className="text-xs font-normal text-muted-foreground">{s.iot.unit}</span></div>
                        <div className="mt-0.5 text-xs font-semibold text-primary tabular">{num(s.iot.periods?.today?.kg ?? 0, 1)} kg CO₂e</div>
                      </div>
                      <div className="rounded-xl bg-background/80 p-3 ring-1 ring-border/50">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{tl("Minggu ini", "This week")}</div>
                        <div className="mt-1 text-lg font-bold tabular text-foreground">{num(s.iot.periods?.thisWeek?.value ?? 0, 1)} <span className="text-xs font-normal text-muted-foreground">{s.iot.unit}</span></div>
                        <div className="mt-0.5 text-xs text-muted-foreground tabular">{num(s.iot.periods?.thisWeek?.kg ?? 0, 1)} kg CO₂e</div>
                      </div>
                      <div className="rounded-xl bg-background/80 p-3 ring-1 ring-border/50">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{tl("Bulan ini", "This month")}</div>
                        <div className="mt-1 text-lg font-bold tabular text-foreground">{num(s.iot.periods?.thisMonth?.value ?? 0, 1)} <span className="text-xs font-normal text-muted-foreground">{s.iot.unit}</span></div>
                        <div className="mt-0.5 text-xs text-muted-foreground tabular">{num(s.iot.periods?.thisMonth?.kg ?? 0, 1)} kg CO₂e</div>
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-muted/50 p-4"><div className="text-xs text-muted-foreground">{tl("Ekspektasi baseline", "Baseline expectation")}</div><div className="mt-1 text-lg font-semibold tabular">{srcBase !== null ? `${num(srcBase, 2)} kg` : "–"}</div>{srcVsBase !== null && <div className={cn("text-xs font-medium", srcVsBase <= 0 ? "text-primary" : "text-amber-700 dark:text-amber-400")}>{signedPct(srcVsBase)}</div>}</div>
                  <div className="rounded-2xl bg-muted/50 p-4"><div className="text-xs text-muted-foreground">{tl("Hari sebelumnya", "Previous day")}</div><div className="mt-1 text-lg font-semibold tabular">{yesterday ? `${num(yesterday.sources[sel]?.kg ?? 0, 2)} kg` : "–"}</div></div>
                  <div className="rounded-2xl bg-muted/50 p-4"><div className="text-xs text-muted-foreground">{tl("Rata-rata 30 hari", "30-day average")}</div><div className="mt-1 text-lg font-semibold tabular">{srcTrend.length ? `${num(srcTrend.reduce((a, b) => a + b.value, 0) / srcTrend.length, 2)} kg` : "–"}</div></div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-xl">{tl("Tren 30 hari", "30-day trend")} · {SOURCES[sel]?.label}</CardTitle><CardDescription>{tl("Klik batang untuk menelusuri hari itu", "Click a bar to trace that day")}</CardDescription></CardHeader>
              <CardContent className="pt-4">{srcTrend.length ? <PillBars height={160} selected={date} format={(v) => `${num(v, 1)} kg`} onPick={(b) => set({ date: b.key })} bars={srcTrend} /> : <Skeleton className="h-40 rounded-2xl" />}</CardContent>
            </Card>

            {s.trace.factors.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-xl">{tl("Faktor emisi yang dipakai", "Emission factors used")}</CardTitle><CardDescription><Link to="/methodology" className="text-primary hover:underline">{tl("Lihat metodologi", "See methodology")}</Link></CardDescription></CardHeader>
                <CardContent className="space-y-2">
                  {s.trace.factors.map((f: any, i: number) => (
                    <div key={i} className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-2xl bg-muted/50 px-4 py-3">
                      <div className="min-w-0"><div className="truncate font-medium">{f.name}</div><SourceLabel source={f.source} compact className="mt-1" /></div>
                      <div className="text-right"><div className="font-semibold tabular">{factorValue(f.value)}</div><div className="text-xs text-muted-foreground">{f.unit}</div></div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle className="text-xl">{tl("Data sumber & bukti", "Source data & evidence")}</CardTitle><CardDescription>{s.records?.length ? tl("Catatan input yang dipakai perhitungan ini", "Input records used in this calculation") : tl("Tidak ada catatan input langsung — angka ini dari proyeksi, rata-rata, atau asumsi (lihat dasar data).", "No direct input record — this number comes from a projection, average or assumption (see data basis).")}</CardDescription></CardHeader>
              {s.records?.length > 0 && (
                <CardContent className="space-y-3">
                  {s.records.map((r: any) => (
                    <div key={r.id} className="rounded-2xl bg-muted/50 p-4">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-medium">{tl("Periode", "Period")} {r.period}</span>
                        <span className="tabular text-muted-foreground">{num(r.quantity, 1)} {r.unit}</span>
                        <span className="text-xs text-muted-foreground">rev {r.revision} · {r.method}</span>
                        <StatusBadge status={r.status} className="ml-auto" />
                      </div>
                      {r.evidence.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {r.evidence.map((e: any) => (
                            <a key={e.id} href={fileUrl(e.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-xs font-medium text-primary ring-1 ring-border hover:ring-primary/40"><FileText className="size-3.5" />{e.filename}<ExternalLink className="size-3" /></a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
