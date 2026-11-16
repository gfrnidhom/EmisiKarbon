import { lazy, Suspense, useEffect, useState } from "react"
import { Link, Navigate, useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeft, ArrowRight, BookOpenCheck, Building2, CalendarDays, CalendarRange, Check, ClipboardCheck, Lock, Plus, Recycle, Send, Bike, Snowflake, Trees as TreesIcon, Zap, RefreshCcw, Droplets, type LucideIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, PageHeader, PageSkeleton, SimpleSelect, Spinner, StatusBadge } from "@/components/common"
import { BaselineDataGrid, usePhase } from "@/components/data-phase"
import { EmbedProvider } from "@/components/embed"
import { api } from "@/lib/api"
import { useOrg } from "@/lib/hooks"
import { addDays, fmtDate, num, todayWIB } from "@/lib/format"
import { tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const CalendarPage = lazy(() => import("./calendar"))
const MobilityPage = lazy(() => import("./mobility"))
const WastePage = lazy(() => import("./waste"))
const TreesPage = lazy(() => import("./trees"))

type StepKey = "period" | "profile" | "calendar" | "energy" | "mobility" | "waste" | "trees" | "review"
const STEPS: { key: StepKey; id: string; en: string; icon: LucideIcon; hint: [string, string]; field?: boolean }[] = [
  { key: "period", id: "Periode acuan", en: "Reference period", icon: CalendarRange, hint: ["Rentang data awal, min. 3 bulan", "Baseline window, min. 3 months"] },
  { key: "profile", id: "Profil sekolah", en: "School profile", icon: Building2, hint: ["Warga, bangunan, sanitasi", "People, building, sanitation"] },
  { key: "calendar", id: "Kalender", en: "Calendar", icon: CalendarDays, hint: ["Libur & ujian periode acuan", "Holidays & exams in the period"] },
  { key: "energy", id: "Energi & bahan bakar", en: "Energy & fuel", icon: Zap, hint: ["Tagihan bulanan per sumber", "Monthly bills per source"] },
  { key: "mobility", id: "Mobilitas", en: "Mobility", icon: Bike, hint: ["Survei perjalanan via QR", "Travel survey via QR"], field: true },
  { key: "waste", id: "Sampah", en: "Waste", icon: Recycle, hint: ["Penimbangan 8 hari sekolah", "8-school-day weighing"], field: true },
  { key: "trees", id: "Pohon & aset", en: "Trees & assets", icon: TreesIcon, hint: ["Ukur DBH, AC, biopori", "DBH, AC units, biopores"], field: true },
  { key: "review", id: "Tinjau & ajukan", en: "Review & submit", icon: ClipboardCheck, hint: ["Kelengkapan, lalu ajukan ke Admin", "Completeness, then submit"] },
]

/** Wizard Survei Awal — semua pengisian data awal di satu alur, tanpa pindah ke Input Berkala. */
export default function BaselineSetup() {
  const { step = "period" } = useParams()
  const nav = useNavigate()
  const { orgId, can } = useOrg()
  const list = useQuery({ queryKey: ["baselines", orgId], queryFn: () => api<any[]>(`/orgs/${orgId}/baselines`), enabled: !!orgId })
  const latest = list.data?.[0]
  const detail = useQuery({ queryKey: ["baseline", latest?.id], queryFn: () => api<any>(`/baselines/${latest.id}`), enabled: !!latest })
  const phase = usePhase(orgId)
  const idx = Math.max(STEPS.findIndex((s) => s.key === step), 0)
  const cur = STEPS[idx]
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }) }, [step])

  if (list.isLoading || (latest && detail.isLoading)) return <PageSkeleton />
  if (!STEPS.some((s) => s.key === step)) return <Navigate to="/app/baseline/setup/period" replace />
  const b = detail.data
  const locked = b?.status === "terkunci"
  const editable = !b || ["draf", "perlu_perbaikan"].includes(b.status)
  if (!b && step !== "period") return <Navigate to="/app/baseline/setup/period" replace />
  if (locked) return <Navigate to="/app/baseline" replace />

  const comp = b?.completeness
  const c = (k: string) => comp?.components?.[k]
  const status = (k: StepKey): "done" | "partial" | "todo" | "optional" => {
    if (!b) return k === "period" ? "todo" : "todo"
    switch (k) {
      case "period": return "done"
      case "profile": return comp.profil.filled && c("air_limbah")?.filled ? "done" : comp.profil.progress > 0 ? "partial" : "todo"
      case "calendar": return "optional"
      case "energy": return c("listrik")?.filled ? "done" : (c("listrik")?.progress ?? 0) > 0 ? "partial" : "todo"
      case "mobility": return c("mobilitas")?.filled ? "done" : (c("mobilitas")?.progress ?? 0) > 0 ? "partial" : "todo"
      case "waste": return c("sampah")?.filled ? "done" : (c("sampah")?.progress ?? 0) > 0 ? "partial" : "todo"
      case "trees": return c("pohon")?.filled && c("ac")?.filled ? "done" : c("pohon")?.filled || c("ac")?.filled ? "partial" : "todo"
      case "review": return b.status === "draf" || b.status === "perlu_perbaikan" ? "todo" : "done"
    }
  }
  const go = (i: number) => nav(`/app/baseline/setup/${STEPS[Math.min(Math.max(i, 0), STEPS.length - 1)].key}`)

  return (
    <div className="space-y-5">
      <PageHeader icon={BookOpenCheck} title={tl("Survei Awal", "Baseline Survey")} badge={b && <StatusBadge status={b.status} />}
        description={b ? <>{tl("Periode acuan", "Reference period")} <b className="font-medium text-foreground">{fmtDate(b.period_start)} – {fmtDate(b.period_end)}</b> · {b.version_label} · {tl("kelengkapan", "completeness")} <b className="font-medium text-foreground">{num(comp.score, 0)}%</b></> : tl("Isi data awal sekolah sekali di sini — tidak tercampur dengan Input Berkala.", "Enter the school's baseline data once here — kept apart from Periodic Input.")}
        actions={<Button variant="outline" render={<Link to="/app/baseline" />}><ArrowLeft /> {tl("Ringkasan", "Summary")}</Button>} />

      {/* ---------- stepper ---------- */}
      <nav aria-label={tl("Langkah", "Steps")} className="overflow-x-auto rounded-2xl bg-card p-2 ring-1 ring-border [scrollbar-width:none]">
        <ol className="flex min-w-max gap-1">
          {STEPS.map((s, i) => {
            const st = status(s.key), active = i === idx
            const disabled = !b && s.key !== "period"
            return (
              <li key={s.key}>
                <button type="button" disabled={disabled} onClick={() => go(i)}
                  className={cn("flex items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors disabled:opacity-40", active ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                  <span className={cn("relative flex size-8 shrink-0 items-center justify-center rounded-full", active ? "bg-white/20" : st === "done" ? "bg-primary text-primary-foreground" : st === "partial" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground")}>
                    {st === "done" && !active ? <Check className="size-4" /> : <s.icon className="size-4" />}
                  </span>
                  <span className="leading-tight">
                    <span className={cn("block text-[0.6875rem]", active ? "text-primary-foreground/75" : "text-muted-foreground")}>{tl("Langkah", "Step")} {i + 1}{s.field ? ` · ${tl("lapangan", "field")}` : ""}</span>
                    <span className="block text-sm font-medium whitespace-nowrap">{tl(s.id, s.en)}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      {!editable && b && <div className="rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground"><Lock className="mr-1.5 inline size-4" />{tl("Survei Awal sedang ditinjau Admin — data periode acuan tidak dapat diubah.", "The Baseline Survey is under Admin review — reference-period data cannot be changed.")}</div>}

      {/* ---------- isi langkah ---------- */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary"><cur.icon className="size-5" /></span>
          <div><h2 className="text-xl font-semibold">{tl(cur.id, cur.en)}</h2><p className="text-sm text-muted-foreground">{tl(cur.hint[0], cur.hint[1])}</p></div>
        </div>
        <Suspense fallback={<PageSkeleton />}>
          {cur.key === "period" && <PeriodStep orgId={orgId} baseline={b} canCreate={can("operator", "admin")} onCreated={() => go(1)} />}
          {cur.key === "profile" && <ProfileStep editable={editable && can("operator", "admin")} />}
          {cur.key === "calendar" && <EmbedProvider context="baseline"><CalendarPage /></EmbedProvider>}
          {cur.key === "energy" && phase.data && <BaselineDataGrid orgId={orgId} phase={phase.data} canEdit={can("operator", "admin")} />}
          {cur.key === "mobility" && <EmbedProvider context="baseline"><MobilityPage /></EmbedProvider>}
          {cur.key === "waste" && <EmbedProvider context="baseline"><WastePage /></EmbedProvider>}
          {cur.key === "trees" && <div className="space-y-8"><EmbedProvider context="baseline"><TreesPage /></EmbedProvider><AssetUnits orgId={orgId} editable={can("operator", "petugas", "admin")} /></div>}
          {cur.key === "review" && b && <ReviewStep b={b} canSubmit={can("operator", "admin") && editable} onGo={(k) => go(STEPS.findIndex((s) => s.key === k))} />}
        </Suspense>
      </section>

      {/* ---------- navigasi ---------- */}
      <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-2xl bg-card/95 p-3 shadow-lg ring-1 ring-border backdrop-blur">
        <Button variant="outline" disabled={idx === 0} onClick={() => go(idx - 1)}><ArrowLeft /> {tl("Kembali", "Back")}</Button>
        <span className="hidden text-sm text-muted-foreground sm:block">{tl("Langkah", "Step")} {idx + 1} / {STEPS.length} · {tl("tersimpan otomatis", "saved automatically")}</span>
        {idx < STEPS.length - 1 ? <Button disabled={!b} onClick={() => go(idx + 1)}>{tl("Lanjut", "Next")} <ArrowRight /></Button> : <Button variant="outline" render={<Link to="/app/baseline" />}>{tl("Selesai", "Done")} <Check /></Button>}
      </div>
    </div>
  )
}

// ---------- 1. periode acuan ----------
function PeriodStep({ orgId, baseline, canCreate, onCreated }: { orgId: number; baseline: any; canCreate: boolean; onCreated: () => void }) {
  const qc = useQueryClient()
  const monthStart = todayWIB().slice(0, 8) + "01"
  const [p, setP] = useState({ start: addDays(monthStart, -365).slice(0, 8) + "01", end: addDays(monthStart, -1) })
  const months = Math.round((Date.parse(p.end) - Date.parse(p.start)) / (30.44 * 864e5))
  const create = useMutation({
    mutationFn: () => api(`/orgs/${orgId}/baselines`, { method: "POST", json: { period_start: p.start, period_end: p.end } }),
    onSuccess: () => { toast.success(tl("Periode acuan ditetapkan", "Reference period set")); ["baselines", "baseline", "data-phase"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onCreated() },
    onError: (e: Error) => toast.error(e.message),
  })
  if (baseline) return (
    <Card><CardContent className="grid gap-4 sm:grid-cols-3">
      {[[tl("Mulai", "Start"), fmtDate(baseline.period_start)], [tl("Selesai", "End"), fmtDate(baseline.period_end)], [tl("Versi", "Version"), baseline.version_label]].map(([k, v]) => (
        <div key={k} className="rounded-2xl bg-muted/50 p-4"><div className="text-xs text-muted-foreground">{k}</div><div className="mt-1 text-lg font-semibold">{v}</div></div>
      ))}
      <p className="text-sm text-muted-foreground sm:col-span-3">{tl("Periode sudah ditetapkan. Bulan sesudah periode ini diisi lewat Input Berkala setelah Survei Awal disahkan.", "The period is set. Months after it go through Periodic Input once the survey is approved.")}</p>
    </CardContent></Card>
  )
  return (
    <Card>
      <CardHeader><CardTitle>{tl("Tetapkan periode acuan", "Set the reference period")}</CardTitle><CardDescription>{tl("Biasanya 12 bulan terakhir sebelum mulai memakai aplikasi, minimal 3 bulan.", "Usually the last 12 months before using the app, minimum 3 months.")}</CardDescription></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <Field label={tl("Mulai", "Start")}><Input type="date" value={p.start} onChange={(e) => setP({ ...p, start: e.target.value })} /></Field>
        <Field label={tl("Selesai", "End")}><Input type="date" value={p.end} max={todayWIB()} onChange={(e) => setP({ ...p, end: e.target.value })} /></Field>
        <div className="rounded-2xl bg-muted/50 p-4"><div className="text-xs text-muted-foreground">{tl("Panjang", "Length")}</div><div className="mt-1 text-lg font-semibold">{months} {tl("bulan", "months")}</div></div>
      </CardContent>
      {canCreate && <CardFooter className="justify-end"><Button disabled={create.isPending || months < 3 || p.end > todayWIB()} onClick={() => create.mutate()}>{create.isPending ? <Spinner /> : <Plus />} {tl("Mulai Survei Awal", "Start Baseline Survey")}</Button></CardFooter>}
    </Card>
  )
}

// ---------- 2. profil sekolah ----------
const NUMS: [string, string, string][] = [["students", "Jumlah siswa", "Students"], ["teachers", "Jumlah guru", "Teachers"], ["staff", "Jumlah staf", "Staff"], ["building_m2", "Luas bangunan (m²)", "Building area (m²)"], ["base_load_kwh", "Beban listrik hari libur (kWh/hari)", "Holiday base load (kWh/day)"]]
const NONE: [string, string, string][] = [["genset", "Genset", "Generator"], ["lpg", "LPG", "LPG"], ["ac", "AC", "AC"], ["kertas", "Kertas", "Paper"], ["pohon", "Pohon", "Trees"]]
function ProfileStep({ editable }: { editable: boolean }) {
  const { orgId, org } = useOrg()
  const qc = useQueryClient()
  const [f, setF] = useState<any>(null)
  useEffect(() => { if (org) setF(org) }, [org])
  const save = useMutation({
    mutationFn: () => api(`/orgs/${orgId}`, { method: "PATCH", json: { ...Object.fromEntries(NUMS.map(([k]) => [k, Number(f[k] ?? 0)])), sanitation: f.sanitation, school_days_per_week: Number(f.school_days_per_week), none_sources: f.none_sources ?? [] } }),
    onSuccess: () => { toast.success(tl("Profil tersimpan", "Profile saved")); qc.invalidateQueries() },
    onError: (e: Error) => toast.error(e.message),
  })
  if (!f) return <PageSkeleton />
  const pop = Number(f.students ?? 0) + Number(f.teachers ?? 0) + Number(f.staff ?? 0)
  return (
    <Card>
      <CardHeader><CardTitle>{tl("Data sekolah", "School data")}</CardTitle><CardDescription>{tl(`Jumlah warga (${num(pop)} orang) dipakai untuk menskalakan mobilitas, sampah, dan air limbah.`, `Headcount (${num(pop)} people) scales mobility, waste and wastewater.`)}</CardDescription></CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {NUMS.map(([k, id, en]) => <Field key={k} label={tl(id, en)}><Input type="number" min={0} disabled={!editable} value={f[k] ?? 0} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}
        <Field label={tl("Sanitasi", "Sanitation")}><SimpleSelect value={f.sanitation ?? "septik"} onChange={(v) => setF({ ...f, sanitation: v })} options={[{ value: "septik", label: tl("Tangki septik", "Septic tank") }, { value: "ipal", label: tl("IPAL", "Treatment plant") }, { value: "saluran", label: tl("Saluran/drainase", "Open drain") }]} /></Field>
        <Field label={tl("Hari sekolah per minggu", "School days per week")}><SimpleSelect value={String(f.school_days_per_week ?? 6)} onChange={(v) => setF({ ...f, school_days_per_week: Number(v) })} options={[{ value: "5", label: tl("5 hari", "5 days") }, { value: "6", label: tl("6 hari", "6 days") }]} /></Field>
        <Field label={tl("Sumber yang tidak dimiliki sekolah", "Sources the school does not have")} className="sm:col-span-2 lg:col-span-3" hint={tl("Dianggap lengkap pada skor kelengkapan", "Counted as complete in the completeness score")}>
          <div className="flex flex-wrap gap-4">{NONE.map(([k, id, en]) => (
            <label key={k} className="flex items-center gap-2 text-sm"><Checkbox disabled={!editable} checked={(f.none_sources ?? []).includes(k)} onCheckedChange={(c) => setF({ ...f, none_sources: c ? [...(f.none_sources ?? []), k] : (f.none_sources ?? []).filter((x: string) => x !== k) })} />{tl("Tidak ada", "No")} {tl(id, en)}</label>
          ))}</div>
        </Field>
      </CardContent>
      {editable && <CardFooter className="justify-end"><Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? <Spinner /> : <Check />} {tl("Simpan profil", "Save profile")}</Button></CardFooter>}
    </Card>
  )
}

// ---------- 7b. unit AC & biopori ----------
function AssetUnits({ orgId, editable }: { orgId: number; editable: boolean }) {
  const qc = useQueryClient()
  const ac = useQuery({ queryKey: ["assets", orgId, "ac"], queryFn: () => api<any[]>(`/orgs/${orgId}/assets?type=ac`), enabled: !!orgId })
  const bp = useQuery({ queryKey: ["assets", orgId, "biopori"], queryFn: () => api<any[]>(`/orgs/${orgId}/assets?type=biopori`), enabled: !!orgId })
  const [a, setA] = useState({ room: "", gas: "R32", charge_kg: "0.8", pk: "1" })
  const [p, setP] = useState({ diameter_cm: "10", depth_cm: "100" })
  const add = useMutation({
    mutationFn: (b: any) => api(`/orgs/${orgId}/assets`, { method: "POST", json: b }),
    onSuccess: () => { toast.success(tl("Aset tersimpan", "Asset saved")); qc.invalidateQueries({ queryKey: ["assets"] }); qc.invalidateQueries({ queryKey: ["baseline"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Snowflake className="size-4 text-primary" /> {tl("Unit AC", "AC units")}</CardTitle><CardDescription>{tl(`${ac.data?.length ?? 0} unit · dipakai menaksir kebocoran refrigeran bila belum ada catatan servis`, `${ac.data?.length ?? 0} units · used to estimate refrigerant leaks when no service records exist`)}</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="max-h-48 space-y-1 overflow-y-auto">{(ac.data ?? []).map((x) => <div key={x.id} className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-sm"><span>{x.meta?.room ?? x.code}</span><span className="text-xs text-muted-foreground">{x.meta?.gas} · {x.meta?.charge_kg} kg · {x.meta?.pk} PK</span></div>)}</div>
          {editable && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Input placeholder={tl("Ruang", "Room")} value={a.room} onChange={(e) => setA({ ...a, room: e.target.value })} className="col-span-2 sm:col-span-1" />
            <SimpleSelect value={a.gas} onChange={(v) => setA({ ...a, gas: v })} options={["R32", "R410A", "R134A", "R22"].map((g) => ({ value: g, label: g }))} />
            <Input type="number" step="0.1" value={a.charge_kg} onChange={(e) => setA({ ...a, charge_kg: e.target.value })} aria-label={tl("Muatan kg", "Charge kg")} />
            <Button disabled={!a.room || add.isPending} onClick={() => { add.mutate({ type: "ac", meta: { room: a.room, gas: a.gas, charge_kg: Number(a.charge_kg), pk: Number(a.pk) } }); setA({ ...a, room: "" }) }}><Plus /> {tl("Tambah", "Add")}</Button>
          </div>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Droplets className="size-4 text-primary" /> {tl("Biopori", "Biopores")}</CardTitle><CardDescription>{tl(`${bp.data?.length ?? 0} lubang · jasa lingkungan resapan air`, `${bp.data?.length ?? 0} holes · water infiltration service`)}</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {editable && <div className="grid grid-cols-3 gap-2">
            <Field label={tl("Diameter (cm)", "Diameter (cm)")}><Input type="number" value={p.diameter_cm} onChange={(e) => setP({ ...p, diameter_cm: e.target.value })} /></Field>
            <Field label={tl("Kedalaman (cm)", "Depth (cm)")}><Input type="number" value={p.depth_cm} onChange={(e) => setP({ ...p, depth_cm: e.target.value })} /></Field>
            <Button className="self-end" disabled={add.isPending} onClick={() => add.mutate({ type: "biopori", meta: { diameter_cm: Number(p.diameter_cm), depth_cm: Number(p.depth_cm) } })}><Plus /> {tl("Tambah", "Add")}</Button>
          </div>}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------- 8. tinjau & ajukan ----------
const COMP_LABEL: Record<string, [string, string, StepKey]> = {
  profil: ["Profil sekolah", "School profile", "profile"], listrik: ["Listrik PLN", "Grid electricity", "energy"], lpg: ["LPG", "LPG", "energy"], genset: ["Genset", "Generator", "energy"], kertas: ["Kertas", "Paper", "energy"],
  mobilitas: ["Mobilitas", "Mobility", "mobility"], sampah: ["Sampah (penimbangan)", "Waste (weighing)", "waste"], pohon: ["Pohon", "Trees", "trees"], ac: ["AC & refrigeran", "AC & refrigerant", "trees"], air_limbah: ["Air limbah (sanitasi)", "Wastewater (sanitation)", "profile"],
}
function ReviewStep({ b, canSubmit, onGo }: { b: any; canSubmit: boolean; onGo: (k: StepKey) => void }) {
  const qc = useQueryClient()
  const comp = b.completeness
  const act = useMutation({
    mutationFn: (path: string) => api(path, { method: "POST", json: {} }),
    onSuccess: (_, path) => { toast.success(path.endsWith("request") ? tl("Diajukan ke Admin", "Submitted to Admin") : tl("Dihitung ulang", "Recalculated")); ["baselines", "baseline", "data-phase"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })) },
    onError: (e: Error) => toast.error(e.message),
  })
  const rows = [["profil", comp.profil], ...Object.entries<any>(comp.components)] as [string, any][]
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader><CardTitle>{tl("Kelengkapan data", "Data completeness")}</CardTitle><CardDescription>{tl("Wajib: profil, listrik, mobilitas, sampah, pohon. Minimal skor 80% untuk diajukan.", "Required: profile, electricity, mobility, waste, trees. Minimum score 80% to submit.")}</CardDescription></CardHeader>
        <CardContent className="space-y-1">
          {rows.map(([k, v]) => {
            const L = COMP_LABEL[k]; if (!L) return null
            return (
              <button key={k} type="button" onClick={() => onGo(L[2])} className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-muted/60">
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", v.filled ? "bg-primary text-primary-foreground" : "bg-amber-500/15 text-amber-700 dark:text-amber-300")}>{v.filled ? <Check className="size-4" /> : "!"}</span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{tl(L[0], L[1])}{comp.missingRequired.includes(k) && <span className="ml-1.5 text-xs text-destructive">{tl("wajib", "required")}</span>}</span><span className="block truncate text-xs text-muted-foreground">{v.detail}</span></span>
                <ArrowRight className="size-4 text-muted-foreground" />
              </button>
            )
          })}
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card><CardContent className="space-y-3 text-center">
          <div className="text-5xl font-semibold tabular">{num(comp.score, 0)}%</div>
          <div className="text-sm text-muted-foreground">{tl("skor kelengkapan", "completeness score")}</div>
          <div className="text-xs text-muted-foreground">{tl("Porsi estimasi", "Estimate share")} {num((b.estimate_share ?? 0) * 100, 0)}% · {tl("total periode", "period total")} {num((b.summary?.total ?? 0) / 1000, 2)} t CO₂e</div>
        </CardContent></Card>
        {canSubmit && <>
          <Button variant="outline" className="w-full" onClick={() => act.mutate(`/baselines/${b.id}/recompute`)} disabled={act.isPending}><RefreshCcw /> {tl("Hitung ulang", "Recalculate")}</Button>
          <Button className="w-full" onClick={() => act.mutate(`/baselines/${b.id}/request`)} disabled={act.isPending || !b.canSubmit}><Send /> {tl("Ajukan ke Admin", "Submit to Admin")}</Button>
          {!b.canSubmit && <p className="text-center text-xs text-muted-foreground">{tl("Lengkapi komponen wajib & skor ≥ 80% untuk mengajukan.", "Complete required items & score ≥ 80% to submit.")}</p>}
        </>}
        {!canSubmit && <p className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">{b.status === "diajukan" ? tl("Sudah diajukan — menunggu Admin mengesahkan & mengunci.", "Submitted — waiting for the Admin to approve & lock.") : tl("Hanya Operator yang dapat mengajukan.", "Only the Operator can submit.")}</p>}
      </div>
    </div>
  )
}
