import { NextResponse } from "next/server"
import { requirePainel } from "@/lib/auth/painel-guard"
import type { PainelContext } from "@/lib/auth/painel-guard"
import type { PainelPermission } from "@/lib/auth/painel-permissions"
import {
  isSubscriptionModuleEnabled,
  SUBSCRIPTIONS_DISABLED,
  SUBSCRIPTIONS_DISABLED_MESSAGE,
} from "./module"

/**
 * Guard das rotas de `/api/painel/assinaturas/*` (gestao de planos da unidade).
 *
 * Existe como funcao unica para que uma rota nova nao nasca so com
 * `requirePainel("assinaturas.manage")` — que passa para qualquer dono de
 * revenda. Ha teste de cobertura exigindo que TODA rota daquele diretorio use
 * este guard. Ver `module.ts` para o que o modulo fecha e o que nao fecha.
 *
 * A ordem importa: o modulo e verificado DEPOIS da autenticacao e da permissao.
 * Antes, um 403 de modulo desligado responderia a quem nem devia saber que a
 * rota existe.
 */
export async function requireSubscriptionModule(
  ...perms: PainelPermission[]
): Promise<{ ok: true; ctx: PainelContext } | { ok: false; response: Response }> {
  const guard = await requirePainel(...perms)
  if (!guard.ok) return guard

  if (!(await isSubscriptionModuleEnabled(guard.ctx.tenantId))) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: SUBSCRIPTIONS_DISABLED_MESSAGE, code: SUBSCRIPTIONS_DISABLED },
        { status: 403 },
      ),
    }
  }

  return guard
}
