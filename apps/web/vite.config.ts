import { appConfig } from "../../packages/shared/vite.base"

// Domain utama: beranda, metodologi, survei tanpa login, QR pohon, cek keaslian rapor, jejak karbon pribadi
export default appConfig({
  app: "web", port: 5173, dir: __dirname,
  manifest: {
    name: "Sekolah Lestari — Jejak Karbon Sekolah", short_name: "Sekolah Lestari",
    description: "Hitung jejak karbon pribadi & lihat aksi iklim sekolah.",
    shortcuts: [{ name: "Hitung jejak karbon", url: "/footprint/calculate", icons: [{ src: "pwa-192.png", sizes: "192x192" }] }],
  },
})
