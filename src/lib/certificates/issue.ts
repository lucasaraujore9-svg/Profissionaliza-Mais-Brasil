import type { Certificate, CertificateSource } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { createNotification } from "@/lib/notifications"
import { PMB_TENANT_NAME } from "@/lib/pmb-config"
import { generateCertificateCode } from "./code"
import {
  resolveCertificateTemplate,
  type ResolvedTemplate,
} from "./template-resolver"
import { generateAndUploadPdf } from "./generate-pdf"
import { isEnrollmentConcludedForCertificate } from "./eligibility"
import {
  PACE_PRIMARY_SELECT,
  effectivePacePlan,
  evaluatePace,
  hasOpenInstallmentPlan,
  installmentWord,
  isConclusionBlockedByPace,
} from "@/lib/enrollment/pace-gate"
import { resolvePaceGateSettings } from "@/lib/enrollment/pace-settings"
import { contextLogger } from "@/lib/logger"
import { canIssueCertificate } from "@/lib/catalog/content-type"

const SETTINGS_ID = "default"

/**
 * Emissao recusada porque a venda parcelada ainda nao foi quitada (cota de
 * aulas). Tipo proprio para as rotas distinguirem "nao concluiu o curso" de
 * "concluiu mas ainda deve parcelas" — sao mensagens diferentes ao operador.
 */
export class PaceGateError extends Error {
  readonly installmentsPaid: number
  readonly installmentsTotal: number | null

  constructor(message: string, installmentsPaid: number, installmentsTotal: number | null) {
    super(message)
    this.name = "PaceGateError"
    this.installmentsPaid = installmentsPaid
    this.installmentsTotal = installmentsTotal
  }
}

/**
 * Aluno sem CPF com a exigencia de CPF no certificado LIGADA.
 *
 * Tipo proprio pelo mesmo motivo do `PaceGateError`: e uma recusa ESPERADA e
 * ACIONAVEL, nao falha de servidor. Sem ele o aluno recebia "nao foi possivel
 * emitir agora, tente novamente" — conselho que nunca vai funcionar, porque
 * repetir nao preenche CPF nenhum.
 */
/**
 * Emissao recusada porque o conteudo NAO E UM CURSO.
 *
 * Tipo proprio pelo mesmo motivo do `PaceGateError` e do `MissingCpfError`: e
 * uma recusa DEFINITIVA e explicavel, nao falha de servidor. E ela nao tem
 * `force`: o SUPER_ADMIN pode forcar uma emissao que a cota travou (o aluno
 * negociou, pagou por fora), mas ninguem pode transformar um e-book em curso
 * livre com carga horaria — o documento afirmaria o que nao aconteceu.
 */
export class NotCertifiableError extends Error {
  constructor() {
    super(
      "Este conteúdo é um e-book e não emite certificado. Certificado é documento de curso livre, com carga horária e conclusão apurada.",
    )
    this.name = "NotCertifiableError"
  }
}

export class MissingCpfError extends Error {
  constructor() {
    super(
      "Certificado exige o CPF do aluno. Peça à sua unidade para completar o cadastro — o CPF é impresso no documento e usado na validação pública.",
    )
    this.name = "MissingCpfError"
  }
}

async function ensureSystemSettings() {
  return prisma.systemSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
    select: {
      certificateMinPercent: true,
      certificateAutoIssue: true,
      certificateRequireCpf: true,
    },
  })
}

/**
 * Emite (ou retorna o existente) o certificado para a matricula.
 * Quando options.force=true, emite novo mesmo se ja houver certificado nao-revogado.
 * Idempotente: se ja ha Certificate nao revogado, devolve o mesmo
 * (salvo quando force=true).
 */
