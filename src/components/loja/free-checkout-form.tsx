"use client"

import { useState } from "react"
import { Cake, CheckCircle2, IdCard, Mail, MapPin, Phone, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SectionHeader, FieldText } from "@/components/loja/checkout-fields"
import { TermsAcceptance } from "@/components/loja/terms-acceptance"
import { GuardianFields } from "@/components/shared/guardian/guardian-fields"
import { useGuardian } from "@/components/shared/guardian/use-guardian"
import { applyServerFieldErrors } from "@/lib/checkout/field-errors"
import { clientLogger } from "@/lib/logger-client"
import { storePath } from "@/lib/tenant/vitrine-paths"

/**
 * Matrícula SEM cobrança na vitrine: o cupom cobriu 100% do valor.
 *
 * Existe para a loja que ainda NÃO conectou conta bancária nenhuma. Nos demais
 * casos o caminho gratuito já é atendido pelo formulário do gateway ativo
 * (Asaas/MP), que esconde as formas de pagamento quando o valor zera. Aqui não
 * há gateway a esconder: a tela é só a coleta de dados + o aceite.
 *
 * Não recebe `amount`: quem decide entre este formulário e o de contato é o
 * CheckoutPanel, pelo preço final ao vivo. O servidor revalida o cupom e recusa
 * (503 CHECKOUT_UNAVAILABLE) se o valor não tiver zerado de fato — esta tela
 * nunca é a autoridade sobre "é grátis".
 */
export interface FreeCheckoutFormProps {
  courseId?: string
  packageId?: string
  couponCode: string | null
  initPath?: string
  confirmacaoPath?: string
}

interface FormState {
  nome: string
  email: string
  telefone: string
  cpf: string
  endereco: string
}

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }
  | { kind: "done" }

type GuardianErrorKey =
  | "nascimento"
  | "responsavel"
  | "responsavelCpf"
  | "responsavelEmail"
  | "responsavelFone"
  | "responsavelParentesco"
  | "responsavelDeclaracao"

type FieldErrors = Partial<Record<keyof FormState | GuardianErrorKey, string>>

