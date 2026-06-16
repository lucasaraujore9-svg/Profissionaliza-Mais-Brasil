/**
 * Helpers para a rota interna de redirecionamento `/eja/ir`.
 *
 * Espelha `tecnica-redirect.ts`: em vez de mandar o usuário direto para o
 * destino externo de EJA, passamos por uma tela de loading institucional
 * ("EJA Mais Brasil") com copy + transição suave. A URL externa viaja como
 * query param `u` (encodeada) e a validação anti-open-redirect roda no server
 * component da página, comparando contra o `ejaUrl` do escopo resolvido.
 */

const REDIRECT_PATH = "/eja/ir"
const FALLBACK = "/"

/**
 * Monta o href interno para a tela de loading do EJA.
 * - `externalUrl` vazio → fallback para a home (não há para onde ir).
 */
export function ejaRedirectHref(
  externalUrl: string | null | undefined,
): string {
  if (!externalUrl) return FALLBACK
  const params = new URLSearchParams({ u: externalUrl })
  return `${REDIRECT_PATH}?${params.toString()}`
}

/**
 * Valida que `candidate` está na lista de URLs permitidas (defense-in-depth
 * contra open redirect). Allowlist é o `ejaUrl` do escopo (PMB ou unidade).
 */
export function isAllowedEjaUrl(candidate: string, allowed: string[]): boolean {
  if (!candidate) return false
  if (allowed.includes(candidate)) return true
  // Permite também quando o candidate compartilha o mesmo origin de algum
  // allowed (evita bypass via path comparando por origin).
  try {
    const u = new URL(candidate)
    for (const allow of allowed) {
      try {
        const a = new URL(allow)
        if (a.origin === u.origin) return true
      } catch {
        // ignore allowed inválido
      }
    }
  } catch {
    return false
  }
  return false
}