export async function issueCertificateIfEligible(
  enrollmentId: string,
  source: CertificateSource = "AUTO",
  issuedByUserId?: string | null,
  options: { force?: boolean } = {},
): Promise<Certificate> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      student: true,
      course: true,
      tenant: { select: { id: true, slug: true, name: true } },
      // Satélite de compra com vários cursos: o parcelamento (e portanto a trava
      // de conclusão) é o da matrícula que pagou. Sem isto, o curso 2 de uma
      // venda em 6x emitiria certificado com 1 parcela paga.
      ...PACE_PRIMARY_SELECT,
    },
  })
  if (!enrollment) throw new Error(`Enrollment ${enrollmentId} nao encontrado`)
  if (!enrollment.student) throw new Error("Aluno nao encontrado para a matricula")
  if (!enrollment.course) throw new Error("Curso nao encontrado para a matricula")

  // ── E-book não certifica ──────────────────────────────────────────────────
  // ANTES de qualquer outra checagem, e SEM saída por `force`. Vem primeiro
  // porque é a recusa mais definitiva das três: cota e CPF descrevem algo que
  // ainda pode ser resolvido, esta descreve o que o produto É. E o gate mora
  // aqui, no núcleo, e não em cada tela: a emissão tem quatro portas (automática
  // pelo progresso, manual do /admin, manual do /painel, botão do aluno) e a
  // lição do `GUARDIAN_REQUIRED` foi que gate nascido numa rota só deixa as
  // outras errando por meses.
  if (!canIssueCertificate(enrollment.course)) {
    contextLogger().info(
      { event: "certificates.not_certifiable", enrollmentId, source },
      "emissão de certificado recusada — conteúdo não é curso",
    )
    throw new NotCertifiableError()
  }

  // Bloqueia emissão para matrículas que não pagaram (PENDING) ou foram canceladas/reembolsadas.
  // ACTIVE (cursando), SUSPENDED (inadimplente — pode ter completado antes), COMPLETED são válidas.
  if (enrollment.status === "PENDING" || enrollment.status === "CANCELLED") {
    throw new Error(
      `Matrícula ${enrollmentId} não está elegível para certificado (status=${enrollment.status})`,
    )
  }

  // ── Cota de aulas: sem quitar o parcelamento, não há conclusão ────────────
  // Esta é a trava que NÃO vaza. O aluno pode até driblar o player da
  // plataforma de aulas (a EA só bloqueia por login, não por curso), mas o
  // certificado é emitido por nós — então enquanto faltar parcela, não conclui.
  // Vale para TODOS os caminhos de emissão automática (sync de progresso EA,
  // delta LMS, webhook course.completed, botão do próprio aluno); a emissão
  // manual só passa com `force`, que a camada de API concede apenas ao
  // SUPER_ADMIN.
  if (!options.force && hasOpenInstallmentPlan(enrollment)) {
    const { enabled } = await resolvePaceGateSettings(enrollment.tenantId)
    if (isConclusionBlockedByPace({ ...enrollment, gateEnabled: enabled })) {
      const state = evaluatePace(enrollment)
      // Numa satelite o paymentType da linha e ONE_TIME: a copy tem que seguir
      // o plano EFETIVO (mensalidade x parcela) da compra.
      const word = installmentWord(
        effectivePacePlan(enrollment).paymentType,
        state.remaining > 1,
      )
      contextLogger().info(
        {
          event: "certificates.pace_gate_blocked",
          enrollmentId,
          source,
          installmentsPaid: state.installmentsPaid,
          installmentsTotal: state.installmentsTotal,
        },
        "emissão de certificado recusada — parcelamento em aberto",
      )
      throw new PaceGateError(
        `Faltam ${state.remaining} ${word} para quitar o curso ` +
          `(${state.installmentsPaid} de ${state.installmentsTotal} pagas). ` +
          "O certificado é liberado após a quitação.",
        state.installmentsPaid,
        state.installmentsTotal,
      )
    }
  }

  // Reusa certificado nao revogado existente (a nao ser que force=true)
  if (!options.force) {
    const existing = await prisma.certificate.findFirst({
      where: { enrollmentId, revokedAt: null },
      orderBy: { createdAt: "desc" },
    })
    if (existing) return existing
  }

  const settings = await ensureSystemSettings()
  if (settings.certificateRequireCpf && !enrollment.student.cpf?.trim()) {
    throw new MissingCpfError()
  }

  const tenantSlug = enrollment.tenant?.slug ?? null
  const code = await generateCertificateCode(tenantSlug)

  const template: ResolvedTemplate = await resolveCertificateTemplate(
    enrollment.tenantId,
  )
  const templateSnapshot: ResolvedTemplate = { ...template }

  const completionDate = new Date()
  const created = await prisma.certificate.create({
    data: {
      code,
      studentId: enrollment.studentId,
      enrollmentId: enrollment.id,
      courseId: enrollment.courseId,
      tenantId: enrollment.tenantId,
      studentName: enrollment.student.nome,
      studentCpf: enrollment.student.cpf,
      courseName: enrollment.course.nome,
      cargaHoraria: enrollment.course.cargaHoraria,
      completionDate,
      templateSnapshot: templateSnapshot as unknown as object,
      source,
      issuedByUserId: issuedByUserId ?? null,
    },
  })

  // Marca Enrollment como COMPLETED se ainda nao estava (CANCELLED/PENDING
  // já foram bloqueados acima).
  if (enrollment.status !== "COMPLETED") {
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { status: "COMPLETED" },
    })
  }

  // Marca aluno como certificado (legado — campo Student.certificado)
  if (!enrollment.student.certificado) {
    await prisma.student.update({
      where: { id: enrollment.student.id },
      data: { certificado: true },
    })
  }

  // Geracao de PDF assincrona — nao bloqueia o caller
  void generateAndUploadPdf(created.id).catch((err) => {
    contextLogger().error(
      { err, event: "certificates.pdf_gen_failed", certificateId: created.id, code: created.code },
      "falha ao gerar PDF do certificado",
    )
  })

  // Notificacao in-app
  const unidade = enrollment.tenant?.name ?? PMB_TENANT_NAME
  await createNotification({
    audience: "STUDENT",
    studentId: enrollment.studentId,
    level: "SUCCESS",
    title: "Certificado disponivel",
    body: `Seu certificado do curso "${enrollment.course.nome}" foi emitido por ${unidade}.`,
    category: "certificate",
    href: `/aluno/certificados/${created.id}`,
  })

  return created
}

