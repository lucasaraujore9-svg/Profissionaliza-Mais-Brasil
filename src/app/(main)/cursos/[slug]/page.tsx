import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import {
  CourseDetailView,
  type CourseDetailData,
} from "@/components/shared/course-detail-view"

type LoadedCurso = CourseDetailData & {
  id: string
  /** Tem preço configurado na vitrine principal. */
  hasPrice: boolean
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
      hasPrice: price > 0,
    }
  } catch {
    return null
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

  // CTA sempre tenta checkout quando há preço. O backend define o gateway
  // ativo (Asaas ou MP via pmbDirectSaleGateway) e a página /checkout trata
  // os casos de borda (curso MONTHLY → "atendimento personalizado", gateway
  // sem credenciais → erro 503).
  const ctaHref = curso.hasPrice
    ? `/checkout?course_id=${curso.id}`
    : `/contato?curso=${encodeURIComponent(curso.slug)}`
  const ctaLabel = curso.hasPrice ? "Quero me matricular" : "Falar com a equipe"

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
