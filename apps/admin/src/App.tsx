import { lazy, Suspense } from "react"
import { Navigate, Route, Routes, useLocation } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { PageSkeleton } from "@/components/common"
import { ErrorBoundary } from "@/components/error-boundary"
import { ExternalRedirect, HandoffPage, Protected, RootRedirect } from "@/components/app-routing"

/** admin.<domain>: dasbor Admin, Operator & Kepala Sekolah. */
const Login = lazy(() => import("@/pages/auth/admin-login"))
const Methodology = lazy(() => import("@/pages/public/methodology"))
const Dashboard = lazy(() => import("@/pages/app/dashboard"))
const Baseline = lazy(() => import("@/pages/app/baseline"))
const BaselineSetup = lazy(() => import("@/pages/app/baseline-setup"))
const Input = lazy(() => import("@/pages/app/input"))
const Waste = lazy(() => import("@/pages/app/waste"))
const Mobility = lazy(() => import("@/pages/app/mobility"))
const Trees = lazy(() => import("@/pages/app/trees"))
const TreeDetail = lazy(() => import("@/pages/app/tree-detail"))
const Scan = lazy(() => import("@/pages/app/scan"))
const Assets = lazy(() => import("@/pages/app/assets"))
const Calendar = lazy(() => import("@/pages/app/calendar"))
const Reports = lazy(() => import("@/pages/app/reports"))
const ReportView = lazy(() => import("@/pages/app/report-view"))
const ReportDocument = lazy(() => import("@/pages/print/report-doc"))
const SettingsPage = lazy(() => import("@/pages/app/settings"))
const Carbon = lazy(() => import("@/pages/app/carbon"))
const AssetMap = lazy(() => import("@/pages/app/asset-map"))
const Iot = lazy(() => import("@/pages/app/iot"))
const Queue = lazy(() => import("@/pages/verif/queue"))
const Review = lazy(() => import("@/pages/verif/review"))
const Program = lazy(() => import("@/pages/admin/program"))
const Factors = lazy(() => import("@/pages/admin/factors"))
const Species = lazy(() => import("@/pages/admin/species"))
const Tenant = lazy(() => import("@/pages/admin/tenant"))
const QrBatch = lazy(() => import("@/pages/admin/qr"))
const Audit = lazy(() => import("@/pages/admin/audit"))
const Config = lazy(() => import("@/pages/admin/config"))
const TracePage = lazy(() => import("@/pages/app/trace"))
const CarbonReportPrint = lazy(() => import("@/pages/print/carbon-report"))

/** Alamat publik & aplikasi lain dipindah ke domainnya. */
function Elsewhere() {
  const { pathname } = useLocation()
  if (pathname === "/field" || pathname.startsWith("/field/")) return <ExternalRedirect to="petugas" path={pathname.slice(6) || "/"} />
  if (/^\/(p|s|verify)\//.test(pathname) || ["/register", "/home", "/footprint"].some((p) => pathname.startsWith(p))) return <ExternalRedirect to="web" />
  return <Navigate to="/app" replace />
}

export default function App() {
  return (
    <ErrorBoundary resetKey={useLocation().pathname}>
      <Suspense fallback={<div className="p-8"><PageSkeleton /></div>}>
        <Routes>
          <Route path="/" element={<RootRedirect guest={<Navigate to="/login" replace />} />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/handoff" element={<HandoffPage />} />
          <Route path="/methodology" element={<Methodology />} />
          <Route path="/print/carbon-report" element={<Protected><CarbonReportPrint /></Protected>} />
          <Route path="/print/reports/:id" element={<Protected><ReportDocument /></Protected>} />
          <Route element={<Protected><AppShell /></Protected>}>
          <Route path="/app" element={<Dashboard />} />
          <Route path="/app/trace" element={<TracePage />} />
          <Route path="/app/baseline" element={<Baseline />} />
          <Route path="/app/baseline/setup" element={<Navigate to="/app/baseline/setup/period" replace />} />
          <Route path="/app/baseline/setup/:step" element={<BaselineSetup />} />
          <Route path="/app/input" element={<Input />} />
          <Route path="/app/waste" element={<Waste />} />
          <Route path="/app/mobility" element={<Mobility />} />
          <Route path="/app/trees" element={<Trees />} />
          <Route path="/app/trees/:id" element={<TreeDetail />} />
          <Route path="/app/scan" element={<Scan />} />
          <Route path="/app/eco-services" element={<Assets />} />
          <Route path="/app/calendar" element={<Calendar />} />
          <Route path="/app/reports" element={<Reports />} />
          <Route path="/app/reports/:id" element={<ReportView />} />
          <Route path="/app/settings" element={<SettingsPage />} />
          <Route path="/app/carbon" element={<Carbon />} />
          <Route path="/app/map" element={<AssetMap />} />
          <Route path="/app/iot" element={<Iot />} />
          <Route path="/factors" element={<Factors />} />
          <Route path="/approvals" element={<Queue />} />
          <Route path="/approvals/:id" element={<Review />} />
          <Route path="/program" element={<Protected roles={["admin"]}><Program /></Protected>} />
          <Route path="/admin/species" element={<Protected roles={["admin"]}><Species /></Protected>} />
          <Route path="/admin/tenant" element={<Protected roles={["admin"]}><Tenant /></Protected>} />
          <Route path="/admin/qr" element={<Protected roles={["admin"]}><QrBatch /></Protected>} />
          <Route path="/admin/audit" element={<Protected roles={["admin"]}><Audit /></Protected>} />
          <Route path="/admin/settings" element={<Protected roles={["admin"]}><Config /></Protected>} />
          </Route>
          <Route path="*" element={<Elsewhere />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}
