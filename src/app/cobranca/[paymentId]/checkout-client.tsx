"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { AsaasBillingInfo } from "@/lib/asaas/types"

interface Props {
  paymentId: string
  billingType: string
  amount: number
  /** Teto de parcelas no cartão para esta cobrança (1 = à vista). */
  maxInstallments: number
  /**
   * Esta é a 1ª mensalidade (unidade ainda não ativada). Muda só o AVISO: numa
   * mensalidade corrente é preciso deixar claro que parcelar divide ESTA
   * cobrança e não suspende as dos próximos meses.
   */
  isFirstCharge: boolean
}

type Tab = "PIX" | "BOLETO" | "CARTAO"

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

// ── PIX Tab ─────────────────────────────────────────────────────────────────

function PixTab({
  paymentId,
  billingInfo,
  onPaid,
}: {
  paymentId: string
  billingInfo: AsaasBillingInfo | null
  onPaid: () => void
}) {
  const [copied, setCopied] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const pix = billingInfo?.pix

  useEffect(() => {
    if (!pix) return
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/cobranca/${paymentId}`)
        const json = await res.json()
        const status = json.data?.status
        if (status === "RECEIVED" || status === "CONFIRMED") {
          if (pollRef.current) clearInterval(pollRef.current)
          onPaid()
        }
      } catch {
        // silently ignore
      }
    }, 5000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [paymentId, onPaid, pix])

  async function copy() {
    if (!pix?.payload) return
    try {
      await navigator.clipboard.writeText(pix.payload)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      // fallback
      const el = document.createElement("textarea")
      el.value = pix.payload
      document.body.appendChild(el)
      el.select()
      document.execCommand("copy")
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    }
  }

  if (!pix) {
    // billingInfo loaded but pix is null → PIX not available for this payment
    if (billingInfo !== null) {
      return (
        <div className="flex flex-col items-center gap-4 py-8 text-center text-gray-500">
          <p className="text-sm font-medium">PIX indisponível para esta cobrança.</p>
          {/* Não mandar "use o Boleto" sem saber se ele existe: numa cobrança
              de assinatura no cartão o boleto TAMBÉM não é gerado, e o texto
              antigo apontava para uma saída que não estava lá. */}
          <p className="text-xs text-gray-400">
            {billingInfo?.bankSlip
              ? "Use o Boleto ou o Cartão de crédito para pagar."
              : "Use o Cartão de crédito, ou libere as outras formas de pagamento acima."}
          </p>
        </div>
      )
    }
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-gray-500">
        <Spinner />
        <span className="text-sm">Gerando QR Code PIX...</span>
        <p className="text-xs text-gray-400">
          Isso pode levar alguns segundos.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* QR code */}
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/png;base64,${pix.encodedImage}`}
          alt="QR Code PIX"
          className="h-48 w-48"
        />
      </div>

      <p className="text-center text-xs text-gray-500">
        Escaneie o QR code com o app do seu banco
      </p>

      {/* Copia e cola */}
      <div className="w-full">
        <p className="mb-1 text-xs font-semibold text-gray-600">PIX copia e cola</p>
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
          <p className="flex-1 truncate font-mono text-[10px] text-gray-600">
            {pix.payload}
          </p>
          <button
            type="button"
            onClick={copy}
            className="shrink-0 rounded-md bg-[var(--color-pmb-green)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-pmb-green-700)]"
          >
            {copied ? "Copiado!" : "Copiar"}
          </button>
        </div>
      </div>

      {/* Expiration */}
      {pix.expirationDate && (
        <p className="text-center text-xs text-gray-400">
          Válido até{" "}
          {new Date(pix.expirationDate).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}

      {/* Polling indicator */}
      <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
        <span className="text-xs text-amber-700">Aguardando pagamento...</span>
      </div>
    </div>
  )
}

// ── Boleto Tab ───────────────────────────────────────────────────────────────

function BoletoTab({ billingInfo }: { billingInfo: AsaasBillingInfo | null }) {
  const [copied, setCopied] = useState(false)

  const bankSlip = billingInfo?.bankSlip

  async function copy() {
    if (!bankSlip?.identificationField) return
    try {
      await navigator.clipboard.writeText(bankSlip.identificationField)
    } catch {
      const el = document.createElement("textarea")
      el.value = bankSlip.identificationField
      document.body.appendChild(el)
      el.select()
      document.execCommand("copy")
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  if (!bankSlip) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-gray-500">
        <Spinner />
        <span className="text-sm">Gerando boleto...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-1 text-xs font-semibold text-gray-600">Linha digitável</p>
        <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="flex-1 font-mono text-xs leading-relaxed text-gray-700">
            {bankSlip.identificationField}
          </p>
          <button
            type="button"
            onClick={copy}
            className="shrink-0 rounded-md bg-[var(--color-pmb-green)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-pmb-green-700)]"
          >
            {copied ? "Copiado!" : "Copiar"}
          </button>
        </div>
      </div>

      {bankSlip.bankSlipUrl && (
        <a
          href={bankSlip.bankSlipUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          Abrir PDF do boleto
        </a>
      )}

      <p className="text-center text-xs text-gray-400">
        O pagamento pode levar até 3 dias úteis para ser confirmado
      </p>
    </div>
  )
}

// ── Card Tab ─────────────────────────────────────────────────────────────────

interface CardForm {
  holderName: string
  number: string
  expiryMonth: string
  expiryYear: string
  ccv: string
  name: string
  email: string
  cpfCnpj: string
  postalCode: string
  addressNumber: string
  phone: string
}

function CardTab({
  paymentId,
  onPaid,
  amount,
  maxInstallments,
  isFirstCharge,
}: {
  paymentId: string
  onPaid: () => void
  amount: number
  maxInstallments: number
  isFirstCharge: boolean
}) {
  const [installmentCount, setInstallmentCount] = useState(1)
  const [form, setForm] = useState<CardForm>({
    holderName: "",
    number: "",
    expiryMonth: "",
    expiryYear: "",
    ccv: "",
    name: "",
    email: "",
    cpfCnpj: "",
    postalCode: "",
    addressNumber: "",
    phone: "",
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(field: keyof CardForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function formatCardNumber(raw: string): string {
    const digits = raw.replace(/\D/g, "").slice(0, 16)
    return digits.replace(/(.{4})/g, "$1 ").trim()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await fetch(`/api/cobranca/${paymentId}/pay-card`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creditCard: {
            holderName: form.holderName,
            number: form.number.replace(/\s/g, ""),
            expiryMonth: form.expiryMonth,
            expiryYear: form.expiryYear,
            ccv: form.ccv,
          },
          creditCardHolderInfo: {
            name: form.name,
            email: form.email,
            cpfCnpj: form.cpfCnpj,
            postalCode: form.postalCode,
            addressNumber: form.addressNumber,
            phone: form.phone,
          },
          installmentCount,
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? "Falha ao processar pagamento")
        return
      }

      const status = json.data?.status
      if (status === "RECEIVED" || status === "CONFIRMED") {
        onPaid()
      } else if (json.data?.pending) {
        // Cartão aceito mas em análise (ex.: AWAITING_RISK_ANALYSIS). NÃO peça
        // para tentar de novo — geraria cobrança em duplicidade.
        setError(
          "Pagamento recebido e em análise pela operadora. Assim que for aprovado, sua conta será ativada automaticamente — não é necessário pagar novamente.",
        )
      } else {
        setError("Pagamento não confirmado. Verifique os dados do cartão e tente novamente.")
      }
    } catch {
      setError("Erro de rede ao processar pagamento")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Dados do cartão
        </p>
        <div className="flex flex-col gap-3">
          <Field label="Nome no cartão">
            <input
              type="text"
              required
              value={form.holderName}
              onChange={(e) => set("holderName", e.target.value.toUpperCase())}
              placeholder="COMO IMPRESSO NO CARTÃO"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-pmb-green)] focus-visible:ring-offset-2"
              autoComplete="cc-name"
            />
          </Field>
          <Field label="Número do cartão">
            <input
              type="text"
              required
              inputMode="numeric"
              value={form.number}
              onChange={(e) => set("number", formatCardNumber(e.target.value))}
              placeholder="0000 0000 0000 0000"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-pmb-green)] focus-visible:ring-offset-2 font-mono tracking-widest"
              autoComplete="cc-number"
              maxLength={19}
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Mês">
              <input
                type="text"
                required
                inputMode="numeric"
                value={form.expiryMonth}
                onChange={(e) =>
                  set("expiryMonth", e.target.value.replace(/\D/g, "").slice(0, 2))
                }
                placeholder="MM"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-pmb-green)] focus-visible:ring-offset-2 font-mono"
                maxLength={2}
                autoComplete="cc-exp-month"
              />
            </Field>
            <Field label="Ano">
              <input
                type="text"
                required
                inputMode="numeric"
                value={form.expiryYear}
                onChange={(e) =>
                  set("expiryYear", e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                placeholder="AAAA"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-pmb-green)] focus-visible:ring-offset-2 font-mono"
                maxLength={4}
                autoComplete="cc-exp-year"
              />
            </Field>
            <Field label="CVV">
              <input
                type="text"
                required
                inputMode="numeric"
                value={form.ccv}
                onChange={(e) =>
                  set("ccv", e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                placeholder="000"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-pmb-green)] focus-visible:ring-offset-2 font-mono"
                maxLength={4}
                autoComplete="cc-csc"
              />
            </Field>
          </div>
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Dados do titular
        </p>
        <div className="flex flex-col gap-3">
          <Field label="Nome completo">
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Seu nome completo"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-pmb-green)] focus-visible:ring-offset-2"
              autoComplete="name"
            />
          </Field>
          <Field label="E-mail">
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="seu@email.com"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-pmb-green)] focus-visible:ring-offset-2"
              autoComplete="email"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="CPF / CNPJ">
              <input
                type="text"
                required
                inputMode="numeric"
                value={form.cpfCnpj}
                onChange={(e) =>
                  set("cpfCnpj", e.target.value.replace(/\D/g, "").slice(0, 14))
                }
                placeholder="000.000.000-00"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-pmb-green)] focus-visible:ring-offset-2 font-mono"
              />
            </Field>
            <Field label="Telefone">
              <input
                type="text"
                required
                inputMode="numeric"
                value={form.phone}
                onChange={(e) =>
                  set("phone", e.target.value.replace(/\D/g, "").slice(0, 11))
                }
                placeholder="(00) 00000-0000"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-pmb-green)] focus-visible:ring-offset-2 font-mono"
                autoComplete="tel"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="CEP">
              <input
                type="text"
                required
                inputMode="numeric"
                value={form.postalCode}
                onChange={(e) =>
                  set("postalCode", e.target.value.replace(/\D/g, "").slice(0, 8))
                }
                placeholder="00000-000"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-pmb-green)] focus-visible:ring-offset-2 font-mono"
                autoComplete="postal-code"
              />
            </Field>
            <Field label="Número">
              <input
                type="text"
                required
                value={form.addressNumber}
                onChange={(e) => set("addressNumber", e.target.value)}
                placeholder="123"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-pmb-green)] focus-visible:ring-offset-2"
                autoComplete="address-line2"
              />
            </Field>
          </div>
        </div>
      </div>

      {maxInstallments > 1 && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Parcelamento
          </p>
          <Field label="Parcelas">
            <select
              value={installmentCount}
              onChange={(e) => setInstallmentCount(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-pmb-green)] focus-visible:ring-offset-2"
            >
              {Array.from({ length: maxInstallments }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n === 1
                    ? `À vista — ${formatBRL(amount)}`
                    : `${n}x de ${formatBRL(Math.round((amount / n) * 100) / 100)}`}
                </option>
              ))}
            </select>
          </Field>
          {installmentCount > 1 && !isFirstCharge && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
              O parcelamento divide <strong>apenas esta cobrança</strong>. As
              mensalidades dos próximos meses continuam sendo geradas
              normalmente, no valor cheio.
            </p>
          )}
          <p className="mt-1 text-[11px] text-gray-400">
            Sem juros. Cobrado no seu cartão de crédito.
          </p>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="flex items-center justify-center gap-2 rounded-xl bg-[var(--color-pmb-green)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-pmb-green-700)] disabled:opacity-60"
      >
        {submitting ? (
          <>
            <Spinner white />
            Processando...
          </>
        ) : (
          "Pagar com cartão"
        )}
      </button>

      <p className="text-center text-[11px] text-gray-400">
        Seus dados são protegidos com criptografia de ponta a ponta.
      </p>
    </form>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  )
}

