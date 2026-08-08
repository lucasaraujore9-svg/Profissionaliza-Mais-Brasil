"use client"

import { useState, useEffect } from "react"
import { AlertTriangle, Ban } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { ResellerRow } from "./reseller-table"

/**
 * Cancelamento em lote das unidades que nunca pagaram.
 *
 * Só aparece no filtro "Nunca ativou" e só para quem tem `unidades.governanca`
 * — a mesma permissão do cancelamento individual, porque é a mesma ação.
 *
 * A seleção é explícita (com "selecionar todas") em vez de um botão único que
 * aplica em tudo: quase sempre há uma ou outra unidade em negociação que o dono
 * quer deixar de fora, e um lote destrutivo sem curadoria não dá essa chance.
 */
export function ResellerBulkCancel({
  rows,
  onDone,
}: {
  rows: ResellerRow[]
  onDone: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [running, setRunning] = useState(false)

  // Só as SUSPENSAS podem ser canceladas; as já canceladas continuam na lista
  // (é o mesmo balde) mas não são alvo.
  const canceláveis = rows.filter((r) => r.status === "SUSPENDED")

  // A lista muda quando o filtro/busca muda — manter ids de linhas que saíram
  // da tela faria o lote agir sobre o que ninguém está vendo.
  useEffect(() => {
    setSelected((prev) => {
      const vivos = new Set(canceláveis.map((r) => r.id))
      const next = new Set([...prev].filter((id) => vivos.has(id)))
      return next.size === prev.size ? prev : next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  if (canceláveis.length === 0) return null

  const todasMarcadas = selected.size === canceláveis.length
  const toggleTodas = () =>
    setSelected(todasMarcadas ? new Set() : new Set(canceláveis.map((r) => r.id)))

  async function cancelar() {
    setRunning(true)
    try {
      const res = await fetch("/api/admin/revendedores/cancelar-lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantIds: [...selected] }),
      })
      const body = await res.json()
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao cancelar em lote")
        return
      }
      const d = body.data as {
        cancelled: number
        failed: { slug: string; error: string }[]
        ignored: number
        studentsBlocked: number
        warnings: string[]
      }

      const partes = [`${d.cancelled} unidade(s) cancelada(s)`]
      if (d.studentsBlocked > 0) partes.push(`${d.studentsBlocked} aluno(s) bloqueado(s)`)
      toast.success(partes.join(" · "))

      // Falha parcial NÃO pode sumir: o admin precisa saber quais ficaram.
      for (const f of d.failed) toast.error(`${f.slug}: ${f.error}`)
      if (d.ignored > 0) {
        toast.warning(
          `${d.ignored} unidade(s) não se qualificavam mais — já canceladas ou com pagamento registrado.`,
        )
      }
      for (const w of d.warnings) toast.warning(w)

      setSelected(new Set())
      setConfirmOpen(false)
      onDone()
    } catch {
      toast.error("Erro de rede ao cancelar em lote")
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-900">
            Cancelar unidades que nunca pagaram
          </p>
          <p className="mt-1 text-xs text-amber-800">
            {canceláveis.length} unidade(s) suspensa(s) sem nenhuma mensalidade
            paga. Cancelar <strong>não altera o churn</strong> — elas já ficam
            fora da conta por nunca terem sido clientes pagantes. Os alunos de
            cada unidade seguem a política de cancelamento dela.
          </p>
        </div>
      </div>

      <div className="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-amber-200 bg-white p-2">
        <label className="flex items-center gap-2 border-b border-gray-100 px-2 py-1.5 text-xs font-semibold">
          <input
            type="checkbox"
            checked={todasMarcadas}
            onChange={toggleTodas}
            className="h-3.5 w-3.5"
          />
          Selecionar todas ({canceláveis.length})
        </label>
        {canceláveis.map((r) => (
          <label
            key={r.id}
            className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={selected.has(r.id)}
              onChange={() =>
                setSelected((prev) => {
                  const next = new Set(prev)
                  if (next.has(r.id)) next.delete(r.id)
                  else next.add(r.id)
                  return next
                })
              }
              className="h-3.5 w-3.5"
            />
            <span className="font-medium">{r.name}</span>
            <span className="text-gray-500">{r.slug}</span>
            <span className="ml-auto text-gray-400">
              criada em {new Date(r.createdAt).toLocaleDateString("pt-BR")}
            </span>
          </label>
        ))}
      </div>

      <div className="mt-3 flex justify-end">
        <Button
          className="border-rose-200 bg-rose-600 text-white hover:bg-rose-700"
          disabled={selected.size === 0 || running}
          onClick={() => setConfirmOpen(true)}
        >
          <Ban className="mr-1.5 h-3.5 w-3.5" />
          Cancelar {selected.size} selecionada(s)
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !o && !running && setConfirmOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar {selected.size} unidade(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              As assinaturas no Asaas serão canceladas e as mensalidades em
              aberto apagadas. A vitrine de cada unidade sai do ar e o painel
              fica bloqueado. Os alunos seguem a política de cancelamento de cada
              unidade. Esta ação fica registrada na auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={running}
            >
              Voltar
            </Button>
            <Button
              className="border-rose-200 bg-rose-600 text-white hover:bg-rose-700"
              onClick={cancelar}
              disabled={running}
            >
              {running ? "Cancelando..." : "Cancelar unidades"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
