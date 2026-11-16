import { useEffect, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { Building2, KeyRound, Lock, Mail, Phone, ShieldCheck, UserRound } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, Spinner } from "@/components/common"
import { api } from "@/lib/api"
import { ROLE_LABEL, useAuth } from "@/lib/auth"
import { fmtDate } from "@/lib/format"
import { tl } from "@/lib/i18n"

export const initialsOf = (name: string) => name.split(" ").filter(Boolean).map((s) => s[0]).slice(0, 2).join("").toUpperCase()

/** Avatar inisial dengan gradasi hijau (dipakai di top bar, menu akun, dan dialog profil). */
export function UserAvatar({ name, className = "size-10 text-sm" }: { name: string; className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-deep font-semibold text-white ring-2 ring-card ${className}`}>
      {initialsOf(name)}
    </span>
  )
}

export function ProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { me, reload } = useAuth()
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  useEffect(() => { if (open && me) { setName(me.name ?? ""); setPhone((me as any).phone ?? "") } }, [open, me])
  const save = useMutation({
    mutationFn: () => api("/auth/me", { method: "PATCH", json: { name, phone: phone || null } }),
    onSuccess: async () => { await reload(); toast.success(tl("Profil diperbarui", "Profile updated")); onOpenChange(false) },
    onError: (e: Error) => toast.error(e.message),
  })
  if (!me) return null
  const orgName = (id: number | null) => (id === null ? tl("Semua lembaga", "All institutions") : me.orgs.find((o) => o.id === id)?.name ?? `#${id}`)
  const changed = name.trim() !== (me.name ?? "") || (phone || "") !== ((me as any).phone ?? "")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">{tl("Ubah profil", "Edit profile")}</DialogTitle>
          <DialogDescription>{tl("Nama tampil di rapor, log audit, dan jejak persetujuan.", "Your name appears on reports, the audit log and approval trails.")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 rounded-2xl bg-muted/50 p-4">
          <UserAvatar name={name || me.name} className="size-14 text-lg" />
          <div className="min-w-0">
            <div className="truncate text-base font-semibold">{name || me.name}</div>
            <div className="truncate text-sm text-muted-foreground">{me.email}</div>
            {(me as any).created_at && <div className="mt-0.5 text-xs text-muted-foreground">{tl("Bergabung", "Joined")} {fmtDate((me as any).created_at)}</div>}
          </div>
        </div>

        <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); if (changed) save.mutate() }}>
          <Field label={tl("Nama lengkap", "Full name")}>
            <div className="relative"><UserRound className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-10" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoFocus /></div>
          </Field>
          <Field label={tl("Nomor HP / WhatsApp", "Phone / WhatsApp")}>
            <div className="relative"><Phone className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-10" inputMode="tel" placeholder="08xxxxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </Field>
          <Field label={tl("Email (untuk masuk)", "Email (sign-in)")}>
            <div className="relative"><Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="bg-muted/50 pl-10 text-muted-foreground" value={me.email} readOnly />
              <Lock className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground" /></div>
            <p className="mt-1.5 text-xs text-muted-foreground">{tl("Email dipakai untuk masuk. Untuk mengganti, hubungi admin program.", "Email is your sign-in ID. Ask the program admin to change it.")}</p>
          </Field>

          <div>
            <p className="mb-2 text-sm font-medium">{tl("Peran & akses", "Roles & access")}</p>
            <div className="space-y-2">
              {me.roles.map((r, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl bg-muted/50 px-3.5 py-2.5 text-sm">
                  <ShieldCheck className="size-4 text-primary" />
                  <span className="font-medium">{ROLE_LABEL[r.role]}</span>
                  <span className="ml-auto flex min-w-0 items-center gap-1.5 text-muted-foreground"><Building2 className="size-3.5 shrink-0" /><span className="truncate">{orgName(r.org_id)}</span></span>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{tl("Peran diatur oleh admin di menu Lembaga & Pengguna.", "Roles are managed by an admin under Institutions & Users.")}</p>
          </div>

          <PasswordSection />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{tl("Batal", "Cancel")}</Button>
            <Button type="submit" disabled={!changed || save.isPending}>{save.isPending && <Spinner />} {tl("Simpan profil", "Save profile")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PasswordSection() {
  const [open, setOpen] = useState(false)
  const [cur, setCur] = useState("")
  const [next, setNext] = useState("")
  const change = useMutation({
    mutationFn: () => api("/auth/password", { method: "POST", json: { current: cur, next } }),
    onSuccess: () => { toast.success(tl("Kata sandi diganti", "Password changed")); setOpen(false); setCur(""); setNext("") },
    onError: (e: Error) => toast.error(e.message),
  })
  if (!open) return <Button type="button" variant="outline" className="w-fit" onClick={() => setOpen(true)}><KeyRound /> {tl("Ganti kata sandi", "Change password")}</Button>
  return (
    <div className="space-y-3 rounded-2xl bg-muted/50 p-4">
      <p className="text-sm font-medium">{tl("Ganti kata sandi", "Change password")}</p>
      <Input type="password" placeholder={tl("Kata sandi saat ini", "Current password")} value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
      <Input type="password" placeholder={tl("Kata sandi baru (min. 8, huruf & angka)", "New password (min. 8, letters & numbers)")} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={!next || change.isPending} onClick={() => change.mutate()}>{change.isPending && <Spinner />} {tl("Simpan kata sandi", "Save password")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>{tl("Batal", "Cancel")}</Button>
      </div>
    </div>
  )
}
