import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { verifyProjectDomain, getProjectDomain } from "@/lib/vercel/client"

export async function POST() {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { customDomain: true },
  })
  if (!tenant?.customDomain) {
    return NextResponse.json(
      { error: "Nenhum domínio para verificar" },
      { status: 400 },
    )
  }

  try {
    await verifyProjectDomain(tenant.customDomain)
  } catch {
    // fallthrough para checar status
  }

  try {
    const info = await getProjectDomain(tenant.customDomain)
    return NextResponse.json({
      data: {
        verified: info.verified,
        verification: info.verification ?? null,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro Vercel"
    return NextResponse.json(
      { error: `Falha ao verificar domínio: ${message}` },
      { status: 502 },
    )
  }
}
