"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface CouponItem {
  id: string
  code: string
  discountType: "PERCENTAGE" | "FIXED"
  discountValue: number
  maxUses: number | null
  usedCount: number
  validFrom: string
  validUntil: string
  isActive: boolean
  createdByName: string | null
}

// Cap individual (%) resolvido no servidor (User.maxDiscount; padrão 50 para
// PMB_SALES, 100 para SUPER_ADMIN). Ver src/lib/coupons/sales-cap.ts.
export function VendasCuponsClient({ cap }: { cap: number }) {
  const [items, setItems] = useState<CouponItem[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    code: "",
    discountType: "PERCENTAGE" as "PERCENTAGE" | "FIXED",
    discountValue: "",
    maxUses: "",
    validFrom: today,
    validUntil: today,
  })

  async function load() {
    setLoading(true)
    const res = await fetch("/api/admin/cupons")
    if (res.ok) {
      const body = await res.json()
      setItems(body.data)
    }
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/cupons")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled) return
        if (body?.data) setItems(body.data)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function submit() {
    const dv = Number(form.discountValue)
    if (!form.code || Number.isNaN(dv) || dv <= 0) {
      toast.error("Código e valor são obrigatórios")
      return
    }
    if (form.discountType === "PERCENTAGE" && dv > cap) {
      toast.error(`Percentual acima do seu cap (${cap}%)`)
      return
    }
    startTransition(async () => {
      const res = await fetch("/api/admin/cupons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          discountType: form.discountType,
          discountValue: dv,
          maxUses: form.maxUses ? Number(form.maxUses) : null,
          validFrom: new Date(form.validFrom).toISOString(),
          validUntil: new Date(form.validUntil).toISOString(),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? "Falha ao criar")
        return
      }
      toast.success("Cupom criado")
      setOpen(false)
      setForm({
        code: "",
        discountType: "PERCENTAGE",
        discountValue: "",
        maxUses: "",
        validFrom: today,
        validUntil: today,
      })
      void load()
    })
  }

  function toggle(id: string) {
    startTransition(async () => {
      const res = await fetch(`/api/admin/cupons/${id}/toggle`, { method: "PATCH" })
      if (!res.ok) {
        toast.error("Falha ao alternar")
        return
      }
      void load()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display text-[var(--color-pmb-green-900)]">
            Cupons da vitrine PMB
          </h1>
          <p className="text-sm text-muted-foreground">
            Válidos apenas na vitrine principal. Seu cap: {cap}%
          </p>
        </div>
        <Button
          onClick={() => setOpen(true)}
          className="bg-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-green-900)]"
        >
          <Plus className="h-4 w-4 mr-2" /> Novo cupom
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-[var(--color-pmb-mist)] text-left">
            <tr>
              <th className="px-4 py-3 font-semibold">Código</th>
              <th className="px-4 py-3 font-semibold">Desconto</th>
              <th className="px-4 py-3 font-semibold">Usos</th>
              <th className="px-4 py-3 font-semibold">Validade</th>
              <th className="px-4 py-3 font-semibold">Criador</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-3 font-mono">{c.code}</td>
                <td className="px-4 py-3">
                  {c.discountType === "PERCENTAGE"
                    ? `${c.discountValue}%`
                    : `R$ ${c.discountValue.toFixed(2)}`}
                </td>
                <td className="px-4 py-3">
                  {c.usedCount}
                  {c.maxUses !== null ? ` / ${c.maxUses}` : ""}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  até {new Date(c.validUntil).toLocaleDateString("pt-BR")}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {c.createdByName ?? "—"}
                </td>
                <td className="px-4 py-3">
                  {c.isActive ? (
                    <Badge className="bg-emerald-100 text-emerald-900">Ativo</Badge>
                  ) : (
                    <Badge variant="outline">Inativo</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggle(c.id)}
                    disabled={pending}
                  >
                    {c.isActive ? "Desativar" : "Ativar"}
                  </Button>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum cupom criado
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Novo cupom</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 p-4">
            <div>
              <Label>Código</Label>
              <Input
                value={form.code}
                onChange={(e) =>
                  setForm({ ...form, code: e.target.value.toUpperCase() })
                }
                placeholder="PROMO20"
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select
                value={form.discountType}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    discountType: (v ?? "PERCENTAGE") as "PERCENTAGE" | "FIXED",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENTAGE">Percentual (%)</SelectItem>
                  <SelectItem value="FIXED">Fixo (R$)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor (cap {cap}% para percentual)</Label>
              <Input
                type="number"
                value={form.discountValue}
                onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
              />
            </div>
            <div>
              <Label>Limite de usos (opcional)</Label>
              <Input
                type="number"
                value={form.maxUses}
                onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Válido de</Label>
                <Input
                  type="date"
                  value={form.validFrom}
                  onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                />
              </div>
              <div>
                <Label>Até</Label>
                <Input
                  type="date"
                  value={form.validUntil}
                  onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                />
              </div>
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button
              onClick={submit}
              disabled={pending}
              className="bg-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-green-900)]"
            >
              {pending ? "Criando…" : "Criar cupom"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
