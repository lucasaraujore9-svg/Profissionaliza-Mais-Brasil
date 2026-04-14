"use client"

import { useState } from "react"
import { Plus, CheckCircle2, Trash2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DnsInstructions, type DnsRecord } from "./dns-instructions"

export type DomainStatus = "NONE" | "PENDING" | "ACTIVE" | "ERROR"

const statusStyles: Record<DomainStatus, string> = {
  NONE: "bg-gray-100 text-gray-600",
  PENDING: "bg-yellow-100 text-yellow-700",
  ACTIVE: "bg-green-100 text-green-700",
  ERROR: "bg-red-100 text-red-700",
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
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-[#1A1A2E]">
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
              className="bg-blue-600 text-white hover:bg-blue-700"
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
              <div className="font-mono text-sm font-semibold text-[#1A1A2E]">
                {customDomain}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusStyles[status]}`}
                >
                  {statusLabel[status]}
                </span>
              </div>
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
                onClick={() => setShowRemoveConfirm((v) => !v)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Remover
              </Button>
            </div>
          </div>

          {showRemoveConfirm && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
              <strong className="block">
                Tem certeza que quer remover este domínio?
              </strong>
              <span>
                A vitrine ficará indisponível neste endereço até que um novo
                domínio seja conectado.
              </span>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowRemoveConfirm(false)}
                  disabled={removing}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="bg-red-600 text-white hover:bg-red-700"
                  onClick={handleRemove}
                  disabled={removing}
                >
                  <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                  {removing ? "Removendo..." : "Confirmar remoção"}
                </Button>
              </div>
            </div>
          )}
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
