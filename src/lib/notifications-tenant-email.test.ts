import { describe, it, expect, vi, beforeEach } from "vitest"

// `sendTenantNotificationEmails` é o que diz ao cron de cobrança se o email
// SAIU. Nos apagões de SMTP de setembro/2026 ninguém conferia: o aviso ficava
// marcado como entregue e a unidade nunca recebia.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notificationCategoryConfig: { findUnique: vi.fn() },
    notificationPreference: { findFirst: vi.fn() },
    user: { findFirst: vi.fn(), findUnique: vi.fn() },
    tenantMember: { findMany: vi.fn() },
  },
}))
vi.mock("@/lib/notifications/push-server", () => ({ sendPushToTarget: vi.fn(), sendPushToUsers: vi.fn() }))
vi.mock("@/lib/email/mailer", () => ({ sendEmail: vi.fn() }))
vi.mock("@/lib/email/tenant-brand", () => ({ loadTenantEmailBrand: vi.fn() }))
vi.mock("@/lib/after-response", () => ({ afterResponse: vi.fn() }))
vi.mock("@/lib/logger", () => ({ contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))

import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email/mailer"
import { loadTenantEmailBrand } from "@/lib/email/tenant-brand"
import { sendTenantNotificationEmails } from "./notifications"

type AnyMock = ReturnType<typeof vi.fn>
const db = prisma as unknown as {
  notificationCategoryConfig: { findUnique: AnyMock }
  notificationPreference: { findFirst: AnyMock }
  user: { findFirst: AnyMock; findUnique: AnyMock }
  tenantMember: { findMany: AnyMock }
}
const send = sendEmail as unknown as AnyMock

const AVISO = {
  tenantId: "t1",
  title: "Sua mensalidade vence hoje — R$ 209,00",
  body: "Pague hoje.",
  category: "tenant-billing",
  href: "/painel/cobrancas",
}

beforeEach(() => {
  vi.resetAllMocks()
  db.notificationCategoryConfig.findUnique.mockResolvedValue(null)
  db.notificationPreference.findFirst.mockResolvedValue(null)
  db.user.findFirst.mockResolvedValue({ id: "dono" })
  db.user.findUnique.mockResolvedValue({ email: "dono@x.com", tenantId: "t1" })
  db.tenantMember.findMany.mockResolvedValue([])
  ;(loadTenantEmailBrand as unknown as AnyMock).mockResolvedValue({
    isPmb: false,
    siteUrl: "https://unidade.livrecursos.com.br",
    replyTo: null,
  })
  send.mockResolvedValue({ id: "e1" })
})

describe("sendTenantNotificationEmails", () => {
  it("email aceito: nada pendente", async () => {
    expect(await sendTenantNotificationEmails(AVISO)).toBe(true)
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "dono@x.com", subject: AVISO.title }),
    )
  })

  it("provedor recusou: devolve false para o chamador tentar de novo", async () => {
    send.mockRejectedValue(new Error("554 5.7.1 Outbound sending is disabled"))

    expect(await sendTenantNotificationEmails(AVISO)).toBe(false)
  })

  it("dono desligou o email da categoria: nada a enviar, nada pendente", async () => {
    db.notificationPreference.findFirst.mockResolvedValue({ inApp: true, email: false })

    expect(await sendTenantNotificationEmails(AVISO)).toBe(true)
    expect(send).not.toHaveBeenCalled()
  })

  it("categoria desligada no kill-switch global: não envia", async () => {
    db.notificationCategoryConfig.findUnique.mockResolvedValue({ enabled: false })

    expect(await sendTenantNotificationEmails(AVISO)).toBe(true)
    expect(send).not.toHaveBeenCalled()
  })
})
