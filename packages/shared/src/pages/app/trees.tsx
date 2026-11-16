import { useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Crosshair, Map as MapIcon, Plus, Printer, Search, Table2, Trees as TreesIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { EmptyState, Field, PageHeader, PageSkeleton, QualityBadge, SimpleSelect, Spinner, StatCard, StatusBadge } from "@/components/common"
import { TreeMap } from "@/components/tree-map"
import { api } from "@/lib/api"
import { treeQrUrl, useTreeCardPrint } from "@/components/tree-qr-card"
import { useGeo, useOrg } from "@/lib/hooks"
import { fmtDate, num, todayWIB } from "@/lib/format"
import { t as tr, tl } from "@/lib/i18n"
import { EditDialog, RowActions, usePerm } from "@/components/row-actions"

/** QR pohon selalu menunjuk profil publik di domain utama. */
export const qrUrl = treeQrUrl

export default function Trees() {
  const { orgId, org, can } = useOrg()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [sp] = useSearchParams()
  const geo = useGeo()
  const [view, setView] = useState("tabel")
  const [filter, setFilter] = useState(sp.get("filter") === "due" ? "jatuh_tempo" : sp.get("filter") ?? "semua")
  const [search, setSearch] = useState("")
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [add, setAdd] = useState(false)
  const [nf, setNf] = useState<any>({ species_id: "", dbh: "", height: "", lat: null, lng: null, gps_accuracy: null, planted_at: "" })
  const { data, isLoading } = useQuery({ queryKey: ["assets", orgId, "pohon"], queryFn: () => api<any[]>(`/orgs/${orgId}/assets?type=pohon`), enabled: !!orgId })
  const { data: species } = useQuery({ queryKey: ["species"], queryFn: () => api<any[]>("/admin/species") })

  const list = useMemo(() => (data ?? []).filter((t) => t.status !== "belum_dipasang").filter((t) => {
    if (filter === "jatuh_tempo") return t.dueRemeasure && t.status === "hidup"
    if (filter === "berhenti") return t.stopped
    if (filter === "mati") return t.status !== "hidup"
    return true
  }).filter((t) => !search || `${t.code} ${t.species_name}`.toLowerCase().includes(search.toLowerCase())), [data, filter, search])
  const alive = (data ?? []).filter((t) => t.status === "hidup")
  const totalStock = alive.reduce((s, t) => s + (t.stock ?? 0), 0)
  const due = alive.filter((t) => t.dueRemeasure).length

  const create = useMutation({
    mutationFn: (force?: boolean) => api<any>(`/orgs/${orgId}/assets`, { method: "POST", json: { type: "pohon", ...nf, species_id: Number(nf.species_id), dbh: Number(nf.dbh), height: nf.height ? Number(nf.height) : null, date: todayWIB(), force } }),
    onSuccess: (r) => { toast.success(`Pohon ${r.code} terdaftar`, { description: r.flags?.join(" · ") }); setAdd(false); qc.invalidateQueries({ queryKey: ["assets"] }); nav(`/app/trees/${r.uuid ?? r.id}`) },
    onError: (e: any) => { if (e.status === 409 && confirm(`${e.message}. ${tr("Tetap simpan?")}`)) create.mutate(true); else toast.error(e.message) },
  })

  const cards = useTreeCardPrint() // hook harus sebelum return awal
  const perm = usePerm()
  const [editT, setEditT] = useState<any>(null)
  if (isLoading) return <PageSkeleton />
  const pts = list.filter((t) => t.lat).map((t) => ({ id: t.id, lat: t.lat, lng: t.lng, kind: "pohon", size: t.dbhNow, muted: t.status !== "hidup", label: `${t.code} · ${t.species_name} · ${num(t.dbhNow, 1)} cm`, color: t.status !== "hidup" ? "#ef4444" : t.stopped ? "#94a3b8" : t.dueRemeasure ? "#f59e0b" : "#16a571", onClick: () => nav(`/app/trees/${t.uuid ?? t.id}`) }))
  const pickedItems = (data ?? []).filter((t) => picked.has(t.code))

  return (
    <div className="space-y-8">
      <PageHeader icon={TreesIcon} title={tr("Pohon")} description={tr("Inventaris ber-QR · stok CO₂ dengan alometrik per jenis · proyeksi riap & rekonsiliasi saat ukur ulang.")}
        actions={<>
          {picked.size > 0 && <Button variant="outline" onClick={() => cards.print(pickedItems, org?.name ?? "")}><Printer /> {tr("Cetak")} {picked.size} {tr("label QR")}</Button>}
          {perm.manage && <Button onClick={() => setAdd(true)}><Plus /> {tr("Tambah pohon")}</Button>}
        </>} />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={tr("Pohon hidup")} value={num(alive.length)} icon={TreesIcon} tone="leaf" sub={`${(data ?? []).length - alive.length} mati/ditebang/belum dipasang`} />
        <StatCard label={tr("Stok CO₂ hari ini")} value={`${num(totalStock / 1000, 2)} t`} tone="leaf" sub={tr("Estimasi internal, bukan kredit karbon")} />
        <StatCard label={tr("Jatuh tempo ukur ulang")} value={num(due)} tone={due ? "warn" : "default"} sub={tr("≥ 6 bulan sejak ukur terakhir")} onClick={() => setFilter("jatuh_tempo")} />
        <StatCard label={tr("Proyeksi berhenti")} value={num(alive.filter((t) => t.stopped).length)} sub={tr("> 12 bulan tanpa ukur ulang (serapan 0)")} onClick={() => setFilter("berhenti")} />
      </div>
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" placeholder={tr("Cari kode atau jenis…")} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <SimpleSelect className="sm:w-52" value={filter} onChange={setFilter} options={[{ value: "semua", label: tr("Semua pohon") }, { value: "jatuh_tempo", label: tr("Jatuh tempo ukur ulang") }, { value: "berhenti", label: tr("Proyeksi berhenti") }, { value: "mati", label: tr("Mati / ditebang") }]} />
            <ToggleGroup value={[view]} onValueChange={(v) => v[0] && setView(v[0])} variant="outline">
              <ToggleGroupItem value="tabel" aria-label={tr("Tabel")}><Table2 /></ToggleGroupItem>
              <ToggleGroupItem value="peta" aria-label={tr("Peta")}><MapIcon /></ToggleGroupItem>
            </ToggleGroup>
          </div>
          {list.length === 0 ? <EmptyState icon={TreesIcon} title={tr("Tidak ada pohon")} description={tr("Sensus semua pohon DBH ≥ 5 cm untuk inventaris t₀.")} /> : view === "peta" ? <TreeMap points={pts} height={460} /> : (
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-8"><Checkbox checked={picked.size === list.length && list.length > 0} onCheckedChange={(c) => setPicked(c ? new Set(list.map((t) => t.code)) : new Set())} /></TableHead>
                  <TableHead>{tr("Kode")}</TableHead><TableHead>{tr("Jenis")}</TableHead><TableHead className="text-right">{tr("DBH kini")}</TableHead><TableHead className="text-right">{tr("Stok CO₂")}</TableHead><TableHead>{tr("Label")}</TableHead><TableHead className="hidden md:table-cell">{tr("Ukur terakhir")}</TableHead><TableHead className="w-10" />
                </TableRow></TableHeader>
                <TableBody>
                  {list.map((t) => (
                    <TableRow key={t.id} className="cursor-pointer" onClick={() => nav(`/app/trees/${t.uuid ?? t.id}`)}>
                      <TableCell onClick={(e) => e.stopPropagation()}><Checkbox checked={picked.has(t.code)} onCheckedChange={(c) => { const s = new Set(picked); c ? s.add(t.code) : s.delete(t.code); setPicked(s) }} /></TableCell>
                      <TableCell className="font-mono text-xs">{t.code}{t.flags?.length > 0 && <span className="ml-1 text-amber-600" title={t.flags.join(", ")}>⚠</span>}</TableCell>
                      <TableCell>{t.species_name}</TableCell>
                      <TableCell className="text-right tabular">{num(t.dbhNow, 1)} {tr("cm")}</TableCell>
                      <TableCell className="text-right tabular">{num(t.stock, 0)} {tr("kg")}</TableCell>
                      <TableCell>{t.status !== "hidup" ? <StatusBadge status={t.status} /> : t.stopped ? <QualityBadge label={tr("kosong")} className="normal-case" /> : <QualityBadge label={t.label} />}</TableCell>
                      <TableCell className="hidden text-sm md:table-cell">{fmtDate(t.last?.date)}{t.dueRemeasure && t.status === "hidup" && <span className="ml-2 text-xs text-amber-600">{tr("jatuh tempo")}</span>}</TableCell>
                      <TableCell className="pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <RowActions onView={() => nav(`/app/trees/${t.uuid ?? t.id}`)} onEdit={perm.manage ? () => setEditT(t) : undefined}
                          del={perm.manage ? { path: `/assets/${t.uuid ?? t.id}`, title: tl(`Hapus pohon ${t.code}?`, `Delete tree ${t.code}?`), description: tl("Pohon beserta seluruh riwayat pengukurannya dihapus permanen dan stok karbon dihitung ulang. Untuk pohon yang mati/ditebang, gunakan Tandai mati agar pelepasan karbon tercatat.", "The tree and all its measurements are removed permanently. For dead/felled trees use Mark dead so the carbon release is recorded."), invalidate: [["assets"]] } : undefined} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      {cards.node}
      {editT && <EditDialog open={!!editT} onOpenChange={(o) => !o && setEditT(null)} title={tl(`Ubah pohon ${editT.code}`, `Edit tree ${editT.code}`)} description={tl("Jenis pohon diubah dari halaman detail. Koordinat dipakai di peta aset.", "Coordinates are used on the asset map.")}
        fields={[{ key: "name", label: tl("Nama / penanda (opsional)", "Name / label (optional)") }, { key: "lat", label: "Latitude", type: "number" }, { key: "lng", label: "Longitude", type: "number" }]}
        initial={{ name: editT.name ?? "", lat: editT.lat ?? "", lng: editT.lng ?? "" }} save={(v) => api(`/assets/${editT.uuid ?? editT.id}`, { method: "PATCH", json: v })} invalidate={[["assets"]]} />}
      <Dialog open={add} onOpenChange={setAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>{tr("Tambah pohon")}</DialogTitle><DialogDescription>{tr("Pohon baru bukan serapan — stok mulai dihitung dari pengukuran pertama.")}</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <Field label={tr("Jenis")}><SimpleSelect value={nf.species_id} onChange={(v) => setNf({ ...nf, species_id: v })} options={(species ?? []).filter((s) => s.active).map((s) => ({ value: String(s.id), label: `${s.local_name}${s.scientific !== "-" ? ` · ${s.scientific}` : ""}` }))} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={tr("DBH (cm)")}><Input type="number" step="0.1" value={nf.dbh} onChange={(e) => setNf({ ...nf, dbh: e.target.value })} /></Field>
              <Field label={tr("Tinggi (m)")}><Input type="number" step="0.1" value={nf.height} onChange={(e) => setNf({ ...nf, height: e.target.value })} /></Field>
            </div>
            <Button variant="outline" onClick={async () => { const p = await geo(); if (p) setNf({ ...nf, lat: p.lat, lng: p.lng, gps_accuracy: p.accuracy }); else toast.error(tr("GPS tidak tersedia")) }}>
              <Crosshair /> {nf.lat ? `${nf.lat.toFixed(5)}, ${nf.lng.toFixed(5)} (±${num(nf.gps_accuracy)} m)` : tr("Ambil lokasi GPS (≤ 10 m)")}
            </Button>
          </div>
          <DialogFooter><Button disabled={!nf.species_id || !nf.dbh || create.isPending} onClick={() => create.mutate(false)}>{create.isPending && <Spinner />} {tr("Simpan & buat QR")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
