import { prisma } from "@/lib/prisma"
import { blockStudentInEA } from "@/lib/students/plataforma-actions"
import { propagateStudentErasure, type ErasurePropagationResult } from "@/lib/lgpd/erasure-propagation"
import { extractCertificatePath, deleteCertificatePdf } from "@/lib/certificates/storage"
import { logAudit } from "@/lib/audit"
import { swallow } from "@/lib/errors"

/**
 * ANONIMIZA o cadastro de um aluno (LGPD): apaga a PII e as credenciais,
 * mantendo matriculas/pagamentos/certificados por obrigacao contabil/legal.
 *
 * Um lugar so para as duas portas: o proprio titular pedindo a exclusao
 * (`DELETE /api/aluno/conta`) e a limpeza de cadastros de teste feita pela
 * operacao (`/api/cron/limpar-cadastros-teste`). Duas copias de um fluxo que
 * apaga dado pessoal divergiriam justamente no campo esquecido.
 */
export async function anonymizeStudentAccount(
  studentId: string,
  actor: { role: "STUDENT" | "SYSTEM"; origem?: string },
): Promise<{ anonymizedAs: string; propagation: ErasurePropagationResult | null } | null> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, tenantId: true, status: true },
  })
  if (!student) return null

  await blockStudentInEA(student.id).catch(swallow("lgpd.anonymize_student.block_ea"))

  // LGPD-013: propaga a exclusão aos subprocessadores onde há API (LMS: revoga
  // as matrículas) e registra pendências manuais (EA/LMS sem API de exclusão de
  // PII) + retenção legal (Asaas/MP). Best-effort — nunca lança.
  let propagation: ErasurePropagationResult | null = null
  try {
    propagation = await propagateStudentErasure(student.id)
  } catch {
    // propagateStudentErasure é best-effort por contrato; guard extra por segurança.
    propagation = null
  }

  // Anonimiza PII preservando os registros (Enrollment/Payment/Certificate)
  // para integridade contábil/legal. Limpa credenciais para impedir login.
  const anon = `anon_${student.id.slice(-8)}`
  await prisma.student.update({
    where: { id: student.id },
    data: {
      nome: "Conta removida",
      email: null,
      fone: null,
      fone2: null,
      cpf: null,
      rg: null,
      sexo: null,
      nascimento: null,
      responsavel: null,
      rgResponsavel: null,
      cpfResponsavel: null,
      responsavelEmail: null,
      responsavelFone: null,
      responsavelParentesco: null,
      responsavelDefinidoEm: null,
      // Bookkeeping de gateway, mas ainda assim vinculado a uma pessoa
      // identificável — some junto na anonimização.
      responsavelAsaasCustomerId: null,
      rua: null,
      bairro: null,
      cidade: null,
      estado: null,
      numero: null,
      cep: null,
      obs: null,
      passwordHash: null,
      passwordSetAt: null,
      resetToken: null,
      resetTokenExpires: null,
      status: "INATIVO",
    },
  })

  // LGPD-003: propaga a anonimização para as CÓPIAS de PII nos certificados
  // (nome+CPF ficam embutidos no registro e no PDF). Mantém o registro do
  // certificado (validade/auditoria), mas remove a PII e apaga o PDF do bucket
  // privado. Se o PDF for re-gerado depois, sai com "Conta removida"/sem CPF.
  const certs = await prisma.certificate.findMany({
    where: { studentId: student.id, pdfUrl: { not: null } },
    select: { pdfUrl: true },
  })
  await prisma.certificate.updateMany({
    where: { studentId: student.id },
    data: {
      studentName: "Conta removida",
      studentCpf: null,
      pdfUrl: null,
      pdfGeneratedAt: null,
    },
  })
  for (const c of certs) {
    const path = extractCertificatePath(c.pdfUrl)
    if (path) {
      await deleteCertificatePdf(path).catch(swallow("lgpd.anonymize_student.cert_pdf_delete"))
    }
  }

  await logAudit({
    action: "student.account.anonymize",
    resource: "Student",
    resourceId: student.id,
    ...(actor.role === "STUDENT" ? { actorStudentId: student.id } : {}),
    actorRole: actor.role,
    tenantId: student.tenantId,
    payloadAfter: {
      anonymizedAs: anon,
      previousStatus: student.status,
      propagation,
      ...(actor.origem ? { origem: actor.origem } : {}),
    },
  }).catch(swallow("lgpd.anonymize_student.audit"))

  return { anonymizedAs: anon, propagation }
}
