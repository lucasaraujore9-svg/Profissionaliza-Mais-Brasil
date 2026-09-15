import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    coursePackage: { findFirst: vi.fn(), update: vi.fn() },
    coursePackageItem: { deleteMany: vi.fn() },
    course: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock("@/lib/auth/painel-guard", () => ({ requirePainel: vi.fn() }))
vi.mock("@/lib/packages/slug", () => ({ ensureUniquePackageSlug: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { painelGuardOk } from "@/test/painel-ctx"
import { GET, PUT } from "./route"

type Fn = ReturnType<typeof vi.fn>
const db = prisma as unknown as {
  coursePackage: { findFirst: Fn; update: Fn }
  coursePackageItem: { deleteMany: Fn }
  course: { findMany: Fn }
  $transaction: Fn
}
const guardMock = requirePainel as unknown as Fn

const T = "t_rota"
const PKG = "pkg1"

function curso(id: string, nome: string, status = "ATIVO") {
  return {
    id,
    nome,
    status,
    authorTenantId: null,
    visibilityMode: "ALL",
    allowedTenantIds: [],
    blockedTenantIds: [],
  }
}

const INSTAGRAM = curso("ea_40", "Instagram para Vendas")
const TECNICAS_EA = curso("ea_31", "Técnicas de Vendas", "INATIVO")
const TECNICA_LMS = curso("lms_tv", "Técnica de vendas")

const params = { params: Promise.resolve({ id: PKG }) }

function put(courseIds: string[]) {
  return new Request(`http://x/api/painel/pacotes/${PKG}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Barbeiro Profissional", price: 297, courseIds }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  guardMock.mockResolvedValue(painelGuardOk({ tenantId: T }))
  db.$transaction.mockResolvedValue([])
})

// Caso real (Rota do Aprendizado, 15/09): o pacote guardava um curso que foi
// desativado depois da montagem. A lista de seleção não o mostrava, mas ele
// seguia no formulário — e todo salvamento era recusado, qualquer que fosse a
// edição, com uma mensagem que não dizia qual curso travava.
describe("pacote da unidade com curso que deixou de valer", () => {
  it("GET aponta o curso indisponível e o motivo", async () => {
    db.coursePackage.findFirst.mockResolvedValue({
      id: PKG,
      name: "Barbeiro Profissional",
      slug: "barbeiro",
      description: null,
      coverImageUrl: null,
      price: 297,
      enabled: true,
      featured: false,
      items: [{ course: INSTAGRAM }, { course: TECNICAS_EA }],
    })
    const res = await GET(new Request(`http://x/api/painel/pacotes/${PKG}`), params)
    const json = await res.json()
    expect(json.data.courseIds).toEqual(["ea_40", "ea_31"])
    expect(json.data.unavailableCourses).toEqual([
      { id: "ea_31", nome: "Técnicas de Vendas", reason: "curso inativo" },
    ])
  })

  it("PUT mantendo o curso inativo é recusado nomeando o curso", async () => {
    db.coursePackage.findFirst.mockResolvedValue({ id: PKG, name: "Barbeiro Profissional" })
    db.course.findMany.mockResolvedValue([INSTAGRAM, TECNICAS_EA, TECNICA_LMS])
    const res = await PUT(put(["ea_40", "ea_31", "lms_tv"]), params)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe("COURSE_INACTIVE")
    expect(json.error).toContain("Técnicas de Vendas")
    expect(db.$transaction).not.toHaveBeenCalled()
    // Filtrar status na consulta faria o curso inativo virar "não encontrado"
    // e a mensagem voltaria a não nomear o curso.
    expect(db.course.findMany.mock.calls[0][0].where).not.toHaveProperty("status")
  })

  it("PUT sem o curso inativo salva, com o curso novo", async () => {
    db.coursePackage.findFirst.mockResolvedValue({ id: PKG, name: "Barbeiro Profissional" })
    db.course.findMany.mockResolvedValue([INSTAGRAM, TECNICA_LMS])
    const res = await PUT(put(["ea_40", "lms_tv"]), params)
    expect(res.status).toBe(200)
    expect(db.$transaction).toHaveBeenCalledTimes(1)
  })
})
