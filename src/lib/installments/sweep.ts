/**
 * Varredura diária do carnê (cron `sweep-boleto-installments`):
 *   A. Emite os boletos MP cujo vencimento entrou na janela de 7 dias (o MP não
 *      tem carnê nativo — cada boleto é emitido perto do vencimento).
 *   B. Marca parcelas vencidas como OVERDUE e bloqueia o acesso do aluno na
 *      plataforma (mesmo primitivo do auto-block por inadimplência). A parcela
 *      paga depois reativa via settleBoletoInstallment.
 *   C. Reconcilia a cota de aulas (trava proporcional ao pagamento) — rede de
 *      segurança dos gatilhos em tempo real. Ver `reconcilePaceGates`.
 *
 * Parcelado flex (venda direta com meio escolhido, `flexInstallments`) fica FORA
 * do passo A e tem os seus (spec 2026-11-06-venda-direta-parcelada-design):
 *   A1. Plano no boleto: emite a linha da janela por `chargeFlexRow` (lock por
 *       linha), nos dois gateways.
 *   A2. Plano no PIX/boleto (ou sem meio escolhido): e-mail "parcela
 *       disponível", no máximo FLEX_EMAIL_CAP por rodada, um de cada vez. Roda
 *       POR ÚLTIMO e com orçamento de tempo: SMTP lento não pode derrubar a
 *       função antes do OVERDUE/bloqueio, da cota nem da varredura de assinatura.
 *   B.  Cartão com assinatura viva e sem recusa: só vira OVERDUE após
 *       CARD_GRACE_DAYS (o gateway ainda retenta o cartão). Antes, a assinatura
 *       é conferida no gateway (`checkOverdueCardSubscription`).
 *
 * Idempotente: A pula parcelas já emitidas; B pula matrículas já suspensas;
 * C só age na transição.
 */
import { prisma } from "@/lib/prisma"
import { blockStudentInEA } from "@/lib/students/plataforma-actions"
import { createNotification } from "@/lib/notifications"
import { swallow } from "@/lib/errors"
import { contextLogger } from "@/lib/logger"
import { evaluatePaceGate } from "@/lib/enrollment/pace"
import { PACE_GATED_WHERE, PACE_GATED_CONTENT_WHERE } from "@/lib/enrollment/pace-gate"
import { PAYER_SELECT, resolvePayer } from "@/lib/checkout/payer"
import { sendEmail } from "@/lib/email/mailer"
import { PMB_EMAIL_BRAND, emailFromForBrand } from "@/lib/email/brand"
import { loadTenantEmailBrand } from "@/lib/email/tenant-brand"
import { generateMpBoletoForInstallment } from "./plan"
import { chargeFlexRow } from "./flex-charge"
import { checkOverdueCardSubscription } from "./flex-decline"
import { flexPaymentUrl } from "./flex"
import { isOverdue, INSTALLMENT_REVEAL_WINDOW_DAYS } from "./schedule"

export interface SweepResult {
  /** Boletos MP emitidos nesta rodada. */
  generated: number
  /** Falhas de emissão (já logadas). */
  generateErrors: number
  /** Parcelas marcadas OVERDUE. */
  markedOverdue: number
  /** Matrículas suspensas (aluno bloqueado ou venda PENDING abandonada). */
  suspended: number
  /** Matrículas cuja cota de aulas mudou de estado nesta rodada. */
  paceReconciled: number
  /** Boletos do parcelado flex emitidos nesta rodada (erros vão em generateErrors). */
  flexGenerated: number
  /** Boletos MP do parcelado flex não emitidos por falta de endereço salvo (o aluno informa na página). */
  flexSkippedNoAddress: number
  /** E-mails "parcela disponível" enviados. */
  flexEmailed: number
}

const GENERATE_BATCH = 200
const OVERDUE_BATCH = 500
/** Hostinger suspende as caixas em rajada: poucos por rodada, um de cada vez. */
const FLEX_EMAIL_CAP = 15
/** Cada envio pode esperar até 60 s por uma caixa; a rota tem maxDuration 300 s. */
const FLEX_EMAIL_BUDGET_MS = 120_000
const CARD_GRACE_DAYS = 3
const DAY_MS = 86_400_000

