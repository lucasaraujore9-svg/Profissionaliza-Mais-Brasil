/**
 * Configuracao PMB (vitrine principal — tenantId=null).
 *
 * Students cadastrados via /admin/vendas ficam amarrados a um tenant
 * "placeholder" com slug __pmb__ (necessario porque Student.tenantId e NOT NULL).
 * Enrollments e Payments tem tenantId=null para distinguir das vendas de revendedores.
 *
 * Variaveis de ambiente:
 * - PMB_MP_ACCESS_TOKEN: Access token MP da conta PMB (plain, nao criptografado)
 * - PMB_EA_VENDEDOR_ID: ID do funcionario EA que representa o time PMB
 * - PMB_EA_POLO: slug do polo na EA (default: "pmb")
 */

export const PMB_TENANT_SLUG = "__pmb__"
export const PMB_TENANT_NAME = "Profissionaliza Mais Brasil (Vitrine)"

export function pmbMpAccessToken(): string | null {
  return process.env.PMB_MP_ACCESS_TOKEN?.trim() || null
}

export function pmbEaVendedorId(): string | null {
  return process.env.PMB_EA_VENDEDOR_ID?.trim() || null
}

export function pmbEaPolo(): string {
  return process.env.PMB_EA_POLO?.trim() || "pmb"
}
