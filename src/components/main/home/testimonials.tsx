import { Quote } from "lucide-react"

interface Depoimento {
  nome: string
  iniciais: string
  texto: string
  cor: string
}

// Depoimentos reais de alunos do Grupo Bolsa Mais Brasil, adaptados para a
// Profissionaliza Mais Brasil sem citar cursos especificos. Os nomes sao
// preservados; o conteudo foi levemente ajustado pra remover referencias
// a cursos/instituicoes especificas e padronizar a marca como "Profissionaliza
// Mais Brasil".
const DEPOIMENTOS: Depoimento[] = [
  {
    nome: "Fani Araújo Borges",
    iniciais: "FB",
    texto:
      "Minha mãe sempre foi minha maior inspiração. Graças ao Profissionaliza Mais Brasil, realizei meu sonho de me profissionalizar. Concluí o curso e consegui uma bolsa de estudos para uma especialização, novamente pelo mesmo programa. Uma dupla oportunidade que mudou minha vida!",
    cor: "var(--color-pmb-lime-50)",
  },
  {
    nome: "Silmara Castro",
    iniciais: "SC",
    texto:
      "Só tenho a agradecer a oportunidade de participar do Profissionaliza Mais Brasil, que me deu uma grande ajuda através do desconto na minha mensalidade e com isso contribuiu consideravelmente na minha formação profissional.",
    cor: "var(--color-pmb-cyan-50)",
  },
  {
    nome: "Jessica Stéfany Estevão",
    iniciais: "JE",
    texto:
      "Agradeço a Deus pela oportunidade de conseguir um belo desconto na mensalidade pelo Profissionaliza Mais Brasil. Fiz amigos, conquistei uma carreira sólida e realizei sonhos da minha família graças a essa chance. Sacrifiquei-me muito, mas estou feliz com tudo que aconteceu. Indico o programa para todos que posso.",
    cor: "var(--color-pmb-mist)",
  },
  {
    nome: "Ketlin Alves",
    iniciais: "KA",
    texto:
      "Conheci o Profissionaliza Mais Brasil pela internet e, graças ao programa, pude estudar e concluir minha formação. A bolsa que recebi foi um marco significativo na minha vida — e hoje, apaixonada pela área que escolhi, pretendo buscar o programa novamente para seguir me qualificando.",
    cor: "var(--color-pmb-lime-50)",
  },
  {
    nome: "Haylla Belfort",
    iniciais: "HB",
    texto:
      "Todo mundo pensa em ter uma profissão e fazer aquilo que gosta — comigo não foi diferente. A possibilidade de estudar era remota, pois o valor das mensalidades era um grande empecilho. Quando conheci o Profissionaliza Mais Brasil pude dar início ao que tanto sonhava. Estudei, fiz amizades e hoje tenho a possibilidade de uma vida melhor.",
    cor: "var(--color-pmb-cyan-50)",
  },
  {
    nome: "Helon Izaque do Carmo",
    iniciais: "HC",
    texto:
      "Sempre quis estudar e buscava uma boa oportunidade. Conheci o Profissionaliza Mais Brasil com ótimas opções de bolsas de estudo. Após muita pesquisa, escolhi minha formação, e a bolsa permitiu que eu concluísse. Encontrei-me na área e hoje sigo me especializando. Recomendo muito o programa!",
    cor: "var(--color-pmb-mist)",
  },
  {
    nome: "Denisie Losque",
    iniciais: "DL",
    texto:
      "Desde pequenos somos motivados a crescer profissionalmente. Quando falamos em crescer, falamos de metas, sonhos e alvos a serem atingidos. O Profissionaliza Mais Brasil tem sido de grande importância na minha vida — tem me levado a concretizar sonhos, conhecer pessoas de valor e projetar minha vida em algo muito maior.",
    cor: "var(--color-pmb-lime-50)",
  },
  {
    nome: "Vinícius Coradello",
    iniciais: "VC",
    texto:
      "Em 2017, voltei a estudar com o Profissionaliza Mais Brasil e consegui um ótimo desconto na mensalidade. Hoje tenho uma profissão e sou extremamente grato por isso. Construí uma grande amizade com a equipe da escola, que me inspirou a nunca desistir dos meus sonhos.",
    cor: "var(--color-pmb-cyan-50)",
  },
  {
    nome: "Matheus Henrique Lima de Jesus",
    iniciais: "MJ",
    texto:
      "O Profissionaliza Mais Brasil tem ajudado boa parte daquelas pessoas que querem se tornar bons profissionais, mas que muitas vezes não têm condições de pagar um valor alto nas mensalidades. Por causa do programa, eu e alguns amigos tivemos a chance de ingressar nos estudos e buscar uma vida melhor. Eu recomendo!",
    cor: "var(--color-pmb-mist)",
  },
]