export async function runBoletoInstallmentSweep(now: Date = new Date()): Promise<SweepResult> {
  const startedAt = Date.now()
  const result: SweepResult = {
    generated: 0,
    generateErrors: 0,
    markedOverdue: 0,
    suspended: 0,
    paceReconciled: 0,
    flexGenerated: 0,
    flexSkippedNoAddress: 0,
    flexEmailed: 0,
  }

  // ── A. Emitir boletos MP na janela de 7 dias ───────────────────────────────
  const windowEnd = new Date(now)
  windowEnd.setUTCDate(windowEnd.getUTCDate() + INSTALLMENT_REVEAL_WINDOW_DAYS)

  const toGenerate = await prisma.boletoInstallment.findMany({
    where: {
      gateway: "MP",
      status: "SCHEDULED",
      dueDate: { lte: windowEnd },
      // Linha flex só pelo chargeFlexRow (lock por linha): emitir aqui correria
      // com a página/venda e deixaria duas cobranças vivas.
      enrollment: { status: { notIn: ["CANCELLED"] }, flexInstallments: false },
    },
    select: { id: true },
    orderBy: { dueDate: "asc" },
    take: GENERATE_BATCH,
  })

  for (const row of toGenerate) {
    try {
      await generateMpBoletoForInstallment(row.id)
      result.generated++
    } catch {
      // Erro já logado dentro de generateMpBoletoForInstallment. Segue para os
      // demais — a próxima rodada re-tenta esta parcela.
      result.generateErrors++
    }
  }

  await emitFlexBoletos(windowEnd, result)

  // ── B. Marcar OVERDUE + bloquear ───────────────────────────────────────────
  const candidates = await prisma.boletoInstallment.findMany({
    where: {
      status: { in: ["SCHEDULED", "GENERATED"] },
      dueDate: { lte: now },
      enrollment: { status: { in: ["PENDING", "ACTIVE"] } },
    },
    select: {
      id: true,
      enrollmentId: true,
      dueDate: true,
      status: true,
      cardDeclinedAt: true,
      enrollment: {
        select: { flexInstallments: true, installmentMethod: true, asaasSubscriptionId: true, mpSubscriptionId: true },
      },
    },
    take: OVERDUE_BATCH,
  })

  // Cartão em dia no automático: o gateway ainda retenta a cobrança. A recusa
  // confirmada (cardDeclinedAt) devolve a linha à regra normal.
  const cardGrace = (r: (typeof candidates)[number]) =>
    r.enrollment.flexInstallments &&
    r.enrollment.installmentMethod === "CREDIT_CARD" &&
    Boolean(r.enrollment.asaasSubscriptionId || r.enrollment.mpSubscriptionId) &&
    !r.cardDeclinedAt
  const overdue = candidates.filter((r) =>
    cardGrace(r) ? r.dueDate.getTime() + CARD_GRACE_DAYS * DAY_MS <= now.getTime() : isOverdue(r, now),
  )
  // Cartão vencido além da carência: a assinatura pode ter sumido sem evento de
  // recusa (cancelada à mão, cobrança que falhou calada). Confere no gateway —
  // sumida, a linha vira recusada e a página reabre PIX/boleto; viva, alerta a
  // PMB. Uma vez por matrícula; o OVERDUE sai igual nos dois casos.
  const checked = new Set<string>()
  for (const r of overdue) {
    if (!cardGrace(r) || checked.has(r.enrollmentId)) continue
    checked.add(r.enrollmentId)
    await checkOverdueCardSubscription(r.enrollmentId, r.id).catch(swallow("installments.sweep.card_sub_check"))
  }
  for (const r of overdue) {
    await prisma.boletoInstallment
      .update({ where: { id: r.id }, data: { status: "OVERDUE" } })
      .catch(swallow("installments.sweep.mark_overdue"))
    result.markedOverdue++
  }

  const enrollmentIds = [...new Set(overdue.map((r) => r.enrollmentId))]
  for (const enrollmentId of enrollmentIds) {
    const suspended = await suspendForOverdue(enrollmentId)
    if (suspended) result.suspended++
  }

  // ── C. Reconciliar a cota de aulas ─────────────────────────────────────────
  result.paceReconciled = await reconcilePaceGates()

  // ── A2 por último: o envio é o passo mais lento e o único adiável. ─────────
  await emailFlexAvailable(now, windowEnd, startedAt + FLEX_EMAIL_BUDGET_MS, result)

  return result
}

