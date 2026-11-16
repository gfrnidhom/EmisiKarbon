import { useEffect, useState, type ReactNode } from "react"
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { PageSkeleton } from "@/components/common"
import { api } from "@/lib/api"
import { useAuth, type Role } from "@/lib/auth"
import { APP, appFor, appUrl, canUse, goHome, handoff, HOME, type AppKind } from "@/lib/hosts"
import { tl } from "@/lib/i18n"

const Wait = () => <div className="p-8"><PageSkeleton /></div>

/** Halaman wajib login + hanya untuk peran yang boleh memakai aplikasi ini; selain itu dipindah ke aplikasi yang sesuai. */
export function Protected({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { me, loading, has } = useAuth()
  const loc = useLocation()
  const [moving, setMoving] = useState(false)
  const wrong = !!me && !canUse(me, APP)
  useEffect(() => { if (me && wrong && !moving) { setMoving(true); handoff(appFor(me)) } }, [me, wrong, moving])
  if (loading) return <Wait />
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (wrong) return <Moving to={appFor(me)} />
  if (roles && !has(...roles)) return <Navigate to={HOME[APP]} replace />
  return <>{children}</>
}

function Moving({ to }: { to: AppKind }) {
  const name = to === "admin" ? tl("Dasbor Admin", "Admin dashboard") : to === "petugas" ? tl("Aplikasi Petugas", "Officer app") : tl("Beranda", "Home")
  return <div className="flex min-h-svh items-center justify-center p-8 text-sm text-muted-foreground">{tl(`Membuka ${name}…`, `Opening ${name}…`)}</div>
}

/** /auth/handoff?code=…&next=… — menukar kode sekali pakai dari domain lain menjadi sesi di domain ini. */
export function HandoffPage() {
  const [params] = useSearchParams()
  const { login } = useAuth()
  const nav = useNavigate()
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    const code = params.get("code")
    if (!code) { nav("/login", { replace: true }); return }
    api<any>("/auth/handoff/exchange", { method: "POST", json: { code } })
      .then((r) => { login(r.access, r.refresh, r.user); goHome(r.user, nav, params.get("next")) })
      .catch((e) => setErr(e.message))
  }, []) // eslint-disable-line
  if (err) return <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-8 text-center text-sm"><p>{err}</p><a className="font-medium text-primary" href="/login">{tl("Masuk", "Sign in")}</a></div>
  return <Wait />
}

/** Alamat yang dimiliki aplikasi lain → pindah ke domain yang benar dengan path yang sama. */
export function ExternalRedirect({ to, path }: { to: AppKind; path?: string }) {
  const loc = useLocation()
  useEffect(() => { window.location.replace(appUrl(to, path ?? loc.pathname + loc.search + loc.hash)) }, [to, path, loc])
  return <Wait />
}

/** Rute akar: tamu → login, sudah masuk → beranda aplikasi (atau aplikasi yang sesuai peran). */
export function RootRedirect({ guest }: { guest: ReactNode }) {
  const { me, loading } = useAuth()
  const nav = useNavigate()
  useEffect(() => { if (me) goHome(me, nav) }, [me]) // eslint-disable-line
  if (loading) return <Wait />
  return me ? <Wait /> : <>{guest}</>
}
