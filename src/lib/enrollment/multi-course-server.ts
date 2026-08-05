import "server-only"

import { prisma } from "@/lib/prisma"
import { saleItemLabel } from "./multi-course"

/**
 * Venda multi-curso — a parte que toca o BANCO.
 *
 * Separado de `multi-course.ts` porque aquele módulo é importado pelos
 * formulários de venda (componentes client) e um import de `prisma` ali arrasta
 * o client do Prisma para o bundle do browser — o build falha. Aqui o
 * `server-only` torna esse erro impossível de reintroduzir sem aviso.
 */

/**
 * Desfaz uma venda que falhou no meio, apagando a matrícula primária E as
 * satélites que o fulfill já tenha criado.
 *
 * O rollback antigo (`enrollment.delete` na primária) bastava quando toda venda
 * tinha exatamente uma matrícula. Com pacote/multi-curso, o provisionamento pode
 * ter criado satélites ANTES do passo que falhou; a FK é `ON DELETE SET NULL`,
 * então elas sobrevivem ACTIVE com o ponteiro zerado — invisíveis como "compra"
 * e impossíveis de limpar pela tela. Pior: o gate de duplicidade da venda olha
 * TODOS os cursos, então essas órfãs passam a rejeitar com 409 qualquer nova
 * tentativa de vender os mesmos cursos para o mesmo aluno. A venda fica travada
 * até alguém mexer no banco.
 *
 * Ordem: satélites primeiro. Se a segunda query falhar, sobra a primária — que
 * é rastreável e cancelável pela tela — em vez de satélites sem dono.
 */
export async function rollbackSaleEnrollment(
  enrollmentId: string,
): Promise<void> {
  await prisma.enrollment.deleteMany({
    where: { primaryEnrollmentId: enrollmentId },
  })
  await prisma.enrollment.delete({ where: { id: enrollmentId } })
}

/**
 * Rótulo do item para uma cobrança emitida A PARTIR DE UMA MATRÍCULA já criada
 * (checkout da vitrine e da loja, onde só temos o curso primário carregado e os
 * ids dos extras).
 *
 * A venda direta monta esse rótulo com `saleItemLabel` no ato da venda, mas o
 * boleto/PIX/cartão do checkout é emitido depois, noutra rota — e lá a descrição
 * saía com o nome de UM curso para uma cobrança que soma vários. É a linha que o
 * aluno lê no extrato do banco: precisa bater com o que ele viu na tela.
 *
 * Sem cursos extras não consulta o banco — o caminho de curso avulso (a imensa
 * maioria das cobranças) continua com o mesmo custo de antes.
 */
export async function descreverItemCobranca(
  primaryCourseName: string,
  bundleCourseIds: readonly string[],
): Promise<string> {
  if (bundleCourseIds.length === 0) return primaryCourseName

  const extras = await prisma.course.findMany({
    where: { id: { in: [...bundleCourseIds] } },
    select: { id: true, nome: true },
  })
  // Ordem de `bundleCourseIds` (a que o vendedor escolheu), não a do banco.
  const byId = new Map(extras.map((c) => [c.id, c.nome]))
  const nomes = [
    primaryCourseName,
    ...bundleCourseIds.map((id) => byId.get(id)).filter((n): n is string => !!n),
  ]
  return saleItemLabel(nomes)
}
