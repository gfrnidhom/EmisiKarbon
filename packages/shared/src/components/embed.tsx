import { createContext, useContext, type ReactNode } from "react"

/** Halaman yang ditanam di dalam wizard (mis. Survei Awal): judul jadi ringkas & konteks data diketahui. */
export type EmbedInfo = { embedded: boolean; context?: "baseline" }
const EmbedContext = createContext<EmbedInfo>({ embedded: false })
export const useEmbed = () => useContext(EmbedContext)
export function EmbedProvider({ context, children }: { context?: EmbedInfo["context"]; children: ReactNode }) {
  return <EmbedContext.Provider value={{ embedded: true, context }}>{children}</EmbedContext.Provider>
}
