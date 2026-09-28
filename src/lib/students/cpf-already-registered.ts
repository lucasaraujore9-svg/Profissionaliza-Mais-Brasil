import { prisma } from "@/lib/prisma"
import { stripCpf } from "@/lib/validation/cpf"

/**
 * Gate de CPF do checkout de convidado.
 *
 * Indica se o CPF já pertence a um aluno que é CLIENTE naquela vitrine: tem
 * login no `/aluno` (`passwordHash`) E já recebeu acesso a algo pelo menos uma
 * vez (matrícula liberada, assinatura que começou ou certificado). É esse que
 * deve logar para comprar de novo.
 *
 * Por que não basta `passwordHash`: os checkouts chamam
 * `provisionStudentAccess` ANTES de cobrar (para o aluno acompanhar a cobrança
 * no painel), então a senha nasce na 1ª tentativa. Se o gateway recusa — preço
 * abaixo do mínimo, cartão negado, gateway fora —, o aluno fica com senha e
 * nenhuma compra, e a 2ª tentativa caía em "faça login" com uma senha que ele
 * talvez nem recebeu. Foi o caso da Capacita Pró Brasil em 2026-09-25.
 *
 * Por que o gate existe: `upsertStudent` casa por CPF e REGRAVA o e-mail.
 * Sem ele, qualquer um digitaria o CPF de outra pessoa, trocaria o e-mail e
 * pediria "esqueci a senha". Conta que nunca teve acesso liberado não tem nada a
 * proteger; a que teve continua travada.
 *
 * Escopo por tenant (CPF é único por tenant — `@@unique([tenantId, cpf])`).
 * O aluno JÁ logado recompra por `/api/aluno/comprar` e `/api/aluno/assinatura`.
 */
export async function cpfHasRegisteredLogin(
  tenantId: string,
  cpf: string,
): Promise<boolean> {
  const digits = stripCpf(cpf)
  if (!digits) return false

  const existing = await prisma.student.findFirst({
    where: {
      tenantId,
      cpf: digits,
      passwordHash: { not: null },
      OR: [
        // `startedAt` é gravado quando o acesso é liberado; o status cobre
        // matrícula antiga liberada sem a data (há SUSPENDED sem startedAt).
        {
          enrollments: {
            some: {
              OR: [
                { startedAt: { not: null } },
                { status: { in: ["ACTIVE", "SUSPENDED", "COMPLETED"] } },
              ],
            },
          },
        },
        { subscriptions: { some: { startedAt: { not: null } } } },
        { certificates: { some: {} } },
      ],
    },
    select: { id: true },
  })
  return existing !== null
}
