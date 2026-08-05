import { authenticateApiKey } from "@/lib/api-parceiros/keys"
import { apiOk } from "@/lib/api-parceiros/response"
import { withRequestContext } from "@/lib/observability/with-request-context"

/**
 * GET /api/v1/ping
 *
 * Verificação de credencial: o parceiro confirma que a chave chegou correta e
 * descobre quais escopos ela carrega, sem precisar acertar um identificador
 * real antes. Não exige escopo — qualquer chave ativa responde.
 *
 * Existe para separar "minha chave está errada" de "esse CPF não existe" na
 * hora de depurar a integração — sem isso, os dois casos viram 4xx genérico.
 */

export const dynamic = "force-dynamic"

export const GET = withRequestContext(
  { action: "api.v1.ping", route: "/api/v1/ping" },
  async (request: Request) => {
    const auth = await authenticateApiKey(request)
    if (!auth.ok) return auth.response

    return apiOk({
      autenticado: true,
      chave: { nome: auth.key.name, prefixo: auth.key.prefix },
      escopos: auth.key.scopes,
      versao: "v1",
    })
  },
)
