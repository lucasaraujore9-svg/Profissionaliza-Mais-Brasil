"use client"

import { useEffect, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  CreditCard,
  IdCard,
  Lock,
  Mail,
  MapPin,
  Phone,
  QrCode,
  Receipt,
  User,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { TermsAcceptance } from "@/components/loja/terms-acceptance"
import { clientLogger } from "@/lib/logger-client"
import { getMpInstance } from "@/lib/mercadopago/browser-sdk"

/**
 * Checkout transparente do Mercado Pago com o MESMO layout da tela do sistema
 * mãe (PmbCheckoutForm): o comprador escolhe PIX / Cartão / Boleto em campos
 * próprios e paga sem sair do site. O cartão é tokenizado no browser via SDK do
 * MP (o PAN nunca toca o nosso servidor).
 *
 * Dois modos:
 *  - Vitrine (createMode): recebe courseId/couponCode e cria a matrícula no
 *    submit chamando `initPath`.
 *  - Link de pagamento (payMode): recebe `enrollmentId` de uma matrícula já
 *    criada (venda manual /pagar) e vai direto para a cobrança.
 */
export interface MpCheckoutFormProps {
  publicKey: string
  // Vitrine
  courseId?: string
  couponCode?: string | null
  initPath?: string
  // Link de pagamento (matrícula já existe)
  enrollmentId?: string
  // Pré-preenchimento (payMode)
  defaultNome?: string
  defaultEmail?: string
  // Endpoints
  processPath?: string
  statusPath?: string
  /** Página de confirmação — o enrollment_id é anexado dinamicamente. */
  confirmacaoPath?: string
}

type Method = "PIX" | "BOLETO" | "CREDIT_CARD"

interface FormState {
  nome: string
  email: string
  telefone: string
  cpf: string
  endereco: string
  ccHolderName: string
  ccNumber: string
  ccExpiry: string
  ccCcv: string
  // Endereço do pagador — exigido pelo MP apenas no boleto.
  blCep: string
  blRua: string
  blNumero: string
  blBairro: string
  blCidade: string
  blUf: string
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/)
  if (parts.length <= 1) return { first: full.trim(), last: full.trim() }
  return { first: parts[0], last: parts.slice(1).join(" ") }
}

