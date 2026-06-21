import type { TenantStatus } from "@prisma/client"

/**
 * Um aluno/matrícula só pode ser reativado pelo sweep `reactivate-paid` se o
 * TENANT estiver ACTIVE.
 *
 * Se a revenda está SUSPENDED (inadimplência), PENDING (sem 1º pagamento) ou
 * CANCELLED, o pagamento individual de um curso NÃO deve furar o bloqueio em
 * nível de tenant (SAAS-002). A reativação legítima dos alunos acontece pelo
 * branch de tenant (`unblockTenantStudents`) quando a revenda volta a ACTIVE.
 */
export function canReactivateUnderTenant(
  tenantStatus: TenantStatus | null | undefined,
): boolean {
  return tenantStatus === "ACTIVE"
}
