"use client"

import { useState } from "react"
import { toast } from "sonner"

export function ContactForm() {
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    const form = event.currentTarget
    const data = new FormData(form)
    const payload = {
      name: String(data.get("nome") ?? "").trim(),
      email: String(data.get("email") ?? "").trim(),
      phone: String(data.get("telefone") ?? "").trim(),
      message: String(data.get("mensagem") ?? "").trim(),
      source: "/contato",
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const detail =
          typeof body?.details === "object" && body.details
            ? Object.values(body.details).flat().filter(Boolean).join(" · ")
            : ""
        toast.error(detail || body?.error || "Não conseguimos enviar agora. Tente de novo em alguns segundos.")
        return
      }

      setSubmitted(true)
      form.reset()
      toast.success("Mensagem enviada — retornamos em até 1 dia útil.")
    } catch {
      toast.error("Falha de conexão. Verifique sua internet e tente de novo.")
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-[rgba(2,89,24,0.08)] bg-white p-6 md:p-8">
        <h2 className="text-[20px] font-black text-[var(--color-pmb-green)]">
          Recebemos sua mensagem
        </h2>
        <p className="mt-2 text-[14px] text-[rgba(2,89,24,0.75)]">
          Em até 1 dia útil entraremos em contato pelo e-mail informado. Se
          preferir, fale com a gente diretamente no WhatsApp ao lado.
        </p>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="mt-5 inline-flex items-center rounded-lg border border-[rgba(2,89,24,0.2)] bg-white px-4 py-2 text-[13px] font-bold text-[var(--color-pmb-green)]"
        >
          Enviar outra mensagem
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-xl border border-[rgba(2,89,24,0.08)] bg-white p-6 md:p-8"
    >
      <h2 className="text-[20px] font-black text-[var(--color-pmb-green)]">
        Envie sua mensagem
      </h2>
      <p className="mt-1 text-[13.5px] text-[rgba(2,89,24,0.7)]">
        Preencha o formulário e retornamos em até 1 dia útil.
      </p>

      <div className="mt-5 grid gap-4">
        <label className="block">
          <span className="text-[12.5px] font-bold text-[var(--color-pmb-green)]">Nome completo</span>
          <input
            name="nome"
            required
            minLength={2}
            autoComplete="name"
            className="mt-1.5 w-full rounded-lg border border-[rgba(2,89,24,0.15)] bg-white px-3.5 py-2.5 text-[14px] text-[var(--color-pmb-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-pmb-green)] focus-visible:ring-offset-2 focus:border-[var(--color-pmb-green)]"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-[12.5px] font-bold text-[var(--color-pmb-green)]">E-mail</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1.5 w-full rounded-lg border border-[rgba(2,89,24,0.15)] bg-white px-3.5 py-2.5 text-[14px] text-[var(--color-pmb-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-pmb-green)] focus-visible:ring-offset-2 focus:border-[var(--color-pmb-green)]"
            />
          </label>
          <label className="block">
            <span className="text-[12.5px] font-bold text-[var(--color-pmb-green)]">WhatsApp <span className="font-normal text-[rgba(2,89,24,0.55)]">(opcional)</span></span>
            <input
              name="telefone"
              type="tel"
              placeholder="(00) 00000-0000"
              autoComplete="tel-national"
              className="mt-1.5 w-full rounded-lg border border-[rgba(2,89,24,0.15)] bg-white px-3.5 py-2.5 text-[14px] text-[var(--color-pmb-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-pmb-green)] focus-visible:ring-offset-2 focus:border-[var(--color-pmb-green)]"
            />
          </label>
        </div>
        <label className="block">
          <span className="text-[12.5px] font-bold text-[var(--color-pmb-green)]">Mensagem</span>
          <textarea
            name="mensagem"
            required
            minLength={10}
            rows={5}
            className="mt-1.5 w-full rounded-lg border border-[rgba(2,89,24,0.15)] bg-white px-3.5 py-2.5 text-[14px] text-[var(--color-pmb-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-pmb-green)] focus-visible:ring-offset-2 focus:border-[var(--color-pmb-green)]"
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-lg bg-[var(--color-pmb-gold)] px-5 py-3 text-[14px] font-black text-[var(--color-pmb-green)] transition-colors hover:brightness-105 disabled:opacity-60"
        >
          {submitting ? "Enviando…" : "Enviar mensagem"}
        </button>
      </div>
    </form>
  )
}
