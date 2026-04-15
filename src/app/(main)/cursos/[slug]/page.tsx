import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Award, Clock, PlayCircle, CheckCircle2, Star, ShieldCheck, Infinity as InfinityIcon } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { MAIS_VENDIDOS, SAUDE, CONSTRUCAO, BELEZA } from "@/components/main/home/courses-data"

interface CursoView {
  slug: string
  titulo: string
  categoria: string
  descricao: string
  qtdAulas: number
  cargaHoraria: string
  preco: string
  precoDe?: string
  parcelas: string
  capa?: string | null
}

async function loadCurso(slug: string): Promise<CursoView | null> {
  try {
    const c = await prisma.course.findUnique({ where: { slug } })
    if (!c) return fallback(slug)
    const preco = c.precoVitrineMain ?? c.precoPromocional ?? c.precoOriginal
    const precoDe = c.precoPromocional && c.precoOriginal && Number(c.precoOriginal) > Number(c.precoPromocional)
      ? Number(c.precoOriginal)
      : undefined
    return {
      slug: c.slug,
      titulo: c.nome,
      categoria: c.categoriaLoja ?? "Curso profissionalizante",
      descricao: c.descricaoOverride || c.descricao || "Curso profissionalizante com certificado reconhecido.",
      qtdAulas: c.qtdAulas,
      cargaHoraria: c.cargaHoraria ?? `${c.qtdAulas} aulas`,
      preco: preco ? `R$ ${Number(preco).toFixed(2).replace(".", ",")}` : "Consulte",
      precoDe: precoDe ? `R$ ${precoDe.toFixed(2).replace(".", ",")}` : undefined,
      parcelas: c.parcelasSugeridas ? `ou ${c.parcelasSugeridas}x sem juros` : "12x sem juros",
      capa: c.capaOverride || c.capaImageUrl,
    }
  } catch {
    return fallback(slug)
  }
}

function fallback(slug: string): CursoView | null {
  const all = [...MAIS_VENDIDOS, ...SAUDE, ...CONSTRUCAO, ...BELEZA]
  const c = all.find((x) => x.slug === slug)
  if (!c) return null
  return {
    slug: c.slug,
    titulo: c.titulo,
    categoria: c.categoria,
    descricao:
      "Curso profissionalizante com certificado reconhecido. Aulas práticas e objetivas, acesso vitalício em qualquer dispositivo.",
    qtdAulas: 40,
    cargaHoraria: c.horas,
    preco: c.preco,
    precoDe: c.precoDe,
    parcelas: c.parcelas,
    capa: null,
  }
}

const BENEFICIOS = [
  { icon: PlayCircle, texto: "Aulas em vídeo de alta qualidade" },
  { icon: InfinityIcon, texto: "Acesso vitalício ao conteúdo" },
  { icon: Award, texto: "Certificado reconhecido" },
  { icon: ShieldCheck, texto: "7 dias de garantia" },
]

