import { describe, it, expect, vi, beforeEach } from "vitest"

// QA-015: regressão do fix 45d8af6 — o sync diário NÃO pode reverter a curadoria
// do admin. Em UPDATE, o sync EA preserva `status` e `categoriaLoja` do banco
// (só o feed novo entra no CREATE); o sync LMS preserva `status` (não força
// "ATIVO") e nunca toca no override de preço do admin (`precoVitrineMain`).

vi.mock("@/lib/prisma", () => {
  const prisma = {
    $transaction: vi.fn(async (arr: Promise<unknown>[]) => Promise.all(arr)),
    course: {
      // O match do sync EA é findFirst: o unique de `nome` virou composto com
      // `authorTenantId`, e o Prisma não faz findUnique em composto com coluna
      // nula. `findUnique` segue aqui para o lookup por plataformaCourseId (EA)
      // e por lmsCourseId (LMS), que são unique de coluna única.
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    category: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    courseCategory: { upsert: vi.fn() },
    courseLesson: { deleteMany: vi.fn(), createMany: vi.fn() },
  }
  return { prisma }
})
vi.mock("@/lib/plataforma-cursos/client", () => ({ listarCursos: vi.fn() }))
vi.mock("@/lib/lms", () => ({ listLmsCourses: vi.fn(), getLmsCourse: vi.fn() }))
vi.mock("./sync-log", () => ({ pushSyncLog: vi.fn() }))
// Cópia FIEL de `slugifyCategoria` (./home importa o prisma e não pode ser
// carregado aqui). Os overrides fazem parte do comportamento que estes testes
// verificam — sem eles, o caso `informatica` passaria por engano. O par real
// está preso em `category-name.test.ts`, que roda a função de verdade.
vi.mock("./home", () => ({
  slugifyCategoria: (nome: string) => {
    const OVERRIDES: Record<string, string> = {
      "INFORMÁTICA E TECNOLOGIA": "informatica",
      "DIVERSAS ÁREAS": "diversas",
      ADMINISTRATIVO: "administrativo",
      PREPARATÓRIOS: "preparatorios",
      IDIOMAS: "idiomas",
    }
    const override = OVERRIDES[nome.toUpperCase()]
    if (override) return override
    return nome
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  },
}))
vi.mock("@/lib/tenant/ensure-courses", () => ({
  ensureCourseForResellers: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { prisma } from "@/lib/prisma"
import { listarCursos } from "@/lib/plataforma-cursos/client"
import { getLmsCourse } from "@/lib/lms"
import { syncCatalogFromEA } from "./sync"
import { syncSingleLmsCourse } from "./sync-lms"

const p = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>
  course: {
    findFirst: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
  }
  category: {
    findFirst: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
  courseCategory: { upsert: ReturnType<typeof vi.fn> }
  courseLesson: { deleteMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> }
}
const listarMock = listarCursos as unknown as ReturnType<typeof vi.fn>
const getLmsMock = getLmsCourse as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  p.$transaction.mockImplementation(async (arr: Promise<unknown>[]) => Promise.all(arr))
  p.course.update.mockResolvedValue({})
  p.course.create.mockResolvedValue({ id: "new1" })
  p.courseCategory.upsert.mockResolvedValue({})
  // O sync do LMS resolve a categoria por slug (findUnique) e, se não achar, pela
  // chave de unificação do nome (findMany). Sem default, cada teste teria que
  // conhecer as três etapas.
  p.category.findUnique.mockResolvedValue(null)
  p.category.findMany.mockResolvedValue([])
  p.category.create.mockResolvedValue({ id: "cat-nova" })
  p.courseLesson.deleteMany.mockResolvedValue({})
  p.courseLesson.createMany.mockResolvedValue({})
})

describe("syncCatalogFromEA — curadoria preservada no UPDATE (QA-015)", () => {
  function eaCurso(overrides: Record<string, unknown> = {}) {
    return {
      nome: "Curso EA",
      aulas: "10",
      preco: "199,00",
      status: "ATIVO",
      categoria_loja: "Nova Categoria EA",
      ...overrides,
    }
  }

  it("curso existente INATIVO/categoriaLoja curada → UPDATE preserva status e categoriaLoja do banco", async () => {
    listarMock.mockResolvedValue([eaCurso()])
    // ensureCategory encontra a categoria do feed (não cria).
    p.category.findFirst.mockResolvedValue({ id: "cat-feed" })
    // Curso já existe com curadoria do admin: INATIVO + categoria antiga + categoria principal manual.
    p.course.findFirst.mockResolvedValue({
      id: "c_ea",
      plataformaCourseId: null,
      categoryId: "cat-manual",
      status: "INATIVO",
      categoriaLoja: "Categoria Curada",
    })

    await syncCatalogFromEA("cron")

    expect(p.course.update).toHaveBeenCalledTimes(1)
    const data = p.course.update.mock.calls[0][0].data
    // Feed dizia ATIVO/"Nova Categoria EA" — mas o UPDATE mantém a curadoria.
    expect(data.status).toBe("INATIVO")
    expect(data.categoriaLoja).toBe("Categoria Curada")
    expect(data.categoryId).toBe("cat-manual") // remapeamento manual preservado
    expect(p.course.create).not.toHaveBeenCalled()
    // Trava anti-sequestro: o sync da fornecedora só casa com curso do catálogo
    // da PMB. Sem `authorTenantId: null`, uma unidade que publicasse um curso
    // de mesmo nome teria descrição, carga horária, capa e preço reescritos
    // pelo feed todo dia às 6h — o produto dela apagado em silêncio.
    expect(p.course.findFirst.mock.calls[0][0].where).toMatchObject({
      provider: "EA",
      authorTenantId: null,
    })
  })

  it("curso NOVO → CREATE define status e categoriaLoja a partir do feed", async () => {
    listarMock.mockResolvedValue([eaCurso({ status: "ATIVO", categoria_loja: "Informática Feed" })])
    p.category.findFirst.mockResolvedValue({ id: "cat-feed2" })
    p.course.findFirst.mockResolvedValue(null) // curso novo

    await syncCatalogFromEA("cron")

    expect(p.course.create).toHaveBeenCalledTimes(1)
    const data = p.course.create.mock.calls[0][0].data
    expect(data.status).toBe("ATIVO")
    expect(data.categoriaLoja).toBe("Informática Feed")
    expect(p.course.update).not.toHaveBeenCalled()
  })
})

describe("syncSingleLmsCourse — curadoria preservada no UPDATE (QA-015)", () => {
  function lmsDetail(overrides: Record<string, unknown> = {}) {
    return {
      id: "lms-uuid-1",
      slug: "curso-lms",
      title: "Curso LMS",
      description: "desc",
      lessonCount: 5,
      workload: "20h",
      suggestedPriceCents: 19900,
      categories: [{ id: "lms-cat-1", name: "Categoria LMS", slug: "cat-lms" }],
      curriculum: undefined,
      coverImage: null,
      modules: [],
      ...overrides,
    }
  }

  it("curso LMS existente INATIVO → UPDATE NÃO força ATIVO (preserva curadoria)", async () => {
    getLmsMock.mockResolvedValue(lmsDetail())
    p.category.findUnique.mockResolvedValue({ id: "cat-x" })
    p.course.findUnique.mockResolvedValue({ id: "c_lms", categoryId: "cat-manual-lms", status: "INATIVO" })

    await syncSingleLmsCourse("curso-lms")

    expect(p.course.update).toHaveBeenCalledTimes(1)
    const data = p.course.update.mock.calls[0][0].data
    expect(data.status).toBe("INATIVO") // NÃO forçado para ATIVO
    expect(data.categoryId).toBe("cat-manual-lms") // categoria principal manual preservada
    // O override de preço do admin vive em `precoVitrineMain` e NÃO é tocado pelo sync.
    expect("precoVitrineMain" in data).toBe(false)
    expect(p.course.create).not.toHaveBeenCalled()
  })

  it("curso LMS novo com preço+categoria → CREATE nasce ATIVO e visível (hiddenMain=false)", async () => {
    getLmsMock.mockResolvedValue(lmsDetail())
    p.category.findUnique.mockResolvedValue({ id: "cat-y" })
    p.course.findUnique.mockResolvedValue(null)

    await syncSingleLmsCourse("curso-lms")

    expect(p.course.create).toHaveBeenCalledTimes(1)
    const data = p.course.create.mock.calls[0][0].data
    expect(data.status).toBe("ATIVO")
    expect(data.hiddenMain).toBe(false)
    expect(p.course.update).not.toHaveBeenCalled()
  })
})

/**
 * A REGRESSÃO QUE ESTA SUÍTE EXISTE PARA IMPEDIR.
 *
 * O catálogo de produção tinha "Informática e Tecnologia" e "Informática E
 * Tecnologia" como categorias SEPARADAS, e "diversas areas" ao lado de
 * "Diversas Áreas". Nasceram aqui: o match era `slug = ? OR name = ?`, o slug
 * preferido era o do LMS (que atropela o override `informatica`) e o `name` do
 * Postgres é sensível a caixa e acento.
 *
 * Sem estes testes, unificar as duas no /admin dura até as 6h do dia seguinte.
 */
describe("ensureLmsCategory — a duplicata não pode renascer no sync", () => {
  function lmsCurso(categories: { id: string; name: string; slug: string }[]) {
    return {
      id: "lms-1", slug: "curso-lms", title: "Curso LMS", description: "",
      workload: 40, suggestedPriceCents: 9900, ownerTenantExternalId: null,
      categories, curriculum: undefined, coverImage: null, modules: [],
    }
  }

  it("casa pelo slug DESTE lado quando o do LMS não existe aqui (o caso `informatica`)", async () => {
    // O LMS manda slug `informatica-e-tecnologia`; o PMB guarda a mesma categoria
    // em `informatica` por causa do CATEGORIA_SLUG_OVERRIDES.
    getLmsMock.mockResolvedValue(
      lmsCurso([{ id: "lms-cat", name: "Informática e Tecnologia", slug: "informatica-e-tecnologia" }]),
    )
    p.course.findUnique.mockResolvedValue(null)
    p.category.findUnique.mockImplementation(async ({ where }: { where: { slug: string } }) =>
      where.slug === "informatica" ? { id: "cat_pmb_informatica" } : null,
    )

    await syncSingleLmsCourse("curso-lms")

    expect(p.category.create).not.toHaveBeenCalled()
    expect(p.course.create.mock.calls[0][0].data.categoryId).toBe("cat_pmb_informatica")
  })

  it("casa pela CHAVE DE UNIFICAÇÃO quando nenhum slug bate (caixa/acento diferentes)", async () => {
    getLmsMock.mockResolvedValue(
      lmsCurso([{ id: "lms-cat", name: "diversas areas", slug: "diversas-areas" }]),
    )
    p.course.findUnique.mockResolvedValue(null)
    p.category.findUnique.mockResolvedValue(null) // nem `diversas-areas` nem o slug daqui
    p.category.findMany.mockResolvedValue([
      { id: "cat_outra", name: "Beleza" },
      { id: "cat_pmb_diversas", name: "Diversas Áreas" },
    ])

    await syncSingleLmsCourse("curso-lms")

    expect(p.category.create).not.toHaveBeenCalled()
    expect(p.course.create.mock.calls[0][0].data.categoryId).toBe("cat_pmb_diversas")
  })

  it("categoria de fato nova é criada — o dedupe não pode travar o catálogo", async () => {
    getLmsMock.mockResolvedValue(
      lmsCurso([{ id: "lms-cat", name: "Construção e Reformas", slug: "construcao-e-reformas" }]),
    )
    p.course.findUnique.mockResolvedValue(null)
    p.category.findUnique.mockResolvedValue(null)
    p.category.findMany.mockResolvedValue([{ id: "cat_pmb_diversas", name: "Diversas Áreas" }])
    p.category.create.mockResolvedValue({ id: "cat_nova" })

    await syncSingleLmsCourse("curso-lms")

    expect(p.category.create).toHaveBeenCalledTimes(1)
    expect(p.course.create.mock.calls[0][0].data.categoryId).toBe("cat_nova")
  })

  it("nome que normaliza para vazio não vira categoria", async () => {
    getLmsMock.mockResolvedValue(lmsCurso([{ id: "lms-cat", name: " ] ", slug: "" }]))
    p.course.findUnique.mockResolvedValue(null)

    await syncSingleLmsCourse("curso-lms")

    expect(p.category.create).not.toHaveBeenCalled()
    expect(p.course.create.mock.calls[0][0].data.categoryId).toBeNull()
  })

  it("grava o slug DESTE lado, não o do LMS — senão a próxima igual não casa por slug", async () => {
    getLmsMock.mockResolvedValue(
      lmsCurso([{ id: "lms-cat", name: "Diversas Áreas", slug: "outro-slug-qualquer" }]),
    )
    p.course.findUnique.mockResolvedValue(null)
    p.category.findUnique.mockResolvedValue(null)
    p.category.findMany.mockResolvedValue([])
    p.category.create.mockResolvedValue({ id: "cat_nova" })

    await syncSingleLmsCourse("curso-lms")

    // "Diversas Áreas" tem override para `diversas` — é o slug que já está nas
    // URLs públicas, e é o que precisa ser gravado para a PRÓXIMA categoria de
    // mesmo nome casar por slug em vez de virar linha nova.
    expect(p.category.create.mock.calls[0][0].data.slug).toBe("diversas")
    expect(p.category.create.mock.calls[0][0].data.name).toBe("Diversas Áreas")
  })

  it("o nome é LIMPO antes de gravar (o LMS manda 'saúde ]')", async () => {
    getLmsMock.mockResolvedValue(lmsCurso([{ id: "lms-cat", name: "saúde ]", slug: "" }]))
    p.course.findUnique.mockResolvedValue(null)
    p.category.findUnique.mockResolvedValue(null)
    p.category.findMany.mockResolvedValue([])
    p.category.create.mockResolvedValue({ id: "cat_nova" })

    await syncSingleLmsCourse("curso-lms")

    expect(p.category.create.mock.calls[0][0].data.name).toBe("saúde")
  })
})
