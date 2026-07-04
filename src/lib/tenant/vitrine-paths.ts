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

/**
 * Resolve o caminho público de uma rota da vitrine a partir do contexto do host,
 * detectado pelo `pathname` atual do browser. É a contraparte client-side do
 * rewrite do proxy: a MESMA vitrine é servida em dois contextos com prefixos
 * diferentes na URL.
 *
 * - **Host de vitrine** ({slug}.livrecursos.com.br / domínio custom): o proxy
 *   reescreve `/x` → `/loja/x` de forma transparente, então o browser mostra a
 *   URL SEM `/loja` (ex.: `/checkout`). A rota-alvo deve ficar SEM o prefixo
 *   (`/confirmacao`) para não vazar a nomenclatura interna `/loja`.
 * - **Host PMB** (profissionalizamaisbrasil.com.br): a vitrine é servida DIRETO
 *   em `/loja/*` (sem rewrite), então o browser mostra `/loja/checkout` e a
 *   rota-alvo precisa do prefixo `/loja` (`/loja/confirmacao`), senão daria 404.
 *
 * @param currentPathname `window.location.pathname` no momento da navegação.
 * @param vitrinePath rota da vitrine SEM o prefixo `/loja` (ex.: `/confirmacao`).
 */
export function storePath(currentPathname: string, vitrinePath: string): string {
  const underLoja =
    currentPathname === "/loja" || currentPathname.startsWith("/loja/")
  return underLoja ? `/loja${vitrinePath}` : vitrinePath
}
