import { NextResponse } from "next/server"
import type { SplitSnapshot } from "./split"
import {
  AUTHORED_COURSE_SELECT,
  resolveSaleSplit,
  saleRequiresSplit,
  type AuthoredCourseSource,
} from "./split-server"
import { canSellAuthoredCourse } from "./wallet"

export { AUTHORED_COURSE_SELECT }
export type { AuthoredCourseSource }

/**
 * GATE ÚNICO das oito portas de venda.
 *
 * Toda rota que cria cobrança passa por aqui antes de escolher gateway e
 * montar a cobrança. Existe como função única por causa do `GUARDIAN_REQUIRED`:
 * aquela regra nasceu só em `/api/painel/vendas` e as outras duas portas
 * continuaram cobrando no CPF do menor por meses. Um gate que mora numa rota
 * não é um gate.
 *
 * O que ele decide:
 *   1. esta venda envolve curso de autoria de OUTRA unidade?
 *   2. se sim, o gateway é forçado para ASAAS (split só existe lá) e a unidade
 *      precisa estar com a conta conectada;
 *   3. monta o rateio congelado que vai para `Enrollment.authorSplitSnapshot`.
 *
 * O `forcedGateway` é uma ORDEM, não uma sugestão: quem chama tem que rotear a
 * cobrança por ele. Gravá-lo na matrícula e continuar montando a cobrança pelo
 * gateway configurado da loja vende o curso pelo MP, que não tem rateio nenhum.
 */

export interface SellerGatewayState {
  asaasConnected: boolean
  asaasWebhookToken: string | null
}

export interface AuthoredSaleGateInput {
  /** TODOS os cursos da venda (curso avulso, pacote ou venda multi-curso). */
  courses: AuthoredCourseSource[]
  /** null = a PMB é a vendedora (vitrine principal). */
  sellerTenantId: string | null
  /** Estado do gateway da vendedora. null quando quem vende é a PMB. */
  seller: SellerGatewayState | null
  /** Preço de tabela cobrado nesta venda (antes do desconto). */
  listPrice: number
  discount?: number
  /**
   * A venda NÃO gera cobrança (bolsa de estudo, liberação sem valor).
   *
   * Sem cobrança não há rateio: liberar o acesso daria de graça o produto de
   * outra unidade e o produtor não teria nem registro disso. O resto do gate não
   * pega esse caso — ele olha gateway, carteira e preço, e uma concessão
   * gratuita passa por todos os três.
   */
  freeGrant?: boolean
}

export type AuthoredSaleGateResult =
  | {
      ok: true
      /** null = venda comum, sem rateio. */
      split: SplitSnapshot | null
      /** "ASAAS" quando o rateio obriga o gateway; null = usa o gateway normal. */
      forcedGateway: "ASAAS" | null
    }
  | { ok: false; response: NextResponse }

function deny(status: number, error: string, code: string): AuthoredSaleGateResult {
  return { ok: false, response: NextResponse.json({ error, code }, { status }) }
}

export async function authoredSaleGate(
  input: AuthoredSaleGateInput,
): Promise<AuthoredSaleGateResult> {
  // ── Curso que a plataforma de aulas nao consegue matricular ──────────────
  //
  // Antes de qualquer coisa, e independente de rateio: sem o identificador da
  // fornecedora (`plataformaCourseId` na legada, `lmsCourseId` na propria) o
  // provisionamento morre no FIM do fluxo, com o aluno ja cobrado, e a mensagem
  // que sobra ("tente novamente") e um conselho que nunca funciona — repetir nao
  // inventa o id que falta.
  //
  // O caso real: a fornecedora renomeou o curso 267, o sync criou uma linha nova
  // sem id e ela foi parar em 18 vitrines. `COURSE_PROVISIONABLE` tira essas
  // linhas das listagens; este gate cobre o acesso por ID direto, que e como as
  // rotas de venda carregam o curso.
  const semFornecedora = input.courses.find((c) =>
    c.provider === "LMS" ? !c.lmsCourseId : !c.plataformaCourseId,
  )
  if (semFornecedora) {
    return deny(
      409,
      `O curso "${semFornecedora.nome}" está sem vínculo com a plataforma de aulas e não pode ser matriculado. Avise o suporte da PMB — vender agora cobraria o aluno sem liberar o acesso.`,
      "COURSE_NOT_PROVISIONABLE",
    )
  }

  const needSplit = input.courses.filter((c) =>
    saleRequiresSplit(c, input.sellerTenantId),
  )

  if (needSplit.length === 0) return { ok: true, split: null, forcedGateway: null }

  // Concessão gratuita de curso de terceiro: sempre recusa. Ver `freeGrant`.
  if (input.freeGrant) {
    return deny(
      400,
      "Cursos produzidos por outra unidade não podem ser concedidos sem cobrança.",
      "AUTHORED_COURSE_NO_FREE_GRANT",
    )
  }

  // Limite deliberado da v1: curso de autoria de terceiro VENDE SOZINHO.
  // O split é da cobrança INTEIRA — num carrinho misto o percentual do produtor
  // atingiria também o curso da PMB, e ele receberia por um produto que não é
  // dele. Mesma trava que "curso mensal só é vendido sozinho".
  if (needSplit.length > 1 || input.courses.length > 1) {
    return deny(
      400,
      "Cursos produzidos por outra unidade precisam ser comprados separadamente.",
      "AUTHORED_COURSE_ALONE",
    )
  }

  // Split só existe no Asaas: o gateway da unidade é ignorado aqui de propósito.
  // Cair no MP silenciosamente venderia o curso SEM repasse nenhum ao produtor —
  // o dinheiro ficaria inteiro com quem vendeu e ninguém perceberia.
  if (input.sellerTenantId !== null) {
    const seller = input.seller
    // `canSellAuthoredCourse` é a fonte única desta regra (wallet.ts). Estava
    // reimplementada inline aqui: as duas metades podiam divergir em silêncio.
    if (!seller || !canSellAuthoredCourse(seller)) {
      return deny(
        503,
        "Esta loja precisa da conta Asaas conectada para vender cursos de outras unidades.",
        "SPLIT_GATEWAY_REQUIRED",
      )
    }
  }

  const resolved = await resolveSaleSplit({
    course: needSplit[0],
    sellerTenantId: input.sellerTenantId,
    listPrice: input.listPrice,
    discount: input.discount,
  })

  if (!resolved.ok) {
    // Erro de carteira é de CONFIGURAÇÃO (503, tentar de novo não resolve);
    // erro de preço/termos é do pedido (400).
    const isConfig =
      resolved.error === "PRODUCER_WALLET_MISSING" ||
      resolved.error === "PLATFORM_WALLET_MISSING"
    return deny(isConfig ? 503 : 400, resolved.message, resolved.error)
  }

  return { ok: true, split: resolved.value, forcedGateway: "ASAAS" }
}
