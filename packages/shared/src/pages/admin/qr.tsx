import { useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Printer, QrCode } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, PageHeader, SimpleSelect, Spinner } from "@/components/common"
import { api } from "@/lib/api"
import { ASSET_META, AssetQrCard, useTreeCardPrint } from "@/components/tree-qr-card"
import { tl } from "@/lib/i18n"
import { t as tr } from "@/lib/i18n"

export default function QrBatch() {
  const orgs = useQuery({ queryKey: ["admin-orgs"], queryFn: () => api<any[]>("/admin/orgs") })
  const [f, setF] = useState({ org: "", type: "pohon", count: "12" })
  const [codes, setCodes] = useState<{ code: string; sig: string }[]>([])
  const [genType, setGenType] = useState("pohon")
  const gen = useMutation({ mutationFn: () => api<any[]>(`/orgs/${f.org}/qr-batch`, { method: "POST", json: { type: f.type, count: Number(f.count) } }), onSuccess: (r) => { setCodes(r); setGenType(f.type) } })
  const cards = useTreeCardPrint()
  const orgName = orgs.data?.find((o) => String(o.id) === f.org)?.name ?? ""
  return (
    <div className="space-y-8">
      <PageHeader icon={QrCode} title={tr("Generator batch QR")} description={tr("QR unik bertanda tangan HMAC + PDF label siap cetak. QR palsu/hasil edit ditolak saat scan.")}
        actions={codes.length > 0 && <Button onClick={() => cards.print(codes.map((c) => ({ code: c.code, qr_sig: c.sig, type: genType, status: "belum_dipasang" })), orgName)}><Printer /> {tl("Cetak kartu A4", "Print A4 cards")}</Button>} />
      <Card>
        <CardHeader><CardTitle>{tr("Buat batch")}</CardTitle><CardDescription>Label dipasang sebelum sensus; pengukuran pertama mengaktifkan aset.</CardDescription></CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-4">
          <Field label={tr("Lembaga")}><SimpleSelect value={f.org} onChange={(v) => setF({ ...f, org: v })} options={(orgs.data ?? []).map((o) => ({ value: String(o.id), label: o.name }))} /></Field>
          <Field label={tr("Jenis aset")}><SimpleSelect value={f.type} onChange={(v) => setF({ ...f, type: v })} options={Object.entries(ASSET_META).map(([v, m]) => ({ value: v, label: tl(m.id, m.en) }))} /></Field>
          <Field label={tr("Jumlah")}><Input type="number" min={1} max={200} value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} /></Field>
          <div className="flex items-end"><Button className="w-full" disabled={!f.org || gen.isPending} onClick={() => gen.mutate()}>{gen.isPending && <Spinner />} {tr("Buat QR")}</Button></div>
        </CardContent>
      </Card>
      {codes.length > 0 && (
        <div className="flex flex-wrap gap-4">
          {codes.map((c) => <AssetQrCard key={c.code} t={{ code: c.code, qr_sig: c.sig, type: genType, status: "belum_dipasang" }} orgName={orgName} />)}
        </div>
      )}
      {cards.node}
    </div>
  )
}
