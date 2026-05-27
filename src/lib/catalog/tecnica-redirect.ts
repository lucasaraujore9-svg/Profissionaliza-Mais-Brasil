/**
 * Helpers para a rota interna de redirecionamento `/cursos-tecnicos/ir`.
 *
 * Em vez de mandar o usuário direto para o domínio da Escola Técnica
 * parceira, passamos por uma página intermediária com loading + copy
 * institucional. Isso dá:
 *  - Transição suave (não parece que o site travou).
 *  - Oportunidade de comunicar quem é a parceira e qual é a proposta.
 *  - Centralização da telemetria de cliques no futuro.
 *
 * O destino externo viaja como query param `u` (URL absoluta, encodeada)
 * e o nome amigável vai em `n`. A validação anti-open-redirect roda no
 * server component da página `/cursos-tecnicos/ir`, comparando contra a
 * whitelist de URLs em `tecnica.url` + `tecnica.courses[].url`.
 */

const REDIRECT_PATH = "/cursos-tecnicos/ir"
const FALLBACK = "/"

/**
 * Monta o href interno para a tela de loading da Unidade Técnica.
 * - `externalUrl` vazio → fallback para a home (não há para onde ir).
 * - `courseName` opcional → omitido se a UI quer redirect genérico
 *   (ex: botão "Conhecer todos" usando a URL base da escola).
 */
export function tecnicaRedirectHref(
  courseName: string | null | undefined,
  externalUrl: string | null | undefined,
): string {
  if (!externalUrl) return FALLBACK
  const params = new URLSearchParams({ u: externalUrl })
  if (courseName) params.set("n", courseName)
  return `${REDIRECT_PATH}?${params.toString()}`
}

/**
 * Valida que `candidate` está na lista de URLs permitidas (defense-in-depth
 * contra open redirect). Allowlist é a `tecnica.url` global + URLs dos
 * cursos cadastrados.
 */
export function isAllowedTecnicaUrl(
  candidate: string,
  allowed: string[],
): boolean {
  if (!candidate) return false
  // Whitelist exata por valor (já é normalizado no parser).
  if (allowed.includes(candidate)) return true
  // Permitir também se o candidate é exatamente o origin/path-prefix de
  // alguma URL allowed (útil quando o course.url está vazio e cai no
  // fallback). Comparamos por origin pra evitar bypass via path.
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
