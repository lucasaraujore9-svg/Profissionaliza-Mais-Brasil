import { redirect } from "next/navigation"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePainel, requirePainelPage } from "@/lib/auth/painel-guard"
import type { PainelContext } from "@/lib/auth/painel-guard"
import type { PainelPermission } from "@/lib/auth/painel-permissions"

/**
 * MODULO "PRODUZIR CURSOS" — a habilitacao por UNIDADE.
 *
 * Duas perguntas diferentes, e o codigo precisava das duas:
 *
 *   `Tenant.courseAuthoringEnabled`  esta unidade PODE produzir curso?
 *   `cursosAutorais.view/manage`     QUEM, dentro dela, opera o modulo?
 *
 * So a segunda existia — e o preset do dono e `owner: ALL`, entao TODA revenda
 * ja nascia podendo criar curso, definir comissao e publicar na rede. Produzir
 * conteudo e uma habilitacao comercial: quem concede e a equipe do sistema mae,
 * unidade a unidade, em /admin/revendedores/[id] → "Vitrine & extras". Mesmo
 * molde de `canSellResellers` (`lib/auth/guards.ts`).
 *
 * A ordem importa: o modulo e verificado DEPOIS da autenticacao e da permissao.
 * Antes, um 403 de modulo desligado responderia a quem nem devia saber que a
 * rota existe.
 */

/** Codigo que a UI usa para distinguir "modulo desligado" de "sem permissao". */
export const COURSE_AUTHORING_DISABLED = "COURSE_AUTHORING_DISABLED"

const DISABLED_MESSAGE =
  "A produção de cursos próprios não está habilitada para esta unidade. Fale com a Profissionaliza Mais Brasil."

/** A unidade tem o modulo ligado? Consulta indexada na PK, uma por request. */
export async function isCourseAuthoringEnabled(tenantId: string): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { courseAuthoringEnabled: true },
  })
  return tenant?.courseAuthoringEnabled ?? false
}

/**
 * Guard das rotas de `/api/painel/cursos-autorais/*`.
 *
 * Existe como funcao unica para que uma rota nova nao nasca so com
 * `requirePainel("cursosAutorais.manage")` — que passa para qualquer dono de
 * revenda. Ha teste de cobertura exigindo que TODA rota daquele diretorio use
 * este guard.
 */
export async function requireCourseAuthoring(
  ...perms: PainelPermission[]
): Promise<{ ok: true; ctx: PainelContext } | { ok: false; response: Response }> {
  const guard = await requirePainel(...perms)
  if (!guard.ok) return guard

  if (!(await isCourseAuthoringEnabled(guard.ctx.tenantId))) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: DISABLED_MESSAGE, code: COURSE_AUTHORING_DISABLED },
        { status: 403 },
      ),
    }
  }

  return guard
}

/** Versao para server components: manda para /painel/cursos em vez de 403. */
export async function requireCourseAuthoringPage(
  ...perms: PainelPermission[]
): Promise<PainelContext> {
  const ctx = await requirePainelPage(...perms)
  if (!(await isCourseAuthoringEnabled(ctx.tenantId))) redirect("/painel/cursos")
  return ctx
}
