import { describe, it, expect, vi, beforeEach } from "vitest"

// QA-012: roteamento de suporte por tenant (fronteira de isolamento). A decisão
// isPmb (student.tenant.slug === "__pmb__") define se o ContactMessage nasce
// tenantId=null (caixa PMB, notificação ROLE:SUPER_ADMIN, e-mail PMB_SUPPORT) ou
// com o tenantId da revenda (notificação TENANT, e-mail do dono). Vazar aqui =
// PII de aluno de revenda na caixa PMB (ou vice-versa).

vi.mock("@/lib/prisma", () => ({
  prisma: { contactMessage: { create: vi.fn() } },
}))
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }))
vi.mock("@/lib/pmb-config", () => ({ PMB_TENANT_SLUG: "__pmb__" }))
vi.mock("@/lib/email/resend", () => ({
  sendEmail: vi.fn(),
  isEmailConfigured: vi.fn(() => true),
}))
vi.mock("@/lib/email/brand", () => ({
  PMB_EMAIL_BRAND: { name: "PMB" },
  emailFromForBrand: () => "PMB <x@pmb>",
  tenantEmailBrand: () => ({ name: "Loja 1" }),
}))
vi.mock("@/lib/tenant/urls", () => ({ appUrl: () => "https://pmb.test" }))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { prisma } from "@/lib/prisma"
import { createNotification } from "@/lib/notifications"
import { sendEmail, isEmailConfigured } from "@/lib/email/resend"
import { createStudentSupportTicket, type SupportStudent } from "./student-support"

const p = prisma as unknown as { contactMessage: { create: ReturnType<typeof vi.fn> } }
const notifyMock = createNotification as unknown as ReturnType<typeof vi.fn>
const sendEmailMock = sendEmail as unknown as ReturnType<typeof vi.fn>
const isEmailConfiguredMock = isEmailConfigured as unknown as ReturnType<typeof vi.fn>

function student(over: Partial<SupportStudent> = {}): SupportStudent {
  return {
    id: "s1",
    nome: "Aluno",
    email: "aluno@x.com",
    fone: null,
    tenantId: "t1",
    tenant: {
      slug: "loja1",
      name: "Loja 1",
      logoUrl: null,
      customDomain: null,
      domainVerified: null,
      supportEmail: null,
      owner: { email: "dono@loja1.com", name: "Dono" },
    },
    ...over,
  }
}

const input = { assunto: "Dúvida", mensagem: "Olá", source: "aluno" }

beforeEach(() => {
  vi.clearAllMocks()
  p.contactMessage.create.mockResolvedValue({})
  notifyMock.mockResolvedValue(undefined)
  sendEmailMock.mockResolvedValue(undefined)
  isEmailConfiguredMock.mockReturnValue(true)
})

describe("createStudentSupportTicket (QA-012)", () => {
  it("aluno PMB (slug __pmb__) → ContactMessage tenantId=null, notificação SUPER_ADMIN, e-mail PMB", async () => {
    const pmbStudent = student({
      tenantId: "pmb-placeholder",
      tenant: {
        slug: "__pmb__",
        name: "PMB",
        logoUrl: null,
        customDomain: null,
        domainVerified: null,
        supportEmail: null,
        owner: null,
      },
    })

    await createStudentSupportTicket({ student: pmbStudent, ...input })

    expect(p.contactMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: null, kind: "STUDENT_SUPPORT" }) }),
    )
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ audience: "ROLE", roleTarget: "SUPER_ADMIN" }),
    )
    const emailArg = sendEmailMock.mock.calls.at(-1)![0]
    expect(emailArg.to).toBe("atendimento@profissionalizamaisbrasil.com.br")
  })

  it("aluno de revenda → ContactMessage com tenantId da revenda, notificação TENANT, e-mail do dono", async () => {
    await createStudentSupportTicket({ student: student(), ...input })

    expect(p.contactMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: "t1" }) }),
    )
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ audience: "TENANT", tenantId: "t1" }),
    )
    const emailArg = sendEmailMock.mock.calls.at(-1)![0]
    expect(emailArg.to).toBe("dono@loja1.com")
  })

  it("falha ao persistir NÃO lança (best-effort) e segue com notificação", async () => {
    p.contactMessage.create.mockRejectedValue(new Error("db down"))

    await expect(createStudentSupportTicket({ student: student(), ...input })).resolves.toBeUndefined()
    expect(notifyMock).toHaveBeenCalled()
  })

  it("e-mail não configurado → não chama sendEmail (notificação continua)", async () => {
    isEmailConfiguredMock.mockReturnValue(false)

    await createStudentSupportTicket({ student: student(), ...input })

    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(notifyMock).toHaveBeenCalled()
  })
})
