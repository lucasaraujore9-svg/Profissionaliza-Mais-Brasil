import { randomBytes } from "node:crypto"
import { prisma } from "@/lib/prisma"

/**
 * Gera 7 chars hex maiusculos (ex: "7K3X9A2"). 32 bits de entropia,
 * coliso muito improvavel mesmo com 100k certificados.
 */
function randomSuffix(): string {
  return randomBytes(4).toString("hex").slice(0, 7).toUpperCase()
}

/**
 * Sanitiza o slug do tenant para uso em codigo de certificado.
 * Aceita apenas [A-Z0-9-], trunca em 12 chars.
 */
function sanitizePrefix(slug: string): string {
  return slug
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 12)
}

/**
 * Gera um codigo de certificado unico. Garante unicidade consultando o banco.
 *
 * Formato:
 *   - Vitrine PMB (tenantSlug nulo): PMB-XXXXXXX
 *   - Tenant: {SLUG}-XXXXXXX
 */
export async function generateCertificateCode(
  tenantSlug: string | null,
): Promise<string> {
  const prefix = tenantSlug ? sanitizePrefix(tenantSlug) : "PMB"
  const cleanPrefix = prefix || "PMB"

  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = `${cleanPrefix}-${randomSuffix()}`
    const existing = await prisma.certificate.findUnique({
      where: { code: candidate },
      select: { id: true },
    })
    if (!existing) return candidate
  }
  // Praticamente inalcancavel — fallback com mais entropia
  const longSuffix = randomBytes(8).toString("hex").toUpperCase()
  return `${cleanPrefix}-${longSuffix}`
}
