import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import {
  CourseDetailView,
  type CourseDetailData,
} from "@/components/shared/course-detail-view"
import {
  EbookDetailView,
  type EbookDetailData,
} from "@/components/shared/ebook-detail-view"
import { isEbook } from "@/lib/catalog/content-type"
import { LeadInquiryCard } from "@/components/loja/lead-inquiry-card"
import { JsonLd } from "@/components/seo/json-ld"
import { courseJsonLd, breadcrumbJsonLd } from "@/lib/seo/jsonld"
import { SITE_NAME, siteUrl } from "@/lib/seo/site"
import { getSystemSettings } from "@/lib/system-settings"
import { displayInterestFreeInstallments } from "@/lib/mercadopago/installments"
import {
  perInstallment,
  pmbMaxBoletoInstallments,
} from "@/lib/installments/pmb-rules"

type LoadedCurso = CourseDetailData & {
  id: string
  /** Tem preço configurado na vitrine principal. */
  hasPrice: boolean
  /** COURSE | EBOOK — decide QUAL página de venda é renderizada. */
  contentType: "COURSE" | "EBOOK"
  ebookPages: number | null
  ebookDownloadable: boolean
}

async function loadCurso(slug: string): Promise<LoadedCurso | null> {
  try {
    const c = await prisma.course.findUnique({
      where: { slug },
      include: {
        courseLessons: { orderBy: { ordem: "asc" } },
        authorTenant: { select: { name: true } },
      },
    })
    if (!c || c.status === "INATIVO" || c.hiddenMain) return null

    const price =
      Number(c.precoVitrineMain ?? 0) ||
      Number(c.precoPromocional ?? 0) ||
      Number(c.precoOriginal ?? 0)

    // Regra de negocio: curso sem valor nao pode ser exibido — 404 inclusive no
    // detalhe (mesmo por link direto). Antes exibia a pagina com CTA "/contato".
    if (price <= 0) return null

    // "De R$ X" riscado: SO o preco de tabela curado em /admin/catalogo. Nao
    // cai mais em `precoOriginal` — aquele e o preco-base do feed, reescrito
    // pelo sync diario, e por isso nunca foi editavel. Vazio => sem "De".
    const originalPrice =
      c.precoDeVitrineMain && Number(c.precoDeVitrineMain) > price
        ? Number(c.precoDeVitrineMain)
        : null

    // Pagamento único: "Nx sem juros" vem do nº GLOBAL da PMB (não por curso).
    const settings = await getSystemSettings()

    // Parcelamento no boleto (carnê, só no gateway Asaas): "em até Nx de R$X".
    // Regra: parcela mínima R$50, máx 6 boletos — mesma dos seletores/rotas.
    const isMonthlyCourse = c.paymentTypeMain === "MONTHLY"
    const maxBoleto =
      settings.pmbDirectSaleGateway === "ASAAS" && !isMonthlyCourse
        ? pmbMaxBoletoInstallments(price)
        : 1
    const boletoParcelas =
      maxBoleto > 1 ? { n: maxBoleto, valor: perInstallment(price, maxBoleto) } : null

    return {
      id: c.id,
      slug: c.slug,
      nome: c.nome,
      categoria:
        c.categoriaLoja ?? (c.contentType === "EBOOK" ? "E-book" : "Curso profissionalizante"),
      // Hierarquia para a vitrine principal: admin > plataforma bruto
      descricao: c.descricaoOverride ?? c.descricao,
      qtdAulas: c.qtdAulas,
      cargaHoraria: c.cargaHoraria,
      imageUrl: c.capaOverride ?? c.capaImageUrl,
      price,
      originalPrice,
      parcelas: displayInterestFreeInstallments(
        settings.pmbInterestFreeInstallments,
      ),
      boletoParcelas,
      lessons: c.courseLessons.map((l) => ({
        id: l.id,
        nome: l.nome,
        ordem: l.ordem,
      })),
      matriz: c.matrizCurricular,
      // Vitrine mãe: só o padrão global (não há camada de revenda aqui).
      aprendizado: c.aprendizado,
      // Curso produzido por uma unidade também pode ser vendido AQUI (o autor
      // escolhe `distribution: OWN_AND_PMB`). A nota de responsabilidade tem
      // que aparecer na vitrine da PMB pelo mesmo motivo que na da revenda —
      // aqui até mais, porque o comprador está na marca da plataforma.
      authorName: c.authorTenant?.name ?? null,
      hasPrice: price > 0,
      contentType: c.contentType,
      ebookPages: c.ebookPages,
      ebookDownloadable: c.ebookDownloadable,
    }
  } catch {
    return null
  }
}

