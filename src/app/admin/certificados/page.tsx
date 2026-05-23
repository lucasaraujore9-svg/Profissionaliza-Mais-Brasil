import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus, Settings } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { PageHeader } from "@/components/painel/page-header"
import {
  CertificatesList,
  type TenantOption,
} from "@/components/painel/certificates-list"

export const dynamic = "force-dynamic"

export default async function AdminCertificadosPage() {
  const ctx = await requireAdminSession()
  if (!ctx) redirect("/login?callbackUrl=/admin/certificados")

  const tenants = await prisma.tenant.findMany({
    where: { status: { in: ["ACTIVE", "SUSPENDED", "PENDING"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
    take: 200,
  })

  const tenantOptions: TenantOption[] = [
    { id: "any", label: "Todos os tenants" },
    { id: "pmb", label: "PMB (Vitrine principal)" },
    ...tenants
      .filter((t) => t.slug !== "__pmb__")
      .map((t) => ({ id: t.id, label: `${t.name} (${t.slug})` })),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Certificados"
        description="Visão global de todos os certificados emitidos no sistema."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/certificados/configuracoes"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <Settings className="h-4 w-4" />
              Configurações
            </Link>
            <Link
              href="/admin/certificados/emitir"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--color-pmb-green-700)]"
            >
              <Plus className="h-4 w-4" />
              Emitir certificado
            </Link>
          </div>
        }
      />

      <CertificatesList
        listEndpoint="/api/admin/certificates"
        revokeEndpoint="/api/admin/certificates/{id}/revoke"
        tenantOptions={tenantOptions}
        showTenantColumn
      />
    </div>
  )
}
