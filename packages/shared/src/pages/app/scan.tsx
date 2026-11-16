import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import QrScanner from "qr-scanner"
import { toast } from "sonner"
import { Camera, CameraOff, CloudOff, Flashlight, Keyboard, RotateCcw, Ruler, ScanLine, Search, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { ASSET_META, AssetQrCard } from "@/components/tree-qr-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { PageHeader, QualityBadge } from "@/components/common"
import { MeasureForm } from "@/components/measure-form"
import { api, dropQueued, onQueueChange, queueList, type QueuedReq } from "@/lib/api"
import { useOrg } from "@/lib/hooks"
import { fmtDate, fmtDateTime, num } from "@/lib/format"
import { t as tr, tl } from "@/lib/i18n"

function parse(text: string) {
  try {
    const u = new URL(text)
    const m = u.pathname.match(/\/p\/([^/]+)/)
    if (m) return { code: decodeURIComponent(m[1]), sig: u.searchParams.get("s") ?? "" }
  } catch { /* bukan URL */ }
  return { code: text.trim(), sig: "" }
}

export default function Scan() {
  const { orgId, org } = useOrg()
  const qc = useQueryClient()
  const video = useRef<HTMLVideoElement>(null)
  const scanner = useRef<QrScanner | null>(null)
  const [on, setOn] = useState(false)
  const [tree, setTree] = useState<any>(null)
  const [verified, setVerified] = useState<boolean | null>(null)
  const [manual, setManual] = useState("")
  const [queue, setQueue] = useState<QueuedReq[]>([])
  const [flash, setFlash] = useState<boolean | null>(null) // null = kamera tanpa senter
  // daftar pohon (tersimpan di cache SW untuk mode offline)
  const { data: trees } = useQuery({ queryKey: ["assets", orgId, "pohon"], queryFn: () => api<any[]>(`/orgs/${orgId}/assets?type=pohon`), enabled: !!orgId })

  useEffect(() => onQueueChange(() => queueList().then(setQueue)), [])
  useEffect(() => () => { scanner.current?.destroy() }, [])

  const handle = async (text: string) => {
    const { code, sig } = parse(text)
    stop()
    const local = trees?.find((t) => t.code === code)
    if (navigator.onLine) {
      try {
        const a = await api(`/qr/${encodeURIComponent(code)}?s=${encodeURIComponent(sig)}`)
        setVerified(true)
        setTree(local ?? { id: a.id, uuid: a.uuid, code, type: a.type, status: a.status, species_id: a.species_id, qr_sig: sig, name: a.name, meta: a.meta, created_at: a.created_at })
        return
      } catch (e: any) {
        if (e.status === 403 && sig) { setVerified(false); setTree(null); return toast.error(tr("QR palsu atau telah diubah — ditolak")) }
        if (!local) return toast.error(e.message)
      }
    }
    if (!local) return toast.error(tr("Kode {c} tidak ada di daftar pohon (offline)", { c: code }))
    setVerified(sig ? local.qr_sig === sig : null)
    if (sig && local.qr_sig !== sig) return toast.error(tr("Tanda tangan QR tidak cocok — ditolak"))
    setTree(local)
  }
  const start = async () => {
    if (!video.current) return
    try {
      scanner.current ??= new QrScanner(video.current, (r) => handle(r.data), { preferredCamera: "environment", highlightScanRegion: false, highlightCodeOutline: true, maxScansPerSecond: 8 })
      await scanner.current.start()
      setOn(true); setTree(null); setVerified(null)
      setFlash((await scanner.current.hasFlash().catch(() => false)) ? false : null)
    } catch {
      toast.error(tr("Kamera tidak dapat diakses. Izinkan akses kamera atau masukkan kode manual."))
    }
  }
  const stop = () => { scanner.current?.stop(); setOn(false); setFlash((f) => (f === null ? null : false)) }
  const toggleFlash = async () => { await scanner.current?.toggleFlash().catch(() => {}); setFlash(!!scanner.current?.isFlashOn()) }

  return (
    <div className="space-y-8">
      <PageHeader icon={ScanLine} title={tr("Scan & ukur")} description={tr("Scan QR pohon dari kamera browser. Berjalan tanpa sinyal — pengukuran masuk antrian dan tersinkron otomatis.")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          {/* jendela pemindai */}
          <div className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem] bg-[#0b1f17] shadow-[0_20px_50px_-24px_rgba(6,40,26,0.6)] ring-1 ring-black/5">
            <video ref={video} className={cn("size-full object-cover transition-opacity duration-300", on ? "opacity-100" : "opacity-0")} playsInline muted />
            {!on && (
              <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,rgba(52,211,153,0.28),transparent_60%),linear-gradient(160deg,#0f3b2a,#0a1712)]">
                <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:28px_28px]" />
              </div>
            )}
            {/* bingkai sudut + garis pindai */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-14">
              <div className="relative aspect-square h-[52%]">
                {["top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-[1.4rem]", "top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-[1.4rem]", "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-[1.4rem]", "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-[1.4rem]"].map((c) => (
                  <span key={c} className={cn("absolute size-10 border-emerald-300", c)} />
                ))}
                <span className="anim-scan absolute inset-x-3 h-0.5 rounded-full bg-gradient-to-r from-transparent via-emerald-300 to-transparent shadow-[0_0_14px_2px_rgba(110,231,183,0.7)]" />
                {!on && <ScanLine className="absolute inset-0 m-auto size-10 text-white/35" strokeWidth={1.6} />}
              </div>
            </div>
            {/* status */}
            <span className="absolute top-4 left-4 inline-flex h-8 items-center gap-2 rounded-full bg-black/35 px-3 text-xs font-medium text-white backdrop-blur-md">
              <span className={cn("size-2 rounded-full", on ? "animate-pulse bg-emerald-400" : "bg-white/50")} />{on ? tr("Memindai…") : tr("Kamera mati")}
            </span>
            {/* kontrol */}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-black/55 to-transparent px-4 pt-10 pb-4">
              {on ? (
                <>
                  {flash !== null && <button type="button" onClick={toggleFlash} aria-label={tr("Senter")} className={cn("flex size-12 items-center justify-center rounded-full backdrop-blur-md transition-colors", flash ? "bg-amber-300 text-amber-950" : "bg-white/15 text-white")}><Flashlight className="size-5" /></button>}
                  <button type="button" onClick={stop} className="inline-flex h-12 items-center gap-2 rounded-full bg-white/15 px-5 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-white/25"><CameraOff className="size-4" />{tr("Tutup kamera")}</button>
                </>
              ) : (
                <button type="button" onClick={start} className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-emerald-900 shadow-lg transition-transform active:scale-95"><Camera className="size-4" />{tr("Buka kamera")}</button>
              )}
            </div>
          </div>

          {/* kode manual */}
          <form className="flex items-center gap-2 rounded-full bg-card p-1.5 pl-2 shadow-[0_10px_30px_-14px_rgba(16,64,42,0.25)] ring-1 ring-border focus-within:ring-2 focus-within:ring-primary/40" onSubmit={(e) => { e.preventDefault(); if (manual) handle(manual) }}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Keyboard className="size-4" /></span>
            <input className="h-10 min-w-0 flex-1 bg-transparent font-mono text-sm tracking-wide uppercase outline-none placeholder:font-sans placeholder:tracking-normal placeholder:normal-case placeholder:text-muted-foreground" placeholder={tr("Ketik kode pohon, mis. NGS-PH-0001")} value={manual} onChange={(e) => setManual(e.target.value.toUpperCase())} />
            <button type="submit" disabled={!manual} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-5 text-sm font-medium text-background transition-transform active:scale-95 disabled:opacity-40"><Search className="size-4" />{tr("Cari")}</button>
          </form>
        </div>
        <Card>
          {tree ? (
            <>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{tree.code}</span>
                  {verified === true && <Badge className="gap-1 bg-primary/10 text-primary"><ShieldCheck className="size-3" />{tr("QR asli")}</Badge>}
                  {verified === false && <Badge variant="destructive" className="gap-1"><ShieldAlert className="size-3" />{tr("QR tidak valid")}</Badge>}
                  {!navigator.onLine && <Badge variant="outline" className="gap-1"><CloudOff className="size-3" />{tr("offline")}</Badge>}
                </CardTitle>
                {tree.type && tree.type !== "pohon" ? <CardDescription>{tl(ASSET_META[tree.type]?.id ?? tree.type, ASSET_META[tree.type]?.en ?? tree.type)} · {tl("aset ini tidak diukur DBH", "this asset has no DBH measurement")}</CardDescription> : <CardDescription>
                  {tree.species_name} {tr("· DBH kini")} {num(tree.dbhNow, 1)} {tr("cm · ukur terakhir")} {fmtDate(tree.last?.date)} <QualityBadge label={tree.label} className="ml-1" />
                  <Link to={`/app/trees/${tree.uuid ?? tree.id}`} className="ml-2 text-primary underline-offset-2 hover:underline">{tr("kartu pohon →")}</Link>
                </CardDescription>}
              </CardHeader>
              <CardContent>
                {tree.type && tree.type !== "pohon" ? (
                  <div className="space-y-3">
                    <div className="flex justify-center overflow-x-auto py-1"><AssetQrCard t={tree} orgName={org?.name ?? ""} /></div>
                    <p className="text-center text-sm text-muted-foreground">{tl("Data aset ini dikelola Operator di menu Jasa Lingkungan.", "This asset is managed by the Operator under Eco services.")}</p>
                  </div>
                ) : <MeasureForm orgId={orgId} assetId={tree.id} lastDbh={tree.last?.dbh} needSpecies={tree.status === "belum_dipasang" || !tree.species_id} onDone={() => { qc.invalidateQueries({ queryKey: ["assets"] }); setTree(null); toast.info(tr("Siap scan pohon berikutnya")) }} />}
                <Button variant="ghost" className="mt-2 w-full" onClick={start}><RotateCcw /> {tr("Scan pohon lain")}</Button>
              </CardContent>
            </>
          ) : (
            <CardContent className="flex h-full min-h-72 flex-col justify-center gap-5 py-6">
              <div><p className="text-lg font-medium">{tr("Cara memindai")}</p><p className="mt-1 text-sm text-muted-foreground">{tr("QR bertanda tangan HMAC: label palsu/hasil edit ditolak.")}</p></div>
              <ol className="space-y-3">
                {[[Camera, tr("Arahkan kamera ke label QR pohon."), tr("Pastikan label terang & tidak buram")], [Ruler, tr("Ukur keliling/DBH setinggi dada"), tr("Isi angka lalu simpan")], [CloudOff, tr("Tanpa sinyal tetap bisa"), tr("Tersinkron otomatis saat online")]].map(([I, a, b]: any, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3">
                    <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary"><I className="size-[1.125rem]" /><span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-foreground text-[0.625rem] font-semibold text-background">{i + 1}</span></span>
                    <span className="min-w-0 leading-tight"><span className="block text-sm font-medium">{a}</span><span className="mt-0.5 block text-xs text-muted-foreground">{b}</span></span>
                  </li>
                ))}
              </ol>
            </CardContent>
          )}
        </Card>
      </div>
      {queue.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CloudOff className="size-4" /> Antrian offline ({queue.length})</CardTitle><CardDescription>{tr("Tersinkron otomatis saat online · kunci idempoten mencegah data ganda")}</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {queue.map((q) => (
              <div key={q.id} className="flex items-center gap-3 rounded-2xl bg-muted/50 p-3.5 text-sm">
                <div className="min-w-0 flex-1"><p className="truncate">{q.label}</p><p className="text-xs text-muted-foreground">{fmtDateTime(q.createdAt)}{q.error && <span className="text-destructive"> · {q.error} (salinan lokal disimpan)</span>}</p></div>
                <Button size="icon-sm" variant="ghost" onClick={() => dropQueued(q.id)} aria-label={tr("Hapus")}><Trash2 /></Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
