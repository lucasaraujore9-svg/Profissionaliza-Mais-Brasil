"use client"

import { useState } from "react"
import { Plus, CheckCircle2, Trash2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DnsInstructions } from "./dns-instructions"

type DomainStatus = "Ativo" | "Pendente" | "Erro"

const statusStyles: Record<DomainStatus, string> = {
  Ativo: "bg-green-100 text-green-700",
  Pendente: "bg-yellow-100 text-yellow-700",
  Erro: "bg-red-100 text-red-700",
}

export function CustomDomainForm() {
  const [domain] = useState("cursoseducamais.com.br")
  const [status] = useState<DomainStatus>("Pendente")
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-[#1A1A2E]">
        Domínio personalizado
      </h3>
      <p className="mt-1 text-xs text-gray-600">
        Use o seu próprio endereço (ex: <code>suaempresa.com.br</code>) para
        fortalecer a marca na vitrine.
      </p>

      <div className="mt-5">
        <Label htmlFor="custom-domain">Adicionar novo domínio</Label>
        <div className="mt-1.5 flex gap-2">
          <Input
            id="custom-domain"
            placeholder="meudominio.com.br"
            className="flex-1"
          />
          <Button className="bg-blue-600 text-white hover:bg-blue-700">
            <Plus className="mr-2 h-4 w-4" />
            Adicionar
          </Button>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-mono text-sm font-semibold text-[#1A1A2E]">
              {domain}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusStyles[status]}`}
              >
                {status}
              </span>
              <span className="text-[10px] text-gray-500">
                Adicionado em 12/04/2026
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline">
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Verificar
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
              >
                Cancelar
              </Button>
              <Button size="sm" className="bg-red-600 text-white hover:bg-red-700">
                <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                Confirmar remoção
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6">
        <DnsInstructions />
      </div>
    </div>
  )
}
