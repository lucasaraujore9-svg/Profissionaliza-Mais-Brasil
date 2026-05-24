"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Method = "ASAAS_PIX" | "DESCONTO_MENSALIDADE"

function formatMoney(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n)
}

export function ReferralPayoutForm({
  availableAmount,
  initialPixKey,
  initialPixKeyType,
}: {
  availableAmount: number
  initialPixKey: string
  initialPixKeyType: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [method, setMethod] = useState<Method>("ASAAS_PIX")
  const [pixKey, setPixKey] = useState(initialPixKey)
  const [pixKeyType, setPixKeyType] = useState(initialPixKeyType || "CPF")

  function submit() {
    if (method === "ASAAS_PIX" && (!pixKey.trim() || !pixKeyType)) {
      toast.error("Informe sua chave PIX e o tipo")
      return
    }

    startTransition(async () => {
      const res = await fetch("/api/painel/referrals/request-payout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          method,
          pixKey: method === "ASAAS_PIX" ? pixKey.trim() : undefined,
          pixKeyType: method === "ASAAS_PIX" ? pixKeyType : undefined,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao solicitar saque")
        return
      }
      toast.success("Saque solicitado! Aguarde a aprovacao.")
      router.push("/painel/indicacoes")
      router.refresh()
    })
  }

  return (
    <Card className="p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">
          Valor a sacar: {formatMoney(availableAmount)}
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          O valor total de comissoes disponiveis sera incluido neste saque.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Metodo</Label>
        <Select
          value={method}
          onValueChange={(v) => {
            if (v) setMethod(v as Method)
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ASAAS_PIX">PIX (Asaas)</SelectItem>
            <SelectItem value="DESCONTO_MENSALIDADE">
              Desconto na proxima mensalidade
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {method === "ASAAS_PIX" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Tipo da chave</Label>
            <Select
              value={pixKeyType}
              onValueChange={(v) => {
                if (v) setPixKeyType(v)
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CPF">CPF</SelectItem>
                <SelectItem value="CNPJ">CNPJ</SelectItem>
                <SelectItem value="EMAIL">Email</SelectItem>
                <SelectItem value="PHONE">Telefone</SelectItem>
                <SelectItem value="EVP">Chave aleatoria</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Chave PIX</Label>
            <Input
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              placeholder="Sua chave"
            />
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-600 rounded-md border border-gray-200 bg-gray-50 p-3">
          O valor sera aplicado como desconto na sua proxima fatura de
          mensalidade. Sera concedido apos a aprovacao do administrador.
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Enviando..." : "Confirmar saque"}
        </Button>
      </div>
    </Card>
  )
}
