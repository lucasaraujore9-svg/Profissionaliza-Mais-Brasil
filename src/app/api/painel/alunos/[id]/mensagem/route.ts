import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { enviarMensagem } from "@/lib/plataforma-cursos/client"

const messageSchema = z.object({
  mensagem: z.string().trim().min(1, "Mensagem vazia").max(2000),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const { id } = await params

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = messageSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Dados inválidos",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }

  const [student, tenant] = await Promise.all([
    prisma.student.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { plataformaAlunoId: true },
    }),
    prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { plataformaVendedorId: true },
    }),
  ])

  if (!student) {
    return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
  }

  try {
    await enviarMensagem({
      idaluno: Number(student.plataformaAlunoId),
      idfuncionario: tenant?.plataformaVendedorId ? Number(tenant.plataformaVendedorId) : undefined,
      mensagem: parsed.data.mensagem,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao contatar a plataforma"
    return NextResponse.json(
      { error: `Falha ao enviar mensagem: ${message}` },
      { status: 502 },
    )
  }

  return NextResponse.json({ data: { ok: true } })
}
