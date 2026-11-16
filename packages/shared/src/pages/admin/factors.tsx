import { useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import * as XLSX from "xlsx"
import { CircleAlert, Download, ExternalLink, Factory, FileUp, History, Plus, RotateCcw, Save, Search, ShieldCheck, Sparkles, X } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SourceLabel } from "@/components/source-label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Field, PageHeader, PageSkeleton, SimpleSelect, Spinner } from "@/components/common"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { fmtDate, num, todayWIB } from "@/lib/format"
import { lang, t, tOther } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type F = Record<string, any>
const STATUS: Record<string, { label: string; cls: string }> = {
  referensi: { label: "Referensi", cls: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" },
  perlu_verifikasi: { label: "Perlu verifikasi", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  belum_diisi: { label: "Belum diisi", cls: "bg-yellow-400/25 text-yellow-800 dark:text-yellow-200" },
}
const CATEGORY_ORDER = ["Listrik", "Bahan bakar", "Transportasi", "Refrigeran", "Gas khusus", "GWP", "Sampah", "Limbah", "Air limbah", "Kertas", "Pembelian barang", "Barang modal", "Pertanian", "Pohon"]
const shortUnit = (u: string) => u?.replace(/^kg CO2e?\/?/i, "/").replace(/^kg C\/kg/, "/kg").replace(/^GWP$/, "GWP") || ""
const nextVersion = (versions: string[]) => {
  const top = versions[0] ?? "FE-2026.1"
  const m = top.match(/^(.*\.)(\d+)$/)
  return m ? `${m[1]}${Number(m[2]) + 1}` : `${top}-b`
}
const nm = (f: F) => (lang === "en" ? f.name_en || f.name : f.name)

export default function Factors() {
  const qc = useQueryClient()
  const { has } = useAuth()
  const isAdmin = has("admin")
  const { data, isLoading } = useQuery({ queryKey: ["factors-all"], queryFn: () => api<F[]>("/admin/factors?all=1") })
  const versions = useMemo(() => [...new Set((data ?? []).map((f) => f.version as string))].sort().reverse(), [data])
  const [version, setVersion] = useState("latest")
  const [cat, setCat] = useState("Semua")
  const [status, setStatus] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saveOpen, setSaveOpen] = useState(false)
  const [meta, setMeta] = useState({ version: "", valid_from: todayWIB(), note: "" })
  const [hist, setHist] = useState<string | null>(null)
  const [add, setAdd] = useState<F | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  // Tampilan per versi: untuk tiap kode, baris dengan versi terbesar ≤ versi terpilih
  const rows = useMemo(() => {
    if (!data) return []
    if (version === "latest") return data.filter((f) => f.active)
    const by = new Map<string, F>()
    for (const f of data) if (f.version <= version) { const cur = by.get(f.code); if (!cur || cur.version < f.version) by.set(f.code, f) }
    return [...by.values()]
  }, [data, version])
  const cats = useMemo(() => ["Semua", ...CATEGORY_ORDER.filter((c) => rows.some((r) => r.category === c)), ...[...new Set(rows.map((r) => r.category))].filter((c) => !CATEGORY_ORDER.includes(c))], [rows])
  const shown = useMemo(() => rows
    .filter((f) => cat === "Semua" || f.category === cat)
    .filter((f) => !status || f.status === status)
    .filter((f) => !search || `${f.ext_id} ${f.code} ${f.name} ${f.name_en} ${f.source}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)) || String(a.ext_id).localeCompare(String(b.ext_id), undefined, { numeric: true })), [rows, cat, status, search])
  const counts: Record<string, number> = useMemo(() => ({ total: rows.length, ...Object.fromEntries(Object.keys(STATUS).map((s) => [s, rows.filter((r) => r.status === s).length])) }), [rows])
  const editable = isAdmin && version === "latest"
  const changed = Object.entries(edits).filter(([code, v]) => {
    const f = rows.find((r) => r.code === code)
    return f && (v === "" ? f.value !== null : Number(v.replace(",", ".")) !== f.value)
  })

  const save = useMutation({
    mutationFn: () => api<any>("/admin/factors/batch", { method: "POST", json: { ...meta, changes: changed.map(([code, v]) => ({ code, value: v === "" ? null : Number(v.replace(",", ".")) })) } }),
    onSuccess: (r) => { toast.success(t("Versi {v} aktif — {n} faktor diperbarui. Riwayat lama tetap memakai versi sebelumnya.", { v: r.version, n: r.saved })); setEdits({}); setSaveOpen(false); qc.invalidateQueries({ queryKey: ["factors-all"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
  const create = useMutation({
    mutationFn: () => api<any>("/admin/factors/batch", { method: "POST", json: { version: add!.version, valid_from: todayWIB(), created: [{ ...add, value: add!.value === "" ? null : Number(String(add!.value).replace(",", ".")) }] } }),
    onSuccess: () => { toast.success(t("Faktor baru ditambahkan")); setAdd(null); qc.invalidateQueries({ queryKey: ["factors-all"] }) },
    onError: (e: Error) => toast.error(e.message),
  })

  const exportXlsx = () => {
    const sheet = shown.map((f) => ({
      Id: f.ext_id, Kategori: f.category, Scope: f.scope, "Sumber emisi": f.name, "Emission source": f.name_en, "Satuan aktivitas": f.activity_unit,
      "Faktor emisi": f.value, "Satuan faktor": f.unit, "Gas cakupan": f.gas, "Basis gwp": f.gwp_basis, "Sumber referensi": f.source, "Status data": t(STATUS[f.status]?.label ?? f.status), Versi: f.version, Kode: f.code,
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), "Database_Faktor_Emisi")
    XLSX.writeFile(wb, `faktor-emisi-${version === "latest" ? versions[0] : version}.xlsx`)
  }
  // Impor: kolom "Id" + "Faktor emisi" → menjadi perubahan (belum disimpan) yang bisa ditinjau
  const onImport = async (file?: File) => {
    if (!file) return
    const wb = XLSX.read(await file.arrayBuffer())
    const list: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
    const next: Record<string, string> = { ...edits }
    let n = 0, skipped = 0
    for (const r of list) {
      const id = String(r.Id ?? r.ID ?? r.id ?? "").trim()
      const f = rows.find((x) => x.ext_id === id || x.code === id)
      if (!f) { if (id) skipped++; continue }
      const raw = r["Faktor emisi"] ?? r["Faktor"] ?? r.value
      const v = raw === undefined || raw === null || raw === "" ? "" : String(raw)
      if ((v === "" && f.value !== null) || (v !== "" && Number(v.replace(",", ".")) !== f.value)) { next[f.code] = v; n++ }
    }
    setEdits(next)
    toast.info(t("{n} perubahan dari berkas siap ditinjau{s}", { n, s: skipped ? t(" · {k} ID tidak dikenal dilewati", { k: skipped }) : "" }))
  }

  if (isLoading) return <PageSkeleton />
  return (
    <div className="space-y-8 pb-24">
      <PageHeader icon={Factory} title={t("Faktor Emisi")} badge={<span className="text-lg font-normal text-muted-foreground">· {tOther("Faktor Emisi")}</span>}
        description={<>{t("Admin program · berlaku untuk semua sekolah")} · GWP IPCC AR5</>}
        actions={<>
          <SimpleSelect className="h-10 w-52 rounded-xl" value={version} onChange={(v) => { setVersion(v); setEdits({}) }}
            options={[{ value: "latest", label: `${t("Versi aktif")} · ${versions[0] ?? ""}` }, ...versions.map((v) => ({ value: v, label: `${t("Versi")} ${v.replace(/^FE-/, "")}` }))]} />
          <Button variant="outline" className="h-10 rounded-xl" onClick={exportXlsx}><Download /> {t("Unduh")}</Button>
          {isAdmin && <>
            <Button variant="outline" className="h-10 rounded-xl" onClick={() => importRef.current?.click()} disabled={!editable}><FileUp /> {t("Impor")}</Button>
            <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { onImport(e.target.files?.[0]); e.target.value = "" }} />
            <Button className="h-10 rounded-xl" disabled={!editable} onClick={() => setAdd({ ext_id: "", name: "", name_en: "", category: cat === "Semua" ? "Pembelian barang" : cat, scope: "3", activity_unit: "", unit: "kg CO2e/", gas: "CO2e", gwp_basis: "-", source: "", value: "", version: nextVersion(versions) })}><Plus /> {t("Faktor")}</Button>
          </>}
        </>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[{ k: null, label: "Total faktor", n: counts.total, cls: "from-primary/12 to-transparent", icon: Factory },
          { k: "referensi", label: "Referensi", n: counts.referensi, cls: "from-emerald-500/12 to-transparent", icon: ShieldCheck },
          { k: "perlu_verifikasi", label: "Perlu verifikasi", n: counts.perlu_verifikasi, cls: "from-amber-500/15 to-transparent", icon: CircleAlert },
          { k: "belum_diisi", label: "Belum diisi", n: counts.belum_diisi, cls: "from-yellow-400/25 to-transparent", icon: Sparkles }].map((s) => (
          <button key={s.label} onClick={() => setStatus(s.k)} className={cn("rounded-2xl bg-card p-5 text-left transition-all hover:ring-1 hover:ring-primary/30", status === s.k && "ring-2 ring-primary")}>
            <div className="flex items-center justify-between text-xs text-muted-foreground">{t(s.label)}<s.icon className="size-4" /></div>
            <div className="mt-1 text-2xl font-semibold tabular">{s.n ?? 0}</div>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden rounded-xl py-0">
        <div className="flex flex-col gap-3 border-b bg-muted/30 p-3 sm:flex-row sm:items-center">
          <div className="relative sm:w-72"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="h-9 rounded-lg bg-background pl-9" placeholder={t("Cari ID, aktivitas, sumber…")} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
            {cats.map((c) => (
              <button key={c} onClick={() => setCat(c)} className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors", cat === c ? "bg-foreground text-background" : "bg-background text-muted-foreground ring-1 ring-border hover:text-foreground")}>
                {t(c)} <span className="opacity-60">{c === "Semua" ? rows.length : rows.filter((r) => r.category === c).length}</span>
              </button>
            ))}
          </div>
        </div>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20 hover:bg-muted/20">
                  <TableHead className="w-24 pl-5">ID</TableHead>
                  <TableHead className="w-16">Scope</TableHead>
                  <TableHead>{t("Aktivitas")}</TableHead>
                  <TableHead className="w-56">{t("Faktor")} (kg CO₂e)</TableHead>
                  <TableHead className="hidden xl:table-cell">{t("Sumber")}</TableHead>
                  <TableHead className="pr-5">{t("Status data")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((f) => {
                  const v = edits[f.code] ?? (f.value === null ? "" : String(f.value))
                  const dirty = changed.some(([c]) => c === f.code)
                  const empty = v === ""
                  return (
                    <TableRow key={f.code} className={cn("group", dirty && "bg-primary/5", f.status === "belum_diisi" && !dirty && "bg-yellow-400/[0.06]")}>
                      <TableCell className="pl-5">
                        <button onClick={() => setHist(f.code)} className="flex items-center gap-1 font-mono text-xs font-medium text-foreground/80 hover:text-primary">{f.ext_id}<History className="size-3 opacity-0 group-hover:opacity-60" /></button>
                      </TableCell>
                      <TableCell>
                        <span className={cn("inline-flex size-7 items-center justify-center rounded-lg text-xs font-semibold", f.scope === "1" ? "bg-scope1/15 text-scope1" : f.scope === "2" ? "bg-scope2/20 text-amber-700 dark:text-scope2" : f.scope === "3" ? "bg-scope3/15 text-scope3" : "bg-muted text-muted-foreground")}>{f.scope === "serapan" ? "C" : f.scope}</span>
                      </TableCell>
                      <TableCell className="min-w-56 max-w-80 whitespace-normal">
                        <div className="font-medium leading-snug">{nm(f)}</div>
                        <div className="mt-0.5 flex flex-wrap gap-x-2 text-[0.6875rem] text-muted-foreground">
                          <span>{t(f.category)}</span>·<span>{t("per")} {f.activity_unit}</span>{f.gas && f.gas !== "-" && <>·<span>{f.gas}</span></>}{f.gwp_basis && f.gwp_basis !== "-" && <>·<span>{f.gwp_basis}</span></>}
                          {f.non_national ? <Badge variant="outline" className="h-4 border-fuchsia-500/30 px-1 text-[0.5625rem] text-fuchsia-600">{t("Non-nasional")}</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={cn("flex h-9 w-48 items-center overflow-hidden rounded-lg border bg-background shadow-xs transition-shadow focus-within:ring-2 focus-within:ring-ring/40",
                          empty && "border-yellow-400 bg-yellow-50 dark:bg-yellow-400/10", dirty && "border-primary")}>
                          <input inputMode="decimal" disabled={!editable} value={v} placeholder={empty ? t("kosong") : undefined}
                            onChange={(e) => setEdits({ ...edits, [f.code]: e.target.value.replace(/[^\d.,]/g, "") })}
                            className="h-full min-w-0 flex-1 bg-card px-2.5 font-mono text-sm tabular outline-none disabled:cursor-default" />
                          <span className="flex h-full items-center border-l bg-muted/50 px-2 text-[0.6875rem] whitespace-nowrap text-muted-foreground" title={f.unit}>{shortUnit(f.unit)}</span>
                        </div>
                        {dirty && <div className="mt-1 flex items-center gap-1 text-[0.625rem] text-primary">{t("sebelumnya")} {f.value === null ? "–" : num(f.value, 4)}<button onClick={() => { const n = { ...edits }; delete n[f.code]; setEdits(n) }}><X className="size-3" /></button></div>}
                      </TableCell>
                      <TableCell className="hidden w-72 max-w-72 overflow-hidden whitespace-normal text-xs text-muted-foreground xl:table-cell">
                        <SourceLabel source={f.source} url={f.url} compact />
                        <div className="mt-1 text-[0.625rem] opacity-70">{t("berlaku")} {fmtDate(f.valid_from)}</div>
                      </TableCell>
                      <TableCell className="pr-5"><Badge variant="secondary" className={cn("border-transparent", STATUS[f.status]?.cls)}>{t(STATUS[f.status]?.label ?? f.status)}</Badge></TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-3 border-t px-5 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>{t("Perubahan berlaku untuk perhitungan berikutnya; riwayat lama tetap memakai versi sebelumnya.")} {t("Nilai kosong (kuning) tidak dipakai mesin hitung.")}</p>
            <p className="shrink-0">{t("{n} dari {m} faktor", { n: shown.length, m: rows.length })}</p>
          </div>
        </CardContent>
      </Card>

      {editable && changed.length > 0 && (
        <div className="fixed inset-x-0 bottom-20 z-30 mx-auto flex w-[min(640px,calc(100%-2rem))] items-center gap-3 rounded-full border bg-card/95 p-3 pl-5 shadow-2xl backdrop-blur md:bottom-6 md:ml-[calc(50%+8rem-320px)]">
          <span className="text-sm"><b>{changed.length}</b> {t("perubahan belum disimpan")}</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setEdits({})}><RotateCcw /> {t("Batal")}</Button>
          <Button className="h-10 rounded-xl bg-foreground text-background hover:bg-foreground/90" onClick={() => { setMeta({ ...meta, version: nextVersion(versions) }); setSaveOpen(true) }}><Save /> {t("Simpan sebagai versi baru")}</Button>
        </div>
      )}
      {!isAdmin && <p className="text-center text-xs text-muted-foreground">{t("Hanya admin platform yang dapat mengubah faktor emisi.")}</p>}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{t("Simpan sebagai versi baru")}</DialogTitle><DialogDescription>{t("Faktor lama dinonaktifkan per tanggal berlaku dan tetap tersimpan agar rapor terdahulu dapat direproduksi.")}</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("Label versi")}><Input value={meta.version} onChange={(e) => setMeta({ ...meta, version: e.target.value })} /></Field>
            <Field label={t("Berlaku dari")}><Input type="date" value={meta.valid_from} onChange={(e) => setMeta({ ...meta, valid_from: e.target.value })} /></Field>
            <Field label={t("Catatan perubahan")} className="col-span-2"><Input value={meta.note} onChange={(e) => setMeta({ ...meta, note: e.target.value })} placeholder={t("mis. pembaruan faktor grid DJK edisi terbaru")} /></Field>
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl bg-muted/50 p-3 text-xs">
            {changed.map(([code, v]) => { const f = rows.find((r) => r.code === code)!; return (
              <div key={code} className="flex justify-between gap-3"><span className="truncate"><b className="font-mono">{f.ext_id}</b> {nm(f)}</span><span className="shrink-0 font-mono">{f.value === null ? "–" : num(f.value, 4)} → <b className="text-primary">{v === "" ? "–" : v}</b></span></div>
            ) })}
          </div>
          <DialogFooter><Button onClick={() => save.mutate()} disabled={save.isPending || !meta.version}>{save.isPending && <Spinner />} {t("Aktifkan versi")} {meta.version}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!add} onOpenChange={(o) => !o && setAdd(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{t("Faktor baru")}</DialogTitle><DialogDescription>{t("Nilai kosong boleh — status menjadi Belum diisi sampai dilengkapi.")}</DialogDescription></DialogHeader>
          {add && <div className="grid gap-5 sm:grid-cols-2">
            <Field label="ID"><Input value={add.ext_id} onChange={(e) => setAdd({ ...add, ext_id: e.target.value.toUpperCase() })} placeholder="PRC-006" /></Field>
            <Field label={t("Kategori")}><SimpleSelect value={add.category} onChange={(v) => setAdd({ ...add, category: v })} options={CATEGORY_ORDER.map((c) => ({ value: c, label: t(c) }))} /></Field>
            <Field label={t("Sumber emisi (ID)")} className="sm:col-span-2"><Input value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} /></Field>
            <Field label={t("Sumber emisi (EN)")} className="sm:col-span-2"><Input value={add.name_en} onChange={(e) => setAdd({ ...add, name_en: e.target.value })} /></Field>
            <Field label="Scope"><SimpleSelect value={add.scope} onChange={(v) => setAdd({ ...add, scope: v })} options={["1", "2", "3"].map((s) => ({ value: s, label: `Scope ${s}` }))} /></Field>
            <Field label={t("Satuan aktivitas")}><Input value={add.activity_unit} onChange={(e) => setAdd({ ...add, activity_unit: e.target.value })} placeholder="kg, kWh, ton, Rp 1.000" /></Field>
            <Field label={t("Faktor emisi")}><Input inputMode="decimal" value={add.value} onChange={(e) => setAdd({ ...add, value: e.target.value })} /></Field>
            <Field label={t("Satuan faktor")}><Input value={add.unit} onChange={(e) => setAdd({ ...add, unit: e.target.value })} /></Field>
            <Field label={t("Gas cakupan")}><Input value={add.gas} onChange={(e) => setAdd({ ...add, gas: e.target.value })} /></Field>
            <Field label={t("Basis GWP")}><Input value={add.gwp_basis} onChange={(e) => setAdd({ ...add, gwp_basis: e.target.value })} /></Field>
            <Field label={t("Sumber referensi")} className="sm:col-span-2"><Input value={add.source} onChange={(e) => setAdd({ ...add, source: e.target.value })} /></Field>
            <Field label={t("Label versi")}><Input value={add.version} onChange={(e) => setAdd({ ...add, version: e.target.value })} /></Field>
          </div>}
          <DialogFooter><Button onClick={() => create.mutate()} disabled={create.isPending || !add?.ext_id || !add?.name}>{create.isPending && <Spinner />} {t("Simpan")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!hist} onOpenChange={(o) => !o && setHist(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {hist && (() => {
            const list = (data ?? []).filter((f) => f.code === hist).sort((a, b) => b.version.localeCompare(a.version))
            const f = list[0]
            return (
              <>
                <SheetHeader><SheetTitle className="font-mono">{f.ext_id}</SheetTitle><SheetDescription>{nm(f)}</SheetDescription></SheetHeader>
                <div className="space-y-3 px-4 pb-6">
                  <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 rounded-xl bg-muted/50 p-3 text-xs">
                    <dt className="text-muted-foreground">{t("Kode mesin")}</dt><dd className="font-mono">{f.code}</dd>
                    <dt className="text-muted-foreground">{t("Satuan aktivitas")}</dt><dd>{f.activity_unit}</dd>
                    <dt className="text-muted-foreground">{t("Gas cakupan")}</dt><dd>{f.gas}</dd>
                    <dt className="text-muted-foreground">{t("Basis GWP")}</dt><dd>{f.gwp_basis}</dd>
                    <dt className="text-muted-foreground">{t("Sumber referensi")}</dt><dd><SourceLabel source={f.source} url={f.url} /></dd>
                  </dl>
                  <p className="text-sm font-medium">{t("Riwayat versi")}</p>
                  {list.map((r) => (
                    <div key={r.id} className={cn("rounded-2xl bg-muted/50 p-3.5 text-sm", r.active && "bg-primary/8 ring-1 ring-primary/30")}>
                      <div className="flex items-center justify-between"><Badge variant={r.active ? "default" : "outline"}>{r.version}</Badge><span className="font-mono">{r.value === null ? "–" : num(r.value, 5)} <span className="text-xs text-muted-foreground">{r.unit}</span></span></div>
                      <p className="mt-1.5 text-xs text-muted-foreground">{fmtDate(r.valid_from)} – {r.valid_to ? fmtDate(r.valid_to) : t("kini")}{r.note ? ` · ${r.note}` : ""}</p>
                    </div>
                  ))}
                </div>
              </>
            )
          })()}
        </SheetContent>
      </Sheet>
    </div>
  )
}
