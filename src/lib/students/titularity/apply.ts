import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { afterResponse } from "@/lib/after-response"
import { contextLogger } from "@/lib/logger"
import { generateAndUploadPdf } from "@/lib/certificates/generate-pdf"
import { syncStudentProfileToEA } from "@/lib/students/plataforma-actions"
import {
  guardianShape,
  nascimentoFieldOptional,
  normalizeGuardian,
  withGuardianRule,
} from "@/lib/students/guardian"
import { isValidCpf, stripCpf } from "@/lib/validation/cpf"

/**
 * CORREÇÃO DE TITULARIDADE — transforma "aluno = mãe" em "aluno = filho,
 * responsável = mãe", preservando matrículas, pagamentos, acesso às aulas e
 * login, e corrigindo o certificado já emitido.
 *
 * Isto reescreve um DOCUMENTO OFICIAL. Duas decisões de projeto merecem estar
 * escritas aqui, porque o caminho "óbvio" é pior nos dois casos:
 *
 * 1. MANTÉM O `code` DO CERTIFICADO. Ele já circulou — foi impresso, mandado
 *    por WhatsApp, às vezes entregue a um empregador. Trocá-lo faria
 *    /validar/{code} responder "não encontrado" para quem conferisse o código
 *    antigo, e isso LÊ COMO FRAUDE — o oposto da mensagem pretendida.
 *
 * 2. NÃO REEMITE. Reemitir obrigaria a revogar o original, deixando
 *    permanentemente uma página pública estampando "Certificado revogado" em
 *    vermelho para um aluno legítimo; e `issueCertificate` com `force` grava
 *    `completionDate: new Date()` — a data de conclusão viraria HOJE, o que
 *    sozinho desqualifica a reemissão.
 */

export const titularitySchema = withGuardianRule(
  z.object({
    /** Quem de fato estuda. */
    nome: z.string().trim().min(3).max(160),
    nascimento: nascimentoFieldOptional,
    /**
     * CPF do aluno. OPCIONAL aqui, ao contrário da venda nova: travar a
     * correção do NOME por um documento que a unidade não tem em mãos no
     * momento é pior do que corrigir só o nome. O certificado já sabe imprimir
     * sem CPF (`certificateRequireCpf` está desligado em produção).
     */
    cpf: z.string().trim().max(20).optional().or(z.literal("")),
    ...guardianShape,
    corrigirCertificados: z.boolean().default(true),
    justificativa: z
      .string()
      .trim()
      .min(10, "Descreva o que foi verificado (mínimo 10 caracteres)")
      .max(500),
    /** A pessoa precisa afirmar que conferiu o documento do aluno. */
    confirmado: z.literal(true, {
      message: "Confirme que verificou o documento do aluno",
    }),
  }),
  {
    requireNascimento: false,
    // Cadastro LEGADO: 217 dos 230 alunos nunca tiveram data de nascimento, e a
    // unidade raramente tem o contato do responsavel a mao no momento da
    // revisao. Exigir qualquer um dos dois travaria justamente os registros que
    // este fluxo existe para consertar — corrigir o NOME do certificado.
    requireNascimentoComResponsavel: false,
    requireGuardianContact: false,
  },
)

export type TitularityInput = z.infer<typeof titularitySchema>

export interface TitularityActor {
  userId: string
  role: string
  email: string | null
  ip: string | null
  userAgent: string | null
}

export interface TitularityResult {
  studentId: string
  certificatesUpdated: Array<{ id: string; code: string }>
}

export class TitularityScopeError extends Error {
  readonly code = "TITULARITY_SCOPE"
}

/**
 * O CPF informado para o aluno ja pertence a OUTRO cadastro do mesmo tenant —
 * caso comum: a unidade registrou a mae como aluna E depois criou o cadastro
 * correto do filho. Sem este tratamento o P2002 sobe como 500 generico e quem
 * revisa nao descobre que a causa e um cadastro duplicado.
 */
export class TitularityCpfConflictError extends Error {
  readonly code = "TITULARITY_CPF_CONFLICT"
  constructor() {
    super(
      "Este CPF já pertence a outro cadastro desta unidade. Provavelmente o aluno já tem um cadastro próprio — verifique antes de corrigir, para não duplicar o histórico.",
    )
  }
}

