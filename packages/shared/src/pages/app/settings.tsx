import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Copy, Mail, Settings, Share2, UserPlus, X } from "lucide-react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Field, PageHeader, PageSkeleton, SimpleSelect, Spinner } from "@/components/common"
import { appUrl } from "@/lib/hosts"
import { PendingInvites } from "@/components/pending-invites"
import { api } from "@/lib/api"
import { ROLE_LABEL } from "@/lib/auth"
import { useOrg } from "@/lib/hooks"
import { num } from "@/lib/format"
import { t, tl } from "@/lib/i18n"

const NUM_FIELDS = [["students", "Jumlah siswa"], ["teachers", "Jumlah guru"], ["staff", "Jumlah staf"], ["building_m2", "Luas bangunan (m²)"], ["land_m2", "Luas lahan (m²)"], ["base_load_kwh", "Beban dasar hari libur (kWh/hari)"]] as const
const OPTIONAL = [["genset", "Genset"], ["lpg", "LPG"], ["ac", "AC"], ["kertas", "Kertas"], ["pohon", "Pohon"]] as const

export default function SettingsPage() {
  const { orgId, org, can, isLoading } = useOrg()
  const qc = useQueryClient()
  const [f, setF] = useState<any>(null)
  const [inv, setInv] = useState({ email: "", role: "petugas" })
  const [link, setLink] = useState<any>(null)
  useEffect(() => { if (org) setF(org) }, [org])
  const users = useQuery({ queryKey: ["users", orgId], queryFn: () => api<any[]>(`/admin/users?org=${orgId}`), enabled: !!orgId && can("operator", "kepsek", "admin") })
  const save = useMutation({
    mutationFn: () => api<any>(`/orgs/${orgId}`, { method: "PATCH", json: Object.fromEntries(["name", "npsn", "address", "kecamatan", "sanitation", "school_days_per_week", "none_sources", ...NUM_FIELDS.map((x) => x[0])].map((k) => [k, ["name", "npsn", "address", "kecamatan", "sanitation", "none_sources"].includes(k) ? f[k] : Number(f[k])])) }),
    onSuccess: (r) => { toast.success(t("Profil tersimpan — sumber berbasis orang otomatis berskala")); if (r.rebaselineSuggested) toast.warning(t("Jumlah siswa berubah > 10% — pertimbangkan baseline ulang")); qc.invalidateQueries() },
    onError: (e: Error) => toast.error(e.message),
  })
  const revoke = useMutation({
    mutationFn: (b: { user_id: number; role: string }) => api("/admin/role-assignments", { method: "DELETE", json: { ...b, org_id: orgId } }),
    onSuccess: () => { toast.success(tl("Peran dicabut", "Role revoked")); users.refetch() },
    onError: (e: Error) => toast.error(e.message),
  })
  const invite = useMutation({
    mutationFn: () => api<any>("/admin/invitations", { method: "POST", json: { ...inv, org_id: orgId } }),
    onSuccess: (r) => { if (r.existing) toast.success(t("Peran ditambahkan ke akun yang sudah ada")); else setLink(r); setInv({ email: "", role: "petugas" }); users.refetch() },
    onError: (e: Error) => toast.error(e.message),
  })
  if (isLoading || !f) return <PageSkeleton />
  const editable = can("operator", "admin")
  const pop = Number(f.students) + Number(f.teachers) + Number(f.staff)
  return (
    <div className="space-y-8">
      <PageHeader icon={Settings} title={t("Pengaturan lembaga")} description={t("Profil & kalender (Dapodik/SK), pengguna, dan undangan.")} />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader><CardTitle>{t("Profil lembaga")}</CardTitle><CardDescription>{t("Jumlah warga dipakai untuk skala mobilitas, sampah, dan air limbah")} ({num(pop)} {t("orang)")}</CardDescription></CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <Field label={t("Nama lembaga")} className="sm:col-span-2"><Input disabled={!editable} value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label={t("NPSN")}><Input disabled={!editable} value={f.npsn ?? ""} onChange={(e) => setF({ ...f, npsn: e.target.value })} /></Field>
            <Field label={t("Kecamatan")}><Input disabled={!editable} value={f.kecamatan ?? ""} onChange={(e) => setF({ ...f, kecamatan: e.target.value })} /></Field>
            {NUM_FIELDS.map(([k, l]) => <Field key={k} label={l}><Input type="number" disabled={!editable} value={f[k] ?? 0} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}
            <Field label={t("Sanitasi")}><SimpleSelect value={f.sanitation} onChange={(v) => setF({ ...f, sanitation: v })} options={[{ value: "septik", label: t("Tangki septik") }, { value: "ipal", label: t("IPAL") }, { value: "saluran", label: t("Saluran/drainase") }]} /></Field>
            <Field label={t("Hari sekolah per minggu")}><SimpleSelect value={String(f.school_days_per_week)} onChange={(v) => setF({ ...f, school_days_per_week: Number(v) })} options={[{ value: "5", label: t("5 hari") }, { value: "6", label: t("6 hari") }]} /></Field>
            <Field label={t("Sumber yang tidak dimiliki lembaga")} className="sm:col-span-2" hint={t("Dihitung lengkap pada skor kelengkapan baseline")}>
              <div className="flex flex-wrap gap-4">{OPTIONAL.map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 text-sm"><Checkbox disabled={!editable} checked={(f.none_sources ?? []).includes(k)} onCheckedChange={(c) => setF({ ...f, none_sources: c ? [...(f.none_sources ?? []), k] : (f.none_sources ?? []).filter((x: string) => x !== k) })} />{t("Tidak ada")} {l}</label>
              ))}</div>
            </Field>
          </CardContent>
          {editable && <CardFooter className="justify-end"><Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Spinner />} {t("Simpan profil")}</Button></CardFooter>}
        </Card>
        <div className="space-y-6">
          {can("operator", "admin") && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="size-4" /> {t("Undang pengguna")}</CardTitle><CardDescription>{t("Undangan via email/tautan WhatsApp, kedaluwarsa 7 hari")}</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <Field label={t("Email")}><Input type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} placeholder={t("guru@sekolah.sch.id")} /></Field>
                <Field label={t("Peran")}><SimpleSelect value={inv.role} onChange={(v) => setInv({ ...inv, role: v })} options={["petugas", "operator", "kepsek"].map((r) => ({ value: r, label: ROLE_LABEL[r as keyof typeof ROLE_LABEL] }))} /></Field>
                <Button className="w-full" disabled={!inv.email || invite.isPending} onClick={() => invite.mutate()}><Mail /> {t("Kirim undangan")}</Button>
                {link && (
                  <Alert><AlertDescription className="space-y-2">
                    <code className="block break-all text-xs">{appUrl(link.app ?? "admin", link.link)}</code>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(appUrl(link.app ?? "admin", link.link)); toast.success(t("Disalin")) }}><Copy /> {t("Salin")}</Button>
                      <Button size="sm" render={<a target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(link.waText.replace(link.link, appUrl(link.app ?? "admin", link.link)))}`} />}><Share2 /> {t("WhatsApp")}</Button>
                    </div>
                  </AlertDescription></Alert>
                )}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle>{t("Pengguna lembaga")}</CardTitle></CardHeader>
            <CardContent className="px-0">
              <Table><TableHeader><TableRow><TableHead className="pl-6">{t("Nama")}</TableHead><TableHead className="pr-6">{t("Peran")}</TableHead></TableRow></TableHeader>
                <TableBody>{(users.data ?? []).map((u) => (
                  <TableRow key={u.id}><TableCell className="pl-6"><div className="font-medium">{u.name}</div><div className="text-xs text-muted-foreground">{u.email}</div></TableCell>
                    <TableCell className="pr-6"><div className="flex flex-wrap gap-1">{u.roles.filter((r: any) => r.org_id === orgId).map((r: any) => <Badge key={r.role} variant="secondary" className="gap-1">{ROLE_LABEL[r.role as keyof typeof ROLE_LABEL]}{can("operator", "admin") && <button aria-label={tl("Cabut peran", "Revoke role")} title={tl("Cabut peran", "Revoke role")} className="rounded-full hover:text-destructive" onClick={() => confirm(tl(`Cabut peran ${r.role} dari ${u.name}?`, `Revoke ${r.role} from ${u.name}?`)) && revoke.mutate({ user_id: u.id, role: r.role })}><X className="size-3" /></button>}</Badge>)}{u.verifies.filter((v: any) => v.org_id === orgId).map((v: any) => <Badge key="v" variant="outline">{t("Verifikator")} {v.kind}</Badge>)}</div></TableCell></TableRow>
                ))}</TableBody></Table>
            </CardContent>
          </Card>
        </div>
      </div>
      {can("operator", "kepsek", "admin") && <PendingInvites orgId={orgId} canManage={can("operator", "admin")} />}
    </div>
  )
}