/** A1: plano flex no boleto — emite as linhas da janela pelo chargeFlexRow. */
async function emitFlexBoletos(windowEnd: Date, result: SweepResult): Promise<void> {
  const rows = await prisma.boletoInstallment.findMany({
    where: {
      status: "SCHEDULED",
      dueDate: { lte: windowEnd },
      enrollment: { flexInstallments: true, installmentMethod: "BOLETO", status: { notIn: ["CANCELLED"] } },
    },
    select: {
      id: true,
      enrollment: {
        select: {
          student: {
            select: { ...PAYER_SELECT, cep: true, rua: true, numero: true, bairro: true, cidade: true, estado: true },
          },
        },
      },
    },
    orderBy: { dueDate: "asc" },
    take: GENERATE_BATCH,
  })

  for (const row of rows) {
    const s = row.enrollment.student
    const p = resolvePayer(s)
    try {
      const res = await chargeFlexRow({
        rowId: row.id,
        method: "BOLETO",
        payer: {
          nome: p.nome,
          email: p.email,
          cpf: p.cpf,
          phone: p.fone,
          address: { cep: s.cep, rua: s.rua, numero: s.numero, bairro: s.bairro, cidade: s.cidade, estado: s.estado },
        },
      })
      if (res.kind !== "error") {
        result.flexGenerated++
      } else if (res.code === "ADDRESS_REQUIRED") {
        // MP sem endereço salvo: o aviso de "disponível" sai igual e o aluno
        // informa o endereço na página.
        result.flexSkippedNoAddress++
      } else {
        // Inclui PAYMENT_IN_PROGRESS (lock ocupado): a próxima rodada re-tenta.
        result.generateErrors++
        contextLogger().warn(
          { event: "installments.sweep.flex_emit_failed", rowId: row.id, code: res.code },
          "boleto do parcelado não emitido — re-tenta na próxima rodada",
        )
      }
    } catch (err) {
      result.generateErrors++
      contextLogger().error(
        { err, event: "installments.sweep.flex_emit_failed", rowId: row.id },
        "boleto do parcelado não emitido — re-tenta na próxima rodada",
      )
    }
  }
}

/**
 * A2: aviso "parcela disponível" (plano PIX/boleto ou sem meio escolhido). A
 * entrada fica de fora: o aluno já tem o link desde a venda. A marca só é
 * gravada depois do envio, então a falha re-tenta na próxima rodada.
 */
async function emailFlexAvailable(
  now: Date,
  windowEnd: Date,
  deadline: number,
  result: SweepResult,
): Promise<void> {
  // Vencida não recebe "vence em <data passada> e já pode ser paga".
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const rows = await prisma.boletoInstallment.findMany({
    where: {
      status: { in: ["SCHEDULED", "GENERATED"] },
      availableEmailSentAt: null,
      dueDate: { gte: todayUtc, lte: windowEnd },
      OR: [{ number: { gt: 1 } }, { enrollment: { flexHasDownPayment: false } }],
      enrollment: {
        flexInstallments: true,
        status: { notIn: ["CANCELLED"] },
        OR: [{ installmentMethod: { in: ["PIX", "BOLETO"] } }, { installmentMethod: null }],
      },
    },
    select: {
      id: true,
      enrollmentId: true,
      amount: true,
      dueDate: true,
      enrollment: {
        select: {
          tenantId: true,
          student: { select: { nome: true, email: true } },
          course: { select: { nome: true } },
          tenant: { select: { slug: true, customDomain: true, domainVerified: true } },
        },
      },
    },
    orderBy: { dueDate: "asc" },
    take: GENERATE_BATCH,
  })

  let attempts = 0
  for (const [i, row] of rows.entries()) {
    if (attempts >= FLEX_EMAIL_CAP) break
    if (Date.now() >= deadline) {
      contextLogger().warn(
        { event: "installments.sweep.flex_available_budget_exhausted", leftover: rows.length - i },
        "orçamento de tempo do e-mail de parcela disponível esgotado — o resto fica para a próxima rodada",
      )
      break
    }
    const enr = row.enrollment
    if (!enr.student.email) continue
    attempts++
    try {
      const brand = enr.tenantId ? await loadTenantEmailBrand(enr.tenantId) : PMB_EMAIL_BRAND
      // Em sequência, nunca em paralelo: rajada derruba as caixas SMTP.
      await sendEmail({
        to: enr.student.email,
        from: emailFromForBrand(brand),
        replyTo: brand.replyTo ?? undefined,
        tenantId: enr.tenantId,
        subject: "Sua parcela está disponível",
        template: {
          type: "installment-available",
          props: {
            studentName: enr.student.nome,
            courseName: enr.course.nome,
            amount: `R$ ${Number(row.amount).toFixed(2).replace(".", ",")}`,
            // Data civil gravada à meia-noite UTC: formatar em UTC, não no fuso BR.
            dueDate: row.dueDate.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
            paymentUrl: flexPaymentUrl(row.enrollmentId, enr.tenant),
            brand,
          },
        },
      })
    } catch (err) {
      contextLogger().error(
        { err, event: "installments.sweep.flex_available_email_failed", rowId: row.id },
        "e-mail de parcela disponível falhou — re-tenta na próxima rodada",
      )
      continue
    }
    await prisma.boletoInstallment
      .update({ where: { id: row.id }, data: { availableEmailSentAt: new Date() } })
      .catch(swallow("installments.sweep.flex_available_mark"))
    result.flexEmailed++
  }
}

const PACE_BATCH = 500

