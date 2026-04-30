import { Smartphone, Clock } from "lucide-react"

const BENEFICIOS = [
  {
    icon: Smartphone,
    titulo: "Estude pelo celular",
    texto: "Sem precisar de computador. As aulas rodam em qualquer Android ou iPhone, até na internet fraca.",
  },
  {
    icon: Clock,
    titulo: "No seu tempo",
    texto: "Estude 15 minutinhos por dia ou 3 horas no fim de semana. Você é quem manda no ritmo.",
  },
]

export function LearnAnywhere() {
  return (
    <section className="border-b border-[rgba(2,89,24,0.08)] bg-white">
      <div className="mx-auto grid max-w-[1280px] gap-10 px-4 py-14 md:grid-cols-2 md:px-6 md:py-18 lg:gap-16">
        <div className="relative">
          <div className="relative mx-auto aspect-[3/4] w-full max-w-[380px] overflow-hidden rounded-[28px] bg-[var(--color-pmb-green)] shadow-[0_30px_60px_-24px_rgba(2,89,24,0.45)]">
            <div
              aria-hidden
              className="absolute -right-10 -top-10 h-56 w-56 rounded-full"
              style={{ background: "var(--color-pmb-gold)", opacity: 0.25 }}
            />
            <div
              aria-hidden
              className="absolute -left-14 bottom-[-40px] h-72 w-72 rounded-full"
              style={{ background: "var(--color-pmb-cyan)", opacity: 0.18 }}
            />

            <div className="relative flex h-full flex-col justify-end p-8">
              <h3 className="text-[28px] font-black leading-tight text-white">
                Sua escola<br />
                no bolso.
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed text-white/80">
                Assista aulas no ônibus, na hora do almoço, antes de dormir.
                O certificado chega no seu e-mail em PDF.
              </p>

              <div className="mt-6 flex items-center gap-3 rounded-2xl bg-white/10 p-3 backdrop-blur">
                <div className="h-12 w-12 shrink-0 rounded-xl bg-[var(--color-pmb-gold)]" />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-white">
                    Confeitaria Lucrativa
                  </p>
                  <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/20">
                    <div className="h-full w-3/5 rounded-full bg-[var(--color-pmb-lime)]" />
                  </div>
                  <p className="mt-1 text-[11px] text-white/70">Aula 14 de 30 · 60% concluído</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center">
          <p className="text-[11px] font-black uppercase tracking-widest text-[var(--color-pmb-gold-600)]">
            Aprenda do seu jeito
          </p>
          <h2 className="mt-1 text-[28px] font-black leading-[1.1] text-[var(--color-pmb-green)] md:text-[36px]">
            Estude quando puder, onde estiver.
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[rgba(2,89,24,0.72)]">
            Sabemos que a vida é corrida. Por isso nossos cursos são pensados
            pra quem trabalha, cuida de casa e ainda quer aprender uma profissão nova.
          </p>

          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {BENEFICIOS.map((b) => (
              <li key={b.titulo} className="flex gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--color-pmb-lime-50)]">
                  <b.icon
                    className="h-5 w-5 text-[var(--color-pmb-green)]"
                    strokeWidth={2.25}
                    aria-hidden
                  />
                </span>
                <div>
                  <p className="text-[14px] font-bold text-[var(--color-pmb-green)]">
                    {b.titulo}
                  </p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-[rgba(2,89,24,0.65)]">
                    {b.texto}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
