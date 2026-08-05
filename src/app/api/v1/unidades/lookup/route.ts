import { resolverDaQuery } from "@/lib/api-parceiros/identificador"
import { atenderLookup } from "@/lib/api-parceiros/atender-lookup"
import { withRequestContext } from "@/lib/observability/with-request-context"

/**
 * GET /api/v1/unidades/lookup
 *
 * Dado um identificador ÚNICO, devolve a unidade (revenda) correspondente.
 * É o endpoint que o sistema parceiro chama sempre que precisa saber "de quem
 * é essa pessoa" e com quais dados/branding responder.
 *
 * Identificadores aceitos (exatamente UM por requisição):
 *   ?email=      e-mail do titular da unidade
 *   ?cpf=        CPF do titular (com ou sem máscara)
 *   ?telefone=   telefone do titular
 *   ?id=         id da unidade
 *   ?slug=       slug/subdomínio da vitrine
 *   ?dominio=    domínio próprio (aceita URL completa ou com www)
 *   ?codigo=     código de indicação
 *   ?q=          valor solto — a API deduz o tipo (conveniência)
 *
 * Auth: `Authorization: Bearer <chave>` ou `X-API-Key: <chave>`, escopo
 * `unidades.read`. Contrato completo em docs/api/parceiros-v1.md.
 */

export const dynamic = "force-dynamic"

export const GET = withRequestContext(
  { action: "api.v1.unidades.lookup", route: "/api/v1/unidades/lookup" },
  (request: Request) =>
    atenderLookup(request, () =>
      resolverDaQuery(new URL(request.url).searchParams),
    ),
)
