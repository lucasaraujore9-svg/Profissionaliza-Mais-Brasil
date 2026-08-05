import { adivinhar } from "@/lib/api-parceiros/identificador"
import { atenderLookup } from "@/lib/api-parceiros/atender-lookup"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

/**
 * GET /api/v1/unidades/{identificador}
 *
 * Atalho REST do `/unidades/lookup`: o identificador vem no path e o tipo é
 * deduzido (mesma dedução do `?q=`). Serve para os casos em que o parceiro já
 * tem o slug ou o id na mão:
 *
 *   GET /api/v1/unidades/cursos-do-joao
 *   GET /api/v1/unidades/clg8x2k9p0001abcdefghijk
 *   GET /api/v1/unidades/joao%40exemplo.com.br
 *
 * Quando o tipo importar (CPF x telefone, ambos com 11 dígitos), use o
 * `/lookup` com o campo nomeado — a dedução aqui é conveniência, não contrato.
 *
 * `/unidades/lookup` tem precedência de rota estática sobre este segmento
 * dinâmico: uma unidade cujo slug fosse literalmente "lookup" não é alcançável
 * por aqui (use `?slug=lookup` no /lookup).
 */

export const dynamic = "force-dynamic"

export const GET = withRequestContextParams<{ identificador: string }>(
  { action: "api.v1.unidades.get", route: "/api/v1/unidades/[identificador]" },
  async (request, ctx) => {
    // O Next já entrega o segmento decodificado (`joao%40exemplo.com.br` chega
    // como `joao@exemplo.com.br`). Decodificar de novo não só é redundante:
    // um `%` literal no valor faz `decodeURIComponent` lançar `URIError`, e
    // aqui isso seria FORA do try/catch do `atenderLookup` — o parceiro
    // receberia um 500 cru em vez do envelope de erro do contrato.
    const { identificador } = await ctx.params
    return atenderLookup(request, () => adivinhar(identificador ?? ""))
  },
)
