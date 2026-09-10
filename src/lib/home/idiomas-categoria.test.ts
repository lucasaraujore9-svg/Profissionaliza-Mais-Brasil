import { describe, it, expect, vi, beforeEach } from "vitest"

// "Idiomas" deixou de ser a seção fixa kind="idiomas" (uma lista de 4 cursos da
// PMB que nenhuma unidade podia editar) e virou seção de categoria como qualquer
// outra — migration 20260910_idiomas_section_to_category. Estes testes travam
// as três pontas que mantêm isso de pé: o kind antigo não volta a ser criado, a
// linha antiga que sobrar não chega à tela, e a seção de categoria de Idiomas
// continua no lugar dela na ordem canônica (e como âncora do EJA).
vi.mock("@/lib/prisma", () => {
  const homeSection = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  }
  const systemSettings = { findUnique: vi.fn() }
  return {
    prisma: {
      homeSection,
      systemSettings,
      $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
    },
  }
})

import { prisma } from "@/lib/prisma"
import {
  createSectionSchema,
  ensureEjaSection,
  loadHomeSections,
  reorderScopeToCanonical,
  validateSectionPayload,
} from "./sections"
import { listSections } from "./api"

type Mocked = {
  homeSection: Record<
    "findMany" | "findFirst" | "update" | "updateMany" | "create",
    ReturnType<typeof vi.fn>
  >
  systemSettings: { findUnique: ReturnType<typeof vi.fn> }
}
const db = prisma as unknown as Mocked

beforeEach(() => {
  for (const fn of Object.values(db.homeSection)) fn.mockReset()
  db.systemSettings.findUnique.mockReset()
  db.homeSection.update.mockResolvedValue({})
  db.homeSection.updateMany.mockResolvedValue({ count: 0 })
  db.homeSection.create.mockResolvedValue({})
})

const row = (id: string, kind: string, config: Record<string, unknown>, position = 0) => ({
  id,
  tenantId: null,
  kind,
  position,
  enabled: true,
  config: { kind, ...config },
  createdAt: new Date(0),
})

describe("kind 'idiomas' não existe mais", () => {
  it("recusa criar a seção fixa antiga", () => {
    expect(
      createSectionSchema.safeParse({ kind: "idiomas", config: { courseIds: [] } }).success,
    ).toBe(false)
    expect(validateSectionPayload("idiomas", { courseIds: [] }).ok).toBe(false)
  })
})

describe("linha antiga kind='idiomas' é descartada na leitura", () => {
  // O código velho recria a linha fixa ao abrir o editor, na janela entre a
  // migration (build) e o deploy novo entrar no ar.
  const legado = row("legado", "idiomas", { title: "Idiomas", courseIds: [] }, 0)
  const categoria = row("pmb-idiomas", "category_courses", {
    title: "Idiomas",
    categoryId: "cat-idi",
    mode: "random",
    count: 8,
    courseIds: [],
    showSeeMore: true,
  }, 1)

  it("a home não recebe a linha antiga", async () => {
    db.homeSection.findMany.mockResolvedValueOnce([legado, categoria])
    const sections = await loadHomeSections(null)
    expect(sections.map((s) => s.id)).toEqual(["pmb-idiomas"])
  })

  it("o editor da vitrine não recebe a linha antiga", async () => {
    db.homeSection.findMany.mockResolvedValueOnce([legado, categoria])
    const res = await listSections({ tenantId: null })
    const body = (await res.json()) as { data: Array<{ id: string }> }
    expect(body.data.map((s) => s.id)).toEqual(["pmb-idiomas"])
  })
})

describe("Idiomas na ordem canônica", () => {
  const canonicos = [
    { id: "pmb-cat-administrativo", config: { categoryId: "cat-adm" } },
    { id: "pmb-idiomas", config: { categoryId: "cat-idi" } },
  ]

  it("fica entre EJA e 'Sua escola no bolso', reconhecida pela categoria", async () => {
    db.homeSection.findMany
      .mockResolvedValueOnce(canonicos)
      .mockResolvedValueOnce([
        { id: "learn", kind: "institutional", config: { variant: "learn_anywhere" }, position: 0 },
        { id: "idiomas", kind: "category_courses", config: { categoryId: "cat-idi" }, position: 1 },
        { id: "eja", kind: "eja", config: {}, position: 2 },
        { id: "adm", kind: "category_courses", config: { categoryId: "cat-adm" }, position: 3 },
      ])

    await reorderScopeToCanonical("tenant-1")

    const finalPos = new Map(
      db.homeSection.update.mock.calls.map(([arg]) => [arg.where.id, arg.data.position]),
    )
    const ordem = ["adm", "eja", "idiomas", "learn"]
    expect(ordem.map((id) => finalPos.get(id))).toEqual([0, 1, 2, 3])
  })

  it("o EJA novo nasce imediatamente antes da seção de categoria de Idiomas", async () => {
    db.systemSettings.findUnique.mockResolvedValue({ ejaEnabled: false })
    db.homeSection.findMany.mockResolvedValueOnce(canonicos)
    db.homeSection.findFirst
      .mockResolvedValueOnce(null) // ainda não há EJA no escopo
      .mockResolvedValueOnce({ position: 6 }) // seção de Idiomas

    await ensureEjaSection(null)

    expect(db.homeSection.findFirst.mock.calls[1]?.[0]).toMatchObject({
      where: {
        tenantId: null,
        kind: "category_courses",
        config: { path: ["categoryId"], equals: "cat-idi" },
      },
    })
    expect(db.homeSection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: "eja", position: 6 }),
    })
  })
})