export interface TitularityScope {
  /** O painel SEMPRE passa `ctx.tenantId` — nenhum id forjado alcança outra loja. */
  tenantId?: string
  /**
   * Recorte de CARTEIRA (`ctx.scope.alunos`). Sem ele, um Vendedor poderia
   * reescrever o cadastro e o certificado de qualquer aluno da unidade, não só
   * dos que ele originou.
   */
  extraWhere?: Prisma.StudentWhereInput
}

export async function applyTitularityCorrection(
  studentId: string,
  input: TitularityInput,
  actor: TitularityActor,
  scope?: TitularityScope,
): Promise<TitularityResult> {
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      ...(scope?.tenantId ? { tenantId: scope.tenantId } : {}),
      ...(scope?.extraWhere ?? {}),
    },
    select: {
      id: true,
      tenantId: true,
      nome: true,
      cpf: true,
      nascimento: true,
      responsavel: true,
      cpfResponsavel: true,
    },
  })
  if (!student) throw new TitularityScopeError("Aluno não encontrado")

  const guardian = normalizeGuardian(input)
  const alunoCpf = input.cpf ? stripCpf(input.cpf) : null
  if (alunoCpf && !isValidCpf(alunoCpf)) {
    throw new Error("CPF do aluno inválido")
  }

  const nascimento = input.nascimento
    ? new Date(`${input.nascimento}T00:00:00.000Z`)
    : null

  const before = {
    nome: student.nome,
    cpf: student.cpf,
    nascimento: student.nascimento?.toISOString() ?? null,
    responsavel: student.responsavel,
    cpfResponsavel: student.cpfResponsavel,
  }
  const after = {
    nome: input.nome.trim(),
    cpf: alunoCpf,
    nascimento: nascimento?.toISOString() ?? null,
    responsavel: guardian?.nome ?? null,
    cpfResponsavel: guardian?.cpf ?? null,
  }

  const certificates = input.corrigirCertificados
    ? await prisma.certificate.findMany({
        // Certificado REVOGADO não é tocado: documento revogado é fato
        // histórico, e reescrevê-lo apagaria o registro do que aconteceu.
        where: { studentId: student.id, revokedAt: null },
        select: { id: true, code: true, studentName: true, studentCpf: true },
      })
    : []

  const now = new Date()

  try {
    await prisma.$transaction(async (tx) => {
    await tx.student.update({
      where: { id: student.id },
      data: {
        nome: after.nome,
        cpf: alunoCpf,
        nascimento,
        responsavel: guardian?.nome ?? null,
        cpfResponsavel: guardian?.cpf ?? null,
        rgResponsavel: guardian?.rg ?? null,
        responsavelEmail: guardian?.email ?? null,
        responsavelFone: guardian?.fone ?? null,
        responsavelParentesco: guardian?.parentesco ?? null,
        responsavelDefinidoEm: guardian ? now : null,
        titularidadeRevisadaEm: now,
        titularidadeRevisadaPorId: actor.userId,
      },
    })

    for (const cert of certificates) {
      await tx.certificate.update({
        where: { id: cert.id },
        data: {
          studentName: after.nome,
          studentCpf: alunoCpf,
          // Nulificar os dois é a forma DOCUMENTADA de forçar a regeneração:
          // `isCertificatePdfStale` devolve true quando falta qualquer um
          // (src/lib/certificates/freshness.ts). O objeto no Storage é
          // sobrescrito no mesmo caminho — não fica binário órfão.
          pdfUrl: null,
          pdfGeneratedAt: null,
          correctedAt: now,
          correctedByUserId: actor.userId,
          correctionReason: input.justificativa,
        },
      })

      // Um AuditLog POR CERTIFICADO: o índice [resource, resourceId] já existe,
      // então "histórico deste certificado" vira uma query só.
      await tx.auditLog.create({
        data: {
          action: "certificate.titularity.correct",
          resource: "Certificate",
          resourceId: cert.id,
          actorUserId: actor.userId,
          actorRole: actor.role,
          actorEmail: actor.email,
          tenantId: student.tenantId,
          payloadBefore: {
            code: cert.code,
            studentName: cert.studentName,
            studentCpf: cert.studentCpf,
          },
          payloadAfter: {
            code: cert.code,
            studentName: after.nome,
            studentCpf: alunoCpf,
            justificativa: input.justificativa,
          },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
      })
    }

    // DESVIO DELIBERADO de `logAudit`: aquele helper engole falha de
    // persistência por design (src/lib/audit.ts), para nunca derrubar a
    // operação de negócio. Aqui a operação de negócio É a reescrita de um
    // documento oficial — um buraco silencioso na trilha é inaceitável, então a
    // auditoria vai DENTRO da transação e falha nela desfaz a correção.
    await tx.auditLog.create({
      data: {
        action: "student.titularity.correct",
        resource: "Student",
        resourceId: student.id,
        actorUserId: actor.userId,
        actorRole: actor.role,
        actorEmail: actor.email,
        tenantId: student.tenantId,
        payloadBefore: before,
        payloadAfter: { ...after, justificativa: input.justificativa },
        ip: actor.ip,
        userAgent: actor.userAgent,
      },
    })
    })
  } catch (err) {
    // `@@unique([tenantId, cpf])`: o filho ja pode ter cadastro proprio nesta
    // unidade. Sem esta traducao, quem revisa recebe um 500 generico e nao
    // descobre que a causa e um cadastro duplicado.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new TitularityCpfConflictError()
    }
    throw err
  }

  // ── Fora da transação: nada de rede dentro dela ──────────────────────────

  // A plataforma de aulas passa a conhecer o nome do filho. `pushPlatformState`
  // reassevera o snapshot inteiro — é o único caminho seguro (usuarios/editar
  // da EA não é PATCH: campo omitido volta ao default).
  // `afterResponse` e nao `void promise`: na Vercel a invocacao pode ser
  // congelada assim que a resposta sai, e um `void` solto morre sem nem rodar o
  // `.catch` — a "regeneracao ansiosa" nunca aconteceria e o erro nao apareceria
  // em log nenhum.
  afterResponse(() =>
    syncStudentProfileToEA(student.id).catch((err) => {
      contextLogger().error(
        { err, event: "titularity.ea_sync_failed", studentId: student.id },
        "correção de titularidade aplicada, mas a plataforma de aulas não sincronizou",
      )
    }),
  )

  // Regeneração ANSIOSA. Só o lazy (no download) deixaria o primeiro que abrir
  // pagar a renderização fria — e, se ninguém abrir, o objeto armazenado
  // continuaria com o nome errado.
  for (const cert of certificates) {
    afterResponse(() =>
      generateAndUploadPdf(cert.id).catch((err) => {
        contextLogger().error(
          {
            err,
            event: "titularity.pdf_regen_failed",
            certificateId: cert.id,
            code: cert.code,
          },
          "falha ao regerar PDF após correção — será regerado no próximo download",
        )
      }),
    )
  }

  return {
    studentId: student.id,
    certificatesUpdated: certificates.map((c) => ({ id: c.id, code: c.code })),
  }
}

