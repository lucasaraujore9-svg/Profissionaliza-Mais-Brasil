"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { PARENTESCOS, PARENTESCO_LABEL } from "@/lib/students/guardian"
import { tokenizeMpCard } from "@/lib/mercadopago/browser-sdk"
import {
  INTERVAL_PRICE_SUFFIX,
  INTERVAL_CHARGE_LABEL,
  INTERVAL_PERIOD_LABEL,
  isRecurringInterval,
  type SubscriptionIntervalValue,
} from "@/lib/subscriptions/interval"
import { subscriptionMethods } from "@/components/loja/subscription-pay-form"
import {
  BoletoInstrumentResult,
  PixInstrumentResult,
} from "@/components/loja/payment-instrument-result"

/**
 * Contratação de assinatura na vitrine PMB.
 *
 * O formulário manda o `planId`, NUNCA o preço: quem precifica é o servidor
 * (mesma trava do price-guard das vendas avulsas). A data de nascimento é
 * obrigatória porque é o único jeito de saber quem é menor — e menor cobra no
 * CPF do responsável, com o certificado ainda saindo no nome do aluno.
 */

type Method = "PIX" | "BOLETO" | "CREDIT_CARD"

interface Props {
  planId: string
  planName: string
  price: number
  /**
   * Periodicidade do plano. Nao e so um rotulo: no VITALICIO o texto muda de
   * natureza ("pagamento unico", sem "cancele quando quiser") e o MP deixa de
   * exigir cartao, porque a cobranca vira pagamento avulso em vez de
   * recorrencia.
   */
  interval?: SubscriptionIntervalValue
  /** Rota de contratacao. Muda entre a vitrine PMB e a da unidade. */
  endpoint?: string
  /**
   * Gateway da loja. Decide os MEIOS oferecidos: a recorrencia do Mercado Pago
   * exige cartao tokenizado no browser e nao emite fatura de PIX/boleto por
   * ciclo. Oferecer PIX numa loja de MP levaria a um 400 depois de a pessoa
   * preencher tudo — o mesmo erro do incidente "revenda sem PIX".
   */
  gateway?: "MP" | "ASAAS"
  /** Public key da conta MP da unidade — necessaria para tokenizar. */
  mpPublicKey?: string | null
}

