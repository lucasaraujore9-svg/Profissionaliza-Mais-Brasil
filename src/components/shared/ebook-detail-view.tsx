import Image from "next/image"
import Link from "next/link"
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Download,
  FileText,
  HelpCircle,
  ListChecks,
  Monitor,
  ShieldCheck,
  Smartphone,
  Zap,
} from "lucide-react"
import { resolveAprendizado } from "@/lib/courses/aprendizado"
import { AutoriaNote } from "@/components/shared/autoria-note"
import {
  OfferPanel,
  OfferStickyBar,
  type OfferData,
} from "@/components/shared/offer-panel"

/**
 * A PAGINA DE VENDA DE UM E-BOOK.
 *
 * Irma de `CourseDetailView`, e componente separado — nao um `if` dentro dele.
 * Aquela pagina promete, em oito lugares diferentes, coisas que um e-book nao
 * tem: "N aulas em video", "carga horaria", "certificado reconhecido
 * nacionalmente", "assistir pelo celular", "conclua todas as aulas". Um
 * discriminador espalhado por ela viraria um componente que ninguem mais
 * consegue ler — e a primeira promessa que alguem esquecesse de gatear seria
 * vendida.
 *
 * O DINHEIRO e compartilhado (`offer-panel`): o "De R$", o "Nx sem juros" e o
 * carne no boleto sao a mesma conta nos dois, e duas copias divergiriam
 * justamente na tela em que a pessoa decide pagar.
 *
 * NAO renderiza a `RegulamentacaoNote`: aquele texto declara que o produto e um
 * CURSO LIVRE regulamentado pela Lei nº 9.394/96. Um e-book nao e — imprimir
 * aquilo aqui seria uma afirmacao legal falsa.
 */

export interface EbookDetailData {
  slug: string
  nome: string
  categoria: string
  descricao: string | null
  imageUrl: string | null
  price: number
  originalPrice: number | null
  parcelas: number | null
  boletoParcelas?: { n: number; valor: number } | null
  /** Paginas informadas pelo autor. null/0 => a linha some. */
  paginas?: number | null
  /** Tempo estimado de leitura ("2 horas"), quando o autor informou. */
  tempoLeitura?: string | null
  /** O autor liberou o download do arquivo? */
  baixavel?: boolean
  /**
   * Sumario do e-book — reusa `Course.matrizCurricular`, que e o campo de lista
   * de topicos que o LMS ja sincroniza. Vazio => a secao nao renderiza.
   */
  sumario?: string[]
  /** "O que voce vai aprender", ja resolvido pela hierarquia revenda > PMB. */
  aprendizado?: string[]
  /** Unidade que PRODUZIU o e-book. null = catalogo da PMB. */
  authorName?: string | null
}

interface EbookDetailViewProps {
  ebook: EbookDetailData
  ctaHref: string
  ctaLabel?: string
  backHref: string
  backLabel?: string
  secondaryCtaHref?: string
  secondaryCtaLabel?: string
  inquirySlot?: React.ReactNode
}

const PARA_QUEM = [
  "Quem prefere estudar lendo, no próprio ritmo",
  "Quem quer um material de consulta para usar no dia a dia",
  "Quem já atua na área e quer uma referência rápida à mão",
  "Quem tem pouco tempo e estuda em blocos curtos",
]

