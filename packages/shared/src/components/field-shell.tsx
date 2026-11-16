import { useEffect } from "react"
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"
import { Bike, CalendarDays, ChevronLeft, CircleUserRound, Download, Flame, History, House, Leaf, ListChecks, Recycle, ScanLine, Trees, type LucideIcon } from "lucide-react"
import { ErrorBoundary } from "./error-boundary"
import { EmbedProvider } from "./embed"
import { Brand, Notifications, OfflineIndicator, useInstallPrompt } from "./app-shell"
import { circleCls } from "./field-ui"
import { UserAvatar } from "./profile-dialog"
import { useAuth } from "@/lib/auth"
import { tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** Alamat halaman staf (/app/…) dialihkan ke halaman padanannya di aplikasi petugas. */
const FIELD_PAGES = ["/app/input", "/app/waste", "/app/mobility", "/app/trees", "/app/scan", "/app/calendar"]
export function toFieldPath(path: string) {
  const hit = FIELD_PAGES.find((p) => path === p || path.startsWith(p + "/") || path.startsWith(p + "?"))
  return hit ? path.slice(4) : "/"
}

type Tab = { to: string; id: string; en: string; icon: LucideIcon; end?: boolean }
const TABS: Tab[] = [
  { to: "/", id: "Beranda", en: "Home", icon: House, end: true },
  { to: "/tasks", id: "Tugas", en: "Tasks", icon: ListChecks },
  { to: "/scan", id: "Scan", en: "Scan", icon: ScanLine },
  { to: "/history", id: "Riwayat", en: "History", icon: History },
  { to: "/account", id: "Akun", en: "Account", icon: CircleUserRound },
]
const RECORD: Tab[] = [
  { to: "/input", id: "Energi & BBM", en: "Energy & fuel", icon: Flame },
  { to: "/waste", id: "Sampah", en: "Waste", icon: Recycle },
  { to: "/mobility", id: "Mobilitas", en: "Mobility", icon: Bike },
  { to: "/trees", id: "Pohon", en: "Trees", icon: Trees },
  { to: "/calendar", id: "Kalender", en: "Calendar", icon: CalendarDays },
]
const ROOTS = ["/", "/tasks", "/history", "/account"]

function titleOf(path: string) {
  if (path === "/scan") return tl("Scan & ukur", "Scan & measure")
  if (path.startsWith("/trees/")) return tl("Detail pohon", "Tree detail")
  const r = RECORD.find((x) => path.startsWith(x.to))
  return r ? tl(r.id, r.en) : ""
}

function SideLink({ it }: { it: Tab }) {
  return (
    <NavLink to={it.to} end={it.end} className={({ isActive }) => cn("flex h-11 items-center gap-3 rounded-full px-4 text-sm font-medium transition-colors", isActive ? "bg-[var(--f-ink)] text-[var(--f-ink-fg)]" : "text-[var(--f-muted)] hover:bg-[var(--f-soft)] hover:text-[var(--f-ink)]")}>
      <it.icon className="size-[1.125rem]" />{tl(it.id, it.en)}
    </NavLink>
  )
}

/** Aplikasi Petugas Monitoring — kartu lembut, pastel hijau, tombol pil.
 *  HP/APK: tombol bulat di atas + bilah tab di bawah. Desktop: sidebar mengambang + konten lebar. */
export function FieldShell() {
  const { me, orgId } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  const install = useInstallPrompt()
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  if (!me) return null
  const org = me.orgs.find((o) => o.id === orgId) ?? me.orgs[0]
  const root = ROOTS.includes(loc.pathname)
  const back = loc.pathname.startsWith("/trees/") ? "/trees" : "/"

  return (
    <div className="fapp min-h-svh md:flex md:gap-2 md:p-4">
      {/* ---------- sidebar desktop ---------- */}
      <aside className="no-print f-card sticky top-4 hidden h-[calc(100svh-2rem)] w-64 shrink-0 flex-col gap-6 overflow-y-auto p-4 md:flex">
        <Brand className="px-1" />
        <div className="flex items-center gap-3 rounded-[1.25rem] bg-[var(--f-soft)] p-3">
          <UserAvatar name={me.name} className="size-10 text-sm" />
          <div className="min-w-0 leading-tight"><div className="truncate text-sm font-semibold">{me.name}</div><div className="truncate text-xs text-[var(--f-muted)]">{org?.name}</div></div>
        </div>
        <nav className="flex flex-col gap-1">{TABS.map((it) => <SideLink key={it.to} it={it} />)}</nav>
        <div>
          <div className="mb-1.5 px-4 text-xs font-medium text-[var(--f-muted)]">{tl("Pencatatan", "Records")}</div>
          <nav className="flex flex-col gap-1">{RECORD.map((it) => <SideLink key={it.to} it={it} />)}</nav>
        </div>
        {install && <button onClick={install} className="mt-auto flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--f-tint-soft)] text-sm font-medium text-[var(--f-tint)]"><Download className="size-4" />{tl("Pasang aplikasi", "Install app")}</button>}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ---------- bilah atas: chip / tombol kembali + tombol bulat ---------- */}
        <header className="no-print sticky top-0 z-30 bg-gradient-to-b from-[var(--f-bg2)] via-[var(--f-bg2)]/85 to-transparent pt-[env(safe-area-inset-top)] md:static md:bg-none">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 md:px-6">
            {root ? (
              <NavLink to="/account" className="flex h-11 min-w-0 items-center gap-2 rounded-full bg-[var(--f-card)] py-1 pr-4 pl-1 shadow-[var(--f-shadow)]">
                <span className="flex size-9 items-center justify-center rounded-full bg-[var(--f-tint)] text-white"><Leaf className="size-[1.1rem]" /></span>
                <span className="truncate text-sm font-medium">{org?.name ?? "Sekolah Lestari"}</span>
              </NavLink>
            ) : (
              <>
                <button onClick={() => (window.history.length > 1 ? nav(-1) : nav(back))} className={circleCls} aria-label={tl("Kembali", "Back")}><ChevronLeft className="size-5" /></button>
                <h1 className="min-w-0 truncate text-lg font-medium">{titleOf(loc.pathname)}</h1>
              </>
            )}
            <div className="ml-auto flex items-center gap-2 [&>button]:size-11 [&>button]:rounded-full [&>button]:border-0 [&>button]:bg-[var(--f-card)] [&>button]:shadow-[var(--f-shadow)]">
              <OfflineIndicator />
              <Notifications />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-1 pb-28 md:px-6 md:pb-10">
          <ErrorBoundary resetKey={loc.pathname}>{root ? <Outlet /> : <EmbedProvider><Outlet /></EmbedProvider>}</ErrorBoundary>
        </main>
      </div>

      {/* ---------- bilah tab (HP / APK) ---------- */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 rounded-t-[1.75rem] bg-[var(--f-card)] shadow-[0_-10px_30px_-12px_rgba(16,64,42,0.18)] md:hidden">
        <div className="grid grid-cols-5 px-2 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
          {TABS.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} aria-label={tl(it.id, it.en)} className={({ isActive }) => cn("relative flex flex-col items-center gap-1 pt-1.5 pb-2.5 text-[0.625rem] font-medium transition-colors", isActive ? "text-[var(--f-tint)]" : "text-[var(--f-muted)]")}>
              {({ isActive }) => <>
                <span className={cn("flex h-9 w-12 items-center justify-center rounded-full transition-colors", isActive && "bg-[var(--f-tint-soft)]")}><it.icon className="size-[1.375rem]" strokeWidth={isActive ? 2.2 : 1.8} /></span>
                {tl(it.id, it.en)}
                <span className={cn("absolute bottom-0 h-1 w-6 rounded-full bg-[var(--f-tint)] transition-opacity", isActive ? "opacity-100" : "opacity-0")} />
              </>}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
