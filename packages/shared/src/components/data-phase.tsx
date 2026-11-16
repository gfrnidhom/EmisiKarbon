import { Fragment, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Check, FileText, Flame, Fuel, Lock, Paperclip, Save, Sun, Undo2, Zap, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/common"
import { api, fileUrl, uploadEvidence } from "@/lib/api"
import { monthAdd, num, todayWIB } from "@/lib/format"
import { cn } from "@/lib/utils"
import { tl } from "@/lib/i18n"

export type PhaseInfo = { baseline: { id: number; version: string; status: string } | null; start: string | null; end: string | null; editable: boolean; locked: boolean; monitoringFrom: string | null }

export function usePhase(orgId?: number) {
  return useQuery({ queryKey: ["data-phase", orgId], queryFn: () => api<PhaseInfo>(`/orgs/${orgId}/data-phase`), enabled: !!orgId })
}

export function monthsRange(from: string, to: string) {
  const out: string[] = []
  for (let m = from; m <= to && out.length < 120; m = monthAdd(m, 1)) out.push(m)
  return out
}
const MON = (ym: string) => new Date(ym + "-15T00:00:00Z").toLocaleDateString(tl("id-ID", "en-GB"), { month: "short", timeZone: "UTC" })

export const GRID_SOURCES: { v: string; id: string; en: string; unit: string; icon: LucideIcon; required?: boolean }[] = [
  { v: "listrik", id: "Listrik PLN", en: "Grid electricity", unit: "kWh", icon: Zap, required: true },
  { v: "lpg", id: "LPG", en: "LPG", unit: "kg", icon: Flame },
  { v: "genset", id: "Genset (solar)", en: "Genset (diesel)", unit: "liter", icon: Fuel },
  { v: "kertas", id: "Kertas", en: "Paper", unit: "rim", icon: FileText },
  { v: "plts", id: "PLTS (produksi)", en: "Solar PV (output)", unit: "kWh", icon: Sun },
]

const STATUS_DOT: Record<string, string> = { draf: "bg-muted-foreground/40", diajukan: "bg-sky-500", perlu_perbaikan: "bg-destructive", terverifikasi: "bg-primary", terkunci: "bg-primary-deep" }

/** Tabel isian data bulanan periode acuan — satu layar untuk seluruh bulan Survei Awal. */
export function BaselineDataGrid({ orgId, phase, canEdit, onSaved }: { orgId: number; phase: PhaseInfo; canEdit: boolean; onSaved?: () => void }) {
  const qc = useQueryClient()
  const months = useMemo(() => (phase.start && phase.end ? monthsRange(phase.start, phase.end) : []), [phase.start, phase.end])
  const rows = useQuery({ queryKey: ["activities", orgId, "baseline"], queryFn: () => api<any[]>(`/orgs/${orgId}/activities?phase=baseline`), enabled: !!orgId })
  const [draft, setDraft] = useState<Record<string, string>>({})
  const editable = canEdit && phase.editable
  const byKey = useMemo(() => Object.fromEntries((rows.data ?? []).map((r) => [`${r.source}|${r.period}`, r])), [rows.data])
  const changed = Object.entries(draft).filter(([k, v]) => v !== "" && Number(v) >= 0 && Number(v) !== byKey[k]?.quantity)
  // bukti yang diunggah untuk sel yang belum tersimpan — ikut terkirim saat Simpan
  const [pendingEv, setPendingEv] = useState<Record<string, number[]>>({})
  const [uploading, setUploading] = useState<string | null>(null)
  const pickFile = (k: string) => {
    const input = document.createElement("input")
    input.type = "file"; input.accept = "image/*,application/pdf"; input.multiple = true
    input.onchange = async () => {
      const files = [...(input.files ?? [])]
      if (!files.length) return
      setUploading(k)
      try {
        const ids: number[] = []
        for (const f of files) { const r = await uploadEvidence(orgId, f); ids.push(r.id); if (r.flags?.length) toast.warning(r.flags.join(" · ")) }
        const rec = byKey[k]
        const valueChanged = draft[k] !== undefined && draft[k] !== "" && Number(draft[k]) !== rec?.quantity
        if (rec && !valueChanged) {
          await api(`/orgs/${orgId}/activities/${rec.id}/evidence`, { method: "POST", json: { add: ids } })
          // kelengkapan Survei Awal (status langkah wizard & skor) ikut diperbarui tanpa muat ulang halaman
          for (const key of ["activities", "baseline", "baselines", "data-phase"]) qc.invalidateQueries({ queryKey: [key] })
          onSaved?.()
          toast.success(tl(`${ids.length} bukti dilampirkan`, `${ids.length} file(s) attached`))
        } else {
          setPendingEv((p) => ({ ...p, [k]: [...(p[k] ?? []), ...ids] }))
          toast.info(tl("Bukti siap — tersimpan bersama angka saat Anda menekan Simpan", "File ready — it is saved with the value when you press Save"))
        }
      } catch (e) { toast.error((e as Error).message) } finally { setUploading(null) }
    }
    input.click()
  }

  const save = useMutation({
    mutationFn: async () => {
      let ok = 0; const errs: string[] = []
      for (const [k, v] of changed) {
        const [source, period] = k.split("|")
        const evidence_ids = [...(byKey[k]?.evidence_ids ?? []), ...(pendingEv[k] ?? [])]
        try { await api(`/orgs/${orgId}/activities`, { method: "POST", json: { source, period, quantity: Number(v), method: "aktual", context: "survei", evidence_ids } }); ok++ }
        catch (e) { errs.push(`${source} ${period}: ${(e as Error).message}`) }
      }
      if (ok && phase.baseline) await api(`/baselines/${phase.baseline.id}/recompute`, { method: "POST", json: {} }).catch(() => null)
      return { ok, errs }
    },
    onSuccess: ({ ok, errs }) => {
      if (ok) toast.success(tl(`${ok} sel tersimpan · baseline dihitung ulang`, `${ok} cells saved · baseline recomputed`))
      if (errs.length) toast.error(errs.slice(0, 3).join("\n"))
      setDraft({}); setPendingEv({})
      qc.invalidateQueries({ queryKey: ["activities"] }); qc.invalidateQueries({ queryKey: ["baseline"] }); qc.invalidateQueries({ queryKey: ["baselines"] }); qc.invalidateQueries({ queryKey: ["dashboard"] })
      onSaved?.()
    },
  })

  const filled = GRID_SOURCES.map((s) => months.filter((m) => byKey[`${s.v}|${m}`] || draft[`${s.v}|${m}`]).length)

  return (
    <section id="data-bulanan" className="scroll-mt-24 overflow-hidden rounded-2xl border border-primary/15">
      <header className="flex flex-wrap items-center gap-3 border-b border-primary/10 px-5 py-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold">{tl("Data bulanan periode acuan", "Reference-period monthly data")}</h3>
          <p className="text-sm text-muted-foreground">{tl("Isi sekali untuk semua bulan baseline. Bulan sesudahnya diisi lewat Input Berkala.", "Fill once for every baseline month. Later months go through Periodic Input.")}</p>
        </div>
        {!phase.editable && <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground"><Lock className="size-3.5" />{phase.locked ? tl("Terkunci", "Locked") : tl("Sedang diproses", "In review")}</span>}
        {editable && changed.length > 0 && <>
          <Button variant="ghost" size="sm" onClick={() => setDraft({})}><Undo2 /> {tl("Batal", "Reset")}</Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? <Spinner /> : <Save />} {tl(`Simpan ${changed.length} sel`, `Save ${changed.length} cells`)}</Button>
        </>}
      </header>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="sticky left-0 z-10 bg-background px-5 py-2.5 text-left font-medium">{tl("Sumber", "Source")}</th>
              {months.map((m) => <th key={m} className="min-w-[5.25rem] px-1 py-2.5 text-center font-medium"><span className="block">{MON(m)}</span><span className="text-[0.625rem] opacity-70">{m.slice(0, 4)}</span></th>)}
              <th className="px-4 py-2.5 text-right font-medium">{tl("Terisi", "Filled")}</th>
            </tr>
          </thead>
          <tbody>
            {GRID_SOURCES.map((s, si) => (
              <tr key={s.v} className="group">
                <td className="sticky left-0 z-10 border-t border-primary/10 bg-background px-5 py-2">
                  <span className="flex items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><s.icon className="size-4" /></span>
                    <span className="leading-tight"><span className="block font-medium whitespace-nowrap">{tl(s.id, s.en)}{s.required && <span className="text-destructive"> *</span>}</span><span className="text-[0.6875rem] text-muted-foreground">{s.unit}</span></span>
                  </span>
                </td>
                {months.map((m) => {
                  const k = `${s.v}|${m}`, rec = byKey[k], val = draft[k] ?? (rec ? String(rec.quantity) : "")
                  const dirty = draft[k] !== undefined && draft[k] !== "" && Number(draft[k]) !== rec?.quantity
                  return (
                    <td key={m} className="border-t border-primary/10 px-1 py-2">
                      <div className="relative">
                        <input inputMode="decimal" disabled={!editable} value={val} placeholder="—"
                          onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value.replace(",", ".").replace(/[^\d.]/g, "") }))}
                          className={cn("h-9 w-full rounded-lg bg-muted/50 px-2 text-right text-[0.8125rem] tabular outline-none transition-all placeholder:text-muted-foreground/40 focus:bg-card focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-transparent",
                            dirty && "bg-amber-400/15 ring-1 ring-amber-500/40", rec?.method === "estimasi" && !dirty && "italic text-muted-foreground")} />
                        {rec && !dirty && <span title={rec.status} className={cn("absolute top-1 left-1 size-1.5 rounded-full", STATUS_DOT[rec.status] ?? "bg-muted")} />}
                      </div>
                      {(() => {
                        const saved: number[] = rec?.evidence_ids ?? [], pend = pendingEv[k] ?? [], n = saved.length + pend.length
                        const need = s.v === "listrik" && (rec || val) && n === 0
                        if (!editable && n === 0) return null
                        return (
                          <div className="mt-1 flex items-center justify-end gap-1">
                            {saved.slice(0, 3).map((id, i) => <a key={id} href={fileUrl(id)} target="_blank" rel="noreferrer" title={tl("Buka bukti", "Open file")} className="flex h-5 min-w-5 items-center justify-center rounded-md bg-primary/10 px-1 text-[0.625rem] font-semibold text-primary hover:bg-primary/20">{i + 1}</a>)}
                            {pend.length > 0 && <span title={tl("Menunggu disimpan", "Pending save")} className="flex h-5 items-center rounded-md bg-amber-400/20 px-1.5 text-[0.625rem] font-semibold text-amber-700 dark:text-amber-300">+{pend.length}</span>}
                            {editable && (
                              <button type="button" onClick={() => pickFile(k)} disabled={uploading === k}
                                title={need ? tl("Wajib: foto/PDF tagihan listrik", "Required: electricity bill photo/PDF") : tl("Lampirkan foto/PDF bukti", "Attach photo/PDF")}
                                className={cn("flex size-5 items-center justify-center rounded-md transition-colors", need ? "bg-destructive/10 text-destructive hover:bg-destructive/20" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                                {uploading === k ? <Spinner className="size-3" /> : <Paperclip className="size-3" />}
                              </button>
                            )}
                          </div>
                        )
                      })()}
                    </td>
                  )
                })}
                <td className="border-t border-primary/10 px-4 py-2 text-right whitespace-nowrap">
                  <span className={cn("inline-flex items-center gap-1 text-xs font-medium tabular", filled[si] === months.length ? "text-primary" : "text-muted-foreground")}>
                    {filled[si] === months.length && <Check className="size-3.5" />}{filled[si]}/{months.length}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-primary/10 px-5 py-3 text-[0.6875rem] text-muted-foreground">
        {[["draf", tl("Draf", "Draft")], ["diajukan", tl("Diajukan", "Submitted")], ["terverifikasi", tl("Disahkan", "Approved")], ["perlu_perbaikan", tl("Perlu perbaikan", "Needs fixing")]].map(([k, l]) => <span key={k} className="inline-flex items-center gap-1.5"><span className={cn("size-1.5 rounded-full", STATUS_DOT[k])} />{l}</span>)}
        <span className="italic">{tl("miring = estimasi/interpolasi", "italic = estimate/interpolated")}</span>
        <span className="inline-flex items-center gap-1"><Paperclip className="size-3" />{tl("lampirkan foto/PDF tagihan per bulan · ", "attach the bill photo/PDF per month · ")}<span className="text-destructive">{tl("merah = wajib (listrik)", "red = required (electricity)")}</span></span>
      </footer>
    </section>
  )
}

/** Kalender kelengkapan Input Berkala — bulan pemantauan × sumber. */
export function MonitoringCalendar({ phase, rows, onPick }: { phase: PhaseInfo; rows: any[]; onPick?: (source: string, period: string) => void }) {
  const cur = todayWIB().slice(0, 7)
  const from = phase.monitoringFrom ?? cur
  const all = monthsRange(from, cur)
  const months = all.slice(-12)
  const byKey = Object.fromEntries(rows.filter((r) => r.phase === "pemantauan").map((r) => [`${r.source}|${r.period}`, r]))
  const total = GRID_SOURCES.length * months.length
  const done = GRID_SOURCES.reduce((s, x) => s + months.filter((m) => byKey[`${x.v}|${m}`]).length, 0)
  return (
    <section className="overflow-hidden rounded-2xl border border-primary/15">
      <header className="flex flex-wrap items-end gap-3 border-b border-primary/10 px-5 py-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold">{tl("Kalender pemantauan", "Monitoring calendar")}</h3>
          <p className="text-sm text-muted-foreground">{tl(`Mulai ${from} · bulan sebelum itu milik Survei Awal`, `From ${from} · earlier months belong to the Baseline Survey`)}</p>
        </div>
        <div className="text-right"><div className="text-2xl font-semibold tabular">{num(total ? (done / total) * 100 : 0, 0)}%</div><div className="text-[0.6875rem] text-muted-foreground">{done}/{total} {tl("sel terisi", "cells filled")}</div></div>
      </header>
      <div className="overflow-x-auto px-5 py-4">
        <div className="grid min-w-max gap-1.5" style={{ gridTemplateColumns: `140px repeat(${months.length}, 38px)` }}>
          <span />
          {months.map((m) => <span key={m} className="text-center text-[0.625rem] text-muted-foreground">{MON(m)}</span>)}
          {GRID_SOURCES.map((s) => (
            <Fragment key={s.v}>
              <span className="flex items-center gap-2 text-xs font-medium"><s.icon className="size-3.5 text-primary" />{tl(s.id, s.en)}</span>
              {months.map((m) => {
                const r = byKey[`${s.v}|${m}`]
                const partial = m === cur
                return (
                  <button key={s.v + m} type="button" onClick={() => onPick?.(s.v, m)} title={`${tl(s.id, s.en)} · ${m}${r ? ` · ${num(r.quantity, 1)} ${s.unit} · ${r.status}` : ""}`}
                    className={cn("h-8 rounded-md transition-transform hover:scale-110",
                      r ? (r.status === "terverifikasi" || r.status === "terkunci" ? "bg-primary" : r.status === "perlu_perbaikan" ? "bg-destructive/70" : r.method === "estimasi" ? "bg-primary/35" : "bg-primary/60")
                        : partial ? "border border-dashed border-primary/30" : "bg-muted")} />
                )
              })}
            </Fragment>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.6875rem] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primary" />{tl("Disahkan", "Approved")}</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primary/60" />{tl("Draf/diajukan", "Draft/submitted")}</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primary/35" />{tl("Estimasi", "Estimate")}</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-muted ring-1 ring-border" />{tl("Kosong", "Empty")}</span>
          <span className="ml-auto">{tl("Klik sel untuk mengisi bulan itu.", "Click a cell to fill that month.")}</span>
        </div>
      </div>
    </section>
  )
}
