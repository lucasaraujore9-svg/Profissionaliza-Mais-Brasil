import { PageHeader } from "@/components/painel/page-header"
import { ResellerBackLink } from "@/components/admin/reseller-back-link"
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
        name: true,
        slug: true,
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
      <ResellerBackLink
        href="/admin/revendedores"
        label="Voltar para revendedores"
      />

      <PageHeader
        title={tenant?.name ?? "Revendedor"}
        description={
          tenant?.slug ? `Gestão da unidade ${tenant.slug}.` : undefined
        }
        actions={
          <a
            href={`/admin/revendedores/${id}/comissoes`}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:border-[var(--color-pmb-green)] hover:text-[var(--color-pmb-green-700)]"
          >
            Comissões
          </a>
        }
      />

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
