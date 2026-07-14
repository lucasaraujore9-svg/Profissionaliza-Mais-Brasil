import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { verifyProjectDomain } from "@/lib/vercel/client"
import { resolveCustomDomainStatus } from "@/lib/vercel/domain-status"
import { ensureCustomDomainCert } from "@/lib/vercel/ensure-cert"
import { customDomainVariants } from "@/lib/tenant/urls"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
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
      select: { id: true, slug: true, customDomain: true },
    })
    if (!tenant?.customDomain) {
      return NextResponse.json(
        { error: "Nenhum domínio para verificar" },
        { status: 400 },
      )
    }

    // Dispara a verificação de posse nas DUAS variantes (apex + www). Best-effort:
    // se a Vercel ainda não conseguir verificar, seguimos para a checagem de
    // estado real abaixo, que é quem decide se o domínio pode ser aplicado.
    const variants = customDomainVariants(tenant.customDomain)
    await Promise.all(
      variants.map((d) =>
        verifyProjectDomain(d).catch(swallow("painel.dominio.verify.trigger")),
      ),
    )

    try {
      // Fonte da verdade: os 2 registros precisam estar apontados (DNS) E
      // verificados (posse) para o domínio ser aplicado (domainVerified=true).
      const resolved = await resolveCustomDomainStatus(tenant.customDomain)

      // DNS apontado ≠ https funcionando: se o domínio foi anexado antes do
      // apontamento, a Vercel pode nunca emitir o cert (incidente
      // vanguardacursos). O clique em "verificar" é o momento em que o DNS
      // acabou de ficar ok — garante a emissão aqui, best-effort (o cron
      // ensure-domain-certs cobre o resto).
      if (resolved.pointed) {
        await ensureCustomDomainCert(tenant.customDomain).catch(
          swallow("painel.dominio.verify.cert"),
        )
      }

      await prisma.tenant
        .update({
          where: { id: tenant.id },
          data: { domainVerified: resolved.pointed },
        })
        .then(() =>
          invalidateTenant({
            id: tenant.id,
            slug: tenant.slug,
            customDomain: tenant.customDomain,
          }),
        )
        .catch(swallow("painel.dominio.verify"))

      return NextResponse.json({
        data: {
          verified: resolved.pointed,
          status: resolved.status,
          verification: resolved.verification,
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
