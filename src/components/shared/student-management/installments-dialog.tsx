"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useCan } from "@/components/shared/permissions/permission-context"
import type { ManagementScope } from "./types"

interface Row {
  id: string
  number: number
  amount: number
  dueDate: string
  status: string
  paidAt: string | null
  gateway: string
}

const EDITABLE = new Set(["SCHEDULED", "GENERATED", "OVERDUE"])

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Agendada",
  GENERATED: "Em aberto",
  OVERDUE: "Vencida",
  PAID: "Paga",
  CANCELLED: "Cancelada",
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function fmtYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-")
  return `${d}/${m}/${y}`
}

/**
 * Parcelas do carnê de UMA matrícula, com renegociação parcela a parcela
 * (valor e vencimento) — como as faturas da unidade em /admin/revendedores.
 * A API é quem manda; `useCan` só esconde os campos de quem não pode alterar.
 */
export function InstallmentsButton({
  url,
  scope,
  courseName,
}: {
  url: string
  scope: ManagementScope
  courseName: string
}) {
  const router = useRouter()
  const alunosManage = useCan("alunos.manage")
  const vendasCreate = useCan("vendas.create")
  const unidadesManage = useCan("unidades.manage")
  const canEdit =
    scope.kind === "painel"
      ? alunosManage && vendasCreate
      : alunosManage || unidadesManage
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [draft, setDraft] = useState<Record<string, { amount: string; dueDate: string }>>({})
  const [saving, setSaving] = useState<string | null>(null)

  async function load() {
    setRows(null)
    const res = await fetch(url)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(body.error ?? "Falha ao carregar as parcelas")
      setOpen(false)
      return
    }
    const list = body.data as Row[]
    setRows(list)
    setDraft(
      Object.fromEntries(
        list.map((r) => [r.id, { amount: r.amount.toFixed(2).replace(".", ","), dueDate: r.dueDate }]),
      ),
    )
  }

  async function save(row: Row) {
    const d = draft[row.id]
    const amount = Number(d.amount.replace(/\./g, "").replace(",", "."))
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Valor inválido")
      return
    }
    setSaving(row.id)
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installmentId: row.id,
          ...(amount !== row.amount ? { amount } : {}),
          ...(d.dueDate !== row.dueDate ? { dueDate: d.dueDate } : {}),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao alterar a parcela")
        return
      }
      toast.success(`Parcela ${row.number} alterada`)
      if (body.data?.reissuePending) {
        toast.warning("O boleto novo será emitido automaticamente nas próximas horas.")
      }
      await load()
      router.refresh()
    } catch {
      toast.error("Erro de rede ao alterar a parcela")
    } finally {
      setSaving(null)
    }
  }

  const total = rows?.reduce((acc, r) => acc + (r.status === "CANCELLED" ? 0 : r.amount), 0) ?? 0

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true)
          void load()
        }}
      >
        Parcelas
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Parcelas do carnê</DialogTitle>
            <DialogDescription>
              {courseName}
              {canEdit &&
                " — altere o valor ou o vencimento de qualquer parcela em aberto. O boleto é atualizado no gateway na hora."}
            </DialogDescription>
          </DialogHeader>
          {!rows ? (
            <p className="py-6 text-center text-sm text-gray-500">Carregando…</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wider text-gray-500">
                    <th className="py-2 pr-2 font-semibold">Nº</th>
                    <th className="py-2 pr-2 font-semibold">Vencimento</th>
                    <th className="py-2 pr-2 font-semibold">Valor</th>
                    <th className="py-2 pr-2 font-semibold">Status</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => {
                    const editable = canEdit && EDITABLE.has(r.status)
                    const d = draft[r.id]
                    const dirty =
                      editable &&
                      (d.dueDate !== r.dueDate ||
                        Number(d.amount.replace(/\./g, "").replace(",", ".")) !== r.amount)
                    return (
                      <tr key={r.id}>
                        <td className="py-2 pr-2 font-medium">{r.number}</td>
                        <td className="py-2 pr-2">
                          {editable ? (
                            <Input
                              type="date"
                              className="h-8 w-36"
                              value={d.dueDate}
                              onChange={(e) =>
                                setDraft((s) => ({ ...s, [r.id]: { ...s[r.id], dueDate: e.target.value } }))
                              }
                            />
                          ) : (
                            fmtYmd(r.dueDate)
                          )}
                        </td>
                        <td className="py-2 pr-2 font-mono">
                          {editable ? (
                            <Input
                              inputMode="decimal"
                              className="h-8 w-28"
                              value={d.amount}
                              onChange={(e) =>
                                setDraft((s) => ({ ...s, [r.id]: { ...s[r.id], amount: e.target.value } }))
                              }
                            />
                          ) : (
                            brl(r.amount)
                          )}
                        </td>
                        <td className="py-2 pr-2 text-xs text-gray-600">
                          {STATUS_LABEL[r.status] ?? r.status}
                        </td>
                        <td className="py-2 text-right">
                          {dirty && (
                            <Button size="sm" disabled={saving !== null} onClick={() => save(r)}>
                              {saving === r.id ? "Salvando…" : "Salvar"}
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-right text-xs text-gray-600">
                Total do carnê: <span className="font-mono font-semibold">{brl(total)}</span>
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
