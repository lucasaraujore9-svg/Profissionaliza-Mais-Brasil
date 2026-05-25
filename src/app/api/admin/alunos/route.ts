import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requirePmbSales } from "@/lib/auth/guards"
import { getOrCreatePmbTenant } from "@/lib/pmb-tenant"
import { pmbPlataformaPolo, pmbPlataformaVendedorId } from "@/lib/pmb-config"
import { ensureStudentOnPlatform } from "@/lib/students/plataforma-actions"
import { findOrCreateAsaasCustomer } from "@/lib/asaas/client"
import { getSystemSettings } from "@/lib/system-settings"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"

function isValidCpf(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "")
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
  let s = 0
  for (let i = 0; i < 9; i++) s += +d[i] * (10 - i)
  let r = (s * 10) % 11
  if (r >= 10) r = 0
  if (r !== +d[9]) return false
  s = 0
  for (let i = 0; i < 10; i++) s += +d[i] * (11 - i)
  r = (s * 10) % 11
  if (r >= 10) r = 0
  return r === +d[10]
}

export const GET = withRequestContext(
  { action: "admin.alunos.list", route: "/api/admin/alunos" },
  async (request: Request) => {
  const guard = await requirePmbSales()
  if (!guard.ok) return guard.response

  const pmbTenant = await getOrCreatePmbTenant()

  const url = new URL(request.url)
  const q = url.searchParams.get("q")?.trim() ?? ""

  const whereStudent =
    guard.session.role === "SUPER_ADMIN"
      ? { tenantId: pmbTenant.id }
      : {
          tenantId: pmbTenant.id,
          enrollments: {
            some: { tenantId: null, soldByUserId: guard.session.userId },
          },
        }

  const students = await prisma.student.findMany({
    where: {
      ...whereStudent,
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" as const } },
              { nome: { contains: q, mode: "insensitive" as const } },
              { cpf: { contains: q.replace(/\D/g, "") } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      nome: true,
      email: true,
      fone: true,
      cpf: true,
      status: true,
      plataformaAlunoId: true,
      createdAt: true,
    },
  })

  return NextResponse.json({
    data: students.map((s) => ({
      id: s.id,
      nome: s.nome,
      email: s.email,
      fone: s.fone,
      cpf: s.cpf,
      status: s.status,
      plataformaAlunoId: s.plataformaAlunoId,
      createdAt: s.createdAt.toISOString(),
    })),
  })
  },
)

const createSchema = z.object({
  nome: z.string().trim().min(3).max(160),
  email: z.string().email().toLowerCase().trim(),
  cpf: z.string().trim().min(11).max(14),
  fone: z.string().trim().optional(),
})

export const POST = withRequestContext(
  { action: "admin.alunos.create", route: "/api/admin/alunos" },
  async (request: Request) => {
  const guard = await requirePmbSales()
  if (!guard.ok) return guard.response

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = createSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const cpf = parsed.data.cpf.replace(/\D/g, "")
  if (!isValidCpf(cpf)) {
    return NextResponse.json({ error: "CPF inválido" }, { status: 400 })
  }

  const pmbTenant = await getOrCreatePmbTenant()

  const existing = await prisma.student.findFirst({
    where: {
      tenantId: pmbTenant.id,
      OR: [{ email: parsed.data.email }, { cpf }],
    },
    select: { id: true, nome: true, email: true, cpf: true },
  })
  if (existing) {
    return NextResponse.json({
      data: { id: existing.id, nome: existing.nome, email: existing.email, cpf: existing.cpf, existed: true },
    })
  }

  let student: { id: string; nome: string; email: string | null; cpf: string | null }
  try {
    student = await prisma.student.create({
      data: {
        tenantId: pmbTenant.id,
        nome: parsed.data.nome,
        email: parsed.data.email,
        cpf,
        fone: parsed.data.fone,
        polo: pmbPlataformaPolo(),
        vendedorId: pmbPlataformaVendedorId(),
        plataformaAlunoId: `pending_${Date.now()}`,
        status: "ATIVO",
      },
      select: { id: true, nome: true, email: true, cpf: true },
    })
  } catch (err) {
    // P2002 = unique violation. Race entre o findFirst acima e o create:
    // outra request criou o student com mesmo email/cpf no intervalo.
    // Retorna o existente como se fosse o caminho normal de duplicate.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existed = await prisma.student.findFirst({
        where: {
          tenantId: pmbTenant.id,
          OR: [{ email: parsed.data.email }, { cpf }],
        },
        select: { id: true, nome: true, email: true, cpf: true },
      })
      if (existed) {
        return NextResponse.json({
          data: { ...existed, existed: true },
        })
      }
    }
    throw err
  }

  // Cria o aluno na plataforma imediatamente (não espera pelo pagamento)
  try {
    await ensureStudentOnPlatform(student.id)
  } catch (err) {
    contextLogger().error(
      { err, event: "admin.alunos.create.plataforma_failed", studentId: student.id },
      "falha ao criar aluno na plataforma — será tentado novamente no fulfill",
    )
    // Não bloqueia — será tentado novamente no fulfill do pagamento
  }

  // Se gateway for Asaas, cria o customer já (sem CPF obrigatório no Asaas só precisa de nome)
  try {
    const settings = await getSystemSettings()
    if (settings.pmbDirectSaleGateway === "ASAAS" && process.env.ASAAS_API_KEY) {
      const { customer } = await findOrCreateAsaasCustomer({
        name: parsed.data.nome,
        email: parsed.data.email,
        cpfCnpj: cpf,
        mobilePhone: parsed.data.fone,
        externalReference: `pmb_student_${student.id}`,
      })
      await prisma.student.update({
        where: { id: student.id },
        data: { asaasCustomerId: customer.id },
      })
    }
  } catch (err) {
    contextLogger().error(
      { err, event: "admin.alunos.create.asaas_customer_failed", studentId: student.id },
      "falha ao criar customer no Asaas — será criado/reutilizado na geração do link",
    )
    // Não bloqueia — será criado/reutilizado na geração do link
  }

  return NextResponse.json({
    data: { id: student.id, nome: student.nome, email: student.email, cpf: student.cpf, existed: false },
  })
  },
)
