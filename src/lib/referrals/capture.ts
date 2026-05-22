import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"

export const REFERRAL_COOKIE = "pmb_referral"
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 dias

export interface ValidatedReferral {
  tenantId: string
  tenantName: string
  referralCode: string
}

/**
 * Valida um codigo de indicacao. Retorna o tenant correspondente ou null.
 */
export async function validateReferralCode(
  code: string,
): Promise<ValidatedReferral | null> {
  const normalized = code.trim().toUpperCase()
  if (!normalized || normalized.length < 3) return null

  const tenant = await prisma.tenant.findUnique({
    where: { referralCode: normalized },
    select: { id: true, name: true, referralCode: true, status: true },
  })
  if (!tenant) return null
  // Permite indicar mesmo em PENDING (revendedor pode espalhar codigo antes de pagar a 1a mensalidade)
  if (tenant.status === "CANCELLED") return null
  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    referralCode: tenant.referralCode,
  }
}

/**
 * Le o cookie `pmb_referral` e resolve para um tenantId valido (ou null).
 * Usado na criacao do tenant para popular `referrerTenantId`.
 *
 * Safety:
 *  - cookie ausente ou invalido → null (sem erro)
 *  - referralCode aponta para tenant inexistente → null
 *  - referralCode aponta para tenant cancelado → null
 */
export async function resolveReferrerFromCookie(): Promise<string | null> {
  try {
    const store = await cookies()
    const value = store.get(REFERRAL_COOKIE)?.value
    if (!value) return null
    const validated = await validateReferralCode(value)
    return validated?.tenantId ?? null
  } catch {
    return null
  }
}
