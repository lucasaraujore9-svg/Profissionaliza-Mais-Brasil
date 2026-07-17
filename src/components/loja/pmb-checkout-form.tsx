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
import {
  perInstallment,
  pmbMaxBoletoInstallments,
  pmbMaxCardInstallments,
} from "@/lib/installments/pmb-rules"

export interface PmbCheckoutFormProps {
  courseId?: string
  /** Compra de PACOTE: enviado em vez de courseId ao initPath. */
  packageId?: string
  couponCode: string | null
  initPath?: string
  /**
   * Valor final da compra (com cupom) — base dos seletores de parcelamento.
   * Ausente = seletores ocultos (compra segue à vista, como antes).
   */
  amount?: number
  /** Teto de parcelas no cartão (config admin "parcelas sem juros", 1..12). */
  cardMaxInstallments?: number
  /** Curso com mensalidade: sem parcelamento adicional. */
  isMonthly?: boolean
  /**
   * Retomada de cobrança (tela /pagar): pré-preenche os dados do aluno já
   * conhecidos da matrícula. O endpoint de retomada usa o aluno do banco como
   * fonte da verdade — estes campos servem só para exibir/validar no cliente.
   */
  prefill?: { nome: string; email: string; cpf: string; telefone: string }
}

type Method = "PIX" | "BOLETO" | "CREDIT_CARD"

interface FormState {
  nome: string
  email: string
  telefone: string
  cpf: string
  endereco: string
  // Cartão
  ccHolderName: string
  ccNumber: string
  ccExpiry: string // MM/AA
  ccCcv: string
  ccCep: string
  ccAddrNum: string
}

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }
  | {
      kind: "pix"
      enrollmentId: string
      qrImageBase64: string
      payload: string
      expirationDate: string
    }
  | {
      kind: "boleto"
      enrollmentId: string
      bankSlipUrl: string | null
      identificationField: string | null
      /** Compra parcelada no boleto: parcelas do carnê emitido. */
      carne?: {
        count: number
        parcelas: Array<{
          number: number
          amount: number
          dueDate: string
          invoiceUrl: string | null
        }>
      }
    }
  | { kind: "approved"; enrollmentId: string }
  | { kind: "declined"; message: string }
  // CPF já cadastrado: o aluno precisa logar para concluir (gate server-side).
  | { kind: "needs_login"; message: string; loginUrl: string }

type FieldErrors = Partial<Record<keyof FormState, string>>

const INITIAL: FormState = {
  nome: "",
  email: "",
  telefone: "",
  cpf: "",
  endereco: "",
  ccHolderName: "",
  ccNumber: "",
  ccExpiry: "",
  ccCcv: "",
  ccCep: "",
  ccAddrNum: "",
}

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
  const d = v.replace(/\D/g, "").slice(0, 19)
  return d.replace(/(.{4})/g, "$1 ").trim()
}

function formatExpiry(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 4)
  if (d.length <= 2) return d
  return `${d.slice(0, 2)}/${d.slice(2)}`
}

