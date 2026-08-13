import { brDayStartUtc } from "@/lib/dates"
import { ageAtBrDay, nascimentoFieldOptional } from "@/lib/students/guardian"
import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { syncStudentProfileToEA } from "@/lib/students/plataforma-actions"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"

const patchSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email("Email inválido").max(160),
  fone: z.string().trim().max(40).optional().or(z.literal("")),
  cidade: z.string().trim().max(80).optional().or(z.literal("")),
  estado: z.string().trim().max(40).optional().or(z.literal("")),
  cep: z.string().trim().max(20).optional().or(z.literal("")),
  rua: z.string().trim().max(200).optional().or(z.literal("")),
  numero: z.string().trim().max(20).optional().or(z.literal("")),
  bairro: z.string().trim().max(80).optional().or(z.literal("")),
  /**
   * O aluno só pode PREENCHER a data de nascimento enquanto ela for nula —
   * nunca alterá-la. É campo de identidade do certificado, como o CPF (que já é
   * readOnly aqui). Quem corrige é a unidade. A trava está no handler, não no
   * schema: o servidor é a autoridade, não o `readOnly` da tela.
   */
  nascimento: nascimentoFieldOptional,
})
  // Sanidade da data (nao futura, nao absurda) pela MESMA regra do resto do
  // sistema. Sem isto o aluno gravaria "2999-12-31" — e o campo e imutavel para
  // ele depois da primeira gravacao, entao a data podre alimentaria
  // `guardianRequirement` e iria parar no certificado.
  .superRefine((data, ctx) => {
    if (!data.nascimento) return
    const d = new Date(`${data.nascimento}T00:00:00.000Z`)
    const hoje = brDayStartUtc()
    if (Number.isNaN(d.getTime()) || d.getTime() > hoje.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nascimento"],
        message: "Data de nascimento inválida",
      })
      return
    }
    if (ageAtBrDay(d) > 120) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nascimento"],
        message: "Data de nascimento inválida",
      })
    }
  })

function nullable(value: string | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export const PATCH = withRequestContext(
  { action: "aluno.perfil.update", route: "/api/aluno/perfil" },
  async (request: Request) => {
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

  // Troca de email: o email é o identificador de login e tem unique por
  // tenant (@@unique([tenantId, email])) — valida o conflito antes de salvar
  // para devolver uma mensagem clara em vez de P2002/500.
  const current = await prisma.student.findUnique({
    where: { id: session.studentId },
    select: { tenantId: true, email: true, nascimento: true },
  })
  if (!current) {
    return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
  }

  const emailChanged = parsed.data.email !== (current.email ?? "").toLowerCase()
  if (emailChanged) {
    const taken = await prisma.student.findFirst({
      where: {
        tenantId: current.tenantId,
        email: parsed.data.email,
        id: { not: session.studentId },
      },
      select: { id: true },
    })
    if (taken) {
      return NextResponse.json(
        {
          error: "Este email já está em uso por outro aluno desta loja.",
          code: "EMAIL_TAKEN",
        },
        { status: 409 },
      )
    }
  }

  try {
    await prisma.student.update({
      where: { id: session.studentId },
      data: {
        nome: parsed.data.nome,
        email: parsed.data.email,
        fone: nullable(parsed.data.fone),
        cidade: nullable(parsed.data.cidade),
        estado: nullable(parsed.data.estado),
        cep: nullable(parsed.data.cep),
        rua: nullable(parsed.data.rua),
        numero: nullable(parsed.data.numero),
        bairro: nullable(parsed.data.bairro),
        // Só grava se ainda não havia data. Aluno não corrige a própria data de
        // nascimento (identidade do certificado) — isso é da unidade.
        ...(!current.nascimento && parsed.data.nascimento
          ? { nascimento: new Date(`${parsed.data.nascimento}T00:00:00.000Z`) }
          : {}),
      },
    })
  } catch (err) {
    // Corrida entre o check acima e o update (outro aluno salvou o mesmo
    // email no meio) — devolve o mesmo 409 amigável.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error: "Este email já está em uso por outro aluno desta loja.",
          code: "EMAIL_TAKEN",
        },
        { status: 409 },
      )
    }
    throw err
  }

  // Propaga para a plataforma de aulas. Falha silenciosa: se a plataforma estiver
  // indisponivel, o salvamento local ja aconteceu — proxima edicao tenta
  // sincronizar de novo.
  let plataformaSynced = true
  let plataformaError: string | null = null
  try {
    await syncStudentProfileToEA(session.studentId)
  } catch (err) {
    plataformaSynced = false
    plataformaError = err instanceof Error ? err.message : "Erro ao sincronizar"
    contextLogger().warn(
      { err, event: "aluno.perfil.sync_plataforma_failed", studentId: session.studentId },
      "sync de perfil com a plataforma falhou",
    )
  }

  return NextResponse.json({ data: { ok: true, plataformaSynced, plataformaError } })
  },
)
