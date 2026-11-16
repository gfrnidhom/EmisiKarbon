import { useEffect, useMemo, useRef, useState } from "react"
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import { Bell, BookOpenCheck, Building2, CalendarDays, ChevronDown, ClipboardCheck, CloudOff, Cpu, Download, Factory, FileBarChart2, Flame, Gauge, Leaf, LogOut, Map as MapIcon, MapPinned, Moon, QrCode, Recycle, RefreshCw, ScanLine, ScrollText, Settings, ShieldCheck, SlidersHorizontal, Sprout, Sun, Trees, Bike, Search, Sigma, UserPen, Zap, type LucideIcon, Lock } from "lucide-react"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuBadge,
  SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarProvider, SidebarRail, SidebarSeparator, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { isUserOnly, ROLE_LABEL, useAuth } from "@/lib/auth"
import { api, flushQueue, onQueueChange } from "@/lib/api"
import { fmtDateTime } from "@/lib/format"
import { lang, setLang, t, tl, tOther } from "@/lib/i18n"
import { SimpleSelect } from "./common"
import { ErrorBoundary } from "./error-boundary"
import { usePhase } from "./data-phase"
import { ProfileDialog, UserAvatar } from "./profile-dialog"
import { handoff } from "@/lib/hosts"
import { cn } from "@/lib/utils"

type Item = { to: string; label: string; icon: LucideIcon; end?: boolean; badge?: number; children?: Item[] }

export function Brand({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <Link to="/" className={cn("flex items-center gap-2.5", className)}>
      <img src="/favicon.svg" alt="" className="size-9 rounded-xl shadow-sm ring-1 ring-black/5" />
      {!compact && (
        <div className="leading-tight">
          <div className="text-[0.9375rem] font-semibold tracking-tight">Sekolah Lestari</div>
          <div className="text-[0.6875rem] font-medium tracking-wide text-muted-foreground">{t("Dashboard Emisi Karbon")}</div>
        </div>
      )}
    </Link>
  )
}