function formatCep(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8)
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`
}

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }
  | { kind: "pix"; qrCode: string; qrCodeBase64: string }
  | { kind: "boleto"; url: string; digitableLine: string | null }
  | { kind: "approved" }
  | { kind: "declined"; message: string }

type FieldErrors = Partial<Record<keyof FormState, string>>

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
function formatCardNumber(v: string): string {
  return v.replace(/\D/g, "").slice(0, 19).replace(/(.{4})/g, "$1 ").trim()
}
function formatExpiry(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 4)
  return d.length <= 2 ? d : `${d.slice(0, 2)}/${d.slice(2)}`
}

export function MpCheckoutForm({
  publicKey,
  courseId,
  couponCode,
  initPath = "/api/loja/checkout",
  enrollmentId,
  defaultNome,
  defaultEmail,
  processPath = "/api/loja/checkout/process",
  statusPath = "/api/loja/checkout/status",
  confirmacaoPath = "/loja/confirmacao",
}: MpCheckoutFormProps) {
  function successUrlFor(id: string): string {
    return `${confirmacaoPath}?enrollment_id=${encodeURIComponent(id)}`
  }
  const [form, setForm] = useState<FormState>({
    nome: defaultNome ?? "",
    email: defaultEmail ?? "",
    telefone: "",
    cpf: "",
    endereco: "",
    ccHolderName: "",
    ccNumber: "",
    ccExpiry: "",
    ccCcv: "",
    blCep: "",
    blRua: "",
    blNumero: "",
    blBairro: "",
    blCidade: "",
    blUf: "",
  })
  const [method, setMethod] = useState<Method>("PIX")
  const [status, setStatus] = useState<Status>({ kind: "idle" })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [termsError, setTermsError] = useState(false)
  // enrollment ativo (criado no submit em createMode, ou recebido em payMode)
  const [activeEnrollmentId, setActiveEnrollmentId] = useState<string | null>(
    enrollmentId ?? null,
  )

  // Pré-carrega o SDK do MP para a tokenização do cartão não atrasar o 1º submit.
  useEffect(() => {
    getMpInstance(publicKey).catch(() => {
      // silencioso — se falhar, o submit do cartão reporta o erro
    })
  }, [publicKey])

  function setField<K extends keyof FormState>(key: K, value: string) {
    setForm((p) => ({ ...p, [key]: value }))
    if (fieldErrors[key]) setFieldErrors((p) => ({ ...p, [key]: undefined }))
  }

  /** Garante a matrícula: cria via init (vitrine) ou usa a existente (pagar). */
  async function ensureEnrollment(): Promise<{
    enrollmentId: string
    payerEmail: string
  } | null> {
    if (activeEnrollmentId) {
      return { enrollmentId: activeEnrollmentId, payerEmail: form.email }
    }
    const res = await fetch(initPath, {
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
        acceptedTerms: true,
      }),
    })
    const payload = await res.json()
    if (!res.ok || !payload.data?.enrollmentId) {
      if (payload.code === "VALIDATION_ERROR" && payload.details) {
        const mapped: FieldErrors = {}
        for (const [field, msgs] of Object.entries(payload.details)) {
          const key = field === "fone" ? "telefone" : (field as keyof FormState)
          const first = Array.isArray(msgs) ? msgs[0] : undefined
          if (first && key in form) mapped[key] = first as string
        }
        setFieldErrors(mapped)
        setStatus({ kind: "error", message: "Revise os campos destacados." })
      } else {
        setStatus({
          kind: "error",
          message: payload.error ?? "Não foi possível iniciar o pagamento.",
        })
      }
      return null
    }
    setActiveEnrollmentId(payload.data.enrollmentId)
    return {
      enrollmentId: payload.data.enrollmentId,
      payerEmail: payload.data.payerEmail ?? form.email,
    }
  }

  /** Monta o formData do método escolhido (tokeniza o cartão quando preciso). */
  async function buildFormData(
    payerEmail: string,
  ): Promise<Record<string, unknown> | null> {
    const cpf = form.cpf.replace(/\D/g, "")
    const identification = cpf
      ? { type: "CPF", number: cpf }
      : undefined
    const { first, last } = splitName(form.nome)
    const basePayer = {
      email: payerEmail,
      first_name: first || undefined,
      last_name: last || undefined,
      ...(identification ? { identification } : {}),
    }

    if (method === "PIX") {
      return { payment_method_id: "pix", payer: basePayer }
    }
    if (method === "BOLETO") {
      // MP exige endereço completo do pagador no boleto.
      return {
        payment_method_id: "bolbradesco",
        payer: {
          ...basePayer,
          address: {
            zip_code: form.blCep.replace(/\D/g, ""),
            street_name: form.blRua,
            street_number: form.blNumero,
            neighborhood: form.blBairro,
            city: form.blCidade,
            federal_unit: form.blUf.toUpperCase(),
          },
        },
      }
    }

    // CREDIT_CARD: tokeniza no browser e detecta a bandeira pelo BIN.
    const mp = await getMpInstance(publicKey)
    const number = form.ccNumber.replace(/\s/g, "")
    const bin = number.slice(0, 8)
    let paymentMethodId = ""
    let issuerId: string | undefined
    try {
      const pm = await mp.getPaymentMethods({ bin })
      const first = pm.results?.[0]
      if (!first) {
        setStatus({
          kind: "error",
          message: "Não reconhecemos a bandeira deste cartão. Confira o número.",
        })
        return null
      }
      paymentMethodId = first.id
      if (first.issuer?.id !== undefined) issuerId = String(first.issuer.id)
    } catch {
      setStatus({
        kind: "error",
        message: "Não foi possível validar o cartão. Tente novamente.",
      })
      return null
    }

    const [mm, yy] = form.ccExpiry.split("/")
    const year = yy?.length === 2 ? `20${yy}` : yy
    let token: string
    try {
      const result = await mp.createCardToken({
        cardNumber: number,
        cardholderName: form.ccHolderName,
        cardExpirationMonth: mm ?? "",
        cardExpirationYear: year ?? "",
        securityCode: form.ccCcv,
        identificationType: "CPF",
        identificationNumber: cpf,
      })
      if (!result?.id) throw new Error("token vazio")
      token = result.id
    } catch (err) {
      clientLogger.error(
        { err: String(err), event: "mp_checkout.tokenize_failed" },
        "tokenização do cartão falhou",
      )
      setStatus({
        kind: "error",
        message:
          "Não foi possível validar o cartão. Confira número, validade e CVV.",
      })
      return null
    }

    return {
      token,
      payment_method_id: paymentMethodId,
      installments: 1,
      ...(issuerId ? { issuer_id: issuerId } : {}),
      payer: basePayer,
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (status.kind === "submitting") return
    if (!acceptedTerms) {
      setTermsError(true)
      return
    }
    setStatus({ kind: "submitting" })
    setFieldErrors({})

    try {
      const ensured = await ensureEnrollment()
      if (!ensured) return // status já setado

      const formData = await buildFormData(ensured.payerEmail)
      if (!formData) return // status já setado

      const res = await fetch(processPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentId: ensured.enrollmentId, formData }),
      })
      const payload = await res.json()

      if (!res.ok) {
        setStatus({
          kind:
            payload.code === "PAYMENT_REJECTED" ? "declined" : "error",
          message: payload.error ?? "Não foi possível concluir o pagamento.",
        })
        return
      }

      const d = payload.data
      if (d?.status === "approved" || d?.status === "authorized") {
        setStatus({ kind: "approved" })
        window.location.href = successUrlFor(ensured.enrollmentId)
        return
      }
      if (d?.pix?.qrCode) {
        setStatus({
          kind: "pix",
          qrCode: d.pix.qrCode,
          qrCodeBase64: d.pix.qrCodeBase64 ?? "",
        })
        return
      }
      if (d?.boleto?.url) {
        setStatus({
          kind: "boleto",
          url: d.boleto.url,
          digitableLine: d.boleto.digitableLine ?? null,
        })
        return
      }
      // pending sem dados inline (cartão em análise)
      setStatus({
        kind: "error",
        message:
          "Pagamento em análise. Você receberá um e-mail assim que for aprovado.",
      })
    } catch (err) {
      clientLogger.error(
        { err: String(err), event: "mp_checkout.submit_failed" },
        "mp-checkout submit falhou",
      )
      setStatus({ kind: "error", message: "Erro de conexão. Tente novamente." })
    }
  }

  // Polling de PIX/boleto: redireciona quando o webhook confirmar.
  useEffect(() => {
    if (status.kind !== "pix" && status.kind !== "boleto") return
    if (!activeEnrollmentId) return
    const id = activeEnrollmentId
    let cancelled = false
    const interval = setInterval(async () => {
      if (cancelled) return
      try {
        const res = await fetch(
          `${statusPath}?enrollment_id=${encodeURIComponent(id)}`,
          { cache: "no-store" },
        )
        const data = await res.json()
        if (data.data?.paid) {
          cancelled = true
          window.location.href = successUrlFor(id)
        }
      } catch {
        // tenta no próximo tick
      }
    }, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, activeEnrollmentId, statusPath, confirmacaoPath])

  const submitting = status.kind === "submitting"

  // Volta do PIX/boleto para o form — a matrícula pendente é reaproveitada
  // pelo servidor, então o cliente pode trocar para cartão (ou outro método)
  // sem ficar preso na tela do QR Code / boleto.
  function backToForm() {
    setStatus({ kind: "idle" })
  }

  // ── Telas de resultado ──────────────────────────────────────────────────
  if (status.kind === "pix") {
    return (
      <PixResult
        qrCode={status.qrCode}
        qrCodeBase64={status.qrCodeBase64}
        onChangeMethod={backToForm}
      />
    )
  }
  if (status.kind === "boleto") {
    return (
      <BoletoResult
        url={status.url}
        digitableLine={status.digitableLine}
        onChangeMethod={backToForm}
      />
    )
  }
  if (status.kind === "approved") {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
        <h2 className="mt-4 text-xl font-bold text-green-900">
          Pagamento aprovado!
        </h2>
        <p className="mt-2 text-sm text-green-800">
          Redirecionando para sua confirmação…
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* SEÇÃO 1: DADOS PESSOAIS */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <SectionHeader n="01" title="Seus dados" />
        <div className="mt-6 space-y-5">
          <FieldText id="nome" label="Nome completo" placeholder="Como aparece no seu documento" icon={User} value={form.nome} onChange={(v) => setField("nome", v)} error={fieldErrors.nome} disabled={submitting} required />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <FieldText id="email" label="Email" type="email" placeholder="voce@email.com" icon={Mail} value={form.email} onChange={(v) => setField("email", v)} error={fieldErrors.email} disabled={submitting} required />
            <FieldText id="telefone" label="Telefone (WhatsApp)" type="tel" placeholder="(11) 99999-9999" icon={Phone} value={form.telefone} onChange={(v) => setField("telefone", formatPhone(v))} error={fieldErrors.telefone} disabled={submitting} required />
          </div>
          <FieldText id="cpf" label="CPF" placeholder="000.000.000-00" icon={IdCard} mono value={form.cpf} onChange={(v) => setField("cpf", formatCpf(v))} error={fieldErrors.cpf} disabled={submitting} required />
          <FieldText id="endereco" label="Endereço (opcional)" placeholder="Rua, número, bairro, cidade, UF" icon={MapPin} value={form.endereco} onChange={(v) => setField("endereco", v)} disabled={submitting} />
        </div>
      </div>

      {/* SEÇÃO 2: FORMA DE PAGAMENTO */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <SectionHeader n="02" title="Forma de pagamento" />
        <div className="mt-6 space-y-3">
          <MethodButton active={method === "PIX"} onClick={() => setMethod("PIX")} icon={QrCode} label="PIX" hint="Aprovação imediata" />
          <MethodButton active={method === "CREDIT_CARD"} onClick={() => setMethod("CREDIT_CARD")} icon={CreditCard} label="Cartão de Crédito" hint="Aprovação na hora" />
          <MethodButton active={method === "BOLETO"} onClick={() => setMethod("BOLETO")} icon={Receipt} label="Boleto Bancário" hint="Compensa em até 3 dias úteis" />
        </div>

        {method === "CREDIT_CARD" && (
          <div className="mt-6 space-y-5 border-t border-gray-100 pt-6">
            <FieldText id="ccHolderName" label="Nome impresso no cartão" placeholder="Como aparece no cartão" icon={User} value={form.ccHolderName} onChange={(v) => setField("ccHolderName", v.toUpperCase())} error={fieldErrors.ccHolderName} disabled={submitting} required />
            <FieldText id="ccNumber" label="Número do cartão" placeholder="0000 0000 0000 0000" icon={CreditCard} mono inputMode="numeric" value={form.ccNumber} onChange={(v) => setField("ccNumber", formatCardNumber(v))} error={fieldErrors.ccNumber} disabled={submitting} required />
            <div className="grid grid-cols-2 gap-5">
              <FieldText id="ccExpiry" label="Validade (MM/AA)" placeholder="12/28" mono inputMode="numeric" value={form.ccExpiry} onChange={(v) => setField("ccExpiry", formatExpiry(v))} error={fieldErrors.ccExpiry} disabled={submitting} required />
              <FieldText id="ccCcv" label="CCV" placeholder="123" mono inputMode="numeric" value={form.ccCcv} onChange={(v) => setField("ccCcv", v.replace(/\D/g, "").slice(0, 4))} error={fieldErrors.ccCcv} disabled={submitting} required />
            </div>
          </div>
        )}

        {method === "PIX" && (
          <p className="mt-6 rounded-xl bg-[var(--color-pmb-lime-50)]/40 p-4 text-xs text-[var(--color-pmb-green-700)]">
            Você verá o QR Code logo abaixo. Após o pagamento, sua matrícula é
            ativada automaticamente em até 1 minuto.
          </p>
        )}
        {method === "BOLETO" && (
          <div className="mt-6 space-y-5 border-t border-gray-100 pt-6">
            <p className="text-xs text-gray-500">
              Para emitir o boleto, informe o endereço do pagador.
            </p>
            <div className="grid grid-cols-[140px_1fr] gap-5">
              <FieldText id="blCep" label="CEP" placeholder="00000-000" mono inputMode="numeric" value={form.blCep} onChange={(v) => setField("blCep", formatCep(v))} error={fieldErrors.blCep} disabled={submitting} required />
              <FieldText id="blRua" label="Rua / Logradouro" placeholder="Av. Brasil" value={form.blRua} onChange={(v) => setField("blRua", v)} error={fieldErrors.blRua} disabled={submitting} required />
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-5">
              <FieldText id="blNumero" label="Número" placeholder="123" value={form.blNumero} onChange={(v) => setField("blNumero", v)} error={fieldErrors.blNumero} disabled={submitting} required />
              <FieldText id="blBairro" label="Bairro" placeholder="Centro" value={form.blBairro} onChange={(v) => setField("blBairro", v)} error={fieldErrors.blBairro} disabled={submitting} required />
            </div>
            <div className="grid grid-cols-[1fr_100px] gap-5">
              <FieldText id="blCidade" label="Cidade" placeholder="São Paulo" value={form.blCidade} onChange={(v) => setField("blCidade", v)} error={fieldErrors.blCidade} disabled={submitting} required />
              <FieldText id="blUf" label="UF" placeholder="SP" value={form.blUf} onChange={(v) => setField("blUf", v.toUpperCase().slice(0, 2))} error={fieldErrors.blUf} disabled={submitting} required />
            </div>
            <p className="rounded-xl bg-[var(--color-pmb-lime-50)]/40 p-4 text-xs text-[var(--color-pmb-green-700)]">
              Geramos o boleto imediatamente. A compensação leva até 3 dias úteis
              após o pagamento.
            </p>
          </div>
        )}
      </div>

      {(status.kind === "error" || status.kind === "declined") && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{status.message}</span>
          </div>
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
          <Lock className="mr-2 h-4 w-4" />
          {submitting ? "Processando..." : "Finalizar Compra"}
        </Button>
        <p className="text-center text-xs text-gray-500">
          Pagamento processado com segurança aqui no site. Seus dados de cartão
          não são armazenados.
        </p>
      </div>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Subcomponentes (layout idêntico ao da tela do sistema mãe)
// ─────────────────────────────────────────────────────────────────────────

function SectionHeader({ n, title }: { n: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-pmb-lime-50)] font-mono text-sm font-semibold text-[var(--color-pmb-green)]">
        {n}
      </div>
      <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">
        {title}
      </h2>
    </div>
  )
}

interface FieldTextProps {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  inputMode?: "text" | "numeric" | "tel" | "email"
  icon?: React.ComponentType<{ className?: string }>
  mono?: boolean
  required?: boolean
  disabled?: boolean
  error?: string
}

function FieldText({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  icon: Icon,
  mono,
  required,
  disabled,
  error,
}: FieldTextProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        {Icon && (
          <Icon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        )}
        <Input
          id={id}
          type={type}
          inputMode={inputMode}
          placeholder={placeholder}
          className={`${Icon ? "pl-9" : ""} ${mono ? "font-mono" : ""}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={disabled}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

