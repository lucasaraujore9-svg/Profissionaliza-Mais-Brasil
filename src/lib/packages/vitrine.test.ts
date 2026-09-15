import { describe, expect, it, vi, beforeEach } from "vitest"

const pkgFindMany = vi.fn()
const pkgFindFirst = vi.fn()
const pkgFindUnique = vi.fn()
const tpFindMany = vi.fn()
const tpFindUnique = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: {
    coursePackage: {
      findMany: (...a: unknown[]) => pkgFindMany(...a),
      findFirst: (...a: unknown[]) => pkgFindFirst(...a),
      findUnique: (...a: unknown[]) => pkgFindUnique(...a),
    },
    tenantPackage: {
      findMany: (...a: unknown[]) => tpFindMany(...a),
      findUnique: (...a: unknown[]) => tpFindUnique(...a),
    },
  },
}))

const { getPackageForCheckout, getVitrinePackageBySlug, resolveVitrinePackages } =
  await import("./vitrine")

/**
 * Curso que a PMB restringiu a outras unidades ("ocultar para todas EXCETO")
 * sai do pacote da unidade — na listagem, no detalhe e no checkout. Decisão do
 * dono (15/09): tirar o curso, não o pacote inteiro; os clubes de 175 e 183
 * cursos de duas unidades carregavam o "Barbeiro Profissional", exclusivo da
 * Rota do Aprendizado.
 */
const UNIDADE = "t_unidade"
const LIBERADA = "t_liberada"

type CursoFixture = Record<string, unknown> & { id: string }

function curso(id: string, over: Record<string, unknown> = {}): CursoFixture {
  return {
    id,
    nome: `Curso ${id}`,
    slug: id,
    status: "ATIVO",
    provider: "EA",
    plataformaCourseId: `ea-${id}`,
    lmsCourseId: null,
    capaImageUrl: null,
    capaOverride: null,
    cargaHoraria: null,
    qtdAulas: 1,
    visibilityMode: "ALL",
    allowedTenantIds: [],
    blockedTenantIds: [],
    ...over,
  }
}

const exclusivo = curso("barbeiro", {
  visibilityMode: "ALLOWLIST",
  allowedTenantIds: [LIBERADA],
})

function pacote(tenantId: string | null, cursos: CursoFixture[]) {
  return {
    id: "pkg1",
    slug: "clube",
    name: "Clube",
    description: null,
    coverImageUrl: null,
    price: 175,
    featured: false,
    position: 0,
    enabled: true,
    tenantId,
    items: cursos.map((course, order) => ({ order, course })),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  tpFindMany.mockResolvedValue([])
  tpFindUnique.mockResolvedValue(null)
})

describe("getPackageForCheckout", () => {
  it("unidade fora da lista: o curso restrito sai da lista de cursos do pacote", async () => {
    pkgFindUnique.mockResolvedValue(pacote(UNIDADE, [curso("a"), exclusivo, curso("b")]))
    const res = await getPackageForCheckout(UNIDADE, "pkg1")
    expect(res?.courses.map((c) => c.id)).toEqual(["a", "b"])
  })

  it("a unidade liberada vende o pacote com o curso exclusivo", async () => {
    pkgFindUnique.mockResolvedValue(pacote(LIBERADA, [curso("a"), exclusivo]))
    const res = await getPackageForCheckout(LIBERADA, "pkg1")
    expect(res?.courses.map((c) => c.id)).toEqual(["a", "barbeiro"])
  })

  it("pacote SÓ com o curso restrito deixa de ser vendável na unidade", async () => {
    pkgFindUnique.mockResolvedValue(pacote(UNIDADE, [exclusivo]))
    expect(await getPackageForCheckout(UNIDADE, "pkg1")).toBeNull()
  })

  it("curso restrito SEM fornecedora não derruba o pacote de quem nem o venderia", async () => {
    const orfao = { ...exclusivo, plataformaCourseId: null }
    pkgFindUnique.mockResolvedValue(pacote(UNIDADE, [curso("a"), orfao]))
    const res = await getPackageForCheckout(UNIDADE, "pkg1")
    expect(res?.courses.map((c) => c.id)).toEqual(["a"])
  })

  it("vitrine da PMB (tenantId null) não aplica a curadoria por unidade", async () => {
    pkgFindUnique.mockResolvedValue(pacote(null, [curso("a"), exclusivo]))
    const res = await getPackageForCheckout(null, "pkg1")
    expect(res?.courses.map((c) => c.id)).toEqual(["a", "barbeiro"])
  })
})

describe("vitrine do pacote", () => {
  it("o card conta só os cursos liberados para a unidade", async () => {
    pkgFindMany.mockImplementation(async (args: { where: { tenantId: string | null } }) =>
      args.where.tenantId === UNIDADE ? [pacote(UNIDADE, [curso("a"), exclusivo])] : [],
    )
    const cards = await resolveVitrinePackages(UNIDADE)
    expect(cards.map((c) => c.courseCount)).toEqual([1])
  })

  it("a página do pacote não lista o curso restrito", async () => {
    pkgFindFirst.mockResolvedValue(pacote(UNIDADE, [curso("a"), exclusivo]))
    const detail = await getVitrinePackageBySlug(UNIDADE, "clube")
    expect(detail?.courses.map((c) => c.id)).toEqual(["a"])
  })
})
