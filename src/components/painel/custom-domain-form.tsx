"use client"

import { useState } from "react"
import { Plus, Trash2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StatusBadge, type BadgeTone } from "@/components/shared/status-badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DnsInstructions, type DnsRecord } from "./dns-instructions"

export type DomainStatus = "NONE" | "PENDING" | "ACTIVE" | "ERROR"

const statusTone: Record<DomainStatus, BadgeTone> = {
  NONE: "neutral",
  PENDING: "warning",
  ACTIVE: "success",
  ERROR: "danger",
}

const statusLabel: Record<DomainStatus, string> = {
  NONE: "Não configurado",
  PENDING: "Pendente",
  ACTIVE: "Ativo",
  ERROR: "Erro",
}

interface CustomDomainFormProps {
  customDomain: string | null
  status: DomainStatus
  dnsRecords: DnsRecord[]
  onAdd: (domain: string) => Promise<void>
  onVerify: () => Promise<void>
  onRemove: () => Promise<void>
}

export function CustomDomainForm({
  customDomain,
  status,
  dnsRecords,
  onAdd,
  onVerify,
  onRemove,
}: CustomDomainFormProps) {
  const [input, setInput] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd() {
    const domain = input.trim().toLowerCase()
    if (!domain) return
    setSubmitting(true)
    setError(null)
    try {
      await onAdd(domain)
      setInput("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao adicionar domínio")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerify() {
    setVerifying(true)
    setError(null)
    try {
      await onVerify()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao verificar domínio")
    } finally {
      setVerifying(false)
    }
  }

  async function handleRemove() {
    setRemoving(true)
    setError(null)
    try {
      await onRemove()
      setShowRemoveConfirm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover domínio")
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div
      data-tour="dominio:custom"
      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
        Domínio personalizado
      </h3>
      <p className="mt-1 text-xs text-gray-600">
        Use o seu próprio endereço (ex: <code>suaempresa.com.br</code>) para
        fortalecer a marca na vitrine.
      </p>

      {!customDomain && (
        <div className="mt-5">
          <Label htmlFor="custom-domain">Adicionar novo domínio</Label>
          <div className="mt-1.5 flex gap-2">
            <Input
              id="custom-domain"
              placeholder="meudominio.com.br"
              className="flex-1"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={submitting}
            />
            <Button
              type="button"
              className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
              onClick={handleAdd}
              disabled={submitting || input.trim().length === 0}
            >
              <Plus className="mr-2 h-4 w-4" />
              {submitting ? "Adicionando..." : "Adicionar"}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {customDomain && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-mono text-sm font-semibold text-[var(--color-pmb-green-900)]">
                {customDomain}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <StatusBadge tone={statusTone[status]}>
                  {statusLabel[status]}
                </StatusBadge>
              </div>
              {status === "PENDING" && (
                <p className="mt-2 max-w-md text-xs text-amber-700">
                  Configure os 2 registros DNS abaixo no seu provedor de domínio.
                  Enquanto não estiverem apontados, a vitrine continua no
                  subdomínio oficial. Depois de configurar, clique em{" "}
                  <strong>Verificar</strong> — o domínio é aplicado assim que os
                  dois registros forem confirmados.
                </p>
              )}
              {status === "ACTIVE" && (
                <p className="mt-2 max-w-md text-xs text-green-700">
                  Domínio aplicado — sua vitrine já responde neste endereço.
                </p>
              )}
              {status === "ERROR" && (
                <p className="mt-2 max-w-md text-xs text-red-700">
                  Não foi possível checar o apontamento agora. Tente novamente em
                  instantes com o botão <strong>Verificar</strong>.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleVerify}
                disabled={verifying}
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                {verifying ? "Verificando..." : "Verificar"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setShowRemoveConfirm(true)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Remover
              </Button>
            </div>
          </div>

          <AlertDialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover domínio personalizado</AlertDialogTitle>
                <AlertDialogDescription>
                  A vitrine ficará indisponível neste endereço até que um novo
                  domínio seja conectado. O subdomínio oficial continua
                  funcionando.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  disabled={removing}
                  onClick={(e) => {
                    e.preventDefault()
                    handleRemove()
                  }}
                >
                  {removing ? "Removendo..." : "Confirmar remoção"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {customDomain && dnsRecords.length > 0 && (
        <div className="mt-6">
          <DnsInstructions records={dnsRecords} />
        </div>
      )}
    </div>
  )
}
