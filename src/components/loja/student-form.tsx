"use client"

import { useState } from "react"
import { User, Mail, IdCard, Phone, MapPin, Lock, AlertCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { clientLogger } from "@/lib/logger-client"
import { MpPaymentBrick } from "@/components/loja/mp-payment-brick"

export interface StudentFormProps {
  courseId: string
  couponCode: string | null
  apiPath?: string
  processPath?: string
  statusPath?: string
}

/** Dados devolvidos pelo init para montar o Payment Brick (passo 2). */
interface CheckoutInit {
  enrollmentId: string
  mode: "one_time" | "subscription"
  amount: number
  publicKey: string
  payerEmail: string
  maxInstallments?: number
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

export function StudentForm({
  courseId,
  couponCode,
  apiPath = "/api/loja/checkout",
  processPath = "/api/loja/checkout/process",
  statusPath = "/api/loja/checkout/status",
}: StudentFormProps) {
  const [form, setForm] = useState<FormState>(INITIAL)
  const [status, setStatus] = useState<SubmitStatus>("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  // Passo 2: dados do checkout para montar o Payment Brick. Enquanto null,
  // mostramos o formulário de dados (passo 1).
  const [checkout, setCheckout] = useState<CheckoutInit | null>(null)

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
      const res = await fetch(apiPath, {
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

      if (!res.ok || !payload.data?.publicKey) {
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

      // Passo 2: monta o Payment Brick com os dados do init. O comprador
      // permanece no site (checkout transparente).
      setCheckout(payload.data as CheckoutInit)
      setStatus("idle")
    } catch (err) {
      clientLogger.error({ err: String(err), event: "checkout_form.submit_failed", courseId, hasCoupon: !!couponCode }, "checkout form submit falhou")
      setErrorMsg("Erro de conexão. Tente novamente.")
      setStatus("error")
    }
  }

  const submitting = status === "submitting"

  // ── Passo 2: pagamento (Payment Brick — cartão, PIX e boleto) ──────────────
  if (checkout) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-pmb-lime-50)] font-mono text-sm font-semibold text-[var(--color-pmb-green)]">
              02
            </div>
            <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">
              Pagamento
            </h2>
          </div>
          <div className="mt-6">
            <MpPaymentBrick
              publicKey={checkout.publicKey}
              amount={checkout.amount}
              payerEmail={checkout.payerEmail}
              enrollmentId={checkout.enrollmentId}
              mode={checkout.mode}
              maxInstallments={checkout.maxInstallments}
              processUrl={processPath}
              statusUrl={statusPath}
              successUrl={`/loja/confirmacao?enrollment_id=${checkout.enrollmentId}`}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCheckout(null)}
          className="text-sm text-gray-500 underline hover:text-gray-700"
        >
          ← Voltar e revisar meus dados
        </button>
      </div>
    )
  }

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
                autoComplete="name"
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
                  autoComplete="email"
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
                  autoComplete="tel"
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
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
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
          {submitting ? "Aguarde..." : "Ir para o pagamento"}
        </Button>
        <p className="text-center text-xs text-gray-500">
          Pagamento seguro processado aqui mesmo, sem sair do site.
        </p>
      </div>
    </form>
  )
}
