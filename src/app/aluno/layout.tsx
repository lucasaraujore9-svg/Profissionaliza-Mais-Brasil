import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { StudentShell } from "@/components/aluno/student-shell"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"

/**
 * Resolve o tenant ativo a partir do subdomínio (headers do proxy).
 * Retorna null quando estamos na vitrine principal sem placeholder PMB.
 */
async function resolveActiveTenantId(): Promise<string | null> {
  const h = await headers()
  const tenantId = h.get("x-tenant-id")
  if (tenantId) return tenantId
  const tenantSlug = h.get("x-tenant-slug")
  if (tenantSlug) {
    const t = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true },
    })
    if (t) return t.id
  }
  const pmbTenant = await prisma.tenant.findUnique({
    where: { slug: PMB_TENANT_SLUG },
    select: { id: true },
  })
  return pmbTenant?.id ?? null
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

  // Cross-tenant guard: o aluno só vê o painel da loja onde ele tem conta.
  // Se acessar /aluno em outra loja, força logout (para evitar exibir dados
  // de outro tenant) e redireciona para o login local.
  const activeTenantId = await resolveActiveTenantId()
  if (activeTenantId && session.tenantId && session.tenantId !== activeTenantId) {
    redirect("/logout?next=/login")
  }

  return <StudentShell session={session}>{children}</StudentShell>
}
