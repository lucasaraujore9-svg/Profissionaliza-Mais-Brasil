import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { blockStudentInEA } from "@/lib/students/plataforma-actions"
import { propagateStudentErasure, type ErasurePropagationResult } from "@/lib/lgpd/erasure-propagation"
import { extractCertificatePath, deleteCertificatePdf } from "@/lib/certificates/storage"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { logAudit } from "@/lib/audit"
import { swallow } from "@/lib/errors"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"

// Exclusão/anonimização de conta do titular (LGPD art. 18, R13 / issue 116).
// Default: ANONIMIZAÇÃO (não hard-delete) — preserva integridade contábil
// (Enrollment/Payment continuam existindo, sem PII vinculada). Bloqueia o
// acesso na plataforma de aulas e impede login futuro (passwordHash/email nulos).
const bodySchema = z.object({
  confirm: z.literal("EXCLUIR MINHA CONTA"),
})

export const DELETE = withRequestContext(
  { action: "aluno.conta.delete", route: "/api/aluno/conta" },
  async (request: Request) => {
    const rl = await rateLimit(request, RATE_LIMITS.authReset)
    if (!rl.ok) return rateLimitResponse(rl)

    const session = await requireStudentSession()
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Confirmação inválida. Envie confirm: \"EXCLUIR MINHA CONTA\"." },
        { status: 400 },
      )
    }

    const student = await prisma.student.findUnique({
      where: { id: session.studentId },
      select: { id: true, tenantId: true, status: true },
    })
    if (!student) {
      return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 })
    }

    // Revoga acesso na plataforma de aulas (best-effort — não bloqueia a exclusão).
    await blockStudentInEA(student.id).catch(swallow("aluno.conta.block_ea"))

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
        await deleteCertificatePdf(path).catch(swallow("aluno.conta.cert_pdf_delete"))
      }
    }

    await logAudit({
      action: "student.account.anonymize",
      resource: "Student",
      resourceId: student.id,
      actorStudentId: student.id,
      actorRole: "STUDENT",
      tenantId: student.tenantId,
      payloadAfter: { anonymizedAs: anon, previousStatus: student.status, propagation },
    }).catch(swallow("aluno.conta.audit"))

    contextLogger().info(
      { event: "aluno.conta.anonymized", studentId: student.id },
      "conta de aluno anonimizada a pedido do titular (LGPD)",
    )

    return NextResponse.json({
      data: {
        ok: true,
        message:
          "Sua conta foi anonimizada. Seus dados pessoais foram removidos; registros financeiros são mantidos por obrigação legal.",
      },
    })
  },
)
