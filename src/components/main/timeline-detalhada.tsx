const etapas = [
  {
    numero: "01",
    titulo: "Cadastro e pagamento",
    descricao:
      "Crie sua conta, escolha o plano e assine pelo Asaas. Pagamento 100% seguro.",
    duracao: "2 minutos",
  },
  {
    numero: "02",
    titulo: "Configure sua vitrine",
    descricao:
      "Personalize cores, logo, banner e textos. Tudo pode ser editado a qualquer momento.",
    duracao: "15 minutos",
  },
  {
    numero: "03",
    titulo: "Conecte o Mercado Pago",
    descricao:
      "Vincule sua conta MP pra receber os pagamentos direto. Nós não retemos seu dinheiro.",
    duracao: "5 minutos",
  },
  {
    numero: "04",
    titulo: "Escolha seus cursos",
    descricao:
      "Selecione do catálogo os cursos que sua vitrine vai oferecer e defina preços.",
    duracao: "10 minutos",
  },
  {
    numero: "05",
    titulo: "Comece a vender",
    descricao:
      "Divulgue sua URL. A cada venda, o aluno é matriculado automaticamente e começa a estudar.",
    duracao: "Daqui pra frente",
  },
]

export function TimelineDetalhada() {
  return (
    <section className="bg-[#FAFAFA] py-16 md:py-24">
      <div className="mx-auto max-w-4xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[var(--color-pmb-green-900)] md:text-4xl">
            Do cadastro à primeira venda
          </h2>
          <p className="mt-4 text-gray-600">
            5 etapas claras. Menos de 1 hora do zero à vitrine no ar.
          </p>
        </div>

        <ol className="mt-12 space-y-6 md:space-y-0">
          {etapas.map((etapa, index) => (
            <li key={etapa.numero} className="relative md:flex md:gap-6">
              <div className="relative flex flex-col items-center md:pt-1">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-pmb-green)] font-mono text-sm font-bold text-white shadow-lg shadow-[rgba(2,89,24,0.35)]/30">
                  {etapa.numero}
                </div>
                {index < etapas.length - 1 && (
                  <div className="mt-2 hidden h-full w-px flex-1 bg-gray-300 md:block" />
                )}
              </div>

              <div className="mt-3 flex-1 rounded-2xl border border-gray-200 bg-white p-6 md:mt-0 md:mb-8">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <h3 className="text-lg font-semibold text-[var(--color-pmb-green-900)]">
                    {etapa.titulo}
                  </h3>
                  <span className="inline-flex self-start rounded-full bg-[var(--color-pmb-lime-50)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-pmb-green-700)] md:self-auto">
                    {etapa.duracao}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                  {etapa.descricao}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
