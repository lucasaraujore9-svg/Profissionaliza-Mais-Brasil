"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

const faqs = [
  {
    pergunta: "Preciso ter experiência com cursos online?",
    resposta:
      "Não. A plataforma foi desenhada pra quem tá começando do zero. Toda a parte técnica (hospedagem, pagamentos, entrega de aulas) é cuidada por nós. Você foca em divulgar e vender.",
  },
  {
    pergunta: "Como funciona o pagamento do aluno?",
    resposta:
      "O aluno paga via Mercado Pago (cartão, Pix ou boleto). O dinheiro cai direto na SUA conta Mercado Pago. Nós não retemos valor algum — você recebe 100% do que vende.",
  },
  {
    pergunta: "Os cursos são de verdade? Com certificado?",
    resposta:
      "Sim. Todos os cursos são ministrados em plataforma consolidada com mais de 10 anos de mercado. Alunos têm acesso a aulas gravadas, materiais em PDF e certificado ao final.",
  },
  {
    pergunta: "Posso cancelar a qualquer momento?",
    resposta:
      "Sim. Não há fidelidade nem multa. Você cancela pelo painel ou pelo Asaas e para de ser cobrado no próximo ciclo.",
  },
  {
    pergunta: "Tem taxa por matrícula ou só a mensalidade?",
    resposta:
      "Só a mensalidade do plano. Não cobramos por matrícula, comissão sobre vendas nem nada parecido. Transparência total.",
  },
]

export function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section className="bg-[#FAFAFA] py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[var(--color-pmb-green-900)] md:text-4xl">
            Perguntas frequentes
          </h2>
          <p className="mt-4 text-gray-600">
            Tudo que você quer saber antes de começar.
          </p>
        </div>

        <div className="mt-10 space-y-3">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index
            return (
              <div
                key={faq.pergunta}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="flex w-full items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-gray-50"
                  aria-expanded={isOpen}
                >
                  <span className="text-base font-medium text-[var(--color-pmb-green-900)]">
                    {faq.pergunta}
                  </span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-gray-400 transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="border-t border-gray-100 bg-gray-50/50 p-5 text-sm leading-relaxed text-gray-600">
                    {faq.resposta}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