function splitParagraphs(text: string | null): string[] {
  if (!text) return []
  return text
    .split(/\r?\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
}

function faqPara(baixavel: boolean) {
  return [
    {
      q: "Como recebo o e-book depois de comprar?",
      a: "Assim que o pagamento é confirmado, o e-book aparece na sua área do aluno. É só entrar e clicar em Ler — não precisa esperar entrega nem receber nada pelos Correios.",
    },
    {
      q: "Posso ler pelo celular?",
      a: "Sim. O e-book abre direto no navegador do celular, do tablet ou do computador, sem instalar nada.",
    },
    baixavel
      ? {
          q: "Consigo baixar o arquivo?",
          a: "Sim. Além de ler pela plataforma, você pode baixar o arquivo em PDF e guardar no seu aparelho para ler sem internet.",
        }
      : {
          q: "Consigo baixar o arquivo?",
          a: "Este e-book é para leitura dentro da plataforma: ele abre no navegador, mas não fica disponível para download. Você pode acessá-lo quantas vezes quiser.",
        },
    {
      q: "O e-book dá certificado?",
      a: "Não. Certificado é emitido para os cursos, que têm aulas, carga horária e conclusão registrada. Este produto é um material de leitura.",
    },
    {
      q: "Por quanto tempo tenho acesso?",
      a: "Seu acesso não expira: o e-book fica na sua área do aluno para você reler quando quiser.",
    },
    {
      q: "E se eu não gostar?",
      a: "Você tem 7 dias para pedir o reembolso integral, sem burocracia — é o seu direito de arrependimento em compras pela internet.",
    },
  ]
}

export function EbookDetailView({
  ebook,
  ctaHref,
  ctaLabel = "Quero este e-book",
  backHref,
  backLabel = "Voltar para o catálogo",
  secondaryCtaHref,
  secondaryCtaLabel,
  inquirySlot,
}: EbookDetailViewProps) {
  const paragrafos = splitParagraphs(ebook.descricao)
  const baixavel = ebook.baixavel !== false
  const paginas = ebook.paginas && ebook.paginas > 0 ? ebook.paginas : null
  const faq = faqPara(baixavel)

  const offer: OfferData = {
    price: ebook.price,
    originalPrice: ebook.originalPrice,
    parcelas: ebook.parcelas,
    paymentType: "ONE_TIME",
    boletoParcelas: ebook.boletoParcelas,
  }

  return (
    <div className="bg-[var(--color-pmb-mist)] pb-24 lg:pb-0">
      {/* HERO ---------------------------------------------------- */}
      <section className="relative overflow-hidden bg-[var(--color-pmb-green)] text-white">
        {ebook.imageUrl ? (
          <>
            <Image
              src={ebook.imageUrl}
              alt={ebook.nome}
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
              {/* Dois selos, e não um: a categoria diz o assunto, o tipo diz o
                  formato. Quem chega de uma prateleira mista precisa saber, antes
                  de ler o preço, que isto não é um curso. */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-white">
                  <BookOpen className="h-3.5 w-3.5" aria-hidden />
                  E-book
                </span>
                <span className="inline-block rounded-full bg-[var(--color-pmb-lime)] px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[var(--color-pmb-green)]">
                  {ebook.categoria}
                </span>
              </div>

              <h1 className="mt-4 text-[32px] font-black leading-[1.05] tracking-tight md:text-[44px] lg:text-[52px]">
                {ebook.nome}
              </h1>
              {paragrafos[0] && (
                <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/85 md:text-[16px]">
                  {paragrafos[0]}
                </p>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-[13.5px] text-white/85">
                <span className="flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-[var(--color-pmb-gold)]" aria-hidden />
                  {paginas ? `${paginas} páginas` : "Material em PDF"}
                </span>
                {ebook.tempoLeitura ? (
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4 text-[var(--color-pmb-gold)]" aria-hidden />
                    {ebook.tempoLeitura} de leitura
                  </span>
                ) : null}
                <span className="flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-[var(--color-pmb-gold)]" aria-hidden />
                  Acesso imediato
                </span>
                <span className="flex items-center gap-1.5">
                  <Smartphone className="h-4 w-4 text-[var(--color-pmb-gold)]" aria-hidden />
                  Celular, tablet ou computador
                </span>
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-[var(--color-pmb-gold)]" aria-hidden />
                  7 dias de garantia
                </span>
              </div>
            </div>

            {ebook.imageUrl && (
              /* Retrato, e não 4:3: a capa de um livro é vertical, e é assim que
                 a pessoa reconhece o formato antes de ler qualquer palavra. */
              <div className="relative mx-auto hidden w-full max-w-[280px] overflow-hidden rounded-2xl border border-white/15 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.5)] lg:block lg:aspect-[3/4]">
                <Image
                  src={ebook.imageUrl}
                  alt={ebook.nome}
                  fill
                  priority
                  sizes="(min-width: 1024px) 280px, 100vw"
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
          <div className="space-y-12">
            <div>
              <h2 className="text-[22px] font-black text-[var(--color-pmb-green)] md:text-[26px]">
                Sobre este e-book
              </h2>
              <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-[rgba(2,89,24,0.82)]">
                {paragrafos.length > 0 ? (
                  paragrafos.map((p, i) => <p key={i}>{p}</p>)
                ) : (
                  <p>
                    Material digital para leitura, com conteúdo prático e
                    linguagem direta. Acesso liberado assim que o pagamento é
                    confirmado.
                  </p>
                )}
              </div>
            </div>

            <div>
              <h2 className="text-[22px] font-black text-[var(--color-pmb-green)] md:text-[26px]">
                O que você vai aprender
              </h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {resolveAprendizado(ebook.aprendizado).map((item, idx) => (
                  <li
                    key={`${idx}-${item}`}
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

            {/* Sumário — a mesma lista que num curso é a matriz curricular. Aqui
                ela é o índice do livro, e é o que responde "o que tem dentro". */}
            {ebook.sumario && ebook.sumario.length > 0 && (
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-[22px] font-black text-[var(--color-pmb-green)] md:text-[26px]">
                    O que tem dentro
                  </h2>
                  <span className="rounded-full bg-[var(--color-pmb-mist)] px-3 py-1 text-[12px] font-bold text-[var(--color-pmb-green)]">
                    {ebook.sumario.length}{" "}
                    {ebook.sumario.length === 1 ? "tópico" : "tópicos"}
                  </span>
                </div>
                <ul className="mt-4 grid gap-x-8 gap-y-2.5 rounded-2xl border border-[rgba(2,89,24,0.08)] bg-white p-5 sm:grid-cols-2">
                  {ebook.sumario.map((topico, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2.5 text-[14px] leading-snug text-[rgba(2,89,24,0.85)]"
                    >
                      <ListChecks
                        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-pmb-gold-600)]"
                        aria-hidden
                      />
                      <span>{topico}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* O que você recebe — o bloco que no curso é o do certificado.
                Aqui ele existe para dizer, sem rodeio, o que o produto É e o que
                ele NÃO É: quem compra numa vitrine cheia de curso chega supondo
                aulas e certificado, e descobrir isso depois de pagar é o motivo
                nº 1 de pedido de reembolso em produto digital. */}
            <div className="overflow-hidden rounded-2xl border border-[rgba(2,89,24,0.1)] bg-gradient-to-br from-[var(--color-pmb-green)] to-[var(--color-pmb-green-900)] p-6 text-white md:p-8">
              <div className="flex items-start gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/20">
                  <BookOpen className="h-6 w-6 text-[var(--color-pmb-gold)]" aria-hidden />
                </span>
                <div>
                  <h3 className="text-[18px] font-black md:text-[22px]">
                    O que você recebe
                  </h3>
                  <ul className="mt-3 space-y-2 text-[14px] leading-relaxed text-white/85">
                    <li className="flex items-start gap-2.5">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-pmb-gold)]" aria-hidden />
                      <span>
                        O e-book completo{paginas ? `, com ${paginas} páginas` : ""}, liberado
                        na sua área do aluno assim que o pagamento é confirmado.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-pmb-gold)]" aria-hidden />
                      <span>
                        Leitura direto no navegador — celular, tablet ou
                        computador, sem instalar nada.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Download className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-pmb-gold)]" aria-hidden />
                      <span>
                        {baixavel
                          ? "Download do arquivo em PDF, para ler também sem internet."
                          : "Leitura pela plataforma, quantas vezes quiser. Este material não fica disponível para download."}
                      </span>
                    </li>
                  </ul>
                  <p className="mt-3 border-t border-white/15 pt-3 text-[13px] text-white/70">
                    Este é um material de leitura: não inclui aulas em vídeo, prova
                    nem certificado. Certificado é emitido para os cursos.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-[22px] font-black text-[var(--color-pmb-green)] md:text-[26px]">
                Para quem é este e-book
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

            <div>
              <h2 className="text-[22px] font-black text-[var(--color-pmb-green)] md:text-[26px]">
                Perguntas frequentes
              </h2>
              <div className="mt-4 divide-y divide-[rgba(2,89,24,0.08)] overflow-hidden rounded-2xl border border-[rgba(2,89,24,0.08)] bg-white">
                {faq.map((item) => (
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

            {/* Responsabilidade pelo conteúdo — só em e-book de autoria de
                unidade. A `RegulamentacaoNote` NÃO entra: ela declara curso livre
                regulamentado, e um e-book não é. */}
            <AutoriaNote authorName={ebook.authorName} kind="ebook" />
          </div>

          <OfferPanel
            offer={offer}
            imageUrl={ebook.imageUrl}
            imageAlt={ebook.nome}
            ctaHref={ctaHref}
            ctaLabel={ctaLabel}
            secondaryCtaHref={secondaryCtaHref}
            secondaryCtaLabel={secondaryCtaLabel}
            extraSlot={inquirySlot}
            features={
              <>
                <li className="flex items-center gap-2.5">
                  <FileText className="h-4 w-4 text-[var(--color-pmb-gold-600)]" aria-hidden />
                  {paginas ? `E-book de ${paginas} páginas` : "E-book em PDF"}
                </li>
                <li className="flex items-center gap-2.5">
                  <Zap className="h-4 w-4 text-[var(--color-pmb-gold-600)]" aria-hidden />
                  Acesso imediato após o pagamento
                </li>
                <li className="flex items-center gap-2.5">
                  <Smartphone className="h-4 w-4 text-[var(--color-pmb-gold-600)]" aria-hidden />
                  Leia no celular ou no computador
                </li>
                {baixavel ? (
                  <li className="flex items-center gap-2.5">
                    <Download className="h-4 w-4 text-[var(--color-pmb-gold-600)]" aria-hidden />
                    Baixe o PDF e leia sem internet
                  </li>
                ) : (
                  <li className="flex items-center gap-2.5">
                    <Monitor className="h-4 w-4 text-[var(--color-pmb-gold-600)]" aria-hidden />
                    Leitura pela plataforma
                  </li>
                )}
                <li className="flex items-center gap-2.5">
                  <BookOpen className="h-4 w-4 text-[var(--color-pmb-gold-600)]" aria-hidden />
                  Acesso que não expira
                </li>
                <li className="flex items-center gap-2.5">
                  <ShieldCheck className="h-4 w-4 text-[var(--color-pmb-gold-600)]" aria-hidden />
                  Garantia de 7 dias
                </li>
              </>
            }
          />
        </div>
      </section>

      <OfferStickyBar offer={offer} ctaHref={ctaHref} ctaLabel={ctaLabel} />
    </div>
  )
}