function MethodButton({
  active,
  onClick,
  icon: Icon,
  label,
  hint,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
  hint: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all ${
        active
          ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]/50 shadow-sm"
          : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-lg ${
          active ? "bg-[var(--color-pmb-green)] text-white" : "bg-gray-100 text-gray-600"
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-[var(--color-pmb-green-900)]">{label}</div>
        <div className="text-xs text-gray-500">{hint}</div>
      </div>
      <div
        className={`h-5 w-5 shrink-0 rounded-full border-2 ${
          active ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-green)]" : "border-gray-300 bg-white"
        }`}
      >
        {active && (
          <div className="h-full w-full rounded-full border-2 border-white bg-[var(--color-pmb-green)]" />
        )}
      </div>
    </button>
  )
}

function ChangeMethodButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-4 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50"
    >
      Escolher outra forma de pagamento
    </button>
  )
}

function PixResult({
  qrCode,
  qrCodeBase64,
  onChangeMethod,
}: {
  qrCode: string
  qrCodeBase64: string
  onChangeMethod: () => void
}) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(qrCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignora
    }
  }
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <div className="flex items-center gap-2">
        <QrCode className="h-5 w-5 text-[var(--color-pmb-green)]" />
        <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">Pague com PIX</h2>
      </div>
      <p className="mt-2 text-sm text-gray-600">
        Escaneie o QR Code abaixo ou copie o código para concluir o pagamento.
      </p>
      {qrCodeBase64 && (
        <div className="mt-6 flex justify-center">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`data:image/png;base64,${qrCodeBase64}`} alt="QR Code PIX" className="h-60 w-60" />
          </div>
        </div>
      )}
      <div className="mt-6 space-y-2">
        <Label>Código PIX copia e cola</Label>
        <div className="flex gap-2">
          <Input value={qrCode} readOnly className="font-mono text-xs" />
          <Button type="button" onClick={copy} variant="outline" className="shrink-0">
            <Copy className="mr-2 h-4 w-4" />
            {copied ? "Copiado!" : "Copiar"}
          </Button>
        </div>
      </div>
      <div className="mt-6 flex items-start gap-2 rounded-xl bg-[var(--color-pmb-lime-50)]/40 p-4 text-sm text-[var(--color-pmb-green-700)]">
        <span className="mt-0.5 inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--color-pmb-green)]" />
        <span>Aguardando confirmação do pagamento… Você será redirecionado automaticamente assim que recebermos a confirmação.</span>
      </div>
      <ChangeMethodButton onClick={onChangeMethod} />
    </div>
  )
}

