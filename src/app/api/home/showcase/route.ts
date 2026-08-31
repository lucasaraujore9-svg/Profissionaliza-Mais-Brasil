import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { COURSE_HAS_PRICE, COURSE_PROVISIONABLE } from "@/lib/catalog/visibility"

export const GET = withRequestContext(
  { action: "home.showcase", route: "/api/home/showcase" },
  async (_request: Request) => {
  const courses = await prisma.course.findMany({
    // hiddenMain:false estava faltando (ocultos vazavam) + regra de preco>0.
    where: { destaqueHome: true, status: "ATIVO", hiddenMain: false, AND: [COURSE_HAS_PRICE, COURSE_PROVISIONABLE] },
    orderBy: [{ ordemHome: "asc" }, { nome: "asc" }],
    select: {
      id: true,
      nome: true,
      slug: true,
      qtdAulas: true,
      cargaHoraria: true,
      precoVitrineMain: true,
      precoOriginal: true,
      precoPromocional: true,
      descricaoOverride: true,
      descricao: true,
      capaOverride: true,
      capaImageUrl: true,
      categoriaLoja: true,
    },
  })

  return NextResponse.json({
    data: courses.map((c) => ({
      id: c.id,
      nome: c.nome,
      slug: c.slug,
      qtdAulas: c.qtdAulas,
      cargaHoraria: c.cargaHoraria,
      preco: c.precoVitrineMain ? Number(c.precoVitrineMain) : c.precoPromocional ? Number(c.precoPromocional) : c.precoOriginal ? Number(c.precoOriginal) : null,
      descricao: c.descricaoOverride ?? c.descricao,
      capa: c.capaOverride ?? c.capaImageUrl,
      categoria: c.categoriaLoja,
    })),
  })
  },
)
