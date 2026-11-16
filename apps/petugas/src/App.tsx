import { lazy, Suspense } from "react"
import { Navigate, Route, Routes, useLocation } from "react-router-dom"
import { FieldShell, toFieldPath } from "@/components/field-shell"
import { PageSkeleton } from "@/components/common"
import { ErrorBoundary } from "@/components/error-boundary"
import { ExternalRedirect, HandoffPage, Protected } from "@/components/app-routing"

/** petugas.<domain>: aplikasi ponsel Petugas Monitoring (juga dibungkus APK). */
const Login = lazy(() => import("@/pages/auth/petugas-login"))
const Methodology = lazy(() => import("@/pages/public/methodology"))
const FieldHome = lazy(() => import("@/pages/field/home"))
const FieldTasks = lazy(() => import("@/pages/field/tasks"))
const FieldHistory = lazy(() => import("@/pages/field/history"))
const FieldAccount = lazy(() => import("@/pages/field/account"))
const Input = lazy(() => import("@/pages/app/input"))
const Waste = lazy(() => import("@/pages/app/waste"))
const Mobility = lazy(() => import("@/pages/app/mobility"))
const Trees = lazy(() => import("@/pages/app/trees"))
const TreeDetail = lazy(() => import("@/pages/app/tree-detail"))
const Scan = lazy(() => import("@/pages/app/scan"))
const Calendar = lazy(() => import("@/pages/app/calendar"))

/** Tautan bawaan halaman bersama (/app/trees/12, notifikasi lama) → padanannya di aplikasi ini. */
function FromStaffPath() {
  const loc = useLocation()
  return <Navigate to={toFieldPath(loc.pathname) + loc.search} replace />
}
function Elsewhere() {
  const { pathname } = useLocation()
  if (pathname.startsWith("/field")) return <Navigate to={pathname.slice(6) || "/"} replace />
  if (/^\/(p|s|verify)\//.test(pathname) || ["/register", "/home", "/footprint"].some((p) => pathname.startsWith(p))) return <ExternalRedirect to="web" />
  return <Navigate to="/" replace />
}

export default function App() {
  return (
    <ErrorBoundary resetKey={useLocation().pathname}>
      <Suspense fallback={<div className="p-8"><PageSkeleton /></div>}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/handoff" element={<HandoffPage />} />
          <Route path="/methodology" element={<Methodology />} />
          <Route path="/app/*" element={<FromStaffPath />} />
          <Route element={<Protected><FieldShell /></Protected>}>
            <Route path="/" element={<FieldHome />} />
            <Route path="/tasks" element={<FieldTasks />} />
            <Route path="/history" element={<FieldHistory />} />
            <Route path="/account" element={<FieldAccount />} />
            <Route path="/input" element={<Input />} />
            <Route path="/waste" element={<Waste />} />
            <Route path="/mobility" element={<Mobility />} />
            <Route path="/trees" element={<Trees />} />
            <Route path="/trees/:id" element={<TreeDetail />} />
            <Route path="/scan" element={<Scan />} />
            <Route path="/calendar" element={<Calendar />} />
          </Route>
          <Route path="*" element={<Elsewhere />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}
