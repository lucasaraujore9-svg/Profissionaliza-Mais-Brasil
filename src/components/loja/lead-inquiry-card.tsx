"use client"

import { useState } from "react"
import { Loader2, MessageCircle, CheckCircle2 } from "lucide-react"

interface LeadInquiryCardProps {
  courseSlug: string
  courseName: string
  escolaName: string
  /** Endpoint POST. Default = vitrine de revendedor. PMB usa "/api/pmb/leads". */
  endpoint?: string
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "")
  if (digits.length <= 2) return digits
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
}

export function LeadInquiryCard({
  courseSlug,
  courseName,
  escolaName,
  endpoint = "/api/loja/leads",
}: LeadInquiryCardProps) {
  const [nome, setNome] = useState("")
  const [email, setEmail] = useState("")
  const [telefone, setTelefone] = useState("")
  const [consent, setConsent] = useState(true)
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">(
    "idle",
  )
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus("submitting")
    setErrorMsg(null)

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          email: email.trim().toLowerCase(),
          telefone: telefone.replace(/\D/g, ""),
          courseSlug,
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
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <p className="text-[13px] font-bold text-emerald-900">
              Recebemos seu contato!
            </p>
            <p className="mt-0.5 text-[12px] text-emerald-800">
              Em instantes você receberá uma mensagem no WhatsApp com mais informações.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[rgba(2,89,24,0.12)] bg-[var(--color-pmb-mist)]/40 p-4">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-[var(--color-pmb-green)]" />
        <h3 className="text-[13px] font-black uppercase tracking-wide text-[var(--color-pmb-green-900)]">
          Receba mais informações
        </h3>
      </div>
      <p className="mt-1 text-[11.5px] text-[rgba(2,89,24,0.7)]">
        Tire dúvidas sobre o curso com um consultor da {escolaName} no WhatsApp.
      </p>

      <form onSubmit={onSubmit} className="mt-3 space-y-2.5">
        <input
          type="text"
          required
          minLength={2}
          maxLength={160}
          placeholder="Nome completo"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          disabled={status === "submitting"}
          className="w-full rounded-md border border-[rgba(2,89,24,0.18)] bg-white px-3 py-2 text-[13px] text-[var(--color-pmb-green-900)] placeholder:text-[rgba(2,89,24,0.45)] focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)] disabled:opacity-50"
        />

        <input
          type="tel"
          required
          inputMode="numeric"
          placeholder="WhatsApp com DDD"
          value={formatPhone(telefone)}
          onChange={(e) => setTelefone(e.target.value.replace(/\D/g, "").slice(0, 11))}
          disabled={status === "submitting"}
          className="w-full rounded-md border border-[rgba(2,89,24,0.18)] bg-white px-3 py-2 text-[13px] text-[var(--color-pmb-green-900)] placeholder:text-[rgba(2,89,24,0.45)] focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)] disabled:opacity-50"
        />

        <input
          type="email"
          required
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "submitting"}
          className="w-full rounded-md border border-[rgba(2,89,24,0.18)] bg-white px-3 py-2 text-[13px] text-[var(--color-pmb-green-900)] placeholder:text-[rgba(2,89,24,0.45)] focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)] disabled:opacity-50"
        />

        <label className="flex cursor-pointer items-start gap-2 text-[11px] text-[rgba(2,89,24,0.75)]">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            disabled={status === "submitting"}
            className="mt-0.5 h-3.5 w-3.5 rounded border-[rgba(2,89,24,0.3)] text-[var(--color-pmb-green)] focus:ring-[var(--color-pmb-green)]"
          />
          <span>
            Aceito receber contato via WhatsApp da {escolaName} sobre o curso{" "}
            <strong>{courseName}</strong>.
          </span>
        </label>

        {errorMsg && (
          <p className="text-[11.5px] text-red-700">{errorMsg}</p>
        )}

        <button
          type="submit"
          disabled={status === "submitting" || !consent}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[var(--color-pmb-green)] px-3 py-2.5 text-[12.5px] font-bold uppercase tracking-wide text-white transition-colors hover:bg-[var(--color-pmb-green-700)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "submitting" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Enviando…
            </>
          ) : (
            <>Falar com um consultor</>
          )}
        </button>
      </form>
    </div>
  )
}
