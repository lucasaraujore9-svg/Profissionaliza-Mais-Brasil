"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { PARENTESCOS, PARENTESCO_LABEL } from "@/lib/students/guardian"

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
}

function money(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function SubscriptionCheckout({ planId, planName, price }: Props) {
  const [method, setMethod] = useState<Method>("PIX")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{
    invoiceUrl: string | null
    authorized: boolean
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
      const res = await fetch("/api/checkout/assinatura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
          ...(method === "CREDIT_CARD"
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
        invoiceUrl: body.data?.invoiceUrl ?? null,
        authorized: Boolean(body.data?.authorized),
      })
    } catch {
      setError("Erro de conexão. Tente novamente.")
    } finally {
      setLoading(false)
    }
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
            : done.invoiceUrl
              ? "Conclua o pagamento para liberar seus cursos."
              : "Pagamento em processamento. Seus cursos são liberados assim que ele for confirmado."}
        </p>
        {done.authorized && (
          <a
            href="/aluno/assinatura"
            className="mt-5 inline-flex rounded-xl bg-[var(--color-pmb-green)] px-5 py-3 text-sm font-semibold text-white"
          >
            Ver meus cursos
          </a>
        )}
        {done.invoiceUrl && (
          <a
            href={done.invoiceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex rounded-xl bg-[var(--color-pmb-green)] px-5 py-3 text-sm font-semibold text-white"
          >
            Pagar {money(price)}
          </a>
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
          {(["PIX", "BOLETO", "CREDIT_CARD"] as const).map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />
              {m === "PIX" ? "PIX" : m === "BOLETO" ? "Boleto" : "Cartão de crédito"}
            </label>
          ))}
        </div>

        {method !== "CREDIT_CARD" && (
          <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
            A cada mês você recebe uma nova fatura para pagar. No cartão, a
            cobrança é automática.
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
            <label className="text-sm">
              CEP
              <input required value={f.postalCode} onChange={(e) => set("postalCode", e.target.value)} className={field} />
            </label>
            <label className="text-sm">
              Número do endereço
              <input required value={f.addressNumber} onChange={(e) => set("addressNumber", e.target.value)} className={field} />
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
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-pmb-green)] px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Assinar {planName} · {money(price)}/mês
      </button>
      <p className="text-center text-xs text-gray-500">
        Sem fidelidade. Cancele quando quiser.
      </p>
    </form>
  )
}