function formatCep(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function PmbCheckoutForm({
  courseId,
  packageId,
  couponCode,
  initPath = "/api/checkout",
  amount,
  cardMaxInstallments,
  isMonthly,
  prefill,
}: PmbCheckoutFormProps) {
  const [form, setForm] = useState<FormState>(() =>
    prefill
      ? {
          ...INITIAL,
          nome: prefill.nome,
          email: prefill.email,
          cpf: formatCpf(prefill.cpf),
          telefone: formatPhone(prefill.telefone),
        }
      : INITIAL,
  )
  const [method, setMethod] = useState<Method>("PIX")
  const [status, setStatus] = useState<Status>({ kind: "idle" })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [termsError, setTermsError] = useState(false)
  const [cardInstallments, setCardInstallments] = useState(1)
  const [boletoMode, setBoletoMode] = useState<"avista" | "parcelado">("avista")
  const [boletoInstallments, setBoletoInstallments] = useState(2)

  // Tetos de parcelamento calculados no client SÓ para montar o seletor — o
  // servidor re-valida contra o valor real (regras: boleto R$50 mín/6 máx;
  // cartão teto do admin + R$5 mín). Sem amount (fluxos antigos) = à vista.
  const cardCap =
    !isMonthly && amount && amount > 0
      ? pmbMaxCardInstallments(amount, cardMaxInstallments ?? 1)
      : 1
  const boletoCap =
    !isMonthly && amount && amount > 0 ? pmbMaxBoletoInstallments(amount) : 1

  function setField<K extends keyof FormState>(key: K, value: string) {
    setForm((p) => ({ ...p, [key]: value }))
    if (fieldErrors[key]) {
      setFieldErrors((p) => ({ ...p, [key]: undefined }))
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

    // Parcelas escolhidas para o método ativo (clampadas ao teto local; o
    // servidor re-valida de qualquer forma). 1 = à vista, campo omitido.
    const chosenInstallments =
      method === "CREDIT_CARD"
        ? Math.min(cardInstallments, cardCap)
        : method === "BOLETO" && boletoMode === "parcelado"
          ? Math.min(Math.max(boletoInstallments, 2), boletoCap)
          : 1

    const body: Record<string, unknown> = {
      ...(packageId ? { packageId } : { courseId }),
      couponCode: couponCode ?? undefined,
      nome: form.nome,
      email: form.email,
      cpf: form.cpf,
      fone: form.telefone,
      endereco: form.endereco || undefined,
      paymentMethod: method,
      ...(chosenInstallments > 1 ? { installments: chosenInstallments } : {}),
      acceptedTerms: true,
    }

    if (method === "CREDIT_CARD") {
      const [mm, yy] = form.ccExpiry.split("/")
      body.creditCard = {
        holderName: form.ccHolderName,
        number: form.ccNumber.replace(/\s/g, ""),
        expiryMonth: mm ?? "",
        expiryYear: yy ?? "",
        ccv: form.ccCcv,
      }
      body.creditCardHolder = {
        postalCode: form.ccCep.replace(/\D/g, ""),
        addressNumber: form.ccAddrNum,
      }
    }

    try {
      const res = await fetch(initPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const payload = await res.json()

      if (!res.ok) {
        if (payload.code === "VALIDATION_ERROR" && payload.details) {
          const mapped: FieldErrors = {}
          for (const [field, msgs] of Object.entries(payload.details)) {
            const first = Array.isArray(msgs) ? msgs[0] : undefined
            if (!first) continue
            // Mapeia campos do backend → form
            if (field === "fone") mapped.telefone = first
            else if (field === "creditCard") mapped.ccNumber = first
            else if (field === "creditCardHolder") mapped.ccCep = first
            else if (field in INITIAL) mapped[field as keyof FormState] = first
          }
          setFieldErrors(mapped)
          setStatus({ kind: "error", message: "Revise os campos destacados." })
        } else if (payload.code === "CPF_ALREADY_REGISTERED") {
          // CPF já tem cadastro com acesso: pede login em vez de criar nova
          // compra como convidado.
          setStatus({
            kind: "needs_login",
            message:
              payload.error ??
              "Este CPF já possui cadastro. Faça login para concluir a compra.",
            loginUrl:
              typeof payload.loginUrl === "string" ? payload.loginUrl : "/login",
          })
        } else {
          setStatus({
            kind: "error",
            message: payload.error ?? "Não foi possível concluir o pagamento.",
          })
        }
        return
      }

      const d = payload.data
      switch (d.mode) {
        case "pix":
          if (!d.pix?.encodedImage) {
            setStatus({
              kind: "error",
              message: "Não foi possível gerar o QR Code do PIX.",
            })
            return
          }
          setStatus({
            kind: "pix",
            enrollmentId: d.enrollmentId,
            qrImageBase64: d.pix.encodedImage,
            payload: d.pix.payload,
            expirationDate: d.pix.expirationDate,
          })
          return
        case "boleto":
          setStatus({
            kind: "boleto",
            enrollmentId: d.enrollmentId,
            bankSlipUrl: d.bankSlipUrl,
            identificationField: d.identificationField,
            carne: d.carne ?? undefined,
          })
          return
        case "credit_card_result": {
          const st = String(d.status ?? "").toUpperCase()
          // Estados de sucesso: cobrança capturada e/ou já recebida.
          if (
            st === "CONFIRMED" ||
            st === "RECEIVED" ||
            st === "RECEIVED_IN_CASH"
          ) {
            setStatus({ kind: "approved", enrollmentId: d.enrollmentId })
            window.location.href = `/checkout/confirmacao?enrollment_id=${d.enrollmentId}`
            return
          }
          // Estados de espera (Asaas autorizou mas precisa analisar risco
          // ou aguarda compensação). A página de confirmação trata.
          if (
            st === "PENDING" ||
            st === "AWAITING_RISK_ANALYSIS" ||
            st === "APPROVED_BY_RISK_ANALYSIS"
          ) {
            window.location.href = `/checkout/confirmacao?enrollment_id=${d.enrollmentId}`
            return
          }
          // Tudo o mais (REPROVED_BY_RISK_ANALYSIS, CHARGEBACK, etc.) é recusa.
          setStatus({
            kind: "declined",
            message:
              "Cartão recusado. Confira os dados ou tente outro método de pagamento.",
          })
          return
        }
        case "redirect":
          if (d.initPoint) {
            window.location.href = d.initPoint
            return
          }
        // fall through
        default:
          setStatus({
            kind: "error",
            message: "Resposta inesperada do servidor.",
          })
      }
    } catch (err) {
      clientLogger.error({ err: String(err), event: "pmb_checkout.submit_failed", courseId, hasCoupon: !!couponCode }, "pmb-checkout submit falhou")
      setStatus({
        kind: "error",
        message: "Erro de conexão. Tente novamente.",
      })
    }
  }

  // Polling de status pra PIX e Boleto: detecta quando webhook marcar ACTIVE.
  useEffect(() => {
    const id =
      status.kind === "pix" || status.kind === "boleto"
        ? status.enrollmentId
        : null
    if (!id) return

    let cancelled = false
    const interval = setInterval(async () => {
      if (cancelled) return
      try {
        const res = await fetch(`/api/checkout/status?enrollment_id=${id}`)
        const data = await res.json()
        if (data.data?.paid) {
          cancelled = true
          window.location.href = `/checkout/confirmacao?enrollment_id=${id}`
        }
      } catch {
        // ignora — tenta de novo no próximo tick
      }
    }, 5000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [status])

  const submitting = status.kind === "submitting"

  // ─── Telas de resultado (substituem o form quando há um modo ativo) ───
  if (status.kind === "pix") {
    return (
      <PixResult status={status} onBack={() => setStatus({ kind: "idle" })} />
    )
  }
  if (status.kind === "boleto") {
    return (
      <BoletoResult status={status} onBack={() => setStatus({ kind: "idle" })} />
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
      {/* SEÇÃO 1: DADOS PESSOAIS ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-pmb-lime-50)] font-mono text-sm font-semibold text-[var(--color-pmb-green)]">
            01
          </div>
          <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">
            Seus dados
          </h2>
        </div>

        <div className="mt-6 space-y-5">
          <FieldText
            id="nome"
            label="Nome completo"
            placeholder="Como aparece no seu documento"
            icon={User}
            value={form.nome}
            onChange={(v) => setField("nome", v)}
            error={fieldErrors.nome}
            disabled={submitting}
            required
          />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <FieldText
              id="email"
              label="Email"
              type="email"
              placeholder="voce@email.com"
              icon={Mail}
              value={form.email}
              onChange={(v) => setField("email", v)}
              error={fieldErrors.email}
              disabled={submitting}
              required
            />
            <FieldText
              id="telefone"
              label="Telefone (WhatsApp)"
              type="tel"
              placeholder="(11) 99999-9999"
              icon={Phone}
              value={form.telefone}
              onChange={(v) => setField("telefone", formatPhone(v))}
              error={fieldErrors.telefone}
              disabled={submitting}
              required
            />
          </div>
          <FieldText
            id="cpf"
            label="CPF"
            placeholder="000.000.000-00"
            icon={IdCard}
            mono
            value={form.cpf}
            onChange={(v) => setField("cpf", formatCpf(v))}
            error={fieldErrors.cpf}
            disabled={submitting}
            required
          />
          <FieldText
            id="endereco"
            label="Endereço (opcional)"
            placeholder="Rua, número, bairro, cidade, UF"
            icon={MapPin}
            value={form.endereco}
            onChange={(v) => setField("endereco", v)}
            disabled={submitting}
          />
        </div>
      </div>

      {/* SEÇÃO 2: FORMA DE PAGAMENTO ──────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-pmb-lime-50)] font-mono text-sm font-semibold text-[var(--color-pmb-green)]">
            02
          </div>
          <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">
            Forma de pagamento
          </h2>
        </div>

        <div className="mt-6 space-y-3">
          <MethodButton
            active={method === "PIX"}
            onClick={() => setMethod("PIX")}
            icon={QrCode}
            label="PIX"
            hint="Aprovação imediata"
          />
          <MethodButton
            active={method === "CREDIT_CARD"}
            onClick={() => setMethod("CREDIT_CARD")}
            icon={CreditCard}
            label="Cartão de Crédito"
            hint="Aprovação na hora"
          />
          <MethodButton
            active={method === "BOLETO"}
            onClick={() => setMethod("BOLETO")}
            icon={Receipt}
            label="Boleto Bancário"
            hint="Compensa em até 3 dias úteis"
          />
        </div>

        {method === "CREDIT_CARD" && (
          <div className="mt-6 space-y-5 border-t border-gray-100 pt-6">
            <FieldText
              id="ccHolderName"
              label="Nome impresso no cartão"
              placeholder="Como aparece no cartão"
              icon={User}
              value={form.ccHolderName}
              onChange={(v) => setField("ccHolderName", v.toUpperCase())}
              error={fieldErrors.ccHolderName}
              disabled={submitting}
              required
            />
            <FieldText
              id="ccNumber"
              label="Número do cartão"
              placeholder="0000 0000 0000 0000"
              icon={CreditCard}
              mono
              inputMode="numeric"
              value={form.ccNumber}
              onChange={(v) => setField("ccNumber", formatCardNumber(v))}
              error={fieldErrors.ccNumber}
              disabled={submitting}
              required
            />
            <div className="grid grid-cols-2 gap-5">
              <FieldText
                id="ccExpiry"
                label="Validade (MM/AA)"
                placeholder="12/28"
                mono
                inputMode="numeric"
                value={form.ccExpiry}
                onChange={(v) => setField("ccExpiry", formatExpiry(v))}
                error={fieldErrors.ccExpiry}
                disabled={submitting}
                required
              />
              <FieldText
                id="ccCcv"
                label="CCV"
                placeholder="123"
                mono
                inputMode="numeric"
                value={form.ccCcv}
                onChange={(v) =>
                  setField("ccCcv", v.replace(/\D/g, "").slice(0, 4))
                }
                error={fieldErrors.ccCcv}
                disabled={submitting}
                required
              />
            </div>
            <div className="grid grid-cols-[1fr_140px] gap-5">
              <FieldText
                id="ccCep"
                label="CEP de cobrança"
                placeholder="00000-000"
                mono
                inputMode="numeric"
                value={form.ccCep}
                onChange={(v) => setField("ccCep", formatCep(v))}
                error={fieldErrors.ccCep}
                disabled={submitting}
                required
              />
              <FieldText
                id="ccAddrNum"
                label="Número"
                placeholder="123"
                value={form.ccAddrNum}
                onChange={(v) => setField("ccAddrNum", v)}
                error={fieldErrors.ccAddrNum}
                disabled={submitting}
                required
              />
            </div>
            {cardCap > 1 && amount && amount > 0 && (
              <div>
                <Label htmlFor="cc-parcelas">Parcelamento</Label>
                <select
                  id="cc-parcelas"
                  value={Math.min(cardInstallments, cardCap)}
                  onChange={(e) => setCardInstallments(Number(e.target.value))}
                  disabled={submitting}
                  className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)] disabled:opacity-60"
                >
                  {Array.from({ length: cardCap }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n === 1
                        ? `1x de ${brl(amount)} à vista`
                        : `${n}x de ${brl(perInstallment(amount, n))} sem juros`}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-gray-400">
                  Em até {cardCap}x sem juros no cartão.
                </p>
              </div>
            )}
          </div>
        )}

        {method === "PIX" && (
          <p className="mt-6 rounded-xl bg-[var(--color-pmb-lime-50)]/40 p-4 text-xs text-[var(--color-pmb-green-700)]">
            Você verá o QR Code logo abaixo. Após o pagamento, sua matrícula é
            ativada automaticamente em até 1 minuto.
          </p>
        )}

        {method === "BOLETO" && (
          <div className="mt-6 space-y-4 border-t border-gray-100 pt-6">
            {boletoCap > 1 && amount && amount > 0 && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setBoletoMode("avista")}
                    disabled={submitting}
                    className={`rounded-xl border p-3 text-left text-sm transition-all ${
                      boletoMode === "avista"
                        ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]/50 font-medium text-[var(--color-pmb-green-900)]"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    À vista
                    <span className="mt-0.5 block text-xs font-normal text-gray-500">
                      1 boleto de {brl(amount)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBoletoMode("parcelado")}
                    disabled={submitting}
                    className={`rounded-xl border p-3 text-left text-sm transition-all ${
                      boletoMode === "parcelado"
                        ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)]/50 font-medium text-[var(--color-pmb-green-900)]"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    Parcelado (carnê)
                    <span className="mt-0.5 block text-xs font-normal text-gray-500">
                      em até {boletoCap}x de{" "}
                      {brl(perInstallment(amount, boletoCap))}
                    </span>
                  </button>
                </div>

                {boletoMode === "parcelado" && (
                  <div>
                    <Label htmlFor="boleto-parcelas">Número de boletos</Label>
                    <select
                      id="boleto-parcelas"
                      value={Math.min(Math.max(boletoInstallments, 2), boletoCap)}
                      onChange={(e) =>
                        setBoletoInstallments(Number(e.target.value))
                      }
                      disabled={submitting}
                      className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)] disabled:opacity-60"
                    >
                      {Array.from({ length: boletoCap - 1 }, (_, i) => i + 2).map(
                        (n) => (
                          <option key={n} value={n}>
                            {n}x de {brl(perInstallment(amount, n))} no boleto
                          </option>
                        ),
                      )}
                    </select>
                    <p className="mt-1 text-[11px] text-gray-400">
                      O 1º boleto vence em 3 dias e libera o acesso; os demais
                      vencem mensalmente. Parcela mínima de R$ 50.
                    </p>
                  </div>
                )}
              </div>
            )}
            <p className="rounded-xl bg-[var(--color-pmb-lime-50)]/40 p-4 text-xs text-[var(--color-pmb-green-700)]">
              {boletoMode === "parcelado" && boletoCap > 1
                ? "Geramos todos os boletos do carnê imediatamente. O acesso é liberado após a compensação do 1º boleto (até 3 dias úteis)."
                : "Geramos o boleto imediatamente. A compensação leva até 3 dias úteis após o pagamento."}
            </p>
          </div>
        )}
      </div>

      {/* ERROS / DECLINED ─────────────────────────────────────────────── */}
      {(status.kind === "error" || status.kind === "declined") && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{status.message}</span>
          </div>
          {status.kind === "declined" && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStatus({ kind: "idle" })}
              className="w-full"
            >
              Tentar outra forma de pagamento
            </Button>
          )}
        </div>
      )}

      {/* CPF JÁ CADASTRADO → LOGIN ─────────────────────────────────────── */}
      {status.kind === "needs_login" && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{status.message}</span>
          </div>
          <Button
            type="button"
            onClick={() => {
              // Volta para esta página após o login (login aceita CPF ou email
              // e tem "Esqueci minha senha" para quem não lembra a senha).
              const callback = encodeURIComponent(
                window.location.pathname + window.location.search,
              )
              window.location.href = `${status.loginUrl}?callbackUrl=${callback}`
            }}
            className="w-full bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
          >
            <Lock className="mr-2 h-4 w-4" />
            Fazer login para continuar
          </Button>
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
        <Button
          type="submit"
          size="lg"
          disabled={submitting}
          className="w-full bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
        >
          <Lock className="mr-2 h-4 w-4" />
          {submitting ? "Processando..." : "Finalizar Compra"}
        </Button>
        <p className="text-center text-xs text-gray-500">
          Pagamento processado com segurança. Seus dados não são armazenados.
        </p>
      </div>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Subcomponentes
// ─────────────────────────────────────────────────────────────────────────

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
          active
            ? "bg-[var(--color-pmb-green)] text-white"
            : "bg-gray-100 text-gray-600"
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-[var(--color-pmb-green-900)]">
          {label}
        </div>
        <div className="text-xs text-gray-500">{hint}</div>
      </div>
      <div
        className={`h-5 w-5 shrink-0 rounded-full border-2 ${
          active
            ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-green)]"
            : "border-gray-300 bg-white"
        }`}
      >
        {active && (
          <div className="h-full w-full rounded-full border-2 border-white bg-[var(--color-pmb-green)]" />
        )}
      </div>
    </button>
  )
}

function PixResult({
  status,
  onBack,
}: {
  status: Extract<Status, { kind: "pix" }>
  onBack: () => void
}) {
  const [copied, setCopied] = useState(false)
  async function copyPayload() {
    try {
      await navigator.clipboard.writeText(status.payload)
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
        <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">
          Pague com PIX
        </h2>
      </div>
      <p className="mt-2 text-sm text-gray-600">
        Escaneie o QR Code abaixo ou copie o código para concluir o pagamento.
      </p>

      <div className="mt-6 flex justify-center">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${status.qrImageBase64}`}
            alt="QR Code PIX"
            width={240}
            height={240}
            className="h-60 w-60"
          />
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <Label>Código PIX copia e cola</Label>
        <div className="flex gap-2">
          <Input
            value={status.payload}
            readOnly
            className="font-mono text-xs"
          />
          <Button
            type="button"
            onClick={copyPayload}
            variant="outline"
            className="shrink-0"
          >
            <Copy className="mr-2 h-4 w-4" />
            {copied ? "Copiado!" : "Copiar"}
          </Button>
        </div>
      </div>

      <div className="mt-6 flex items-start gap-2 rounded-xl bg-[var(--color-pmb-lime-50)]/40 p-4 text-sm text-[var(--color-pmb-green-700)]">
        <span className="mt-0.5 inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--color-pmb-green)]" />
        <span>
          Aguardando confirmação do pagamento… Você será redirecionado
          automaticamente assim que recebermos a confirmação.
        </span>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="mt-4 w-full text-center text-sm font-medium text-[var(--color-pmb-green)] underline-offset-4 hover:underline"
      >
        Escolher outra forma de pagamento
      </button>
    </div>
  )
}

function BoletoResult({
  status,
  onBack,
}: {
  status: Extract<Status, { kind: "boleto" }>
  onBack: () => void
}) {
  const [copied, setCopied] = useState(false)
  async function copyField() {
    if (!status.identificationField) return
    try {
      await navigator.clipboard.writeText(status.identificationField)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignora
    }
  }
  const carne = status.carne ?? null

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <div className="flex items-center gap-2">
        <Receipt className="h-5 w-5 text-[var(--color-pmb-green)]" />
        <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">
          {carne ? `Carnê gerado — ${carne.count}x no boleto` : "Pague com boleto"}
        </h2>
      </div>
      <p className="mt-2 text-sm text-gray-600">
        {carne
          ? "Pague o 1º boleto para liberar o acesso. As demais parcelas vencem mensalmente."
          : "Copie a linha digitável ou abra o boleto para pagar pelo banco/app."}
      </p>

      {carne && (
        <ul className="mt-6 space-y-2">
          {carne.parcelas.map((p) => (
            <li
              key={p.number}
              className="flex items-center justify-between rounded-xl border border-gray-200 p-3 text-sm"
            >
              <div>
                <span className="font-medium text-gray-900">
                  Parcela {p.number} · {brl(p.amount)}
                </span>
                <span className="ml-2 text-xs text-gray-500">
                  vence {new Date(p.dueDate).toLocaleDateString("pt-BR")}
                </span>
              </div>
              {p.number === 1 ? (
                <span className="rounded-full bg-[var(--color-pmb-lime-50)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-pmb-green-700)]">
                  Pague agora
                </span>
              ) : p.invoiceUrl ? (
                <a
                  href={p.invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-[var(--color-pmb-green)] underline-offset-4 hover:underline"
                >
                  Ver boleto
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {status.identificationField && (
        <div className="mt-6 space-y-2">
          <Label>Linha digitável</Label>
          <div className="flex gap-2">
            <Input
              value={status.identificationField}
              readOnly
              className="font-mono text-xs"
            />
            <Button
              type="button"
              onClick={copyField}
              variant="outline"
              className="shrink-0"
            >
              <Copy className="mr-2 h-4 w-4" />
              {copied ? "Copiado!" : "Copiar"}
            </Button>
          </div>
        </div>
      )}

      {status.bankSlipUrl && (
        <a
          href={status.bankSlipUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-[var(--color-pmb-green)] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--color-pmb-green-700)]"
        >
          {carne ? "Abrir 1º boleto em PDF" : "Abrir boleto em PDF"}
        </a>
      )}

      <div className="mt-6 flex items-start gap-2 rounded-xl bg-[var(--color-pmb-lime-50)]/40 p-4 text-sm text-[var(--color-pmb-green-700)]">
        <span className="mt-0.5 inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--color-pmb-green)]" />
        <span>
          {carne
            ? "Aguardando o pagamento do 1º boleto. Depois de matriculado, acompanhe e pague as demais parcelas em Meus Pagamentos (/aluno) — você também recebe cada boleto por email."
            : "Aguardando o pagamento. A compensação leva até 3 dias úteis. Você receberá um email quando a matrícula for ativada."}
        </span>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="mt-4 w-full text-center text-sm font-medium text-[var(--color-pmb-green)] underline-offset-4 hover:underline"
      >
        Escolher outra forma de pagamento
      </button>
    </div>
  )
}
