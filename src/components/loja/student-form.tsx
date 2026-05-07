"use client"

import { useState } from "react"
import { User, Mail, IdCard, Phone, MapPin, Lock, AlertCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export interface StudentFormProps {
  courseId: string
  couponCode: string | null
}

interface FormState {
  nome: string
  email: string
  telefone: string
  cpf: string
  endereco: string
}

type SubmitStatus = "idle" | "submitting" | "error"

type FieldErrors = Partial<Record<keyof FormState, string>>

function formatCpf(v: string): string {
  const digits = v.replace(/\D/g, "").slice(0, 11)
  const parts = [
    digits.slice(0, 3),
    digits.slice(3, 6),
    digits.slice(6, 9),
    digits.slice(9, 11),
  ].filter(Boolean)
  if (parts.length <= 1) return digits
  if (parts.length === 2) return `${parts[0]}.${parts[1]}`
  if (parts.length === 3) return `${parts[0]}.${parts[1]}.${parts[2]}`
  return `${parts[0]}.${parts[1]}.${parts[2]}-${parts[3]}`
}

function formatPhone(v: string): string {
  const digits = v.replace(/\D/g, "").slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

const INITIAL: FormState = {
  nome: "",
  email: "",
  telefone: "",
  cpf: "",
  endereco: "",
}

export function StudentForm({ courseId, couponCode }: StudentFormProps) {
  const [form, setForm] = useState<FormState>(INITIAL)
  const [status, setStatus] = useState<SubmitStatus>("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  function setField<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (fieldErrors[key]) {
      setFieldErrors((prev) => ({ ...prev, [key]: undefined }))
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (status === "submitting") return

    setStatus("submitting")
    setErrorMsg(null)
    setFieldErrors({})

    try {
      const res = await fetch("/api/loja/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          couponCode: couponCode ?? undefined,
          nome: form.nome,
          email: form.email,
          cpf: form.cpf,
          fone: form.telefone,
          endereco: form.endereco || undefined,
        }),
      })

      const payload = await res.json()

      if (!res.ok || !payload.data?.initPoint) {
        if (payload.code === "VALIDATION_ERROR" && payload.details) {
          const mapped: FieldErrors = {}
          for (const [field, msgs] of Object.entries(payload.details)) {
            const key = field === "fone" ? "telefone" : (field as keyof FormState)
            const first = Array.isArray(msgs) ? msgs[0] : undefined
            if (first && key in INITIAL) {
              mapped[key as keyof FormState] = first
            }
          }
          setFieldErrors(mapped)
          setErrorMsg("Revise os campos destacados.")
        } else {
          setErrorMsg(payload.error ?? "Não foi possível iniciar o pagamento.")
        }
        setStatus("error")
        return
      }

      window.location.href = payload.data.initPoint
    } catch (err) {
      console.error("[checkout-form]", err)
      setErrorMsg("Erro de conexão. Tente novamente.")
      setStatus("error")
    }
  }

  const submitting = status === "submitting"

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-pmb-lime-50)] font-mono text-sm font-semibold text-[var(--color-pmb-green)]">
            01
          </div>
          <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">Seus dados</h2>
        </div>

        <div className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome completo</Label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                id="nome"
                placeholder="Como aparece no seu documento"
                className="pl-9"
                value={form.nome}
                onChange={(e) => setField("nome", e.target.value)}
                required
                disabled={submitting}
              />
            </div>
            {fieldErrors.nome && (
              <p className="text-xs text-red-600">{fieldErrors.nome}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="voce@email.com"
                  className="pl-9"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
              {fieldErrors.email && (
                <p className="text-xs text-red-600">{fieldErrors.email}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone (WhatsApp)</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  id="telefone"
                  type="tel"
                  placeholder="(11) 99999-9999"
                  className="pl-9"
                  value={form.telefone}
                  onChange={(e) => setField("telefone", formatPhone(e.target.value))}
                  required
                  disabled={submitting}
                />
              </div>
              {fieldErrors.telefone && (
                <p className="text-xs text-red-600">{fieldErrors.telefone}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cpf">CPF</Label>
            <div className="relative">
              <IdCard className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                id="cpf"
                placeholder="000.000.000-00"
                className="pl-9 font-mono"
                value={form.cpf}
                onChange={(e) => setField("cpf", formatCpf(e.target.value))}
                required
                disabled={submitting}
              />
            </div>
            {fieldErrors.cpf && (
              <p className="text-xs text-red-600">{fieldErrors.cpf}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="endereco">Endereço (opcional)</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                id="endereco"
                placeholder="Rua, número, bairro, cidade, UF"
                className="pl-9"
                value={form.endereco}
                onChange={(e) => setField("endereco", e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="space-y-3">
        <Button
          type="submit"
          size="lg"
          disabled={submitting}
          className="w-full bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
        >
          <Lock className="mr-2 h-4 w-4" />
          {submitting ? "Redirecionando..." : "Finalizar Compra"}
        </Button>
        <p className="text-center text-xs text-gray-500">
          Você será redirecionado para o ambiente seguro de pagamento.
        </p>
      </div>
    </form>
  )
}
