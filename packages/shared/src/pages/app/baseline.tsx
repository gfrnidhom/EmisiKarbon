import { useState } from "react"
import { Link } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowRight, ArrowUpRight, Bike, BookOpenCheck, Building2, CalendarRange, Check, ChevronRight, ClipboardList, Droplets, FileText, FileWarning, Flame, Fuel, Lock, Recycle, RefreshCcw, Send, ShieldCheck, Snowflake, Sparkles, Trees, Undo2, Wand2, Zap, type LucideIcon } from "lucide-react"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ErrorState, Field, HeroChip, Meter, PageHeader, PageSkeleton, QualityBadge, StatusBadge, Spinner } from "@/components/common"
import { api } from "@/lib/api"
import { useOrg } from "@/lib/hooks"
import { addDays, fmtDate, fmtDateTime, fmtMonth, kg, num, groupByScope, pct, SOURCES, todayWIB, ton } from "@/lib/format"
import { ScopeHeading } from "@/components/scope-group"
import { cn } from "@/lib/utils"
import { DataBasisCard } from "@/components/data-basis"
import { BaselineDataGrid, usePhase } from "@/components/data-phase"
import { hatch, PillBars, SegmentGauge, SRC_ICON, StatTile } from "@/components/dash-kit"
import { CountUp } from "@/components/interactive-charts"
import { t, tl } from "@/lib/i18n"

const FLOW = [
  { s: "draf", t: tl("Diisi operator", "Filled by operator") }, { s: "diajukan", t: tl("Ditinjau Admin", "Admin review") },
  { s: "terkunci", t: tl("Disahkan & terkunci", "Approved & locked") },
]
const STEPS = [
  { k: "profil", t: t("Profil"), link: "/app/baseline/setup/profile", also: ["air_limbah"] }, { k: "mobilitas", t: t("Mobilitas"), link: "/app/baseline/setup/mobility" },
  { k: "listrik", t: t("Energi"), link: "/app/baseline/setup/energy", also: ["lpg", "genset", "kertas"] }, { k: "sampah", t: t("Sampah"), link: "/app/baseline/setup/waste" },
  { k: "pohon", t: t("Pohon"), link: "/app/baseline/setup/trees", also: ["ac"] },
  { k: "kalender", t: t("Kalender"), link: "/app/baseline/setup/calendar" },
]
const COMP_LABEL: Record<string, string> = { listrik: "Listrik PLN", mobilitas: "Mobilitas", sampah: "Sampah (penimbangan)", pohon: "Pohon", lpg: "LPG", ac: "AC & refrigeran", genset: "Genset", air_limbah: "Air limbah", kertas: "Kertas" }
const REQUIRED = ["listrik", "mobilitas", "sampah", "pohon"]
const COMP_ICON: Record<string, LucideIcon> = { listrik: Zap, mobilitas: Bike, sampah: Recycle, sampah_lokal: Recycle, pohon: Trees, lpg: Flame, ac: Snowflake, genset: Fuel, air_limbah: Droplets, kertas: FileText, profil: Building2 }
const COMP_HINT: Record<string, string> = {
  listrik: "Tagihan PLN 12 bulan", mobilitas: "Survei 1 menit via QR", sampah: "Penimbangan 8 hari sekolah", pohon: "Inventaris & ukur DBH",
  lpg: "Pembelian tabung kantin", ac: "Daftar unit & servis", genset: "Pemakaian solar", air_limbah: "Jenis sanitasi", kertas: "Pembelian rim kertas", profil: "Data sekolah & kalender",
}

function Ring({ value, size = 120 }: { value: number; size?: number }) {
  const r = (size - 14) / 2, c = 2 * Math.PI * r
  const ok = value >= 80
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={10} className="fill-none stroke-muted" />
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={10} strokeLinecap="round" className={cn("fill-none transition-all duration-700", ok ? "stroke-primary" : "stroke-amber-500")} strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-2xl font-semibold tabular">{num(value)}%</span><span className="text-[0.625rem] text-muted-foreground">{t("kelengkapan")}</span></div>
    </div>
  )
}

