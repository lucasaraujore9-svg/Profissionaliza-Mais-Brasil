import type { Metadata, Viewport } from "next"
import { redirect } from "next/navigation"
import { headers, cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { StudentShell } from "@/components/aluno/student-shell"
import { ImpersonationBanner } from "@/components/admin/impersonation-banner"
import {
  decodeImpersonationFlag,
  IMPERSONATION_FLAG_COOKIE,
} from "@/lib/auth/impersonate"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { getCurrentTenant } from "@/lib/tenant/current"
import { getRequestOrigin } from "@/lib/seo/host"
import {
  tenantVitrineMetadata,
  tenantVitrineViewport,
} from "@/lib/seo/tenant-metadata"

// Área privada (noindex). No domínio de uma revenda, favicon/título/PWA seguem a
// identidade da unidade; sem tenant (domínio PMB), herda a identidade PMB do root.
export async function generateMetadata(): Promise<Metadata> {
  const [tenant, origin] = await Promise.all([
    getCurrentTenant(),
    getRequestOrigin(),
  ])
  const robots = { index: false, follow: false } as const

  if (tenant) {
    return {
      ...tenantVitrineMetadata(tenant, origin),
      title: {
        default: `Área do aluno · ${tenant.name}`,
        template: `%s · ${tenant.name}`,
      },
      robots,
    }
  }

  return {
    title: {
      default: "Área do aluno · Profissionaliza Mais Brasil",
      template: "%s · Profissionaliza Mais Brasil",
    },
    robots,
  }
}

export async function generateViewport(): Promise<Viewport> {
  const tenant = await getCurrentTenant()
  return tenantVitrineViewport(tenant)
}

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

  const studentRow = await prisma.student.findUnique({
    where: { id: session.studentId },
    select: { dismissedTours: true },
  })
  const dismissedTours = studentRow?.dismissedTours ?? []

  const cookieStore = await cookies()
  const impersonation = decodeImpersonationFlag(
    cookieStore.get(IMPERSONATION_FLAG_COOKIE)?.value,
  )

  const tenant = await resolveActiveTenant()
  // Cross-tenant guard: o aluno só vê o painel da loja onde ele tem conta.
  // PULADO durante impersonação — o admin/revendedor está vendo o aluno de
  // propósito, possivelmente sob outro domínio (ex.: admin no domínio PMB
  // acessando um aluno de uma revenda). O flag é assinado (HMAC), não forjável.
  if (!impersonation && tenant && session.tenantId && session.tenantId !== tenant.id) {
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
    <>
      {impersonation && (
        <ImpersonationBanner
          adminName={impersonation.adminName}
          targetName={impersonation.targetName}
        />
      )}
      <StudentShell
        session={session}
        dismissedTours={dismissedTours}
        {...branding}
      >
        {children}
      </StudentShell>
    </>
  )
}