/**
 * Emissao manual (admin/revendedor). Wrapper com source MANUAL_*.
 *
 * Exige que o curso esteja concluido — considerando tanto
 * `Enrollment.status === COMPLETED` quanto o progresso sincronizado da
 * plataforma de aulas (progressStatus = CONCLUIDO, ou progressPercent >=
 * certificateMinPercent). Isso evita travar a emissao de alunos 100%
 * concluidos cujo `status` ainda nao foi promovido para COMPLETED. O `force`
 * (so concedido ao SUPER_ADMIN pela camada de API) ignora a checagem por
 * completo; demais papeis recebem a mensagem de bloqueio.
 */
export async function issueCertificateManual(params: {
  enrollmentId: string
  issuedByUserId: string
  source: "MANUAL_ADMIN" | "MANUAL_RESELLER"
  force?: boolean
}): Promise<Certificate> {
  if (!params.force) {
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: params.enrollmentId },
      select: { status: true, progressStatus: true, progressPercent: true },
    })
    if (!enrollment) {
      throw new Error(`Enrollment ${params.enrollmentId} nao encontrado`)
    }
    const settings = await ensureSystemSettings()
    if (
      !isEnrollmentConcludedForCertificate(
        enrollment,
        settings.certificateMinPercent,
      )
    ) {
      throw new Error(
        "O aluno ainda não concluiu o curso, por isso não é possível emitir o certificado.",
      )
    }
  }

  return issueCertificateIfEligible(
    params.enrollmentId,
    params.source,
    params.issuedByUserId,
    { force: params.force ?? false },
  )
}

/**
 * Revoga certificado (admin/revendedor). Mantem registro auditavel.
 * Idempotente: se ja revogado, retorna o existente.
 */
export async function revokeCertificate(
  certificateId: string,
  reason?: string,
  _byUserId?: string,
): Promise<Certificate> {
  const existing = await prisma.certificate.findUnique({
    where: { id: certificateId },
    include: {
      student: { select: { id: true, nome: true } },
      course: { select: { nome: true } },
    },
  })
  if (!existing) throw new Error("Certificado nao encontrado")
  if (existing.revokedAt) return existing

  const updated = await prisma.certificate.update({
    where: { id: existing.id },
    data: {
      revokedAt: new Date(),
      revokedReason: reason ?? null,
    },
  })

  await createNotification({
    audience: "STUDENT",
    studentId: existing.studentId,
    level: "WARNING",
    title: "Certificado revogado",
    body: `Seu certificado do curso "${existing.course?.nome ?? existing.courseName}" foi revogado.${
      reason ? ` Motivo: ${reason}` : ""
    }`,
    category: "certificate",
    href: `/aluno/certificados/${existing.id}`,
  })

  return updated
}
