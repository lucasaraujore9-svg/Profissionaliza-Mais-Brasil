import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePmbSales } from "@/lib/auth/guards"
import { getOrCreatePmbTenant } from "@/lib/pmb-tenant"
import { pmbEaPolo, pmbEaVendedorId } from "@/lib/pmb-config"

export async function GET(request: Request) {
  const guard = await requirePmbSales()
  if (!guard.ok) return guard.response

  const pmbTenant = await getOrCreatePmbTenant()

  const url = new URL(request.url)
  const q = url.searchParams.get("q")?.trim() ?? ""

  // PMB_SALES ve so alunos cujas enrollments dele ele criou; SUPER_ADMIN ve todos
  const whereStudent = guard.session.role === "SUPER_ADMIN"
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

  const pmbTenant = await getOrCreatePmbTenant()
  const cpf = parsed.data.cpf.replace(/\D/g, "")

  const existing = await prisma.student.findFirst({
    where: {
      tenantId: pmbTenant.id,
      OR: [{ email: parsed.data.email }, { cpf }],
    },
    select: { id: true, email: true, cpf: true },
  })
  if (existing) {
    return NextResponse.json({
      data: { id: existing.id, existed: true },
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
    select: { id: true },
  })

  return NextResponse.json({ data: { id: student.id, existed: false } })
}
