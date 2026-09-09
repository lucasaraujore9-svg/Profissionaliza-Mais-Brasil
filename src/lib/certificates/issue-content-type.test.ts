import { describe, it, expect, vi, beforeEach } from "vitest"

/*
 * E-BOOK NÃO EMITE CERTIFICADO.
 *
 * O gate mora no NÚCLEO (`issueCertificateIfEligible`) e não em cada tela porque
 * a emissão tem quatro portas — automática pelo progresso da EA, delta do LMS,
 * emissão manual do /admin e do /painel, e o botão do próprio aluno. A lição do
 * `GUARDIAN_REQUIRED` foi que gate nascido numa rota só deixa as outras cobrando
 * errado por meses.
 *
 * O que precisa ser provado:
 *  (a) e-book é recusado com um erro PRÓPRIO (e não o genérico, que mandaria o
 *      aluno "tentar de novo" para sempre);
 *  (b) a recusa vem ANTES de tudo — nem chega a consultar o interruptor da cota;
 *  (c) `force` NÃO abre exceção: o SUPER_ADMIN pode forçar uma emissão travada
 *      pela cota, mas ninguém transforma um e-book em curso livre;
 *  (d) curso continua emitindo (a exceção não vaza).
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    enrollment: { findUnique: vi.fn(), update: vi.fn() },
    student: { update: vi.fn() },
    certificate: { findFirst: vi.fn(), create: vi.fn() },
    systemSettings: { upsert: vi.fn() },
  },
}))
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }))
vi.mock("./generate-pdf", () => ({ generateAndUploadPdf: vi.fn(async () => undefined) }))
vi.mock("./template-resolver", () => ({
  resolveCertificateTemplate: vi.fn(async () => ({})),
}))
vi.mock("./code", () => ({ generateCertificateCode: vi.fn(async () => "ABC123") }))
vi.mock("@/lib/enrollment/pace-settings", () => ({
  resolvePaceGateSettings: vi.fn(async () => ({ enabled: true, strict: false })),
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { prisma } from "@/lib/prisma"
import { resolvePaceGateSettings } from "@/lib/enrollment/pace-settings"
import { issueCertificateIfEligible, NotCertifiableError } from "./issue"

const p = prisma as unknown as {
  enrollment: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  student: { update: ReturnType<typeof vi.fn> }
  certificate: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }
  systemSettings: { upsert: ReturnType<typeof vi.fn> }
}
const settingsMock = resolvePaceGateSettings as unknown as ReturnType<typeof vi.fn>

/** Matrícula quitada e concluída — só o TIPO do conteúdo varia entre os casos. */
function matricula(contentType: "COURSE" | "EBOOK") {
  return {
    id: "e1",
    status: "ACTIVE",
    studentId: "s1",
    courseId: "c1",
    tenantId: "t1",
    paymentType: "ONE_TIME",
    installmentsPaid: 1,
    installmentsTotal: null,
    progressPercent: 100,
    student: { id: "s1", nome: "Maria", cpf: "12345678909" },
    course: { id: "c1", nome: "Guia do Eletricista", contentType },
    tenant: { id: "t1", slug: "unidade", name: "Unidade" },
    primaryEnrollment: null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  p.enrollment.update.mockResolvedValue({})
  p.student.update.mockResolvedValue({})
  p.certificate.findFirst.mockResolvedValue(null)
  p.certificate.create.mockResolvedValue({ id: "cert1", code: "ABC123" })
  p.systemSettings.upsert.mockResolvedValue({
    certificateRequireCpf: false,
    certificateMinPercent: 80,
  })
})

describe("issueCertificateIfEligible — tipo de conteúdo", () => {
  it("recusa e-book com erro próprio, não com o genérico", async () => {
    p.enrollment.findUnique.mockResolvedValue(matricula("EBOOK"))

    await expect(issueCertificateIfEligible("e1")).rejects.toBeInstanceOf(
      NotCertifiableError,
    )
    expect(p.certificate.create).not.toHaveBeenCalled()
  })

  it("recusa ANTES de consultar o interruptor da cota", async () => {
    p.enrollment.findUnique.mockResolvedValue(matricula("EBOOK"))

    await expect(issueCertificateIfEligible("e1")).rejects.toBeInstanceOf(
      NotCertifiableError,
    )
    expect(settingsMock).not.toHaveBeenCalled()
  })

  it("`force` NÃO abre exceção — não se transforma e-book em curso livre", async () => {
    p.enrollment.findUnique.mockResolvedValue(matricula("EBOOK"))

    await expect(
      issueCertificateIfEligible("e1", "MANUAL_ADMIN", "u1", { force: true }),
    ).rejects.toBeInstanceOf(NotCertifiableError)
    expect(p.certificate.create).not.toHaveBeenCalled()
  })

  it("curso continua emitindo (a exceção não vaza)", async () => {
    p.enrollment.findUnique.mockResolvedValue(matricula("COURSE"))

    await issueCertificateIfEligible("e1")

    expect(p.certificate.create).toHaveBeenCalled()
  })
})
