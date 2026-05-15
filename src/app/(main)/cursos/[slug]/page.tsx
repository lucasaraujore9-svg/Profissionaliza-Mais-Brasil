import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import {
  CourseDetailView,
  type CourseDetailData,
} from "@/components/shared/course-detail-view"
import { getSystemSettings } from "@/lib/system-settings"
import { pmbMpAccessToken } from "@/lib/pmb-config"

type LoadedCurso = CourseDetailData & {
  id: string
  /** Curso pode ser vendido no checkout público (ONE_TIME + preço > 0). */
  isPublicSale: boolean
}

async function loadCurso(slug: string): Promise<LoadedCurso | null> {
  try {
    const c = await prisma.course.findUnique({
      where: { slug },
      include: {
        courseLessons: { orderBy: { ordem: "asc" } },
      },
    })
    if (!c || c.status === "INATIVO" || c.hiddenMain) return null

    const price =
      Number(c.precoVitrineMain ?? 0) ||
      Number(c.precoPromocional ?? 0) ||
      Number(c.precoOriginal ?? 0)

    const originalPrice =
      c.precoOriginal && Number(c.precoOriginal) > price
        ? Number(c.precoOriginal)
        : null

    return {
      id: c.id,
      slug: c.slug,
      nome: c.nome,
      categoria: c.categoriaLoja ?? "Curso profissionalizante",
      // Hierarquia para a vitrine principal: admin > EA bruto
      descricao: c.descricaoOverride ?? c.descricao,
      qtdAulas: c.qtdAulas,
      cargaHoraria: c.cargaHoraria,
      imageUrl: c.capaOverride ?? c.capaImageUrl,
      price,
      originalPrice,
      parcelas: c.parcelasOverride ?? c.parcelasSugeridas,
      lessons: c.courseLessons.map((l) => ({
        id: l.id,
        nome: l.nome,
        ordem: l.ordem,
      })),
      isPublicSale: c.paymentTypeMain === "ONE_TIME" && price > 0,
    }
  } catch {
    return null
  }
}

async function isGatewayReady(): Promise<boolean> {
  const settings = await getSystemSettings()
  if (settings.pmbDirectSaleGateway === "ASAAS") {
    return Boolean(process.env.ASAAS_API_URL && process.env.ASAAS_API_KEY)
  }
  // gateway === "MP"
  const token = await pmbMpAccessToken()
  return Boolean(token)
}

export default async function CursoDetalhePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const curso = await loadCurso(slug)
  if (!curso) notFound()

  // Checkout fica disponível quando o curso é vendível publicamente (ONE_TIME
  // + preço) e o gateway ativo (Asaas ou MP) está pronto. A página de checkout
  // é a mesma — só muda o backend (definido por pmbDirectSaleGateway).
  const canCheckout = curso.isPublicSale && (await isGatewayReady())
  const ctaHref = canCheckout
    ? `/checkout?course_id=${curso.id}`
    : `/contato?curso=${encodeURIComponent(curso.slug)}`
  const ctaLabel = canCheckout ? "Comprar agora" : "Quero me matricular"

  return (
    <CourseDetailView
      course={curso}
      ctaHref={ctaHref}
      ctaLabel={ctaLabel}
      backHref="/cursos"
      backLabel="Voltar para o catálogo"
      secondaryCtaHref="/ajuda"
      secondaryCtaLabel="Tirar dúvidas"
    />
  )
}

export const dynamic = "force-dynamic"
