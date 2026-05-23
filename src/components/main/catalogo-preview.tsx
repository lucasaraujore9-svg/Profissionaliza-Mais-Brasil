import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Laptop2,
  Heart,
  Wrench,
  Briefcase,
  Sparkles,
  Calculator,
} from "lucide-react"

const categorias = [
  {
    icon: Laptop2,
    nome: "Informática",
    cursos: ["Pacote Office completo", "Excel avançado", "Manutenção de computador"],
  },
  {
    icon: Heart,
    nome: "Saúde e bem-estar",
    cursos: ["Cuidador de idosos", "Auxiliar de enfermagem", "Massoterapia"],
  },
  {
    icon: Wrench,
    nome: "Técnico profissional",
    cursos: ["Eletricista predial", "Mecânica de motos", "Refrigeração"],
  },
  {
    icon: Briefcase,
    nome: "Administração e vendas",
    cursos: ["Gestão de pequenos negócios", "Vendas e atendimento", "Recursos humanos"],
  },
  {
    icon: Sparkles,
    nome: "Beleza e estética",
    cursos: ["Cabeleireiro profissional", "Design de sobrancelhas", "Maquiagem"],
  },
  {
    icon: Calculator,
    nome: "Finanças e contabilidade",
    cursos: ["Departamento pessoal", "Rotinas contábeis", "Educação financeira"],
  },
]

export function CatalogoPreview() {
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
          <header className="lg:col-span-5" data-reveal>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-pmb-green)]">
              O que você vai vender
            </p>
            <h2 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight text-[var(--color-pmb-green-900)] md:text-5xl">
              Catálogo com dezenas de cursos profissionalizantes.
              <br />
              <span className="text-gray-400">Aqui vão alguns.</span>
            </h2>
            <p className="mt-6 text-base text-gray-700 md:text-lg">
              O catálogo cobre as áreas que mais vendem no Brasil: informática,
              saúde, técnico, administração, beleza, finanças. Você escolhe
              quais cursos vai oferecer e por quanto.
            </p>

            <a href="#formulario" className="mt-8 inline-block">
              <Button
                size="lg"
                className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
              >
                Quero ver o catálogo completo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </a>
          </header>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-7" data-stagger>
            {categorias.map((cat) => (
              <article
                key={cat.nome}
                className="group rounded-2xl border border-[var(--color-pmb-green-900)]/10 bg-[var(--color-pmb-mist)] p-6 transition-all hover:-translate-y-1 hover:border-[var(--color-pmb-green)]/30 hover:bg-white hover:shadow-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[var(--color-pmb-green)] ring-1 ring-[var(--color-pmb-green)]/15 transition-colors group-hover:bg-[var(--color-pmb-lime-50)]">
                    <cat.icon className="h-5 w-5" />
                  </span>
                  <h3 className="text-base font-bold tracking-tight text-[var(--color-pmb-green-900)]">
                    {cat.nome}
                  </h3>
                </div>
                <ul className="mt-5 space-y-2">
                  {cat.cursos.map((curso) => (
                    <li
                      key={curso}
                      className="flex items-center gap-2 text-sm text-gray-700"
                    >
                      <span className="h-1 w-1 rounded-full bg-[var(--color-pmb-green)]" />
                      {curso}
                    </li>
                  ))}
                </ul>
                <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-pmb-green)]/70">
                  E mais cursos nessa área
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
