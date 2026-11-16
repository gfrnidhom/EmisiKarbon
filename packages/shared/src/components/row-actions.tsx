import { useState, type ReactNode } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Eye, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Field, Spinner } from "@/components/common"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { useOrg } from "@/lib/hooks"
import { tl } from "@/lib/i18n"

/** Hak akses data di dasbor admin:
 *  manage  = Admin (semua lembaga) atau Operator (lembaganya) → lihat, ubah, hapus
 *  admin   = khusus Admin platform (faktor emisi, jenis pohon, lembaga)
 *  Kepala Sekolah → hanya lihat. */
export function usePerm() {
  const { can } = useOrg()
  const { has } = useAuth()
  const admin = has("admin")
  const manage = admin || can("operator", "admin")
  return { manage, admin, readOnly: !manage }
}

/** Menu aksi baris: Lihat · Ubah · Hapus (dengan konfirmasi). Aksi yang tidak diizinkan tidak ditampilkan. */
export function RowActions({ onView, onEdit, del, extra }: {
  onView?: () => void
  onEdit?: () => void
  /** Hapus: endpoint + teks konfirmasi. `invalidate` = queryKey yang dimuat ulang. */
  del?: { path: string; title: string; description?: ReactNode; invalidate?: unknown[][]; onDone?: () => void }
  extra?: ReactNode
}) {
  const [confirm, setConfirm] = useState(false)
  const qc = useQueryClient()
  const remove = useMutation({
    mutationFn: () => api(del!.path, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(tl("Data dihapus", "Deleted"))
      setConfirm(false)
      for (const k of del?.invalidate ?? []) qc.invalidateQueries({ queryKey: k })
      del?.onDone?.()
    },
    onError: (e: Error) => toast.error(e.message),
  })
  // Buka dialog/panel sesudah menu benar-benar tertutup; bila langsung, klik penutup menu ikut menutup dialog yang baru terbuka.
  const later = (fn?: () => void) => fn && (() => setTimeout(fn, 120))
  if (!onView && !onEdit && !del && !extra) return null
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={tl("Aksi", "Actions")} onClick={(e) => e.stopPropagation()} />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44 rounded-xl p-1.5" onClick={(e) => e.stopPropagation()}>
          {onView && <DropdownMenuItem onClick={later(onView)} className="gap-2.5 rounded-lg"><Eye className="size-4" />{tl("Lihat detail", "View")}</DropdownMenuItem>}
          {onEdit && <DropdownMenuItem onClick={later(onEdit)} className="gap-2.5 rounded-lg"><Pencil className="size-4" />{tl("Ubah", "Edit")}</DropdownMenuItem>}
          {extra}
          {del && <>
            {(onView || onEdit || extra) && <DropdownMenuSeparator />}
            <DropdownMenuItem variant="destructive" onClick={later(() => setConfirm(true))} className="gap-2.5 rounded-lg"><Trash2 className="size-4" />{tl("Hapus", "Delete")}</DropdownMenuItem>
          </>}
        </DropdownMenuContent>
      </DropdownMenu>
      {del && (
        <AlertDialog open={confirm} onOpenChange={setConfirm}>
          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-destructive/10 text-destructive"><Trash2 /></AlertDialogMedia>
              <AlertDialogTitle>{del.title}</AlertDialogTitle>
              <AlertDialogDescription>{del.description ?? tl("Data akan dihapus permanen dan angka emisi dihitung ulang. Tindakan ini tercatat di log audit.", "This is permanent; emissions will be recalculated. The action is audit-logged.")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tl("Batal", "Cancel")}</AlertDialogCancel>
              <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>{remove.isPending && <Spinner />}{tl("Hapus", "Delete")}</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}

/** Panel "Lihat detail": daftar label → nilai. */
export function DetailSheet({ open, onOpenChange, title, description, rows, children }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; description?: ReactNode; rows: [ReactNode, ReactNode][]; children?: ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader><SheetTitle>{title}</SheetTitle>{description && <SheetDescription>{description}</SheetDescription>}</SheetHeader>
        <dl className="divide-y px-4">
          {rows.map(([k, v], i) => (
            <div key={i} className="flex items-start justify-between gap-4 py-2.5 text-sm">
              <dt className="shrink-0 text-muted-foreground">{k}</dt>
              <dd className="min-w-0 text-right font-medium break-words">{v ?? "—"}</dd>
            </div>
          ))}
        </dl>
        {children && <div className="px-4 pb-4">{children}</div>}
      </SheetContent>
    </Sheet>
  )
}

export type EditField = { key: string; label: string; type?: "text" | "number" | "date" | "textarea"; step?: string; hint?: string }

/** Dialog ubah sederhana untuk beberapa kolom. */
export function EditDialog({ open, onOpenChange, title, description, fields, initial, save, invalidate }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; description?: ReactNode
  fields: EditField[]; initial: Record<string, any>
  save: (values: Record<string, any>) => Promise<unknown>; invalidate?: unknown[][]
}) {
  const [v, setV] = useState<Record<string, any>>(initial)
  const qc = useQueryClient()
  const m = useMutation({
    mutationFn: () => save(Object.fromEntries(fields.map((f) => [f.key, f.type === "number" ? (v[f.key] === "" || v[f.key] == null ? null : Number(v[f.key])) : v[f.key]]))),
    onSuccess: () => { toast.success(tl("Perubahan disimpan", "Saved")); onOpenChange(false); for (const k of invalidate ?? []) qc.invalidateQueries({ queryKey: k }) },
    onError: (e: Error) => toast.error(e.message),
  })
  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) setV(initial); onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</DialogHeader>
        <form id="edit-form" className="grid gap-4" onSubmit={(e) => { e.preventDefault(); m.mutate() }}>
          {fields.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint}>
              {f.type === "textarea"
                ? <textarea rows={3} value={v[f.key] ?? ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
                : <Input type={f.type ?? "text"} step={f.step ?? (f.type === "number" ? "any" : undefined)} value={v[f.key] ?? ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />}
            </Field>
          ))}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tl("Batal", "Cancel")}</Button>
          <Button type="submit" form="edit-form" disabled={m.isPending}>{m.isPending && <Spinner />}{tl("Simpan", "Save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
