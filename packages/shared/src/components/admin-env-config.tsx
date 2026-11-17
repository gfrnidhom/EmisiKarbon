import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Field, Spinner } from "@/components/common"
import { api } from "@/lib/api"
import { tl } from "@/lib/i18n"

/**
 * Kartu pengaturan variabel sistem & lingkungan (ENV) — HANYA untuk Admin.
 * Nilai disimpan di tabel `settings` (`env_config`) dan langsung diterapkan ke `CONFIG` di server.
 */
export function AdminEnvConfigCard() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<any>("/admin/settings"),
  })
  const [envCfg, setEnvCfg] = useState<any>(null)
  const [showSecret, setShowSecret] = useState(false)

  useEffect(() => {
    if (data?.env_config) setEnvCfg(data.env_config)
  }, [data?.env_config])

  const save = useMutation({
    mutationFn: () => api<any>("/admin/settings", { method: "PUT", json: { env_config: envCfg } }),
    onSuccess: (r) => {
      if (r?.env_config) setEnvCfg(r.env_config)
      toast.success(tl("Konfigurasi sistem (ENV) disimpan & langsung aktif", "System (ENV) configuration saved & active"))
      qc.invalidateQueries({ queryKey: ["settings"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (isLoading || !envCfg) return null

  return (
    <Card className="border-primary/25">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            {tl("Konfigurasi Sistem & Lingkungan (ENV)", "System & Environment Configuration (ENV)")}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{tl("Khusus Admin", "Admin Only")}</Badge>
            <Badge variant="outline">DB: {String(envCfg.DIALECT ?? "postgres").toUpperCase()}</Badge>
            <Badge variant="outline">Port: {envCfg.PORT ?? 3000}</Badge>
            <Badge variant="outline">{envCfg.NODE_ENV ?? "development"}</Badge>
          </div>
        </div>
        <CardDescription>
          {tl(
            "Pengaturan kunci API AI, domain host, APK Android, dan keamanan. Perubahan langsung aktif di server tanpa perlu ubah file .env.",
            "Configure AI API key, domain hosts, Android APK, and security. Changes take effect immediately without editing .env files."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        <Field
          label={tl("GEMINI_API_KEY (AI Vision Denah GIS)", "GEMINI_API_KEY (AI Vision GIS)")}
          hint={tl("Opsional — bila kosong, Peta Aset memakai AI Vision Vektorisasi lokal", "Optional — if empty, Asset Map uses local AI Vision Vectorizer")}
          className="sm:col-span-2"
        >
          <div className="flex gap-2">
            <Input
              type={showSecret ? "text" : "password"}
              value={envCfg.GEMINI_API_KEY ?? ""}
              placeholder="AIzaSy..."
              onChange={(e) => setEnvCfg({ ...envCfg, GEMINI_API_KEY: e.target.value })}
            />
            <Button type="button" variant="outline" size="icon" onClick={() => setShowSecret(!showSecret)} title={tl("Tampilkan/Sembunyikan", "Show/Hide")}>
              {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          </div>
        </Field>

        <Field label={tl("ADMIN_HOST (Domain aplikasi Admin)", "ADMIN_HOST (Admin app domain)")} hint={tl("Kosongkan untuk otomatis admin.<domain>", "Leave empty for default admin.<domain>")}>
          <Input value={envCfg.ADMIN_HOST ?? ""} placeholder="admin.sekolahlestari.id" onChange={(e) => setEnvCfg({ ...envCfg, ADMIN_HOST: e.target.value })} />
        </Field>

        <Field label={tl("FIELD_HOST (Domain aplikasi Petugas)", "FIELD_HOST (Field app domain)")} hint={tl("Kosongkan untuk otomatis petugas.<domain>", "Leave empty for default petugas.<domain>")}>
          <Input value={envCfg.FIELD_HOST ?? ""} placeholder="petugas.sekolahlestari.id" onChange={(e) => setEnvCfg({ ...envCfg, FIELD_HOST: e.target.value })} />
        </Field>

        <Field label={tl("ANDROID_PACKAGE (Paket APK Petugas)", "ANDROID_PACKAGE (Field APK package)")}>
          <Input value={envCfg.ANDROID_PACKAGE ?? ""} placeholder="id.sekolahlestari.petugas" onChange={(e) => setEnvCfg({ ...envCfg, ANDROID_PACKAGE: e.target.value })} />
        </Field>

        <Field label={tl("ANDROID_SHA256 (Sidik jari sertifikat APK)", "ANDROID_SHA256 (APK certificate fingerprint)")} hint={tl("Pisahkan dengan koma bila lebih dari satu", "Comma-separated if multiple")}>
          <Input value={envCfg.ANDROID_SHA256 ?? ""} placeholder="AA:BB:CC:..." onChange={(e) => setEnvCfg({ ...envCfg, ANDROID_SHA256: e.target.value })} />
        </Field>

        <Field label={tl("JWT_SECRET (Kunci token sesi)", "JWT_SECRET (Session token key)")}>
          <Input type={showSecret ? "text" : "password"} value={envCfg.JWT_SECRET ?? ""} onChange={(e) => setEnvCfg({ ...envCfg, JWT_SECRET: e.target.value })} />
        </Field>

        <Field label={tl("QR_SECRET (Kunci tanda tangan QR)", "QR_SECRET (QR HMAC key)")}>
          <Input type={showSecret ? "text" : "password"} value={envCfg.QR_SECRET ?? ""} onChange={(e) => setEnvCfg({ ...envCfg, QR_SECRET: e.target.value })} />
        </Field>

        <Field label={tl("DEMO_PASSWORD (Kata sandi akun demo)", "DEMO_PASSWORD (Demo account password)")}>
          <Input value={envCfg.DEMO_PASSWORD ?? ""} onChange={(e) => setEnvCfg({ ...envCfg, DEMO_PASSWORD: e.target.value })} />
        </Field>

        <Field label={tl("SIM_URL (URL simulator IoT)", "SIM_URL (IoT simulator URL)")}>
          <Input value={envCfg.SIM_URL ?? ""} placeholder="http://localhost:3000" onChange={(e) => setEnvCfg({ ...envCfg, SIM_URL: e.target.value })} />
        </Field>

        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={!!envCfg.DEV_SHOW_OTP} onCheckedChange={(c) => setEnvCfg({ ...envCfg, DEV_SHOW_OTP: !!c })} />
            {tl("DEV_SHOW_OTP — Tampilkan kode OTP pada mode pengembangan", "DEV_SHOW_OTP — Show OTP code in development mode")}
          </label>
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Spinner /> : <KeyRound />}
          {tl("Simpan Konfigurasi ENV", "Save ENV Configuration")}
        </Button>
      </CardFooter>
    </Card>
  )
}
