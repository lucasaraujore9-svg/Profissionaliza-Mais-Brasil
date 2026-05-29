import { prisma } from "@/lib/prisma"

// Resolve o tenant a partir dos headers que o proxy injeta numa requisicao de
// storefront. IMPORTANTE: para caminhos /api/* o proxy seta apenas
// `x-tenant-slug` (nao `x-tenant-id`) — o `x-tenant-id` so e setado para
// caminhos de vitrine (/, /curso, ...). Por isso rotas de API precisam aceitar
// ambos, espelhando o getCurrentTenant() usado nas paginas.
//
// O proxy tambem remove qualquer x-tenant-* enviado pelo cliente antes de
// reclassificar o host, entao confiar nesses headers e seguro (nao spoofavel).
export async function resolveTenantFromRequest(
  request: Request,
): Promise<{ id: string; slug: string; name: string; automationEnabled: boolean } | null> {
  const id = request.headers.get("x-tenant-id")?.trim() || null
  const slug = request.headers.get("x-tenant-slug")?.trim() || null
  if (!id && !slug) return null
  return prisma.tenant.findFirst({
    where: id ? { id } : { slug: slug as string },
    select: { id: true, slug: true, name: true, automationEnabled: true },
  })
}
