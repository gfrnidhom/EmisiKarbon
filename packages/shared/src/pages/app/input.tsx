import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import * as XLSX from "xlsx"
import { ArrowRight, BookOpenCheck, Camera, Cpu, FileSpreadsheet, Flame, Fuel, History, Paperclip, Send, Snowflake, Sun, TriangleAlert, Upload, Zap, FileText, Save } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { RowActions, usePerm } from "@/components/row-actions"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState, Field, PageHeader, PageSkeleton, SimpleSelect, Spinner, StatusBadge, QualityBadge } from "@/components/common"
import { api, fileUrl, uploadEvidence } from "@/lib/api"
import { useOrg } from "@/lib/hooks"
import { fmtDateTime, fmtMonth, monthAdd, num, todayWIB } from "@/lib/format"
import { MonitoringCalendar, usePhase } from "@/components/data-phase"
import { cn } from "@/lib/utils"
import { t, tl } from "@/lib/i18n"

const KINDS = [
  { v: "listrik", label: t("Listrik"), icon: Zap, unit: "kWh", hint: t("Angka kWh pada tagihan/riwayat token bulan tersebut") },
  { v: "plts", label: t("PLTS"), icon: Sun, unit: "kWh", hint: t("Produksi bulanan dari aplikasi/inverter — dihitung sebagai emisi terhindar") },
  { v: "lpg", label: t("LPG"), icon: Flame, unit: "kg", hint: t("Jumlah tabung × ukuran tabung") },
  { v: "genset", label: t("Genset"), icon: Fuel, unit: "liter", hint: t("Liter solar dari nota BBM / log genset") },
  { v: "ac", label: t("Servis AC"), icon: Snowflake, unit: "kg", hint: t("kg refrigeran yang diisi ulang (top-up) saat servis") },
  { v: "kertas", label: t("Kertas"), icon: FileText, unit: "rim", hint: t("Rim kertas dari dokumen pengadaan/BOS") },
]

