import type { Prisma } from "@prisma/client"
import type { AdminContext } from "@/lib/auth/admin-guard"

/**
 * `where` de um saque (`ReferralPayout`) por id, já recortado pela carteira de
 * quem chamou. `null` = a pessoa não alcança unidade nenhuma → a rota nega.
 *
 * Existe porque as rotas de ESCRITA do saque (marcar pago, reprovar, anotar,
 * anexar e baixar comprovante) buscavam o payout por `findUnique({ id })` puro:
 * a permissão `financeiro.manage` autorizava a ação e nada amarrava o registro
 * à carteira. Como ela é concedível por override, quem a recebesse para dar
 * baixa nos próprios saques conseguia marcar como pago — e baixar o comprovante
 * bancário — de qualquer unidade da rede, passando o id na URL.
 *
 * Use com `findFirst` (`findUnique` não aceita filtro de relação).
 */
export async function payoutScopeWhere(
  ctx: AdminContext,
  id: string,
): Promise<Prisma.ReferralPayoutWhereInput | null> {
  const scope = await ctx.comissoesScope()
  if (!scope) return null
  return Object.keys(scope).length > 0 ? { id, referrer: scope } : { id }
}
