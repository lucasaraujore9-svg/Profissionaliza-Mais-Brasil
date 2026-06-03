import { prisma } from "@/lib/prisma"
import { generatePasswordWithHash } from "@/lib/students/generate-password"
import { logAudit } from "@/lib/audit"
import { swallow } from "@/lib/errors"

export interface AnonymizeActor {
  userId: string
  role: string
}

/**
 * Anonimização do OWNER de um revendedor (LGPD art. 18 — direito do titular).
 *
 * Remove os dados pessoais do usuário dono (nome, e-mail, telefone, foto),
 * inutiliza a senha (hash bcrypt aleatório descartável) e desativa o login
 * (status INATIVO — bloqueado em `src/lib/auth.ts:118`). NÃO remove o tenant
 * nem os registros de negócio (alunos/pagamentos), preservados por obrigação
 * contábil/legal; o cancelamento do tenant é uma ação SEPARADA
 * (`DELETE /api/admin/revendedores/[id]`).
 *
 * Idempotente: re-executar apenas reaplica a anonimização ao mesmo owner.
 */
export async function anonymizeResellerOwner(
  tenantId: string,
  actor: AnonymizeActor,
): Promise<{ ok: true; userId: string } | { ok: false; reason: string }> {
  // Owner DIRETO do tenant (User.tenantId é @unique e só setado para owners).
  const owner = await prisma.user.findFirst({
    where: { tenantId, role: "RESELLER" },
    select: { id: true, status: true },
  })
  if (!owner) return { ok: false, reason: "Owner do revendedor não encontrado" }

  const { hash } = await generatePasswordWithHash()

  await prisma.user.update({
    where: { id: owner.id },
    data: {
      name: "Conta removida",
      // E-mail é @unique e NOT NULL — usa placeholder único derivado do id.
      email: `anon_${owner.id}@anonimizado.local`,
      phone: null,
      image: null,
      passwordHash: hash,
      resetToken: null,
      resetTokenExpires: null,
      mustChangePassword: false,
      status: "INATIVO",
    },
  })

  await logAudit({
    action: "reseller.account.anonymize",
    resource: "User",
    resourceId: owner.id,
    actorUserId: actor.userId,
    actorRole: actor.role,
    tenantId,
    payloadAfter: { previousStatus: owner.status },
  }).catch(swallow("lgpd.reseller.audit"))

  return { ok: true, userId: owner.id }
}
