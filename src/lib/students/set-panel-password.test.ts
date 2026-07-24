import { describe, it, expect, vi, beforeEach } from "vitest"

// Senha do painel /aluno (a NOSSA, não a da plataforma de aulas). O módulo puxa
// prisma + email + branding no topo — stubamos tudo que não está sob teste.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    student: { findFirst: vi.fn(), update: vi.fn() },
  },
}))
vi.mock("bcryptjs", () => ({ hash: vi.fn(async (p: string) => `hash(${p})`) }))
vi.mock("@/lib/email/resend", () => ({
  sendEmail: vi.fn(),
  isEmailConfigured: () => true,
}))
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }))
vi.mock("@/lib/students/generate-password", () => ({
  generateTemporaryPassword: () => "GERADA1234",
}))
// Só o host precisa ser determinístico — o resto de urls.ts (custom domain,
// vitrine) é usado pelo branding do email e vale rodar de verdade.
vi.mock("@/lib/tenant/urls", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tenant/urls")>()),
  appUrl: () => "https://pmb.test",
  appDomain: () => "pmb.test",
}))
vi.mock("@/lib/pmb-config", () => ({ PMB_TENANT_SLUG: "__pmb__" }))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email/resend"
import { resetStudentPassword } from "@/lib/students/management"

const findFirst = vi.mocked(prisma.student.findFirst)
const update = vi.mocked(prisma.student.update)
const sendEmailMock = vi.mocked(sendEmail)

function mockStudent(email: string | null) {
  findFirst.mockResolvedValue({
    id: "stu_1",
    nome: "Maria Silva",
    email,
    tenant: {
      slug: "revenda1",
      name: "Revenda 1",
      logoUrl: null,
      customDomain: null,
      domainVerified: false,
      supportEmail: null,
    },
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  update.mockResolvedValue({} as never)
  sendEmailMock.mockResolvedValue(undefined as never)
})

describe("resetStudentPassword", () => {
  it("sem newPassword gera uma temporária e mantém passwordSetAt nulo", async () => {
    mockStudent("maria@example.com")

    const result = await resetStudentPassword("stu_1")

    expect(result).toMatchObject({
      tempPassword: "GERADA1234",
      generated: true,
      emailSent: true,
    })
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordHash: "hash(GERADA1234)",
          passwordSetAt: null,
        }),
      }),
    )
  })

  it("com newPassword grava a senha escolhida e marca passwordSetAt", async () => {
    mockStudent("maria@example.com")

    const result = await resetStudentPassword("stu_1", {
      newPassword: "SenhaDoAluno1",
    })

    expect(result).toMatchObject({
      tempPassword: "SenhaDoAluno1",
      generated: false,
    })
    const data = update.mock.calls[0][0].data as {
      passwordHash: string
      passwordSetAt: Date | null
    }
    expect(data.passwordHash).toBe("hash(SenhaDoAluno1)")
    // Senha conhecida e deliberada — não é temporária, então não fica pendente.
    expect(data.passwordSetAt).toBeInstanceOf(Date)
  })

  it("senha definida não é anunciada como temporária no email", async () => {
    mockStudent("maria@example.com")

    await resetStudentPassword("stu_1", { newPassword: "SenhaDoAluno1" })

    const arg = sendEmailMock.mock.calls[0][0] as {
      subject: string
      template: { props: { passwordLabel?: string } }
    }
    expect(arg.subject).not.toContain("temporária")
    expect(arg.template.props.passwordLabel).toBe("Sua senha")
  })

  it("aluno sem email aceita senha definida (sem enviar email)", async () => {
    mockStudent(null)

    const result = await resetStudentPassword("stu_1", {
      newPassword: "SenhaDoAluno1",
    })

    expect(result).toMatchObject({ generated: false, emailSent: false })
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it("aluno sem email recusa a senha gerada — ela só existe para ser enviada", async () => {
    mockStudent(null)

    const result = await resetStudentPassword("stu_1")

    expect(result).toEqual({ error: "Aluno sem email cadastrado" })
    expect(update).not.toHaveBeenCalled()
  })

  it("escopa a busca pelo tenant quando o painel do revendedor chama", async () => {
    mockStudent("maria@example.com")

    await resetStudentPassword("stu_1", { tenantId: "t1" })

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "stu_1", tenantId: "t1" } }),
    )
  })
})