function money(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function SubscriptionCheckout({
  planId,
  planName,
  price,
  interval = "MONTHLY",
  endpoint = "/api/checkout/assinatura",
  gateway = "ASAAS",
  mpPublicKey = null,
}: Props) {
  const recurring = isRecurringInterval(interval)
  // Os meios que a loja realmente aceita: a recorrência do MP é só cartão; o
  // pagamento único do MP aceita PIX e cartão; o Asaas, os três.
  const methods = subscriptionMethods(gateway, recurring)
  const [method, setMethod] = useState<Method>(methods[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{
    subscriptionId: string | null
    authorized: boolean
    pix?: { qrCode: string; qrCodeBase64: string }
    boleto?: { url: string; digitableLine?: string }
  } | null>(null)

  const [f, setF] = useState({
    nome: "",
    email: "",
    cpf: "",
    fone: "",
    nascimento: "",
    responsavel: "",
    responsavelCpf: "",
    responsavelEmail: "",
    responsavelFone: "",
    responsavelParentesco: "",
    holderName: "",
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

  // Menor de 18 pela data digitada: o bloco do responsável aparece na hora, não
  // depois de um erro do servidor.
  const isMinor = (() => {
    if (!f.nascimento) return false
    const born = new Date(f.nascimento)
    if (Number.isNaN(born.getTime())) return false
    const cut = new Date()
    cut.setFullYear(cut.getFullYear() - 18)
    return born > cut
  })()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      // Mercado Pago: o cartao e tokenizado NO BROWSER e o PAN nunca passa pelo
      // nosso servidor. No Asaas nao ha tokenizacao no browser, entao o cartao
      // vai no corpo (TLS) — sao caminhos diferentes de propósito.
      const isMpCard = gateway === "MP" && method === "CREDIT_CARD"
      let mpCard: Awaited<ReturnType<typeof tokenizeMpCard>> | null = null
      if (isMpCard) {
        if (!mpPublicKey) {
          setError("Esta loja não está configurada para receber cartão.")
          return
        }
        mpCard = await tokenizeMpCard(mpPublicKey, {
          ...f,
          holderCpf: isMinor ? f.responsavelCpf : f.cpf,
        })
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(mpCard
            ? {
                cardToken: mpCard.cardToken,
                ...(mpCard.paymentMethodId ? { mpPaymentMethodId: mpCard.paymentMethodId } : {}),
                ...(mpCard.issuerId ? { mpIssuerId: mpCard.issuerId } : {}),
              }
            : {}),
          planId,
          nome: f.nome,
          email: f.email,
          cpf: f.cpf,
          fone: f.fone,
          nascimento: f.nascimento,
          acceptedTerms: true,
          paymentMethod: method,
          ...(isMinor
            ? {
                responsavel: f.responsavel,
                responsavelCpf: f.responsavelCpf,
                responsavelEmail: f.responsavelEmail,
                responsavelFone: f.responsavelFone,
                responsavelParentesco: f.responsavelParentesco,
              }
            : {}),
          ...(method === "CREDIT_CARD" && gateway === "ASAAS"
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
        setError(body.error ?? "Não foi possível concluir a assinatura")
        return
      }
      setDone({
        subscriptionId: body.data?.subscriptionId ?? null,
        authorized: Boolean(body.data?.authorized),
        pix: body.data?.pix ?? undefined,
        boleto: body.data?.boleto ?? undefined,
      })
    } catch {
      setError("Erro de conexão. Tente novamente.")
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
      />
    )
  }
  if (done?.boleto) {
    return (
      <BoletoInstrumentResult
        url={done.boleto.url}
        digitableLine={done.boleto.digitableLine}
        waitingText="A compensação do boleto leva até 3 dias úteis. Seus cursos são liberados assim que ele for confirmado."
      />
    )
  }
  if (done) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center">
        <h2 className="text-lg font-semibold text-[var(--color-pmb-green-900)]">
          {done.authorized ? "Assinatura confirmada" : "Assinatura criada"}
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          {done.authorized
            ? "O pagamento foi aprovado. Seus cursos já estão liberados."
            : "Pagamento em processamento. Seus cursos são liberados assim que ele for confirmado."}
        </p>
        {done.authorized ? (
          <a
            href="/aluno/assinatura"
            className="mt-5 inline-flex rounded-xl bg-[var(--color-pmb-green)] px-5 py-3 text-sm font-semibold text-white"
          >
            Ver meus cursos
          </a>
        ) : (
          done.subscriptionId && (
            // A página de pagamento da plataforma — nunca a fatura do gateway.
            <a
              href={`/pagar/assinatura/${done.subscriptionId}`}
              className="mt-5 inline-flex rounded-xl bg-[var(--color-pmb-green)] px-5 py-3 text-sm font-semibold text-white"
            >
              Pagar {money(price)}
            </a>
          )
        )}
      </div>
    )
  }

  const field =
    "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset className="rounded-2xl border border-gray-200 bg-white p-6">
        <legend className="px-2 text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Seus dados
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            Nome completo
            <input required value={f.nome} onChange={(e) => set("nome", e.target.value)} className={field} />
          </label>
          <label className="text-sm">
            E-mail
            <input required type="email" value={f.email} onChange={(e) => set("email", e.target.value)} className={field} />
          </label>
          <label className="text-sm">
            CPF
            <input required value={f.cpf} onChange={(e) => set("cpf", e.target.value)} className={field} />
          </label>
          <label className="text-sm">
            Celular
            <input required value={f.fone} onChange={(e) => set("fone", e.target.value)} className={field} />
          </label>
          <label className="text-sm">
            Data de nascimento
            <input required type="date" value={f.nascimento} onChange={(e) => set("nascimento", e.target.value)} className={field} />
          </label>
        </div>
      </fieldset>

      {isMinor && (
        <fieldset className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <legend className="px-2 text-sm font-semibold text-amber-900">
            Responsável financeiro
          </legend>
          <p className="mb-4 text-xs text-amber-800">
            O aluno é menor de 18 anos, então a cobrança sai no CPF do
            responsável. O certificado continua sendo emitido no nome do aluno.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Nome do responsável
              <input required value={f.responsavel} onChange={(e) => set("responsavel", e.target.value)} className={field} />
            </label>
            <label className="text-sm">
              CPF do responsável
              <input required value={f.responsavelCpf} onChange={(e) => set("responsavelCpf", e.target.value)} className={field} />
            </label>
            <label className="text-sm">
              E-mail do responsável
              <input required type="email" value={f.responsavelEmail} onChange={(e) => set("responsavelEmail", e.target.value)} className={field} />
            </label>
            <label className="text-sm">
              Celular do responsável
              <input required value={f.responsavelFone} onChange={(e) => set("responsavelFone", e.target.value)} className={field} />
            </label>
            <label className="text-sm">
              Parentesco
              {/* Opções derivadas de PARENTESCO_LABEL, nunca reescritas à mão:
                  uma lista paralela é como nascem chaves que o `z.enum` recusa
                  (o formulário oferecia "tio", que não existe no catálogo). */}
              <select required value={f.responsavelParentesco} onChange={(e) => set("responsavelParentesco", e.target.value)} className={field}>
                <option value="">Selecione…</option>
                {PARENTESCOS.map((p) => (
                  <option key={p} value={p}>
                    {PARENTESCO_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>
      )}

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
            {recurring
              ? `A cada ${INTERVAL_PERIOD_LABEL[interval]} uma nova cobrança fica disponível para pagar na sua área do aluno. No cartão, a cobrança é automática.`
              : "Você paga uma única vez e o acesso ao plano fica liberado para sempre."}
          </p>
        )}

        {method === "CREDIT_CARD" && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              Nome impresso no cartão
              <input required value={f.holderName} onChange={(e) => set("holderName", e.target.value)} className={field} />
            </label>
            <label className="text-sm sm:col-span-2">
              Número do cartão
              <input required inputMode="numeric" value={f.number} onChange={(e) => set("number", e.target.value)} className={field} />
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
              <input required inputMode="numeric" maxLength={4} value={f.ccv} onChange={(e) => set("ccv", e.target.value)} className={field} />
            </label>
            {/* Endereço do titular: exigência do Asaas no cartão. No MP o cartão é
                tokenizado no browser e o endereço não entra. */}
            {gateway === "ASAAS" && (
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
        {recurring ? "Assinar" : "Comprar acesso vitalício"} {planName} ·{" "}
        {money(price)}
        {INTERVAL_PRICE_SUFFIX[interval]}
      </button>
      <p className="text-center text-xs text-gray-500">
        {recurring
          ? `${INTERVAL_CHARGE_LABEL[interval]}. Sem fidelidade — cancele quando quiser.`
          : "Pagamento único. O acesso ao conteúdo do plano não expira."}
      </p>
    </form>
  )
}
