/**
 * Regra de roteamento da vitrine multi-tenant: quais caminhos, num subdomínio
 * de revenda, devem ser reescritos para `/loja/*` (em vez de cair nas rotas do
 * site principal PMB).
 *
 * Mantida fora do proxy (Edge) para ser testável de forma isolada. É lógica
 * pura de string, sem dependências de `next/server`.
 */

// Rotas que devem ser reescritas para /loja em subdomínios de tenant.
// Tudo fora dessa lista (ex: /admin, /painel, /login, /sobre) passa direto e
// usa as rotas do site principal.
//
// "/pacote" (detalhe de combo, singular) é servido pela vitrine da revenda em
// /loja/pacote/:slug. A home da revenda gera links para /pacote/:slug; sem o
// prefixo aqui, a URL cairia no site principal (que só tem /pacotes, plural) e
// daria 404 ao abrir um combo.
export const VITRINE_PATH_PREFIXES = [
  "/curso",
  "/pacote",
  "/checkout",
  "/confirmacao",
  "/contato",
  "/pagar",
]

export function isVitrinePath(pathname: string): boolean {
  if (pathname === "/") return true
  // "/cursos" (catalogo "todos os cursos") é servido pela vitrine (/loja/cursos),
  // com cabeçalho/rodapé e catálogo/preços da unidade. O detalhe continua em
  // "/curso/:slug" (singular, já coberto por VITRINE_PATH_PREFIXES); por isso
  // casamos "/cursos" exato e NÃO o prefixo "/cursos/" (evita 404 em /loja/cursos/x).
  if (pathname === "/cursos") return true
  return VITRINE_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}