export default function InputPage() {
  const { orgId, can } = useOrg()
  const qc = useQueryClient()
  const [kind, setKind] = useState("listrik")
  const k = KINDS.find((x) => x.v === kind)!
  const lastMonth = monthAdd(todayWIB().slice(0, 7), -1)
  const [form, setForm] = useState<any>({ period: lastMonth, quantity: "", method: "aktual", tabung: "3", count: "", gas: "R32", customer_id: "", note: "", unit_code: "" })
  const [files, setFiles] = useState<{ id: number; name: string; flags: string[] }[]>([])
  const [uploading, setUploading] = useState(false)
  const [hist, setHist] = useState<number | null>(null)
  const [importRows, setImportRows] = useState<any[] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const xlsRef = useRef<HTMLInputElement>(null)
  const set = (key: string, v: string) => setForm((f: any) => ({ ...f, [key]: v }))

  const phase = usePhase(orgId)
  const minMonth = phase.data?.monitoringFrom ?? undefined
  useEffect(() => { if (minMonth && form.period < minMonth) setForm((f: any) => ({ ...f, period: minMonth > todayWIB().slice(0, 7) ? todayWIB().slice(0, 7) : minMonth })) }, [minMonth]) // eslint-disable-line
  const { data: allRows, isLoading } = useQuery({ queryKey: ["activities", orgId], queryFn: () => api<any[]>(`/orgs/${orgId}/activities`), enabled: !!orgId })
  const rows = useMemo(() => (allRows ?? []).filter((r) => r.phase === "pemantauan"), [allRows])
  const { data: acUnits } = useQuery({ queryKey: ["assets", orgId, "ac"], queryFn: () => api<any[]>(`/orgs/${orgId}/assets?type=ac`), enabled: !!orgId && kind === "ac" })
  const filtered = useMemo(() => (rows ?? []).filter((r) => r.source === kind), [rows, kind])
  const qty = kind === "lpg" && form.count ? Number(form.count) * Number(form.tabung) : Number(form.quantity)

  const save = useMutation({
    mutationFn: (submit: boolean) => api(`/orgs/${orgId}/activities`, {
      method: "POST",
      json: {
        source: kind, period: form.period, quantity: qty, method: form.method, submit, context: "berkala", note: form.note || undefined, evidence_ids: files.map((f) => f.id),
        meta: kind === "listrik" ? { customer_id: form.customer_id || undefined } : kind === "lpg" ? { tabung_kg: Number(form.tabung), count: Number(form.count) || undefined } : kind === "ac" ? { gas: form.gas, unit: form.unit_code || undefined } : {},
      },
    }),
    onSuccess: (r: any, submit) => {
      toast.success(submit ? (can("operator", "admin") ? tl("Tersimpan & disahkan", "Saved & approved") : tl("Tersimpan & diajukan ke operator", "Saved & sent to the operator")) : t("Tersimpan sebagai draf"), { description: r.flags?.length ? r.flags.join(" · ") : undefined })
      setFiles([]); setForm((f: any) => ({ ...f, quantity: "", count: "", note: "" }))
      qc.invalidateQueries({ queryKey: ["activities"] }); qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const submit = useMutation({
    mutationFn: (id: number) => api(`/orgs/${orgId}/activities/${id}/submit`, { method: "POST" }),
    onSuccess: () => { toast.success(t("Diajukan")); qc.invalidateQueries({ queryKey: ["activities"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return
    setUploading(true)
    try {
      for (const f of Array.from(list)) {
        const r = await uploadEvidence(orgId, f)
        setFiles((x) => [...x, { id: r.id, name: f.name, flags: r.flags }])
        if (r.flags.length) toast.warning(r.flags.join(" · "))
      }
    } catch (e) { toast.error((e as Error).message) } finally { setUploading(false) }
  }
  // BASE-03: impor Excel templat, validasi per baris
  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([["sumber", "periode (YYYY-MM)", "kuantitas", "metode (aktual/estimasi)"], ["listrik", "2025-07", 1180, "aktual"], ["lpg", "2025-07", 15, "aktual"], ["kertas", "2025-07", 8, "aktual"]])
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Data_aktivitas"); XLSX.writeFile(wb, "templat-data-aktivitas-jejakhijau.xlsx")
  }
  const onImport = async (f?: File) => {
    if (!f) return
    const wb = XLSX.read(await f.arrayBuffer())
    const data: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
    const parsed = data.slice(1).filter((r) => r.length).map((r, i) => {
      const [source, period, quantity, method = "aktual"] = r
      const errors: string[] = []
      if (!KINDS.find((x) => x.v === source)) errors.push("sumber tidak dikenal")
      if (!/^\d{4}-\d{2}$/.test(String(period))) errors.push("periode harus YYYY-MM")
      if (!(Number(quantity) >= 0)) errors.push("kuantitas bukan angka")
      if (!["aktual", "estimasi"].includes(String(method))) errors.push("metode tidak valid")
      return { row: i + 2, source, period: String(period), quantity: Number(quantity), method, errors, done: false }
    })
    setImportRows(parsed)
  }
  const runImport = async () => {
    if (!importRows) return
    const out = [...importRows]
    for (const r of out) {
      if (r.errors.length) continue
      try { await api(`/orgs/${orgId}/activities`, { method: "POST", json: { source: r.source, period: r.period, quantity: r.quantity, method: r.method, context: "berkala" } }); r.done = true }
      catch (e) { r.errors.push((e as Error).message) }
    }
    setImportRows(out)
    qc.invalidateQueries({ queryKey: ["activities"] })
    toast.success(t("{n} baris diimpor", { n: out.filter((r) => r.done).length }))
  }

  const needsEvidence = kind === "listrik" && form.method === "aktual" && files.length === 0
  const canEdit = can("operator", "petugas", "admin")
  const perm = usePerm()

  return (
    <div className="space-y-8">
      <PageHeader icon={Flame} title={tl("Input Berkala · Energi", "Periodic Input · Energy")} description={tl("Data bulanan setelah periode acuan. Data periode acuan diisi sekali di Survei Awal, jadi keduanya tidak tercampur.", "Monthly data after the reference period. Reference-period data is entered once in the Baseline Survey, so the two never mix.")}
        actions={<>
          <Button variant="outline" size="sm" onClick={downloadTemplate}><FileSpreadsheet /> {t("Templat Excel")}</Button>
          {canEdit && <Button variant="outline" size="sm" onClick={() => xlsRef.current?.click()}><Upload /> {t("Impor Excel")}</Button>}
          <input ref={xlsRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { onImport(e.target.files?.[0]); e.target.value = "" }} />
        </>} />

      {phase.data && !phase.data.baseline ? (
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-primary/15 p-6 sm:flex-row sm:items-center">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><BookOpenCheck className="size-5" /></span>
          <div className="flex-1"><div className="font-semibold">{tl("Mulai Survei Awal dulu", "Start the Baseline Survey first")}</div><p className="text-sm text-muted-foreground">{tl("Input berkala dibuka setelah periode acuan ditetapkan, supaya data awal dan data pemantauan tidak tercampur.", "Periodic input opens once the reference period is set, so baseline and monitoring data never mix.")}</p></div>
          <Button render={<Link to="/app/baseline" />}>{tl("Ke Survei Awal", "Go to Baseline Survey")} <ArrowRight /></Button>
        </div>
      ) : phase.data && <MonitoringCalendar phase={phase.data} rows={rows} onPick={(src, m) => { if (KINDS.some((x) => x.v === src)) { setKind(src); setFiles([]); set("period", m) } }} />}

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader><CardTitle>{t("Entri baru")}</CardTitle><CardDescription>{k.hint}</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {KINDS.map((x) => (
                <button key={x.v} onClick={() => { setKind(x.v); setFiles([]) }} className={cn("flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-muted/50 text-xs transition-all", kind === x.v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                  <x.icon className="size-5" />{x.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("Periode")}><Input type="month" value={form.period} min={minMonth} max={todayWIB().slice(0, 7)} onChange={(e) => set("period", e.target.value)} className="h-11" /></Field>
              <Field label={t("Metode")}><SimpleSelect value={form.method} onChange={(v) => set("method", v)} className="h-11" options={[{ value: "aktual", label: t("Aktual") }, { value: "estimasi", label: t("Estimasi") }]} /></Field>
            </div>
            {kind === "lpg" ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("Jumlah tabung")}><Input type="number" inputMode="numeric" value={form.count} onChange={(e) => set("count", e.target.value)} className="h-11" /></Field>
                <Field label={t("Ukuran tabung")}><SimpleSelect value={form.tabung} onChange={(v) => set("tabung", v)} className="h-11" options={[{ value: "3", label: t("3 kg") }, { value: "5.5", label: t("5,5 kg") }, { value: "12", label: t("12 kg") }]} /></Field>
                <p className="col-span-2 text-sm text-muted-foreground">{t("Total:")} <b className="text-foreground">{num(qty || 0, 1)} {t("kg")}</b></p>
              </div>
            ) : (
              <Field label={`Kuantitas (${k.unit})`}><Input type="number" inputMode="decimal" step="any" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} className="h-12 text-lg tabular" placeholder="0" /></Field>
            )}
            {kind === "listrik" && <Field label={t("ID pelanggan PLN")} hint={tl("Dicocokkan operator dengan tagihan", "Matched against the bill by the operator")}><Input value={form.customer_id} onChange={(e) => set("customer_id", e.target.value)} placeholder={t("5123xxxxxxxx")} /></Field>}
            {kind === "ac" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("Unit")}><SimpleSelect value={form.unit_code} onChange={(v) => { set("unit_code", v); const u = acUnits?.find((a) => a.code === v); if (u?.meta?.gas) set("gas", u.meta.gas) }} options={(acUnits ?? []).map((a) => ({ value: a.code, label: `${a.code} · ${a.meta?.room ?? ""}` }))} /></Field>
                <Field label={t("Jenis gas")}><SimpleSelect value={form.gas} onChange={(v) => set("gas", v)} options={["R32", "R410A", "R134A", "R22"].map((g) => ({ value: g, label: g }))} /></Field>
              </div>
            )}
            <Field label={t("Bukti")} hint={kind === "listrik" ? t("Wajib: foto/PDF tagihan atau riwayat token") : "Foto nota/dokumen (dikompres ≤ 500 KB)"}>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? <Spinner /> : <Camera />} {t("Foto / unggah")}</Button>
                <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = "" }} />
                {files.map((f) => <Badge key={f.id} variant="secondary" className={cn("gap-1", f.flags.length && "bg-amber-500/15 text-amber-700")}><Paperclip className="size-3" />{f.name.slice(0, 18)}</Badge>)}
              </div>
            </Field>
            <Field label={t("Catatan (opsional)")}><Textarea rows={2} value={form.note} onChange={(e) => set("note", e.target.value)} /></Field>
            {canEdit ? (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-11" disabled={save.isPending || !(qty >= 0) || (!form.quantity && !form.count)} onClick={() => save.mutate(false)}><Save /> {t("Simpan draf")}</Button>
                <Button className="h-11" disabled={save.isPending || needsEvidence || (!form.quantity && !form.count)} onClick={() => save.mutate(true)}>{save.isPending ? <Spinner /> : <Send />} {t("Simpan & ajukan")}</Button>
              </div>
            ) : <p className="text-sm text-muted-foreground">{t("Hanya operator yang dapat menginput data.")}</p>}
            {needsEvidence && <p className="flex items-center gap-1.5 text-xs text-amber-600"><TriangleAlert className="size-3.5" /> {t("Data listrik tanpa bukti tagihan tidak bisa diajukan.")}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("Riwayat")} {k.label.toLowerCase()}</CardTitle>
            <CardDescription>{t("Status data: Draf → Diajukan → Terverifikasi → Terkunci")}</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Tabs value={kind} onValueChange={(v) => setKind(String(v))} className="px-6 pb-3">
              <TabsList className="flex-wrap">{KINDS.map((x) => <TabsTrigger key={x.v} value={x.v}>{x.label}</TabsTrigger>)}</TabsList>
            </Tabs>
            {isLoading ? <div className="px-6"><PageSkeleton /></div> : filtered.length === 0 ? <div className="px-6"><EmptyState icon={Cpu} title={t("Belum ada data")} description={t("Input data bulan pertama di formulir.")} /></div> : (
              <Table>
                <TableHeader><TableRow><TableHead className="pl-6">{t("Periode")}</TableHead><TableHead className="text-right">{t("Kuantitas")}</TableHead><TableHead>{t("Status")}</TableHead><TableHead className="hidden md:table-cell">{t("Catatan sistem")}</TableHead><TableHead className="pr-6 text-right">{t("Aksi")}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="pl-6"><div className="font-medium">{fmtMonth(r.period)}</div><div className="text-[0.6875rem] text-muted-foreground">{t("rev")} {r.revision}{r.method !== "aktual" && <> · <QualityBadge label={r.method} className="h-4 text-[0.625rem]" /></>}</div></TableCell>
                      <TableCell className="text-right tabular">{num(r.quantity, 1)} <span className="text-xs text-muted-foreground">{r.unit}</span></TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="hidden max-w-64 md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {r.flags.map((f: string) => <Badge key={f} variant="outline" className={cn("whitespace-normal text-[0.625rem]", f.startsWith("Anomali") && "border-red-500/30 text-red-600")}>{f}</Badge>)}
                          {r.evidence_ids.map((id: number) => <a key={id} href={fileUrl(id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[0.6875rem] text-primary"><Paperclip className="size-3" />{t("bukti")}</a>)}
                        </div>
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <div className="flex justify-end gap-1">
                          {["draf", "perlu_perbaikan"].includes(r.status) && canEdit && <Button size="xs" variant="outline" onClick={() => submit.mutate(r.id)}>{t("Ajukan")}</Button>}
                          <RowActions onView={() => setHist(r.id)}
                            onEdit={perm.manage && r.status !== "terkunci" ? () => { setForm((f: any) => ({ ...f, period: r.period, quantity: String(r.quantity), method: r.method ?? "aktual", note: r.note ?? "" })); window.scrollTo({ top: 0, behavior: "smooth" }); toast.info(tl(`Ubah ${fmtMonth(r.period)} di formulir — disimpan sebagai revisi baru`, `Edit ${fmtMonth(r.period)} in the form — saved as a new revision`)) } : undefined}
                            del={perm.manage && r.status !== "terkunci" ? { path: `/orgs/${orgId}/activities/${r.id}`, title: tl(`Hapus data ${fmtMonth(r.period)}?`, `Delete ${fmtMonth(r.period)}?`), description: r.revision > 1 ? tl("Revisi ini dihapus dan revisi sebelumnya aktif kembali. Angka emisi dihitung ulang.", "This revision is removed and the previous one becomes active again. Emissions are recalculated.") : undefined, invalidate: [["activities"]] } : undefined} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
      <HistoryDialog orgId={orgId} id={hist} onClose={() => setHist(null)} />
      <Dialog open={!!importRows} onOpenChange={(o) => !o && setImportRows(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{t("Pratinjau impor")}</DialogTitle><DialogDescription>{t("Baris salah ditampilkan dengan alasan dan tidak diimpor.")}</DialogDescription></DialogHeader>
          <div className="max-h-96 overflow-auto rounded-2xl border">
            <Table>
              <TableHeader><TableRow><TableHead>{t("Baris")}</TableHead><TableHead>{t("Sumber")}</TableHead><TableHead>{t("Periode")}</TableHead><TableHead className="text-right">{t("Kuantitas")}</TableHead><TableHead>{t("Hasil")}</TableHead></TableRow></TableHeader>
              <TableBody>{importRows?.map((r) => (
                <TableRow key={r.row} className={r.errors.length ? "bg-destructive/5" : ""}>
                  <TableCell>{r.row}</TableCell><TableCell>{String(r.source)}</TableCell><TableCell>{r.period}</TableCell><TableCell className="text-right">{num(r.quantity, 1)}</TableCell>
                  <TableCell className="text-xs">{r.done ? <span className="text-primary">{t("✓ diimpor")}</span> : r.errors.length ? <span className="text-destructive">{r.errors.join("; ")}</span> : "siap"}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
          <Button onClick={runImport} disabled={!importRows?.some((r) => !r.errors.length && !r.done)}>{t("Impor")} {importRows?.filter((r) => !r.errors.length && !r.done).length} {t("baris valid")}</Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function HistoryDialog({ orgId, id, onClose }: { orgId: number; id: number | null; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ["act-history", id], queryFn: () => api<any>(`/orgs/${orgId}/activities/${id}/history`), enabled: !!id })
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("Riwayat revisi")}</DialogTitle><DialogDescription>{t("Data tidak pernah dihapus — koreksi membuat revisi baru.")}</DialogDescription></DialogHeader>
        <div className="space-y-2">
          {data?.revisions.map((r: any) => (
            <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-muted/50 p-3.5 text-sm">
              <Badge variant="outline">{t("rev")} {r.revision}</Badge><span className="tabular">{num(r.quantity, 1)} {r.unit}</span><StatusBadge status={r.status} />
              <span className="ml-auto text-xs text-muted-foreground">{r.creator} · {fmtDateTime(r.created_at)}</span>
            </div>
          ))}
          {data?.findings.map((f: any) => <div key={f.id} className="rounded-lg bg-destructive/5 p-3 text-sm"><Badge variant="destructive" className="mr-2">{f.category}</Badge>{f.note}</div>)}
        </div>
      </DialogContent>
    </Dialog>
  )
}
