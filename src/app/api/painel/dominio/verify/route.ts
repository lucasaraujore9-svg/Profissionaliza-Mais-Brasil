import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { verifyProjectDomain, getProjectDomain } from "@/lib/vercel/client"
import { swallow } from "@/lib/errors"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const POST = withRequestContext(
  { action: "painel.dominio.verify", route: "/api/painel/dominio/verify" },
  async () => {
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

      // Persiste o status de verificação no DB como indicador de UI/relatório.
      // OBS: a resolução de tenant por custom domain NÃO depende mais desta flag
      // (ver src/app/api/internal/resolve-tenant). A chegada do Host já prova a
      // posse, então o proxy resolve por customDomain mesmo com a flag false.
      await prisma.tenant
        .update({
          where: { id: ctx.tenantId },
          data: { domainVerified: info.verified },
        })
        .catch(swallow("painel.dominio.verify"))

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
  },
)
