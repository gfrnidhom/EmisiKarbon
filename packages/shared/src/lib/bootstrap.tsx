import { StrictMode, type ComponentType } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { registerSW } from "virtual:pwa-register"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/lib/auth"

/** Titik awal bersama untuk apps/web, apps/admin, apps/petugas. */
export function mount(App: ComponentType) {
  registerSW({ immediate: true })
  // Setiap simpan/hapus data apa pun (energi, sampah, mobilitas, pohon, aset, bukti) memperbarui
  // kelengkapan Survei Awal → status langkah wizard & skor langsung berubah tanpa muat ulang halaman.
  // Hanya kueri yang sedang tampil yang dimuat ulang.
  const mutationCache: MutationCache = new MutationCache({
    onSuccess: () => { for (const key of ["baseline", "baselines", "data-phase"]) qc.invalidateQueries({ queryKey: [key] }) },
  })
  const qc: QueryClient = new QueryClient({
    mutationCache,
    defaultOptions: { queries: { staleTime: 30_000, retry: (n, e: any) => n < 1 && e?.status !== 403 && e?.status !== 404, refetchOnWindowFocus: false, networkMode: "offlineFirst" } },
  })
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <QueryClientProvider client={qc}>
          <BrowserRouter>
            <AuthProvider>
              <TooltipProvider>
                <App />
                <Toaster richColors position="top-center" />
              </TooltipProvider>
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </StrictMode>,
  )
}