function formatCpf(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

function formatPhone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function FreeCheckoutForm({
  courseId,
  packageId,
  couponCode,
  initPath = "/api/loja/checkout",
  confirmacaoPath,
}: FreeCheckoutFormProps) {
  const [form, setForm] = useState<FormState>({
    nome: "",
    email: "",
    telefone: "",
    cpf: "",
    endereco: "",
  })
  const [status, setStatus] = useState<Status>({ kind: "idle" })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const guardianCtl = useGuardian()
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [termsError, setTermsError] = useState(false)

  const submitting = status.kind === "submitting"

  function setField<K extends keyof FormState>(key: K, value: string) {
    setForm((p) => ({ ...p, [key]: value }))
    if (fieldErrors[key]) setFieldErrors((p) => ({ ...p, [key]: undefined }))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submitting) return
    if (!acceptedTerms) {
      setTermsError(true)
      return
    }
    setStatus({ kind: "submitting" })
    setFieldErrors({})

    try {
      const res = await fetch(initPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(packageId ? { packageId } : { courseId }),
          couponCode: couponCode ?? undefined,
          nome: form.nome,
          email: form.email,
          cpf: form.cpf,
          fone: form.telefone,
          endereco: form.endereco || undefined,
          acceptedTerms: true,
          nascimento: guardianCtl.nascimento,
          ...guardianCtl.payload(),
        }),
      })
      const payload = await res.json()

      if (!res.ok || !payload.data?.enrollmentId) {
        if (payload.code === "VALIDATION_ERROR" && payload.details) {
          // `fone` na API é `telefone` na tela; os campos do responsável não
          // vivem em FormState e precisam passar assim mesmo.
          const details = Object.fromEntries(
            Object.entries(payload.details as Record<string, unknown>).map(
              ([k, v]) => [k === "fone" ? "telefone" : k, v],
            ),
          )
          setFieldErrors(
            applyServerFieldErrors(details, (k) => k in form) as FieldErrors,
          )
          setStatus({ kind: "error", message: "Revise os campos destacados." })
          return
        }
        setStatus({
          kind: "error",
          message: payload.error ?? "Não foi possível concluir a matrícula.",
        })
        return
      }

      setStatus({ kind: "done" })
      const base =
        confirmacaoPath ?? storePath(window.location.pathname, "/confirmacao")
      window.location.href = `${base}?enrollment_id=${encodeURIComponent(
        payload.data.enrollmentId,
      )}`
    } catch (err) {
      clientLogger.error({ err, event: "loja.free_checkout.failed" }, "matricula gratuita falhou")
      setStatus({ kind: "error", message: "Erro de rede. Tente novamente." })
    }
  }

  if (status.kind === "done") {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
        <h2 className="mt-4 text-xl font-bold text-green-900">
          Matrícula concluída!
        </h2>
        <p className="mt-2 text-sm text-green-800">
          Redirecionando para sua confirmação…
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <SectionHeader n="01" title="Seus dados" />
        <div className="mt-6 space-y-5">
          <FieldText id="nome" label="Nome completo do aluno" placeholder="Quem vai estudar e receber o certificado" icon={User} value={form.nome} onChange={(v) => setField("nome", v)} error={fieldErrors.nome} disabled={submitting} required />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <FieldText id="email" label="Email" type="email" placeholder="voce@email.com" icon={Mail} value={form.email} onChange={(v) => setField("email", v)} error={fieldErrors.email} disabled={submitting} required />
            <FieldText id="telefone" label="Telefone (WhatsApp)" type="tel" placeholder="(11) 99999-9999" icon={Phone} value={form.telefone} onChange={(v) => setField("telefone", formatPhone(v))} error={fieldErrors.telefone} disabled={submitting} required />
          </div>
          <FieldText id="cpf" label="CPF" placeholder="000.000.000-00" icon={IdCard} mono value={form.cpf} onChange={(v) => setField("cpf", formatCpf(v))} error={fieldErrors.cpf} disabled={submitting} required />
          <FieldText id="nascimento" label="Data de nascimento do aluno" type="date" icon={Cake} value={guardianCtl.nascimento} onChange={guardianCtl.setNascimento} error={fieldErrors.nascimento} disabled={submitting} required />
          <p className="-mt-2 text-xs text-gray-500">
            O certificado é emitido com o nome e a data que você informar aqui.
          </p>
          <FieldText id="endereco" label="Endereço (opcional)" placeholder="Rua, número, bairro, cidade, UF" icon={MapPin} value={form.endereco} onChange={(v) => setField("endereco", v)} disabled={submitting} />
          {!guardianCtl.required && (
            <button
              type="button"
              className="text-xs font-medium text-[var(--color-pmb-green)] underline underline-offset-2"
              onClick={() => guardianCtl.setManualOpen(!guardianCtl.manualOpen)}
              disabled={submitting}
            >
              {guardianCtl.manualOpen
                ? "Sou eu quem responde pelo aluno"
                : "O aluno é menor de idade?"}
            </button>
          )}
          {/* Desmontado (e não escondido por CSS): manter os inputs no DOM
              travaria o envio na validação `required` do navegador. */}
          {guardianCtl.open && (
            <GuardianFields
              value={guardianCtl.guardian}
              onChange={guardianCtl.setGuardian}
              fieldErrors={fieldErrors}
              disabled={submitting}
              required={guardianCtl.required}
              formatCpf={formatCpf}
              formatPhone={formatPhone}
            />
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <SectionHeader n="02" title="Pagamento" />
        <p className="mt-6 rounded-lg bg-[color-mix(in_srgb,var(--color-pmb-green)_10%,white)] px-4 py-3 text-sm text-gray-700">
          Seu cupom cobriu <strong>100% do valor</strong>. Não há nada a pagar —
          é só concluir a matrícula e começar a estudar.
        </p>
      </div>

      {status.kind === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {status.message}
        </div>
      )}

      <div className="space-y-3">
        <TermsAcceptance
          checked={acceptedTerms}
          onChange={(v) => {
            setAcceptedTerms(v)
            if (v) setTermsError(false)
          }}
          disabled={submitting}
          error={termsError}
        />
        <Button type="submit" size="lg" disabled={submitting} className="w-full bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]">
          {submitting ? "Concluindo..." : "Concluir matrícula"}
        </Button>
        <p className="text-center text-xs text-gray-500">
          Nenhuma cobrança será feita. O acesso é liberado na hora.
        </p>
      </div>
    </form>
  )
}