function BoletoResult({
  url,
  digitableLine,
  onChangeMethod,
}: {
  url: string
  digitableLine: string | null
  onChangeMethod: () => void
}) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    if (!digitableLine) return
    try {
      await navigator.clipboard.writeText(digitableLine)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignora
    }
  }
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <div className="flex items-center gap-2">
        <Receipt className="h-5 w-5 text-[var(--color-pmb-green)]" />
        <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">Pague com boleto</h2>
      </div>
      <p className="mt-2 text-sm text-gray-600">
        Copie a linha digitável ou abra o boleto para pagar pelo banco/app.
      </p>
      {digitableLine && (
        <div className="mt-6 space-y-2">
          <Label>Linha digitável</Label>
          <div className="flex gap-2">
            <Input value={digitableLine} readOnly className="font-mono text-xs" />
            <Button type="button" onClick={copy} variant="outline" className="shrink-0">
              <Copy className="mr-2 h-4 w-4" />
              {copied ? "Copiado!" : "Copiar"}
            </Button>
          </div>
        </div>
      )}
      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-[var(--color-pmb-green)] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--color-pmb-green-700)]">
        Abrir boleto em PDF
      </a>
      <div className="mt-6 flex items-start gap-2 rounded-xl bg-[var(--color-pmb-lime-50)]/40 p-4 text-sm text-[var(--color-pmb-green-700)]">
        <span className="mt-0.5 inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--color-pmb-green)]" />
        <span>Aguardando o pagamento. A compensação leva até 3 dias úteis. Você receberá um email quando a matrícula for ativada.</span>
      </div>
      <ChangeMethodButton onClick={onChangeMethod} />
    </div>
  )
}
