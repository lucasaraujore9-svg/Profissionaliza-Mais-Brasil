import { describe, it, expect, vi, beforeEach } from "vitest"

// O `waStatus` gravado no Tenant é um SNAPSHOT: só era atualizado quando alguém
// abria /painel/automacao/conexao. Como o engine derruba o worker sozinho (e o
// religa sozinho depois), o snapshot mentia por dias — e o disparo desistia sem
// nem tentar. Em produção `wa_not_connected` foi a MAIOR causa de falha de
// automação (34 registros). Aqui travamos a regra nova: snapshot diferente de
// WORKING não decide nada sozinho — quem decide é o engine.

vi.mock("@/lib/prisma", () => ({
  prisma: {
    studentLead: { findUnique: vi.fn() },
    automationMessageTemplate: { findUnique: vi.fn(), findFirst: vi.fn() },
    studentLeadActivity: { create: vi.fn() },
  },
}))
vi.mock("./context", () => ({
  resolveAutomationContext: vi.fn(),
  syncWaSnapshot: vi.fn(),
}))
// A classe nasce DENTRO da factory: `vi.mock` é içado para o topo do arquivo e
// uma `class` no escopo do módulo ainda estaria na zona morta temporal.
vi.mock("./wa-client", () => ({
  ensureSessionWorking: vi.fn(),
  sendTextMessage: vi.fn(),
  WhatsAppNumberNotFoundError: class extends Error {},
  WhatsAppSessionDownError: class extends Error {
    sessionName: string
    liveStatus: string
    constructor(sessionName: string, liveStatus: string) {
      super("sessao fora do ar")
      this.sessionName = sessionName
      this.liveStatus = liveStatus
    }
  },
}))
vi.mock("./health", () => ({ alertWaDisconnected: vi.fn(async () => true) }))
vi.mock("@/lib/ratelimit", () => ({
  rateLimitByKey: vi.fn(async () => ({ ok: true })),
  RATE_LIMITS: { waSend: {} },
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))
vi.mock("@/lib/errors", () => ({ swallow: () => () => undefined }))

import { prisma } from "@/lib/prisma"
import { sendLeadMessage } from "./dispatch"
import { resolveAutomationContext, syncWaSnapshot } from "./context"
import {
  ensureSessionWorking,
  sendTextMessage,
  WhatsAppSessionDownError,
} from "./wa-client"
import { alertWaDisconnected } from "./health"

const p = prisma as unknown as {
  studentLead: { findUnique: ReturnType<typeof vi.fn> }
  automationMessageTemplate: { findUnique: ReturnType<typeof vi.fn> }
  studentLeadActivity: { create: ReturnType<typeof vi.fn> }
}

// `ensureChannelReady` memoiza a checagem por sessão (60s) para o sweep não
// repetir o round-trip ao engine a cada lead da mesma unidade. O memo é do
// módulo, então cada teste precisa da PRÓPRIA sessão para não herdar o
// resultado do anterior.
let sessionSeq = 0

// Idade do snapshot em minutos. O default (1 min) representa o snapshot
// recém-escrito pela varredura de saúde; passe algo além de 6h para simular o
// snapshot congelado que causou o incidente de 2026-08-11.
function arrange(snapshotStatus: string, snapshotAgeMs = 60_000): string {
  const sessionName = `s_unidade_${++sessionSeq}`
  p.studentLead.findUnique.mockResolvedValue({
    id: "lead-1",
    tenantId: "t1",
    nome: "Maria",
    telefone: "+5511999999999",
    courseSnapshot: "Cuidador de Idosos",
    courseId: "c1",
    course: { slug: "cuidador-de-idosos" },
  })
  p.automationMessageTemplate.findUnique.mockResolvedValue({
    body: "Olá {{aluno_nome}}",
    enabled: true,
  })
  p.studentLeadActivity.create.mockResolvedValue({})
  vi.mocked(resolveAutomationContext).mockResolvedValue({
    tenantId: "t1",
    enabled: true,
    waSessionName: sessionName,
    waConnectedPhone: "+5511888888888",
    waStatus: snapshotStatus,
    waStatusUpdatedAt: new Date(Date.now() - snapshotAgeMs),
    abandonedAfterHours: 2,
    displayName: "Unidade Teste",
    publicHost: "unidade.livrecursos.com.br",
  })
  vi.mocked(sendTextMessage).mockResolvedValue({ engineMessageId: "eng-1" })
  return sessionName
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("dispatch — snapshot obsoleto do WhatsApp não pode barrar o disparo", () => {
  it("snapshot DISCONNECTED mas sessão viva no engine → ENVIA", async () => {
    const session = arrange("DISCONNECTED")
    vi.mocked(ensureSessionWorking).mockResolvedValue({
      status: "WORKING",
      connectedPhone: "+5511888888888",
      qrDataUrl: null,
    })

    await sendLeadMessage({ leadId: "lead-1", templateKey: "FORM_SUBMITTED" })

    expect(ensureSessionWorking).toHaveBeenCalledWith(session)
    expect(sendTextMessage).toHaveBeenCalledTimes(1)
    expect(p.studentLeadActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "WA_MESSAGE_SENT" }),
      }),
    )
  })

  it("consulta ao engine corrige o snapshot no banco (o painel parava de mentir)", async () => {
    arrange("DISCONNECTED")
    vi.mocked(ensureSessionWorking).mockResolvedValue({
      status: "WORKING",
      connectedPhone: "+5511888888888",
      qrDataUrl: null,
    })

    await sendLeadMessage({ leadId: "lead-1", templateKey: "FORM_SUBMITTED" })

    expect(syncWaSnapshot).toHaveBeenCalledWith(
      "t1",
      "WORKING",
      "+5511888888888",
    )
  })

  it("sessão realmente caída (precisa de QR) → registra falha, não envia", async () => {
    arrange("DISCONNECTED")
    vi.mocked(ensureSessionWorking).mockResolvedValue({
      status: "SCAN_QR_CODE",
      connectedPhone: null,
      qrDataUrl: null,
    })

    await sendLeadMessage({ leadId: "lead-1", templateKey: "FORM_SUBMITTED" })

    expect(sendTextMessage).not.toHaveBeenCalled()
    expect(p.studentLeadActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "WA_MESSAGE_FAILED",
          metadata: expect.objectContaining({ reason: "wa_not_connected" }),
        }),
      }),
    )
  })

  it("canal caído AVISA a unidade — antes a automação parava em silêncio", async () => {
    // O painel seguia dizendo "conectado" e ninguém descobria que o canal tinha
    // morrido. Reconectar só o dono faz; avisar é a única correção possível.
    arrange("DISCONNECTED")
    vi.mocked(ensureSessionWorking).mockResolvedValue({
      status: "SCAN_QR_CODE",
      connectedPhone: null,
      qrDataUrl: null,
    })

    await sendLeadMessage({ leadId: "lead-1", templateKey: "FORM_SUBMITTED" })

    expect(alertWaDisconnected).toHaveBeenCalledWith("t1", "SCAN_QR_CODE")
  })

  it("canal saudável NÃO avisa nada", async () => {
    arrange("DISCONNECTED")
    vi.mocked(ensureSessionWorking).mockResolvedValue({
      status: "WORKING",
      connectedPhone: "+5511888888888",
      qrDataUrl: null,
    })

    await sendLeadMessage({ leadId: "lead-1", templateKey: "FORM_SUBMITTED" })

    expect(alertWaDisconnected).not.toHaveBeenCalled()
  })

  it("snapshot WORKING RECENTE é atalho — não gasta round-trip no engine", async () => {
    arrange("WORKING")

    await sendLeadMessage({ leadId: "lead-1", templateKey: "FORM_SUBMITTED" })

    expect(ensureSessionWorking).not.toHaveBeenCalled()
    expect(sendTextMessage).toHaveBeenCalledTimes(1)
  })
})

