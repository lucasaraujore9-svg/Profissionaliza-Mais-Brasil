"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2 } from "lucide-react"
import {
  INTERVAL_PRICE_SUFFIX,
  INTERVAL_CHARGE_LABEL,
  INTERVAL_PERIOD_LABEL,
  isRecurringInterval,
  type SubscriptionIntervalValue,
} from "@/lib/subscriptions/interval"

/**
 * Contratação para aluno logado.
 *
 * Não recoleta cadastro: o aluno já existe e a regra do responsável financeiro
 * é decidida pela FICHA no servidor (`resolvePayer`), não por um formulário
 * repetido. Só escolhe plano e meio de pagamento.
 */

interface Plan {
  id: string
  name: string
  slug: string
  description: string | null
  price: number
  interval: SubscriptionIntervalValue
  featured: boolean
  courseCount: number
}

type Method = "PIX" | "BOLETO" | "CREDIT_CARD"

function money(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function StudentSubscribeClient({ plans }: { plans: Plan[] }) {
  const router = useRouter()
  const [planId, setPlanId] = useState(plans[0]?.id ?? "")
  const [method, setMethod] = useState<Method>("PIX")
  // O plano escolhido decide o texto do rodapé: "cobrado todo mês" e "cancele
  // quando quiser" são falsos num plano vitalício.
  const selected = plans.find((p) => p.id === planId) ?? plans[0]
  const selectedInterval = selected?.interval ?? "MONTHLY"
  const recurring = isRecurringInterval(selectedInterval)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [card, setCard] = useState({
    holderName: "",
    number: "",
    expiryMonth: "",
    expiryYear: "",
    ccv: "",
    postalCode: "",
    addressNumber: "",
  })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/aluno/assinatura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          paymentMethod: method,
          ...(method === "CREDIT_CARD"
            ? {
                creditCard: {
                  holderName: card.holderName,
                  number: card.number,
                  expiryMonth: card.expiryMonth,
                  expiryYear: card.expiryYear,
                  ccv: card.ccv,
                },
                creditCardHolder: {
                  postalCode: card.postalCode,
                  addressNumber: card.addressNumber,
                },
              }
            : {}),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? "Não foi possível assinar")
        return
      }
      // A área da assinatura mostra a fatura em aberto (PIX/boleto) ou os
      // cursos já liberados (cartão capturado).
      router.push("/aluno/assinatura")
      router.refresh()
    } catch {
      setError("Erro de conexão. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  const field =
    "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"

  return (
    <form onSubmit={submit} className="space-y-6">
      <ul className="grid gap-4 sm:grid-cols-2">
        {plans.map((p) => (
          <li key={p.id}>
            <label
              className={`flex h-full cursor-pointer flex-col rounded-2xl border bg-white p-5 ${
                planId === p.id
                  ? "border-[var(--color-pmb-green)] ring-1 ring-[var(--color-pmb-green)]"
                  : "border-gray-200"
              }`}
            >
              <span className="flex items-start gap-2">
                <input
                  type="radio"
                  name="plan"
                  checked={planId === p.id}
                  onChange={() => setPlanId(p.id)}
                  className="mt-1"
                />
                <span className="font-semibold text-[var(--color-pmb-green-900)]">
                  {p.name}
                </span>
              </span>
              {p.description && (
                <span className="mt-1.5 text-sm text-gray-600">{p.description}</span>
              )}
              <span className="mt-3 text-lg font-bold text-[var(--color-pmb-green-900)]">
                {money(p.price)}
                <span className="text-sm font-normal text-gray-500">
                  {" "}
                  {INTERVAL_PRICE_SUFFIX[p.interval]}
                </span>
              </span>
              <span className="mt-0.5 text-xs text-gray-500">
                {INTERVAL_CHARGE_LABEL[p.interval]}
              </span>
              <span className="mt-2 flex items-center gap-1.5 text-sm text-gray-700">
                <Check className="h-4 w-4 shrink-0 text-[var(--color-pmb-green)]" />
                {p.courseCount} {p.courseCount === 1 ? "curso" : "cursos"}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <fieldset className="rounded-2xl border border-gray-200 bg-white p-5">
        <legend className="px-2 text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Como quer pagar
        </legend>
        <div className="flex flex-wrap gap-3">
          {(["PIX", "BOLETO", "CREDIT_CARD"] as const).map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="method"
                checked={method === m}
                onChange={() => setMethod(m)}
              />
              {m === "PIX" ? "PIX" : m === "BOLETO" ? "Boleto" : "Cartão de crédito"}
            </label>
          ))}
        </div>

        {method !== "CREDIT_CARD" && (
          <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
            {recurring
              ? `A cada ${INTERVAL_PERIOD_LABEL[selectedInterval]} você recebe uma nova fatura para pagar. No cartão, a cobrança é automática.`
              : "Você paga uma única vez e o acesso ao plano fica liberado para sempre."}
          </p>
        )}

        {method === "CREDIT_CARD" && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              Nome impresso no cartão
              <input required value={card.holderName} onChange={(e) => setCard({ ...card, holderName: e.target.value })} className={field} />
            </label>
            <label className="text-sm sm:col-span-2">
              Número do cartão
              <input required inputMode="numeric" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} className={field} />
            </label>
            <label className="text-sm">
              Mês (MM)
              <input required inputMode="numeric" maxLength={2} value={card.expiryMonth} onChange={(e) => setCard({ ...card, expiryMonth: e.target.value })} className={field} />
            </label>
            <label className="text-sm">
              Ano (AAAA)
              <input required inputMode="numeric" maxLength={4} value={card.expiryYear} onChange={(e) => setCard({ ...card, expiryYear: e.target.value })} className={field} />
            </label>
            <label className="text-sm">
              CVV
              <input required inputMode="numeric" maxLength={4} value={card.ccv} onChange={(e) => setCard({ ...card, ccv: e.target.value })} className={field} />
            </label>
            <label className="text-sm">
              CEP
              <input required value={card.postalCode} onChange={(e) => setCard({ ...card, postalCode: e.target.value })} className={field} />
            </label>
            <label className="text-sm">
              Número do endereço
              <input required value={card.addressNumber} onChange={(e) => setCard({ ...card, addressNumber: e.target.value })} className={field} />
            </label>
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
        disabled={loading || !planId}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-pmb-green)] px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {recurring ? "Assinar" : "Comprar acesso vitalício"}
      </button>
      <p className="text-center text-xs text-gray-500">
        {recurring
          ? `${INTERVAL_CHARGE_LABEL[selectedInterval]}. Sem fidelidade — cancele quando quiser.`
          : "Pagamento único. O acesso ao conteúdo do plano não expira."}
      </p>
    </form>
  )
}
