import { Quote } from "lucide-react"

const depoimentos = [
  {
    nome: "Patrícia Mendes",
    cargo: "Revendedora desde 2024",
    foto: "PM",
    fotoColor: "bg-purple-500",
    texto:
      "Em 3 meses consegui estruturar meu negócio de cursos online. A plataforma cuida de tudo: hospedagem, pagamentos, matrículas. Eu só divulgo.",
  },
  {
    nome: "Roberto Silva",
    cargo: "Dono de escola profissionalizante",
    foto: "RS",
    fotoColor: "bg-[var(--color-pmb-cyan)]",
    texto:
      "Triplicamos nossa receita em 6 meses. O catálogo é robusto, os alunos recebem certificados e a gestão é simples como deveria ser.",
  },
  {
    nome: "Carla Nogueira",
    cargo: "Empreendedora digital",
    foto: "CN",
    fotoColor: "bg-green-500",
    texto:
      "Comecei com o plano Starter e já migrei pro Growth. O suporte é atencioso e a experiência do aluno na plataforma é impecável.",
  },
]

export function DepoimentosSection() {
  return (
    <section className="bg-white py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[var(--color-pmb-green-900)] md:text-4xl">
            Quem já está crescendo com a gente
          </h2>
          <p className="mt-4 text-gray-600">
            Histórias reais de revendedores que transformaram seus negócios.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {depoimentos.map((d) => (
            <figure
              key={d.nome}
              className="flex flex-col rounded-2xl border border-gray-200 bg-[#FAFAFA] p-6 lg:p-8"
            >
              <Quote className="h-6 w-6 text-[var(--color-pmb-green)]" />
              <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-gray-700">
                “{d.texto}”
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3 border-t border-gray-200 pt-4">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white ${d.fotoColor}`}
                >
                  {d.foto}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">{d.nome}</p>
                  <p className="text-xs text-gray-500">{d.cargo}</p>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
