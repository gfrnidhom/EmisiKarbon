import { useState } from "react"
import { CheckCircle2 } from "lucide-react"
import { PageSkeleton } from "@/components/common"
import { EmptyCard } from "@/components/field-ui"
import { tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { TaskCard, useFieldTasks, type FieldTask } from "./lib"

type F = "all" | FieldTask["status"]
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; n?: number }[] }) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={cn("flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors", value === o.value ? "bg-[var(--f-ink)] text-[var(--f-ink-fg)]" : "bg-[var(--f-card)] text-[var(--f-muted)] shadow-[var(--f-shadow)]")}>
          {o.label}{o.n !== undefined && <span className="opacity-60">{o.n}</span>}
        </button>
      ))}
    </div>
  )
}
export function PageTitle({ title, sub }: { title: string; sub: string }) {
  return <div className="pt-2"><h1 className="text-[1.875rem] leading-tight font-normal tracking-tight md:text-[2.25rem]">{title}</h1><p className="mt-1 text-sm text-[var(--f-muted)]">{sub}</p></div>
}

export default function FieldTasks() {
  const { data = [], isLoading } = useFieldTasks()
  const [f, setF] = useState<F>("all")
  if (isLoading) return <PageSkeleton />
  const rows = data.filter((t) => f === "all" || t.status === f)
  const n = (s: F) => (s === "all" ? data.length : data.filter((t) => t.status === s).length)
  return (
    <div className="space-y-5">
      <PageTitle title={tl("Tugas pemantauan", "Monitoring tasks")} sub={tl(`${data.length} tugas — input bulanan, timbang sampah, ukur pohon & survei`, `${data.length} tasks — monthly input, waste, trees & surveys`)} />
      <Segmented value={f} onChange={setF} options={[
        { value: "all", label: tl("Semua", "All"), n: n("all") },
        { value: "terlambat", label: tl("Terlambat", "Overdue"), n: n("terlambat") },
        { value: "jatuh_tempo", label: tl("Segera", "Due soon"), n: n("jatuh_tempo") },
        { value: "akan_datang", label: tl("Terjadwal", "Upcoming"), n: n("akan_datang") },
      ]} />
      {rows.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((t, i) => <TaskCard key={i} task={t} />)}</div>
        : <EmptyCard icon={CheckCircle2} text={tl("Tidak ada tugas di kategori ini", "No tasks in this category")} />}
    </div>
  )
}
