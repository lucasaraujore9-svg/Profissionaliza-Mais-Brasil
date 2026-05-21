import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { blockStudentInEA } from "@/lib/students/plataforma-actions"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const { id } = await params
  const student = await prisma.student.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true },
  })

  if (!student) {
    return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
  }

  try {
    await blockStudentInEA(student.id)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro na plataforma de aulas"
    return NextResponse.json(
      { error: `Falha ao bloquear acesso do aluno: ${message}` },
      { status: 502 },
    )
  }

  const updated = await prisma.student.findUnique({
    where: { id: student.id },
    select: { id: true, status: true, apostila: true },
  })

  return NextResponse.json({ data: updated })
}
