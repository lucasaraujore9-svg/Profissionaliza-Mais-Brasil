import { prisma } from "@/lib/prisma"
import { forbiddenNameError } from "@/lib/tenant/forbidden-names"

/**
 * Validacao e disponibilidade de subdominio (slug) de revenda.
 *
 * Centraliza o que antes vivia inline na rota de criacao
 * (src/app/api/admin/revendedores/route.ts) para ser reusado tambem na edicao
 * do subdominio (.../[id]/slug). Mantem uma unica fonte de verdade para regex,
 * lista de reservados, marcas proibidas e a reserva de 15 dias pos-rename.
 */

// Subdominio: comeca/termina em [a-z0-9], permite hifen no meio. 3-32 chars.
export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/

// Subdominios reservados na vitrine (livrecursos.com.br) — espelha
// RESERVED_SUBDOMAINS do proxy.ts. __pmb__ e o tenant placeholder da vitrine PMB.
export const RESERVED_SLUGS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "painel",
  "loja",
  "mail",
  "smtp",
  "ftp",
  "cdn",
  "assets",
  "static",
  "staging",
  "dev",
  "test",
  "__pmb__",
])

/**
 * Valida o FORMATO do slug (sem tocar no banco). Retorna a mensagem de erro
 * pronta ou `null` quando ok. Aplica: tamanho, regex, reservados e marcas
 * proibidas (forbiddenNameError).
 */
export function validateSlugFormat(slug: string): string | null {
  const value = slug.trim().toLowerCase()
  if (value.length < 3 || value.length > 32) {
    return "O subdomínio deve ter entre 3 e 32 caracteres"
  }
  if (!SLUG_REGEX.test(value)) {
    return "Use apenas letras minúsculas, números e hífen"
  }
  if (RESERVED_SLUGS.has(value)) {
    return "Este subdomínio é reservado, escolha outro"
  }
  const forbidden = forbiddenNameError(value)
  if (forbidden) return forbidden
  return null
}

export interface SlugAvailability {
  available: boolean
  /** Mensagem de erro quando `available` for false. */
  reason?: string
}

/**
 * Verifica se o slug esta livre para ser usado/atribuido. Indisponivel quando:
 *  - ja existe um tenant com esse slug (exceto `excludeTenantId`); ou
 *  - existe uma reserva NAO expirada (TenantSlugRedirect) apontando para OUTRA
 *    unidade — o slug antigo de outra revenda fica bloqueado por 15 dias.
 *
 * A propria reserva da unidade (`excludeTenantId`) nao bloqueia: permite que ela
 * reivindique de volta um subdominio antigo dela mesma dentro da janela.
 */
export async function isSlugAvailable(
  slug: string,
  excludeTenantId?: string,
): Promise<SlugAvailability> {
  const value = slug.trim().toLowerCase()

  const existing = await prisma.tenant.findFirst({
    where: { slug: value },
    select: { id: true },
  })
  if (existing && existing.id !== excludeTenantId) {
    return { available: false, reason: `Já existe uma revenda com o subdomínio "${value}"` }
  }

  const reservation = await prisma.tenantSlugRedirect.findFirst({
    where: { oldSlug: value, expiresAt: { gt: new Date() } },
    select: { tenantId: true },
  })
  if (reservation && reservation.tenantId !== excludeTenantId) {
    return {
      available: false,
      reason: `O subdomínio "${value}" foi usado recentemente por outra revenda e está reservado por 15 dias`,
    }
  }

  return { available: true }
}

/**
 * Polo enviado a plataforma parceira. Usa `poloName` (identidade fixa do polo)
 * com fallback para `slug`. Manter estavel evita orfanar alunos ja matriculados
 * quando o subdominio da unidade e renomeado.
 */
export function tenantPolo(tenant: { poloName?: string | null; slug: string }): string {
  return tenant.poloName ?? tenant.slug
}

/** Janela de reserva/redirect do subdominio antigo apos um rename. */
export const SLUG_REDIRECT_DAYS = 15
