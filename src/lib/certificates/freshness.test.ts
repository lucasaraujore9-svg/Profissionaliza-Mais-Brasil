import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock do Prisma: a checagem só lê updatedAt das fontes de design.
const templateFindFirst = vi.fn()
const templateFindUnique = vi.fn()
const tenantFindUnique = vi.fn()
const settingsFindUnique = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: {
    certificateTemplate: {
      findFirst: (...args: unknown[]) => templateFindFirst(...args),
      findUnique: (...args: unknown[]) => templateFindUnique(...args),
    },
    tenant: { findUnique: (...args: unknown[]) => tenantFindUnique(...args) },
    systemSettings: {
      findUnique: (...args: unknown[]) => settingsFindUnique(...args),
    },
  },
}))

// generate-pdf puxa @react-pdf/renderer e clients pesados — irrelevante aqui.
const generateAndUploadPdf = vi.fn()
vi.mock("./generate-pdf", () => ({
  generateAndUploadPdf: (...args: unknown[]) => generateAndUploadPdf(...args),
}))

vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ warn: vi.fn(), error: vi.fn() }),
}))

import {
  isCertificatePdfStale,
  ensureFreshCertificatePdf,
  RENDER_REVISION_AT,
} from "./freshness"

// A linha do tempo é ancorada em RENDER_REVISION_AT em vez de datas fixas: os
// casos abaixo testam as fontes de DADOS, e um PDF gerado antes da revisão do
// código é desatualizado por outro motivo — as asserções de "atual" passariam a
// medir a regra errada (e quebrariam a cada bump da revisão).
const DAY = 24 * 60 * 60 * 1000
const T0 = new Date(RENDER_REVISION_AT.getTime() + 1 * DAY) // antes da geração
const T1 = new Date(RENDER_REVISION_AT.getTime() + 5 * DAY) // geração do PDF
const T2 = new Date(RENDER_REVISION_AT.getTime() + 8 * DAY) // depois da geração

function mockSources(opts: {
  global?: Date | null
  tenantTemplate?: Date | null
  tenant?: Date | null
  settings?: Date | null
}) {
  templateFindFirst.mockResolvedValue(
    opts.global === null || opts.global === undefined
      ? null
      : { updatedAt: opts.global },
  )
  templateFindUnique.mockResolvedValue(
    opts.tenantTemplate ? { updatedAt: opts.tenantTemplate } : null,
  )
  tenantFindUnique.mockResolvedValue(
    opts.tenant ? { updatedAt: opts.tenant } : null,
  )
  settingsFindUnique.mockResolvedValue(
    opts.settings ? { updatedAt: opts.settings } : null,
  )
}