/**
 * Rede de segurança da cota de aulas. Os gatilhos normais (sync de progresso,
 * webhook do LMS, parcela paga) cobrem o caso feliz; esta varredura pega o que
 * escapou:
 *   - corte na plataforma que falhou (EA/LMS fora do ar na hora);
 *   - matrícula que deveria destravar mas cujo webhook não chegou;
 *   - aluno que parou de abrir a área do aluno (na EA o progresso só vem do pull,
 *     então sem esta passada ninguém reavaliaria a matrícula dele);
 *   - interruptor desligado depois de já ter travado gente.
 *
 * Varre as JÁ TRAVADAS (índice `pace_blocked_at`, poucas linhas) e as matrículas
 * parceladas vivas cujo progresso passou da cota. `evaluatePaceGate` é idempotente
 * e nunca lança, então uma falha isolada não derruba a varredura.
 */
async function reconcilePaceGates(): Promise<number> {
  const candidates = await prisma.enrollment.findMany({
    where: {
      status: "ACTIVE",
      // `AND` explícito: dois `OR` soltos no mesmo nível são chaves do mesmo
      // objeto — o segundo sobrescreveria o primeiro.
      AND: [
        // "Está sob a regra da cota?" — plano próprio OU herdado da matrícula
        // que pagou. Gêmeo SQL de `isPaceGatedPlan`, travado por teste de
        // paridade. Sem o ramo herdado, a satélite de uma compra parcelada
        // (ONE_TIME, sem parcelas) ficava fora da varredura para sempre.
        PACE_GATED_WHERE,
        // E-book nao entra: `evaluatePaceGate` o dispensa de qualquer forma
        // (ver `isPaceGateApplicable`), e sem este filtro a varredura carregaria
        // todo e-book parcelado da base toda noite para nao fazer nada.
        PACE_GATED_CONTENT_WHERE,
        {
          OR: [
            { paceBlockedAt: { not: null } },
            { paceExemptAt: null, progressPercent: { gt: 0 } },
            // Ainda sem teto propagado: venda parcelada nova (ou reprovisionada)
            // e re-tentativa de um envio ao LMS que falhou. Sem esta cláusula, a
            // matrícula que nunca chegou a andar ficava com o curso INTEIRO
            // aberto no LMS — e só entrava na varredura depois de o aluno já ter
            // assistido além do que pagou, que é tarde demais.
            // Auto-limitada: a 1ª passada grava `paceAppliedPercent` e ela sai
            // do filtro.
            { paceExemptAt: null, paceAppliedPercent: null },
          ],
        },
      ],
    },
    select: { id: true },
    take: PACE_BATCH,
  })

  let reconciled = 0
  for (const row of candidates) {
    const res = await evaluatePaceGate(row.id)
    if (res?.changed) reconciled++
  }
  return reconciled
}

/**
 * Suspende a matrícula por inadimplência. Se ACTIVE (entrada já paga), bloqueia
 * o aluno na plataforma; se PENDING (nem a entrada foi paga), só marca SUSPENDED.
 * Retorna true se mudou o estado.
 */
async function suspendForOverdue(enrollmentId: string): Promise<boolean> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      status: true,
      studentId: true,
      tenantId: true,
      course: { select: { nome: true } },
      student: { select: { nome: true } },
    },
  })
  if (!enrollment) return false
  if (enrollment.status !== "ACTIVE" && enrollment.status !== "PENDING") return false

  if (enrollment.status === "ACTIVE") {
    try {
      await blockStudentInEA(enrollment.studentId)
    } catch (err) {
      contextLogger().error(
        { err, event: "installments.sweep.block_failed", enrollmentId },
        "bloqueio do aluno na plataforma falhou — mantém ACTIVE para re-tentar",
      )
      return false // não marca SUSPENDED se o bloqueio na plataforma falhou
    }
  }

  await prisma.enrollment.update({
    where: { id: enrollmentId },
    data: { status: "SUSPENDED" },
  })

  await createNotification({
    audience: "STUDENT",
    studentId: enrollment.studentId,
    level: "WARNING",
    title: `Parcela em atraso — ${enrollment.course.nome}`,
    body:
      enrollment.status === "ACTIVE"
        ? "Seu acesso foi suspenso por parcela vencida. Pague o boleto em aberto para reativar."
        : "Há um boleto vencido em aberto. Pague para liberar o acesso ao curso.",
    category: "payment",
    href: "/aluno/pagamentos",
  }).catch(swallow("installments.sweep.notify_student"))

  if (enrollment.tenantId) {
    await createNotification({
      audience: "TENANT",
      tenantId: enrollment.tenantId,
      level: "WARNING",
      title: `Parcela em atraso — ${enrollment.student.nome}`,
      body: `${enrollment.course.nome}: boleto vencido sem pagamento. Acesso do aluno suspenso.`,
      category: "payment",
      href: "/painel/financeiro",
    }).catch(swallow("installments.sweep.notify_tenant"))
  }

  return true
}
