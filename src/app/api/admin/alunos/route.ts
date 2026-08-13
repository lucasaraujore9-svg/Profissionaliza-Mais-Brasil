import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getOrCreatePmbTenant } from "@/lib/pmb-tenant"
import { pmbPlataformaPolo, pmbPlataformaVendedorId } from "@/lib/pmb-config"
import { ensureStudentOnPlatform } from "@/lib/students/plataforma-actions"
import { findOrCreateAsaasCustomer } from "@/lib/asaas/client"
import { getSystemSettings } from "@/lib/system-settings"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { isValidCpf, stripCpf } from "@/lib/validation/cpf"
import {
  deriveStudentDisplayStatus,
  countEnrollmentStatuses,
} from "@/lib/students/display-status"
import { requireAdmin } from "@/lib/auth/admin-guard"
import {
  buildGuardianWrite,
  guardianData,
  guardianRequirement,
  guardianShape,
  hasGuardian,
  nascimentoField,
  withGuardianRule,
} from "@/lib/students/guardian"

export const GET = withRequestContext(
  { action: "admin.alunos.list", route: "/api/admin/alunos" },
  async (request: Request) => {
  const guard = await requireAdmin("alunos.view")
  if (!guard.ok) return guard.response

  const pmbTenant = await getOrCreatePmbTenant()

  const url = new URL(request.url)
  const q = url.searchParams.get("q")?.trim() ?? ""

  const whereStudent =
    guard.ctx.can("alunos.viewAll")
      ? { tenantId: pmbTenant.id }
      : {
          tenantId: pmbTenant.id,
          enrollments: {
            some: { tenantId: null, soldByUserId: guard.ctx.userId },
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
      // A tela de venda precisa saber se falta responsavel ANTES do submit —
      // a maior parte das vendas usa a busca, nao o cadastro novo.
      nascimento: true,
      responsavel: true,
      cpfResponsavel: true,
      enrollments: { select: { status: true } },
    },
  })

  return NextResponse.json({
    data: students.map((s) => ({
      id: s.id,
      nome: s.nome,
      email: s.email,
      fone: s.fone,
      cpf: s.cpf,
      status: deriveStudentDisplayStatus(s.status, countEnrollmentStatuses(s.enrollments)),
      plataformaAlunoId: s.plataformaAlunoId,
      createdAt: s.createdAt.toISOString(),
      nascimento: s.nascimento ? s.nascimento.toISOString().slice(0, 10) : null,
      responsavel: s.responsavel,
      // Sinal pronto para a UI: aluno menor cuja ficha ainda nao tem
      // responsavel financeiro. A venda dele sera recusada no submit.
      guardianMissing:
        guardianRequirement(s.nascimento) === "REQUIRED" && !hasGuardian(s),
    })),
  })
  },
)

/**
 * Criacao de aluno no /admin. `nascimento` e obrigatorio: sem ela nao ha como
 * saber se o aluno e menor, e foi exatamente essa lacuna que fez os vendedores
 * cadastrarem a mae como se fosse a aluna. `withGuardianRule` exige o bloco do
 * responsavel quando a data indicar menor de 18.
 */
const createSchema = withGuardianRule(
  z.object({
    nome: z.string().trim().min(3).max(160),
    email: z.string().email().toLowerCase().trim(),
    cpf: z.string().trim().min(11).max(14),
    fone: z.string().trim().optional(),
    nascimento: nascimentoField,
    ...guardianShape,
  }),
)

export const POST = withRequestContext(
  { action: "admin.alunos.create", route: "/api/admin/alunos" },
  async (request: Request) => {
  const guard = await requireAdmin("alunos.manage")
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

  if (!isValidCpf(parsed.data.cpf)) {
    return NextResponse.json({ error: "CPF inválido" }, { status: 400 })
  }
  const cpf = stripCpf(parsed.data.cpf)
  const { nascimento, guardian } = buildGuardianWrite(parsed.data)

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
        nascimento,
        ...guardianData(guardian),
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
      // Customer no nome de QUEM PAGA — com aluno menor, o responsavel.
      const { customer } = await findOrCreateAsaasCustomer({
        name: guardian?.nome ?? parsed.data.nome,
        email: guardian?.email ?? parsed.data.email,
        cpfCnpj: guardian?.cpf ?? cpf,
        mobilePhone: guardian?.fone ?? parsed.data.fone,
        externalReference: guardian
          ? `pmb_guardian_${student.id}`
          : `pmb_student_${student.id}`,
      })
      await prisma.student.update({
        where: { id: student.id },
        data: guardian
          ? { responsavelAsaasCustomerId: customer.id }
          : { asaasCustomerId: customer.id },
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
