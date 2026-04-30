import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import {
  CourseDetailView,
  type CourseDetailData,
} from "@/components/shared/course-detail-view"

async function loadCurso(slug: string): Promise<CourseDetailData | null> {
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

  return (
    <CourseDetailView
      course={curso}
      ctaHref={`/contato?curso=${encodeURIComponent(curso.slug)}`}
      ctaLabel="Quero me matricular"
      backHref="/cursos"
      backLabel="Voltar para o catálogo"
      secondaryCtaHref="/ajuda"
      secondaryCtaLabel="Tirar dúvidas"
    />
  )
}

export const dynamic = "force-dynamic"