export default async function CursoDetalhePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const curso = await loadCurso(slug)
  if (!curso) notFound()

  return (
    <div className="bg-[var(--color-pmb-mist)]">
      <section className="bg-[var(--color-pmb-green)] text-white">
        <div className="mx-auto max-w-[1280px] px-4 py-10 md:px-6 md:py-14">
          <Link
            href="/cursos"
            className="inline-flex items-center gap-1.5 text-[13px] text-white/75 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Voltar para o catálogo
          </Link>

          <div className="mt-6 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-[var(--color-pmb-lime)]">
                {curso.categoria}
              </p>
              <h1 className="mt-2 text-[30px] font-black leading-tight md:text-[42px]">{curso.titulo}</h1>
              <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/85">{curso.descricao}</p>

              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] text-white/85">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-[var(--color-pmb-gold)]" aria-hidden />
                  {curso.cargaHoraria}
                </span>
                <span className="flex items-center gap-1.5">
                  <PlayCircle className="h-4 w-4 text-[var(--color-pmb-gold)]" aria-hidden />
                  {curso.qtdAulas} aulas
                </span>
                <span className="flex items-center gap-1.5">
                  <Award className="h-4 w-4 text-[var(--color-pmb-gold)]" aria-hidden />
                  Certificado incluso
                </span>
                <span className="flex items-center gap-1.5">
                  <Star className="h-4 w-4 fill-[var(--color-pmb-gold)] text-[var(--color-pmb-gold)]" aria-hidden />
                  4.9 (8.2k alunos)
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white p-5 text-[var(--color-pmb-green)] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.4)]">
              {curso.precoDe && (
                <p className="text-[12.5px] line-through text-[rgba(2,89,24,0.55)]">De {curso.precoDe}</p>
              )}
              <p className="mt-0.5 text-[10.5px] font-bold uppercase tracking-widest text-[var(--color-pmb-gold-600)]">
                Investimento
              </p>
              <p className="text-[36px] font-black leading-none">{curso.preco}</p>
              <p className="mt-1 text-[12.5px] text-[rgba(2,89,24,0.7)]">{curso.parcelas}</p>

              <Link
                href={`/contato?curso=${encodeURIComponent(curso.slug)}`}
                className="mt-5 block w-full rounded-lg bg-[var(--color-pmb-gold)] px-4 py-3 text-center text-[14px] font-black text-[var(--color-pmb-green)] transition-colors hover:brightness-105"
              >
                Quero me matricular
              </Link>
              <Link
                href="/ajuda"
                className="mt-2 block w-full rounded-lg border border-[rgba(2,89,24,0.15)] px-4 py-3 text-center text-[13px] font-bold text-[var(--color-pmb-green)] transition-colors hover:border-[var(--color-pmb-green)]"
              >
                Tirar dúvidas
              </Link>

              <ul className="mt-5 space-y-2.5 text-[13px]">
                {BENEFICIOS.map((b) => (
                  <li key={b.texto} className="flex items-center gap-2">
                    <b.icon className="h-4 w-4 text-[var(--color-pmb-gold-600)]" aria-hidden />
                    {b.texto}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-10 md:px-6 md:py-14">
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="text-[22px] font-black text-[var(--color-pmb-green)]">O que você vai aprender</h2>
            <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {[
                "Fundamentos teóricos e práticos da profissão",
                "Ferramentas e materiais essenciais",
                "Técnicas modernas e mais procuradas no mercado",
                "Como atender clientes com excelência",
                "Precificação e gestão do seu negócio",
                "Marketing e captação nas redes sociais",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 rounded-lg border border-[rgba(2,89,24,0.08)] bg-white p-3 text-[13.5px] text-[var(--color-pmb-green)]"
                >
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-pmb-gold-600)]"
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>

            <h2 className="mt-10 text-[22px] font-black text-[var(--color-pmb-green)]">Para quem é este curso</h2>
            <p className="mt-3 text-[14.5px] leading-relaxed text-[rgba(2,89,24,0.8)]">
              Para quem quer aprender uma profissão do zero, mudar de área, ou aprimorar o que já faz.
              Sem pré-requisitos — basta vontade de aprender e se dedicar ao estudo.
            </p>
          </div>

          <aside className="rounded-xl border border-[rgba(2,89,24,0.08)] bg-white p-5">
            <h3 className="text-[14px] font-black uppercase tracking-wider text-[var(--color-pmb-gold-600)]">
              Ficou em dúvida?
            </h3>
            <p className="mt-2 text-[13.5px] text-[rgba(2,89,24,0.75)]">
              Fale com a gente no WhatsApp. Nosso time está pronto para te ajudar a escolher o curso certo.
            </p>
            <Link
              href="/contato"
              className="mt-4 inline-block rounded-lg bg-[var(--color-pmb-green)] px-4 py-2.5 text-[13px] font-bold text-white"
            >
              Falar com atendimento
            </Link>
          </aside>
        </div>
      </section>
    </div>
  )
}

export const dynamic = "force-dynamic"