function Spinner({ white = false }: { white?: boolean }) {
  return (
    <svg
      className={`h-4 w-4 animate-spin ${white ? "text-white" : "text-gray-400"}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function CheckoutClient({
  paymentId,
  billingType,
  amount,
  maxInstallments,
  isFirstCharge,
}: Props) {
  const [tab, setTab] = useState<Tab>("PIX")
  const [billingInfo, setBillingInfo] = useState<AsaasBillingInfo | null>(null)
  const [billingLoading, setBillingLoading] = useState(true)
  const [billingError, setBillingError] = useState<string | null>(null)
  const [paid, setPaid] = useState(false)
  // O `billingType` chega do servidor, mas pode ser AMPLIADO aqui (ver
  // `liberarOutrosMetodos`). Sem estado local, destravar a cobrança não
  // recalcularia as abas e o pagador continuaria vendo só "Cartão".
  const [tipoEfetivo, setTipoEfetivo] = useState(billingType)
  const [liberando, setLiberando] = useState(false)
  const [erroLiberar, setErroLiberar] = useState<string | null>(null)

  const fetchBillingInfo = useCallback(async () => {
    setBillingLoading(true)
    setBillingError(null)
    try {
      const res = await fetch(`/api/cobranca/${paymentId}/billing-info`)
      const json = await res.json()
      if (!res.ok) {
        setBillingError(json.error ?? "Erro ao carregar informações de pagamento")
        return
      }
      setBillingInfo(json.data as AsaasBillingInfo)
    } catch {
      setBillingError("Erro de rede ao carregar informações de pagamento")
    } finally {
      setBillingLoading(false)
    }
  }, [paymentId])

  useEffect(() => {
    fetchBillingInfo()
  }, [fetchBillingInfo])

  const onPaid = useCallback(() => setPaid(true), [])

  // Auto-switch to BOLETO when PIX is not available after retries
  useEffect(() => {
    if (!billingInfo) return
    if (!billingInfo.pix && billingInfo.bankSlip) {
      setTab("BOLETO")
    }
  }, [billingInfo])

  /**
   * Destrava a cobrança presa a um único meio. Uma mensalidade de assinatura no
   * CARTÃO não gera PIX nem boleto: quando o emissor recusava o cartão, a
   * unidade ficava sem NENHUMA forma de pagar — era o que estava acontecendo em
   * produção. Aqui ela pede para aceitar qualquer meio, e as abas se recalculam.
   */
  const liberarOutrosMetodos = useCallback(async () => {
    setLiberando(true)
    setErroLiberar(null)
    try {
      const res = await fetch(`/api/cobranca/${paymentId}/liberar-metodos`, {
        method: "POST",
      })
      const json = await res.json()
      if (!res.ok) {
        setErroLiberar(json.error ?? "Não foi possível liberar outras formas de pagamento.")
        return
      }
      setTipoEfetivo(json.data.billingType as string)
      setTab("PIX")
      await fetchBillingInfo()
    } catch {
      setErroLiberar("Erro de rede. Tente novamente.")
    } finally {
      setLiberando(false)
    }
  }, [paymentId, fetchBillingInfo])

  const tabs = [
    {
      id: "PIX" as Tab,
      label: "PIX",
      available: tipoEfetivo === "PIX" || tipoEfetivo === "UNDEFINED",
    },
    {
      id: "BOLETO" as Tab,
      label: "Boleto",
      available: tipoEfetivo === "BOLETO" || tipoEfetivo === "UNDEFINED",
    },
    {
      id: "CARTAO" as Tab,
      label: "Cartão",
      available: tipoEfetivo === "CREDIT_CARD" || tipoEfetivo === "UNDEFINED",
    },
  ].filter((t) => t.available)

  // Cobrança travada num meio só: oferece a saída. Sem isto, cartão recusado =
  // beco sem saída.
  const presaNumMetodoSo = tabs.length === 1 && tipoEfetivo !== "UNDEFINED"

  // A ABA MOSTRADA TEM QUE SER UMA DAS DISPONÍVEIS.
  //
  // `tab` nasce "PIX", mas a barra só desenha as abas que o billingType
  // permite. Numa cobrança travada no CARTÃO isso divergia: a barra mostrava
  // "Cartão" (única disponível) e o CORPO continuava na aba PIX, exibindo
  // "PIX indisponível para esta cobrança". O auto-switch abaixo não salvava,
  // porque ele só cobre o caso `sem PIX mas com boleto` — e numa cobrança de
  // cartão o boleto também não existe.
  //
  // Era isto que fazia a mensalidade parecer quebrada: a pessoa abria o link
  // para pagar e lia um erro de PIX numa tela cuja única aba era Cartão; ia no
  // cartão, o emissor recusava, e os dois meios "não funcionavam".
  useEffect(() => {
    if (tabs.length === 0) return
    if (!tabs.some((t) => t.id === tab)) {
      setTab(tabs[0].id)
    }
  }, [tabs, tab])

  if (paid) {
    return (
      <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-7 w-7 text-emerald-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-lg font-bold text-emerald-800">Pagamento confirmado!</p>
        <p className="mt-1 text-sm text-emerald-700">
          Obrigado! Seu pagamento foi recebido com sucesso.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-6 rounded-2xl border border-gray-200 bg-white shadow-sm">
      {/* Tab bar */}
      <div className="flex border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${
              tab === t.id
                ? "border-b-2 border-[var(--color-pmb-green)] text-[var(--color-pmb-green)]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {presaNumMetodoSo && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-3">
          <p className="text-xs text-amber-900">
            Esta cobrança aceita somente{" "}
            <strong>{tabs[0]?.label.toLowerCase()}</strong>. Se não conseguir
            pagar assim, libere as outras formas.
          </p>
          <button
            type="button"
            onClick={liberarOutrosMetodos}
            disabled={liberando}
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-60"
          >
            {liberando ? <Spinner /> : null}
            {liberando ? "Liberando…" : "Pagar com PIX ou boleto"}
          </button>
          {erroLiberar && (
            <p className="mt-2 text-xs text-red-700">{erroLiberar}</p>
          )}
        </div>
      )}

      {/* Tab content */}
      <div className="p-6">
        {billingError && tab !== "CARTAO" && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {billingError}
            <button
              type="button"
              onClick={() => fetchBillingInfo()}
              className="ml-2 font-semibold underline"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {billingLoading && tab !== "CARTAO" ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <>
            {tab === "PIX" && (
              <PixTab
                paymentId={paymentId}
                billingInfo={billingInfo}
                onPaid={onPaid}
              />
            )}
            {tab === "BOLETO" && <BoletoTab billingInfo={billingInfo} />}
            {tab === "CARTAO" && (
              <CardTab
                paymentId={paymentId}
                onPaid={onPaid}
                amount={amount}
                maxInstallments={maxInstallments}
                isFirstCharge={isFirstCharge}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
