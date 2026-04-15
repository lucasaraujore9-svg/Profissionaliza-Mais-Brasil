import { Star, Quote } from "lucide-react"

interface Depoimento {
  nome: string
  cidade: string
  curso: string
  texto: string
  renda: string
  iniciais: string
  cor: string
}

const DEPOIMENTOS: Depoimento[] = [
  {
    nome: "Josilene Barbosa",
    cidade: "Teresina / PI",
    curso: "Confeitaria do Zero",
    texto:
      "Eu fazia bolo só pra família. Depois do curso comecei a vender pras vizinhas, hoje tenho encomenda pro mês todo. Já paguei a geladeira nova à vista.",
    renda: "Faturando R$ 2.400/mês",
    iniciais: "JB",
    cor: "var(--color-pmb-lime)",
  },
  {
    nome: "Marciel Damasceno",
    cidade: "Manaus / AM",
    curso: "Cuidador de Idosos",
    texto:
      "Tava desempregado há 8 meses. Fiz o curso em 2 meses estudando no celular à noite. No mesmo mês que peguei o certificado, já tinha vaga numa clínica aqui perto.",
    renda: "Contratado com carteira",
    iniciais: "MD",
    cor: "var(--color-pmb-cyan)",
  },
  {
    nome: "Adriana Santos",
    cidade: "Feira de Santana / BA",
    curso: "Manicure e Pedicure",
    texto:
      "Eu tinha vergonha de cobrar porque achava que não sabia direito. Depois do curso aprendi técnica profissional, hoje cobro R$ 40 em unha decorada e tenho agenda cheia.",
    renda: "Agenda cheia toda semana",
    iniciais: "AS",
    cor: "var(--color-pmb-gold)",
  },
]

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
          <p className="mt-2 text-[14px] text-[rgba(2,89,24,0.65)]">
            Mais de <span className="font-bold text-[var(--color-pmb-green)]">180 mil alunos</span> já
            aprenderam uma profissão com a gente.
          </p>
        </div>

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

              <div className="flex items-center gap-1 text-[var(--color-pmb-gold)]">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} className="h-4 w-4 fill-current" aria-hidden />
                ))}
              </div>

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
                💰 {d.renda}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
