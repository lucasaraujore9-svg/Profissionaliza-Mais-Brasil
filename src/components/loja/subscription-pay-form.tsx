"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { tokenizeMpCard } from "@/lib/mercadopago/browser-sdk"
import {
  INTERVAL_PRICE_SUFFIX,
  INTERVAL_CHARGE_LABEL,
  INTERVAL_PERIOD_LABEL,
  isRecurringInterval,
  type SubscriptionIntervalValue,
} from "@/lib/subscriptions/interval"
import { carneBoletoNotice } from "@/lib/subscriptions/carne-schedule"
import {
  BoletoInstrumentResult,
  PixInstrumentResult,
} from "@/components/loja/payment-instrument-result"
import {
  BoletoAddressFields,
  EMPTY_BOLETO_ADDRESS,
} from "@/components/loja/boleto-address-fields"

/**
 * Pagamento de uma assinatura que JÁ EXISTE (venda direta, 1º ciclo emitido ou
 * renovação), na página da plataforma. Irmão de `SubscriptionCheckout`, sem o
 * bloco "Seus dados": aluno, preço e periodicidade já estão na assinatura,
 * então o formulário só manda o id e o meio de pagamento.
 *
 * PIX e boleto aparecem aqui mesmo — nunca um link para a fatura do gateway.
 */

type Method = "PIX" | "BOLETO" | "CREDIT_CARD"

interface Props {
  subscriptionId: string
  planName: string
  price: number
  interval: SubscriptionIntervalValue
  gateway: "MP" | "ASAAS"
  /** Public key da conta MP da loja — necessaria para tokenizar. */
  mpPublicKey: string | null
  /** Rota de pagamento: a da loja da unidade ou a da vitrine PMB. */
  endpoint: string
  /** Renovação/ciclo em aberto (muda só o texto do botão). */
  renewal?: boolean
  defaultHolderName?: string
  /**
   * Boleto do Mercado Pago sem endereço na ficha do aluno: a tela pede, porque
   * o MP recusa o boleto sem ele.
   */
  askBoletoAddress?: boolean
  /** Boleto em aberto de uma assinatura no boleto (não é a 1ª contratação). */
  carneOpen?: boolean
}

interface Done {
  authorized: boolean
  pix?: { qrCode: string; qrCodeBase64: string }
  boleto?: { url: string; digitableLine?: string }
}

