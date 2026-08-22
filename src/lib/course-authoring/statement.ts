import { prisma } from "@/lib/prisma"

/**
 * EXTRATO DE RATEIO de uma unidade.
 *
 * Existe porque `Payment.amount` deixou de ser a receita de quem vendeu.
 * Numa venda de curso de outra unidade a loja recebe o BRUTO na conta dela e o
 * Asaas debita as fatias do produtor e da PMB na liquidacao — quem lesse so o
 * card "Recebido" acharia que ficou com tudo.
 *
 * Sao tres numeros e cada um responde a uma pergunta diferente:
 *   repasseEnviado   — saiu da minha conta para produtores (curso de terceiro)
 *   comissaoRecebida — entrou na minha conta por vender curso de terceiro
 *   repasseRecebido  — entrou na minha conta por cursos QUE EU PRODUZO,
 *                      vendidos por outras lojas
 */

export interface SplitStatement {
  repasseEnviado: number
  comissaoRecebida: number
  repasseRecebido: number
  taxaPlataforma: number
  /** Quanto ainda nao foi liquidado pelo Asaas (status PENDING/AWAITING_CREDIT). */
  aguardandoLiquidacao: number
}

const SETTLED = ["DONE", "RETAINED"] as const
const PENDING = ["PENDING", "AWAITING_CREDIT"] as const

export async function loadSplitStatement(
  tenantId: string,
  range: { gte?: Date; lte?: Date } = {},
): Promise<SplitStatement> {
  const period = range.gte || range.lte ? { createdAt: range } : {}

  const [enviado, comissao, recebido, taxa, aguardando] = await Promise.all([
    // Repasse que SAIU: linhas de PRODUTOR de pagamentos que entraram nesta loja.
    prisma.courseSaleSplit.aggregate({
      _sum: { amount: true },
      where: {
        role: "PRODUCER",
        status: { in: [...SETTLED, ...PENDING] },
        payment: { tenantId },
        ...period,
      },
    }),
    // Comissao que FICOU: a linha de vendedor e sempre retida na conta emissora.
    prisma.courseSaleSplit.aggregate({
      _sum: { amount: true },
      where: {
        role: "SELLER",
        beneficiaryTenantId: tenantId,
        status: { in: [...SETTLED, ...PENDING] },
        ...period,
      },
    }),
    // Repasse que ENTROU: cursos que esta unidade produz, vendidos por outras.
    prisma.courseSaleSplit.aggregate({
      _sum: { amount: true },
      where: {
        role: "PRODUCER",
        beneficiaryTenantId: tenantId,
        status: { in: [...SETTLED, ...PENDING] },
        ...period,
      },
    }),
    // Taxa da plataforma debitada das vendas desta loja.
    prisma.courseSaleSplit.aggregate({
      _sum: { amount: true },
      where: {
        role: "PLATFORM",
        status: { in: [...SETTLED, ...PENDING] },
        payment: { tenantId },
        ...period,
      },
    }),
    prisma.courseSaleSplit.aggregate({
      _sum: { amount: true },
      where: {
        role: "PRODUCER",
        beneficiaryTenantId: tenantId,
        status: { in: [...PENDING] },
        ...period,
      },
    }),
  ])

  return {
    repasseEnviado: Number(enviado._sum.amount ?? 0),
    comissaoRecebida: Number(comissao._sum.amount ?? 0),
    repasseRecebido: Number(recebido._sum.amount ?? 0),
    taxaPlataforma: Number(taxa._sum.amount ?? 0),
    aguardandoLiquidacao: Number(aguardando._sum.amount ?? 0),
  }
}
