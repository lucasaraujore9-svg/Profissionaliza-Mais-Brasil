import { autenticarParceiro } from "./gate"
import { TIPOS_IDENTIFICADOR, type ResolucaoIdentificador } from "./identificador"
import { buscarUnidade } from "./lookup"
import { apiOk, apiFail } from "./response"
import { contextLogger } from "@/lib/logger"

/**
 * Miolo compartilhado das rotas de consulta de unidade: autentica a chave,
 * aplica o rate-limit, resolve o identificador e responde.
 *
 * Existe para que `/unidades/lookup` (por query) e `/unidades/{identificador}`
 * (por path) não tenham duas cópias da mesma sequência — foi assim que os
 * guards antigos do /admin divergiram entre si.
 *
 * `resolver` é uma função e não um valor pronto porque ela só deve rodar DEPOIS
 * da autenticação: parsear entrada de quem não se identificou é trabalho de
 * graça e superfície de abuso.
 */
export async function atenderLookup(
  request: Request,
  resolver: () => ResolucaoIdentificador,
): Promise<Response> {
  const auth = await autenticarParceiro(request, "unidades.read", 120)
  if (!auth.ok) return auth.response

  const resolucao = resolver()

  if (!resolucao.ok) {
    if (resolucao.motivo === "ausente") {
      return apiFail(
        `Informe um identificador. Aceitos: ${TIPOS_IDENTIFICADOR.join(", ")} ou q.`,
        { status: 400, code: "MISSING_IDENTIFIER" },
      )
    }
    if (resolucao.motivo === "ambiguo") {
      return apiFail("Informe apenas UM identificador por requisição.", {
        status: 400,
        code: "MISSING_IDENTIFIER",
      })
    }
    return apiFail(
      `Identificador inválido${resolucao.campo ? ` no campo "${resolucao.campo}"` : ""}.`,
      { status: 400, code: "INVALID_IDENTIFIER" },
    )
  }

  const { identificador } = resolucao

  try {
    const resultado = await buscarUnidade(identificador)

    if (resultado.tipo === "multiplos") {
      return apiFail(
        identificador.tipo === "telefone"
          ? "Mais de uma unidade tem esse telefone. Consulte por e-mail, CPF ou slug."
          : "Esse valor identifica mais de uma unidade. Consulte pelo campo específico (slug, id ou codigo) em vez de q.",
        {
          status: 409,
          code: "MULTIPLE_MATCHES",
          details: { quantidade: resultado.quantidade },
        },
      )
    }

    if (resultado.tipo === "nao_encontrado") {
      return apiFail("Nenhuma unidade encontrada para este identificador.", {
        status: 404,
        code: "NOT_FOUND",
        details: { tipo: identificador.tipo },
      })
    }

    return apiOk({
      // Eco do que foi usado na busca: com `?q=` (ou pelo path) o parceiro não
      // sabe de antemão como a API classificou o valor. `tipo` é a leitura que
      // de fato casou, não o palpite inicial.
      encontradoPor: {
        tipo: resultado.via,
        valor: identificador.original,
      },
      unidade: resultado.unidade,
    })
  } catch (error) {
    contextLogger().error(
      {
        err: error,
        event: "api.v1.unidades.lookup.failed",
        apiKeyPrefix: auth.key.prefix,
        tipo: identificador.tipo,
      },
      "lookup de unidade falhou",
    )
    return apiFail("Erro interno ao consultar a unidade.", {
      status: 500,
      code: "INTERNAL_ERROR",
    })
  }
}
