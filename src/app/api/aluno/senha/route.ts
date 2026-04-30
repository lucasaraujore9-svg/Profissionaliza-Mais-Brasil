import { NextResponse } from "next/server"
import { z } from "zod"
import { compare, hash } from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"

const patchSchema = z.object({
  currentPassword: z.string().nullable().optional(),
  newPassword: z.string().min(8).max(200),
})

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
      { error: "Senha inválida", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const student = await prisma.student.findUnique({
    where: { id: session.studentId },
    select: { id: true, passwordHash: true },
  })
  if (!student) {
    return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
  }

  // Se ja tem senha, exige currentPassword correto
  if (student.passwordHash) {
    if (!parsed.data.currentPassword) {
      return NextResponse.json(
        { error: "Informe a senha atual" },
        { status: 400 },
      )
    }
    const ok = await compare(parsed.data.currentPassword, student.passwordHash)
    if (!ok) {
      return NextResponse.json(
        { error: "Senha atual incorreta" },
        { status: 401 },
      )
    }
  }

  const passwordHash = await hash(parsed.data.newPassword, 12)
  await prisma.student.update({
    where: { id: student.id },
    data: { passwordHash, passwordSetAt: new Date() },
  })

  return NextResponse.json({ data: { ok: true } })
}
