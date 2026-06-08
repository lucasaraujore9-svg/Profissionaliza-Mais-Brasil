import Image from "next/image"
import Link from "next/link"
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  Clock,
  GraduationCap,
  HelpCircle,
  Infinity as InfinityIcon,
  Layers,
  PlayCircle,
  ShieldCheck,
  Smartphone,
} from "lucide-react"

export interface CourseDetailData {
  slug: string
  nome: string
  categoria: string
  descricao: string | null
  qtdAulas: number
  cargaHoraria: string | null
  imageUrl: string | null
  price: number
  originalPrice: number | null
  parcelas: number | null
  /** ONE_TIME = preco cheio; MONTHLY = mensalidade recorrente. */
  paymentType?: "ONE_TIME" | "MONTHLY"
  /** Quantidade total de mensalidades quando paymentType === "MONTHLY". */
  monthlyMonths?: number | null
  lessons: Array<{ id: string; nome: string; ordem: number }>
}

interface CourseDetailViewProps {
  course: CourseDetailData
  /**
   * Para onde o botão "Quero me matricular" leva.
   * - vitrine de revendedor: `/checkout?courseId=...` ou similar
   * - vitrine principal: `/contato?curso=...` (lead)
   */
  ctaHref: string
  ctaLabel?: string
  backHref: string
  backLabel?: string
  secondaryCtaHref?: string
  secondaryCtaLabel?: string
  /**
   * Slot opcional renderizado no sidebar sticky, dentro de `space-y-5 p-5`,
   * logo apos a lista de features. Usado por revendas com modulo Automacao
   * para exibir o card "Receba mais informacoes".
   */
  inquirySlot?: React.ReactNode
}

const APRENDIZADO_DEFAULT = [
  "Fundamentos teóricos e práticos da profissão",
  "Ferramentas e materiais essenciais do dia a dia",
  "Técnicas modernas e mais procuradas no mercado",
  "Como atender clientes com excelência",
  "Precificação e gestão do seu negócio",
  "Marketing e captação nas redes sociais",
]

const PARA_QUEM = [
  "Quem quer aprender uma profissão do zero",
  "Quem busca uma renda extra ou novo trabalho",
  "Quem já atua na área e quer se atualizar",
  "Empreendedores que querem profissionalizar o atendimento",
]

const FAQ = [
  {
    q: "Quanto tempo tenho para concluir o curso?",
    a: "Você tem 12 meses de acesso a partir da liberação do curso. Pode estudar no seu ritmo, parar e voltar quando quiser dentro desse período.",
  },
  {
    q: "O certificado é reconhecido?",
    a: "Sim. Emitimos certificado digital reconhecido nacionalmente, com carga horária registrada e código de validação único.",
  },
  {
    q: "Posso assistir pelo celular?",
    a: "Sim. As aulas funcionam em qualquer celular Android ou iPhone, tablet ou computador. Vídeos otimizados para internet móvel.",
  },
  {
    q: "Como funciona a garantia de 7 dias?",
    a: "Se nos primeiros 7 dias você não gostar do curso, devolvemos 100% do valor pago, sem perguntas e sem burocracia.",
  },
]

function formatBRL(value: number): string {
  if (value <= 0) return "Consulte"
  return `R$ ${value.toFixed(2).replace(".", ",")}`
}

