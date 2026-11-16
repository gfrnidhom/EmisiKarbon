/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
declare const __APP__: "web" | "admin" | "petugas"
interface ImportMetaEnv { readonly VITE_URL_WEB?: string; readonly VITE_URL_ADMIN?: string; readonly VITE_URL_PETUGAS?: string }
