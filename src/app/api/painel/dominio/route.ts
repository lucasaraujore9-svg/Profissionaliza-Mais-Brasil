import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import {
  addProjectDomain,
  getProjectDomain,
  removeProjectDomain,
  isVercelConfigured,
  VercelNotConfiguredError,
} from "@/lib/vercel/client"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import {
  appDomain as resolveAppDomain,
  cnameTarget as resolveCnameTarget,
  vitrineDomain as resolveVitrineDomain,
} from "@/lib/tenant/urls"

async function fetchTenantDomainInfo(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      slug: true,
      customDomain: true,
    },
  })
  if (!tenant) return null

  let status: "NONE" | "PENDING" | "ACTIVE" | "ERROR" = "NONE"
  let verification: Array<{ type: string; domain: string; value: string; reason: string }> | null =
    null

  if (tenant.customDomain) {
    try {
      const info = await getProjectDomain(tenant.customDomain)
      status = info.verified ? "ACTIVE" : "PENDING"
      verification = info.verification ?? null
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
    status,
    vercelConfigured: isVercelConfigured(),
    dnsRecords: tenant.customDomain
      ? [
          {
            type: "CNAME",
            name: tenant.customDomain.startsWith("www.") ? "www" : "@",
            value: resolveCnameTarget(),
          },
        ]
      : [],
    verification,
  }
}

export async function GET() {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const info = await fetchTenantDomainInfo(ctx.tenantId)
  if (!info) {
    return NextResponse.json({ error: "Tenant não encontrado" }, { status: 404 })
  }
  return NextResponse.json({ data: info })
}

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

export async function POST(request: Request) {
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

  const domain = parsed.data.domain
  const appDomain = resolveAppDomain()
  const vitrineDomain = resolveVitrineDomain()
  if (
    (appDomain && domain.endsWith(`.${appDomain}`)) ||
    (vitrineDomain && domain.endsWith(`.${vitrineDomain}`))
  ) {
    return NextResponse.json(
      { error: "Use apenas domínio próprio, não um subdomínio da plataforma" },
      { status: 400 },
    )
  }

  const existing = await prisma.tenant.findUnique({
    where: { customDomain: domain },
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

  try {
    await addProjectDomain(domain)
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

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { customDomain: domain, domainVerified: false },
  })

  await invalidateTenant({
    id: tenant.id,
    slug: tenant.slug,
    customDomain: tenant.customDomain,
  })

  const info = await fetchTenantDomainInfo(tenant.id)
  return NextResponse.json({ data: info })
}

export async function DELETE() {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

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

  try {
    await removeProjectDomain(tenant.customDomain)
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
}