function splitParagraphs(text: string | null): string[] {
  if (!text) return []
  return text
    .split(/\r?\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
}

export function CourseDetailView({
  course,
  ctaHref,
  ctaLabel = "Quero me matricular",
  backHref,
  backLabel = "Voltar para o catálogo",
  secondaryCtaHref,
  secondaryCtaLabel,
  inquirySlot,
}: CourseDetailViewProps) {
  const paragrafos = splitParagraphs(course.descricao)
  const cargaHoraria = course.cargaHoraria
    ? `${course.cargaHoraria}h`
    : `${course.qtdAulas} aulas`
  const isMonthly = course.paymentType === "MONTHLY"
  const monthlyMonths = isMonthly ? course.monthlyMonths ?? 12 : null
  const parcelas = course.parcelas ?? 12
  const valorParcela = course.price > 0 ? course.price / parcelas : 0
  const desconto =
    course.originalPrice && course.originalPrice > course.price
      ? Math.round(
          ((course.originalPrice - course.price) / course.originalPrice) * 100,
        )
      : null

  return (
    <div className="bg-[var(--color-pmb-mist)] pb-24 lg:pb-0">
      {/* HERO ---------------------------------------------------- */}
      <section className="relative overflow-hidden bg-[var(--color-pmb-green)] text-white">
        {course.imageUrl ? (
          <>
            <Image
              src={course.imageUrl}
              alt={course.nome}
              fill
              priority
              sizes="100vw"
              className="absolute inset-0 object-cover opacity-25"
            />
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-br from-[var(--color-pmb-green)]/95 via-[var(--color-pmb-green)]/85 to-black/70"
            />
          </>
        ) : (
          <div
            aria-hidden
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                "radial-gradient(circle at 15% 25%, #C0D904 0, transparent 40%), radial-gradient(circle at 85% 75%, #F2B705 0, transparent 40%)",
            }}
          />
        )}

        <div className="relative mx-auto max-w-[1280px] px-4 py-8 md:px-6 md:py-12">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-[13px] text-white/80 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {backLabel}
          </Link>

          <div className="mt-6 grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:gap-12">
            <div>
              <span className="inline-block rounded-full bg-[var(--color-pmb-lime)] px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[var(--color-pmb-green)]">
                {course.categoria}
              </span>
              <h1 className="mt-4 text-[32px] font-black leading-[1.05] tracking-tight md:text-[44px] lg:text-[52px]">
                {course.nome}
              </h1>
              {paragrafos[0] && (
                <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/85 md:text-[16px]">
                  {paragrafos[0]}
                </p>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-[13.5px] text-white/85">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck
                    className="h-4 w-4 text-[var(--color-pmb-gold)]"
                    aria-hidden
                  />
                  <span className="text-white/85">Certificado oficial pelo Grupo Bolsa Mais Brasil</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-[var(--color-pmb-gold)]" aria-hidden />
                  {cargaHoraria}
                </span>
                <span className="flex items-center gap-1.5">
                  <PlayCircle className="h-4 w-4 text-[var(--color-pmb-gold)]" aria-hidden />
                  {course.qtdAulas} aulas
                </span>
                <span className="flex items-center gap-1.5">
                  <Award className="h-4 w-4 text-[var(--color-pmb-gold)]" aria-hidden />
                  Certificado incluso
                </span>
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-[var(--color-pmb-gold)]" aria-hidden />
                  7 dias de garantia
                </span>
              </div>
            </div>

            {course.imageUrl && (
              <div className="relative hidden overflow-hidden rounded-2xl border border-white/15 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.5)] lg:block lg:aspect-[4/3]">
                <Image
                  src={course.imageUrl}
                  alt={course.nome}
                  fill
                  priority
                  sizes="(min-width: 1024px) 40vw, 100vw"
                  className="object-cover"
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* CONTEÚDO + SIDEBAR -------------------------------------- */}
      <section className="mx-auto max-w-[1280px] px-4 py-10 md:px-6 md:py-14">
        <div className="grid gap-10 lg:grid-cols-[1fr_360px] lg:gap-14">
          {/* COLUNA PRINCIPAL */}
          <div className="space-y-12">
            {/* Sobre o curso */}
            <div>
              <h2 className="text-[22px] font-black text-[var(--color-pmb-green)] md:text-[26px]">
                Sobre o curso
              </h2>
              <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-[rgba(2,89,24,0.82)]">
                {paragrafos.length > 0 ? (
                  paragrafos.map((p, i) => <p key={i}>{p}</p>)
                ) : (
                  <p>
                    Curso profissionalizante online com material completo,
                    aulas em vídeo de alta qualidade e certificado reconhecido.
                  </p>
                )}
              </div>
            </div>

            {/* O que você vai aprender */}
            <div>
              <h2 className="text-[22px] font-black text-[var(--color-pmb-green)] md:text-[26px]">
                O que você vai aprender
              </h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {APRENDIZADO_DEFAULT.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2.5 rounded-xl border border-[rgba(2,89,24,0.08)] bg-white p-4 text-[14px] text-[var(--color-pmb-green)]"
                  >
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-pmb-gold-600)]"
                      aria-hidden
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Conteúdo do curso */}
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-[22px] font-black text-[var(--color-pmb-green)] md:text-[26px]">
                  Conteúdo do curso
                </h2>
                <span className="rounded-full bg-[var(--color-pmb-mist)] px-3 py-1 text-[12px] font-bold text-[var(--color-pmb-green)]">
                  {course.qtdAulas} aulas · {cargaHoraria}
                </span>
              </div>
              {course.lessons.length > 0 ? (
                <ol className="mt-4 divide-y divide-[rgba(2,89,24,0.08)] overflow-hidden rounded-2xl border border-[rgba(2,89,24,0.08)] bg-white">
                  {course.lessons.map((l, idx) => (
                    <li
                      key={l.id}
                      className="flex items-center gap-3 px-4 py-3 text-[14px] text-[var(--color-pmb-green)]"
                    >
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--color-pmb-mist)] text-[12px] font-black text-[var(--color-pmb-green)]">
                        {idx + 1}
                      </span>
                      <PlayCircle
                        className="h-4 w-4 text-[var(--color-pmb-gold-600)]"
                        aria-hidden
                      />
                      <span className="flex-1">{l.nome}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="mt-4 flex items-start gap-3 rounded-2xl border border-dashed border-[rgba(2,89,24,0.18)] bg-white p-5 text-[13.5px] text-[rgba(2,89,24,0.7)]">
                  <Layers
                    className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-pmb-gold-600)]"
                    aria-hidden
                  />
                  <p>
                    O curso tem <strong>{course.qtdAulas} aulas</strong> com
                    carga horária de <strong>{cargaHoraria}</strong>. Após a
                    matrícula, você recebe acesso completo ao conteúdo na
                    sua área de aulas.
                  </p>
                </div>
              )}
            </div>

            {/* Certificado */}
            <div className="overflow-hidden rounded-2xl border border-[rgba(2,89,24,0.1)] bg-gradient-to-br from-[var(--color-pmb-green)] to-[var(--color-pmb-green-900)] p-6 text-white md:p-8">
              <div className="flex items-start gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/15 backdrop-blur">
                  <GraduationCap className="h-6 w-6 text-[var(--color-pmb-gold)]" aria-hidden />
                </span>
                <div>
                  <h3 className="text-[18px] font-black md:text-[22px]">
                    Certificado reconhecido nacionalmente
                  </h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-white/85">
                    Ao concluir todas as aulas você recebe um certificado
                    digital com {cargaHoraria} de carga horária, código de
                    validação único e QR-code para verificação.
                  </p>
                  <p className="mt-2 text-[13px] text-white/70">
                    Aceito por empresas, concursos e como atividade
                    complementar em faculdades.
                  </p>
                </div>
              </div>
            </div>

            {/* Para quem é */}
            <div>
              <h2 className="text-[22px] font-black text-[var(--color-pmb-green)] md:text-[26px]">
                Para quem é este curso
              </h2>
              <ul className="mt-4 space-y-3">
                {PARA_QUEM.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 text-[14.5px] text-[rgba(2,89,24,0.82)]"
                  >
                    <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--color-pmb-lime-50)]">
                      <CheckCircle2
                        className="h-3.5 w-3.5 text-[var(--color-pmb-green)]"
                        aria-hidden
                      />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* FAQ */}
            <div>
              <h2 className="text-[22px] font-black text-[var(--color-pmb-green)] md:text-[26px]">
                Perguntas frequentes
              </h2>
              <div className="mt-4 divide-y divide-[rgba(2,89,24,0.08)] overflow-hidden rounded-2xl border border-[rgba(2,89,24,0.08)] bg-white">
                {FAQ.map((item) => (
                  <details key={item.q} className="group">
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-5 py-4 text-[14.5px] font-bold text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-mist)]/40">
                      <span className="flex items-start gap-3">
                        <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-pmb-gold-600)]" aria-hidden />
                        {item.q}
                      </span>
                      <span className="text-[18px] text-[var(--color-pmb-green)] transition-transform group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <p className="px-5 pb-5 pl-12 text-[13.5px] leading-relaxed text-[rgba(2,89,24,0.75)]">
                      {item.a}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          </div>

          {/* SIDEBAR PRICING (sticky) */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="overflow-hidden rounded-2xl border border-[rgba(2,89,24,0.1)] bg-white shadow-[0_20px_40px_-20px_rgba(2,89,24,0.25)]">
              {course.imageUrl && (
                <div className="relative aspect-video w-full bg-[var(--color-pmb-mist)] lg:hidden">
                  <Image
                    src={course.imageUrl}
                    alt={course.nome}
                    fill
                    sizes="(min-width: 1024px) 360px, 100vw"
                    className="object-cover"
                  />
                </div>
              )}

              <div className="space-y-5 p-5">
                <div>
                  {course.originalPrice && course.originalPrice > course.price && (
                    <p className="text-[13px] line-through text-[rgba(2,89,24,0.55)]">
                      De {formatBRL(course.originalPrice)}
                    </p>
                  )}
                  <p className="text-[10.5px] font-bold uppercase tracking-widest text-[var(--color-pmb-gold-600)]">
                    {desconto
                      ? `Promoção · ${desconto}% OFF`
                      : isMonthly
                        ? "Mensalidade"
                        : "Investimento"}
                  </p>
                  <p className="mt-1 text-[36px] font-black leading-none text-[var(--color-pmb-green)]">
                    {formatBRL(course.price)}
                    {isMonthly && (
                      <span className="ml-1 text-[16px] font-bold text-[rgba(2,89,24,0.6)]">
                        /mês
                      </span>
                    )}
                  </p>
                  {isMonthly && monthlyMonths ? (
                    <p className="mt-1.5 text-[13px] text-[rgba(2,89,24,0.7)]">
                      {monthlyMonths} mensalidades de {formatBRL(course.price)}
                    </p>
                  ) : (
                    course.price > 0 &&
                    parcelas > 1 && (
                      <p className="mt-1.5 text-[13px] text-[rgba(2,89,24,0.7)]">
                        ou {parcelas}x de {formatBRL(valorParcela)} sem juros
                      </p>
                    )
                  )}
                </div>

                <Link
                  href={ctaHref}
                  className="block w-full rounded-lg bg-[var(--color-pmb-gold)] px-4 py-3.5 text-center text-[14px] font-black text-[var(--color-pmb-green)] transition-colors hover:bg-[var(--color-pmb-gold-600)]"
                >
                  {ctaLabel}
                </Link>
                {secondaryCtaHref && secondaryCtaLabel && (
                  <Link
                    href={secondaryCtaHref}
                    className="block w-full rounded-lg border border-[rgba(2,89,24,0.18)] px-4 py-3 text-center text-[13px] font-bold text-[var(--color-pmb-green)] hover:border-[var(--color-pmb-green)]"
                  >
                    {secondaryCtaLabel}
                  </Link>
                )}

                <ul className="space-y-2.5 border-t border-[rgba(2,89,24,0.08)] pt-4 text-[13px] text-[rgba(2,89,24,0.78)]">
                  <li className="flex items-center gap-2.5">
                    <PlayCircle className="h-4 w-4 text-[var(--color-pmb-gold-600)]" aria-hidden />
                    {course.qtdAulas} aulas em vídeo
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Clock className="h-4 w-4 text-[var(--color-pmb-gold-600)]" aria-hidden />
                    {cargaHoraria} de conteúdo
                  </li>
                  <li className="flex items-center gap-2.5">
                    <InfinityIcon className="h-4 w-4 text-[var(--color-pmb-gold-600)]" aria-hidden />
                    Acesso vitalício
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Smartphone className="h-4 w-4 text-[var(--color-pmb-gold-600)]" aria-hidden />
                    Estude em qualquer dispositivo
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Award className="h-4 w-4 text-[var(--color-pmb-gold-600)]" aria-hidden />
                    Certificado reconhecido
                  </li>
                  <li className="flex items-center gap-2.5">
                    <ShieldCheck className="h-4 w-4 text-[var(--color-pmb-gold-600)]" aria-hidden />
                    Garantia de 7 dias
                  </li>
                </ul>

                {inquirySlot}
              </div>
            </div>
          </aside>
        </div>
      </section>

      {/* Sticky CTA mobile — leigos não rolam até a sidebar; mostramos preço + CTA fixos no rodapé */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[rgba(2,89,24,0.12)] bg-white shadow-[0_-8px_30px_-12px_rgba(2,89,24,0.25)] lg:hidden">
        <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            {desconto && (
              <span className="inline-block rounded-full bg-[var(--color-pmb-gold)]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-pmb-gold-600)]">
                {desconto}% OFF
              </span>
            )}
            <p className="truncate text-[18px] font-black leading-tight text-[var(--color-pmb-green)]">
              {formatBRL(course.price)}
              {isMonthly && (
                <span className="ml-1 text-[12px] font-bold text-[rgba(2,89,24,0.6)]">
                  /mês
                </span>
              )}
            </p>
            {isMonthly && monthlyMonths ? (
              <p className="truncate text-[11px] text-[rgba(2,89,24,0.65)]">
                {monthlyMonths} mensalidades
              </p>
            ) : (
              course.price > 0 &&
              parcelas > 1 && (
                <p className="truncate text-[11px] text-[rgba(2,89,24,0.65)]">
                  ou {parcelas}x de {formatBRL(valorParcela)}
                </p>
              )
            )}
          </div>
          <Link
            href={ctaHref}
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-[var(--color-pmb-gold)] px-5 py-3 text-[14px] font-black text-[var(--color-pmb-green)] transition-colors hover:bg-[var(--color-pmb-gold-600)]"
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </div>
  )
}
