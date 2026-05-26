"use client"

import { useEffect } from "react"
import { Loader2, GraduationCap } from "lucide-react"

interface TecnicaRedirectProps {
  url: string
  label: string
  tenantName?: string | null
  delayMs?: number
}

export function TecnicaRedirect({
  url,
  label,
  tenantName,
  delayMs = 1800,
}: TecnicaRedirectProps) {
  useEffect(() => {
    const t = window.setTimeout(() => {
      window.location.href = url
    }, delayMs)
    return () => window.clearTimeout(t)
  }, [url, delayMs])

  const escola = tenantName ? `da escola ${tenantName}` : "da nossa escola técnica"

  return (
    <section className="flex min-h-[calc(100vh-180px)] items-center justify-center bg-[var(--color-pmb-mist)] px-4 py-16">
      <div className="w-full max-w-lg rounded-2xl border border-[rgba(2,89,24,0.1)] bg-white p-8 text-center shadow-[0_18px_40px_-18px_rgba(2,89,24,0.25)] md:p-10">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-[var(--color-pmb-lime)]/30">
          <GraduationCap
            className="h-7 w-7 text-[var(--color-pmb-green)]"
            aria-hidden
          />
        </div>
        <h1 className="text-[20px] font-black leading-tight text-[var(--color-pmb-green)] md:text-[24px]">
          {label}
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-[rgba(2,89,24,0.75)] md:text-[15px]">
          Você está sendo direcionado para o site {escola}.
        </p>
        <p className="mt-1 text-[13px] text-[rgba(2,89,24,0.55)]">
          Aguarde um instante…
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 text-[13px] font-bold text-[var(--color-pmb-green)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Redirecionando
        </div>
        <p className="mt-6 text-[12px] text-[rgba(2,89,24,0.6)]">
          Se nada acontecer,{" "}
          <a
            href={url}
            className="font-bold text-[var(--color-pmb-cyan)] underline underline-offset-4 hover:text-[var(--color-pmb-green)]"
          >
            clique aqui
          </a>
          .
        </p>
      </div>
    </section>
  )
}
