import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Download, ScrollText, Search, Users, PenLine, ShieldCheck } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader, PageSkeleton, StatCard } from "@/components/common"
import { api, tokens } from "@/lib/api"
import { fmtDateTime } from "@/lib/format"
import { t } from "@/lib/i18n"

export default function Audit() {
  const [search, setSearch] = useState("")
  const { data, isLoading } = useQuery({ queryKey: ["audit"], queryFn: () => api<any[]>("/admin/audit?limit=500") })
  const rows = (data ?? []).filter((r) => !search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase()))
  if (isLoading) return <PageSkeleton />
  return (
    <div className="space-y-8">
      <PageHeader icon={ScrollText} title={t("Log audit")} description={t("Append-only: siapa, apa, kapan, nilai sebelum/sesudah, IP. Tidak dapat diubah atau dihapus.")}
        actions={<Button variant="outline" render={<a href={`/api/admin/audit?format=csv&limit=2000&token=${encodeURIComponent(tokens.access ?? "")}`} />}><Download /> {t("Ekspor CSV")}</Button>} />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("Entri log")} icon={ScrollText} value={(data ?? []).length} sub={t("500 entri terakhir")} />
        <StatCard label={t("Aktor unik")} icon={Users} value={new Set((data ?? []).map((r) => r.actor_id)).size} sub={t("Termasuk sistem")} />
        <StatCard label={t("Perubahan data")} icon={PenLine} tone="scope2" value={(data ?? []).filter((r) => ["create", "update", "revise", "new_version", "measure"].includes(r.action)).length} sub="create · update · revise" />
        <StatCard label={t("Verifikasi & kunci")} icon={ShieldCheck} tone="leaf" value={(data ?? []).filter((r) => ["verify", "lock", "return", "unlock"].includes(r.action)).length} sub="verify · lock · return" />
      </div>
      <Card><CardContent className="space-y-4">
        <div className="relative"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" placeholder={t("Cari aksi, objek, aktor…")} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <Table>
            <TableHeader><TableRow><TableHead>{t("Waktu")}</TableHead><TableHead>{t("Aktor")}</TableHead><TableHead>{t("Aksi")}</TableHead><TableHead>{t("Objek")}</TableHead><TableHead>{t("Sesudah")}</TableHead><TableHead>{t("IP")}</TableHead></TableRow></TableHeader>
            <TableBody>{rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-xs">{fmtDateTime(r.at)}</TableCell>
                <TableCell className="text-sm">{r.actor_name ?? "sistem"}</TableCell>
                <TableCell><Badge variant="outline">{r.action}</Badge></TableCell>
                <TableCell className="font-mono text-xs">{r.object_type}#{r.object_id}</TableCell>
                <TableCell className="max-w-80 truncate font-mono text-[0.6875rem] text-muted-foreground" title={r.after}>{r.after}</TableCell>
                <TableCell className="text-xs">{r.ip}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </div>
      </CardContent></Card>
    </div>
  )
}
