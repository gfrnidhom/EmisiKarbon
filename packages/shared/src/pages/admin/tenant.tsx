import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Building2, Plus, ShieldCheck, UserPlus, Users, X } from "lucide-react"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ErrorState, Field, PageHeader, PageSkeleton, SimpleSelect, StatCard } from "@/components/common"
import { appUrl } from "@/lib/hosts"
import { DetailSheet, EditDialog, RowActions } from "@/components/row-actions"
import { PendingInvites } from "@/components/pending-invites"
import { api } from "@/lib/api"
import { ROLE_LABEL, useAuth } from "@/lib/auth"
import { t, tl } from "@/lib/i18n"

export default function Tenant() {
  const qc = useQueryClient()
  const { has } = useAuth()
  const orgs = useQuery({ queryKey: ["admin-orgs"], queryFn: () => api<any[]>("/admin/orgs") })
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => api<any[]>("/admin/users") })
  const [newOrg, setNewOrg] = useState<any>(null)
  const [inv, setInv] = useState<any>(null)
  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); qc.invalidateQueries({ queryKey: ["admin-orgs"] }) }
  const mkOrg = useMutation({ mutationFn: () => api("/admin/orgs", { method: "POST", json: newOrg }), onSuccess: () => { toast.success(t("Lembaga dibuat")); setNewOrg(null); refresh() }, onError: (e: Error) => toast.error(e.message) })
  const invite = useMutation({ mutationFn: () => api<any>("/admin/invitations", { method: "POST", json: { ...inv, org_id: inv.org_id ? Number(inv.org_id) : null } }), onSuccess: (r) => { toast.success(r.existing ? t("Peran ditambahkan") : `Undangan dibuat: ${appUrl(r.app ?? "admin", r.link)}`); setInv(null); refresh() }, onError: (e: Error) => toast.error(e.message) })
  const revoke = useMutation({ mutationFn: (b: any) => api("/admin/role-assignments", { method: "DELETE", json: b }), onSuccess: () => { toast.success(tl("Peran dicabut", "Role revoked")); refresh() }, onError: (e: Error) => toast.error(e.message) })
  const setActive = useMutation({ mutationFn: (b: { id: number; active: boolean }) => api(`/admin/users/${b.id}`, { method: "PATCH", json: { active: b.active } }), onSuccess: () => { toast.success(tl("Status akun diperbarui", "Account status updated")); refresh() }, onError: (e: Error) => toast.error(e.message) })
  const [editOrg, setEditOrg] = useState<any>(null)
  const [viewOrg, setViewOrg] = useState<any>(null)
  const [editUser, setEditUser] = useState<any>(null)
  if (orgs.isLoading || users.isLoading) return <PageSkeleton />
  if (orgs.error || users.error || !orgs.data || !users.data) return <ErrorState error={orgs.error ?? users.error ?? new Error(t("Tidak punya akses"))} retry={() => { orgs.refetch(); users.refetch() }} />
  const byRole = (role: string, org?: number) => (users.data ?? []).filter((u) => u.roles.some((r: any) => r.role === role && (org === undefined || r.org_id === org)))
  return (
    <div className="space-y-8">
      <PageHeader icon={ShieldCheck} title={t("Lembaga & pengguna")} description={tl("Peran: Admin · Operator (meng-ACC data petugas) · Kepala Sekolah (lihat saja) · Petugas Monitoring. Guru & siswa mengisi survei lewat tautan tanpa login.", "Roles: Admin · Operator (approves officers' data) · Principal (view only) · Monitoring officer. Teachers & students fill in surveys via a link without logging in.")}
        actions={has("admin") && <><Button variant="outline" onClick={() => setInv({ email: "", role: "operator", org_id: "" })}><UserPlus /> {t("Undang")}</Button><Button onClick={() => setNewOrg({ name: "", short: "", jenjang: "SMP", kecamatan: "" })}><Plus /> {t("Lembaga")}</Button></>} />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("Lembaga")} icon={Building2} value={orgs.data!.length} sub={t("Satu tenant per lembaga.")} />
        <StatCard label={t("Pengguna")} icon={Users} value={users.data!.length} sub={t("Akun aktif")} />
        <StatCard label={tl("Operator", "Operators")} icon={ShieldCheck} tone="leaf" value={byRole("operator").length} sub={tl("Meng-ACC data petugas", "Approve officers' data")} />
        <StatCard label={tl("Sekolah tanpa operator", "Schools without operator")} icon={UserPlus} tone={orgs.data!.some((o) => !byRole("operator", o.id).length) ? "warn" : "default"} value={orgs.data!.filter((o) => !byRole("operator", o.id).length).length} sub={tl("Perlu diundang", "Invite one")} />
      </div>
      <div className="grid gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="size-4" /> {t("Lembaga")}</CardTitle></CardHeader>
          <CardContent className="px-0"><Table><TableHeader><TableRow><TableHead className="pl-6">{t("Nama")}</TableHead><TableHead>{t("NPSN")}</TableHead><TableHead>{t("Wilayah")}</TableHead><TableHead>{tl("Operator & petugas", "Operators & officers")}</TableHead><TableHead className="w-10 pr-4" /></TableRow></TableHeader>
            <TableBody>{orgs.data!.map((o) => (
              <TableRow key={o.id}><TableCell className="pl-6"><div className="font-medium">{o.name}</div><div className="text-xs text-muted-foreground">{o.jenjang} {t("· Kec.")} {o.kecamatan}</div></TableCell><TableCell className="font-mono text-xs">{o.npsn}</TableCell><TableCell className="text-sm">{o.region_name}</TableCell>
                <TableCell><div className="flex flex-wrap gap-1">{[...byRole("operator", o.id).map((u) => [u, "operator"]), ...byRole("petugas", o.id).map((u) => [u, "petugas"])].map(([u, r]: any) => (
                  <Badge key={u.id + r} variant={r === "operator" ? "default" : "secondary"}>{u.name.split(" ").slice(0, 2).join(" ")} · {ROLE_LABEL[r as keyof typeof ROLE_LABEL]}</Badge>
                ))}</div></TableCell>
                <TableCell className="pr-4 text-right"><RowActions onView={() => setViewOrg(o)} onEdit={has("admin") ? () => setEditOrg(o) : undefined} /></TableCell></TableRow>
            ))}</TableBody></Table></CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>{t("Pengguna")}</CardTitle><CardAction><Badge variant="outline">{users.data!.length} {t("akun")}</Badge></CardAction></CardHeader>
        <CardContent className="px-0"><Table><TableHeader><TableRow><TableHead className="pl-6">{t("Nama")}</TableHead><TableHead>{t("Peran")}</TableHead><TableHead className="pr-6 text-right">{tl("Akun", "Account")}</TableHead></TableRow></TableHeader>
          <TableBody>{users.data!.map((u) => (
            <TableRow key={u.id} className={u.active ? "" : "opacity-60"}><TableCell className="pl-6"><div className="font-medium">{u.name}{!u.active && <Badge variant="outline" className="ml-2 text-[0.625rem]">{tl("nonaktif", "inactive")}</Badge>}</div><div className="text-xs text-muted-foreground">{u.email}</div></TableCell>
              <TableCell><div className="flex flex-wrap gap-1">{u.roles.map((r: any, i: number) => <Badge key={i} variant="secondary" className="gap-1">{ROLE_LABEL[r.role as keyof typeof ROLE_LABEL]}{r.org_name ? ` · ${r.org_name}` : ""}<button aria-label={tl("Cabut peran", "Revoke role")} title={tl("Cabut peran", "Revoke role")} className="rounded-full hover:text-destructive" onClick={() => confirm(tl(`Cabut peran ${r.role} dari ${u.name}?`, `Revoke ${r.role} from ${u.name}?`)) && revoke.mutate({ user_id: u.id, role: r.role, org_id: r.org_id })}><X className="size-3" /></button></Badge>)}</div></TableCell>
              <TableCell className="pr-6 text-right"><div className="flex items-center justify-end gap-1"><Button size="xs" variant="outline" onClick={() => setActive.mutate({ id: u.id, active: !u.active })}>{u.active ? tl("Nonaktifkan", "Deactivate") : tl("Aktifkan", "Activate")}</Button><RowActions onEdit={() => setEditUser(u)} /></div></TableCell></TableRow>
          ))}</TableBody></Table></CardContent>
      </Card>
      <Dialog open={!!newOrg} onOpenChange={(o) => !o && setNewOrg(null)}>
        <DialogContent><DialogHeader><DialogTitle>{t("Lembaga baru")}</DialogTitle><DialogDescription>{t("Satu tenant per lembaga.")}</DialogDescription></DialogHeader>
          {newOrg && <div className="grid gap-5 sm:grid-cols-2">{[["name", "Nama"], ["short", "Kode singkat (QR)"], ["npsn", "NPSN"], ["kecamatan", "Kecamatan"], ["jenjang", "Jenjang"]].map(([k, l]) => <Field key={k} label={l}><Input value={newOrg[k] ?? ""} onChange={(e) => setNewOrg({ ...newOrg, [k]: e.target.value })} /></Field>)}</div>}
          <DialogFooter><Button onClick={() => mkOrg.mutate()}>{t("Simpan")}</Button></DialogFooter></DialogContent>
      </Dialog>
      <Dialog open={!!inv} onOpenChange={(o) => !o && setInv(null)}>
        <DialogContent><DialogHeader><DialogTitle>{t("Undang pengguna")}</DialogTitle><DialogDescription>{t("Undangan berlaku 7 hari.")}</DialogDescription></DialogHeader>
          {inv && <div className="grid gap-3">
            <Field label={t("Email")}><Input value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} /></Field>
            <Field label={t("Peran")}><SimpleSelect value={inv.role} onChange={(v) => setInv({ ...inv, role: v })} options={Object.entries(ROLE_LABEL).filter(([v]) => v !== "user").map(([v, l]) => ({ value: v, label: l }))} /></Field>
            <Field label={t("Lembaga (opsional)")}><SimpleSelect value={inv.org_id} onChange={(v) => setInv({ ...inv, org_id: v })} options={orgs.data!.map((o) => ({ value: String(o.id), label: o.name }))} /></Field>
          </div>}
          <DialogFooter><Button onClick={() => invite.mutate()}>{t("Kirim undangan")}</Button></DialogFooter></DialogContent>
      </Dialog>
      <PendingInvites canManage={has("admin")} />
      {viewOrg && <DetailSheet open={!!viewOrg} onOpenChange={(o) => !o && setViewOrg(null)} title={viewOrg.name} description={`${viewOrg.jenjang} · Kec. ${viewOrg.kecamatan}`}
        rows={[[tl("NPSN", "NPSN"), viewOrg.npsn], [tl("Alamat", "Address"), viewOrg.address], [tl("Wilayah", "Region"), viewOrg.region_name], [tl("Siswa", "Students"), viewOrg.students], [tl("Guru", "Teachers"), viewOrg.teachers], [tl("Tendik", "Staff"), viewOrg.staff], [tl("Hari sekolah/minggu", "School days/week"), viewOrg.school_days_per_week], [tl("Operator", "Operators"), byRole("operator", viewOrg.id).map((u) => u.name).join(", ") || "—"], [tl("Petugas", "Officers"), byRole("petugas", viewOrg.id).map((u) => u.name).join(", ") || "—"]]} />}
      {editOrg && <EditDialog open={!!editOrg} onOpenChange={(o) => !o && setEditOrg(null)} title={tl(`Ubah ${editOrg.name}`, `Edit ${editOrg.name}`)} description={tl("Perubahan jumlah warga sekolah memengaruhi angka per orang & mobilitas; engine menghitung ulang.", "Population changes affect per-person and mobility figures; the engine recalculates.")}
        fields={[{ key: "name", label: tl("Nama lembaga", "Name") }, { key: "npsn", label: "NPSN" }, { key: "kecamatan", label: tl("Kecamatan", "District") }, { key: "address", label: tl("Alamat", "Address") }, { key: "students", label: tl("Siswa", "Students"), type: "number" }, { key: "teachers", label: tl("Guru", "Teachers"), type: "number" }, { key: "staff", label: tl("Tendik", "Staff"), type: "number" }]}
        initial={{ name: editOrg.name, npsn: editOrg.npsn ?? "", kecamatan: editOrg.kecamatan ?? "", address: editOrg.address ?? "", students: editOrg.students ?? "", teachers: editOrg.teachers ?? "", staff: editOrg.staff ?? "" }}
        save={(v) => api(`/orgs/${editOrg.id}`, { method: "PATCH", json: v })} invalidate={[["admin-orgs"], ["org"]]} />}
      {editUser && <EditDialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)} title={tl("Ubah pengguna", "Edit user")} description={editUser.email}
        fields={[{ key: "name", label: tl("Nama lengkap", "Full name") }]} initial={{ name: editUser.name }}
        save={(v) => api(`/admin/users/${editUser.id}`, { method: "PATCH", json: v })} invalidate={[["admin-users"]]} />}
    </div>
  )
}
