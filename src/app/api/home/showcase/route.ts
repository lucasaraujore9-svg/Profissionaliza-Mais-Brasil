import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const courses = await prisma.course.findMany({
    where: { destaqueHome: true, status: "ATIVO" },
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
}
