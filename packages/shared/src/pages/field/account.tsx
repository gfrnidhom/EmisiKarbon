import { useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { useTheme } from "next-themes"
import { BookOpenCheck, Building2, Check, ChevronRight, Download, Globe, LogOut, Moon, ShieldCheck, Smartphone, UserPen, type LucideIcon } from "lucide-react"
import { useInstallPrompt } from "@/components/app-shell"
import { Bubble, Card, type Tone } from "@/components/field-ui"
import { ProfileDialog, UserAvatar } from "@/components/profile-dialog"
import { ROLE_LABEL, useAuth } from "@/lib/auth"
import { canUse, handoff } from "@/lib/hosts"
import { lang, setLang, tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"

function Row({ icon, tone, title, sub, right, to, onClick }: { icon: LucideIcon; tone: Tone; title: string; sub?: string; right?: ReactNode; to?: string; onClick?: () => void }) {
  const body = (
    <>
      <Bubble icon={icon} tone={tone} />
      <span className="min-w-0 flex-1 leading-tight"><span className="block truncate text-[0.9375rem] font-medium">{title}</span>{sub && <span className="mt-0.5 block truncate text-xs text-[var(--f-muted)]">{sub}</span>}</span>
      {right ?? ((to || onClick) && <ChevronRight className="size-4 text-[var(--f-muted)]" />)}
    </>
  )
  const cls = "flex w-full items-center gap-3 rounded-[1.25rem] px-3 py-2.5 text-left transition-colors hover:bg-[var(--f-soft)] active:bg-[var(--f-soft)]"
  return to ? <Link to={to} className={cls}>{body}</Link> : onClick ? <button onClick={onClick} className={cls}>{body}</button> : <div className={cls}>{body}</div>
}
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button role="switch" aria-checked={on} onClick={() => onChange(!on)} className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-[var(--f-tint)]" : "bg-[var(--f-line)] ring-1 ring-[var(--f-line)]")}><span className={cn("absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform", on && "translate-x-5")} /></button>
}
const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <section><h2 className="mb-2 px-1 text-sm font-medium text-[var(--f-muted)]">{title}</h2><Card className="p-2">{children}</Card></section>
)

export default function FieldAccount() {
  const { me, orgId, setOrgId, logout } = useAuth()
  const qc = useQueryClient()
  const { resolvedTheme, setTheme } = useTheme()
  const install = useInstallPrompt()
  const [profile, setProfile] = useState(false)
  if (!me) return null
  const standalone = typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches
  return (
    <div className="mx-auto max-w-4xl space-y-6 pt-2">
      {/* kartu profil */}
      <div className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[var(--f-tint)] to-[var(--primary-deep)] p-5 text-white shadow-[var(--f-shadow)] md:p-7">
        <span className="pointer-events-none absolute -top-12 -right-10 size-44 rounded-full bg-white/10" />
        <div className="relative flex items-center gap-4">
          <UserAvatar name={me.name} className="size-16 text-xl ring-4 ring-white/20" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-xl font-medium">{me.name}</div>
            <div className="mt-1 truncate text-sm text-white/75">{me.email}</div>
            <span className="mt-2.5 inline-flex h-7 items-center gap-1.5 rounded-full bg-white/18 px-3 text-xs font-medium"><ShieldCheck className="size-3.5" />{ROLE_LABEL.petugas}</span>
          </div>
          <button onClick={() => setProfile(true)} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/18 transition-transform active:scale-95" aria-label={tl("Ubah profil", "Edit profile")}><UserPen className="size-5" /></button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Group title={tl("Sekolah", "School")}>
          {me.orgs.map((o) => <Row key={o.id} icon={Building2} tone="mint" title={o.name} sub={`${o.jenjang} · ${o.kecamatan}`}
            onClick={me.orgs.length > 1 ? () => { setOrgId(o.id); qc.invalidateQueries() } : undefined}
            right={o.id === orgId ? <Check className="size-5 text-[var(--f-tint)]" /> : undefined} />)}
          {canUse(me, "admin") && <Row icon={ShieldCheck} tone="teal" title={tl("Dasbor Admin", "Admin dashboard")} sub={tl("Buka tampilan operator/admin", "Open the operator/admin view")} onClick={() => handoff("admin")} />}
          <Row icon={UserPen} tone="sky" title={tl("Ubah profil", "Edit profile")} sub={tl("Nama & nomor HP", "Name & phone")} onClick={() => setProfile(true)} />
        </Group>
        <Group title={tl("Tampilan", "Appearance")}>
          <Row icon={Moon} tone="teal" title={tl("Mode gelap", "Dark mode")} right={<Toggle on={resolvedTheme === "dark"} onChange={(v) => setTheme(v ? "dark" : "light")} />} />
          <Row icon={Globe} tone="lime" title={tl("Bahasa", "Language")} right={
            <div className="flex rounded-full bg-[var(--f-soft)] p-1">{(["id", "en"] as const).map((l) => <button key={l} onClick={() => l !== lang && setLang(l)} className={cn("h-7 rounded-full px-3 text-xs font-semibold uppercase", lang === l ? "bg-[var(--f-ink)] text-[var(--f-ink-fg)]" : "text-[var(--f-muted)]")}>{l}</button>)}</div>
          } />
        </Group>
        <Group title={tl("Bantuan", "Help")}>
          <Row icon={BookOpenCheck} tone="sand" title={tl("Panduan & metodologi", "Guide & methodology")} sub={tl("Cara ukur pohon, rumus & faktor", "How to measure, formulas & factors")} to="/methodology" />
          {install ? <Row icon={Download} tone="mint" title={tl("Pasang aplikasi", "Install app")} sub={tl("Tambahkan ke layar utama", "Add to home screen")} onClick={install} />
            : <Row icon={Smartphone} tone="mint" title={standalone ? tl("Aplikasi terpasang", "App installed") : tl("Pasang aplikasi", "Install app")} sub={standalone ? tl("Berjalan sebagai aplikasi", "Running as an app") : tl("Menu browser → Tambahkan ke Layar Utama", "Browser menu → Add to Home screen")} />}
        </Group>
        <section className="flex flex-col justify-end">
          <button onClick={logout} className="flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--f-card)] text-sm font-medium text-rose-600 shadow-[var(--f-shadow)] transition-transform active:scale-95 dark:text-rose-400"><LogOut className="size-4" />{tl("Keluar", "Sign out")}</button>
          <p className="mt-3 text-center text-xs text-[var(--f-muted)]">Sekolah Lestari · {tl("Aplikasi Petugas Monitoring", "Monitoring Officer app")}</p>
        </section>
      </div>
      <ProfileDialog open={profile} onOpenChange={setProfile} />
    </div>
  )
}
