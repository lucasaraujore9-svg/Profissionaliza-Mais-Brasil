import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

const naoEh = [
  "Você quer ganhar muito dinheiro sem mexer um dedo.",
  "Você não tem paciência pra postar, divulgar e responder cliente.",
  "Você acha que abrir um negócio leva uma semana e ponto.",
  "Você não acredita em curso profissionalizante como produto sério.",
]

const eh = [
  "Você quer ter o seu próprio negócio na internet, com a sua marca.",
  "Você já dá aula, trabalha com cursos ou vende online e quer crescer.",
  "Você tem escola, comunidade ou loja física e quer começar a vender online.",
  "Você está cansado de trabalhar pra dar lucro pros outros.",
]

export function QualificacaoPerfil() {
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-pmb-terracotta)]">
            Antes de pagar a primeira mensalidade
          </p>
          <h2 className="mt-4 text-4xl font-black leading-tight tracking-tight text-[var(--color-pmb-green-900)] md:text-5xl">
            A gente prefere falar a verdade.
            <br />
            <span className="text-gray-400">Isso não é pra todo mundo.</span>
          </h2>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-0 lg:grid-cols-2">
          <div className="border-y border-rose-200 bg-rose-50/40 p-8 md:p-10">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-rose-700/80">
              Não é pra você
            </p>
            <p className="mt-2 text-5xl font-black tracking-tight text-rose-700 md:text-7xl">
              não.
            </p>
            <ul className="mt-8 space-y-5">
              {naoEh.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 border-t border-rose-200/60 pt-5 first:border-t-0 first:pt-0"
                >
                  <span className="mt-0.5 text-rose-400">✕</span>
                  <span className="text-sm leading-relaxed text-gray-800 md:text-base">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-y border-[var(--color-pmb-green)]/30 bg-[var(--color-pmb-lime-50)]/60 p-8 md:p-10">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-pmb-green-700)]">
              É pra você
            </p>
            <p className="mt-2 text-5xl font-black tracking-tight text-[var(--color-pmb-green-900)] md:text-7xl">
              sim.
            </p>
            <ul className="mt-8 space-y-5">
              {eh.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 border-t border-[var(--color-pmb-green)]/15 pt-5 first:border-t-0 first:pt-0"
                >
                  <span className="mt-0.5 text-[var(--color-pmb-green)]">
                    ✓
                  </span>
                  <span className="text-sm leading-relaxed text-gray-800 md:text-base">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <a href="#formulario">
            <Button
              size="lg"
              className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
            >
              É pra mim, quero começar
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </a>
          <p className="text-sm text-gray-500">
            Em poucos dias, a sua escola está vendendo.
          </p>
        </div>
      </div>
    </section>
  )
}
