import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { FlaskConical, Leaf, Plus } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ErrorState, Field, PageHeader, PageSkeleton, SimpleSelect, Spinner, StatCard } from "@/components/common"
import { EditDialog, RowActions } from "@/components/row-actions"
import { api } from "@/lib/api"
import { num } from "@/lib/format"
import { t as tr } from "@/lib/i18n"

const EQ: Record<string, string> = {
  power: "Persamaan lokal jenis: AGB = a × D^b (opsional a_h × (D²H)^b_h bila tinggi diukur)",
  mahoni: "Persamaan karbon langsung: C = a × D^b (kg C)",
  chave: "Model umum: Chave 2014 (dengan tinggi) / Ketterings 2001 (tanpa tinggi) + berat jenis",
  chave2005: "Model umum: Chave 2005 hutan lembap tanpa tinggi + berat jenis",
}
const n4 = (v: number) => num(v, v < 0.1 ? 4 : 3)
/** Rumus lengkap satu jenis, dengan koefisiennya — sama dengan yang dihitung engine. */
export function formulaOf(s: any): { main: string; alt?: string; tail?: string } {
  const tail = s.equation === "mahoni" ? `CO₂ = C × 44/12` : `CO₂ = AGB × (1 + ${num(s.root_ratio ?? 0, 2)} akar) × ${num(s.carbon_fraction, 2)} C × 44/12`
  if (s.equation === "mahoni") return { main: `C = ${n4(s.a)} × D^${num(s.b, 3)}`, tail }
  if (s.equation === "power") return { main: `AGB = ${n4(s.a)} × D^${num(s.b, 3)}`, alt: s.ah && s.bh ? `bila tinggi diukur: ${n4(s.ah)} × (D²H)^${num(s.bh, 3)}` : undefined, tail }
  if (s.equation === "chave2005") return { main: `AGB = ${num(s.density, 2)} × exp(−1,499 + 2,148 lnD + 0,207 (lnD)² − 0,0281 (lnD)³)`, alt: `bila tinggi diukur: 0,0673 × (${num(s.density, 2)} D²H)^0,976`, tail }
  return { main: `AGB = 0,0673 × (${num(s.density, 2)} D²H)^0,976`, alt: `tanpa tinggi: 0,11 × ${num(s.density, 2)} × D^2,62`, tail }
}
export default function Species() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["species"], queryFn: () => api<any[]>("/admin/species") })
  const [f, setF] = useState<any>(null)
  const [test, setTest] = useState<any[] | null>(null)
  const runTest = useMutation({ mutationFn: () => api<any>("/admin/species/test", { method: "POST", json: { ...f, height: f.test_height ? Number(f.test_height) : null } }), onSuccess: (r) => setTest(r.samples) })
  const save = useMutation({
    mutationFn: () => api("/admin/species", { method: "POST", json: { ...f, tested: !!test } }),
    onSuccess: () => { toast.success(tr("Jenis pohon diaktifkan")); setF(null); setTest(null); qc.invalidateQueries({ queryKey: ["species"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
  const toggle = useMutation({ mutationFn: (s: any) => api(`/admin/species/${s.id}`, { method: "PATCH", json: { active: s.active ? 0 : 1 } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["species"] }) })
  const [editS, setEditS] = useState<any>(null)
  if (isLoading) return <PageSkeleton />
  if (error || !data) return <ErrorState error={error ?? new Error("-")} retry={refetch} />
  const nf = (k: string, v: any) => { setF({ ...f, [k]: v }); setTest(null) }
  return (
    <div className="space-y-8">
      <PageHeader icon={Leaf} title={tr("Pustaka jenis pohon")} description={tr("Nama, berat jenis, alometrik, rentang DBH valid, riap default. Uji persamaan dengan contoh sebelum diaktifkan.")}
        actions={<Button onClick={() => setF({ local_name: "", scientific: "", equation: "chave", density: 0.6, growth_default: 0.8, dbh_min: 5, dbh_max: 150, carbon_fraction: 0.47, root_ratio: 0.24, test_height: 10 })}><Plus /> {tr("Jenis baru")}</Button>} />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={tr("Jenis aktif")} icon={Leaf} tone="leaf" value={data!.filter((s) => s.active).length} sub={tr("dari {n} jenis", { n: data!.length })} />
        <StatCard label={tr("Alometrik jenis")} icon={FlaskConical} value={data!.filter((s) => ["power", "mahoni"].includes(s.equation) && s.carbon_tree).length} sub={tr("Persamaan lokal jenis")} />
        <StatCard label={tr("Model umum")} icon={FlaskConical} tone="scope3" value={data!.filter((s) => ["chave", "chave2005"].includes(s.equation) && s.carbon_tree).length} sub="Chave · Ketterings + ρ" />
        <StatCard label={tr("Tanpa stok karbon")} icon={Leaf} tone="warn" value={data!.filter((s) => !s.carbon_tree).length} sub={tr("Palem, bambu, perdu")} />
      </div>
      <Card><CardContent className="-mx-4 overflow-x-auto sm:mx-0">
        <Table>
          <TableHeader><TableRow><TableHead>{tr("Jenis")}</TableHead><TableHead>{tr("Persamaan")}</TableHead><TableHead className="text-right">ρ</TableHead><TableHead className="text-right">{tr("Riap")}</TableHead><TableHead>{tr("DBH valid")}</TableHead><TableHead className="text-right">{tr("Fraksi C")}</TableHead><TableHead>{tr("Aktif")}</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
          <TableBody>{data!.map((s) => (
            <TableRow key={s.id}>
              <TableCell><div className="font-medium">{s.local_name}</div><div className="text-xs italic text-muted-foreground">{s.scientific}</div>{s.description && <div className="mt-0.5 line-clamp-1 max-w-xs text-xs text-muted-foreground">{s.description}</div>}</TableCell>
              <TableCell className="max-w-md text-xs">{s.carbon_tree ? (() => { const F = formulaOf(s); return <>
                <div className="font-mono text-[0.75rem] font-medium">{F.main}</div>
                {F.alt && <div className="font-mono text-[0.6875rem] text-muted-foreground">{F.alt}</div>}
                <div className="font-mono text-[0.6875rem] text-muted-foreground">{F.tail}</div>
                <div className="mt-1 line-clamp-2 text-[0.6875rem] text-muted-foreground" title={s.source}>{s.source}</div>
              </> })() : <Badge variant="outline">{tr("tanpa stok karbon")}</Badge>}</TableCell>
              <TableCell className="text-right tabular">{num(s.density, 2)}</TableCell>
              <TableCell className="text-right tabular">{num(s.growth_default, 2)} {tr("cm/th")}</TableCell>
              <TableCell className="tabular text-sm">{s.dbh_min}–{s.dbh_max} {tr("cm")}</TableCell>
              <TableCell className="text-right tabular">{num(s.carbon_fraction, 2)}</TableCell>
              <TableCell><Switch checked={!!s.active} onCheckedChange={() => toggle.mutate(s)} /></TableCell>
              <TableCell className="text-right"><RowActions onEdit={() => setEditS(s)} del={{ path: `/admin/species/${s.id}`, title: tr(`Hapus jenis ${s.local_name}?`), description: tr("Hanya bisa bila belum dipakai pohon mana pun. Jenis yang sudah dipakai cukup dinonaktifkan agar perhitungan lama tetap utuh."), invalidate: [["species"]] }} /></TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </CardContent></Card>
      <Dialog open={!!f} onOpenChange={(o) => !o && setF(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{tr("Jenis pohon baru")}</DialogTitle><DialogDescription>{tr("Jenis tanpa alometrik memakai Chave 2014 + berat jenis (label Model umum).")}</DialogDescription></DialogHeader>
          {f && <div className="grid gap-5 sm:grid-cols-2">
            <Field label={tr("Nama lokal")}><Input value={f.local_name} onChange={(e) => nf("local_name", e.target.value)} /></Field>
            <Field label={tr("Nama ilmiah")}><Input value={f.scientific} onChange={(e) => nf("scientific", e.target.value)} /></Field>
            <Field label={tr("Deskripsi singkat (untuk kartu QR & profil publik)")} className="sm:col-span-2"><textarea rows={2} maxLength={180} value={f.description ?? ""} onChange={(e) => nf("description", e.target.value)} className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" placeholder={tr("mis. Pohon peneduh bertajuk lebar, tahan kering…")} /></Field>
            <Field label={tr("Persamaan")} className="sm:col-span-2"><SimpleSelect value={f.equation} onChange={(v) => nf("equation", v)} options={Object.entries(EQ).map(([v, l]) => ({ value: v, label: l }))} /></Field>
            {["power", "mahoni"].includes(f.equation) && <><Field label={tr("Koef. a")}><Input type="number" step="any" value={f.a ?? ""} onChange={(e) => nf("a", Number(e.target.value))} /></Field><Field label={tr("Koef. b")}><Input type="number" step="any" value={f.b ?? ""} onChange={(e) => nf("b", Number(e.target.value))} /></Field></>}
            {f.equation === "power" && <><Field label={tr("Koef. a_h (opsional, dengan tinggi)")}><Input type="number" step="any" value={f.ah ?? ""} onChange={(e) => nf("ah", e.target.value === "" ? null : Number(e.target.value))} /></Field><Field label={tr("Koef. b_h (opsional)")}><Input type="number" step="any" value={f.bh ?? ""} onChange={(e) => nf("bh", e.target.value === "" ? null : Number(e.target.value))} /></Field></>}
            <Field label={tr("Sumber persamaan (penulis, tahun)")} className="sm:col-span-2"><Input value={f.source ?? ""} onChange={(e) => nf("source", e.target.value)} placeholder={tr("mis. Krisnawati dkk. (2012), Monograf Model Alometrik")} /></Field>
            {[["density", "Berat jenis ρ (g/cm³)"], ["growth_default", "Riap default (cm/th)"], ["dbh_min", "DBH min"], ["dbh_max", "DBH maks"], ["carbon_fraction", "Fraksi karbon"], ["root_ratio", "Rasio akar-tajuk"]].map(([k, l]) => <Field key={k} label={l}><Input type="number" step="any" value={f[k]} onChange={(e) => nf(k, Number(e.target.value))} /></Field>)}
            <Field label={tr("Tinggi uji (m)")}><Input type="number" value={f.test_height} onChange={(e) => nf("test_height", e.target.value)} /></Field>
            <div className="flex items-end"><Button variant="outline" className="w-full" onClick={() => runTest.mutate()}><FlaskConical /> {tr("Uji persamaan")}</Button></div>
            {test && <div className="grid grid-cols-4 gap-2 sm:col-span-2">{test.map((t) => <div key={t.dbh} className="rounded-lg bg-muted p-2 text-center text-xs"><div className="text-muted-foreground">{tr("DBH")} {t.dbh}</div><div className="font-semibold tabular">{num(t.stockCO2, 0)} {tr("kg")}</div></div>)}</div>}
          </div>}
          <DialogFooter><Button disabled={!test || save.isPending} onClick={() => save.mutate()}>{save.isPending && <Spinner />} {tr("Aktifkan")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {editS && <EditDialog open={!!editS} onOpenChange={(o) => !o && setEditS(null)} title={tr(`Ubah ${editS.local_name}`)} description={tr("Mengubah koefisien atau berat jenis menghitung ulang stok karbon pohon jenis ini pada hari yang masih terbuka; hari yang sudah tutup buku tidak berubah.")}
        fields={[{ key: "local_name", label: tr("Nama lokal") }, { key: "scientific", label: tr("Nama ilmiah") }, { key: "description", label: tr("Deskripsi singkat (kartu QR & profil publik)"), type: "textarea" }, { key: "growth_default", label: tr("Riap default (cm/th)"), type: "number" }, { key: "density", label: tr("Berat jenis ρ (g/cm³)"), type: "number" },
          ...(["power", "mahoni"].includes(editS.equation) ? [{ key: "a", label: tr("Koef. a"), type: "number" as const }, { key: "b", label: tr("Koef. b"), type: "number" as const }] : []),
          ...(editS.equation === "power" ? [{ key: "ah", label: tr("Koef. a_h (dengan tinggi, opsional)"), type: "number" as const }, { key: "bh", label: tr("Koef. b_h (opsional)"), type: "number" as const }] : []),
          { key: "carbon_fraction", label: tr("Fraksi karbon"), type: "number" }, { key: "root_ratio", label: tr("Rasio akar-tajuk"), type: "number" },
          { key: "dbh_min", label: tr("DBH valid min (cm)"), type: "number" }, { key: "dbh_max", label: tr("DBH valid maks (cm)"), type: "number" },
          { key: "source", label: tr("Sumber persamaan") }, { key: "density_source", label: tr("Sumber berat jenis") }]}
        initial={{ local_name: editS.local_name, scientific: editS.scientific ?? "", description: editS.description ?? "", growth_default: editS.growth_default, density: editS.density, a: editS.a ?? "", b: editS.b ?? "", ah: editS.ah ?? "", bh: editS.bh ?? "", carbon_fraction: editS.carbon_fraction, root_ratio: editS.root_ratio, dbh_min: editS.dbh_min, dbh_max: editS.dbh_max, source: editS.source ?? "", density_source: editS.density_source ?? "" }}
        save={(v) => api(`/admin/species/${editS.id}`, { method: "PATCH", json: v })} invalidate={[["species"]]} />}
    </div>
  )
}
