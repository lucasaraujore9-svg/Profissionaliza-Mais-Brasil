"use client"

import { useState } from "react"
import { Loader2, CheckCircle2, MessageCircle } from "lucide-react"

interface CheckoutInquiryFormProps {
  // ID do TenantCourse (curso que o aluno tentou comprar).
  courseId: string
  courseName: string
  escolaName: string
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "")
  if (digits.length <= 2) return digits
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
}

/**
 * Exibido na vitrine quando a unidade ainda NÃO configurou o pagamento online
 * (sem Mercado Pago nem Asaas). Em vez de um beco sem saída, captura o interesse
 * do aluno: envia para o e-mail da revenda e registra um lead no menu de Leads.
 * NUNCA cobra nada nem usa o checkout do sistema mãe.
 */
export function CheckoutInquiryForm({
  courseId,
  courseName,
  escolaName,
}: CheckoutInquiryFormProps) {
  const [nome, setNome] = useState("")
  const [email, setEmail] = useState("")
  const [telefone, setTelefone] = useState("")
  const [mensagem, setMensagem] = useState("")
  const [consent, setConsent] = useState(true)
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus("submitting")
    setErrorMsg(null)

    try {
      const res = await fetch("/api/loja/checkout-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          nome: nome.trim(),
          email: email.trim().toLowerCase(),
          telefone: telefone.replace(/\D/g, ""),
          mensagem: mensagem.trim() || undefined,
          consent,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStatus("error")
        setErrorMsg(body.error ?? "Não foi possível enviar agora.")
        return
      }
      setStatus("success")
    } catch {
      setStatus("error")
      setErrorMsg("Erro de rede. Tente novamente.")
    }
  }

  if (status === "success") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6"
      >
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
          <div>
            <p className="text-base font-bold text-emerald-900">
              Recebemos seu contato!
            </p>
            <p className="mt-1 text-sm text-emerald-800">
              A equipe da {escolaName} vai falar com você em breve para concluir
              sua matrícula no curso <strong>{courseName}</strong>.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[rgba(2,89,24,0.12)] bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-5 w-5 text-[var(--color-pmb-green)]" />
        <h2 className="text-lg font-bold text-[var(--color-pmb-green-900)]">
          Garanta sua vaga
        </h2>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        Deixe seus dados e a equipe da {escolaName} entra em contato para
        concluir sua matrícula no curso <strong>{courseName}</strong>.
      </p>

      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <input
          type="text"
          required
          minLength={2}
          maxLength={160}
          aria-label="Nome completo"
          placeholder="Nome completo"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          disabled={status === "submitting"}
          className="w-full rounded-lg border border-[rgba(2,89,24,0.18)] bg-white px-3.5 py-2.5 text-sm text-[var(--color-pmb-green-900)] placeholder:text-[rgba(2,89,24,0.45)] focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)] disabled:opacity-50"
        />

        <input
          type="tel"
          required
          inputMode="numeric"
          aria-label="WhatsApp com DDD"
          placeholder="WhatsApp com DDD"
          value={formatPhone(telefone)}
          onChange={(e) =>
            setTelefone(e.target.value.replace(/\D/g, "").slice(0, 11))
          }
          disabled={status === "submitting"}
          className="w-full rounded-lg border border-[rgba(2,89,24,0.18)] bg-white px-3.5 py-2.5 text-sm text-[var(--color-pmb-green-900)] placeholder:text-[rgba(2,89,24,0.45)] focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)] disabled:opacity-50"
        />

        <input
          type="email"
          required
          aria-label="E-mail"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "submitting"}
          className="w-full rounded-lg border border-[rgba(2,89,24,0.18)] bg-white px-3.5 py-2.5 text-sm text-[var(--color-pmb-green-900)] placeholder:text-[rgba(2,89,24,0.45)] focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)] disabled:opacity-50"
        />

        <textarea
          rows={3}
          maxLength={1000}
          aria-label="Mensagem (opcional)"
          placeholder="Mensagem (opcional)"
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          disabled={status === "submitting"}
          className="w-full resize-none rounded-lg border border-[rgba(2,89,24,0.18)] bg-white px-3.5 py-2.5 text-sm text-[var(--color-pmb-green-900)] placeholder:text-[rgba(2,89,24,0.45)] focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)] disabled:opacity-50"
        />

        <label className="flex cursor-pointer items-start gap-2 text-xs text-[rgba(2,89,24,0.75)]">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            disabled={status === "submitting"}
            className="mt-0.5 h-3.5 w-3.5 rounded border-[rgba(2,89,24,0.3)] text-[var(--color-pmb-green)] focus:ring-[var(--color-pmb-green)]"
          />
          <span>
            Aceito receber contato da {escolaName} sobre o curso{" "}
            <strong>{courseName}</strong>.
          </span>
        </label>

        {errorMsg && (
          <p role="alert" className="text-xs text-red-700">
            {errorMsg}
          </p>
        )}

        <button
          type="submit"
          disabled={status === "submitting" || !consent}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--color-pmb-green)] px-4 py-3 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-[var(--color-pmb-green-700)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "submitting" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Enviando…
            </>
          ) : (
            <>Quero me matricular</>
          )}
        </button>
      </form>
    </div>
  )
}
