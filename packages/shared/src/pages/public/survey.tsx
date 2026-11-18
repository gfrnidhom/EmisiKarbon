import { useState } from "react"
import { useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { CheckCircle2, ShieldCheck } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, PageSkeleton, SimpleSelect, Spinner, EmptyState } from "@/components/common"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { t, tl } from "@/lib/i18n"
import { MOBILITY_MODES } from "@/lib/mobility-modes"

function deviceId() {
  try {
    let id = localStorage.getItem("jh.device")
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("jh.device", id) }
    return id
  } catch { return crypto.randomUUID() }
}

export default function Survey() {
  const { token } = useParams()
  const { data, isLoading, error } = useQuery({ queryKey: ["survey", token], queryFn: () => api<any>(`/public/surveys/${token}`) })
  const doneKey = `jh.survey.${token}`
  const [done, setDone] = useState(() => { try { return !!localStorage.getItem(doneKey) } catch { return false } })
  const [f, setF] = useState({ class_name: "", role: "siswa", mode: "", daily_km: "", occupants: "1", days_per_week: "6" })
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }))
  const motorized = !!MOBILITY_MODES.find((m) => m.v === f.mode)?.private

  const submit = async (confirmFar = false) => {
    if (!f.mode || f.daily_km === "") return toast.error(tl("Lengkapi moda dan jarak harian", "Fill in the mode and daily distance"))
    setBusy(true)
    try {
      await api(`/public/surveys/${token}`, { method: "POST", json: { ...f, daily_km: Number(f.daily_km), occupants: Number(f.occupants), days_per_week: Number(f.days_per_week), device_id: deviceId(), confirm_far: confirmFar } })
      try { localStorage.setItem(doneKey, "1") } catch { /* noop */ }
      setDone(true)
    } catch (e: any) {
      if (e.status === 422 && confirm(`${e.message}. Lanjutkan?`)) return submit(true)
      if (e.status === 409) { setDone(true); return }
      toast.error(e.message)
    } finally { setBusy(false) }
  }

  return (
    <div className="min-h-svh bg-gradient-to-b from-primary/10 to-background px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center gap-2"><img src="/favicon.svg" className="size-8 rounded-lg" alt="" /><span className="font-semibold">{t("Sekolah Lestari")}</span></div>
        {isLoading ? <PageSkeleton /> : error ? <EmptyState title={t("Survei tidak ditemukan")} description={(error as Error).message} /> : done ? (
          <Card><CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle2 className="size-14 text-primary" />
            <h1 className="text-xl font-semibold">{t("Terima kasih!")}</h1>
            <p className="text-sm text-muted-foreground">{t("Jawabanmu membantu")} {data.org_name} {t("menghitung jejak karbon perjalanan ke sekolah.")}</p>
          </CardContent></Card>
        ) : data.status !== "aktif" ? <EmptyState title={t("Survei sudah ditutup")} /> : (
          <Card>
            <CardHeader>
              <CardTitle>{data.title}</CardTitle>
              <CardDescription>{data.org_name} {t("· 1 menit · anonim")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("Saya adalah")}><SimpleSelect value={f.role} onChange={(v) => set("role", v)} options={[{ value: "siswa", label: t("Siswa") }, { value: "guru", label: t("Guru") }, { value: "staf", label: t("Staf") }]} className="h-11" /></Field>
                {f.role === "siswa" && <Field label={t("Kelas")}><SimpleSelect value={f.class_name} onChange={(v) => set("class_name", v)} options={data.classes.map((c: string) => ({ value: c, label: c }))} className="h-11" /></Field>}
              </div>
              <Field label={t("Biasanya ke sekolah naik apa?")}>
                <div className="grid grid-cols-3 gap-2">
                  {MOBILITY_MODES.map((m) => (
                    <button key={m.v} type="button" onClick={() => set("mode", m.v)}
                      className={cn("flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border bg-card p-2 text-xs transition-all", f.mode === m.v ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/30" : "hover:border-primary/40")}>
                      <m.icon className="size-6" /><span className="text-center leading-tight">{tl(m.id, m.en)}</span>
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={tl("Jarak harian (pulang-pergi)", "Daily distance (round trip)")} hint={tl("Total km dalam sehari: rumah → sekolah → rumah. Bila diantar lalu pengantar pulang dan menjemput lagi, jumlahkan juga perjalanan pengantar. Perkiraan saja, alamat tidak disimpan.", "Total km in one day: home → school → home. If someone drops you off and goes back, add their trips too. An estimate is fine; no address is stored.")}>
                <div className="flex items-center gap-2"><Input type="number" inputMode="decimal" min={0} step="0.1" value={f.daily_km} onChange={(e) => set("daily_km", e.target.value)} className="h-11 text-lg" placeholder={tl("mis. 8", "e.g. 8")} /><span className="shrink-0 text-sm text-muted-foreground">{tl("km / hari", "km / day")}</span></div>
              </Field>
              {motorized && (
                <>
                  <Field label={t("Berapa orang (ke sekolah ini) dalam satu kendaraan?")} hint={t("Termasuk kamu, mis. berboncengan dengan kakak = 2")}>
                    <SimpleSelect value={f.occupants} onChange={(v) => set("occupants", v)} options={["1", "2", "3", "4", "5"].map((n) => ({ value: n, label: `${n} orang` }))} className="h-11" />
                  </Field>
                </>
              )}
              <Field label={t("Berapa hari per minggu ke sekolah dengan cara ini?")}>
                <SimpleSelect value={f.days_per_week} onChange={(v) => set("days_per_week", v)} options={["1", "2", "3", "4", "5", "6"].map((n) => ({ value: n, label: `${n} hari` }))} className="h-11" />
              </Field>
              <Button className="h-12 w-full text-base" disabled={busy} onClick={() => submit()}>{busy && <Spinner />} {t("Kirim jawaban")}</Button>
              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground"><ShieldCheck className="size-3.5" /> {t("Tanpa nama & alamat · sesuai UU PDP 27/2022")}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
