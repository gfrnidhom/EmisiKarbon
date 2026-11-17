import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { QRCodeSVG } from "qrcode.react"
import { toast } from "sonner"
import { Link } from "react-router-dom"
import { ArrowUpRight,
  BatteryMedium, CheckCircle2, Copy, Cpu, Droplets, FileInput, Flame, Fuel, Link2, Plus, Power, QrCode, RefreshCw, Send, Sun, TriangleAlert, Wifi, WifiOff, Zap,
} from "lucide-react"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState, Field, PageHeader, PageSkeleton, SimpleSelect, Spinner, StatCard } from "@/components/common"
import { BarsChart } from "@/components/charts"
import { api } from "@/lib/api"
import { EditDialog, RowActions, usePerm } from "@/components/row-actions"
import { useOrg } from "@/lib/hooks"
import { fmtDate, fmtDateTime, monthAdd, num, todayWIB } from "@/lib/format"
import { t, tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type Conn = "terhubung" | "terlambat" | "terputus" | "belum_terhubung" | "nonaktif"
const CONN: Record<Conn, { label: string; en: string; dot: string; pill: string; icon: any }> = {
  terhubung: { label: "Terhubung", en: "Connected", dot: "bg-emerald-500", pill: "bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300", icon: Wifi },
  terlambat: { label: "Terlambat", en: "Delayed", dot: "bg-amber-500", pill: "bg-amber-500/12 text-amber-700 ring-amber-500/25 dark:text-amber-300", icon: Wifi },
  terputus: { label: "Terputus", en: "Disconnected", dot: "bg-red-500", pill: "bg-red-500/10 text-red-700 ring-red-500/25 dark:text-red-300", icon: WifiOff },
  belum_terhubung: { label: "Belum terhubung", en: "Not paired", dot: "bg-slate-400", pill: "bg-muted text-muted-foreground ring-border", icon: Link2 },
  nonaktif: { label: "Nonaktif", en: "Disabled", dot: "bg-slate-400", pill: "bg-muted text-muted-foreground ring-border", icon: Power },
}
export function ConnectionPill({ status, className }: { status: Conn; className?: string }) {
  const c = CONN[status] ?? CONN.belum_terhubung
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ring-1", c.pill, className)}>
      <span className="relative flex size-2">
        {status === "terhubung" && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", c.dot)} />}
        <span className={cn("relative inline-flex size-2 rounded-full", c.dot)} />
      </span>
      {tl(c.label, c.en)}
    </span>
  )
}
function ago(sec: number | null | undefined) {
  if (sec === null || sec === undefined) return tl("belum pernah", "never")
  if (sec < 60) return tl(`${sec} detik lalu`, `${sec}s ago`)
  if (sec < 3600) return tl(`${Math.floor(sec / 60)} menit lalu`, `${Math.floor(sec / 60)} min ago`)
  if (sec < 86400) return tl(`${Math.floor(sec / 3600)} jam lalu`, `${Math.floor(sec / 3600)} h ago`)
  return tl(`${Math.floor(sec / 86400)} hari lalu`, `${Math.floor(sec / 86400)} d ago`)
}
function SignalBars({ rssi }: { rssi?: number | null }) {
  const level = rssi == null ? 0 : rssi >= -55 ? 4 : rssi >= -65 ? 3 : rssi >= -75 ? 2 : 1
  return (
    <span className="inline-flex items-end gap-0.5" title={rssi == null ? "-" : `${rssi} dBm`}>
      {[1, 2, 3, 4].map((i) => <span key={i} className={cn("w-1 rounded-sm", i <= level ? "bg-primary" : "bg-muted-foreground/25")} style={{ height: 3 + i * 3 }} />)}
    </span>
  )
}
const CAT_ICON: Record<string, any> = { listrik_pln: Zap, genset: Fuel, lpg: Flame, plts: Sun, air: Droplets }
const EFFECT: Record<string, { id: string; en: string; cls: string }> = {
  emisi: { id: "Dihitung sebagai emisi", en: "Counted as emissions", cls: "bg-primary/12 text-primary" },
  terhindar: { id: "Emisi terhindar", en: "Avoided emissions", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  pantau: { id: "Hanya pemantauan", en: "Monitoring only", cls: "bg-muted text-muted-foreground" },
}
const fmtInterval = (s: number) => (s >= 3600 ? `${s / 3600} ${tl("jam", "h")}` : s >= 60 ? `${s / 60} ${tl("menit", "min")}` : `${s} ${tl("detik", "s")}`)

/** Sensor IoT: pairing perangkat via QR, status koneksi live, pembacaan meter → data aktivitas. */
/** Penjelasan faktor dalam bahasa sehari-hari — kode & versi cukup di menu Faktor Emisi. */
const FACTOR_PLAIN: Record<string, () => string> = {
  listrik_pln: () => tl("Rata-rata pembangkit listrik PLN di wilayahmu", "Average PLN power generation in your region"),
  genset: () => tl("Pembakaran solar di genset", "Diesel burned in the genset"),
  lpg: () => tl("Pembakaran gas LPG", "LPG combustion"),
  plts: () => tl("Listrik PLN yang tergantikan panel surya", "PLN electricity replaced by solar"),
}

export default function Iot() {
  const { orgId, can } = useOrg()
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ["iot", orgId], queryFn: () => api<any>(`/orgs/${orgId}/iot`), enabled: !!orgId, refetchInterval: 10_000 })
  const [sel, setSel] = useState<number | null>(null)
  const device = data?.devices.find((d: any) => d.id === (sel ?? data?.devices[0]?.id))
  const readings = useQuery({ queryKey: ["iot-readings", device?.id], queryFn: () => api<any>(`/iot/${device.id}/readings?days=45`), enabled: !!device, refetchInterval: 30_000 })
  const beats = useQuery({ queryKey: ["iot-beats", device?.id], queryFn: () => api<any[]>(`/iot/${device.id}/heartbeats`), enabled: !!device, refetchInterval: 10_000 })
  const [add, setAdd] = useState(false)
  const perm = usePerm()
  const [editD, setEditD] = useState<any>(null)
  const [pairOpen, setPairOpen] = useState(false)
  const [simOpen, setSimOpen] = useState(false)
  const [simVal, setSimVal] = useState("")
  const [simDelta, setSimDelta] = useState<number | null>(5)
  const [nf, setNf] = useState({ name: "", category: "", location: "", interval_sec: "300" })
  const cats = useQuery({ queryKey: ["iot-categories", orgId], queryFn: () => api<any[]>(`/orgs/${orgId}/iot/categories`), enabled: !!orgId })
  const chosen = cats.data?.find((c) => c.key === nf.category)
  const [period, setPeriod] = useState(monthAdd(todayWIB().slice(0, 7), -1))
  const refresh = () => { qc.invalidateQueries({ queryKey: ["iot"] }); qc.invalidateQueries({ queryKey: ["iot-beats"] }); qc.invalidateQueries({ queryKey: ["iot-readings"] }) }
  const create = useMutation({
    mutationFn: () => api<any>(`/orgs/${orgId}/iot`, { method: "POST", json: { ...nf, interval_sec: Number(nf.interval_sec) } }),
    onSuccess: (r) => { toast.success(tl("Perangkat terdaftar — lanjutkan pairing dengan QR", "Device registered — continue pairing with the QR")); setAdd(false); setSel(r.id); refresh(); setPairOpen(true) },
    onError: (e: Error) => toast.error(e.message),
  })
  const toAct = useMutation({ mutationFn: () => api<any>(`/iot/${device.id}/to-activity`, { method: "POST", json: { period } }), onSuccess: (r) => toast.success(tl(`Data aktivitas ${num(r.quantity, 1)} ${device.unit} (${device.carbon?.label}) dibuat sebagai Draf · ${r.days} hari terbaca`, `Activity data ${num(r.quantity, 1)} ${device.unit} (${device.carbon?.label}) created as Draft · ${r.days} days read`)), onError: (e: Error) => toast.error(e.message) })
  const patch = useMutation({
    mutationFn: (b: any) => api(`/iot/${device.id}`, { method: "PATCH", json: b }),
    onSuccess: (_, b: any) => { if (b.rotate) toast.info(tl("Token diganti — perangkat lama terputus, pasangkan ulang lewat QR", "Token rotated — the old device is disconnected; pair again via QR")); refresh() },
  })
  // Uji koneksi ke perangkat IoT sebenarnya melalui server backend
  const testPing = useMutation({
    mutationFn: async () => {
      return await api<any>(`/iot/${device.id}/test-connection`, { method: "POST" })
    },
    onSuccess: (res: any) => {
      if (res.connected) {
        toast.success(tl("Perangkat IoT merespon — Terhubung", "IoT device responded — Connected"))
      } else {
        toast.error(tl(res.message ?? "Perangkat IoT tidak merespon — Status: Terputus", res.message ?? "IoT device did not respond — Disconnected"))
      }
      refresh()
      qc.invalidateQueries({ queryKey: ["dashboard"] })
      qc.invalidateQueries({ queryKey: ["trace-page"] })
    },
    onError: (e: Error) => {
      toast.error(e.message)
      refresh()
    },
  })
  // Kirim data pembacaan uji langsung dari UI
  const sendTestReading = useMutation({
    mutationFn: (b: any) => api(`/iot/${device.id}/test-reading`, { method: "POST", json: b }),
    onSuccess: () => {
      toast.success(tl("Pembacaan uji berhasil dikirim! Scope 2 dan Dasbor diperbarui.", "Test reading sent! Scope 2 and Dashboard updated."))
      setSimOpen(false)
      refresh()
      qc.invalidateQueries({ queryKey: ["monthly"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
      qc.invalidateQueries({ queryKey: ["trace-page"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (isLoading) return <PageSkeleton />
  const devices: any[] = data.devices
  const count = (k: Conn) => devices.filter((d) => d.connection === k).length
  return (
    <div className="space-y-8">
      <PageHeader icon={Cpu} title={t("Sensor IoT")} badge={<Badge variant="outline">Beta · V3</Badge>}
        description={tl("Pasangkan meter pintar dengan scan QR. Status koneksi diperbarui otomatis dari heartbeat & pembacaan perangkat.", "Pair smart meters by scanning a QR. Connection status updates automatically from device heartbeats & readings.")}
        actions={can("operator", "admin") && <Button onClick={() => setAdd(true)}><Plus /> {tl("Tambah perangkat", "Add device")}</Button>} />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={tl("Terhubung", "Connected")} icon={Wifi} tone="leaf" value={count("terhubung")} sub={tl(`dari ${devices.length} perangkat`, `of ${devices.length} devices`)} />
        <StatCard label={tl("Terlambat", "Delayed")} icon={TriangleAlert} tone="warn" value={count("terlambat")} sub={tl("melewatkan beberapa kiriman", "missed some transmissions")} />
        <StatCard label={tl("Terputus", "Disconnected")} icon={WifiOff} tone={count("terputus") ? "warn" : "default"} value={count("terputus")} sub={tl("tidak ada data > 6 jam", "no data > 6 hours")} />
        <StatCard label={tl("Belum terhubung", "Not paired")} icon={Link2} value={count("belum_terhubung")} sub={tl("menunggu scan QR", "waiting for QR scan")} />
      </div>

      {!device ? <EmptyState icon={Cpu} title={t("Belum ada perangkat")} /> : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="space-y-3">
            {devices.map((d) => (
              <button key={d.id} onClick={() => setSel(d.id)} className={cn("w-full rounded-2xl bg-card p-5 text-left transition-all", device.id === d.id ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-primary/30")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-3">{(() => { const Ic = CAT_ICON[d.category] ?? Cpu; return <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Ic className="size-4" /></span> })()}<div className="min-w-0"><p className="truncate font-semibold">{d.name}</p><p className="truncate text-xs text-muted-foreground">{d.carbon?.label} · {d.location ?? "-"}</p></div></div>
                  <SignalBars rssi={d.connection === "terhubung" ? d.rssi : null} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <ConnectionPill status={d.connection} />
                  <span className="text-xs text-muted-foreground">{ago(d.lastSeenAgeSec)}</span>
                </div>
                <div className="mt-2.5 flex items-center justify-between border-t border-border/40 pt-2 text-xs">
                  <span className="text-muted-foreground">{tl("Hari ini:", "Today:")} <b className="font-semibold text-foreground tabular">{num(d.periods?.today?.value ?? d.todayUsage ?? 0, 1)} {d.unit}</b></span>
                  <span className="text-muted-foreground">{tl("Bulan ini:", "Month:")} <b className="font-semibold text-foreground tabular">{num(d.periods?.thisMonth?.value ?? d.monthToDate ?? 0, 1)} {d.unit}</b></span>
                </div>
              </button>
            ))}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-3">{device.name}<ConnectionPill status={device.connection} /></CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-2">{device.carbon?.label} · {device.unit} · {device.location ?? "-"}<span className={cn("rounded-full px-2.5 py-0.5 text-[0.6875rem] font-medium", EFFECT[device.carbon?.effect]?.cls)}>{tl(EFFECT[device.carbon?.effect]?.id ?? "", EFFECT[device.carbon?.effect]?.en ?? "")}</span></CardDescription>
                {can("operator", "admin") && (
                  <CardAction className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setSimDelta(5); setSimVal(""); setSimOpen(true) }} disabled={device.status !== "aktif"}><Zap /> {tl("Kirim data uji", "Test reading")}</Button>
                    <Button size="sm" onClick={() => setPairOpen(true)} disabled={device.status !== "aktif"}><QrCode /> {device.paired_at ? tl("QR koneksi", "Connection QR") : tl("Hubungkan perangkat", "Pair device")}</Button>
                    <Button size="sm" variant="outline" onClick={() => testPing.mutate()} disabled={testPing.isPending || device.status !== "aktif"}>{testPing.isPending ? <Spinner /> : <Send />} {tl("Uji koneksi", "Ping")}</Button>
                    <Button size="sm" variant="ghost" onClick={() => patch.mutate({ status: device.status === "aktif" ? "nonaktif" : "aktif" })}><Power /> {device.status === "aktif" ? t("Nonaktifkan") : t("Aktifkan")}</Button>
                    {perm.manage && <RowActions onEdit={() => setEditD(device)} del={{ path: `/iot/${device.uuid ?? device.id}`, title: tl(`Hapus perangkat "${device.name}"?`, `Delete device "${device.name}"?`), description: tl("Perangkat beserta seluruh bacaan & riwayat koneksinya dihapus permanen. Bila bacaan sudah dipakai menghitung bulan yang tutup buku, penghapusan ditolak — nonaktifkan saja.", "The device and all its readings are removed permanently. If readings were used for closed months, deletion is refused — deactivate instead."), invalidate: [["iot"]], onDone: () => setSel(null) }} />}
                  </CardAction>
                )}
              </CardHeader>
              <CardContent className="space-y-6">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
                  {[
                    [tl("Terakhir terlihat", "Last seen"), device.last_seen_at ? <span title={fmtDateTime(device.last_seen_at)}>{ago(device.lastSeenAgeSec)}</span> : "–"],
                    [tl("Interval kirim", "Send interval"), fmtInterval(device.interval_sec ?? 300)],
                    [tl("Sinyal Wi-Fi", "Wi-Fi signal"), device.rssi != null ? <span className="inline-flex items-center gap-2"><SignalBars rssi={device.rssi} />{device.rssi} dBm</span> : "–"],
                    [tl("Baterai", "Battery"), device.battery != null ? <span className="inline-flex items-center gap-1"><BatteryMedium className="size-4" />{num(device.battery)}%</span> : "–"],
                    [tl("Firmware", "Firmware"), device.firmware ?? "–"],
                    [tl("Alamat IP", "IP address"), <span className="font-mono text-xs">{device.last_ip ?? "–"}</span>],
                  ].map(([k, v], i) => <div key={i}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="mt-1 font-medium">{v}</dd></div>)}
                </dl>

                {/* Integrasi Scope 2 (Listrik PLN) jika kategori listrik */}
                {(device.category === "listrik_pln" || device.source === "listrik") && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4">
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                        <Zap className="size-5" />
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{tl("Terintegrasi ke Scope 2 · Listrik PLN", "Integrated into Scope 2 · Grid Electricity")}</span>
                          <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-500/25 dark:text-emerald-300">
                            {tl("Terbaca Otomatis", "Auto Read")}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {tl("Data pembacaan kWh sensor ini otomatis terbaca di Dasbor, Rapor Karbon, dan Telusuri Angka sebagai data aktual terukur Scope 2.", "kWh readings from this sensor automatically feed into Dashboard, Carbon Report, and Trace Numbers as measured Scope 2 data.")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" variant="outline" render={<Link to="/app/carbon" />}>
                        {tl("Rapor Karbon", "Carbon Report")} <ArrowUpRight className="ml-1 size-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" render={<Link to="/app/trace?source=listrik" />}>
                        {tl("Telusuri Angka", "Trace Numbers")} <ArrowUpRight className="ml-1 size-3.5" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Metrik Pembacaan: Hari ini, Minggu ini, Bulan ini, Faktor Emisi */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{tl("Hari ini", "Today")}</span>
                      <span className="font-medium text-primary">00.00 – {tl("kini", "now")}</span>
                    </div>
                    <div className="mt-1.5 text-2xl font-bold tracking-tight tabular text-foreground">
                      {num(device.periods?.today?.value ?? device.todayUsage ?? 0, 1)}{" "}
                      <span className="text-sm font-normal text-muted-foreground">{device.unit}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      <Zap className="size-3.5" />
                      <span>{device.periods?.today?.kg != null ? `${num(device.periods.today.kg, 1)} kg CO₂e` : tl("Pemantauan", "Monitoring")}</span>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-muted/50 p-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{tl("Minggu ini", "This week")}</span>
                      <span>{tl("Senin – kini", "Mon – now")}</span>
                    </div>
                    <div className="mt-1.5 text-2xl font-bold tracking-tight tabular text-foreground">
                      {num(device.periods?.thisWeek?.value ?? device.weekUsage ?? 0, 1)}{" "}
                      <span className="text-sm font-normal text-muted-foreground">{device.unit}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{device.periods?.thisWeek?.kg != null ? `≈ ${num(device.periods.thisWeek.kg, 1)} kg CO₂e` : "–"}</span>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-muted/50 p-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{tl("Bulan ini", "This month")}</span>
                      <span>{tl("Tgl 1 – kini", "1st – now")}</span>
                    </div>
                    <div className="mt-1.5 text-2xl font-bold tracking-tight tabular text-foreground">
                      {num(device.periods?.thisMonth?.value ?? device.monthToDate ?? 0, 1)}{" "}
                      <span className="text-sm font-normal text-muted-foreground">{device.unit}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{device.periods?.thisMonth?.kg != null ? `≈ ${num(device.periods.thisMonth.kg, 1)} kg CO₂e` : "–"}</span>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-muted/50 p-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{tl("Faktor emisi", "Factor")}</span>
                      {device.carbon?.scope && <span className="rounded-full bg-primary/10 px-2 py-0.2 text-[0.6875rem] font-semibold text-primary">Scope {device.carbon.scope}</span>}
                    </div>
                    {device.carbon?.factor ? (
                      <>
                        <div className="mt-1.5 text-2xl font-bold tracking-tight tabular text-foreground">
                          {num(device.carbon.factor.value, 3)}{" "}
                          <span className="text-xs font-normal text-muted-foreground">{device.carbon.factor.unit}</span>
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {FACTOR_PLAIN[device.carbon.category]?.() ?? ""}
                        </div>
                      </>
                    ) : (
                      <div className="mt-2 text-sm text-muted-foreground">{tl("Tidak ada — pemantauan", "None — monitoring")}</div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground"><span>{tl("Aktivitas 24 jam terakhir", "Activity, last 24 hours")}</span><span>{tl("sekarang", "now")}</span></div>
                  <div className="flex h-8 items-stretch gap-1">
                    {(device.uptime as number[]).map((n, i) => (
                      <span key={i} title={`${23 - i} ${tl("jam lalu", "h ago")}: ${n}`} className={cn("flex-1 rounded-sm", n > 0 ? "bg-emerald-500/80" : device.paired_at ? "bg-red-500/25" : "bg-muted")} />
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{tl("Hijau = ada heartbeat/pembacaan pada jam tersebut. Status terhubung bila terlihat ≤ 3× interval kirim.", "Green = heartbeat/reading in that hour. Connected when seen within 3× the send interval.")}</p>
                </div>
                {device.connection === "belum_terhubung" && (
                  <div className="flex items-start gap-3 rounded-2xl border border-dashed p-4 text-sm"><QrCode className="mt-0.5 size-5 text-primary" /><div><p className="font-medium">{tl("Perangkat belum pernah terhubung", "This device has never connected")}</p><p className="text-muted-foreground">{tl("Klik “Hubungkan perangkat”, lalu scan QR dari perangkat/aplikasi konfigurasinya. Status berubah otomatis begitu perangkat mengirim data pertama.", "Click “Pair device”, then scan the QR from the device or its setup app. Status changes automatically once the first data arrives.")}</p></div></div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>{t("Konsumsi harian")}</CardTitle><CardDescription>{t("Selisih pembacaan meter kumulatif · 45 hari")}{readings.data?.factor ? ` · ${tl("total karbon", "total carbon")} ${num(readings.data.daily.reduce((s: number, x: any) => s + (x.kg ?? 0), 0), 1)} kg CO₂e` : ""}</CardDescription></CardHeader>
              <CardContent>{readings.data && <BarsChart height={230} data={readings.data.daily.map((d: any) => ({ date: d.date, kwh: d.value === null ? 0 : Math.round(d.value * 10) / 10 }))} xKey="date" xFormat={(v) => fmtDate(v, { day: "numeric", month: "short" })} bars={[{ key: "kwh", label: device.unit, color: device.carbon?.effect === "terhindar" ? "var(--scope1)" : "var(--primary)" }]} />}</CardContent>
            </Card>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>{t("Jadikan data aktivitas")}</CardTitle><CardDescription>{device.carbon?.source ? tl(`Total ${device.unit} satu bulan → data aktivitas "${device.carbon.label}" (Draf, perlu diajukan & diverifikasi)`, `Monthly ${device.unit} total → "${device.carbon.label}" activity data (Draft, needs submission & verification)`) : tl("Sensor pemantauan tidak menghasilkan data aktivitas karbon.", "Monitoring sensors do not produce carbon activity data.")}</CardDescription></CardHeader>
                <CardContent className="flex gap-2"><Input type="month" value={period} max={todayWIB().slice(0, 7)} onChange={(e) => setPeriod(e.target.value)} disabled={!device.carbon?.source} /><Button onClick={() => toAct.mutate()} disabled={toAct.isPending || !can("operator", "admin") || !device.carbon?.source}>{toAct.isPending ? <Spinner /> : <FileInput />} {t("Buat")}</Button></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>{tl("Log koneksi", "Connection log")}</CardTitle><CardDescription>{tl("Heartbeat, pairing & kiriman data terbaru", "Latest heartbeats, pairing & data")}</CardDescription></CardHeader>
                <CardContent className="max-h-56 space-y-1 overflow-y-auto text-sm">
                  {(beats.data ?? []).length === 0 && <p className="text-muted-foreground">{tl("Belum ada aktivitas koneksi.", "No connection activity yet.")}</p>}
                  {(beats.data ?? []).map((b, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-md px-2 py-1.5 odd:bg-muted/40">
                      <Badge variant="outline" className="w-14 justify-center">{b.kind}</Badge>
                      <span className="text-muted-foreground">{fmtDateTime(b.at)}</span>
                      <span className="ml-auto font-mono text-xs text-muted-foreground">{b.rssi != null ? `${b.rssi} dBm` : ""} {b.ip ?? ""}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader><CardTitle>{t("Pembacaan terakhir")}</CardTitle></CardHeader>
              <CardContent className="grid gap-1 text-sm sm:grid-cols-2">{readings.data?.raw.slice(0, 10).map((r: any) => (
                <div key={r.at} className="flex justify-between rounded-md px-2 py-1.5 odd:bg-muted/40"><span className="text-muted-foreground">{fmtDateTime(r.at)}</span><span className="font-mono">{num(r.value, 1)}</span></div>
              ))}</CardContent>
            </Card>
          </div>
        </div>
      )}

      {editD && <EditDialog open={!!editD} onOpenChange={(o) => !o && setEditD(null)} title={tl("Ubah perangkat", "Edit device")}
        fields={[{ key: "name", label: tl("Nama perangkat", "Device name") }, { key: "location", label: tl("Lokasi", "Location") }, { key: "interval_sec", label: tl("Interval kirim (detik)", "Send interval (s)"), type: "number" }]}
        initial={{ name: editD.name, location: editD.location ?? "", interval_sec: editD.interval_sec ?? 300 }} save={(v) => api(`/iot/${editD.uuid ?? editD.id}`, { method: "PATCH", json: v })} invalidate={[["iot"]]} />}
      {device && <PairDialog open={pairOpen} onOpenChange={setPairOpen} device={device} lan={data.lan ?? []} canRotate={can("operator", "admin")} onRotate={() => patch.mutate({ rotate: true })} />}

      {/* Dialog Kirim Data Uji / Simulasi Pembacaan */}
      {device && (
        <Dialog open={simOpen} onOpenChange={setSimOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Zap className="size-5 text-primary" /> {tl("Kirim Data Uji Sensor", "Send Test Sensor Reading")}</DialogTitle>
              <DialogDescription>{tl(`Simulasikan pengiriman data pembacaan meter kumulatif untuk "${device.name}". Data akan langsung tersimpan dan dihitung ke Scope 2.`, `Simulate cumulative meter reading transmission for "${device.name}". Data is stored immediately and calculated into Scope 2.`)}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="rounded-xl bg-muted/60 p-3 text-sm flex items-center justify-between">
                <span className="text-muted-foreground">{tl("Pembacaan terakhir:", "Latest reading:")}</span>
                <span className="font-semibold font-mono text-base">{device.last ? num(device.last.value, 1) : 0} {device.unit}</span>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">{tl("Tambah pemakaian cepat (+ delta):", "Quick increment (+ delta):")}</label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 5, 10, 25].map((d) => (
                    <Button key={d} type="button" size="sm" variant={simDelta === d ? "default" : "outline"} onClick={() => { setSimDelta(d); setSimVal("") }}>
                      +{d} {device.unit}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">{tl("Atau tentukan angka meter kumulatif baru:", "Or specify new cumulative reading:")}</label>
                <Input type="number" step="0.1" placeholder={tl(`mis. ${(device.last?.value ?? 50000) + 10}`, `e.g. ${(device.last?.value ?? 50000) + 10}`)} value={simVal} onChange={(e) => { setSimVal(e.target.value); setSimDelta(null) }} />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setSimOpen(false)}>{t("Batal")}</Button>
              <Button onClick={() => sendTestReading.mutate(simVal ? { value: Number(simVal) } : { delta: simDelta ?? 5 })} disabled={sendTestReading.isPending}>
                {sendTestReading.isPending ? <Spinner /> : <Send className="size-4" />} {tl("Kirim Pembacaan", "Send Reading")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={add} onOpenChange={setAdd}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{t("Daftarkan perangkat")}</DialogTitle><DialogDescription>{tl("Token unik & QR pairing dibuat otomatis setelah disimpan.", "A unique token & pairing QR are generated after saving.")}</DialogDescription></DialogHeader>
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-medium">{tl("1. Kategori sensor", "1. Sensor category")}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(cats.data ?? []).map((c) => {
                  const Ic = CAT_ICON[c.key] ?? Cpu
                  return (
                    <button key={c.key} type="button" onClick={() => setNf({ ...nf, category: c.key, name: nf.name || c.label })}
                      className={cn("flex items-start gap-3 rounded-2xl p-3.5 text-left transition-all", nf.category === c.key ? "bg-primary/10 ring-2 ring-primary" : "bg-muted/50 hover:bg-muted")}>
                      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", nf.category === c.key ? "bg-primary text-primary-foreground" : "bg-card text-primary")}><Ic className="size-[1.125rem]" /></span>
                      <span className="min-w-0">
                        <span className="block font-medium">{c.label}</span>
                        <span className="block text-xs text-muted-foreground">{c.unit} · {tl(EFFECT[c.effect].id, EFFECT[c.effect].en)}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
            {chosen && (
              <div className="space-y-2 rounded-2xl bg-muted/50 p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2"><b>{chosen.device}</b><span className={cn("rounded-full px-2.5 py-0.5 text-[0.6875rem] font-medium", EFFECT[chosen.effect].cls)}>{tl(EFFECT[chosen.effect].id, EFFECT[chosen.effect].en)}</span></div>
                <p className="text-muted-foreground">{chosen.hint}</p>
                <div className="grid grid-cols-3 gap-2 pt-1 text-center text-xs">
                  <div className="rounded-xl bg-card p-2"><div className="text-muted-foreground">{tl("Satuan", "Unit")}</div><b>{chosen.unit}</b></div>
                  <div className="rounded-xl bg-card p-2"><div className="text-muted-foreground">{tl("Masuk ke", "Feeds")}</div><b>{chosen.source ? `${chosen.label}${chosen.scope ? ` · S${chosen.scope}` : ""}` : "—"}</b></div>
                  <div className="rounded-xl bg-card p-2"><div className="text-muted-foreground">{tl("Faktor", "Factor")}</div><b>{chosen.factorInfo ? `1 ${chosen.unit} = ${num(chosen.factorInfo.value, 3)} kg` : "—"}</b></div>
                </div>
                {chosen.factorInfo && <p className="text-xs text-muted-foreground">{chosen.factorInfo.fossilShare ? tl(`${num(chosen.factorInfo.base, 3)} × porsi fosil B40 ${num(chosen.factorInfo.fossilShare * 100, 0)}% · `, `${num(chosen.factorInfo.base, 3)} × B40 fossil share ${num(chosen.factorInfo.fossilShare * 100, 0)}% · `) : ""}{chosen.factorInfo.source}</p>}
              </div>
            )}
            <div>
              <p className="mb-2 text-sm font-medium">{tl("2. Detail perangkat", "2. Device details")}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("Nama")} className="sm:col-span-2"><Input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} placeholder={tl("mis. Meter lab komputer", "e.g. Computer lab meter")} /></Field>
                <Field label={tl("Interval kirim", "Send interval")}><SimpleSelect value={nf.interval_sec} onChange={(v) => setNf({ ...nf, interval_sec: v })} options={["60", "300", "900", "3600"].map((v) => ({ value: v, label: fmtInterval(Number(v)) }))} /></Field>
                <Field label={t("Lokasi")}><Input value={nf.location} onChange={(e) => setNf({ ...nf, location: e.target.value })} placeholder={tl("mis. Panel utama, ruang TU", "e.g. Main panel, admin room")} /></Field>
              </div>
            </div>
          </div>
          <DialogFooter><Button onClick={() => create.mutate()} disabled={!nf.name || !nf.category || create.isPending}>{create.isPending && <Spinner />} {tl("Simpan & tampilkan QR", "Save & show QR")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Dialog pairing: QR konfigurasi (endpoint + token) untuk di-scan perangkat, panduan, dan contoh kode. */
function PairDialog({ open, onOpenChange, device, lan, canRotate, onRotate }: { open: boolean; onOpenChange: (o: boolean) => void; device: any; lan: string[]; canRotate: boolean; onRotate: () => void }) {
  const isLocal = /localhost|127\.0\.0\.1/.test(location.hostname)
  const options = useMemo(() => [...new Set([...(isLocal ? lan : []), location.origin])], [lan, isLocal])
  const [base, setBase] = useState(options[0])
  useEffect(() => { if (!options.includes(base)) setBase(options[0]) }, [options]) // eslint-disable-line
  const endpoint = `${base}/api/public/iot/${device.token}`
  const payload = JSON.stringify({ type: "sekolah-lestari-iot", v: 1, name: device.name, endpoint, pair: `${endpoint}/pair`, ping: `${endpoint}/ping`, interval: device.interval_sec ?? 300 })
  const baseIsLocal = /localhost|127\.0\.0\.1/.test(base)
  const connected = device.connection === "terhubung"
  const copy = (s: string) => { navigator.clipboard.writeText(s); toast.success(t("Disalin")) }
  const curlPair = `curl -X POST ${endpoint}/pair -H 'Content-Type: application/json' -d '{"firmware":"v1.0","rssi":-60}'`
  const curlData = `curl -X POST ${endpoint} -H 'Content-Type: application/json' -d '{"value":48231.5,"rssi":-60}'`
  const arduino = `#include <WiFi.h>
#include <HTTPClient.h>
const char* WIFI_SSID = "WIFI-SEKOLAH";
const char* WIFI_PASS = "********";
const char* ENDPOINT  = "${endpoint}";
const unsigned long INTERVAL_MS = ${(device.interval_sec ?? 300) * 1000}UL;

void post(String url, String body) {
  HTTPClient http; http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.POST(body); http.end();
}
void setup() {
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(500);
  post(String(ENDPOINT) + "/pair", "{\\"firmware\\":\\"esp32-v1\\",\\"rssi\\":" + String(WiFi.RSSI()) + "}");
}
void loop() {
  float kwh = bacaMeterKwh();   // mis. PZEM-004T: pzem.energy()
  post(ENDPOINT, "{\\"value\\":" + String(kwh, 2) + ",\\"rssi\\":" + String(WiFi.RSSI()) + "}");
  delay(INTERVAL_MS);
}`
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">{tl("Hubungkan", "Pair")} {device.name}<ConnectionPill status={device.connection} /></DialogTitle>
          <DialogDescription>{tl("Scan QR dengan aplikasi konfigurasi perangkat (atau gateway). Status di bawah berubah otomatis ketika perangkat mengirim data pertama.", "Scan the QR with the device setup app (or gateway). The status below updates automatically when the device sends its first data.")}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="qr">
          <TabsList><TabsTrigger value="qr"><QrCode /> QR</TabsTrigger><TabsTrigger value="manual">{tl("Manual / curl", "Manual / curl")}</TabsTrigger><TabsTrigger value="esp32">ESP32</TabsTrigger></TabsList>
          <TabsContent value="qr" className="mt-4">
            <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
              <div className="flex flex-col items-center gap-2">
                <div className={cn("rounded-xl bg-white p-4 shadow-sm ring-1 ring-border", baseIsLocal && "opacity-60")}><QRCodeSVG value={payload} size={200} level="M" /></div>
                <span className="text-[0.6875rem] text-muted-foreground">{tl("Berisi endpoint & token perangkat", "Contains the device endpoint & token")}</span>
              </div>
              <div className="space-y-4 text-sm">
                <Field label={tl("Alamat server yang dijangkau perangkat", "Server address reachable by the device")} hint={tl("Perangkat & server harus satu jaringan Wi-Fi. Jangan pakai localhost.", "Device & server must share the same Wi-Fi. Don't use localhost.")}>
                  <SimpleSelect value={base} onChange={setBase} options={options.map((o) => ({ value: o, label: o }))} />
                </Field>
                {baseIsLocal && <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{tl("“localhost” hanya bisa dijangkau dari komputer ini. Pilih alamat IP jaringan (192.168.x.x) agar perangkat fisik bisa terhubung.", "“localhost” is only reachable from this computer. Pick a network IP (192.168.x.x) so physical devices can connect.")}</p>}
                <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
                  <li>{tl("Nyalakan perangkat dalam mode pairing / setup.", "Power the device in pairing/setup mode.")}</li>
                  <li>{tl("Scan QR ini dari aplikasi konfigurasi perangkat.", "Scan this QR from the device setup app.")}</li>
                  <li>{tl("Perangkat memanggil endpoint /pair lalu mengirim data tiap", "The device calls /pair, then sends data every")} {fmtInterval(device.interval_sec ?? 300)}.</li>
                </ol>
                <div className={cn("flex items-center gap-3 rounded-2xl border p-3.5", connected ? "border-emerald-500/40 bg-emerald-500/5" : "border-dashed")}>
                  {connected ? <CheckCircle2 className="size-5 text-emerald-600" /> : <Spinner className="size-5 text-muted-foreground" />}
                  <span className="font-medium">{connected ? tl("Perangkat terhubung!", "Device connected!") : tl("Menunggu perangkat…", "Waiting for device…")}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{tl("cek otomatis tiap 10 detik", "auto-checks every 10s")}</span>
                </div>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="manual" className="mt-4 space-y-3 text-sm">
            {[[tl("Endpoint data", "Data endpoint"), endpoint], [tl("Pairing (sekali)", "Pairing (once)"), curlPair], [tl("Kirim pembacaan kumulatif", "Send cumulative reading"), curlData], [tl("Simulator di komputer", "Simulator on this computer"), `cd server && bun run iot:sim ${device.token} --url ${base}`]].map(([label, code]) => (
              <div key={label}>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
                <button onClick={() => copy(code)} className="flex w-full items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-left font-mono text-[0.7188rem] break-all hover:bg-muted/70"><Copy className="mt-0.5 size-3.5 shrink-0" />{code}</button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">{tl("Heartbeat tanpa data: POST …/ping. Field opsional: rssi, battery, firmware.", "Heartbeat without data: POST …/ping. Optional fields: rssi, battery, firmware.")}</p>
          </TabsContent>
          <TabsContent value="esp32" className="mt-4">
            <div className="relative">
              <Button size="xs" variant="outline" className="absolute right-2 top-2" onClick={() => copy(arduino)}><Copy /> {t("Salin")}</Button>
              <pre className="max-h-80 overflow-auto rounded-xl bg-slate-950 p-4 text-[0.7188rem] leading-relaxed text-emerald-100">{arduino}</pre>
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter className="justify-between sm:justify-between">
          {canRotate ? <Button variant="ghost" onClick={onRotate}><RefreshCw /> {tl("Ganti token (putuskan perangkat lama)", "Rotate token (disconnect old device)")}</Button> : <span />}
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("Tutup")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