/**
 * `LoadedCurso` -> a forma que a página do e-book consome.
 *
 * A carga vem de UMA consulta só (os dois tipos moram na mesma tabela e a
 * `loadCurso` já resolve preço, override e autoria); o que muda aqui é o
 * recorte. `matriz` vira `sumario`: é a mesma lista de tópicos que o LMS
 * sincroniza — num curso ela é a matriz curricular, num e-book é o índice.
 */
function ebookData(c: LoadedCurso): EbookDetailData {
  return {
    slug: c.slug,
    nome: c.nome,
    categoria: c.categoria,
    descricao: c.descricao,
    imageUrl: c.imageUrl,
    price: c.price,
    originalPrice: c.originalPrice,
    parcelas: c.parcelas,
    boletoParcelas: c.boletoParcelas,
    paginas: c.ebookPages,
    // A mesma coluna que num curso é a carga horária; na autoria do e-book ela é
    // rotulada como tempo estimado de leitura.
    tempoLeitura: c.cargaHoraria,
    baixavel: c.ebookDownloadable,
    sumario: c.matriz,
    aprendizado: c.aprendizado,
    authorName: c.authorName,
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const curso = await loadCurso(slug)
  if (!curso) {
    return { title: "Conteúdo não encontrado" }
  }
  const title = `${curso.nome} — Profissionaliza Mais Brasil`
  // O fallback de descrição vira a meta description do Google quando o conteúdo
  // não tem uma. Prometer certificado num e-book seria anunciar o que ele não dá
  // — e o clique chegaria na página que diz o contrário.
  const description =
    (curso.descricao ?? "").slice(0, 160) ||
    (isEbook(curso)
      ? `E-book ${curso.nome}. Acesso imediato após a compra, para ler no celular ou no computador.`
      : `Curso ${curso.nome} com certificado válido em todo o Brasil. Matricule-se agora.`)
  const imageUrl = curso.imageUrl ?? null
  return {
    title,
    description,
    alternates: { canonical: `/cursos/${curso.slug}` },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${siteUrl()}/cursos/${curso.slug}`,
      images: imageUrl ? [{ url: imageUrl }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  }
}

export default async function CursoDetalhePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const curso = await loadCurso(slug)
  if (!curso) notFound()

  const settings = await prisma.systemSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
    select: { pmbAutomationEnabled: true },
  })

  // CTA sempre tenta checkout quando há preço. O backend define o gateway
  // ativo (Asaas ou MP via pmbDirectSaleGateway) e a página /checkout trata
  // os casos de borda (curso MONTHLY → "atendimento personalizado", gateway
  // sem credenciais → erro 503).
  const ctaHref = curso.hasPrice
    ? `/checkout?course_id=${curso.id}`
    : `/contato?curso=${encodeURIComponent(curso.slug)}`
  const ctaLabel = curso.hasPrice
    ? isEbook(curso)
      ? "Quero este e-book"
      : "Quero me matricular"
    : "Falar com a equipe"

  const inquirySlot = settings.pmbAutomationEnabled ? (
    <LeadInquiryCard
      courseSlug={curso.slug}
      courseName={curso.nome}
      escolaName="Profissionaliza Mais Brasil"
      endpoint="/api/pmb/leads"
    />
  ) : null

  const base = siteUrl()
  const courseUrl = `${base}/cursos/${curso.slug}`

  return (
    <>
      <JsonLd
        data={[
          courseJsonLd({
            name: curso.nome,
            url: courseUrl,
            description: curso.descricao,
            image: curso.imageUrl,
            providerName: SITE_NAME,
            providerUrl: base,
            price: curso.hasPrice ? curso.price : null,
            hours: curso.cargaHoraria,
          }),
          breadcrumbJsonLd([
            { name: "Início", url: base },
            { name: "Cursos", url: `${base}/cursos` },
            { name: curso.nome, url: courseUrl },
          ]),
        ]}
      />
      {isEbook(curso) ? (
        <EbookDetailView
          ebook={ebookData(curso)}
          ctaHref={ctaHref}
          ctaLabel={ctaLabel}
          backHref="/cursos"
          backLabel="Voltar para o catálogo"
          secondaryCtaHref="/ajuda"
          secondaryCtaLabel="Tirar dúvidas"
          inquirySlot={inquirySlot}
        />
      ) : (
        <CourseDetailView
          course={curso}
          ctaHref={ctaHref}
          ctaLabel={ctaLabel}
          backHref="/cursos"
          backLabel="Voltar para o catálogo"
          secondaryCtaHref="/ajuda"
          secondaryCtaLabel="Tirar dúvidas"
          inquirySlot={inquirySlot}
        />
      )}
    </>
  )
}

export const dynamic = "force-dynamic"