export function LangToggle({ className }: { className?: string }) {
  return (
    <div className={cn("inline-flex rounded-lg bg-muted p-0.5 text-xs font-semibold", className)} role="group" aria-label="Language">
      {(["id", "en"] as const).map((l) => (
        <button key={l} onClick={() => l !== lang && setLang(l)} aria-pressed={lang === l}
          className={cn("rounded-md px-2.5 py-1 uppercase transition-colors", lang === l ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {l}
        </button>
      ))}
    </div>
  )
}

/** Item navigasi dwibahasa: label bahasa aktif + subjudul bahasa lain (seperti "Beranda · Home"). */
function NavItem({ it }: { it: Item }) {
  const loc = useLocation()
  const { state, isMobile, setOpenMobile } = useSidebar()
  const childActive = !!it.children?.some((c) => loc.pathname.startsWith(c.to))
  const active = it.end ? loc.pathname === it.to : loc.pathname.startsWith(it.to) && !it.children
  const [open, setOpen] = useState(childActive)
  useEffect(() => { if (childActive) setOpen(true) }, [childActive])
  const content = (
    <>
      <it.icon className="size-[1.125rem]!" />
      <span className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
        <span className="truncate text-[0.8438rem] font-medium">{t(it.label)}</span>
        <span className={cn("truncate text-[0.6875rem] font-normal", active ? "opacity-75" : "text-muted-foreground")}>{tOther(it.label)}</span>
      </span>
      {it.children && <ChevronDown className={cn("ml-auto size-4 transition-transform group-data-[collapsible=icon]:hidden", open && "rotate-180")} />}
    </>
  )
  const cls = cn("h-auto min-h-11 gap-3 rounded-xl px-3 py-2 transition-all",
    active && "bg-sidebar-primary! text-sidebar-primary-foreground! hover:bg-sidebar-primary/90!")
  return (
    <SidebarMenuItem>
      {it.children ? (
        <SidebarMenuButton className={cls} tooltip={t(it.label)} onClick={() => setOpen((o) => !o)}>{content}</SidebarMenuButton>
      ) : (
        <SidebarMenuButton className={cls} isActive={active} tooltip={t(it.label)} render={<NavLink to={it.to} end={it.end} onClick={() => isMobile && setOpenMobile(false)} />}>{content}</SidebarMenuButton>
      )}
      {!!it.badge && <SidebarMenuBadge className={cn("top-3 rounded-full bg-primary/15 px-1.5 text-primary", active && "bg-white/25 text-white")}>{it.badge}</SidebarMenuBadge>}
      {it.children && open && state !== "collapsed" && (
        <SidebarMenuSub className="mt-1">
          {it.children.map((c) => (
            <SidebarMenuSubItem key={c.to}>
              <SidebarMenuSubButton isActive={loc.pathname.startsWith(c.to)} render={<NavLink to={c.to} onClick={() => isMobile && setOpenMobile(false)} />}>
                <c.icon /><span>{t(c.label)}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  )
}
function NavGroup({ label, items }: { label?: string; items: Item[] }) {
  if (!items.length) return null
  return (
    <SidebarGroup className="py-1">
      {label && <SidebarGroupLabel className="text-[0.6562rem] uppercase tracking-wider">{t(label)}</SidebarGroupLabel>}
      <SidebarGroupContent><SidebarMenu className="gap-1">{items.map((it) => <NavItem key={it.to + it.label} it={it} />)}</SidebarMenu></SidebarGroupContent>
    </SidebarGroup>
  )
}

export function useInstallPrompt() {
  const [evt, setEvt] = useState<any>(null)
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvt(e) }
    window.addEventListener("beforeinstallprompt", h)
    return () => window.removeEventListener("beforeinstallprompt", h)
  }, [])
  return evt ? async () => { evt.prompt(); await evt.userChoice; setEvt(null) } : null
}

export function OfflineIndicator() {
  const [online, setOnline] = useState(navigator.onLine)
  const [queued, setQueued] = useState(0)
  const qc = useQueryClient()
  useEffect(() => {
    const on = async () => {
      setOnline(true)
      const r = await flushQueue()
      if (r.sent) { toast.success(t("{n} data offline tersinkron", { n: r.sent })); qc.invalidateQueries() }
      if (r.failed) toast.warning(t("{n} data perlu ditinjau (konflik: versi server menang, salinan lokal disimpan)", { n: r.failed }))
    }
    const off = () => setOnline(false)
    window.addEventListener("online", on); window.addEventListener("offline", off)
    const un = onQueueChange(setQueued)
    if (navigator.onLine) flushQueue().then((r) => { if (r.sent) qc.invalidateQueries() })
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); un() }
  }, [qc])
  if (online && !queued) return null
  return (
    <Button variant="outline" size="sm" className={cn("gap-1.5", !online && "border-amber-500/40 text-amber-700 dark:text-amber-300")}
      onClick={async () => { const r = await flushQueue(); toast.info(r.sent ? t("{n} data offline tersinkron", { n: r.sent }) : t("Belum ada yang terkirim")) }}>
      {online ? <RefreshCw className="size-3.5" /> : <CloudOff className="size-3.5" />}
      <span className="hidden sm:inline">{online ? t("Sinkron") : t("Offline")}</span>
      {queued > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[0.625rem] font-semibold text-white">{queued}</span>}
    </Button>
  )
}

export function Notifications() {
  const nav = useNavigate()
  const { data = [], refetch } = useQuery({ queryKey: ["notifications"], queryFn: () => api<any[]>("/notifications"), refetchInterval: 60_000 })
  const unread = data.filter((n) => !n.read).length
  useEffect(() => {
    const latest = data.find((n) => !n.read)
    if (!latest || !("Notification" in window) || Notification.permission !== "granted") return
    const key = `jh.notified.${latest.id}`
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, "1") } catch { return }
    navigator.serviceWorker?.ready.then((reg) => reg.showNotification(t(latest.title), { body: latest.body, icon: "/pwa-192.png", data: latest.link })).catch(() => {})
  }, [data])
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="icon" className="relative bg-card hover:bg-card/70" aria-label={t("Notifikasi")} />}>
        <Bell className="size-4" />
        {unread > 0 && <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[0.5625rem] font-bold text-primary-foreground">{unread}</span>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-medium">{t("Notifikasi")}</span>
          <div className="flex gap-1">
            {"Notification" in window && Notification.permission === "default" && <Button size="xs" variant="ghost" onClick={() => Notification.requestPermission()}>{t("Aktifkan push")}</Button>}
            <Button size="xs" variant="ghost" onClick={async () => { await api("/notifications/read", { method: "POST" }); refetch() }}>{t("Tandai dibaca")}</Button>
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {data.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("Belum ada notifikasi")}</p>}
          {data.map((n) => (
            <button key={n.id} onClick={() => n.link && nav(n.link)} className={cn("block w-full border-b px-4 py-3 text-left last:border-0 hover:bg-muted/60", !n.read && "bg-primary/5")}>
              <div className="flex items-start gap-2">
                {!n.read && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />}
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t(n.title)}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                  <p className="mt-1 text-[0.625rem] text-muted-foreground">{fmtDateTime(n.created_at)}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Cari halaman cepat (⌘K / Ctrl+K). */
function QuickSearch({ items }: { items: Item[] }) {
  const nav = useNavigate()
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const [idx, setIdx] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  const flat = useMemo(() => items.flatMap((it) => it.children ? it.children : [it]), [items])
  const hits = useMemo(() => {
    const k = q.trim().toLowerCase()
    return (k ? flat.filter((it) => `${t(it.label)} ${tOther(it.label)}`.toLowerCase().includes(k)) : flat).slice(0, 8)
  }, [q, flat])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); ref.current?.focus() } }
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h)
  }, [])
  const go = (it?: Item) => { if (!it) return; nav(it.to); setQ(""); setOpen(false); ref.current?.blur() }
  const mac = /Mac|iPhone|iPad/.test(navigator.platform)
  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute top-1/2 left-4 size-[1.125rem] -translate-y-1/2 text-muted-foreground" />
      <input ref={ref} value={q} placeholder={t("Cari halaman…")}
        onChange={(e) => { setQ(e.target.value); setIdx(0); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, hits.length - 1)) }
          else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)) }
          else if (e.key === "Enter") go(hits[idx])
          else if (e.key === "Escape") ref.current?.blur()
        }}
        className="h-11 w-full rounded-full bg-card pr-16 pl-11 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30" />
      <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-md bg-muted px-1.5 py-0.5 font-sans text-[0.6875rem] font-medium text-muted-foreground">{mac ? "⌘" : "Ctrl"} K</kbd>
      {open && hits.length > 0 && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl bg-popover p-1.5 shadow-lg ring-1 ring-border">
          {hits.map((it, i) => (
            <button key={it.to} onMouseDown={(e) => { e.preventDefault(); go(it) }} onMouseEnter={() => setIdx(i)}
              className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm", i === idx && "bg-muted")}>
              <it.icon className="size-4 text-primary" /><span className="font-medium">{t(it.label)}</span><span className="ml-auto text-xs text-muted-foreground">{tOther(it.label)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function MenuRow({ icon: Icon, title, sub, onClick, render }: { icon: LucideIcon; title: string; sub: string; onClick?: () => void; render?: any }) {
  return (
    <DropdownMenuItem onClick={onClick} render={render} className="gap-3 rounded-xl px-2.5 py-2">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"><Icon className="size-4" /></span>
      <span className="flex min-w-0 flex-col leading-tight"><span className="font-medium">{title}</span><span className="truncate text-xs text-muted-foreground">{sub}</span></span>
    </DropdownMenuItem>
  )
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  return (
    <Button variant="ghost" size="icon" className="bg-card hover:bg-card/70" aria-label={t("Ganti tema")} onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
      {resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}

const MOBILE_NAV: Item[] = [
  { to: "/app", label: "Beranda", icon: Gauge, end: true },
  { to: "/app/input", label: "Input", icon: Flame },
  { to: "/app/scan", label: "Scan", icon: ScanLine },
  { to: "/app/map", label: "Peta", icon: MapIcon },
  { to: "/app/reports", label: "Laporan", icon: FileBarChart2 },
]

export function AppShell() {
  const { me, orgId, setOrgId, has, logout } = useAuth()
  const install = useInstallPrompt()
  const qc = useQueryClient()
  const loc = useLocation()
  const { resolvedTheme, setTheme } = useTheme()
  const [profileOpen, setProfileOpen] = useState(false)
  const tasks = useQuery({ queryKey: ["vtasks", "terbuka"], queryFn: () => api<any[]>("/verification/tasks?status=terbuka"), enabled: !!me, refetchInterval: 120_000 })
  const phase = usePhase(me && !isUserOnly(me) ? orgId ?? undefined : undefined)
  const baselineLocked = !!phase.data?.locked
  if (!me) return null
  const openTasks = (tasks.data ?? []).filter((x) => x.canAct).length

  const userOnly = isUserOnly(me)
  const main: Item[] = userOnly ? [{ to: "/footprint", label: "Jejak Karbon Saya", icon: Leaf, end: true }] : [
    { to: "/app", label: "Beranda", icon: Gauge, end: true },
    { to: "/app/carbon", label: "Rapor Karbon", icon: Zap },
    { to: "/app/eco-services", label: "Jasa Lingkungan", icon: Sprout },
    { to: "/app/map", label: "Peta Aset", icon: MapIcon },
    ...(baselineLocked ? [] : [{ to: "/app/baseline", label: "Survei Awal", icon: BookOpenCheck }]),
    { to: "/app/reports", label: "Laporan", icon: FileBarChart2 },
  ]
  const work: Item[] = userOnly ? [] : [
    {
      to: "/app/input#group", label: "Input Berkala", icon: Flame, children: [
        { to: "/app/input", label: "Energi & bahan bakar", icon: Flame },
        { to: "/app/waste", label: "Sampah", icon: Recycle },
        { to: "/app/mobility", label: "Mobilitas", icon: Bike },
        { to: "/app/trees", label: "Pohon", icon: Trees },
        { to: "/app/scan", label: "Scan & ukur", icon: ScanLine },
        { to: "/app/calendar", label: "Kalender", icon: CalendarDays },
      ],
    },
    { to: "/approvals", label: "Persetujuan", icon: ClipboardCheck, end: true, badge: openTasks },
    { to: "/app/iot", label: "Sensor IoT", icon: Cpu },
    { to: "/factors", label: "Faktor Emisi", icon: Factory },
    ...(baselineLocked ? [{ to: "/app/baseline", label: "Survei Awal (terkunci)", icon: Lock }] : []),
    { to: "/app/settings", label: "Pengaturan", icon: Settings },
  ]
  // Menu tambahan sesuai hak akses — gaya tampilan tetap sama
  const manage: Item[] = userOnly ? [] : [
    ...(has("admin") ? [{ to: "/program", label: "Dasbor Program", icon: Building2 }] : []),
    ...(has("admin") ? [{ to: "/admin/tenant", label: "Lembaga & Pengguna", icon: ShieldCheck }] : []),
    ...(has("admin") ? [{ to: "/admin/audit", label: "Log Audit", icon: ScrollText }] : []),
  ]
  const adminItems: Item[] = !userOnly && has("admin") ? [
    { to: "/admin/species", label: "Jenis Pohon", icon: Leaf },
    { to: "/admin/qr", label: "Generator QR", icon: QrCode },
    { to: "/admin/settings", label: "Konfigurasi", icon: SlidersHorizontal },
  ] : []
  const currentOrg = me.orgs.find((o) => o.id === orgId)?.name
  const primaryRole = me.roles[0]?.role

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader className="gap-4 px-3 pt-4">
          <Brand className="group-data-[collapsible=icon]:[&>div]:hidden" />
          {me.orgs.length > 0 && !userOnly && (
            <div className="group-data-[collapsible=icon]:hidden">
              {me.orgs.length > 1 ? (
                <SimpleSelect className="h-11 rounded-xl border-0 bg-muted" value={String(orgId)} onChange={(v) => { setOrgId(Number(v)); qc.invalidateQueries() }} options={me.orgs.map((o) => ({ value: String(o.id), label: o.name }))} />
              ) : (
                <div className="flex h-11 items-center rounded-xl bg-muted px-4 text-sm font-medium">{me.orgs[0].name}</div>
              )}
            </div>
          )}
        </SidebarHeader>
        <SidebarContent className="gap-0">
          <NavGroup items={main} />
          {work.length > 0 && <><SidebarSeparator className="my-1" /><NavGroup items={work} /></>}
          {manage.length + adminItems.length > 0 && <><SidebarSeparator className="my-1" /><NavGroup items={[...manage, ...adminItems]} /></>}
        </SidebarContent>
        <SidebarFooter className="gap-3 px-3 pb-4">
          {install && <Button variant="outline" size="sm" className="group-data-[collapsible=icon]:hidden" onClick={install}><Download className="size-4" /> {t("Pasang aplikasi")}</Button>}
          <div className="rounded-xl bg-sidebar-accent/70 p-3 text-[0.6875rem] leading-snug text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden">
            <p className="font-semibold">{t("Bukan kredit karbon")}</p>
            <p className="mt-0.5 opacity-80">{t("Serapan pohon adalah estimasi pelaporan internal (Perpres 110/2025).")}</p>
          </div>
          <LangToggle className="self-start group-data-[collapsible=icon]:hidden" />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="no-print sticky top-0 z-20 flex h-[4.75rem] items-center gap-3 bg-background/85 px-3 backdrop-blur sm:px-6 md:rounded-t-3xl">
          <SidebarTrigger className="size-10 rounded-full bg-card hover:bg-card/70" />
          <div className="hidden flex-1 md:block"><QuickSearch items={[...main, ...work, ...manage, ...adminItems]} /></div>
          <span className="truncate text-sm font-medium md:hidden">{me.orgs.find((o) => o.id === orgId)?.name ?? ""}</span>
          <div className="ml-auto flex items-center gap-2">
            <OfflineIndicator />
            <LangToggle className="bg-card md:hidden" />
            <Notifications />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger render={<button className="group flex items-center gap-3 rounded-full py-1 pr-1 pl-1 text-left transition-colors hover:bg-card/70 aria-expanded:bg-card lg:pr-3" aria-label={t("Akun")} />}>
                <UserAvatar name={me.name} />
                <span className="hidden min-w-0 leading-tight lg:block">
                  <span className="block max-w-44 truncate text-sm font-semibold">{me.name}</span>
                  <span className="block max-w-44 truncate text-xs text-muted-foreground">{me.email}</span>
                </span>
                <ChevronDown className="hidden size-4 text-muted-foreground transition-transform group-aria-expanded:rotate-180 lg:block" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-80 rounded-2xl p-2">
                <div className="mb-1 rounded-xl bg-gradient-to-br from-primary/10 to-transparent p-3.5">
                  <div className="flex items-center gap-3">
                    <UserAvatar name={me.name} className="size-12 text-base" />
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-foreground">{me.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{me.email}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {primaryRole && <span className="inline-flex h-6 items-center gap-1 rounded-full bg-primary px-2.5 text-[0.6875rem] font-medium text-primary-foreground"><ShieldCheck className="size-3" />{ROLE_LABEL[primaryRole]}</span>}
                    {me.roles.length > 1 && <span className="inline-flex h-6 items-center rounded-full bg-card px-2.5 text-[0.6875rem] text-muted-foreground ring-1 ring-border">+{me.roles.length - 1} {t("peran lain")}</span>}
                    {currentOrg && <span className="inline-flex h-6 max-w-full items-center gap-1 rounded-full bg-card px-2.5 text-[0.6875rem] text-muted-foreground ring-1 ring-border"><Building2 className="size-3 shrink-0" /><span className="truncate">{currentOrg}</span></span>}
                  </div>
                </div>
                <DropdownMenuGroup>
                  <MenuRow icon={UserPen} title={t("Ubah profil")} sub={t("Nama & nomor HP")} onClick={() => setProfileOpen(true)} />
                  {me.roles.some((r) => r.role === "petugas") && <MenuRow icon={ScanLine} title={tl("Aplikasi Petugas", "Officer app")} sub={tl("Buka tampilan ponsel petugas", "Open the field officer app")} onClick={() => handoff("petugas")} />}
                  <MenuRow icon={BookOpenCheck} title={t("Metodologi")} sub={t("Rumus, faktor & sumber")} render={<Link to="/methodology" />} />
                  <MenuRow icon={resolvedTheme === "dark" ? Sun : Moon} title={resolvedTheme === "dark" ? t("Mode terang") : t("Mode gelap")} sub={t("Ganti tampilan")} onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} />
                </DropdownMenuGroup>
                <DropdownMenuSeparator className="my-1.5" />
                <DropdownMenuItem variant="destructive" onClick={logout} className="gap-3 rounded-xl px-2.5 py-2">
                  <span className="flex size-9 items-center justify-center rounded-full bg-destructive/10"><LogOut className="size-4" /></span>
                  <span className="font-medium">{t("Keluar")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
          </div>
        </header>
        <div key={loc.pathname.split("/").slice(0, 3).join("/")} className="mx-auto w-full max-w-[87.5rem] flex-1 px-4 pt-4 pb-28 sm:px-6 md:pb-10">
          <ErrorBoundary resetKey={loc.pathname}><Outlet /></ErrorBoundary>
        </div>
        {!userOnly && (
          <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
            {MOBILE_NAV.map((it) => (
              <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.6875rem] text-muted-foreground", isActive && "text-primary")}>
                <it.icon className="size-5" />
                {t(it.label)}
              </NavLink>
            ))}
          </nav>
        )}
      </SidebarInset>
    </SidebarProvider>
  )
}