describe("isCertificatePdfStale — PDF acompanha o modelo vigente", () => {
  beforeEach(() => {
    templateFindFirst.mockReset()
    templateFindUnique.mockReset()
    tenantFindUnique.mockReset()
    settingsFindUnique.mockReset()
  })

  it("sem PDF ou sem data de geração => sempre desatualizado", async () => {
    expect(
      await isCertificatePdfStale({ tenantId: null, pdfUrl: null, pdfGeneratedAt: null }),
    ).toBe(true)
    expect(
      await isCertificatePdfStale({ tenantId: null, pdfUrl: "u", pdfGeneratedAt: null }),
    ).toBe(true)
  })

  it("nenhuma fonte mudou depois da geração => atual", async () => {
    mockSources({ global: T0, settings: T0 })
    expect(
      await isCertificatePdfStale({ tenantId: null, pdfUrl: "u", pdfGeneratedAt: T1 }),
    ).toBe(false)
  })

  it("template global salvo DEPOIS da geração => desatualizado (cert PMB)", async () => {
    mockSources({ global: T2, settings: T0 })
    expect(
      await isCertificatePdfStale({ tenantId: null, pdfUrl: "u", pdfGeneratedAt: T1 }),
    ).toBe(true)
  })

  it("revendedor trocou o layout DEPOIS da geração => desatualizado", async () => {
    mockSources({ global: T0, tenantTemplate: T2, tenant: T0, settings: T0 })
    expect(
      await isCertificatePdfStale({ tenantId: "t1", pdfUrl: "u", pdfGeneratedAt: T1 }),
    ).toBe(true)
  })

  it("cert PMB ignora fontes de tenant (não consulta tenant/template da unidade)", async () => {
    mockSources({ global: T0, settings: T0 })
    await isCertificatePdfStale({ tenantId: null, pdfUrl: "u", pdfGeneratedAt: T1 })
    expect(templateFindUnique).not.toHaveBeenCalled()
    expect(tenantFindUnique).not.toHaveBeenCalled()
  })

  it("branding do grupo (SystemSettings) mudou => desatualizado", async () => {
    mockSources({ global: T0, settings: T2 })
    expect(
      await isCertificatePdfStale({ tenantId: null, pdfUrl: "u", pdfGeneratedAt: T1 }),
    ).toBe(true)
  })

  it("PDF gerado ANTES da revisão do código => desatualizado, mesmo sem fonte de dados nova", async () => {
    // Foi o buraco que deixou "Aproveitamento: 67%" congelado num certificado
    // de conclusão: nenhuma fonte de DADOS se move quando muda o layout. As
    // fontes são anteriores ao próprio PDF de propósito — sem a regra da
    // revisão este caso é "atual", que é justamente o comportamento errado.
    const oldSource = new Date(RENDER_REVISION_AT.getTime() - 10 * DAY)
    mockSources({ global: oldSource, settings: oldSource })
    expect(
      await isCertificatePdfStale({
        tenantId: null,
        pdfUrl: "u",
        pdfGeneratedAt: new Date(RENDER_REVISION_AT.getTime() - 1),
      }),
    ).toBe(true)
  })

  it("revisão do código vence o fallback de erro de banco", async () => {
    templateFindFirst.mockRejectedValue(new Error("db down"))
    expect(
      await isCertificatePdfStale({
        tenantId: null,
        pdfUrl: "u",
        pdfGeneratedAt: new Date(RENDER_REVISION_AT.getTime() - 1),
      }),
    ).toBe(true)
  })

  it("erro de banco na checagem => assume atual (não bloqueia download)", async () => {
    templateFindFirst.mockRejectedValue(new Error("db down"))
    templateFindUnique.mockResolvedValue(null)
    tenantFindUnique.mockResolvedValue(null)
    settingsFindUnique.mockResolvedValue(null)
    expect(
      await isCertificatePdfStale({ tenantId: null, pdfUrl: "u", pdfGeneratedAt: T1 }),
    ).toBe(false)
  })
})

describe("ensureFreshCertificatePdf — regeneração com fallback", () => {
  beforeEach(() => {
    templateFindFirst.mockReset()
    templateFindUnique.mockReset()
    tenantFindUnique.mockReset()
    settingsFindUnique.mockReset()
    generateAndUploadPdf.mockReset()
  })

  it("PDF atual => devolve a URL existente sem regenerar", async () => {
    mockSources({ global: T0, settings: T0 })
    const url = await ensureFreshCertificatePdf({
      id: "c1",
      tenantId: null,
      pdfUrl: "https://x/old.pdf",
      pdfGeneratedAt: T1,
    })
    expect(url).toBe("https://x/old.pdf")
    expect(generateAndUploadPdf).not.toHaveBeenCalled()
  })

  it("PDF desatualizado => regenera e devolve a nova URL", async () => {
    mockSources({ global: T2, settings: T0 })
    generateAndUploadPdf.mockResolvedValue({ pdfUrl: "https://x/new.pdf" })
    const url = await ensureFreshCertificatePdf({
      id: "c1",
      tenantId: null,
      pdfUrl: "https://x/old.pdf",
      pdfGeneratedAt: T1,
    })
    expect(url).toBe("https://x/new.pdf")
    expect(generateAndUploadPdf).toHaveBeenCalledWith("c1")
  })

  it("regeneração falhou mas existe PDF antigo => serve o antigo", async () => {
    mockSources({ global: T2, settings: T0 })
    generateAndUploadPdf.mockRejectedValue(new Error("storage down"))
    const url = await ensureFreshCertificatePdf({
      id: "c1",
      tenantId: null,
      pdfUrl: "https://x/old.pdf",
      pdfGeneratedAt: T1,
    })
    expect(url).toBe("https://x/old.pdf")
  })

  it("sem PDF e geração falhou => null", async () => {
    mockSources({ global: T0, settings: T0 })
    generateAndUploadPdf.mockRejectedValue(new Error("storage down"))
    const url = await ensureFreshCertificatePdf({
      id: "c1",
      tenantId: null,
      pdfUrl: null,
      pdfGeneratedAt: null,
    })
    expect(url).toBeNull()
  })
})