// Em 2026-08-11, 28 das 46 unidades marcadas WORKING estavam FAILED no engine,
// com snapshots parados havia semanas. O atalho do snapshot não tinha prazo de
// validade, então essas unidades nunca consultavam o engine, nunca eram
// avisadas e nunca tinham o snapshot corrigido — o estado errado se
// auto-perpetuava e a automação ficava parada em silêncio.
describe("dispatch — snapshot WORKING não vale para sempre", () => {
  const SEIS_HORAS_E_MEIA = 6.5 * 60 * 60 * 1000

  it("snapshot WORKING VELHO deixa de ser atalho — pergunta ao engine", async () => {
    const session = arrange("WORKING", SEIS_HORAS_E_MEIA)
    vi.mocked(ensureSessionWorking).mockResolvedValue({
      status: "WORKING",
      connectedPhone: "+5511888888888",
      qrDataUrl: null,
    })

    await sendLeadMessage({ leadId: "lead-1", templateKey: "FORM_SUBMITTED" })

    expect(ensureSessionWorking).toHaveBeenCalledWith(session)
    expect(sendTextMessage).toHaveBeenCalledTimes(1)
  })

  it("snapshot WORKING velho e canal morto → avisa em vez de falhar calado", async () => {
    arrange("WORKING", SEIS_HORAS_E_MEIA)
    vi.mocked(ensureSessionWorking).mockResolvedValue({
      status: "SCAN_QR_CODE",
      connectedPhone: null,
      qrDataUrl: null,
    })

    await sendLeadMessage({ leadId: "lead-1", templateKey: "FORM_SUBMITTED" })

    expect(sendTextMessage).not.toHaveBeenCalled()
    expect(alertWaDisconnected).toHaveBeenCalledWith("t1", "SCAN_QR_CODE")
  })

  it("sem data de snapshot, não confia no WORKING", async () => {
    const session = `s_unidade_${++sessionSeq}`
    arrange("WORKING")
    vi.mocked(resolveAutomationContext).mockResolvedValue({
      tenantId: "t1",
      enabled: true,
      waSessionName: session,
      waConnectedPhone: "+5511888888888",
      waStatus: "WORKING",
      waStatusUpdatedAt: null,
      abandonedAfterHours: 2,
      displayName: "Unidade Teste",
      publicHost: "unidade.livrecursos.com.br",
    })
    vi.mocked(ensureSessionWorking).mockResolvedValue({
      status: "WORKING",
      connectedPhone: "+5511888888888",
      qrDataUrl: null,
    })

    await sendLeadMessage({ leadId: "lead-1", templateKey: "FORM_SUBMITTED" })

    expect(ensureSessionWorking).toHaveBeenCalledWith(session)
  })
})

