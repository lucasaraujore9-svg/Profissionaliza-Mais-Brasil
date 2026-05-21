const dores = [
  {
    n: "01",
    titulo: "Você trabalha pra todo mundo, menos pra você.",
    descricao:
      "O salário paga as contas e some. No fim do ano, a vida está igual. Você sabe que precisa de outra renda mas não sabe por onde começar.",
  },
  {
    n: "02",
    titulo: "Curso online parece a saída, mas você não sabe gravar nada.",
    descricao:
      "Não tem equipamento, não tem prática, não tem tempo. E mesmo se tivesse, ia gastar meses gravando, editando e brigando com tecnologia.",
  },
  {
    n: "03",
    titulo: "Já tentou afiliado e percebeu que enriquece os outros.",
    descricao:
      "Você divulga, vende, recebe uma comissão pequena. A plataforma e o dono do curso ficam com a maior parte. Você nunca tem o cliente.",
  },
  {
    n: "04",
    titulo: "Pensou em abrir uma escola física, mas é caro e arriscado.",
    descricao:
      "Aluguel, professor, alunos, material. Vinte ou trinta mil reais antes da primeira venda. Tudo isso pra depois descobrir se vai dar certo.",
  },
]

export function ProblemaSection() {
  return (
    <section className="bg-[var(--color-pmb-mist)] py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-16">
          <header className="lg:col-span-5 lg:sticky lg:top-24 lg:self-start">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-pmb-terracotta)]">
              Talvez você se reconheça
            </p>
            <h2 className="mt-4 text-4xl font-black leading-tight tracking-tight text-[var(--color-pmb-green-900)] md:text-5xl">
              Querer um negócio próprio é fácil.
              <br />
              <span className="text-[var(--color-pmb-terracotta)]">
                O caminho é que trava.
              </span>
            </h2>
            <p className="mt-5 max-w-md text-gray-700">
              A vontade existe. O tempo livre, nem sempre. O dinheiro pra
              investir, também não. Quase todo mundo que chega aqui já passou
              por uma dessas quatro situações.
            </p>
          </header>

          <ol className="space-y-px lg:col-span-7">
            {dores.map((dor) => (
              <li
                key={dor.n}
                className="group flex items-start gap-6 border-t border-[var(--color-pmb-green-900)]/10 py-7 last:border-b"
              >
                <span className="shrink-0 font-mono text-3xl font-bold text-[var(--color-pmb-green-900)]/30 md:text-4xl">
                  {dor.n}
                </span>
                <div>
                  <h3 className="text-lg font-bold leading-snug text-[var(--color-pmb-green-900)] md:text-xl">
                    {dor.titulo}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600 md:text-base">
                    {dor.descricao}
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
