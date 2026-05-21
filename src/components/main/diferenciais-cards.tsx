import { Award, BookMarked, Wallet, Zap, Globe2, Headset } from "lucide-react"

const diferenciais = [
  {
    n: "01",
    icon: Award,
    titulo: "A escola tem a cara da sua marca.",
    descricao:
      "Você escolhe o nome, as cores, o logo e o endereço. O aluno enxerga só a sua marca, o nosso nome não aparece em momento nenhum.",
  },
  {
    n: "02",
    icon: BookMarked,
    titulo: "Catálogo pronto e cursos seus.",
    descricao:
      "Já chega tudo pronto pra vender: aulas, materiais e certificado. E você ainda pode gravar e subir os seus próprios cursos se quiser.",
  },
  {
    n: "03",
    icon: Wallet,
    titulo: "O dinheiro cai direto na sua conta.",
    descricao:
      "O aluno paga com cartão, Pix ou boleto e o valor entra na sua conta do Mercado Pago. A gente não pega nada do que você vende.",
  },
  {
    n: "04",
    icon: Zap,
    titulo: "Aluno entra na aula sozinho.",
    descricao:
      "Pagou, recebeu o e-mail com login, senha e o link. Tudo automático. Você não precisa fazer nada nessa hora.",
  },
  {
    n: "05",
    icon: Globe2,
    titulo: "Mensalidade fixa, sem surpresa.",
    descricao:
      "Um valor por mês, sempre o mesmo. Sem comissão por venda, sem taxa por aluno, sem royalty. Vendeu, é seu.",
  },
  {
    n: "06",
    icon: Headset,
    titulo: "Suporte de gente de verdade.",
    descricao:
      "Pessoa do nosso time pra te ajudar a começar, grupo com outras Unidades e treinamentos toda semana.",
  },
]

export function DiferenciaisCards() {
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-pmb-green)]">
            Por que vale a pena
          </p>
          <h2 className="mt-4 text-4xl font-black leading-tight tracking-tight text-[var(--color-pmb-green-900)] md:text-5xl">
            Tudo o que você precisa pra começar a vender amanhã.
          </h2>
          <p className="mt-5 text-lg text-gray-600">
            A gente cuida da parte chata. Você cuida do que importa: vender e
            atender o seu aluno.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-2">
          {diferenciais.map((item, index) => {
            const isLastRow = index >= diferenciais.length - 2
            const isOddCol = index % 2 === 1
            return (
              <article
                key={item.n}
                className={`flex gap-5 border-t border-[var(--color-pmb-green-900)]/10 py-10 lg:py-12 ${
                  isOddCol ? "md:border-l md:pl-8" : "md:pr-8"
                } ${isLastRow ? "md:last-row" : ""}`}
              >
                <div className="flex shrink-0 flex-col items-start gap-3">
                  <span className="font-mono text-xs font-bold tracking-widest text-[var(--color-pmb-green)]/60">
                    {item.n}
                  </span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
                    <item.icon className="h-5 w-5" />
                  </span>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold tracking-tight text-[var(--color-pmb-green-900)]">
                    {item.titulo}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600 md:text-base">
                    {item.descricao}
                  </p>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
