import { beforeEach, describe, expect, it, vi } from "vitest"

const tx = {
  student: { update: vi.fn() },
  certificate: { update: vi.fn() },
  auditLog: { create: vi.fn() },
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    student: { findFirst: vi.fn(), updateMany: vi.fn() },
    certificate: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
  },
}))
vi.mock("@/lib/certificates/generate-pdf", () => ({
  generateAndUploadPdf: vi.fn(async () => undefined),
}))
vi.mock("@/lib/students/plataforma-actions", () => ({
  syncStudentProfileToEA: vi.fn(async () => undefined),
}))
// `afterResponse` executa na hora no teste: queremos observar o efeito.
vi.mock("@/lib/after-response", () => ({
  afterResponse: (fn: () => Promise<unknown>) => void fn(),
}))

import { prisma } from "@/lib/prisma"
import { generateAndUploadPdf } from "@/lib/certificates/generate-pdf"
import {
  applyTitularityCorrection,
  markTitularityReviewed,
  titularitySchema,
  TitularityCpfRequiredError,
  TitularityScopeError,
} from "./apply"

const p = prisma as unknown as {
  student: { findFirst: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> }
  certificate: { findMany: ReturnType<typeof vi.fn> }
  auditLog: { create: ReturnType<typeof vi.fn> }
}

const ACTOR = {
  userId: "u1",
  role: "SUPER_ADMIN",
  email: "admin@pmb.com.br",
  ip: null,
  userAgent: null,
}

const ALUNO_LEGADO = {
  id: "s1",
  tenantId: "t1",
  nome: "MARIA DA SILVA", // a mãe, cadastrada como se fosse a aluna
  cpf: "39053344705",
  nascimento: null,
  responsavel: null,
  cpfResponsavel: null,
}

const CERT = {
  id: "cert1",
  code: "PMB-7K3X9A2",
  studentName: "MARIA DA SILVA",
  studentCpf: "39053344705",
}

/** O que a tela envia: nome do filho + a mãe como responsável. */
const INPUT = {
  nome: "João Pedro da Silva",
  cpf: "",
  nascimento: "",
  responsavel: "Maria da Silva",
  responsavelCpf: "39053344705",
  corrigirCertificados: true,
  justificativa: "Conferido o RG do aluno na unidade",
  confirmado: true as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  p.student.findFirst.mockResolvedValue(ALUNO_LEGADO)
  p.certificate.findMany.mockResolvedValue([CERT])
  p.student.updateMany.mockResolvedValue({ count: 1 })
})

function parse(over: Record<string, unknown> = {}) {
  const r = titularitySchema.safeParse({ ...INPUT, ...over })
  if (!r.success) throw new Error(JSON.stringify(r.error.flatten().fieldErrors))
  return r.data
}

describe("titularitySchema — o cadastro LEGADO precisa passar", () => {
  it("aceita correção SEM data de nascimento e SEM contato do responsável", () => {
    // 217 dos 230 alunos em produção não têm data, e a unidade raramente tem o
    // e-mail/telefone da mãe em mãos. Exigir qualquer um dos dois travaria
    // exatamente os registros que este fluxo existe para consertar.
    expect(titularitySchema.safeParse(INPUT).success).toBe(true)
  })

  it("continua recusando CPF do responsável igual ao do aluno", () => {
    const r = titularitySchema.safeParse({ ...INPUT, cpf: "39053344705" })
    expect(r.success).toBe(false)
  })

  it("exige justificativa e confirmação — é documento oficial", () => {
    expect(
      titularitySchema.safeParse({ ...INPUT, justificativa: "curta" }).success,
    ).toBe(false)
    expect(
      titularitySchema.safeParse({ ...INPUT, confirmado: false }).success,
    ).toBe(false)
  })
})

