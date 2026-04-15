import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

export function HeroBanner() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[var(--color-pmb-green)] via-[var(--color-pmb-green-700)] to-[var(--color-pmb-green-900)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 10% 20%, rgba(255,255,255,0.3) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(255,200,100,0.25) 0%, transparent 40%)",
        }}
      />

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-16 md:grid-cols-2 md:items-center md:py-24 md:px-6 lg:py-28">
        <div className="text-center md:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur">
            <Sparkles className="h-3 w-3" />
            Até 40% OFF em todo catálogo
          </div>

          <h1 className="mt-4 text-3xl font-bold tracking-tight text-white md:text-4xl lg:text-5xl">
            Aprenda uma nova profissão em{" "}
            <span className="text-yellow-300">menos de 3 meses</span>
          </h1>

          <p className="mt-4 max-w-lg text-base text-[var(--color-pmb-lime-50)] md:text-lg">
            Cursos profissionalizantes com certificado, material didático completo
            e suporte online de segunda a sexta.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center md:justify-start">
            <Button size="lg" className="bg-yellow-300 text-[var(--color-pmb-green-900)] hover:bg-yellow-400">
              Ver cursos
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/40 bg-transparent text-white hover:bg-white/10"
            >
              Fale conosco
            </Button>
          </div>
        </div>

        <div className="relative hidden md:block">
          <div className="relative aspect-square w-full max-w-md rounded-2xl bg-white/10 backdrop-blur-sm">
            <div className="absolute inset-6 grid grid-cols-2 gap-4">
              <div className="aspect-square rounded-xl bg-gradient-to-br from-yellow-300 to-orange-400" />
              <div className="aspect-square rounded-xl bg-gradient-to-br from-pink-400 to-red-500" />
              <div className="aspect-square rounded-xl bg-gradient-to-br from-green-400 to-emerald-600" />
              <div className="aspect-square rounded-xl bg-gradient-to-br from-purple-400 to-violet-600" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
