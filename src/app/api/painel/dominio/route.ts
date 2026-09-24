import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import {
  addProjectDomain,
  removeProjectDomain,
  isVercelConfigured,
  VercelNotConfiguredError,
} from "@/lib/vercel/client"
import { resolveCustomDomainStatus } from "@/lib/vercel/domain-status"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import {
  appDomain as resolveAppDomain,
  vitrineDomain as resolveVitrineDomain,
  apexDomain,
  wwwDomain,
} from "@/lib/tenant/urls"
import {
  customDomainKind,
  customDomainVariants,
  customDomainDnsRecords,
} from "@/lib/tenant/custom-domain"
import { swallow } from "@/lib/errors"
import { withRequestContext } from "@/lib/observability/with-request-context"

async function fetchTenantDomainInfo(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      slug: true,
      customDomain: true,
      domainVerified: true,
    },
  })
  if (!tenant) return null

  let status: "NONE" | "PENDING" | "ACTIVE" | "ERROR" = "NONE"
  let verification: Array<{ type: string; domain: string; value: string; reason: string }> | null =
    null
  // O dominio so e "aplicado" quando a Vercel confirma os 2 registros apontados.
  // Reflete o estado persistido por padrao; a checagem live abaixo reconcilia.
  let applied = tenant.domainVerified

  if (tenant.customDomain) {
    // Checa AS DUAS variantes (apex + www): apontadas (DNS) E verificadas
    // (posse). ACTIVE somente quando ambas estao prontas.
    try {
      const resolved = await resolveCustomDomainStatus(tenant.customDomain)
      status = resolved.status
      verification = resolved.verification
      applied = resolved.pointed

      // Auto-heal: sincroniza a flag persistida com o estado real da Vercel nas
      // DUAS direcoes. Assim o dominio "se aplica" sozinho quando o revendedor
      // termina o DNS (sem depender do botao Verificar) e "despublica" se os
      // registros deixarem de apontar. So persistimos apos leitura bem-sucedida
      // da Vercel — um erro transitorio cai no catch e NAO mexe na flag.
      if (resolved.pointed !== tenant.domainVerified) {
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
          .catch(swallow("painel.dominio.get.autoheal"))
      }
    } catch {
      status = "ERROR"
    }
  }

  const vitrineDomain = resolveVitrineDomain()
  return {
    subdomain: tenant.slug,
    vitrineDomain,
    subdomainFull: `${tenant.slug}.${vitrineDomain}`,
    customDomain: tenant.customDomain,
    // `applied` = dominio proprio efetivamente em uso (URLs publicas). Enquanto
    // false, a vitrine continua no subdominio oficial.
    applied,
    status,
    vercelConfigured: isVercelConfigured(),
    // Dominio raiz: A em "@" (CNAME no apex e proibido pela RFC e o
    // Registro.br recusa) + CNAME em "www". Subdominio: um CNAME so, no proprio
    // prefixo — instruir "@" ali mandaria a unidade apontar o dominio PRINCIPAL.
    domainKind: tenant.customDomain ? customDomainKind(tenant.customDomain) : null,
    dnsRecords: tenant.customDomain ? customDomainDnsRecords(tenant.customDomain) : [],
    verification,
  }
}

export const GET = withRequestContext(
  { action: "painel.dominio.get", route: "/api/painel/dominio" },
  async () => {
    const guard = await requirePainel("dominio.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const info = await fetchTenantDomainInfo(ctx.tenantId)
    if (!info) {
      return NextResponse.json({ error: "Tenant não encontrado" }, { status: 404 })
    }
    return NextResponse.json({ data: info })
  },
)

const domainSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Domínio muito curto")
    .max(253, "Domínio muito longo")
    .regex(
      /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/,
      "Formato de domínio inválido",
    ),
})