/** "Revisei e está correto" — tira da fila sem alterar nada. */
export async function markTitularityReviewed(
  studentId: string,
  actor: TitularityActor,
  nota: string | null,
  scope?: { tenantId?: string; extraWhere?: Prisma.StudentWhereInput },
): Promise<boolean> {
  const where: Prisma.StudentWhereInput = {
    id: studentId,
    ...(scope?.tenantId ? { tenantId: scope.tenantId } : {}),
    ...(scope?.extraWhere ?? {}),
  }
  // O tenant precisa ir para a trilha: sem ele a dispensa some das visoes de
  // auditoria por unidade — e as dispensas sao as decisoes mais questionadas
  // depois ("voces olharam e disseram que estava certo?").
  const alvo = await prisma.student.findFirst({
    where,
    select: { tenantId: true },
  })
  if (!alvo) return false

  const result = await prisma.student.updateMany({
    where,
    data: {
      titularidadeRevisadaEm: new Date(),
      titularidadeRevisadaPorId: actor.userId,
    },
  })
  if (result.count === 0) return false

  // As dispensas são as decisões mais questionadas depois ("vocês olharam e
  // disseram que estava certo?"), então também entram na trilha.
  await prisma.auditLog.create({
    data: {
      action: "student.titularity.no_change",
      resource: "Student",
      resourceId: studentId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      actorEmail: actor.email,
      tenantId: alvo.tenantId,
      payloadAfter: { nota },
      ip: actor.ip,
      userAgent: actor.userAgent,
    },
  })
  return true
}
