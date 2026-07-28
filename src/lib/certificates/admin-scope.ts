import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { AdminContext } from "@/lib/auth/admin-guard"

/**
 * Escopo de acesso da equipe PMB a um certificado/matricula, espelhando
 * EXATAMENTE o filtro da listagem GET /api/admin/certificates:
 *  - certificado da VITRINE PMB (`certTenantId === null`): quem opera a
 *    vitrine (`alunos.view`) ou quem enxerga a rede inteira;
 *  - certificado de uma UNIDADE: so quem alcanca aquela unidade na carteira
 *    (`canAccessTenant` cobre accountManagerId, salesUserId e time de vendas).
 *
 * Garante que download / regenerate / issue so operem no que a pessoa ja pode
 * LISTAR — fecha o vazamento/mutacao cross-tenant (o PDF carrega nome + CPF do
 * aluno, PII sensivel). Chaveado por PERMISSAO, nao por papel: assim conceder
 * `certificados.manage` por override nao entrega a rede inteira junto.
 */
export async function adminCanAccessCertTenant(
  ctx: AdminContext,
  certTenantId: string | null,
): Promise<boolean> {
  if (ctx.can("unidades.viewAll")) return true
  if (certTenantId === null) return ctx.can("alunos.view")
  const tenant = await prisma.tenant.findUnique({
    where: { id: certTenantId },
    select: { accountManagerId: true, salesUserId: true },
  })
  return ctx.canAccessTenant(tenant)
}

/** 403 padronizado para acesso a certificado fora do escopo do papel. */
export function certScopeDeniedResponse(): NextResponse {
  return NextResponse.json(
    { error: "Sem permissão para este certificado" },
    { status: 403 },
  )
}
