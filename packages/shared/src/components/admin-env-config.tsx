import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { AlertTriangle, Bug, Check, CircleCheck, CircleX, Database, Dices, FileCog, Globe, KeyRound, Plug, RefreshCw, RotateCcw, Save, Server, Smartphone, Undo2, type LucideIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SimpleSelect, Spinner } from "@/components/common"
import { api } from "@/lib/api"
import { fmtDateTime } from "@/lib/format"
import { tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type Item = {
  key: string; group: string; label: string; help: string; kind: "text" | "secret" | "url" | "number" | "bool" | "select" | "dburl"
  live: boolean; options?: string[]; danger?: string; placeholder?: string
  inFile: boolean; value: string; hasValue: boolean; pendingRestart: boolean; insecure?: boolean
}
type View = { path: string; exists: boolean; watch: boolean; startedAt: string; database: { dialect: string; url: string; path: string | null }; items: Item[] }
type DbTest = { ok: boolean; error?: string; detail?: string; version?: string; database?: string }

const GROUPS: { id: string; label: string; en: string; icon: LucideIcon }[] = [
  { id: "database", label: "Database", en: "Database", icon: Database },
  { id: "server", label: "Server", en: "Server", icon: Server },
  { id: "security", label: "Keamanan", en: "Security", icon: KeyRound },
  { id: "domain", label: "Domain aplikasi", en: "App domains", icon: Globe },
  { id: "integration", label: "Integrasi", en: "Integrations", icon: Plug },
  { id: "android", label: "APK Android", en: "Android APK", icon: Smartphone },
  { id: "dev", label: "Pengembangan", en: "Development", icon: Bug },
]
const randomSecret = (n = 48) => {
  const a = new Uint8Array(n); crypto.getRandomValues(a)
  return btoa(String.fromCharCode(...a)).replace(/[+/=]/g, "").slice(0, n)
}

/** Konfigurasi Sistem & Lingkungan — semua variabel `server/.env`, termasuk database. Khusus Admin. */
export function AdminEnvConfigCard() {
  const qc = useQueryClient()
  const { data, isLoading, refetch } = useQuery({ queryKey: ["admin-env"], queryFn: () => api<View>("/admin/env") })
  const [edits, setEdits] = useState<Record<string, string | null>>({})
  const [dbTest, setDbTest] = useState<{ url: string; r: DbTest } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [ack, setAck] = useState<Record<string, boolean>>({})
  const [restarting, setRestarting] = useState(false)

  const test = useMutation({
    mutationFn: (url?: string) => api<DbTest>("/admin/env/test-db", { method: "POST", json: url === undefined ? {} : { url } }),
    onSuccess: (r, url) => { setDbTest({ url: url ?? "", r }); r.ok ? toast.success(tl("Koneksi berhasil", "Connection OK")) : toast.error(r.error ?? "Gagal") },
    onError: (e: Error) => toast.error(e.message),
  })
  const save = useMutation({
    mutationFn: () => api<View & { needsRestart: boolean }>("/admin/env", { method: "PUT", json: { changes: edits, confirm: Object.keys(ack).filter((k) => ack[k]) } }),
    onSuccess: (r) => {
      setEdits({}); setAck({}); setConfirmOpen(false); setDbTest(null)
      qc.setQueryData(["admin-env"], r)
      toast.success(r.needsRestart ? tl("Tersimpan di server/.env — sebagian perlu muat ulang server", "Saved to server/.env — some changes need a server reload") : tl("Tersimpan & langsung aktif", "Saved & active"))
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const restart = async () => {
    setRestarting(true)
    try {
      await api("/admin/env/restart", { method: "POST" })
      toast.info(tl("Server dimuat ulang…", "Reloading server…"))
      // tunggu server kembali
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1000))
        try { const h = await fetch("/api/health"); if (h.ok && i > 1) break } catch { /* masih mati */ }
      }
      await refetch()
      toast.success(tl("Server sudah memakai konfigurasi baru", "Server is using the new configuration"))
    } catch (e) { toast.error((e as Error).message) } finally { setRestarting(false) }
  }

  if (isLoading || !data) return null
  const changed = Object.keys(edits)
  const dangers = data.items.filter((i) => i.danger && changed.includes(i.key))
  const dbEdit = "DATABASE_URL" in edits
  const dbOk = !dbEdit || (dbTest?.url === (edits.DATABASE_URL ?? "") && dbTest.r.ok)
  const pending = data.items.filter((i) => i.pendingRestart)
  const insecure = data.items.filter((i) => i.insecure)
  const set = (k: string, v: string | null) => setEdits((e) => ({ ...e, [k]: v }))
  const unset = (k: string) => setEdits((e) => { const n = { ...e }; delete n[k]; return n })
  const submit = () => (dangers.length ? setConfirmOpen(true) : save.mutate())

  const field = (it: Item) => {
    const editing = it.key in edits
    const v = editing ? edits[it.key] ?? "" : it.value
    const base = "h-10 rounded-xl font-mono text-sm"
    if (it.kind === "bool") return (
      <SimpleSelect className="h-10 w-40 rounded-xl" value={v || "false"} onChange={(x) => (x === it.value ? unset(it.key) : set(it.key, x))} options={[{ value: "true", label: tl("Aktif", "On") }, { value: "false", label: tl("Mati", "Off") }]} />
    )
    if (it.kind === "select") return (
      <SimpleSelect className="h-10 w-56 rounded-xl" value={v} onChange={(x) => (x === it.value ? unset(it.key) : set(it.key, x))} options={it.options!.map((o) => ({ value: o, label: o }))} />
    )
    if (it.kind === "secret") return (
      <div className="flex gap-2">
        <Input type="text" autoComplete="off" spellCheck={false} className={base} value={editing ? v : ""} placeholder={it.hasValue ? `${it.value}  (${tl("ketik untuk mengganti", "type to replace")})` : tl("belum diisi", "not set")}
          onChange={(e) => (e.target.value ? set(it.key, e.target.value) : unset(it.key))} />
        {it.key !== "DEMO_PASSWORD" && <Button type="button" variant="outline" className="h-10 shrink-0 rounded-xl" onClick={() => set(it.key, randomSecret())} title={tl("Buat kunci acak", "Generate random key")}><Dices /> {tl("Acak", "Random")}</Button>}
      </div>
    )
    if (it.kind === "dburl") return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input type="text" autoComplete="off" spellCheck={false} className={base} value={editing ? v : ""} placeholder={it.hasValue ? `${it.value}` : it.placeholder}
            onChange={(e) => set(it.key, e.target.value)} />
          <Button type="button" variant="outline" className="h-10 shrink-0 rounded-xl" disabled={test.isPending} onClick={() => test.mutate(editing ? (edits[it.key] ?? "") : undefined)}>
            {test.isPending ? <Spinner /> : <Plug />} {tl("Uji koneksi", "Test")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{tl("Sedang dipakai:", "In use:")} <span className="font-mono">{data.database.dialect === "postgres" ? data.database.url : `SQLite · ${data.database.path}`}</span></p>
        {dbTest && (editing ? dbTest.url === (edits[it.key] ?? "") : true) && (
          <div className={cn("flex items-start gap-2 rounded-xl px-3 py-2 text-xs", dbTest.r.ok ? "bg-primary/8 text-primary" : "bg-destructive/8 text-destructive")}>
            {dbTest.r.ok ? <CircleCheck className="mt-0.5 size-3.5 shrink-0" /> : <CircleX className="mt-0.5 size-3.5 shrink-0" />}
            <span>{dbTest.r.ok ? `${dbTest.r.version ?? ""} · ${dbTest.r.database ?? ""} — ${dbTest.r.detail}` : dbTest.r.error}</span>
          </div>
        )}
        {editing && !dbOk && <p className="text-xs text-amber-700 dark:text-amber-300">{tl("Uji koneksi dulu — database baru hanya bisa disimpan bila koneksinya berhasil.", "Test the connection first — a new database can only be saved once it connects.")}</p>}
      </div>
    )
    return <Input type={it.kind === "number" ? "number" : "text"} autoComplete="off" spellCheck={false} className={base} value={v} placeholder={it.placeholder}
      onChange={(e) => (e.target.value === it.value ? unset(it.key) : set(it.key, e.target.value))} />
  }

  return (
    <Card className="border-primary/25">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl"><FileCog className="size-5 text-primary" />{tl("Konfigurasi Sistem & Lingkungan", "System & Environment Configuration")}</CardTitle>
        <CardDescription className="space-y-2">
          <span className="block">{tl("Semua pengaturan server di satu tempat, termasuk database. Disimpan ke berkas ", "Every server setting in one place, including the database. Saved to ")}<code className="rounded bg-muted px-1.5 py-0.5 text-xs">{data.path}</code>{tl(" (salinan sebelumnya otomatis disimpan sebagai .env.bak). Setiap perubahan tercatat di log audit.", " (the previous copy is kept as .env.bak). Every change is audit-logged.")}</span>
          <span className="flex flex-wrap gap-1.5">
            <Badge variant="outline">DB: {data.database.dialect.toUpperCase()}</Badge>
            <Badge variant="outline">{tl("Server menyala", "Server up since")} {fmtDateTime(data.startedAt)}</Badge>
            <Badge variant="outline">{data.watch ? tl("Mode --watch: bisa dimuat ulang dari sini", "--watch mode: can reload from here") : tl("Muat ulang manual", "Manual restart")}</Badge>
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {insecure.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-2xl bg-destructive/8 px-4 py-3 text-sm text-destructive ring-1 ring-destructive/20">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{tl("Masih memakai nilai bawaan pengembangan yang tidak aman: ", "Still using insecure development defaults: ")}<b>{insecure.map((i) => i.label).join(", ")}</b>{tl(". Ganti sebelum dipakai sungguhan (tombol Acak).", ". Replace before real use (Random button).")}</span>
          </div>
        )}
        {pending.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm ring-1 ring-amber-500/25">
            <RefreshCw className="size-4 shrink-0 text-amber-600" />
            <span className="flex-1">{tl("Menunggu muat ulang server: ", "Waiting for a server reload: ")}<b>{pending.map((i) => i.label).join(", ")}</b></span>
            {data.watch
              ? <Button size="sm" onClick={restart} disabled={restarting}>{restarting ? <Spinner /> : <RotateCcw />} {tl("Muat ulang sekarang", "Reload now")}</Button>
              : <span className="text-xs text-muted-foreground">{tl("Hentikan lalu jalankan ulang server.", "Stop and start the server again.")}</span>}
          </div>
        )}

        {GROUPS.map((g) => {
          const items = data.items.filter((i) => i.group === g.id)
          if (!items.length) return null
          return (
            <section key={g.id} className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground/80"><g.icon className="size-4 text-primary" />{tl(g.label, g.en)}</h3>
              <div className="divide-y rounded-2xl ring-1 ring-border">
                {items.map((it) => (
                  <div key={it.key} className={cn("grid gap-2 px-4 py-3.5 md:grid-cols-[minmax(0,15rem)_1fr] md:gap-5", it.key in edits && "bg-primary/4")}>
                    <div className="min-w-0">
                      <div className="font-medium">{it.label}</div>
                      <div className="font-mono text-[0.6875rem] text-muted-foreground">{it.key}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <span className={cn("rounded-full px-1.5 py-0.5 text-[0.625rem] font-medium", it.live ? "bg-primary/10 text-primary" : "bg-amber-500/12 text-amber-700 dark:text-amber-300")}>{it.live ? tl("langsung aktif", "applies now") : tl("perlu muat ulang", "needs reload")}</span>
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.625rem] text-muted-foreground">{it.inFile ? ".env" : tl("bawaan", "default")}</span>
                        {it.insecure && <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[0.625rem] font-medium text-destructive">{tl("tidak aman", "insecure")}</span>}
                      </div>
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      {field(it)}
                      <p className="text-xs text-muted-foreground">{it.help}</p>
                      {it.danger && <p className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 size-3 shrink-0" />{it.danger}</p>}
                      <div className="flex gap-3 text-xs">
                        {it.key in edits && <button type="button" onClick={() => unset(it.key)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><Undo2 className="size-3" />{tl("Batalkan", "Undo")}</button>}
                        {it.inFile && !(it.key in edits) && !["JWT_SECRET", "QR_SECRET"].includes(it.key) && (
                          <button type="button" onClick={() => set(it.key, null)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><RotateCcw className="size-3" />{tl("Pakai nilai bawaan", "Use default")}</button>
                        )}
                        {edits[it.key] === null && <span className="text-amber-700 dark:text-amber-300">{tl("akan dihapus dari .env → kembali ke bawaan", "will be removed from .env → default")}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )
        })}

        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-end gap-3 rounded-2xl bg-card/95 p-3 shadow-lg ring-1 ring-border backdrop-blur">
          <span className="mr-auto text-sm text-muted-foreground">{changed.length ? tl(`${changed.length} perubahan belum disimpan`, `${changed.length} unsaved change(s)`) : tl("Tidak ada perubahan", "No changes")}</span>
          {changed.length > 0 && <Button variant="ghost" onClick={() => { setEdits({}); setDbTest(null) }}><Undo2 /> {tl("Batalkan semua", "Discard")}</Button>}
          <Button disabled={!changed.length || !dbOk || save.isPending} onClick={submit}>{save.isPending ? <Spinner /> : <Save />} {tl("Simpan ke server/.env", "Save to server/.env")}</Button>
        </div>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="size-5 text-amber-600" />{tl("Perubahan berdampak besar", "High-impact changes")}</DialogTitle>
            <DialogDescription>{tl("Centang setiap poin untuk menyatakan Anda memahami akibatnya.", "Tick each item to confirm you understand the impact.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {dangers.map((d) => (
              <label key={d.key} className="flex cursor-pointer items-start gap-3 rounded-xl bg-amber-500/8 p-3 text-sm ring-1 ring-amber-500/20">
                <Checkbox checked={!!ack[d.key]} onCheckedChange={(c) => setAck((a) => ({ ...a, [d.key]: !!c }))} className="mt-0.5" />
                <span><b>{d.label}</b><span className="block text-muted-foreground">{d.danger}</span></span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>{tl("Batal", "Cancel")}</Button>
            <Button disabled={!dangers.every((d) => ack[d.key]) || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Spinner /> : <Check />} {tl("Ya, simpan", "Yes, save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
