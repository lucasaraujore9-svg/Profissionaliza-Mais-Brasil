import { Check, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

const inclui = [
  "Mais de 100 cursos profissionalizantes já liberados pra você vender",
  "Liberdade pra subir os seus próprios cursos",
  "Site personalizado, com o seu nome e a sua cara",
  "Pode usar um endereço próprio (tipo cursos.suamarca.com.br)",
  "Mercado Pago integrado, dinheiro cai direto na sua conta",
  "Aluno matriculado sozinho assim que paga",
  "Cupom de desconto à vontade e equipe pra ajudar a vender",
  "Pessoa do nosso time pra te acompanhar de perto",
]

const naoPaga = [
  "Comissão por venda",
  "Taxa pra começar",
  "Taxa por aluno matriculado",
  "Royalty ou repasse",
]

export function PlanoUnico() {
  return (
    <section
      id="plano"
      className="relative overflow-hidden bg-[var(--color-pmb-mist)] py-20 md:py-28"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 h-64 w-64 -translate-y-1/3 translate-x-1/3 rounded-full bg-yellow-300/20 blur-3xl"
      />

      <div className="relative mx-auto max-w-6xl px-4 md:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-start lg:gap-16">
          <header className="lg:col-span-5 lg:sticky lg:top-24" data-reveal>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-pmb-green)]">
              Plano único, sem pegadinha
            </p>
            <h2 className="mt-4 text-4xl font-black leading-tight tracking-tight text-[var(--color-pmb-green-900)] md:text-5xl">
              Uma mensalidade.
              <br />
              <span className="italic text-[var(--color-pmb-green)]">
                O resto é seu.
              </span>
            </h2>
            <p className="mt-6 text-base text-gray-700 md:text-lg">
              Não tem versão básica nem avançada. Tudo já vem liberado. Você
              paga a mensalidade e fica com 100% de tudo que vender.
            </p>

            <div className="mt-10 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[var(--color-pmb-green-900)]/70">
                R$
              </span>
              <span className="text-8xl font-black leading-none tracking-tight text-[var(--color-pmb-green-900)] md:text-9xl">
                209
              </span>
              <span className="text-lg font-medium text-[var(--color-pmb-green-900)]/70">
                /mês
              </span>
            </div>
            <p className="mt-3 text-sm text-gray-600">
              Cobrança via boleto, cartão ou Pix. Cancela quando quiser.
            </p>

            <a href="#formulario" className="mt-8 inline-block">
              <Button
                size="lg"
                className="h-13 bg-[var(--color-pmb-green-900)] px-8 text-base font-bold text-yellow-300 hover:bg-[var(--color-pmb-green)]"
              >
                Quero contratar
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </a>
            <p className="mt-3 text-xs text-gray-500">
              A sua escola fica no ar em até 24 horas após o pagamento.
            </p>
          </header>

          <div className="lg:col-span-7">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[var(--color-pmb-green-700)]">
                Tudo isso já vem incluso
              </p>
              <ul
                className="mt-6 grid grid-cols-1 gap-y-4 sm:grid-cols-2 sm:gap-x-8"
                data-stagger
                data-stagger-step="0.05"
              >
                {inclui.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 border-t border-[var(--color-pmb-green-900)]/10 pt-4"
                  >
                    <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-pmb-green)] text-white">
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                    <span className="text-sm leading-relaxed text-gray-800">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-12 rounded-2xl bg-[var(--color-pmb-green-900)] p-7 text-white">
              <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-yellow-300">
                Você nunca paga
              </p>
              <ul className="mt-5 grid grid-cols-2 gap-y-3 gap-x-6">
                {naoPaga.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-2 text-sm text-white/90"
                  >
                    <span className="font-bold text-yellow-300">✕</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
