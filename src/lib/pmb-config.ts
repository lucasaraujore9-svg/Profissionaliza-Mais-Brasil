import { getPmbMpAccessTokenAsync } from "@/lib/system-settings"

/**
 * Configuracao PMB (vitrine principal — tenantId=null).
 *
 * Students cadastrados via /admin/vendas ficam amarrados a um tenant
 * "placeholder" com slug __pmb__ (necessario porque Student.tenantId e NOT NULL).
 * Enrollments e Payments tem tenantId=null para distinguir das vendas de revendedores.
 *
 * Variaveis de ambiente (legado / fallback):
 * - PMB_MP_ACCESS_TOKEN: Access token MP da conta PMB. Hoje configuravel pelo
 *   admin em /admin/configuracoes; usado como fallback se o DB ainda nao tem.
 * - PMB_PLATAFORMA_VENDEDOR_ID: ID do funcionario na plataforma que representa o time PMB
 * - PMB_PLATAFORMA_POLO: slug do polo na plataforma (default: "pmb")
 */

export const PMB_TENANT_SLUG = "__pmb__"
export const PMB_TENANT_NAME = "Profissionaliza Mais Brasil (Vitrine)"

/**
 * Le do banco (criptografado) com fallback para PMB_MP_ACCESS_TOKEN no env.
 * Use sempre que precisar do valor real do token (criar pagamento/webhook).
 */
export async function pmbMpAccessToken(): Promise<string | null> {
  return getPmbMpAccessTokenAsync()
}

export function pmbPlataformaVendedorId(): string | null {
  return (
    process.env.PMB_PLATAFORMA_VENDEDOR_ID ||
    process.env.PMB_EA_VENDEDOR_ID
  )?.trim() || null
}

export function pmbPlataformaPolo(): string {
  return (
    process.env.PMB_PLATAFORMA_POLO ||
    process.env.PMB_EA_POLO
  )?.trim() || "pmb"
}
