import path from "path"
import { defineConfig, type UserConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { VitePWA, type ManifestOptions } from "vite-plugin-pwa"

/** Konfigurasi Vite bersama untuk apps/web, apps/admin, apps/petugas. */
export function appConfig(opts: { app: "web" | "admin" | "petugas"; port: number; dir: string; manifest: Partial<ManifestOptions> }): UserConfig {
  const shared = path.resolve(__dirname, "src")
  return defineConfig({
    root: opts.dir,
    publicDir: path.resolve(__dirname, "public"),
    define: { __APP__: JSON.stringify(opts.app) },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.svg", "apple-touch-icon.png"],
        manifest: {
          lang: "id", theme_color: "#0f8a5f", background_color: "#f7fbf8", display: "standalone", display_override: ["standalone", "minimal-ui"],
          start_url: "/", scope: "/", id: "/", categories: ["education", "productivity", "utilities"],
          icons: [
            { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
            { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
            { src: "pwa-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
          ...opts.manifest,
        },
        workbox: {
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api/, /^\/\.well-known/],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          runtimeCaching: [
            { urlPattern: ({ url }) => url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/auth"), method: "GET", handler: "NetworkFirst", options: { cacheName: "api", networkTimeoutSeconds: 6, expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 7 } } },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    build: {
      outDir: path.resolve(opts.dir, "dist"),
      emptyOutDir: true,
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (!id.includes("node_modules")) return
            if (id.includes("xlsx")) return "xlsx"
            if (id.includes("recharts") || id.includes("d3-")) return "charts"
            if (id.includes("qr-scanner")) return "scanner"
            if (id.includes("@base-ui") || id.includes("react")) return "vendor"
          },
        },
      },
    },
    resolve: { alias: { "@": shared } },
    server: { port: opts.port, strictPort: true, host: true, proxy: { "/api": "http://localhost:3000" }, fs: { allow: [path.resolve(__dirname, "../..")] } },
  })
}
