import { prisma } from "@/lib/prisma"

// Cap padrao de quem nao tem override individual (User.maxDiscount = null).
export const PMB_SALES_DEFAULT_CAP = 50

/**
 * Resolve o cap efetivo (%) de desconto nas vendas diretas da vitrine PMB. O
 * cap vale para GERAR desconto — criacao de cupom proprio (/api/admin/cupons) e
 * desconto manual na venda (/api/admin/vendas). NAO limita a APLICACAO de cupom
 * existente: qualquer cupom ativo pode ser usado por qualquer vendedor (quem o
 * criou ja foi validado contra o proprio cap).
 *
 * O gate e a PERMISSAO `vendas.descontoIlimitado`, nao o papel. Enquanto era
 * `role !== "PMB_SALES" -> 100`, conceder `vendas.create` ou `cupons.manage` a
 * qualquer outro papel entregava desconto de 100% sem teto — a autorizacao
 * tinha virado permissao, mas a trava tinha ficado no papel.
 *   - com `vendas.descontoIlimitado` => 100 (sem cap)
 *   - sem override individual        => PMB_SALES_DEFAULT_CAP (50)
 *   - com User.maxDiscount           => o valor, clampado em [0, 100]
 */
export function resolveSalesCap(
  uncapped: boolean,
  maxDiscount?: number | null,
): number {
  if (uncapped) return 100
  if (maxDiscount == null) return PMB_SALES_DEFAULT_CAP
  return Math.min(Math.max(Math.trunc(maxDiscount), 0), 100)
}

/**
 * Cap efetivo de quem esta na sessao, lendo User.maxDiscount do banco. A sessao
 * (JWT) nao carrega o campo — lookup direto para refletir mudanca do admin sem
 * relogin.
 */
export async function effectiveSalesCap(ctx: {
  userId: string
  can: (perm: "vendas.descontoIlimitado") => boolean
}): Promise<number> {
  if (ctx.can("vendas.descontoIlimitado")) return 100
  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { maxDiscount: true },
  })
  return resolveSalesCap(false, user?.maxDiscount)
}
