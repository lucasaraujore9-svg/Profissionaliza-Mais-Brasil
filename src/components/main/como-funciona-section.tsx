import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

const passos = [
  {
    n: "01",
    titulo: "Você se cadastra e paga a primeira mensalidade.",
    descricao:
      "Preenche o formulário, fala com o nosso consultor no WhatsApp, assina o contrato online e paga via boleto, cartão ou Pix. Tudo digital, sem precisar sair de casa.",
  },
  {
    n: "02",
    titulo: "A gente monta a sua escola em poucos dias.",
    descricao:
      "Configuramos o site no seu endereço (um subdomínio nosso ou um endereço seu), colocamos a sua marca e suas cores. Os cursos do catálogo já chegam liberados.",
  },
  {
    n: "03",
    titulo: "Você começa a divulgar e vender.",
    descricao:
      "Posta no Instagram, no WhatsApp, no grupo da família, manda pro pessoal do trabalho. Cada um que comprar pelo seu site é seu aluno e o dinheiro entra direto na sua conta.",
  },
  {
    n: "04",
    titulo: "O aluno vira aluno sozinho, sem trabalho pra você.",
    descricao:
      "Quando o pagamento entra, o sistema manda o e-mail com login, senha e o link das aulas. Você não precisa fazer nada nessa hora, só comemorar a venda.",
  },
]

export function ComoFuncionaSection() {
  return (
    <section id="como-funciona" className="bg-[var(--color-pmb-mist)] py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
          <header className="lg:col-span-4" data-reveal>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-pmb-green)]">
              Como funciona na prática
            </p>
            <h2 className="mt-4 text-4xl font-black leading-tight tracking-tight text-[var(--color-pmb-green-900)] md:text-5xl">
              Em 4 passos, a sua escola está vendendo.
            </h2>
            <p className="mt-5 text-base text-gray-700">
              Sem letra miúda, sem promessa difícil. Funciona assim pra todo
              mundo que entra.
            </p>

            <a href="#formulario" className="mt-8 inline-block">
              <Button
                size="lg"
                className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
              >
                Quero começar pelo passo 1
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </a>
          </header>

          <ol className="relative lg:col-span-8" data-stagger data-stagger-step="0.12">
            <div
              aria-hidden
              className="absolute left-[18px] top-2 bottom-2 w-px bg-[var(--color-pmb-green)]/20 md:left-[22px]"
            />
            {passos.map((passo) => (
              <li
                key={passo.n}
                className="relative flex gap-5 pb-10 last:pb-0 md:gap-7"
              >
                <span className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-pmb-green)] font-mono text-xs font-bold text-yellow-300 ring-4 ring-[var(--color-pmb-mist)] md:h-11 md:w-11 md:text-sm">
                  {passo.n}
                </span>
                <div className="flex-1 pt-1">
                  <h3 className="text-lg font-bold tracking-tight text-[var(--color-pmb-green-900)] md:text-xl">
                    {passo.titulo}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600 md:text-base">
                    {passo.descricao}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
