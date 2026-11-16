import { useQuery } from "@tanstack/react-query"
import { Mail } from "lucide-react"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RowActions } from "@/components/row-actions"
import { api } from "@/lib/api"
import { ROLE_LABEL } from "@/lib/auth"
import { fmtDate, todayWIB } from "@/lib/format"
import { tl } from "@/lib/i18n"

/** Undangan yang belum diterima — bisa dibatalkan (Admin: semua lembaga; Operator: lembaganya). */
export function PendingInvites({ orgId, canManage }: { orgId?: number; canManage: boolean }) {
  const { data = [] } = useQuery({ queryKey: ["invitations", orgId ?? "all"], queryFn: () => api<any[]>(`/admin/invitations${orgId ? `?org=${orgId}` : ""}`) })
  if (!data.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Mail className="size-4" />{tl("Undangan tertunda", "Pending invitations")}</CardTitle>
        <CardDescription>{tl("Belum diterima. Batalkan bila salah alamat atau tidak jadi.", "Not accepted yet. Cancel if sent by mistake.")}</CardDescription>
        <CardAction><Badge variant="outline">{data.length}</Badge></CardAction>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.map((i) => {
          const expired = i.expires_at < todayWIB()
          return (
            <div key={i.id} className="flex items-center gap-3 rounded-2xl bg-muted/50 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{i.email}</div>
                <div className="truncate text-xs text-muted-foreground">{ROLE_LABEL[i.role as keyof typeof ROLE_LABEL] ?? i.role}{i.org_name ? ` · ${i.org_name}` : ""} · {expired ? <span className="text-destructive">{tl("kedaluwarsa", "expired")}</span> : `${tl("berlaku s.d.", "valid until")} ${fmtDate(i.expires_at)}`}</div>
              </div>
              {canManage && <RowActions del={{ path: `/admin/invitations/${i.id}`, title: tl(`Batalkan undangan ${i.email}?`, `Cancel invitation for ${i.email}?`), description: tl("Tautan undangan tidak bisa dipakai lagi.", "The invitation link will stop working."), invalidate: [["invitations"]] }} />}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
