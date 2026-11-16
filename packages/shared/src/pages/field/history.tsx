import { useState } from "react"
import { Inbox } from "lucide-react"
import { PageSkeleton } from "@/components/common"
import { EmptyCard } from "@/components/field-ui"
import { tl } from "@/lib/i18n"
import { SubmissionCard, useMySubmissions } from "./lib"
import { PageTitle, Segmented } from "./tasks"

type F = "all" | "diajukan" | "perlu_perbaikan" | "terverifikasi" | "draf"
const match = (f: F, s: string) => f === "all" || s === f || (f === "terverifikasi" && s === "terkunci")

export default function FieldHistory() {
  const { data = [], isLoading } = useMySubmissions()
  const [f, setF] = useState<F>("all")
  if (isLoading) return <PageSkeleton />
  const rows = data.filter((r) => match(f, r.status))
  const n = (x: F) => data.filter((r) => match(x, r.status)).length
  return (
    <div className="space-y-5">
      <PageTitle title={tl("Riwayat ajuan", "Submissions")} sub={tl("Data bulanan yang Anda isi — operator sekolah meng-ACC sebelum masuk hitungan resmi.", "Monthly data you entered — the school operator approves it before it counts.")} />
      <Segmented value={f} onChange={setF} options={[
        { value: "all", label: tl("Semua", "All"), n: n("all") },
        { value: "diajukan", label: tl("Menunggu ACC", "Awaiting"), n: n("diajukan") },
        { value: "perlu_perbaikan", label: tl("Perbaikan", "To fix"), n: n("perlu_perbaikan") },
        { value: "terverifikasi", label: tl("Disahkan", "Approved"), n: n("terverifikasi") },
        { value: "draf", label: tl("Draf", "Draft"), n: n("draf") },
      ]} />
      {rows.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((r) => <SubmissionCard key={r.id} rec={r} />)}</div>
        : <EmptyCard icon={Inbox} text={tl("Belum ada data di kategori ini", "Nothing in this category yet")} />}
    </div>
  )
}
