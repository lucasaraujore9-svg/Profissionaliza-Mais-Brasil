import { prisma } from "@/lib/prisma"
import { subscriptionGrantsAccess } from "./access"

/**
 * A assinatura VIVA do aluno — a que libera curso agora — ou null.
 *
 * Decide pelo PRAZO do ciclo pago (`subscriptionGrantsAccess`), não só pelo
 * status: uma assinatura ACTIVE cujo ciclo caiu há semanas (webhook perdido) não
 * pode continuar abrindo nem trocando curso.
 */
export async function findLiveSubscriptionId(studentId: string): Promise<string | null> {
  const subs = await prisma.studentSubscription.findMany({
    where: { studentId, status: { in: ["ACTIVE", "PAST_DUE"] } },
    // `interval` nao e decorativo aqui: e ele que faz a assinatura VITALICIA
    // (sem `currentPeriodEnd`) ser reconhecida como viva.
    select: { id: true, status: true, currentPeriodEnd: true, interval: true },
    orderBy: { createdAt: "desc" },
  })
  return subs.find((s) => subscriptionGrantsAccess(s))?.id ?? null
}
