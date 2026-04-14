import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { editarAluno } from "@/lib/escola-avancada/client"

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
    select: { id: true, eaAlunoId: true, status: true },
  })

  if (!student) {
    return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
  }

  try {
    await editarAluno({
      id_aluno: Number(student.eaAlunoId),
      status: "ativo",
      apostila: "liberar",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao contatar EA"
    return NextResponse.json(
      { error: `Falha ao desbloquear aluno na Escola Avançada: ${message}` },
      { status: 502 },
    )
  }

  const updated = await prisma.student.update({
    where: { id: student.id },
    data: { status: "ATIVO", apostila: "LIBERADA" },
    select: { id: true, status: true, apostila: true },
  })

  return NextResponse.json({ data: updated })
}
