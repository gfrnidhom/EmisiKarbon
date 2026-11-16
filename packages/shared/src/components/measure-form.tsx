import { useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Camera, Crosshair, Plus, Trash2, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Field, SimpleSelect, Spinner } from "./common"
import { api, sendOrQueue, uploadEvidence } from "@/lib/api"
import { useGeo } from "@/lib/hooks"
import { num, todayWIB } from "@/lib/format"
import { cn } from "@/lib/utils"
import { t, tl } from "@/lib/i18n"

/** TREE-03: jenis, DBH, tinggi, kondisi, 2 foto, GPS + akurasi. Offline → antrian tersinkron. */
export function MeasureForm({ orgId, assetId, lastDbh, role = "operator", onDone, compact, needSpecies }: { orgId: number; assetId: number; lastDbh?: number | null; role?: "operator" | "verifikator"; onDone?: (r: any) => void; compact?: boolean; needSpecies?: boolean }) {
  // label QR baru (belum dipasang): jenis pohon dipilih saat pengukuran pertama
  const speciesQ = useQuery({ queryKey: ["species"], queryFn: () => api<any[]>("/admin/species"), enabled: !!needSpecies })
  const [speciesId, setSpeciesId] = useState("")
  const geo = useGeo()
  const [dbh, setDbh] = useState("")
  const [multi, setMulti] = useState(false)
  const [stems, setStems] = useState<string[]>(["", ""])
  const [height, setHeight] = useState("")
  const [condition, setCondition] = useState("baik")
  const [reason, setReason] = useState("")
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null)
  const [photos, setPhotos] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const camRef = useRef<HTMLInputElement>(null)
  const eqDbh = multi ? Math.sqrt(stems.reduce((s, x) => s + (Number(x) || 0) ** 2, 0)) : Number(dbh)
  const drop = lastDbh && eqDbh > 0 && eqDbh < lastDbh * 0.95 && role === "operator"

  const locate = async () => {
    const p = await geo()
    if (!p) return toast.error(t("GPS tidak tersedia — izinkan akses lokasi"))
    setGps(p)
    if (p.accuracy > 15) toast.warning(t("Akurasi GPS {n} m (> 15 m) — akan ditandai Lokasi diragukan", { n: num(p.accuracy) }))
  }
  const onPhoto = async (f?: File) => {
    if (!f) return
    if (!navigator.onLine) return toast.warning(t("Foto perlu koneksi untuk diunggah; pengukuran tetap bisa disimpan offline."))
    try { const r = await uploadEvidence(orgId, f, gps ?? {}); setPhotos((p) => [...p, r.id].slice(-2)) } catch (e) { toast.error((e as Error).message) }
  }
  const save = async () => {
    if (needSpecies && !speciesId) return toast.error(tl("Pilih jenis pohon untuk label baru ini", "Pick the species for this new label"))
    if (!(eqDbh > 0)) return toast.error(t("Isi DBH (cm)"))
    if (drop && !reason) return toast.error(t("DBH turun > 5%: pilih alasan"))
    setBusy(true)
    try {
      const body = { date: todayWIB(), dbh: eqDbh, stems: multi ? stems.map(Number).filter(Boolean) : undefined, height: height ? Number(height) : null, condition, reason: reason || undefined, photos, lat: gps?.lat, lng: gps?.lng, accuracy: gps?.accuracy, role, species_id: needSpecies ? Number(speciesId) : undefined }
      const r = await sendOrQueue(`/assets/${assetId}/measurements`, body, `Ukur pohon #${assetId}: ${num(eqDbh, 1)} cm`)
      if (r.queued) toast.info(t("Offline — disimpan di antrian, tersinkron otomatis saat online"), { icon: <WifiOff className="size-4" /> })
      else {
        const d: any = r.data
        if (d?.comparison) toast[d.comparison.pass ? "success" : "warning"](t("Selisih vs operator {p}% — {r}", { p: num(d.comparison.diffPct, 1), r: d.comparison.pass ? t("lolos (≤ 5%)") : t("di luar toleransi") }))
        else toast.success(d?.flags?.length ? `Tersimpan · ${d.flags.join(" · ")}` : t("Pengukuran tersimpan"))
      }
      setDbh(""); setHeight(""); setPhotos([]); setReason(""); setStems(["", ""])
      onDone?.(r)
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      {needSpecies && (
        <div className="space-y-2 rounded-2xl bg-amber-400/10 p-3 ring-1 ring-amber-500/25">
          <p className="text-xs text-amber-900 dark:text-amber-200">{tl("Label baru — pilih jenis pohon. Pengukuran pertama ini memasang & mengaktifkan pohon.", "New label — pick the species. This first measurement installs & activates the tree.")}</p>
          <SimpleSelect value={speciesId} onChange={setSpeciesId} placeholder={tl("Pilih jenis pohon", "Pick species")} options={(speciesQ.data ?? []).filter((x) => x.active).map((x) => ({ value: String(x.id), label: `${x.local_name}${x.scientific && x.scientific !== "-" ? ` · ${x.scientific}` : ""}` }))} />
        </div>
      )}
      <div className="flex items-center justify-between">
        <Label htmlFor="multi" className="text-sm">{t("Bercabang di bawah 1,3 m")}</Label>
        <Switch id="multi" checked={multi} onCheckedChange={setMulti} />
      </div>
      {!multi ? (
        <Field label={t("DBH — keliling ÷ π pada 1,3 m (cm)")} hint={lastDbh ? t("Pengukuran terakhir {n} cm", { n: num(lastDbh, 1) }) : t("DBH < 5 cm dicatat tanpa stok karbon")}>
          <Input type="number" inputMode="decimal" step="0.1" autoFocus={!compact} value={dbh} onChange={(e) => setDbh(e.target.value)} className="h-12 text-lg tabular" />
        </Field>
      ) : (
        <Field label={t("DBH tiap batang (cm)")} hint={t("Diameter setara √ΣD² = {n} cm", { n: num(eqDbh, 1) })}>
          <div className="space-y-2">
            {stems.map((s, i) => (
              <div key={i} className="flex gap-2">
                <Input type="number" inputMode="decimal" step="0.1" value={s} onChange={(e) => setStems(stems.map((x, j) => (j === i ? e.target.value : x)))} className="h-11" placeholder={`Batang ${i + 1}`} />
                {stems.length > 2 && <Button variant="ghost" size="icon" onClick={() => setStems(stems.filter((_, j) => j !== i))}><Trash2 /></Button>}
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setStems([...stems, ""])}><Plus /> {t("Batang")}</Button>
          </div>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Tinggi (m)")}><Input type="number" inputMode="decimal" step="0.1" value={height} onChange={(e) => setHeight(e.target.value)} className="h-11" /></Field>
        <Field label={t("Kondisi")}><SimpleSelect value={condition} onChange={setCondition} className="h-11" options={[{ value: "baik", label: t("Baik") }, { value: "sedang", label: t("Sedang") }, { value: "rusak", label: t("Rusak") }]} /></Field>
      </div>
      {drop && (
        <Field label={t("Alasan DBH turun > 5%")} error={!reason ? t("Wajib dipilih + foto") : undefined}>
          <SimpleSelect value={reason} onChange={setReason} options={[{ value: "rusak", label: t("Batang rusak/terkelupas") }, { value: "salah_ukur", label: t("Pengukuran sebelumnya salah") }]} />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className={cn("h-11", gps && "border-primary/40 text-primary")} onClick={locate}><Crosshair /> {gps ? `±${num(gps.accuracy)} m` : t("Ambil GPS")}</Button>
        <Button type="button" variant="outline" className="h-11" onClick={() => camRef.current?.click()}><Camera /> Foto ({photos.length}/2)</Button>
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = "" }} />
      </div>
      {photos.length > 0 && <div className="flex gap-1">{photos.map((p) => <Badge key={p} variant="secondary">{t("foto #")}{p}</Badge>)}</div>}
      <Button className="h-12 w-full text-base" onClick={save} disabled={busy}>{busy && <Spinner />} {t("Simpan pengukuran")}</Button>
    </div>
  )
}
