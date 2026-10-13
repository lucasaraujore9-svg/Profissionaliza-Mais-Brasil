import { Check, ArrowRight, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"

const baseFeatures = [
  "Mais de 100 cursos profissionalizantes liberados pra vender",
  "Site personalizado, com o seu nome e a sua cara",
  "Endereço próprio (tipo cursos.suamarca.com.br)",
  "Mercado Pago integrado — o dinheiro cai direto na sua conta",
  "Aluno matriculado sozinho assim que paga",
  "Liberdade pra subir os seus próprios cursos",
  "Cupons de desconto à vontade e equipe pra ajudar a vender",
  "Suporte e uma pessoa do nosso time pra te acompanhar",
]

const proFeatures = [
  "WhatsApp no automático: boas-vindas, lembrete e confirmação",
  "Recuperação de carrinho abandonado — volta a venda perdida",
  "CRM visual de vendas (Kanban) pra não perder nenhum cliente",
  "Captura de leads na própria página do curso",
  "Histórico completo de cada lead pra vender na hora certa",
]

const naoPaga = [
  "Comissão por venda",
  "Taxa pra começar",
  "Taxa por aluno matriculado",
  "Royalty ou repasse",
]

export function PlanosPMB() {
  return (
    <section
      id="planos"
      className="relative overflow-hidden bg-[var(--color-pmb-mist)] py-20 md:py-28"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 h-72 w-72 -translate-y-1/3 translate-x-1/3 rounded-full bg-yellow-300/20 blur-3xl"
      />

      <div className="relative mx-auto max-w-6xl px-4 md:px-8">
        <header className="mx-auto max-w-2xl text-center" data-reveal>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-pmb-green)]">
            O seu plano
          </p>
          <h2 className="mt-4 text-4xl font-black leading-tight tracking-tight text-[var(--color-pmb-green-900)] md:text-5xl">
            Uma mensalidade.
            <br />
            <span className="italic text-[var(--color-pmb-green)]">
              O resto é seu.
            </span>
          </h2>
          <p className="mt-5 text-base text-gray-700 md:text-lg">
            Sem versão capada. A escola inteira liberada e a Automação que
            vende no WhatsApp por você, num plano só.
          </p>
        </header>

        <div className="mx-auto mt-14 max-w-xl">
          <div
            className="relative flex h-full flex-col rounded-3xl bg-[var(--color-pmb-green-900)] p-7 shadow-2xl ring-1 ring-yellow-300/30 md:p-9"
            data-reveal
          >
            <div>
              <h3 className="text-xl font-black tracking-tight text-white">
                Profissionaliza{" "}
                <span className="text-yellow-300">PRO</span>
              </h3>
              <p className="mt-1 text-sm text-white/70">
                A sua escola digital completa + um vendedor que trabalha 24h por você.
              </p>
            </div>

            <div className="mt-7 flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-white/60">R$</span>
              <span className="text-6xl font-black leading-none tracking-tight text-white">
                239
              </span>
              <span className="text-base font-medium text-white/60">/mês</span>
            </div>

            <a href="#formulario" className="mt-6 block">
              <Button
                size="lg"
                className="h-12 w-full bg-yellow-300 text-base font-bold text-[var(--color-pmb-green-900)] transition-transform hover:scale-[1.02] hover:bg-yellow-400"
              >
                Quero o PRO
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </a>

            <ul className="mt-8 space-y-3.5">
              {baseFeatures.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-yellow-300 text-[var(--color-pmb-green-900)]">
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                  <span className="text-sm leading-relaxed text-white/90">
                    {item}
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-8 inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.2em] text-yellow-300">
              <Zap className="h-3 w-3" />
              Automação incluída:
            </p>
            <ul className="mt-4 space-y-3.5">
              {proFeatures.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-yellow-300 text-[var(--color-pmb-green-900)]">
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                  <span className="text-sm leading-relaxed text-white/90">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Reforço: o que você nunca paga */}
        <div
          className="mx-auto mt-10 max-w-5xl rounded-2xl border border-[var(--color-pmb-green-900)]/10 bg-white p-6 md:p-7"
          data-reveal
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:gap-8">
            <p className="shrink-0 font-mono text-[11px] uppercase tracking-[0.25em] text-[var(--color-pmb-green-700)]">
              Você nunca paga
            </p>
            <ul className="grid flex-1 grid-cols-2 gap-y-2.5 gap-x-6 md:grid-cols-4">
              {naoPaga.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2 text-sm text-gray-700"
                >
                  <span className="font-bold text-[var(--color-pmb-green)]">
                    ✕
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-gray-600">
          Cobrança via boleto, cartão ou Pix. Cancela quando quiser. A sua
          escola fica no ar em até 24 horas após o pagamento.
        </p>
      </div>
    </section>
  )
}
