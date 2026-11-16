import { appConfig } from "../../packages/shared/vite.base"

// admin.<domain>: Admin, Operator, Kepala Sekolah
export default appConfig({
  app: "admin", port: 5174, dir: __dirname,
  manifest: {
    name: "Sekolah Lestari Admin — Dashboard Emisi Karbon", short_name: "SL Admin",
    description: "Dasbor emisi karbon sekolah untuk Admin, Operator & Kepala Sekolah.",
    shortcuts: [
      { name: "Persetujuan", url: "/approvals", icons: [{ src: "pwa-192.png", sizes: "192x192" }] },
      { name: "Rapor Karbon", url: "/app/carbon", icons: [{ src: "pwa-192.png", sizes: "192x192" }] },
    ],
  },
})
