import { randomBytes } from "node:crypto"
import { prisma } from "@/lib/prisma"

/**
 * Gera um codigo de indicacao no formato `{slug}-{4chars}` em maiusculas.
 * Exemplo: para slug "joao" → "JOAO-7K3X".
 * Tenta ate 5 vezes em caso de colisao (very unlikely).
 */
export async function generateUniqueReferralCode(slug: string): Promise<string> {
  const base = slug
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 20) || "PMB"

  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = randomBytes(3)
      .toString("base64")
      .replace(/[^A-Z0-9]/gi, "")
      .toUpperCase()
      .slice(0, 4)
      .padEnd(4, "X")
    const candidate = `${base}-${suffix}`
    const existing = await prisma.tenant.findUnique({
      where: { referralCode: candidate },
      select: { id: true },
    })
    if (!existing) return candidate
  }
  // Fallback extremamente improvavel
  return `${base}-${Date.now().toString(36).toUpperCase().slice(-4)}`
}

/**
 * Garante que o tenant possui referralCode. Idempotente.
 * Util para tenants criados antes do feature de indicacao.
 */
export async function ensureReferralCode(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, referralCode: true },
  })
  if (!tenant) {
    throw new Error(`Tenant ${tenantId} nao encontrado`)
  }
  if (tenant.referralCode) return tenant.referralCode

  const code = await generateUniqueReferralCode(tenant.slug)
  try {
    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: { referralCode: code },
      select: { referralCode: true },
    })
    return updated.referralCode
  } catch (err) {
    // Race condition: pode ter sido criado em outra request — releitura
    const reread = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { referralCode: true },
    })
    if (reread?.referralCode) return reread.referralCode
    throw err
  }
}
