"use client"

import { useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ConfigData } from "./config-tabs"

interface AccountFormProps {
  data: ConfigData
  onUpdate: (next: Partial<ConfigData>) => void
}

type SubmitStatus = "idle" | "submitting" | "success" | "error"

export function AccountForm({ data, onUpdate }: AccountFormProps) {
  const [name, setName] = useState(data.user.name)
  const [email, setEmail] = useState(data.user.email)
  const [companyName, setCompanyName] = useState(data.tenant.name)
  const [status, setStatus] = useState<SubmitStatus>("idle")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("submitting")
    setErrors({})
    setErrorMessage(null)

    try {
      const response = await fetch("/api/painel/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, companyName }),
      })
      const json = await response.json()

      if (!response.ok) {
        if (json?.fields) {
          const flat: Record<string, string> = {}
          for (const [field, list] of Object.entries(
            json.fields as Record<string, string[] | undefined>,
          )) {
            if (list && list[0]) flat[field] = list[0]
          }
          setErrors(flat)
        }
        setErrorMessage(json?.error ?? "Erro ao salvar")
        setStatus("error")
        return
      }

      onUpdate({
        user: { ...data.user, name, email },
        tenant: { ...data.tenant, name: companyName },
      })
      setStatus("success")
    } catch {
      setErrorMessage("Erro de rede. Tente novamente.")
      setStatus("error")
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8"
    >
      <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">Dados da conta</h3>
      <p className="mt-1 text-xs text-gray-600">
        Seus dados pessoais e da empresa cadastrada na plataforma.
      </p>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <div>
          <Label htmlFor="cfg-nome">Nome completo</Label>
          <Input
            id="cfg-nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5"
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-600">{errors.name}</p>
          )}
        </div>
        <div>
          <Label htmlFor="cfg-email">Email</Label>
          <Input
            id="cfg-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5"
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-600">{errors.email}</p>
          )}
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="cfg-empresa">Nome da empresa</Label>
          <Input
            id="cfg-empresa"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="mt-1.5"
          />
          {errors.companyName && (
            <p className="mt-1 text-xs text-red-600">{errors.companyName}</p>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {errorMessage}
        </div>
      )}

      {status === "success" && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          Alterações salvas com sucesso.
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <Button
          type="submit"
          disabled={status === "submitting"}
          className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
        >
          {status === "submitting" ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            "Salvar alterações"
          )}
        </Button>
      </div>
    </form>
  )
}
