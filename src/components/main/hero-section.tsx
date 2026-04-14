import Link from "next/link"
import { ArrowRight, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-white to-[#FAFAFA] py-16 md:py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              <Sparkles className="h-3 w-3" />
              Plataforma 100% white-label
            </div>

            <h1 className="mt-6 text-4xl font-bold tracking-tight text-[#1A1A2E] md:text-5xl lg:text-6xl">
              Venda cursos profissionalizantes com a{" "}
              <span className="text-blue-600">sua marca</span>
            </h1>

            <p className="mt-6 text-base text-gray-600 md:text-lg lg:pr-8">
              Tenha uma vitrine personalizada, domínio próprio e catálogo de cursos pronto.
              Você foca em vender, a gente cuida de tudo o resto.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Link href="/seja-revendedor">
                <Button size="lg" className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto">
                  Seja Revendedor
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="#como-funciona">
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  Como Funciona
                </Button>
              </Link>
            </div>

            <div className="mt-8 flex items-center justify-center gap-6 text-xs text-gray-500 lg:justify-start">
              <div>
                <span className="font-mono text-lg font-bold text-[#1A1A2E]">500+</span>
                <p>Revendedores</p>
              </div>
              <div className="h-8 w-px bg-gray-200" />
              <div>
                <span className="font-mono text-lg font-bold text-[#1A1A2E]">120</span>
                <p>Cursos</p>
              </div>
              <div className="h-8 w-px bg-gray-200" />
              <div>
                <span className="font-mono text-lg font-bold text-[#1A1A2E]">15k+</span>
                <p>Alunos ativos</p>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-2xl">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="rounded-2xl bg-white/95 p-6 shadow-xl backdrop-blur lg:p-8">
                  <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
                    <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
                    <div className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                    <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
                    <span className="ml-2 text-xs text-gray-400">minhaescola.com.br</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="h-3 w-32 rounded bg-blue-600" />
                    <div className="h-2 w-full rounded bg-gray-200" />
                    <div className="h-2 w-5/6 rounded bg-gray-200" />
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="h-16 rounded-lg bg-blue-100" />
                      <div className="h-16 rounded-lg bg-blue-50" />
                    </div>
                    <div className="h-8 w-24 rounded bg-blue-600" />
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -right-6 -bottom-6 hidden h-32 w-32 rounded-2xl bg-yellow-100 lg:block" />
            <div className="absolute -top-4 -left-4 hidden h-20 w-20 rounded-full bg-blue-100 lg:block" />
          </div>
        </div>
      </div>
    </section>
  )
}
