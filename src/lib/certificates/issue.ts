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
import { contextLogger } from "@/lib/logger"

const SETTINGS_ID = "default"

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
    },
  })
  if (!enrollment) throw new Error(`Enrollment ${enrollmentId} nao encontrado`)
  if (!enrollment.student) throw new Error("Aluno nao encontrado para a matricula")
  if (!enrollment.course) throw new Error("Curso nao encontrado para a matricula")

  // Bloqueia emissão para matrículas que não pagaram (PENDING) ou foram canceladas/reembolsadas.
  // ACTIVE (cursando), SUSPENDED (inadimplente — pode ter completado antes), COMPLETED são válidas.
  if (enrollment.status === "PENDING" || enrollment.status === "CANCELLED") {
    throw new Error(
      `Matrícula ${enrollmentId} não está elegível para certificado (status=${enrollment.status})`,
    )
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
  if (settings.certificateRequireCpf && !enrollment.student.cpf) {
    throw new Error(
      "Aluno sem CPF — exigencia da configuracao certificateRequireCpf.",
    )
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
 */
export async function issueCertificateManual(params: {
  enrollmentId: string
  issuedByUserId: string
  source: "MANUAL_ADMIN" | "MANUAL_RESELLER"
  force?: boolean
}): Promise<Certificate> {
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
