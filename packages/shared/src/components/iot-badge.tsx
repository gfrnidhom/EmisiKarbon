import { Radio } from "lucide-react"
import { tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export type IotSources = Record<string, { devices: { name: string; connection: string }[] }> | null | undefined

/** Lencana seragam "Sensor IoT" untuk sumber yang datanya dibaca langsung dari alat ukur (mis. kWh meter listrik PLN). */
export function IotBadge({ source, iot, dark, className }: { source: string; iot: IotSources; dark?: boolean; className?: string }) {
  const s = iot?.[source]
  if (!s?.devices?.length) return null
  const online = s.devices.some((d) => d.connection === "terhubung")
  const title = tl(
    `Data dari sensor IoT: ${s.devices.map((d) => d.name).join(", ")} — ${online ? "terhubung" : "tidak terhubung, memakai data terakhir"}`,
    `Data from IoT sensor: ${s.devices.map((d) => d.name).join(", ")} — ${online ? "online" : "offline, using last data"}`,
  )
  return (
    <span title={title} className={cn(
      "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold whitespace-nowrap",
      dark ? "bg-emerald-300/20 text-emerald-100" : "bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/25 dark:text-emerald-300",
      className,
    )}>
      <span className={cn("size-1.5 rounded-full", online ? "animate-pulse bg-emerald-500" : "bg-amber-500")} />
      <Radio className="size-3" />{tl("Sensor IoT", "IoT sensor")}
    </span>
  )
}
