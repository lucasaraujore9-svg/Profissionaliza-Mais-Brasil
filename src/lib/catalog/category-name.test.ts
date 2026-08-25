import { describe, it, expect } from "vitest"
import {
  normalizeCategoryName,
  cleanCategoryName,
  findSameCategory,
  findDuplicateGroups,
} from "./category-name"
import { slugifyCategoria } from "./home"

// As categorias reais de producao em 25/08/2026. A regra foi calibrada nelas.
const PROD = [
  { id: "cat_adm", name: "Administrativo" },
  { id: "cm_beleza", name: "Beleza" },
  { id: "cm_div", name: "diversas areas" }, // veio do LMS
  { id: "cat_div", name: "Diversas Áreas" }, // veio da EA
  { id: "cm_edu", name: "Educação" },
  { id: "cm_emp", name: "Empreendedorismo" },
  { id: "cm_fit", name: "Fitness" },
  { id: "cm_food", name: "Food" },
  { id: "cat_idi", name: "Idiomas" },
  { id: "cm_inf2", name: "Informática e Tecnologia" }, // veio do LMS
  { id: "cat_inf", name: "Informática E Tecnologia" }, // veio da EA
  { id: "cm_ped", name: "Pedagógico" },
  { id: "cat_pre", name: "Preparatórios" },
  { id: "cm_pro", name: "Profissões" },
  { id: "cm_sau", name: "Saúde" },
]

describe("normalizeCategoryName — a chave que o sync usa", () => {
  it("iguala as duas linhas de Informática que existem em produção", () => {
    expect(normalizeCategoryName("Informática E Tecnologia")).toBe(
      normalizeCategoryName("Informática e Tecnologia"),
    )
  })

  it("iguala as duas linhas de Diversas Áreas", () => {
    expect(normalizeCategoryName("diversas areas")).toBe(normalizeCategoryName("Diversas Áreas"))
  })

  it("limpa o colchete solto que o LMS manda em 'saúde ]'", () => {
    expect(normalizeCategoryName("saúde ]")).toBe(normalizeCategoryName("Saúde"))
  })

  it("NÃO junta sinônimo nem subconjunto — isso é decisão de uma pessoa", () => {
    expect(normalizeCategoryName("Food")).not.toBe(normalizeCategoryName("Saúde"))
    expect(normalizeCategoryName("Fitness")).not.toBe(normalizeCategoryName("Saúde"))
    expect(normalizeCategoryName("Pedagógico")).not.toBe(normalizeCategoryName("Educação"))
    expect(normalizeCategoryName("Informática")).not.toBe(
      normalizeCategoryName("Informática e Tecnologia"),
    )
  })

  it("concorda com o gêmeo do LMS (src/lib/categories.ts)", () => {
    // Se as duas divergirem, uma categoria unificada no LMS volta a se dividir
    // aqui na sincronização das 6h. Os casos abaixo são o contrato entre elas.
    expect(normalizeCategoryName("Informática e Tecnologia")).toBe("informatica e tecnologia")
    expect(normalizeCategoryName("  DIVERSAS   Áreas!! ")).toBe("diversas areas")
    expect(normalizeCategoryName("saúde ]")).toBe("saude")
  })
})

describe("cleanCategoryName", () => {
  it("tira pontuação solta das pontas, preservando acento e caixa", () => {
    expect(cleanCategoryName("saúde ]")).toBe("saúde")
    expect(cleanCategoryName("  Informática   e Tecnologia ")).toBe("Informática e Tecnologia")
  })
})

describe("findSameCategory — o que impede a duplicata de renascer no sync", () => {
  it("acha a linha da EA quando o LMS manda a mesma categoria com outra caixa", () => {
    expect(findSameCategory("Informática e Tecnologia", PROD)?.id).toBe("cm_inf2")
    expect(findSameCategory("INFORMATICA E TECNOLOGIA", PROD)?.id).toBe("cm_inf2")
  })

  it("acha por acento diferente", () => {
    expect(findSameCategory("Diversas Areas", PROD)?.id).toBe("cm_div")
  })

  it("categoria de fato nova não casa com nada", () => {
    expect(findSameCategory("Construção e Reformas", PROD)).toBeUndefined()
  })

  it("nome que normaliza para vazio nunca casa", () => {
    const sujo = [...PROD, { id: "lixo", name: "]" }]
    expect(findSameCategory("   ", sujo)).toBeUndefined()
    expect(findSameCategory("###", sujo)).toBeUndefined()
  })
})

describe("findDuplicateGroups — o que o /admin oferece para unificar", () => {
  it("acha exatamente as duas duplicatas reais de produção", () => {
    const grupos = findDuplicateGroups(PROD).map((g) =>
      g.members.map((m) => m.id).sort().join(","),
    )
    expect(grupos.sort()).toEqual(["cat_div,cm_div", "cat_inf,cm_inf2"])
  })

  it("não oferece Food/Fitness/Pedagógico — não são a mesma categoria", () => {
    const ids = findDuplicateGroups(PROD).flatMap((g) => g.members.map((m) => m.id))
    expect(ids).not.toContain("cm_food")
    expect(ids).not.toContain("cm_fit")
    expect(ids).not.toContain("cm_ped")
  })

  it("catálogo limpo devolve lista vazia", () => {
    expect(findDuplicateGroups([{ id: "1", name: "Beleza" }, { id: "2", name: "Saúde" }])).toEqual([])
  })
})

describe("slugifyCategoria continua respeitando os overrides", () => {
  // O sync passou a preferir ESTE slug ao do LMS. Se os overrides sumirem, as
  // URLs publicas /categoria/informatica e /categoria/diversas mudam.
  it("mantém os slugs curtos que já estão em produção", () => {
    expect(slugifyCategoria("Informática e Tecnologia")).toBe("informatica")
    expect(slugifyCategoria("Diversas Áreas")).toBe("diversas")
  })
})
