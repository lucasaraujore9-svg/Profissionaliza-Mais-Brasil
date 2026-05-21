"use client"

import { useState } from "react"
import { Plus, Minus } from "lucide-react"
import { faqs } from "./faq-data"

export function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
          <header className="lg:col-span-4" data-reveal>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-pmb-green)]">
              Perguntas frequentes
            </p>
            <h2 className="mt-4 text-4xl font-black leading-tight tracking-tight text-[var(--color-pmb-green-900)] md:text-5xl">
              A gente já respondeu quase tudo.
            </h2>
            <p className="mt-6 text-base text-gray-600">
              Não achou a sua dúvida? Manda no WhatsApp da gente que respondemos no mesmo dia.
            </p>
          </header>

          <ul className="lg:col-span-8" data-stagger data-stagger-step="0.04">
            {faqs.map((faq, index) => {
              const isOpen = openIndex === index
              const Icon = isOpen ? Minus : Plus
              const numero = String(index + 1).padStart(2, "0")
              return (
                <li
                  key={faq.pergunta}
                  className="border-t border-[var(--color-pmb-green-900)]/10 last:border-b"
                >
                  <button
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    className="flex w-full items-start gap-5 py-6 text-left transition-colors hover:bg-[var(--color-pmb-mist)] md:py-7"
                    aria-expanded={isOpen}
                  >
                    <span className="shrink-0 font-mono text-xs font-bold text-[var(--color-pmb-green)]/60 md:text-sm">
                      {numero}
                    </span>
                    <span className="flex-1 text-base font-bold tracking-tight text-[var(--color-pmb-green-900)] md:text-lg">
                      {faq.pergunta}
                    </span>
                    <Icon
                      className={`mt-0.5 h-5 w-5 shrink-0 text-[var(--color-pmb-green)] transition-transform duration-200`}
                      strokeWidth={2.5}
                    />
                  </button>
                  {isOpen && (
                    <div className="pl-11 pr-9 pb-7 text-sm leading-relaxed text-gray-700 md:pl-14 md:text-base">
                      {faq.resposta}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}
