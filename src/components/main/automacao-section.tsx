import {
  Zap,
  MessageCircle,
  KanbanSquare,
  ShoppingCart,
  History,
  ArrowRight,
} from "lucide-react"

const beneficios = [
  {
    icon: MessageCircle,
    titulo: "WhatsApp no piloto automático",
    desc: "Boas-vindas, lembrete de pagamento e confirmação de compra disparam sozinhos, na hora certa, do seu próprio número.",
  },
  {
    icon: ShoppingCart,
    titulo: "Recupera a venda que hoje você perde",
    desc: "Quem abandona o checkout recebe uma mensagem automática e volta a comprar. Mais faturamento com o mesmo tráfego.",
  },
  {
    icon: KanbanSquare,
    titulo: "CRM visual de vendas (Kanban)",
    desc: "Cada lead na coluna certa — Novo, Em contato, Checkout, Pago. Você nunca mais perde uma oportunidade de vista.",
  },
  {
    icon: Zap,
    titulo: "Captura leads na página do curso",
    desc: "Um formulário “Quero saber mais” transforma o visitante curioso em contato no seu funil — antes que ele esqueça de você.",
  },
  {
    icon: History,
    titulo: "A jornada completa de cada cliente",
    desc: "Veja os cursos que a pessoa visitou, onde parou e o histórico de conversas. Você fala a coisa certa, na hora certa.",
  },
]

export function AutomacaoSection() {
  return (
    <section
      id="automacao"
      className="relative overflow-hidden bg-[var(--color-pmb-green-900)] py-20 md:py-28"
    >
      <div
        aria-hidden
        data-parallax="40"
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "radial-gradient(circle at 90% 0%, rgba(192,217,4,0.4) 0%, transparent 38%), radial-gradient(circle at 0% 100%, rgba(242,183,5,0.25) 0%, transparent 38%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-4 md:px-8">
        <div className="max-w-3xl" data-reveal>
          <p className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-yellow-300">
            <Zap className="h-3.5 w-3.5" />
            Profissionaliza PRO
          </p>
          <h2 className="mt-4 text-4xl font-black leading-[1.03] tracking-tight text-white md:text-5xl">
            O vendedor que
            <br />
            <span className="italic text-yellow-300">nunca dorme.</span>
          </h2>
          <p className="mt-6 text-base text-white/85 md:text-lg">
            A maior parte das vendas não se perde no preço. Se perde no
            silêncio: o cliente entrou, gostou do curso e{" "}
            <strong className="font-semibold text-white">
              ninguém falou com ele
            </strong>
            . A Automação PMB conversa, lembra e recupera por você —{" "}
            <strong className="font-semibold text-white">
              24 horas por dia, no automático
            </strong>
            .
          </p>
        </div>

        <ul
          className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-2 lg:grid-cols-3"
          data-stagger
          data-stagger-step="0.06"
        >
          {beneficios.map(({ icon: Icon, titulo, desc }) => (
            <li
              key={titulo}
              className="bg-[var(--color-pmb-green-900)] p-7 transition-colors hover:bg-[var(--color-pmb-green)]/15"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-yellow-300/15 text-yellow-300">
                <Icon className="h-5 w-5" />
              </span>
              <p className="mt-5 text-lg font-bold text-white">{titulo}</p>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                {desc}
              </p>
            </li>
          ))}
          <li className="flex flex-col justify-center bg-yellow-300 p-7">
            <p className="text-2xl font-black leading-tight tracking-tight text-[var(--color-pmb-green-900)]">
              Uma venda recuperada já paga o mês inteiro.
            </p>
            <p className="mt-3 text-sm font-medium text-[var(--color-pmb-green-900)]/75">
              São só R$ 30 a mais na mensalidade pra ter um time de vendas
              trabalhando por você sem parar.
            </p>
            <a
              href="#planos"
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--color-pmb-green-900)] underline-offset-4 hover:underline"
            >
              Ver o Profissionaliza PRO
              <ArrowRight className="h-4 w-4" />
            </a>
          </li>
        </ul>
      </div>
    </section>
  )
}
