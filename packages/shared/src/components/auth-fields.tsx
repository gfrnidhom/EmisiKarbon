import { useEffect, useState, type ReactNode } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { Check, Eye, EyeOff, Lock, Mail } from "lucide-react"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api"
import { useAuth, type Me, type Role } from "@/lib/auth"
import { goHome } from "@/lib/hosts"
import { tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** Isian & logika masuk bersama untuk halaman login web, admin, dan petugas. */
export const DEMO_PASSWORD = "lestari123"
export const DEMO: { email: string; role: Role; who: string; name: string }[] = [
  { email: "operator@smpn1ngasem.sch.id", role: "operator", who: "SMPN 1 Ngasem", name: "Budi Operator" },
  { email: "kepsek@smpn1ngasem.sch.id", role: "kepsek", who: "SMPN 1 Ngasem", name: "Siti Kepala" },
  { email: "petugas@smpn1ngasem.sch.id", role: "petugas", who: "SMPN 1 Ngasem", name: "Dewi Petugas" },
  { email: "operator@smpn2purwosari.sch.id", role: "operator", who: "SMPN 2 Purwosari", name: "Ani Operator" },
  { email: "admin@jejakhijau.id", role: "admin", who: "Platform", name: "Admin Platform" },
]
export function TextField({ icon: I, label, right, ...p }: { icon: typeof Mail; label: string; right?: ReactNode } & React.ComponentProps<typeof Input>) {
  return (
    <label className="group block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <span className="relative block">
        <I className="pointer-events-none absolute top-1/2 left-4 size-[1.125rem] -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
        <Input {...p} className={cn("h-12 rounded-2xl border-transparent bg-muted/70 pl-11 text-[0.9375rem] transition-all focus-visible:border-primary/40 focus-visible:bg-card focus-visible:ring-4 focus-visible:ring-primary/15", right && "pr-12", p.className)} />
        {right && <span className="absolute top-1/2 right-2 -translate-y-1/2">{right}</span>}
      </span>
    </label>
  )
}
export function PasswordField({ value, onChange, label, autoComplete, autoFocus, extra }: { value: string; onChange: (v: string) => void; label: string; autoComplete: string; autoFocus?: boolean; extra?: ReactNode }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <div className="relative">
        <TextField icon={Lock} label={label} type={show ? "text" : "password"} required value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} autoFocus={autoFocus} placeholder="••••••••"
          right={<button type="button" onClick={() => setShow(!show)} aria-label={show ? tl("Sembunyikan", "Hide") : tl("Tampilkan", "Show")} className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground">{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>} />
        {extra && <span className="absolute top-0 right-0">{extra}</span>}
      </div>
    </div>
  )
}
export function Strength({ pw }: { pw: string }) {
  const checks = [
    { ok: pw.length >= 8, id: "Minimal 8 karakter", en: "At least 8 characters" },
    { ok: /[A-Za-z]/.test(pw) && /\d/.test(pw), id: "Huruf & angka", en: "Letters & numbers" },
    { ok: /[^A-Za-z0-9]/.test(pw) || pw.length >= 12, id: "Simbol atau ≥ 12 karakter", en: "Symbol or ≥ 12 chars" },
  ]
  const score = checks.filter((c) => c.ok).length
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">{[0, 1, 2].map((i) => <span key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-300", i < score ? (score === 1 ? "bg-amber-400" : "bg-primary") : "bg-muted")} />)}</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs [@media(max-height:760px)]:hidden">{checks.map((c) => <span key={c.id} className={cn("flex items-center gap-1 transition-colors", c.ok ? "text-primary" : "text-muted-foreground")}><Check className={cn("size-3", !c.ok && "opacity-30")} />{tl(c.id, c.en)}</span>)}</div>
    </div>
  )
}


/** Masuk / aktivasi undangan (tanpa daftar mandiri) — dipakai login admin & petugas. */
export function useSignIn() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { login, me } = useAuth()
  const invite = params.get("invite") ?? params.get("undangan")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [inviteInfo, setInviteInfo] = useState<{ role: string; org?: string } | null>(null)
  useEffect(() => { if (me) goHome(me, nav, params.get("next")) }, [me]) // eslint-disable-line
  useEffect(() => {
    if (invite) api(`/auth/invite/accept`, { method: "POST", json: { token: invite } })
      .then((r) => { setEmail(r.email); setInviteInfo({ role: r.role, org: r.org }) })
      .catch((e) => setErr(e.message))
  }, [invite])
  const done = (r: { access: string; refresh: string; user: Me }) => {
    login(r.access, r.refresh, r.user)
    toast.success(tl(`Selamat datang, ${r.user.name}`, `Welcome, ${r.user.name}`))
    goHome(r.user, nav, params.get("next"))
  }
  const submit = async (e?: React.FormEvent, override?: { email: string; password: string }) => {
    e?.preventDefault()
    setErr(null)
    if (invite && !override && password !== confirm) return setErr(tl("Konfirmasi kata sandi tidak sama", "Passwords don't match"))
    setBusy(override?.email ?? "form")
    try {
      if (invite && !override) done(await api("/auth/invite/complete", { method: "POST", json: { token: invite, name, password } }))
      else done(await api("/auth/login", { method: "POST", json: override ?? { email, password } }))
    } catch (x) { setErr((x as Error).message) } finally { setBusy(null) }
  }
  return { invite, inviteInfo, name, setName, email, setEmail, password, setPassword, confirm, setConfirm, busy, err, submit }
}
