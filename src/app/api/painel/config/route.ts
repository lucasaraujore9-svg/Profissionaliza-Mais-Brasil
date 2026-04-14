import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const updateSchema = z.object({
  name: z.string().trim().min(3, "Nome muito curto").max(120),
  email: z.string().trim().toLowerCase().email("Email inválido").max(160),
  companyName: z.string().trim().min(2).max(160),
})

async function requireResellerSession() {
  const session = await auth()
  if (!session?.user || session.user.role !== "RESELLER" || !session.user.tenantId) {
    return null
  }
  return {
    userId: session.user.id as string,
    tenantId: session.user.tenantId as string,
  }
}

export async function GET() {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { id: true, name: true, email: true },
  })
  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      billingMode: true,
      status: true,
      mpConnected: true,
      mpUserId: true,
    },
  })

  if (!user || !tenant) {
    return NextResponse.json({ error: "Recurso não encontrado" }, { status: 404 })
  }

  return NextResponse.json({
    data: {
      user,
      tenant,
    },
  })
}

export async function PUT(request: Request) {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = updateSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Dados inválidos",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }

  const emailTaken = await prisma.user.findFirst({
    where: { email: parsed.data.email, NOT: { id: ctx.userId } },
    select: { id: true },
  })
  if (emailTaken) {
    return NextResponse.json(
      { error: "Email já está em uso", code: "EMAIL_TAKEN" },
      { status: 409 },
    )
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: ctx.userId },
      data: { name: parsed.data.name, email: parsed.data.email },
    }),
    prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: { name: parsed.data.companyName },
    }),
  ])

  return NextResponse.json({ data: { ok: true } })
}