describe("applyTitularityCorrection", () => {
  it("o cadastro passa a ser do ALUNO e a mãe vira responsável", async () => {
    await applyTitularityCorrection("s1", parse({ cpf: "529.982.247-25" }), ACTOR)

    const data = tx.student.update.mock.calls[0]![0].data
    expect(data.nome).toBe("João Pedro da Silva")
    expect(data.responsavel).toBe("Maria da Silva")
    expect(data.cpfResponsavel).toBe("39053344705")
  })

  it("MANTÉM o código do certificado e só troca o snapshot", async () => {
    // Trocar o código faria /validar/{code} responder "não encontrado" para
    // quem conferisse o código antigo — lê como fraude.
    await applyTitularityCorrection("s1", parse({ cpf: "529.982.247-25" }), ACTOR)

    const call = tx.certificate.update.mock.calls[0]![0]
    expect(call.where).toEqual({ id: "cert1" })
    expect(call.data).not.toHaveProperty("code")
    expect(call.data.studentName).toBe("João Pedro da Silva")
  })

  it("nulifica pdfUrl e pdfGeneratedAt para forçar a regeneração", async () => {
    await applyTitularityCorrection("s1", parse({ cpf: "529.982.247-25" }), ACTOR)

    const data = tx.certificate.update.mock.calls[0]![0].data
    expect(data.pdfUrl).toBeNull()
    expect(data.pdfGeneratedAt).toBeNull()
  })

  it("NÃO toca em certificado revogado (é fato histórico)", async () => {
    await applyTitularityCorrection("s1", parse({ cpf: "529.982.247-25" }), ACTOR)
    expect(p.certificate.findMany.mock.calls[0]![0].where).toMatchObject({
      revokedAt: null,
    })
  })

  it("regenera o PDF de forma ansiosa após o commit", async () => {
    await applyTitularityCorrection("s1", parse({ cpf: "529.982.247-25" }), ACTOR)
    expect(generateAndUploadPdf).toHaveBeenCalledWith("cert1")
  })

  it("audita DENTRO da transação: aluno + um log por certificado", async () => {
    // `logAudit` engole falha por design; para reescrita de documento oficial um
    // buraco silencioso na trilha é inaceitável, então vai na transação.
    await applyTitularityCorrection("s1", parse({ cpf: "529.982.247-25" }), ACTOR)

    const actions = tx.auditLog.create.mock.calls.map((c) => c[0].data.action)
    expect(actions).toContain("certificate.titularity.correct")
    expect(actions).toContain("student.titularity.correct")
    expect(p.auditLog.create).not.toHaveBeenCalled()
  })

  it("EXIGE o CPF do aluno quando há certificado a reescrever", async () => {
    // Trocar o nome e gravar `studentCpf: null` produziria um certificado sem
    // CPF — o CPF é impresso no documento e conferido na validação pública.
    await expect(
      applyTitularityCorrection("s1", parse(), ACTOR),
    ).rejects.toBeInstanceOf(TitularityCpfRequiredError)
    expect(tx.student.update).not.toHaveBeenCalled()
    expect(tx.certificate.update).not.toHaveBeenCalled()
  })

  it("com o CPF do aluno informado, o certificado é corrigido", async () => {
    await applyTitularityCorrection(
      "s1",
      parse({ cpf: "529.982.247-25" }),
      ACTOR,
    )
    expect(tx.certificate.update.mock.calls[0]![0].data.studentCpf).toBe(
      "52998224725",
    )
  })

  it("SEM certificado, o CPF do aluno continua opcional", async () => {
    // A maioria dos cadastros a corrigir não tem certificado; travar a correção
    // do NOME por um documento ausente seria pior do que corrigir só o nome.
    p.certificate.findMany.mockResolvedValue([])
    await applyTitularityCorrection("s1", parse(), ACTOR)
    expect(tx.student.update).toHaveBeenCalledTimes(1)
  })

  it("não corrige certificados quando a pessoa optou por não corrigir", async () => {
    await applyTitularityCorrection(
      "s1",
      parse({ corrigirCertificados: false }),
      ACTOR,
    )
    expect(tx.certificate.update).not.toHaveBeenCalled()
  })

  it("escopo: aluno de outra unidade não é alcançado", async () => {
    p.student.findFirst.mockResolvedValue(null)
    await expect(
      applyTitularityCorrection("s1", parse(), ACTOR, { tenantId: "outro" }),
    ).rejects.toBeInstanceOf(TitularityScopeError)
    expect(tx.student.update).not.toHaveBeenCalled()
  })

  it("o escopo de CARTEIRA entra no where da busca", async () => {
    // Sem isto, um Vendedor reescreveria o cadastro de qualquer aluno da unidade.
    await applyTitularityCorrection("s1", parse(), ACTOR, {
      tenantId: "t1",
      extraWhere: { enrollments: { some: { soldByUserId: "u9" } } },
    }).catch(() => undefined)

    expect(p.student.findFirst.mock.calls[0]![0].where).toMatchObject({
      id: "s1",
      tenantId: "t1",
      enrollments: { some: { soldByUserId: "u9" } },
    })
  })
})

describe("markTitularityReviewed", () => {
  it("grava o tenantId na trilha (senão some da auditoria da unidade)", async () => {
    p.student.findFirst.mockResolvedValue({ tenantId: "t1" })

    await markTitularityReviewed("s1", ACTOR, "conferido", { tenantId: "t1" })

    const data = p.auditLog.create.mock.calls[0]![0].data
    expect(data.action).toBe("student.titularity.no_change")
    expect(data.tenantId).toBe("t1")
  })

  it("devolve false quando o aluno está fora do escopo", async () => {
    p.student.findFirst.mockResolvedValue(null)
    expect(
      await markTitularityReviewed("s1", ACTOR, null, { tenantId: "outro" }),
    ).toBe(false)
    expect(p.student.updateMany).not.toHaveBeenCalled()
  })
})
