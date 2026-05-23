import { Quote } from "lucide-react"

interface Depoimento {
  nome: string
  cidade: string
  curso: string
  texto: string
  renda: string
  iniciais: string
  cor: string
}

const DEPOIMENTOS: Depoimento[] = []

export function Testimonials() {
  return (
    <section className="border-b border-[rgba(2,89,24,0.08)] bg-[var(--color-pmb-mist)]">
      <div className="mx-auto max-w-[1280px] px-4 py-14 md:px-6 md:py-18">
        <div className="mb-10 text-center">
          <p className="text-[11px] font-black uppercase tracking-widest text-[var(--color-pmb-gold-600)]">
            Histórias reais
          </p>
          <h2 className="mt-1 text-[26px] font-black leading-tight text-[var(--color-pmb-green)] md:text-[32px]">
            Gente como você que mudou de vida.
          </h2>
          {DEPOIMENTOS.length > 0 && (
            <p className="mt-2 text-[14px] text-[rgba(2,89,24,0.65)]">
              Histórias de alunos que mudaram de vida com a PMB.
            </p>
          )}
        </div>

        {DEPOIMENTOS.length === 0 ? (
          <div className="mx-auto flex max-w-2xl flex-col items-center justify-center rounded-2xl border border-dashed border-[rgba(2,89,24,0.18)] bg-white px-6 py-12 text-center">
            <Quote
              className="h-10 w-10 text-[var(--color-pmb-lime)] opacity-80"
              strokeWidth={2}
              aria-hidden
            />
            <p className="mt-4 text-[15px] font-bold text-[var(--color-pmb-green)]">
              Em breve, depoimentos de quem já faz parte da nossa rede.
            </p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[rgba(2,89,24,0.7)]">
              Estamos coletando histórias reais de alunos e parceiros para compartilhar aqui.
            </p>
          </div>
        ) : (
          <ul className="grid gap-5 md:grid-cols-3">
            {DEPOIMENTOS.map((d) => (
              <li
                key={d.nome}
                className="relative flex flex-col rounded-2xl border border-[rgba(2,89,24,0.08)] bg-white p-6 shadow-[0_10px_30px_-18px_rgba(2,89,24,0.2)]"
              >
                <Quote
                  className="absolute right-5 top-5 h-8 w-8 text-[var(--color-pmb-lime)] opacity-60"
                  strokeWidth={2}
                  aria-hidden
                />

                <p className="mt-3 flex-1 text-[14.5px] leading-relaxed text-[rgba(2,89,24,0.82)]">
                  &ldquo;{d.texto}&rdquo;
                </p>

                <div className="mt-5 flex items-center gap-3 border-t border-[rgba(2,89,24,0.08)] pt-4">
                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[13px] font-black text-[var(--color-pmb-green)]"
                    style={{ background: d.cor }}
                  >
                    {d.iniciais}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold text-[var(--color-pmb-green)]">
                      {d.nome}
                    </p>
                    <p className="truncate text-[12px] text-[rgba(2,89,24,0.6)]">
                      {d.cidade} · {d.curso}
                    </p>
                  </div>
                </div>

                <div className="mt-3 inline-flex w-max items-center rounded-full bg-[var(--color-pmb-lime-50)] px-2.5 py-1 text-[11px] font-bold text-[var(--color-pmb-green)]">
                  {d.renda}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