function money(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/** Meios que a loja realmente aceita para esta assinatura. */
export function subscriptionMethods(
  gateway: "MP" | "ASAAS",
  recurring: boolean,
): Method[] {
  // Recorrência do MP: cartão tokenizado, ou a assinatura no BOLETO (a
  // plataforma emite um boleto por ciclo). PIX recorrente o MP não emite; o
  // pagamento único aceita os três.
  if (gateway === "MP") {
    return recurring ? ["CREDIT_CARD", "BOLETO"] : ["PIX", "BOLETO", "CREDIT_CARD"]
  }
  return ["PIX", "BOLETO", "CREDIT_CARD"]
}

export function SubscriptionPayForm({
  subscriptionId,
  planName,
  price,
  interval,
  gateway,
  mpPublicKey,
  endpoint,
  renewal = false,
  defaultHolderName = "",
  askBoletoAddress = false,
  carneOpen = false,
}: Props) {
  const recurring = isRecurringInterval(interval)
  const methods = subscriptionMethods(gateway, recurring)
  const [method, setMethod] = useState<Method>(methods[0])
  const [address, setAddress] = useState(EMPTY_BOLETO_ADDRESS)
  const needsAddress = askBoletoAddress && gateway === "MP" && method === "BOLETO"
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)

  const [f, setF] = useState({
    holderName: defaultHolderName,
    holderCpf: "",
    number: "",
    expiryMonth: "",
    expiryYear: "",
    ccv: "",
    postalCode: "",
    addressNumber: "",
  })

  function set(k: keyof typeof f, v: string) {
    setF((prev) => ({ ...prev, [k]: v }))
  }

  const isMpCard = gateway === "MP" && method === "CREDIT_CARD"
  const isAsaasCard = gateway === "ASAAS" && method === "CREDIT_CARD"

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      // Mercado Pago: o cartão é tokenizado NO BROWSER e o PAN nunca passa pelo
      // nosso servidor. No Asaas não há tokenização no browser, então o cartão
      // vai no corpo (TLS).
      let mpCard: Awaited<ReturnType<typeof tokenizeMpCard>> | null = null
      if (isMpCard) {
        if (!mpPublicKey) {
          setError("Esta loja não está configurada para receber cartão.")
          return
        }
        mpCard = await tokenizeMpCard(mpPublicKey, f)
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionId,
          paymentMethod: method,
          ...(mpCard
            ? {
                cardToken: mpCard.cardToken,
                ...(mpCard.paymentMethodId ? { mpPaymentMethodId: mpCard.paymentMethodId } : {}),
                ...(mpCard.issuerId ? { mpIssuerId: mpCard.issuerId } : {}),
              }
            : {}),
          ...(needsAddress ? { enderecoBoleto: address } : {}),
          ...(isAsaasCard
            ? {
                creditCard: {
                  holderName: f.holderName,
                  number: f.number,
                  expiryMonth: f.expiryMonth,
                  expiryYear: f.expiryYear,
                  ccv: f.ccv,
                },
                creditCardHolder: {
                  postalCode: f.postalCode,
                  addressNumber: f.addressNumber,
                },
              }
            : {}),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? "Não foi possível concluir o pagamento")
        return
      }
      setDone({
        authorized: Boolean(body.data?.authorized),
        pix: body.data?.pix ?? undefined,
        boleto: body.data?.boleto ?? undefined,
      })
    } catch {
      // O `createCardToken` do MP também lança aqui quando o cartão é inválido.
      setError(
        isMpCard
          ? "Não foi possível processar o cartão. Confira os dados e tente novamente."
          : "Erro de conexão. Tente novamente.",
      )
    } finally {
      setLoading(false)
    }
  }

  if (done?.pix) {
    return (
      <PixInstrumentResult
        qrCode={done.pix.qrCode}
        qrCodeBase64={done.pix.qrCodeBase64}
        waitingText="Assim que o pagamento for confirmado, seus cursos são liberados na sua área do aluno."
        onChangeMethod={() => setDone(null)}
      />
    )
  }
  if (done?.boleto) {
    return (
      <BoletoInstrumentResult
        url={done.boleto.url}
        digitableLine={done.boleto.digitableLine}
        waitingText="A compensação do boleto leva até 3 dias úteis. Seus cursos são liberados assim que ele for confirmado."
        onChangeMethod={() => setDone(null)}
      />
    )
  }
  if (done) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center">
        <h2 className="text-lg font-semibold text-[var(--color-pmb-green-900)]">
          {done.authorized ? "Pagamento confirmado" : "Pagamento em processamento"}
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          {done.authorized
            ? "O pagamento foi aprovado. Seus cursos são liberados em instantes — confira seu e-mail."
            : "Seus cursos são liberados assim que o pagamento for confirmado."}
        </p>
        <a
          href="/aluno/assinatura"
          className="mt-5 inline-flex rounded-xl bg-[var(--color-pmb-green)] px-5 py-3 text-sm font-semibold text-white"
        >
          Ver minha assinatura
        </a>
      </div>
    )
  }

  const field =
    "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset className="rounded-2xl border border-gray-200 bg-white p-6">
        <legend className="px-2 text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Pagamento
        </legend>
        <div className="flex flex-wrap gap-3">
          {methods.map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />
              {m === "PIX" ? "PIX" : m === "BOLETO" ? "Boleto" : "Cartão de crédito"}
            </label>
          ))}
        </div>

        {method !== "CREDIT_CARD" && (
          <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
            {carneOpen
              ? "Este pagamento quita o boleto em aberto da sua assinatura."
              : method === "BOLETO"
                ? carneBoletoNotice(interval)
                : recurring
                  ? `A cada ${INTERVAL_PERIOD_LABEL[interval]} uma nova cobrança fica disponível para pagar na sua área do aluno. No cartão, a cobrança é automática.`
                  : "Você paga uma única vez e o acesso ao plano fica liberado para sempre."}
          </p>
        )}

        {needsAddress && (
          <BoletoAddressFields value={address} onChange={setAddress} fieldClassName={field} />
        )}

        {method === "CREDIT_CARD" && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              Nome impresso no cartão
              <input required value={f.holderName} onChange={(e) => set("holderName", e.target.value)} className={field} />
            </label>
            <label className="text-sm sm:col-span-2">
              Número do cartão
              <input required inputMode="numeric" autoComplete="cc-number" value={f.number} onChange={(e) => set("number", e.target.value)} className={field} />
            </label>
            <label className="text-sm">
              Mês (MM)
              <input required inputMode="numeric" maxLength={2} value={f.expiryMonth} onChange={(e) => set("expiryMonth", e.target.value)} className={field} />
            </label>
            <label className="text-sm">
              Ano (AAAA)
              <input required inputMode="numeric" maxLength={4} value={f.expiryYear} onChange={(e) => set("expiryYear", e.target.value)} className={field} />
            </label>
            <label className="text-sm">
              CVV
              <input required inputMode="numeric" maxLength={4} autoComplete="cc-csc" value={f.ccv} onChange={(e) => set("ccv", e.target.value)} className={field} />
            </label>
            {isMpCard ? (
              <label className="text-sm">
                CPF do titular do cartão
                <input required inputMode="numeric" value={f.holderCpf} onChange={(e) => set("holderCpf", e.target.value)} className={field} />
              </label>
            ) : (
              <>
                <label className="text-sm">
                  CEP
                  <input required value={f.postalCode} onChange={(e) => set("postalCode", e.target.value)} className={field} />
                </label>
                <label className="text-sm">
                  Número do endereço
                  <input required value={f.addressNumber} onChange={(e) => set("addressNumber", e.target.value)} className={field} />
                </label>
              </>
            )}
          </div>
        )}
      </fieldset>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-pmb-green)] px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {renewal ? "Pagar" : recurring ? "Assinar" : "Comprar acesso vitalício"} {planName} ·{" "}
        {money(price)}
        {renewal ? "" : INTERVAL_PRICE_SUFFIX[interval]}
      </button>
      {!renewal && (
        <p className="text-center text-xs text-gray-500">
          {recurring
            ? `${INTERVAL_CHARGE_LABEL[interval]}. Sem fidelidade — cancele quando quiser.`
            : "Pagamento único. O acesso ao conteúdo do plano não expira."}
        </p>
      )}
    </form>
  )
}
