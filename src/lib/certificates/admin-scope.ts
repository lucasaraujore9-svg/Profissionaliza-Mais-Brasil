import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { UserRole } from "@prisma/client"

/**
 * Escopo de acesso da equipe PMB a um certificado/matricula, espelhando
 * EXATAMENTE o filtro da listagem GET /api/admin/certificates:
 *  - SUPER_ADMIN: todos.
 *  - PMB_SALES: somente PMB (tenantId = null).
 *  - PMB_RESELLER_MGR: somente tenants atribuidos a ele (accountManagerId).
 *
 * `certTenantId` segue a convencao do certificado/matricula, onde `null` = PMB
 * (vitrine principal). Garante que download / regenerate / issue so operem no
 * que o papel ja pode LISTAR — fecha o vazamento/mutacao cross-tenant (o PDF
 * carrega nome + CPF do aluno, PII sensivel).
 */
export async function adminCanAccessCertTenant(
  role: UserRole,
  userId: string,
  certTenantId: string | null,
): Promise<boolean> {
  if (role === "SUPER_ADMIN") return true
  if (role === "PMB_SALES") return certTenantId === null
  if (role === "PMB_RESELLER_MGR") {
    if (certTenantId === null) return false
    const tenant = await prisma.tenant.findUnique({
      where: { id: certTenantId },
      select: { accountManagerId: true },
    })
    return tenant?.accountManagerId === userId
  }
  return false
}

/** 403 padronizado para acesso a certificado fora do escopo do papel. */
export function certScopeDeniedResponse(): NextResponse {
  return NextResponse.json(
    { error: "Sem permissão para este certificado" },
    { status: 403 },
  )
}
