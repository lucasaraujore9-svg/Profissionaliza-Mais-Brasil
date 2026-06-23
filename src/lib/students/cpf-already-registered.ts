import { prisma } from "@/lib/prisma"
import { stripCpf } from "@/lib/validation/cpf"

/**
 * Gate de CPF do checkout de convidado.
 *
 * Indica se o CPF já pertence a um aluno COM acesso ao painel `/aluno`
 * (`passwordHash` definido) naquela vitrine/tenant. Essa é a definição de
 * "cadastro existente" usada para bloquear o checkout como convidado e pedir
 * login.
 *
 * Por que `passwordHash != null` e não a mera existência da linha Student:
 * `upsertStudent` cria o Student no INÍCIO do checkout (antes do pagamento), e
 * a senha do painel só é gerada no fulfill (após pagamento confirmado, em
 * `src/lib/enrollment/fulfill.ts`). Bloquear por linha existente prenderia quem
 * abandonou um PIX/boleto e voltou para comprar — esse aluno nunca recebeu
 * senha e não teria como "fazer login". Só quem completou uma compra tem
 * `passwordHash` e recebeu as credenciais por e-mail; é esse que deve logar.
 *
 * Mesmo filtro do login em `src/lib/auth.ts` (`passwordHash: { not: null }`) e
 * escopo por tenant (CPF é único por tenant — `@@unique([tenantId, cpf])`).
 *
 * O aluno JÁ logado recompra por `/api/aluno/comprar` (identificado pela
 * sessão, sem CPF no form) — portanto não passa por este gate.
 */
export async function cpfHasRegisteredLogin(
  tenantId: string,
  cpf: string,
): Promise<boolean> {
  const digits = stripCpf(cpf)
  if (!digits) return false

  const existing = await prisma.student.findFirst({
    where: { tenantId, cpf: digits, passwordHash: { not: null } },
    select: { id: true },
  })
  return existing !== null
}
