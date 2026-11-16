import { useQuery } from "@tanstack/react-query"
import { Bike, ClipboardList, Flag, Flame, Recycle, Send, Trees, type LucideIcon } from "lucide-react"
import { Bubble, Card, Chip, PillButton, Route, type Tone } from "@/components/field-ui"
import { toFieldPath } from "@/components/field-shell"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { fmtDate, fmtMonth, num, SOURCES, todayWIB } from "@/lib/format"
import { tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export type FieldTask = { kind: string; title: string; due: string; status: "jatuh_tempo" | "terlambat" | "akan_datang"; link: string; detail?: string }

export function useFieldTasks() {
  const { orgId } = useAuth()
  return useQuery({ queryKey: ["field-tasks", orgId], queryFn: () => api<FieldTask[]>(`/orgs/${orgId}/tasks`), enabled: !!orgId, refetchInterval: 120_000 })
}
/** Data bulanan yang diisi petugas ini sendiri (status ACC operator). */
export function useMySubmissions() {
  const { orgId, me } = useAuth()
  return useQuery({
    queryKey: ["activities", orgId, "mine"], enabled: !!orgId,
    queryFn: async () => (await api<any[]>(`/orgs/${orgId}/activities`)).filter((r) => r.created_by === me?.id),
  })
}

export const TASK_META: Record<string, [LucideIcon, Tone, string, string]> = {
  input: [Flame, "sand", "Input bulanan", "Monthly input"],
  sampah: [Recycle, "lime", "Timbang sampah", "Waste weighing"],
  pohon: [Trees, "mint", "Ukur pohon", "Tree measuring"],
  mobilitas: [Bike, "sky", "Survei mobilitas", "Mobility survey"],
  perbaikan: [ClipboardList, "rose", "Perbaikan", "Correction"],
}
const DUE: Record<FieldTask["status"], [string, string, Tone]> = {
  terlambat: ["Terlambat", "Overdue", "rose"],
  jatuh_tempo: ["Segera", "Due soon", "sand"],
  akan_datang: ["Terjadwal", "Upcoming", "mint"],
}
export const SUB_STATUS: Record<string, [string, string, Tone]> = {
  draf: ["Draf", "Draft", "sky"],
  diajukan: ["Menunggu ACC", "Awaiting approval", "sand"],
  perlu_perbaikan: ["Perlu perbaikan", "Needs fixing", "rose"],
  terverifikasi: ["Disahkan", "Approved", "mint"],
  terkunci: ["Terkunci", "Locked", "mint"],
}
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5)

/** Kartu tugas bergaya tiket: hari ini → tenggat. */
export function TaskCard({ task, className }: { task: FieldTask; className?: string }) {
  const [icon, tone, id, en] = TASK_META[task.kind] ?? [ClipboardList, "mint", "Tugas", "Task"]
  const [sid, sen, stone] = DUE[task.status]
  const today = todayWIB()
  const d = days(today, task.due)
  const mid = d < 0 ? tl(`lewat ${-d} hari`, `${-d}d late`) : d === 0 ? tl("hari ini", "today") : tl(`${d} hari lagi`, `in ${d}d`)
  return (
    <Card className={cn("flex flex-col gap-4 p-4", className)}>
      <div className="flex items-start gap-3">
        <Bubble icon={icon} tone={tone} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[0.6875rem] text-[var(--f-muted)]">{tl(id, en)}</div>
          <div className="mt-0.5 line-clamp-2 text-[0.9375rem] font-medium">{task.title}</div>
        </div>
        <Chip tone={stone}>{tl(sid, sen)}</Chip>
      </div>
      <Route icon={Flag} left={tl("Hari ini", "Today")} leftSub={fmtDate(today)} right={tl("Tenggat", "Due")} rightSub={fmtDate(task.due)} mid={mid} />
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 leading-tight">
          <div className="text-[0.6875rem] text-[var(--f-muted)]">{tl("Keterangan", "Note")}</div>
          <div className="mt-0.5 truncate text-sm">{task.detail ?? (task.kind === "mobilitas" ? tl("Survei dibuat Operator — pantau responsnya", "Created by the Operator — monitor responses") : task.kind === "sampah" ? tl("Sesi dimulai Operator — lalu catat timbangan harian", "The Operator starts the session — then record daily weighings") : tl("Sesuai jadwal pemantauan", "Per monitoring schedule"))}</div>
        </div>
        <PillButton to={toFieldPath(task.link)}>{task.kind === "mobilitas" ? tl("Pantau", "Monitor") : task.kind === "sampah" ? tl("Lihat", "Open") : tl("Kerjakan", "Start")}</PillButton>
      </div>
    </Card>
  )
}

/** Kartu ajuan (data bulanan) dengan status ACC. */
export function SubmissionCard({ rec }: { rec: any }) {
  const [id, en, tone] = SUB_STATUS[rec.status] ?? [rec.status, rec.status, "sky"]
  const editable = rec.status === "perlu_perbaikan" || rec.status === "draf"
  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-3">
        <Bubble icon={Flame} tone="sand" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[0.6875rem] text-[var(--f-muted)]">{fmtMonth(rec.period)}</div>
          <div className="mt-0.5 truncate text-[0.9375rem] font-medium">{SOURCES[rec.source]?.label ?? rec.source}</div>
        </div>
        <Chip tone={tone}>{tl(id, en)}</Chip>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="leading-tight">
          <div className="text-[0.6875rem] text-[var(--f-muted)]">{tl("Jumlah", "Amount")}</div>
          <div className="mt-0.5 text-xl font-semibold tabular-nums">{num(rec.quantity, 1)} <span className="text-sm font-normal text-[var(--f-muted)]">{rec.unit}</span></div>
          <div className="mt-1 text-[0.6875rem] text-[var(--f-muted)]">{tl("Diperbarui", "Updated")} {fmtDate((rec.updated_at ?? rec.created_at ?? "").slice(0, 10))}</div>
        </div>
        {editable && <PillButton to="/input"><Send className="size-3.5" />{rec.status === "draf" ? tl("Ajukan", "Submit") : tl("Perbaiki", "Fix")}</PillButton>}
      </div>
    </Card>
  )
}
