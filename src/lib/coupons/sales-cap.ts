import { prisma } from "@/lib/prisma"

// Cap padrao da role PMB_SALES quando o usuario nao tem override individual
// (User.maxDiscount = null). SUPER_ADMIN nao tem cap (100).
export const PMB_SALES_DEFAULT_CAP = 50

/**
 * Resolve o cap efetivo (%) de desconto de um usuario nas vendas diretas da
 * vitrine PMB. Regra unica usada na criacao de cupom, no preview e na
 * aplicacao do cupom na venda:
 *   - papel que nao e PMB_SALES (SUPER_ADMIN) => 100 (sem cap)
 *   - PMB_SALES sem override => PMB_SALES_DEFAULT_CAP (50)
 *   - PMB_SALES com User.maxDiscount => o valor, clampado em [0, 100]
 */
export function resolveSalesCap(
  role: string,
  maxDiscount?: number | null,
): number {
  if (role !== "PMB_SALES") return 100
  if (maxDiscount == null) return PMB_SALES_DEFAULT_CAP
  return Math.min(Math.max(Math.trunc(maxDiscount), 0), 100)
}

/**
 * Cap efetivo do usuario da sessao, lendo User.maxDiscount do banco quando o
 * papel e PMB_SALES. A sessao (JWT) nao carrega o campo — lookup direto para
 * refletir mudanca do admin sem relogin.
 */
export async function effectiveSalesCap(session: {
  userId: string
  role: string
}): Promise<number> {
  if (session.role !== "PMB_SALES") return 100
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { maxDiscount: true },
  })
  return resolveSalesCap(session.role, user?.maxDiscount)
}
