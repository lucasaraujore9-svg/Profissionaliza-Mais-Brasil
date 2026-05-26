import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { StudentShell } from "@/components/aluno/student-shell"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"

interface TenantBranding {
  id: string
  name: string
  primaryColor: string | null
  secondaryColor: string | null
  logoUrl: string | null
}

/**
 * Resolve o tenant ativo a partir do subdomínio (headers do proxy).
 * Retorna o branding completo para que o shell do aluno reflita as cores
 * configuradas na vitrine (consistente com /loja/* — antes a área do aluno
 * mostrava verde PMB independentemente da vitrine que originou a compra).
 */
async function resolveActiveTenant(): Promise<TenantBranding | null> {
  const h = await headers()
  const select = {
    id: true,
    name: true,
    primaryColor: true,
    secondaryColor: true,
    logoUrl: true,
  } as const
  const tenantId = h.get("x-tenant-id")
  if (tenantId) {
    const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select })
    if (t) return t
  }
  const tenantSlug = h.get("x-tenant-slug")
  if (tenantSlug) {
    const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select })
    if (t) return t
  }
  const pmbTenant = await prisma.tenant.findUnique({
    where: { slug: PMB_TENANT_SLUG },
    select,
  })
  return pmbTenant
}

export default async function AlunoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireStudentSession()
  if (!session) {
    redirect("/login")
  }

  const tenant = await resolveActiveTenant()
  // Cross-tenant guard: o aluno só vê o painel da loja onde ele tem conta.
  if (tenant && session.tenantId && session.tenantId !== tenant.id) {
    redirect("/logout?next=/login")
  }

  // PMB tenant placeholder mantém cores PMB padrão (não propaga branding
  // específico). Para revendedores reais, propagamos primary/secondary/logo.
  const isPmb = tenant?.id && tenant?.name?.includes("Vitrine")
  const branding = !isPmb && tenant
    ? {
        brandPrimary: tenant.primaryColor ?? undefined,
        brandAccent: tenant.secondaryColor ?? undefined,
        storeName: tenant.name,
        logoUrl: tenant.logoUrl ?? undefined,
      }
    : {}

  return (
    <StudentShell session={session} {...branding}>
      {children}
    </StudentShell>
  )
}
