import { lazy, Suspense } from "react"
import { Navigate, Route, Routes, useLocation } from "react-router-dom"
import { ConsumerShell } from "@/components/consumer-shell"
import { PageSkeleton } from "@/components/common"
import { ErrorBoundary } from "@/components/error-boundary"
import { ExternalRedirect, HandoffPage, Protected } from "@/components/app-routing"
import { useAuth } from "@/lib/auth"
import { appFor } from "@/lib/hosts"

/** Domain utama: beranda & halaman publik + jejak karbon pribadi pengguna umum. */
const Landing = lazy(() => import("@/pages/public/landing"))
const Login = lazy(() => import("@/pages/public/login"))
const TreePublic = lazy(() => import("@/pages/public/tree"))
const Methodology = lazy(() => import("@/pages/public/methodology"))
const Survey = lazy(() => import("@/pages/public/survey"))
const ReportVerify = lazy(() => import("@/pages/public/report-verify"))
const FootprintOverview = lazy(() => import("@/pages/jejak/overview"))
const FootprintCalculator = lazy(() => import("@/pages/jejak/calculator"))

function Home() {
  const { me, loading } = useAuth()
  if (loading) return null
  return me && appFor(me) === "web" ? <Navigate to="/footprint" replace /> : <Landing />
}

/** Alamat lama: versi bahasa Indonesia → Inggris; halaman staf → admin.; aplikasi lapangan → petugas. */
const LEGACY: [string, string][] = [
  ["/cetak/rapor-karbon", "/print/carbon-report"], ["/admin/konfigurasi", "/admin/settings"], ["/admin/pohon", "/admin/species"], ["/admin/faktor", "/factors"],
  ["/jejak/hitung", "/footprint/calculate"], ["/jejak", "/footprint"], ["/app/telusuri", "/app/trace"], ["/app/sampah", "/app/waste"],
  ["/app/mobilitas", "/app/mobility"], ["/app/pohon", "/app/trees"], ["/app/aset", "/app/eco-services"], ["/app/kalender", "/app/calendar"],
  ["/app/rapor", "/app/reports"], ["/app/pengaturan", "/app/settings"], ["/app/karbon", "/app/carbon"], ["/app/peta", "/app/map"],
  ["/verifikasi/lapangan", "/approvals"], ["/verifikasi", "/approvals"], ["/metodologi", "/methodology"], ["/keaslian", "/verify"],
  ["/beranda", "/home"], ["/masuk", "/login"], ["/daftar", "/register"], ["/faktor", "/factors"],
]
const ADMIN_PATHS = ["/app", "/approvals", "/factors", "/program", "/admin", "/print"]
function LegacyRedirect() {
  const loc = useLocation()
  const hit = LEGACY.find(([from]) => loc.pathname === from || loc.pathname.startsWith(from + "/"))
  const path = hit ? hit[1] + loc.pathname.slice(hit[0].length) : loc.pathname
  const search = loc.search.replace(/([?&])undangan=/, "$1invite=").replace(/([?&])tanggal=/, "$1date=").replace(/([?&])sumber=/, "$1source=")
  if (path === "/field" || path.startsWith("/field/")) return <ExternalRedirect to="petugas" path={(path.slice(6) || "/") + search} />
  if (ADMIN_PATHS.some((p) => path === p || path.startsWith(p + "/"))) return <ExternalRedirect to="admin" path={path + search + loc.hash} />
  if (hit) return <Navigate to={path + search + loc.hash} replace />
  return <Navigate to="/" replace />
}

export default function App() {
  return (
    <ErrorBoundary resetKey={useLocation().pathname}>
      <Suspense fallback={<div className="p-8"><PageSkeleton /></div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/home" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Login mode="register" />} />
          <Route path="/auth/handoff" element={<HandoffPage />} />
          <Route path="/p/:code" element={<TreePublic />} />
          <Route path="/methodology" element={<Methodology />} />
          <Route path="/s/:token" element={<Survey />} />
          <Route path="/verify/:hash" element={<ReportVerify />} />
          <Route element={<Protected><ConsumerShell /></Protected>}>
            <Route path="/footprint" element={<FootprintOverview />} />
            <Route path="/footprint/calculate" element={<FootprintCalculator />} />
          </Route>
          <Route path="*" element={<LegacyRedirect />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}
