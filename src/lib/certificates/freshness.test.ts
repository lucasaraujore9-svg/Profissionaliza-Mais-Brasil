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

import { isCertificatePdfStale, ensureFreshCertificatePdf } from "./freshness"

const T0 = new Date("2026-06-01T00:00:00Z") // antes da geração
const T1 = new Date("2026-06-05T00:00:00Z") // geração do PDF
const T2 = new Date("2026-06-08T00:00:00Z") // depois da geração

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
