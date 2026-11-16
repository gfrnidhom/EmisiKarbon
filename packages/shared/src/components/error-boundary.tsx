import { Component, type ReactNode } from "react"
import { AlertTriangle, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { t } from "@/lib/i18n"

/** Mencegah layar kosong: galat render pada satu halaman ditampilkan sebagai kartu, menu tetap bisa dipakai. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: unknown) { console.error("[ErrorBoundary]", error, info) }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto mt-10 flex max-w-lg flex-col items-center gap-4 rounded-2xl border border-destructive/25 bg-destructive/5 p-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"><AlertTriangle className="size-6" /></span>
        <div>
          <p className="text-lg font-semibold">{t("Halaman ini gagal ditampilkan")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("Menu lain tetap bisa dipakai. Detail galat:")}</p>
          <code className="mt-2 block rounded-lg bg-muted px-3 py-2 text-left text-xs break-all">{this.state.error.message}</code>
        </div>
        <Button variant="outline" onClick={() => location.reload()}><RotateCcw /> {t("Muat ulang")}</Button>
      </div>
    )
  }
}