// O envio podia atravessar o atalho e só então bater no 422 do engine
// ("Session status is not as expected"). A falha era registrada no lead, mas o
// snapshot continuava WORKING e ninguém era avisado: a unidade falhava TODOS os
// disparos seguintes, indefinidamente, exibindo "conectado" no painel.
describe("dispatch — 422 do engine corrige o snapshot e avisa", () => {
  // Depois de `arrange` — que arma o caminho feliz do envio — para derrubar o
  // canal exatamente no momento do POST ao engine.
  function canalCaiNoEnvio(session: string): void {
    vi.mocked(sendTextMessage).mockRejectedValue(
      new WhatsAppSessionDownError(session, "FAILED"),
    )
  }

  it("corrige o snapshot mentiroso no banco", async () => {
    canalCaiNoEnvio(arrange("WORKING"))

    await sendLeadMessage({ leadId: "lead-1", templateKey: "FORM_SUBMITTED" })

    expect(syncWaSnapshot).toHaveBeenCalledWith("t1", "FAILED", null)
  })

  it("avisa a unidade que precisa reconectar", async () => {
    canalCaiNoEnvio(arrange("WORKING"))

    await sendLeadMessage({ leadId: "lead-1", templateKey: "FORM_SUBMITTED" })

    expect(alertWaDisconnected).toHaveBeenCalledWith("t1", "FAILED")
  })

  it("registra a falha como canal desconectado, não como erro genérico", async () => {
    canalCaiNoEnvio(arrange("WORKING"))

    await sendLeadMessage({ leadId: "lead-1", templateKey: "FORM_SUBMITTED" })

    expect(p.studentLeadActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "WA_MESSAGE_FAILED",
          metadata: expect.objectContaining({ reason: "wa_not_connected" }),
        }),
      }),
    )
  })
})
