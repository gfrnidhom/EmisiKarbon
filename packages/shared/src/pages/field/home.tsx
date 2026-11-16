import { Bike, BookOpenCheck, CalendarDays, CheckCircle2, Clock, Flame, Inbox, ListChecks, Lock, Recycle, ScanLine, Sparkles, Trees, TriangleAlert } from "lucide-react"
import { usePhase } from "@/components/data-phase"
import { Chip, EmptyCard, SectionHead, Tile } from "@/components/field-ui"
import { PageSkeleton } from "@/components/common"
import { useAuth } from "@/lib/auth"
import { tl } from "@/lib/i18n"
import { SubmissionCard, TaskCard, useFieldTasks, useMySubmissions } from "./lib"

export default function FieldHome() {
  const { me, orgId } = useAuth()
  const tasks = useFieldTasks()
  const mine = useMySubmissions()
  const phase = usePhase(orgId ?? undefined)
  if (tasks.isLoading || mine.isLoading) return <PageSkeleton />
  const list = tasks.data ?? []
  const subs = mine.data ?? []
  const waiting = subs.filter((r) => r.status === "diajukan").length
  const fix = subs.filter((r) => r.status === "perlu_perbaikan").length
  const late = list.filter((t) => t.status === "terlambat").length
  const count = (k: string) => list.filter((t) => t.kind === k).length || undefined

  return (
    <div className="space-y-7 md:space-y-9">
      {/* sapaan */}
      <div className="pt-2">
        <p className="text-sm text-[var(--f-muted)]">{tl("Halo", "Hi")}, {me?.name.split(" ")[0]}</p>
        <h1 className="mt-1 text-[1.875rem] leading-[1.15] font-normal tracking-tight md:text-[2.5rem]">{tl("Catat & pantau", "Log & monitor")}<br />{tl("jejak karbon sekolah", "your school's footprint")}</h1>
        <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          <Chip tone="mint"><ListChecks className="size-3.5" />{list.length} {tl("tugas", "tasks")}</Chip>
          {late > 0 && <Chip tone="rose"><TriangleAlert className="size-3.5" />{late} {tl("terlambat", "overdue")}</Chip>}
          <Chip tone="sand"><Clock className="size-3.5" />{waiting} {tl("menunggu ACC", "awaiting")}</Chip>
          <Chip tone="sky"><CheckCircle2 className="size-3.5" />{fix} {tl("perbaikan", "to fix")}</Chip>
        </div>
      </div>

      {/* kategori pencatatan */}
      <div className="grid grid-cols-4 gap-2.5 md:gap-4">
        <Tile to="/input" label={tl("Energi", "Energy")} icon={Flame} tone="sand" badge={count("input")} />
        <Tile to="/waste" label={tl("Sampah", "Waste")} icon={Recycle} tone="lime" badge={count("sampah")} />
        <Tile to="/trees" label={tl("Pohon", "Trees")} icon={Trees} tone="mint" badge={count("pohon")} />
        <Tile to="/mobility" label={tl("Mobilitas", "Mobility")} icon={Bike} tone="sky" badge={count("mobilitas")} />
        <Tile to="/scan" label={tl("Scan", "Scan")} icon={ScanLine} tone="teal" />
        <Tile to="/calendar" label={tl("Kalender", "Calendar")} icon={CalendarDays} tone="rose" />
        <Tile to="/history" label={tl("Riwayat", "History")} icon={Inbox} tone="lime" />
        <Tile to="/methodology" label={tl("Panduan", "Guide")} icon={BookOpenCheck} tone="teal" />
      </div>

      {/* tugas mendatang — geser di HP, grid di desktop */}
      <section>
        <SectionHead title={tl("Tugas mendatang", "Upcoming tasks")} to="/tasks" linkLabel={tl("Lihat semua", "View all")} />
        {list.length ? (
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-3">
            {list.slice(0, 6).map((t, i) => <TaskCard key={i} task={t} className="w-[19rem] shrink-0 snap-start md:w-auto" />)}
          </div>
        ) : <EmptyCard icon={CheckCircle2} text={tl("Tidak ada tugas saat ini", "No tasks right now")} />}
      </section>

      {/* info fase */}
      {phase.data && !phase.data.locked && (
        <div className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[var(--f-tint)] to-[var(--primary-deep)] p-5 text-white shadow-[var(--f-shadow)] md:p-7">
          <span className="pointer-events-none absolute -top-10 -right-6 size-40 rounded-full bg-white/10" />
          <span className="pointer-events-none absolute -right-14 -bottom-16 size-48 rounded-full bg-white/8" />
          <span className="inline-flex -rotate-3 rounded-full bg-white/18 px-3 py-1 text-xs font-medium backdrop-blur">{tl("Survei Awal", "Baseline")}</span>
          <div className="relative mt-3 flex items-end justify-between gap-4">
            <div className="max-w-md">
              <div className="text-xl leading-snug font-medium md:text-2xl">{tl("Input energi dibuka setelah Survei Awal disahkan", "Energy input opens after baseline approval")}</div>
              <p className="mt-1.5 text-sm text-white/75">{tl("Sementara itu, ukur pohon, timbang sampah & survei tetap bisa dicatat.", "Meanwhile, trees, waste & surveys can still be logged.")}</p>
            </div>
            <span className="flex size-14 shrink-0 rotate-6 items-center justify-center rounded-2xl bg-white/15 backdrop-blur"><Lock className="size-6" /></span>
          </div>
        </div>
      )}

      {/* ajuan terbaru */}
      <section>
        <SectionHead title={tl("Ajuan terbaru", "Recent submissions")} to={subs.length ? "/history" : undefined} linkLabel={tl("Lihat semua", "View all")} />
        {subs.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{subs.slice(0, 6).map((r) => <SubmissionCard key={r.id} rec={r} />)}</div>
          : <EmptyCard icon={Sparkles} text={tl("Belum ada data yang Anda ajukan", "You haven't submitted anything yet")} />}
      </section>
    </div>
  )
}
