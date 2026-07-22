"use client"

import { useState } from "react"
import { Pause, Play, Ban, ShieldOff } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ResellerCard } from "./reseller-card"
import type { ResellerStatus } from "./reseller-table"

/** Blocos renderizáveis — permite mostrar a assinatura em "Cobrança" e a
 *  anonimização (LGPD) em "Avançado" sem duplicar o componente. */
export type ResellerActionSection = "status" | "cancel" | "anonymize"

const ALL_SECTIONS: ResellerActionSection[] = ["status", "cancel", "anonymize"]

interface ResellerActionButtonsProps {
  tenantId: string
  status: ResellerStatus
  isSuperAdmin?: boolean
  /** Política de cancelamento da unidade — usada como padrão do destino dos alunos. */
  keepStudentsActive?: boolean | null
  show?: ResellerActionSection[]
  onChanged?: () => void
}

export function ResellerActionButtons({
  tenantId,
  status,
  isSuperAdmin = false,
  keepStudentsActive = null,
  show = ALL_SECTIONS,
  onChanged,
}: ResellerActionButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [suspendOpen, setSuspendOpen] = useState(false)
  // Destino dos alunos ao cancelar. Pré-seleciona pela política já configurada
  // da unidade (`cancellationPolicy.keepStudentsActive`, default manter).
  const [blockStudents, setBlockStudents] = useState(keepStudentsActive === false)
  const [deleteOpenCharges, setDeleteOpenCharges] = useState(true)
  const [anonOpen, setAnonOpen] = useState(false)
  const [anonConfirm, setAnonConfirm] = useState("")

  async function setStatus(next: ResellerStatus) {
    setLoading(next)
    setError(null)
    try {
      const res = await fetch(`/api/admin/revendedores/${tenantId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao atualizar status")
        return
      }
      // Suspender/reativar mexe no acesso dos ALUNOS, não só no da unidade.
      // Dizer quantos foram afetados é o que torna a ação verificável — sem
      // isso o admin não tem como saber se o corte realmente aconteceu.
      const blocked = body.data?.studentsBlocked ?? 0
      const unblocked = body.data?.studentsUnblocked ?? 0
      if (blocked > 0) {
        toast.success(`Unidade suspensa · ${blocked} aluno(s) bloqueado(s) na plataforma de aulas`)
      } else if (unblocked > 0) {
        toast.success(`Unidade reativada · ${unblocked} aluno(s) desbloqueado(s)`)
      }
      onChanged?.()
    } catch {
      setError("Erro de rede ao atualizar status")
    } finally {
      setLoading(null)
    }
  }

  async function cancel() {
    setLoading("CANCEL")
    setError(null)
    try {
      const res = await fetch(`/api/admin/revendedores/${tenantId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockStudents, deleteOpenCharges }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao cancelar assinatura")
        return
      }
      setCancelOpen(false)
      const { deletedCharges = 0, studentsBlocked = 0, warnings = [] } =
        (body.data ?? {}) as {
          deletedCharges?: number
          studentsBlocked?: number
          warnings?: string[]
        }
      const parts = ["Assinatura cancelada"]
      if (deletedCharges > 0) parts.push(`${deletedCharges} cobrança(s) apagada(s)`)
      if (studentsBlocked > 0) parts.push(`${studentsBlocked} aluno(s) bloqueado(s)`)
      toast.success(parts.join(" · "))
      // Falhas parciais (uma cobrança que não apagou, alunos que não bloquearam)
      // não podem sumir: o admin precisa saber o que ficou pendente.
      for (const w of warnings) toast.warning(w)
      onChanged?.()
    } catch {
      setError("Erro de rede ao cancelar assinatura")
    } finally {
      setLoading(null)
    }
  }

  async function anonymize() {
    if (anonConfirm !== "ANONIMIZAR") return
    setLoading("ANONYMIZE")
    setError(null)
    try {
      const res = await fetch(`/api/admin/revendedores/${tenantId}/anonimizar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "ANONIMIZAR" }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const message = body.error ?? "Falha ao anonimizar conta"
        setError(message)
        toast.error(message)
        return
      }
      toast.success(body.data?.message ?? "Conta anonimizada com sucesso")
      setAnonOpen(false)
      setAnonConfirm("")
      onChanged?.()
    } catch {
      const message = "Erro de rede ao anonimizar conta"
      setError(message)
      toast.error(message)
    } finally {
      setLoading(null)
    }
  }

  const isCancelled = status === "CANCELLED"
  const showStatus = show.includes("status")
  const showCancel = show.includes("cancel")
  const showAnonymize = show.includes("anonymize") && isSuperAdmin
  const showRiskZone = showCancel || showAnonymize

  return (
    <div className="space-y-6">
      {showStatus && (
        <ResellerCard
          title="Status da assinatura"
          description="Suspenda ou reative o acesso da unidade e dos alunos dela."
        >
          {error && (
            <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

          {/* Cancelar NÃO pode ser uma via de mão única. Recriar a assinatura na
              aba Financeiro não tira a unidade de CANCELLED (o status é
              independente da cobrança), então sem este aviso + o botão Ativar
              habilitado o admin recria a cobrança e a vitrine segue fora do ar
              sem nenhuma pista do que falta fazer. */}
          {isCancelled && (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Unidade cancelada: a vitrine está fora do ar e o painel bloqueado.
              Recriar a cobrança no Financeiro <strong>não</strong> reabre a
              unidade — use <strong>Reativar</strong> abaixo.
            </p>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="flex-1"
              disabled={isCancelled || loading !== null || status === "SUSPENDED"}
              onClick={() => setSuspendOpen(true)}
            >
              <Pause className="h-4 w-4" />
              {loading === "SUSPENDED" ? "Aguarde..." : "Suspender"}
            </Button>
            <Button
              className="flex-1 bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
              disabled={loading !== null || status === "ACTIVE"}
              onClick={() => setStatus("ACTIVE")}
            >
              <Play className="h-4 w-4" />
              {loading === "ACTIVE"
                ? "Aguarde..."
                : isCancelled
                  ? "Reativar unidade"
                  : "Ativar"}
            </Button>
          </div>

          {isCancelled && (
            <p className="mt-2 text-[11px] text-gray-500">
              Reativar apenas reabre o acesso. Confira antes, no Financeiro, se a
              assinatura e a próxima cobrança estão como você espera.
            </p>
          )}
        </ResellerCard>
      )}

      {/* Suspender corta o acesso dos ALUNOS também — merece confirmação, do
          mesmo jeito que o cancelamento. */}
      <AlertDialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspender a unidade?</AlertDialogTitle>
            <AlertDialogDescription>
              A vitrine sai do ar e o painel da unidade fica bloqueado.{" "}
              <strong>Os alunos dela perdem o acesso às aulas</strong> na
              plataforma — as matrículas ativas passam a suspensas. Reativar a
              unidade devolve o acesso de todos eles.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setSuspendOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-amber-500 text-white hover:bg-amber-600"
              disabled={loading !== null}
              onClick={() => {
                setSuspendOpen(false)
                void setStatus("SUSPENDED")
              }}
            >
              <Pause className="h-4 w-4" />
              Suspender unidade e alunos
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Zona de risco — operacoes destrutivas/irreversiveis */}
      {showRiskZone && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-6">
          <h3 className="text-sm font-semibold text-rose-700">Zona de risco</h3>
          <p className="mt-1 text-xs text-rose-600/80">
            Operações destrutivas. Confirme com atenção.
          </p>

          {!showStatus && error && (
            <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

          <div className="mt-4 space-y-4">
            {showCancel && (
              <div className="flex flex-col gap-2 rounded-lg border border-rose-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    Cancelar assinatura
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Encerra as assinaturas no Asaas (inclusive a promocional),
                    apaga as mensalidades em aberto e marca a unidade como
                    cancelada.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="border-rose-200 text-rose-600 hover:bg-rose-50"
                  disabled={isCancelled || loading !== null}
                  onClick={() => setCancelOpen(true)}
                >
                  <Ban className="h-4 w-4" />
                  {isCancelled ? "Já cancelada" : "Cancelar assinatura"}
                </Button>
              </div>
            )}

            {showAnonymize && (
              <div className="flex flex-col gap-2 rounded-lg border border-rose-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    Anonimizar conta (LGPD)
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Ação irreversível: remove a PII e desativa o login. Registros
                    de negócio são preservados.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="border-rose-300 text-rose-700 hover:bg-rose-50"
                  disabled={isCancelled || loading !== null}
                  onClick={() => {
                    setAnonConfirm("")
                    setAnonOpen(true)
                  }}
                >
                  <ShieldOff className="h-4 w-4" />
                  Anonimizar
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmacao: cancelar assinatura */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar assinatura?</AlertDialogTitle>
            <AlertDialogDescription>
              As assinaturas no Asaas (regular e promocional) serão encerradas e
              a unidade passa a CANCELADA. Escolha abaixo o que fazer com os
              alunos e com as mensalidades já emitidas.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Alunos da unidade
              </legend>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 p-3 text-sm hover:bg-gray-50">
                <input
                  type="radio"
                  name="blockStudents"
                  className="mt-0.5"
                  checked={!blockStudents}
                  onChange={() => setBlockStudents(false)}
                />
                <span>
                  <span className="font-medium text-gray-800">
                    Manter o acesso dos alunos
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-500">
                    Eles continuam estudando na plataforma de aulas. Só a
                    cobrança da unidade para.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-rose-200 p-3 text-sm hover:bg-rose-50">
                <input
                  type="radio"
                  name="blockStudents"
                  className="mt-0.5"
                  checked={blockStudents}
                  onChange={() => setBlockStudents(true)}
                />
                <span>
                  <span className="font-medium text-rose-700">
                    Bloquear os alunos na plataforma
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-500">
                    Todos os alunos da unidade perdem o acesso às aulas
                    imediatamente.
                  </span>
                </span>
              </label>
              {keepStudentsActive !== null && (
                <p className="text-[11px] text-gray-400">
                  Política configurada nesta unidade:{" "}
                  {keepStudentsActive
                    ? "manter alunos ativos"
                    : "bloquear alunos"}
                  .
                </p>
              )}
            </fieldset>

            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 p-3 text-sm hover:bg-gray-50">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={deleteOpenCharges}
                onChange={(e) => setDeleteOpenCharges(e.target.checked)}
              />
              <span>
                <span className="font-medium text-gray-800">
                  Apagar mensalidades em aberto
                </span>
                <span className="mt-0.5 block text-xs text-gray-500">
                  Cancela no Asaas os boletos/PIX pendentes ou vencidos, para a
                  unidade não continuar recebendo cobrança. Desmarque para
                  manter a dívida cobrável.
                </span>
              </span>
            </label>
          </div>

          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelOpen(false)}
              disabled={loading === "CANCEL"}
            >
              Voltar
            </Button>
            <Button
              className="border-rose-200 bg-rose-600 text-white hover:bg-rose-700"
              onClick={cancel}
              disabled={loading === "CANCEL"}
            >
              {loading === "CANCEL" ? "Cancelando..." : "Cancelar assinatura"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmacao tipada: anonimizar (irreversivel) */}
      <AlertDialog
        open={anonOpen}
        onOpenChange={(o) => {
          setAnonOpen(o)
          if (!o) setAnonConfirm("")
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anonimizar conta (irreversível)</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove os dados pessoais (PII) do revendedor e desativa
              o login. Para confirmar, digite{" "}
              <span className="font-mono font-semibold">ANONIMIZAR</span> abaixo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={anonConfirm}
            onChange={(e) => setAnonConfirm(e.target.value)}
            placeholder="ANONIMIZAR"
            autoComplete="off"
            className="font-mono"
          />
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAnonOpen(false)
                setAnonConfirm("")
              }}
              disabled={loading === "ANONYMIZE"}
            >
              Voltar
            </Button>
            <Button
              className="border-rose-200 bg-rose-600 text-white hover:bg-rose-700"
              onClick={anonymize}
              disabled={anonConfirm !== "ANONIMIZAR" || loading === "ANONYMIZE"}
            >
              {loading === "ANONYMIZE" ? "Anonimizando..." : "Anonimizar conta"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
