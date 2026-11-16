import { appConfig } from "../../packages/shared/vite.base"

// petugas.<domain>: aplikasi ponsel Petugas Monitoring — alamat yang dibungkus APK (android/build-apk.sh)
export default appConfig({
  app: "petugas", port: 5175, dir: __dirname,
  manifest: {
    name: "Sekolah Lestari Petugas", short_name: "SL Petugas",
    description: "Catat data bulanan, timbang sampah, ukur pohon & survei — Petugas Monitoring.",
    orientation: "portrait",
    shortcuts: [
      { name: "Scan & ukur pohon", url: "/scan", icons: [{ src: "pwa-192.png", sizes: "192x192" }] },
      { name: "Tugas pemantauan", url: "/tasks", icons: [{ src: "pwa-192.png", sizes: "192x192" }] },
    ],
  },
})
