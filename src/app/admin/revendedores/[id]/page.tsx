import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { ResellerDetailClient } from "@/components/admin/reseller-detail-client"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { prisma } from "@/lib/prisma"

export default async function ResellerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await requireAdminSession()
  const isSuperAdmin = session?.role === "SUPER_ADMIN"

  // Vendedor de revenda atual da unidade + lista de vendedores ativos para o
  // controle de atribuicao (espelha o gerente de suporte/accountManager).
  // Apenas SUPER_ADMIN pode reatribuir o vendedor (PATCH .../sales valida isso).
  const [tenant, salesUsers] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id },
      select: {
        salesUserId: true,
        salesUser: { select: { name: true } },
      },
    }),
    isSuperAdmin
      ? prisma.user.findMany({
          where: { role: "PMB_REVENDA_SALES", status: "ATIVO" },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ])

  return (
    <div className="space-y-6">
      <Link
        href="/admin/revendedores"
        className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-[var(--color-pmb-green-900)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar para revendedores
      </Link>

      <ResellerDetailClient
        tenantId={id}
        isSuperAdmin={isSuperAdmin}
        viewerId={session?.userId ?? null}
        viewerRole={session?.role ?? null}
        salesUserId={tenant?.salesUserId ?? null}
        salesUserName={tenant?.salesUser?.name ?? null}
        salesUsers={salesUsers}
      />
    </div>
  )
}
