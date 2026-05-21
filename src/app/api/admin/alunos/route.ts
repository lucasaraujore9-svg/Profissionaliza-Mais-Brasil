import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePmbSales } from "@/lib/auth/guards"
import { getOrCreatePmbTenant } from "@/lib/pmb-tenant"
import { pmbEaPolo, pmbEaVendedorId } from "@/lib/pmb-config"
import { ensureStudentInEA } from "@/lib/students/ea-actions"
import { findOrCreateAsaasCustomer } from "@/lib/asaas/client"
import { getSystemSettings } from "@/lib/system-settings"

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

export async function GET(request: Request) {
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
      eaAlunoId: true,
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
      eaAlunoId: s.eaAlunoId,
      createdAt: s.createdAt.toISOString(),
    })),
  })
}

const createSchema = z.object({
  nome: z.string().trim().min(3).max(160),
  email: z.string().email().toLowerCase().trim(),
  cpf: z.string().trim().min(11).max(14),
  fone: z.string().trim().optional(),
})

export async function POST(request: Request) {
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

  const student = await prisma.student.create({
    data: {
      tenantId: pmbTenant.id,
      nome: parsed.data.nome,
      email: parsed.data.email,
      cpf,
      fone: parsed.data.fone,
      polo: pmbEaPolo(),
      vendedorId: pmbEaVendedorId(),
      eaAlunoId: `pending_${Date.now()}`,
      status: "ATIVO",
    },
    select: { id: true, nome: true, email: true, cpf: true },
  })

  // Cria o aluno na plataforma imediatamente (não espera pelo pagamento)
  try {
    await ensureStudentInEA(student.id)
  } catch (err) {
    console.error("[alunos/POST] falha ao criar aluno na plataforma:", err)
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
    console.error("[alunos/POST] falha ao criar customer no Asaas:", err)
    // Não bloqueia — será criado/reutilizado na geração do link
  }

  return NextResponse.json({
    data: { id: student.id, nome: student.nome, email: student.email, cpf: student.cpf, existed: false },
  })
}