export const POST = withRequestContext(
  { action: "painel.dominio.add", route: "/api/painel/dominio" },
  async (request: Request) => {
    const guard = await requirePainel("dominio.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = domainSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Dados inválidos",
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    // Armazenamos sempre a forma sem `www.`. Dominio raiz registra apex + www
    // na Vercel; subdominio registra so ele mesmo.
    const apex = apexDomain(parsed.data.domain)
    const [apexHost, wwwHost] = customDomainVariants(parsed.data.domain)
    const appDomain = resolveAppDomain()
    const vitrineDomain = resolveVitrineDomain()
    if (
      (appDomain && apex.endsWith(`.${appDomain}`)) ||
      (vitrineDomain && apex.endsWith(`.${vitrineDomain}`))
    ) {
      return NextResponse.json(
        { error: "Use apenas domínio próprio, não um subdomínio da plataforma" },
        { status: 400 },
      )
    }

    // Conflito: qualquer variante (apex ou www) ja usada por outro revendedor.
    const existing = await prisma.tenant.findFirst({
      where: { customDomain: { in: [apexHost, wwwDomain(apexHost)] } },
      select: { id: true },
    })
    if (existing && existing.id !== ctx.tenantId) {
      return NextResponse.json(
        { error: "Este domínio já está sendo usado por outro revendedor" },
        { status: 409 },
      )
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, slug: true, customDomain: true },
    })
    if (!tenant) {
      return NextResponse.json({ error: "Tenant não encontrado" }, { status: 404 })
    }

    // Apex e obrigatorio (falha = erro). www e best-effort: a unidade pode optar
    // por nao criar o registro `www` no DNS. addProjectDomain e idempotente para
    // dominios ja anexados ao projeto.
    try {
      await addProjectDomain(apexHost)
    } catch (error) {
      if (error instanceof VercelNotConfiguredError) {
        return NextResponse.json({ error: error.message }, { status: 503 })
      }
      const message = error instanceof Error ? error.message : "Erro Vercel"
      return NextResponse.json(
        { error: `Falha ao adicionar domínio: ${message}` },
        { status: 502 },
      )
    }
    if (wwwHost) {
      await addProjectDomain(wwwHost).catch(swallow("painel.dominio.add.www"))
    }

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { customDomain: apex, domainVerified: false },
    })

    await invalidateTenant({
      id: tenant.id,
      slug: tenant.slug,
      customDomain: tenant.customDomain,
    })

    const info = await fetchTenantDomainInfo(tenant.id)
    return NextResponse.json({ data: info })
  },
)

export const DELETE = withRequestContext(
  { action: "painel.dominio.remove", route: "/api/painel/dominio" },
  async () => {
    const guard = await requirePainel("dominio.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, slug: true, customDomain: true },
    })
    if (!tenant) {
      return NextResponse.json({ error: "Tenant não encontrado" }, { status: 404 })
    }
    if (!tenant.customDomain) {
      return NextResponse.json(
        { error: "Nenhum domínio personalizado para remover" },
        { status: 400 },
      )
    }

    // Remove apex + www do projeto na Vercel. O www vai sempre (best-effort):
    // subdominios cadastrados antes da distincao raiz/subdominio tambem
    // anexaram um `www.<subdominio>`.
    try {
      await removeProjectDomain(apexDomain(tenant.customDomain))
    } catch (error) {
      if (error instanceof VercelNotConfiguredError) {
        return NextResponse.json({ error: error.message }, { status: 503 })
      }
      const message = error instanceof Error ? error.message : "Erro Vercel"
      if (!message.toLowerCase().includes("not found")) {
        return NextResponse.json(
          { error: `Falha ao remover domínio: ${message}` },
          { status: 502 },
        )
      }
    }
    await removeProjectDomain(wwwDomain(tenant.customDomain)).catch(
      swallow("painel.dominio.remove.www"),
    )

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { customDomain: null, domainVerified: false },
    })

    await invalidateTenant({
      id: tenant.id,
      slug: tenant.slug,
      customDomain: tenant.customDomain,
    })

    const info = await fetchTenantDomainInfo(tenant.id)
    return NextResponse.json({ data: info })
  },
)