export default function Baseline() {
  const { orgId, can, org } = useOrg()
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ["baselines", orgId], queryFn: () => api<any[]>(`/orgs/${orgId}/baselines`), enabled: !!orgId })
  const latest = list.data?.[0]
  const detail = useQuery({ queryKey: ["baseline", latest?.id], queryFn: () => api<any>(`/baselines/${latest.id}`), enabled: !!latest })
  const phase = usePhase(orgId)
  const [dlg, setDlg] = useState<null | "create" | "reject" | "rebaseline" | "unlock">(null)
  const [note, setNote] = useState("")
  const [period, setPeriod] = useState({ start: addDays(todayWIB().slice(0, 8) + "01", -365), end: addDays(todayWIB().slice(0, 8) + "01", -1) })
  const refresh = () => { qc.invalidateQueries({ queryKey: ["data-phase"] }); qc.invalidateQueries({ queryKey: ["baselines"] }); qc.invalidateQueries({ queryKey: ["baseline"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }) }
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api(path, { method: "POST", json: body ?? {} }),
    onSuccess: (_, v) => { toast.success(t({ request: "Diajukan ke Admin", approve: "Disahkan", lock: "Survei Awal disahkan & dikunci", recompute: "Dihitung ulang", interpolate: "Interpolasi diisi", unlock: "Kunci dibuka" }[v.path.split("/").pop()!] ?? "Berhasil")); setDlg(null); setNote(""); refresh() },
    onError: (e: Error) => toast.error(e.message),
  })

  if (list.isLoading || (latest && detail.isLoading)) return <PageSkeleton />
  if (list.error) return <ErrorState error={list.error} />

  if (!latest) return (
    <>
      <PageHeader icon={BookOpenCheck} title={t("Survei awal")} description={t("Kumpulkan data periode acuan sekali di awal. Hasilnya menjadi baseline — pembanding semua angka di dasbor dan rapor.")}
        actions={can("operator", "admin") && <Button render={<Link to="/app/baseline/setup/period" />}><Sparkles /> {t("Mulai survei awal")}</Button>} />
      <div className="grid gap-px overflow-hidden rounded-2xl bg-border md:grid-cols-3">
        {[
          [CalendarRange, t("1. Tetapkan periode"), t("Default 12 bulan terakhir, minimal 3 bulan.")],
          [ClipboardList, t("2. Isi 10 langkah data"), t("Listrik, mobilitas, sampah, pohon, dan lainnya — tersimpan otomatis.")],
          [ShieldCheck, t("3. Ajukan & kunci"), tl("Operator mengajukan, Admin meninjau lalu mengesahkan & mengunci baseline.", "The operator submits; the Admin reviews, approves and locks the baseline.")],
        ].map(([I, title, desc]: any) => (
          <div key={title} className="bg-card p-6"><I className="size-5 text-primary" /><div className="mt-3 font-semibold">{title}</div><p className="mt-1 text-sm text-muted-foreground">{desc}</p></div>
        ))}
      </div>
      <CreateDialog open={dlg === "create"} onClose={() => setDlg(null)} period={period} setPeriod={setPeriod} busy={act.isPending} onSubmit={() => act.mutate({ path: `/orgs/${orgId}/baselines`, body: { period_start: period.start, period_end: period.end } })} />
    </>
  )
  const b = detail.data
  if (!b) return <PageSkeleton />
  const flowIdx = Math.max(FLOW.findIndex((f) => f.s === (b.status === "perlu_perbaikan" ? "draf" : b.status)), 0)
  const comp = b.completeness
  const locked = b.status === "terkunci"
  const editable = ["draf", "perlu_perbaikan"].includes(b.status)

  const steps = [
    { k: "profil", c: comp.profil, link: "/app/baseline/setup/profile", label: t("Profil & kalender"), required: true },
    ...Object.entries<any>(comp.components).map(([k, c]) => ({ k, c, link: STEPS.find((s) => s.k === k || s.also?.includes(k))?.link ?? "/app/baseline/setup/review", label: COMP_LABEL[k] ?? k, required: REQUIRED.includes(k) })),
  ].sort((x, y) => Number(y.required) - Number(x.required))
  const doneCount = steps.filter((s) => s.c.filled).length
  const next = steps.find((s) => !s.c.filled && s.required) ?? steps.find((s) => !s.c.filled)
  const reqs = [
    { ok: comp.score >= 80, text: t("Skor kelengkapan ≥ 80%") },
    { ok: comp.missingRequired.length === 0, text: comp.missingRequired.length ? t("Komponen wajib:") + ` ${comp.missingRequired.map((k: string) => COMP_LABEL[k] ?? k).join(", ")}` : t("Komponen wajib lengkap") },
    { ok: b.estimate_share <= 0.2, text: `${t("Porsi Estimasi")} ${pct(b.estimate_share)} (≤ 20%)`, warn: true },
  ]
  const trail: [string, LucideIcon, string | null][] = [
    [t("Diajukan operator"), Send, b.people.submitted],
    [tl("Disahkan & dikunci Admin", "Approved & locked by Admin"), Lock, b.people.locked ? `${b.people.locked} · ${fmtDateTime(b.locked_at)}` : null],
  ]
  const comps = [...b.components].sort((x: any, y: any) => y.total_kg - x.total_kg)

  return (
    <div className="space-y-5">
      <PageHeader icon={BookOpenCheck} title={t("Survei awal")} badge={<StatusBadge status={b.status} />}
        description={t("Kumpulkan data periode acuan sekali di awal. Hasilnya menjadi baseline — pembanding semua angka di dasbor dan rapor.")}
        meta={<>
          <HeroChip><b className="font-medium text-foreground">{b.version_label}</b></HeroChip>
          <HeroChip><CalendarRange className="size-3.5" />{fmtDate(b.period_start)} – {fmtDate(b.period_end)}</HeroChip>
          <HeroChip>{comp.months} {t("bulan")}</HeroChip>
          {phase.data?.monitoringFrom && <HeroChip><Link to="/app/input" className="hover:text-foreground">{tl("Input Berkala mulai", "Periodic input from")} <b className="font-medium text-foreground">{fmtMonth(phase.data.monitoringFrom)}</b> →</Link></HeroChip>}
          {b.data_hash && <HeroChip><span className="font-mono text-xs">#{b.data_hash.slice(0, 10)}</span></HeroChip>}
        </>}
        actions={<>
          {editable && <Button render={<Link to={next?.link ?? "/app/baseline/setup/review"} />}><ArrowRight /> {tl("Lanjutkan pengisian", "Continue filling in")}</Button>}
          {editable && <Button variant="outline" onClick={() => act.mutate({ path: `/baselines/${b.id}/recompute` })} disabled={act.isPending}><RefreshCcw /> {t("Hitung ulang")}</Button>}
          {editable && can("operator", "admin") && <Button disabled={!b.canSubmit || act.isPending} onClick={() => act.mutate({ path: `/baselines/${b.id}/request` })}><Send /> {tl("Ajukan ke Admin", "Submit to Admin")}</Button>}
          {false && <>
            <Button variant="outline" onClick={() => setDlg("reject")}><Undo2 /> {t("Kembalikan")}</Button>
            <Button onClick={() => act.mutate({ path: `/baselines/${b.id}/approve`, body: { decision: "setuju" } })}><Check /> {t("Setujui & ajukan")}</Button>
          </>}
          {["diajukan", "terverifikasi"].includes(b.status) && can("admin") && <Button onClick={() => act.mutate({ path: `/baselines/${b.id}/lock`, body: { note: note || undefined } })}><Lock /> {tl("Sahkan & kunci", "Approve & lock")}</Button>}
          {locked && can("admin") && <Button variant="outline" onClick={() => setDlg("unlock")}>{t("Buka kunci darurat")}</Button>}
          {locked && can("operator", "admin") && <Button variant="outline" onClick={() => setDlg("rebaseline")}><RefreshCcw /> {t("Baseline ulang")}</Button>}
        </>} />

      {/* ---------- KPI ---------- */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile featured title={t("Skor kelengkapan")} value={<CountUp value={comp.score} format={(v) => num(v, 0)} />} unit="%"
          foot={<span className="text-[0.8125rem] text-white/80">{comp.score >= 80 ? t("Skor cukup untuk diajukan.") : t("Butuh skor minimal 80% untuk diajukan.")}</span>} />
        <StatTile title={t("Langkah selesai")} value={<>{doneCount}<span className="text-2xl text-muted-foreground">/{steps.length}</span></>} icon={ClipboardList}
          foot={<div className="flex h-2 gap-1">{steps.map((x) => <span key={x.k} className={cn("flex-1 rounded-full", x.c.filled ? "bg-primary" : x.c.progress > 0 ? "bg-amber-400" : "bg-muted")} />)}</div>} />
        <StatTile title={t("Total periode")} value={<CountUp value={b.summary.total / 1000} format={(v) => num(v, 2)} />} unit="t CO₂e" icon={BookOpenCheck}
          foot={<span className="text-[0.8125rem] text-primary">{num(b.summary.perPersonYear, 1)} {t("kg/orang/th ·")} {num(b.summary.perM2Year, 1)} {t("kg/m²/th")}</span>} />
        <StatTile title={tl("Stok pohon awal", "Initial tree stock")} value={<CountUp value={b.summary.treeStock / 1000} format={(v) => num(v, 2)} />} unit="t CO₂" icon={Trees}
          foot={<span className="text-[0.8125rem] text-muted-foreground">{b.summary.treeCount} {t("pohon")} · {b.summary.activeDays} {t("hari aktif dari")} {b.summary.days} {t("hari.")}</span>} />
      </div>

      {/* ---------- alur status ---------- */}
      <Card>
        <CardContent>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-lg font-semibold">{t("Alur persetujuan")}</span>
            <StatusBadge status={b.status} />
          </div>
          <ol className="grid grid-cols-3 gap-2">
            {FLOW.map((f, i) => {
              const done = i < flowIdx || (locked && i === flowIdx), cur = i === flowIdx && !locked
              return (
                <li key={f.s} className="flex flex-col gap-2.5">
                  <div className={cn("h-2.5 rounded-full transition-colors", done ? "bg-primary" : cur ? "bg-primary/40" : "bg-muted")} style={cur ? hatch() : undefined} />
                  <div className="flex items-start gap-2">
                    <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-semibold tabular", done ? "bg-primary text-primary-foreground" : cur ? "bg-primary/15 text-primary ring-2 ring-primary/30" : "bg-muted text-muted-foreground")}>{done ? <Check className="size-3.5" /> : i + 1}</span>
                    <span className={cn("hidden text-xs leading-snug sm:block", i === flowIdx ? "font-semibold text-foreground" : done ? "text-foreground" : "text-muted-foreground")}>{f.t}{cur && <span className="block text-[0.6875rem] font-normal text-primary">{t("tahap saat ini")}</span>}</span>
                  </div>
                </li>
              )
            })}
          </ol>
        </CardContent>
      </Card>

      {b.status === "perlu_perbaikan" && (
        <Alert variant="destructive"><FileWarning /><AlertTitle>{t("Perlu perbaikan")}</AlertTitle><AlertDescription>{b.findings.find((f: any) => f.status === "terbuka")?.note ?? b.verifier_note ?? t("Periksa temuan verifikator di bawah.")}</AlertDescription></Alert>
      )}
      {b.estimateWarning && <Alert className="border-amber-500/30"><FileWarning className="text-amber-600" /><AlertTitle>{t("Porsi Estimasi")} {pct(b.estimate_share)} &gt; 20%</AlertTitle><AlertDescription>{t("Verifikator wajib memberi catatan alasan saat memverifikasi.")}</AlertDescription></Alert>}

      <div className="grid items-start gap-5 xl:grid-cols-[360px_1fr]">
        {/* ---------- panel progres ---------- */}
        <div className="space-y-5 xl:sticky xl:top-24">
          <Card>
            <CardHeader><CardTitle className="text-xl">{t("Progres survei")}</CardTitle><CardDescription>{doneCount} {t("dari")} {steps.length} {t("langkah selesai")}</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              <SegmentGauge value={`${num(comp.score, 0)}%`} label={t("kelengkapan")}
                parts={[{ v: comp.score, color: "var(--primary)" }, { v: Math.max(100 - comp.score, 0), color: "", hatched: true }]} />
              <ul className="space-y-2.5 text-sm">{reqs.map((r) => <Req key={r.text} {...r} />)}</ul>
              {editable && can("operator") && (
                <Button variant="outline" className="w-full" onClick={() => act.mutate({ path: `/baselines/${b.id}/interpolate` })}><Wand2 /> {t("Isi bulan hilang (interpolasi ≤ 2 bln)")}</Button>
              )}
            </CardContent>
          </Card>
          {next && editable ? (
            <Go to={next.link} className="group relative block overflow-hidden rounded-2xl bg-primary-deep p-6 text-white">
              <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: "repeating-radial-gradient(circle at 110% 120%, transparent 0 14px, rgb(255 255 255 / 0.05) 14px 16px)" }} />
              <div className="relative">
                <div className="text-sm text-white/75">{t("Langkah berikutnya")}</div>
                <div className="mt-2 flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-full bg-white text-primary-deep">{(() => { const I = COMP_ICON[next.k] ?? ClipboardList; return <I className="size-5" /> })()}</span>
                  <span className="text-xl font-semibold">{next.label}</span>
                </div>
                <p className="mt-2 text-sm text-white/75">{t(COMP_HINT[next.k] ?? "")}</p>
                <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-primary-deep transition-transform group-hover:translate-x-0.5">{t("Lengkapi")} <ArrowRight className="size-4" /></span>
              </div>
            </Go>
          ) : (
            <div className="relative overflow-hidden rounded-2xl bg-primary-deep p-6 text-white">
              <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: "repeating-radial-gradient(circle at 110% 120%, transparent 0 14px, rgb(255 255 255 / 0.05) 14px 16px)" }} />
              <div className="relative flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-full bg-white text-primary-deep">{locked ? <Lock className="size-5" /> : <Check className="size-5" />}</span>
                <div><div className="text-lg font-semibold">{locked ? t("Baseline terkunci") : t("Semua langkah lengkap")}</div><div className="text-sm text-white/75">{locked ? t("Engine kini memantau dan memakai data terbaru.") : t("Siap diajukan ke kepala sekolah.")}</div></div>
              </div>
            </div>
          )}
        </div>

        {/* ---------- langkah pengumpulan data ---------- */}
        <div className="space-y-5">
          {[true, false].map((req) => (
            <div key={String(req)}>
              <div className="mb-3 flex items-baseline justify-between px-1">
                <h3 className="text-lg font-semibold">{req ? t("Wajib") : t("Tambahan · menambah skor")}</h3>
                <span className="text-xs text-muted-foreground">{t("Tersimpan otomatis · bisa dilanjut di perangkat lain · klik langkah untuk mengisi")}</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {steps.filter((x) => x.required === req).map((x) => {
                  const I = COMP_ICON[x.k] ?? ClipboardList
                  const prog = Math.round((x.c.progress ?? (x.c.filled ? 1 : 0)) * 100)
                  const isNext = next?.k === x.k && editable
                  return (
                    <Go key={x.k} to={x.link} className={cn("group flex flex-col rounded-2xl bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5 dark:ring-1 dark:ring-white/[0.04]", isNext && "ring-2 ring-primary")}>
                      <div className="flex items-start justify-between gap-3">
                        <span className={cn("relative flex size-12 items-center justify-center rounded-full", x.c.filled ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary")}>
                          <I className="size-5" />
                          {x.c.filled && <span className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full bg-card text-primary ring-2 ring-card"><Check className="size-3.5" /></span>}
                        </span>
                        <span className="flex size-9 items-center justify-center rounded-full border border-foreground/20 transition-transform group-hover:rotate-45"><ArrowUpRight className="size-4" /></span>
                      </div>
                      <div className="mt-4 flex items-center gap-2">
                        <span className="font-semibold">{x.label}</span>
                        {isNext && <Badge className="h-5 bg-primary/12 px-1.5 text-[0.625rem] text-primary">{t("berikutnya")}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{t(COMP_HINT[x.k] ?? "")}</p>
                      <p className="mt-2 line-clamp-1 text-sm text-muted-foreground">{x.c.detail}</p>
                      <div className="mt-auto pt-4">
                        <div className="mb-1.5 flex items-baseline justify-between"><span className="text-2xl font-semibold tabular">{prog}%</span>{comp.weights[x.k] !== undefined && <span className="text-xs text-muted-foreground">{t("bobot")} {comp.weights[x.k]}</span>}</div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-muted" style={prog < 100 ? hatch("var(--muted-foreground)") : undefined}>
                          <div className={cn("h-full rounded-full transition-all duration-700", x.c.filled ? "bg-primary" : "bg-amber-400")} style={{ width: `${prog}%` }} />
                        </div>
                      </div>
                    </Go>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {phase.data && <BaselineDataGrid orgId={orgId} phase={phase.data} canEdit={false} />}

      {orgId && <DataBasisCard orgId={orgId} />}

      {/* ---------- hasil ---------- */}
      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-xl">{t("Hasil baseline per sumber")}</CardTitle>
            <CardDescription>{t("Total periode, rata-rata harian hari aktif & libur — dasar proyeksi harian & pembanding")}</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <PillBars height={240} format={(v) => `${num(v / 1000, 2)} t`}
              bars={groupByScope(comps.filter((c: any) => c.total_kg > 0), (c: any) => c.source, org).flatMap((g) => g.items).map((c: any) => ({ key: c.source, label: SOURCES[c.source]?.short ?? c.source, value: c.total_kg }))} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-xl">{t("Rincian")}</CardTitle><CardDescription>{ton(b.summary.total)} CO₂e · {comp.months} {t("bulan")}</CardDescription></CardHeader>
          <CardContent className="space-y-1">
            {groupByScope(comps.filter((c: any) => c.total_kg > 0), (c: any) => c.source, org).map((g) => (
            <div key={g.scope} className="space-y-1 pt-3 first:pt-0">
            <ScopeHeading compact scope={g.scope} totalKg={g.items.reduce((acc: number, c: any) => acc + c.total_kg, 0)} className="pb-1" />
            {g.items.map((c: any) => {
              const I = SRC_ICON[c.source] ?? ClipboardList
              return (
                <div key={c.source} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/60">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${SOURCES[c.source]?.color} 18%, transparent)`, color: SOURCES[c.source]?.color }}><I className="size-[1.125rem]" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{SOURCES[c.source]?.label ?? c.source}</span>
                    <span className="block truncate text-xs text-muted-foreground">{t("Harian aktif")} {kg(c.daily_active_kg)} · {t("Harian libur")} {kg(c.daily_holiday_kg)}</span>
                  </span>
                  <span className="text-right"><span className="block text-sm font-semibold tabular">{ton(c.total_kg)}</span><span className="block text-[0.6875rem] text-muted-foreground">{pct(b.summary.total ? c.total_kg / b.summary.total : 0, 1)}</span></span>
                  <QualityBadge label={c.method} />
                </div>
              )
            })}
            </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("Jejak persetujuan")}</CardTitle></CardHeader>
          <CardContent>
            <ol className="relative space-y-5 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-border">
              {trail.map(([label, I, who]) => (
                <li key={label} className="relative flex items-center gap-4">
                  <span className={cn("relative z-10 flex size-8 items-center justify-center rounded-full border bg-card", who ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground/60")}><I className="size-4" /></span>
                  <div className="min-w-0 flex-1"><div className={cn("text-sm font-medium", !who && "text-muted-foreground")}>{label}</div><div className="truncate text-xs text-muted-foreground">{who ?? t("belum")}</div></div>
                </li>
              ))}
            </ol>
            {b.verifier_note && <p className="mt-5 rounded-lg bg-muted p-3 text-sm">{t("Catatan:")} {b.verifier_note}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("Riwayat temuan")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {b.findings.length === 0 && <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed py-8 text-sm text-muted-foreground"><ShieldCheck className="size-6 text-primary/60" />{t("Belum ada temuan.")}</div>}
            {b.findings.map((f: any) => (
              <div key={f.id} className="rounded-2xl bg-muted/50 p-4 text-sm">
                <div className="flex items-center gap-2"><Badge variant={f.category === "mayor" ? "destructive" : "secondary"}>{f.category}</Badge><StatusBadge status={f.status} /><span className="ml-auto text-xs text-muted-foreground">{fmtDateTime(f.created_at)}</span></div>
                <p className="mt-2">{f.note}</p>
                {f.resolution && <p className="mt-1 text-xs text-muted-foreground">{t("Tindak lanjut:")} {f.resolution}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dlg === "reject"} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Kembalikan ke operator")}</DialogTitle><DialogDescription>{t("Status kembali ke Draf.")}</DialogDescription></DialogHeader>
          <Textarea placeholder={t("Catatan untuk operator")} value={note} onChange={(e) => setNote(e.target.value)} />
          <DialogFooter><Button onClick={() => act.mutate({ path: `/baselines/${b.id}/approve`, body: { decision: "tolak", note } })}>{t("Kembalikan")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={dlg === "unlock"} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Buka kunci darurat")}</DialogTitle><DialogDescription>{tl("Hanya dengan alasan tertulis. Rapor yang bergantung otomatis menjadi “Perlu tinjau ulang”. Tercatat di log audit.", "Written reason required. Dependent reports become “Needs review”. Recorded in the audit log.")}</DialogDescription></DialogHeader>
          <Textarea placeholder={t("Alasan tertulis (min. 10 karakter)")} value={note} onChange={(e) => setNote(e.target.value)} />
          <DialogFooter><Button variant="destructive" onClick={() => act.mutate({ path: `/baselines/${b.id}/unlock`, body: { reason: note } })}>{t("Buka kunci")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <CreateDialog rebaseline open={dlg === "rebaseline"} onClose={() => setDlg(null)} period={period} setPeriod={setPeriod} note={note} setNote={setNote} busy={act.isPending}
        onSubmit={() => act.mutate({ path: `/orgs/${orgId}/baselines`, body: { period_start: period.start, period_end: period.end, reason: note } })} />
      {org && null}
    </div>
  )
}

/** Tautan internal; "#id" menggulir ke bagian di halaman yang sama. */
function Go({ to, className, children }: { to: string; className?: string; children: React.ReactNode }) {
  if (to.startsWith("#")) return <a href={to} onClick={(e) => { e.preventDefault(); document.querySelector(to)?.scrollIntoView({ behavior: "smooth", block: "start" }) }} className={className}>{children}</a>
  return <Link to={to} className={className}>{children}</Link>
}

function Req({ ok, text, warn }: { ok: boolean; text: string; warn?: boolean }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className={cn("mt-0.5 flex size-[1.125rem] shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold", ok ? "bg-primary text-primary-foreground" : warn ? "bg-amber-500/20 text-amber-700" : "bg-destructive/15 text-destructive")}>{ok ? <Check className="size-3" /> : "!"}</span>
      <span className={cn("leading-snug", !ok && "text-muted-foreground")}>{text}</span>
    </li>
  )
}

function CreateDialog({ open, onClose, period, setPeriod, onSubmit, busy, rebaseline, note, setNote }: any) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{rebaseline ? t("Baseline ulang (versi baru)") : t("Tetapkan periode baseline")}</DialogTitle>
          <DialogDescription>{rebaseline ? t("Pemicu: perubahan struktural, jumlah siswa > 10%, metodologi/faktor resmi, atau kesalahan > 5%. Versi lama tetap tersimpan.") : "Default 12 bulan terakhir sebelum onboarding, minimal 3 bulan."}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Mulai")}><Input type="date" value={period.start} onChange={(e) => setPeriod({ ...period, start: e.target.value })} /></Field>
          <Field label={t("Selesai")}><Input type="date" value={period.end} onChange={(e) => setPeriod({ ...period, end: e.target.value })} /></Field>
        </div>
        {rebaseline && <Field label={t("Alasan & pemicu")}><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("mis. gedung baru 2 lantai menambah 6 unit AC")} /></Field>}
        <DialogFooter><Button onClick={onSubmit} disabled={busy}>{busy && <Spinner />} {t("Buat baseline")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
