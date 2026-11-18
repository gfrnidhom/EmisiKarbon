import { useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ImageUp, Map as MapIcon, RotateCw, RotateCcw, Sparkles, ZoomIn, ZoomOut } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PageHeader, PageSkeleton, Spinner, StatusBadge } from "@/components/common"
import { TreeMap } from "@/components/tree-map"
import type { SiteFeature } from "@/components/gis-map"
import { analyzeImageToGis, defaultSiteFeatures, fileToDataUrl, inferCenter, rotateFeatures, scaleFeatures } from "@/lib/gis-ai"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { useOrg } from "@/lib/hooks"
import { num } from "@/lib/format"
import { t, tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const TYPES: Record<string, { label: string; color: string }> = {
  pohon: { label: "Pohon", color: "#16a571" },
  biopori: { label: "Biopori", color: "#2563eb" },
  komposter: { label: "Komposter", color: "#a16207" },
  bank_sampah: { label: "Bank sampah", color: "#9333ea" },
  panel: { label: "Panel surya", color: "#f59e0b" },
  atap: { label: "Atap tangkapan hujan", color: "#0891b2" },
  ac: { label: "Unit AC", color: "#e11d48" },
  genset: { label: "Genset", color: "#57534e" },
}

const FEATURE_LABEL: Record<string, string> = {
  boundary: "Batas lahan",
  building: "Gedung",
  field: "Lapangan",
  garden: "Kebun / Taman",
  parking: "Parkir",
  path: "Jalur",
  water: "Kolam / Air",
  gate: "Gerbang",
}

/** Peta Aset: semua aset ber-QR di satu peta dengan filter jenis + konversi gambar denah/citra ke GIS vektor dengan AI. */
export default function AssetMap() {
  const { orgId } = useAuth()
  const { org, can } = useOrg()
  const qc = useQueryClient()
  const nav = useNavigate()
  const { data, isLoading } = useQuery({ queryKey: ["assets", orgId, "all"], queryFn: () => api<any[]>(`/orgs/${orgId}/assets`), enabled: !!orgId })
  const [off, setOff] = useState<Set<string>>(new Set())
  const [sel, setSel] = useState<any>(null)
  const [customSite, setCustomSite] = useState<SiteFeature[] | null>(null)

  // State dialog AI GIS dari gambar
  const [openAi, setOpenAi] = useState(false)
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState("")
  const [preview, setPreview] = useState<SiteFeature[] | null>(null)
  const [modeLabel, setModeLabel] = useState<string>("")
  const fileRef = useRef<HTMLInputElement>(null)

  const assets = useMemo(() => (data ?? []).filter((a) => a.lat && a.status !== "belum_dipasang"), [data])
  const currentFeatures: SiteFeature[] = useMemo(
    () => customSite ?? (Array.isArray(org?.polygon) ? org.polygon : []),
    [customSite, org?.polygon]
  )
  const center = useMemo(
    () => inferCenter(currentFeatures, assets, org?.lat && org?.lng ? { lat: org.lat, lng: org.lng } : undefined),
    [currentFeatures, assets, org?.lat, org?.lng]
  )

  const savePolygon = useMutation({
    mutationFn: async (polygon: SiteFeature[]) => {
      setCustomSite(polygon)
      if (can("operator", "admin")) {
        await api(`/orgs/${orgId}`, { method: "PATCH", json: { polygon } })
        await qc.invalidateQueries({ queryKey: ["org", orgId] })
      }
    },
    onSuccess: () => {
      toast.success(can("operator", "admin")
        ? tl("Denah GIS baru disimpan ke Peta Aset", "New GIS site plan saved to Asset Map")
        : tl("Denah GIS diterapkan pada tampilan ini", "GIS site plan applied to this view"))
      setOpenAi(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const runAiFromDataUrl = async (dataUrl: string) => {
    setImgUrl(dataUrl)
    setBusy(true)
    try {
      // Coba AI Vision server terlebih dahulu bila GEMINI_API_KEY tersedia; otomatis fallback ke AI Vision lokal
      const srv = await api<any>(`/orgs/${orgId}/gis-ai`, {
        method: "POST",
        json: { dataUrl, center, landM2: org?.land_m2 || 12000, aspect: await new Promise<number>((ok) => { const im = new Image(); im.onload = () => ok(im.naturalWidth / Math.max(1, im.naturalHeight)); im.onerror = () => ok(1); im.src = dataUrl }) },
      }).catch((e: Error) => ({ fallback: true, reason: e.message }))
      if (srv?.features?.length) {
        setPreview(srv.features)
        setModeLabel(tl("AI Vision (Gemini)", "AI Vision (Gemini)"))
      } else {
        const res = await analyzeImageToGis(dataUrl, { center, landM2: org?.land_m2 || 12000, onProgress: setProgress })
        setPreview(res.features)
        setModeLabel(tl("Vektorisasi lokal", "Local vectorizer") + (srv?.reason ? ` · ${srv.reason}` : ""))
      }
      toast.success(tl("Gambar berhasil diubah menjadi denah GIS — periksa & ubah nama objek bila perlu", "Image converted to a GIS plan — review and rename objects if needed"))
    } catch (e: any) {
      toast.error(e?.message ?? tl("Gagal memproses gambar", "Failed to process image"))
    } finally {
      setBusy(false); setProgress("")
    }
  }

  const onPickFile = async (file?: File | null) => {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast.error(tl("Pilih berkas gambar (PNG, JPG, WebP, atau SVG)", "Select an image file (PNG, JPG, WebP, or SVG)"))
      return
    }
    const url = await fileToDataUrl(file)
    await runAiFromDataUrl(url)
  }

  if (isLoading) return <PageSkeleton />
  const visible = assets.filter((a) => !off.has(a.type))
  const counts = Object.fromEntries(Object.keys(TYPES).map((k) => [k, assets.filter((a) => a.type === k).length]))
  const mapPoints = visible.map((a) => ({
    id: a.id, lat: a.lat, lng: a.lng, kind: a.type, size: a.type === "pohon" ? a.dbhNow : undefined,
    color: a.status !== "hidup" ? "#ef4444" : TYPES[a.type]?.color,
    label: `${a.code} · ${t(TYPES[a.type]?.label ?? a.type)}${a.species_name ? ` · ${a.species_name} · ${num(a.dbhNow, 1)} cm` : ""}`,
    onClick: () => setSel(a),
  }))
  const editableFeatures = (preview ?? []).map((f, idx) => ({ f, idx })).filter(({ f }) => f.name && !["boundary", "path"].includes(f.type))

  return (
    <div className="space-y-8">
      <PageHeader
        icon={MapIcon}
        title={t("Peta Aset")}
        description={t("Pohon, biopori, komposter, panel surya, dan aset lingkungan lain ber-QR beserta lokasi GPS.")}
        actions={
          <Button size="lg" className="h-11" onClick={() => setOpenAi(true)}>
            <Sparkles /> {tl("Upload Gambar → AI GIS", "Upload Image → AI GIS")}
          </Button>
        }
      />
      <div className="flex flex-wrap gap-2">
        {Object.entries(TYPES).filter(([k]) => counts[k]).map(([k, v]) => (
          <button key={k} onClick={() => { const s = new Set(off); if (s.has(k)) s.delete(k); else s.add(k); setOff(s) }}
            className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all", off.has(k) ? "opacity-40" : "bg-card shadow-xs")}>
            <span className="size-2.5 rounded-full" style={{ background: v.color }} />{t(v.label)}<span className="text-xs text-muted-foreground">{counts[k]}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden py-0">
          <TreeMap height={560} features={currentFeatures} points={mapPoints} selectedId={sel?.id} />
        </Card>
        <Card>
          <CardHeader><CardTitle>{sel ? sel.code : t("Ringkasan aset")}</CardTitle><CardDescription>{sel ? t(TYPES[sel.type]?.label ?? sel.type) : t("Klik titik di peta untuk detail")}</CardDescription></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {sel ? (
              <>
                <div className="flex gap-2"><StatusBadge status={sel.status} />{sel.flags?.map((f: string) => <Badge key={f} variant="outline" className="border-amber-500/30 text-amber-600">{t(f)}</Badge>)}</div>
                {sel.type === "pohon" && <dl className="grid grid-cols-2 gap-2"><dt className="text-muted-foreground">{t("Jenis")}</dt><dd>{sel.species_name}</dd><dt className="text-muted-foreground">DBH</dt><dd>{num(sel.dbhNow, 1)} cm</dd><dt className="text-muted-foreground">{t("Stok CO₂")}</dt><dd>{num(sel.stock, 0)} kg</dd></dl>}
                {sel.type !== "pohon" && <dl className="grid grid-cols-2 gap-2">{Object.entries<any>(sel.meta ?? {}).map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd>{String(v)}</dd></div>)}</dl>}
                <p className="font-mono text-xs text-muted-foreground">{sel.lat.toFixed(5)}, {sel.lng.toFixed(5)}</p>
                {sel.type === "pohon" && <button className="text-sm font-medium text-primary" onClick={() => nav(`/app/trees/${sel.uuid ?? sel.id}`)}>{t("Buka kartu pohon")} →</button>}
              </>
            ) : Object.entries(TYPES).filter(([k]) => counts[k]).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: v.color }} />{t(v.label)}<span className="ml-auto font-medium tabular">{counts[k]}</span></div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Dialog: Upload Gambar Denah / Citra → AI membuat versi GIS sesuai format sekarang */}
      <Dialog open={openAi} onOpenChange={setOpenAi}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              {tl("Buat Denah GIS dari Gambar (AI)", "Generate GIS Site Plan from Image (AI)")}
            </DialogTitle>
            <DialogDescription>
              {tl(
                "Unggah foto denah sekolah, tangkapan layar citra satelit, atau sketsa lokasi. AI akan mendeteksi gedung, lapangan, taman, parkir, dan jalur lalu mengubahnya menjadi peta vektor GIS WGS84 seperti tampilan Peta Aset saat ini.",
                "Upload a school floor plan photo, satellite screenshot, or site sketch. AI detects buildings, fields, gardens, parking, and paths and converts them into a WGS84 vector GIS map matching the current Asset Map."
              )}
            </DialogDescription>
          </DialogHeader>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { onPickFile(e.target.files?.[0]); e.target.value = "" }}
          />

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onPickFile(e.dataTransfer.files?.[0]) }}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-5 py-4"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                {busy ? <Spinner /> : <ImageUp className="size-5" />}
              </span>
              <div className="text-sm">
                <div className="font-medium">{tl("Pilih atau seret gambar denah / citra satelit ke sini", "Choose or drop a floor plan / satellite image here")}</div>
                <div className="text-xs text-muted-foreground">{busy ? (progress || tl("Memproses…", "Processing…")) : tl("Denah garis, denah kotak berwarna, atau citra satelit (PNG, JPG, WebP, SVG). Nama ruang dibaca otomatis dari tulisan di denah.", "Line plans, coloured-box plans or satellite images (PNG, JPG, WebP, SVG). Room names are read from the text on the plan.")}</div>
              </div>
            </div>
            <Button type="button" variant="outline" className="border-primary text-primary hover:text-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
              <ImageUp /> {imgUrl ? tl("Ganti gambar", "Change image") : tl("Pilih gambar", "Choose image")}
            </Button>
          </div>

          {preview && (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Gambar sumber */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span>{tl("Gambar yang diunggah", "Uploaded image")}</span>
                    {modeLabel && <Badge variant="secondary">{modeLabel}</Badge>}
                  </div>
                  <div className="flex h-[320px] items-center justify-center overflow-hidden rounded-xl border bg-muted/40 p-2">
                    {imgUrl && <img src={imgUrl} alt="Denah sumber" className="max-h-full max-w-full rounded-lg object-contain" />}
                  </div>
                </div>

                {/* Pratinjau versi GIS */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-1 text-xs font-medium text-muted-foreground">
                    <span>{tl("Hasil versi GIS (dengan titik aset)", "Generated GIS version (with asset points)")}</span>
                    <div className="flex items-center gap-1">
                      <Button size="xs" variant="outline" title={tl("Putar 90°", "Rotate 90°")} onClick={() => setPreview(rotateFeatures(preview, center, 90))}>
                        <RotateCw className="size-3.5" /> 90°
                      </Button>
                      <Button size="xs" variant="outline" title={tl("Perkecil cakupan", "Shrink scale")} onClick={() => setPreview(scaleFeatures(preview, center, 0.9))}>
                        <ZoomOut className="size-3.5" />
                      </Button>
                      <Button size="xs" variant="outline" title={tl("Perbesar cakupan", "Expand scale")} onClick={() => setPreview(scaleFeatures(preview, center, 1.1))}>
                        <ZoomIn className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <TreeMap height={320} features={preview} points={mapPoints} />
                </div>
              </div>

              {/* Edit label gedung / area yang terdeteksi */}
              {editableFeatures.length > 0 && (
                <div className="space-y-2 rounded-2xl bg-muted/40 p-4">
                  <div className="text-xs font-medium text-muted-foreground">
                    {tl("Objek GIS yang terdeteksi (klik nama untuk mengubah):", "Detected GIS features (edit names if needed):")}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                    {editableFeatures.map(({ f, idx }) => (
                      <div key={idx} className="flex items-center gap-2 rounded-xl bg-card px-2.5 py-1.5 ring-1 ring-border">
                        <Badge variant="outline" className="shrink-0 text-[0.6875rem]">{FEATURE_LABEL[f.type] ?? f.type}</Badge>
                        <Input
                          value={f.name ?? ""}
                          onChange={(e) => {
                            const next = [...preview]
                            next[idx] = { ...next[idx], name: e.target.value }
                            setPreview(next)
                          }}
                          className="h-7 border-0 bg-transparent px-1 text-xs focus-visible:ring-1"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-wrap justify-between gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={savePolygon.isPending}
              onClick={() => savePolygon.mutate(defaultSiteFeatures(center, org?.land_m2 || 12000))}
            >
              <RotateCcw /> {tl("Reset ke denah bawaan", "Reset to default plan")}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpenAi(false)}>
                {tl("Batal", "Cancel")}
              </Button>
              <Button
                type="button"
                disabled={!preview || savePolygon.isPending}
                onClick={() => preview && savePolygon.mutate(preview)}
              >
                {savePolygon.isPending ? <Spinner /> : <Sparkles />}
                {tl("Terapkan ke Peta Aset", "Apply to Asset Map")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
