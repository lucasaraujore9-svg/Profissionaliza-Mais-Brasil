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

interface ResellerActionButtonsProps {
  tenantId: string
  status: ResellerStatus
  isSuperAdmin?: boolean
  onChanged?: () => void
}

export function ResellerActionButtons({
  tenantId,
  status,
  isSuperAdmin = false,
  onChanged,
}: ResellerActionButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
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
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao cancelar assinatura")
        return
      }
      setCancelOpen(false)
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

  return (
    <div className="space-y-6">
      <ResellerCard
        title="Status da assinatura"
        description="Suspenda ou reative o acesso da unidade."
      >
        {error && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="flex-1"
            disabled={isCancelled || loading !== null || status === "SUSPENDED"}
            onClick={() => setStatus("SUSPENDED")}
          >
            <Pause className="h-4 w-4" />
            {loading === "SUSPENDED" ? "Aguarde..." : "Suspender"}
          </Button>
          <Button
            className="flex-1 bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
            disabled={isCancelled || loading !== null || status === "ACTIVE"}
            onClick={() => setStatus("ACTIVE")}
          >
            <Play className="h-4 w-4" />
            {loading === "ACTIVE" ? "Aguarde..." : "Ativar"}
          </Button>
        </div>
      </ResellerCard>

      {/* Zona de risco — operacoes destrutivas/irreversiveis */}
      <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-6">
        <h3 className="text-sm font-semibold text-rose-700">Zona de risco</h3>
        <p className="mt-1 text-xs text-rose-600/80">
          Operações destrutivas. Confirme com atenção.
        </p>

        <div className="mt-4 space-y-4">
          <div className="flex flex-col gap-2 rounded-lg border border-rose-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800">
                Cancelar assinatura
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                Encerra a cobrança e suspende o acesso da unidade.
              </p>
            </div>
            <Button
              variant="outline"
              className="border-rose-200 text-rose-600 hover:bg-rose-50"
              disabled={isCancelled || loading !== null}
              onClick={() => setCancelOpen(true)}
            >
              <Ban className="h-4 w-4" />
              Cancelar assinatura
            </Button>
          </div>

          {isSuperAdmin && (
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

      {/* Confirmacao: cancelar assinatura */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar assinatura?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar a assinatura deste revendedor? A
              cobrança será encerrada e o acesso suspenso.
            </AlertDialogDescription>
          </AlertDialogHeader>
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