// Duplicamos a lista para que o marquee CSS (-50% translate) pareca um loop
// continuo. Sem a copia, o salto entre fim e inicio ficaria visivel.
const TRACK = [...DEPOIMENTOS, ...DEPOIMENTOS]

export function Testimonials() {
  return (
    <section className="border-b border-[rgba(2,89,24,0.08)] bg-[var(--color-pmb-mist)] overflow-hidden">
      <div className="mx-auto max-w-[1280px] px-4 py-14 md:px-6 md:py-18">
        <div className="mb-10 text-center">
          <p className="text-[11px] font-black uppercase tracking-widest text-[var(--color-pmb-gold-600)]">
            Histórias reais
          </p>
          <h2 className="mt-1 text-[26px] font-black leading-tight text-[var(--color-pmb-green)] md:text-[32px]">
            Gente como você que mudou de vida.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-[14px] leading-relaxed text-[rgba(2,89,24,0.65)] md:text-[15px]">
            Depoimentos de alunos que conquistaram uma profissão com o Profissionaliza Mais Brasil.
          </p>
        </div>
      </div>

      {/* Carrossel infinito: mascara nas laterais + track animada.
          Mobile: ~1 card visivel; sm: ~2; md: ~3; lg+: 4 simultaneos. */}
      <div
        className="relative w-full"
        style={
          {
            // Mascara suave nas bordas para destacar que o conteudo continua.
            maskImage:
              "linear-gradient(90deg, transparent 0, #000 80px, #000 calc(100% - 80px), transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(90deg, transparent 0, #000 80px, #000 calc(100% - 80px), transparent 100%)",
            // Duracao proporcional ao numero de itens (mais itens = roda mais
            // devagar pra cada card ficar tempo legivel em tela)
            "--pmb-marquee-duration": "55s",
          } as React.CSSProperties
        }
      >
        <ul
          className="animate-pmb-marquee flex w-max gap-5 pb-10"
          aria-label="Depoimentos de alunos"
        >
          {TRACK.map((d, idx) => {
            // Iniciais reais (1a metade) e duplicadas (2a metade) compartilham
            // o mesmo conteudo, mas precisam de keys distintas.
            const half = idx < DEPOIMENTOS.length ? "a" : "b"
            return (
              <li
                key={`${d.nome}-${half}`}
                aria-hidden={half === "b"}
                className="relative flex w-[85vw] max-w-[340px] shrink-0 flex-col rounded-2xl border border-[rgba(2,89,24,0.08)] bg-white p-6 shadow-[0_10px_30px_-18px_rgba(2,89,24,0.2)] sm:w-[320px] md:w-[300px]"
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
                    aria-hidden
                  >
                    {d.iniciais}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold text-[var(--color-pmb-green)]">
                      {d.nome}
                    </p>
                    <p className="truncate text-[12px] text-[rgba(2,89,24,0.55)]">
                      Aluno Profissionaliza Mais Brasil
                    </p>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
