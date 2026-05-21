import { Check, X } from "lucide-react"

const linhas = [
  {
    criterio: "Quanto custa pra começar",
    pmb: "R$ 209/mês",
    afiliados: "Grátis",
    propria: "R$ 30 mil+",
  },
  {
    criterio: "Quanto a plataforma fica da sua venda",
    pmb: "Nada",
    afiliados: "30% a 70%",
    propria: "Nada",
  },
  {
    criterio: "Cursos prontos pra você vender hoje",
    pmb: true,
    afiliados: true,
    propria: false,
  },
  {
    criterio: "Você pode subir os seus próprios cursos",
    pmb: true,
    afiliados: true,
    propria: true,
  },
  {
    criterio: "O dinheiro cai direto na sua conta",
    pmb: true,
    afiliados: false,
    propria: true,
  },
  {
    criterio: "O aluno vê só a sua marca",
    pmb: true,
    afiliados: false,
    propria: true,
  },
  {
    criterio: "Tempo pra começar a vender",
    pmb: "Poucos dias",
    afiliados: "Imediato",
    propria: "3 a 6 meses",
  },
  {
    criterio: "Suporte pra te ajudar a crescer",
    pmb: true,
    afiliados: false,
    propria: false,
  },
]

function Cell({ value, accent }: { value: string | boolean; accent?: boolean }) {
  if (typeof value === "boolean") {
    return value ? (
      <Check
        className={`mx-auto h-5 w-5 ${
          accent
            ? "text-[var(--color-pmb-green)]"
            : "text-gray-400"
        }`}
        strokeWidth={2.5}
      />
    ) : (
      <X className="mx-auto h-5 w-5 text-rose-300" strokeWidth={2} />
    )
  }
  return (
    <span
      className={`text-sm font-medium ${
        accent ? "text-[var(--color-pmb-green-900)]" : "text-gray-600"
      }`}
    >
      {value}
    </span>
  )
}

export function ComparacaoTabela() {
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-pmb-green)]">
            Comparando caminhos
          </p>
          <h2 className="mt-4 text-4xl font-black leading-tight tracking-tight text-[var(--color-pmb-green-900)] md:text-5xl">
            Por que isso aqui é diferente do que você já tentou.
          </h2>
          <p className="mt-5 text-base text-gray-600 md:text-lg">
            Não existe caminho perfeito pra todo mundo. A gente prefere mostrar a tabela aberta a prometer milagre.
          </p>
        </div>

        <div className="mt-14 overflow-x-auto">
          <table className="w-full min-w-[700px] border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                <th className="py-5 pr-4 align-bottom font-mono text-[11px] uppercase tracking-[0.2em] text-gray-500">
                  &nbsp;
                </th>
                <th className="rounded-t-2xl bg-[var(--color-pmb-green-900)] px-6 py-6 text-center align-bottom">
                  <span className="block font-mono text-[11px] uppercase tracking-[0.2em] text-yellow-300">
                    Recomendado
                  </span>
                  <span className="mt-2 block text-base font-bold text-white md:text-lg">
                    Profissionaliza Mais Brasil
                  </span>
                </th>
                <th className="px-4 py-6 text-center align-bottom font-mono text-[11px] uppercase tracking-[0.2em] text-gray-500 md:px-6">
                  <span className="block">Afiliado</span>
                  <span className="mt-1 block text-xs normal-case tracking-normal text-gray-400">
                    Hotmart, Kiwify, Eduzz
                  </span>
                </th>
                <th className="px-4 py-6 text-center align-bottom font-mono text-[11px] uppercase tracking-[0.2em] text-gray-500 md:px-6">
                  <span className="block">Criar do zero</span>
                  <span className="mt-1 block text-xs normal-case tracking-normal text-gray-400">
                    Plataforma própria
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha, i) => (
                <tr key={linha.criterio}>
                  <td
                    className={`py-5 pr-4 align-middle text-sm font-medium text-[var(--color-pmb-green-900)] ${
                      i === 0 ? "" : "border-t border-gray-200"
                    }`}
                  >
                    {linha.criterio}
                  </td>
                  <td
                    className={`bg-[var(--color-pmb-lime-50)]/50 px-6 py-5 text-center align-middle ${
                      i === 0 ? "" : "border-t border-[var(--color-pmb-green)]/15"
                    }`}
                  >
                    <Cell value={linha.pmb} accent />
                  </td>
                  <td
                    className={`px-4 py-5 text-center align-middle md:px-6 ${
                      i === 0 ? "" : "border-t border-gray-200"
                    }`}
                  >
                    <Cell value={linha.afiliados} />
                  </td>
                  <td
                    className={`px-4 py-5 text-center align-middle md:px-6 ${
                      i === 0 ? "" : "border-t border-gray-200"
                    }`}
                  >
                    <Cell value={linha.propria} />
                  </td>
                </tr>
              ))}
              <tr>
                <td className="border-t border-gray-200 py-5 pr-4" />
                <td className="rounded-b-2xl border-t border-[var(--color-pmb-green)]/15 bg-[var(--color-pmb-lime-50)]/50 py-5" />
                <td className="border-t border-gray-200 py-5" />
                <td className="border-t border-gray-200 py-5" />
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-8 max-w-3xl text-sm text-gray-500">
          Sendo honesto: se você já tem um curso gravado e só quer vender ele
          sem pagar mensalidade, ser afiliado em uma plataforma de curso pode
          fazer mais sentido. O Profissionaliza Mais Brasil é pra quem quer
          construir uma escola própria, com marca e cliente próprio.
        </p>
      </div>
    </section>
  )
}
