import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { syncStudentProfileToEA } from "@/lib/students/ea-actions"

const patchSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  fone: z.string().trim().max(40).optional().or(z.literal("")),
  cidade: z.string().trim().max(80).optional().or(z.literal("")),
  estado: z.string().trim().max(40).optional().or(z.literal("")),
  cep: z.string().trim().max(20).optional().or(z.literal("")),
  rua: z.string().trim().max(200).optional().or(z.literal("")),
  numero: z.string().trim().max(20).optional().or(z.literal("")),
  bairro: z.string().trim().max(80).optional().or(z.literal("")),
})

function nullable(value: string | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function PATCH(request: Request) {
  const session = await requireStudentSession()
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  await prisma.student.update({
    where: { id: session.studentId },
    data: {
      nome: parsed.data.nome,
      fone: nullable(parsed.data.fone),
      cidade: nullable(parsed.data.cidade),
      estado: nullable(parsed.data.estado),
      cep: nullable(parsed.data.cep),
      rua: nullable(parsed.data.rua),
      numero: nullable(parsed.data.numero),
      bairro: nullable(parsed.data.bairro),
    },
  })

  // Propaga para a plataforma de aulas. Falha silenciosa: se a EA estiver
  // indisponivel, o salvamento local ja aconteceu — proxima edicao tenta
  // sincronizar de novo.
  let eaSynced = true
  let eaError: string | null = null
  try {
    await syncStudentProfileToEA(session.studentId)
  } catch (err) {
    eaSynced = false
    eaError = err instanceof Error ? err.message : "Erro ao sincronizar"
    console.warn("[aluno/perfil] sync EA falhou:", err)
  }

  return NextResponse.json({ data: { ok: true, eaSynced, eaError } })
}
