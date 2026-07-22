import { prisma } from "@/lib/prisma"
import { decryptTenantAsaasKey, motherAsaasKey } from "@/lib/asaas/client"
import { decryptTenantMpToken } from "@/lib/mercadopago/client"
import { pmbMpAccessToken } from "@/lib/pmb-config"

/**
 * Credenciais do gateway que ATENDEM uma matrícula.
 *
 * Regra inegociável de isolamento financeiro: a cobrança de uma venda de revenda
 * vive na conta MP/Asaas da PRÓPRIA unidade. Operar nela com a chave da conta-mãe
 * (PMB) devolve 404 — a cobrança do aluno continuaria viva e o cancelamento
 * mentiria que deu certo. Sempre resolva a chave a partir do `tenantId` da
 * matrícula, nunca do contexto de quem está logado.
 *
 * Espelha a resolução já feita em `src/lib/mercadopago/process.ts` (reconciliação)
 * e `src/lib/installments/plan.ts` (emissão de carnê).
 */
export interface EnrollmentGatewayKeys {
  /** Chave Asaas da conta que emitiu a cobrança. */
  asaasApiKey?: string
  /** Access token MP da conta que emitiu a cobrança. */
  mpAccessToken?: string
  /** Motivo pelo qual a credencial do gateway da matrícula não pôde ser obtida. */
  missing?: string
}

export async function resolveEnrollmentGatewayKeys(enrollment: {
  tenantId: string | null
}): Promise<EnrollmentGatewayKeys> {
  // Vitrine PMB (tenantId = null): conta-mãe.
  if (enrollment.tenantId === null) {
    const keys: EnrollmentGatewayKeys = {}
    try {
      keys.asaasApiKey = motherAsaasKey()
    } catch {
      keys.missing = "conta Asaas da PMB não configurada"
    }
    const mpToken = await pmbMpAccessToken()
    if (mpToken) {
      keys.mpAccessToken = mpToken
    } else if (!keys.missing) {
      keys.missing = "token Mercado Pago da PMB não configurado"
    }
    return keys
  }

  // Venda de revenda: conta da unidade.
  const tenant = await prisma.tenant.findUnique({
    where: { id: enrollment.tenantId },
    select: { asaasApiKey: true, mpAccessToken: true },
  })
  if (!tenant) return { missing: "unidade não encontrada" }

  const keys: EnrollmentGatewayKeys = {}
  if (tenant.asaasApiKey) {
    keys.asaasApiKey = decryptTenantAsaasKey(tenant.asaasApiKey)
  }
  if (tenant.mpAccessToken) {
    keys.mpAccessToken = decryptTenantMpToken(tenant.mpAccessToken)
  }
  if (!keys.asaasApiKey && !keys.mpAccessToken) {
    keys.missing = "unidade sem gateway conectado"
  }
  return keys
}
