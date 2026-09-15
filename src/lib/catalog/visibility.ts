import type { Prisma } from "@prisma/client"

/**
 * Regra de negocio: "nenhum curso SEM VALOR pode ser exibido na vitrine".
 *
 * Um curso PMB "tem valor" quando o preco efetivo e > 0. O preco efetivo segue
 * o mesmo criterio do `pickPrice` (src/lib/catalog/home.ts e course-mapper.ts):
 * `precoVitrineMain ?? precoPromocional ?? precoOriginal`, tomando o primeiro
 * valor positivo. Logo, efetivo > 0  <=>  algum dos tres campos > 0.
 *
 * Use sempre via `AND: [COURSE_HAS_PRICE]` para compor com seguranca junto de
 * um `where` que ja possa ter `OR` (ex.: filtro de busca) — dois `OR` no mesmo
 * objeto se sobrescreveriam.
 *
 * Para a vitrine de REVENDA o preco efetivo e o `TenantCourse.price`, entao o
 * gate la e simplesmente `price: { gt: 0 }` na query de TenantCourse.
 */
export const COURSE_HAS_PRICE: Prisma.CourseWhereInput = {
  OR: [
    { precoVitrineMain: { gt: 0 } },
    { precoPromocional: { gt: 0 } },
    { precoOriginal: { gt: 0 } },
  ],
}

/**
 * Regra de negocio: "curso que a plataforma de aulas NAO consegue provisionar
 * nao pode ser vendido".
 *
 * Um curso so e matriculavel quando carrega o identificador da fornecedora dele:
 * `plataformaCourseId` (legada) ou `lmsCourseId` (propria). Sem ele o
 * provisionamento morre no fim do fluxo — DEPOIS de o aluno pagar — com
 * "Falha ao matricular o aluno na plataforma de aulas", e "tente novamente" e um
 * conselho que nunca vai funcionar: repetir nao inventa o id que falta.
 *
 * Foi exatamente o que aconteceu quando a fornecedora renomeou o curso 267: o
 * sync criou uma linha nova sem id (o antigo ja estava tomado pela linha velha) e
 * ela foi parar na vitrine de 18 unidades. O sync agora casa por id e nao produz
 * mais essa linha (`upsertEaCourse`), mas este gate e a rede embaixo: melhor o
 * curso nao aparecer do que aparecer e quebrar com o aluno na tela — a mesma
 * regra do gate de carteira em `catalogScopeForTenant`.
 *
 * Use sempre via `AND: [COURSE_PROVISIONABLE]` para compor com seguranca junto de
 * um `where` que ja possa ter `OR` — dois `OR` no mesmo objeto se sobrescreveriam.
 */
export const COURSE_PROVISIONABLE: Prisma.CourseWhereInput = {
  OR: [
    { provider: "EA", plataformaCourseId: { not: null } },
    { provider: "LMS", lmsCourseId: { not: null } },
  ],
}

/**
 * Regra de negocio: "curso que a PMB restringiu a algumas unidades so e exibido
 * e VENDIDO por elas" — a curadoria `Course.visibilityMode` de /admin/catalogo:
 *   - ALL       → todas as unidades
 *   - ALLOWLIST → so as de `allowedTenantIds` ("ocultar para todas EXCETO")
 *   - DENYLIST  → todas menos as de `blockedTenantIds`
 *
 * Por que existe como regra propria: ela so estava nas LISTAGENS da vitrine
 * publica. O painel de cursos, a venda direta, o checkout por ID, a recompra do
 * aluno, os pacotes e o sitemap nao a aplicavam — uma unidade fora da lista via
 * o curso como "visivel" no painel e conseguia vende-lo, enquanto a propria loja
 * dela respondia "curso nao encontrado".
 *
 * `ensureTenantCourses` continua criando o TenantCourse das unidades fora da
 * lista DE PROPOSITO: e onde mora o preco/capa que a unidade escolheu, e ele
 * volta a valer se a PMB liberar o curso para ela depois.
 *
 * Use sempre via `AND: [courseCuratedForTenant(id)]` — o `OR` na raiz sobrescreve
 * (ou e sobrescrito por) outro `OR` no mesmo objeto.
 */
export function courseCuratedForTenant(tenantId: string): Prisma.CourseWhereInput {
  return {
    OR: [
      { visibilityMode: "ALL" },
      { visibilityMode: "ALLOWLIST", allowedTenantIds: { has: tenantId } },
      { visibilityMode: "DENYLIST", NOT: { blockedTenantIds: { has: tenantId } } },
    ],
  }
}

/** Colunas que `isCourseCuratedForTenant` le. */
export const COURSE_CURATION_SELECT = {
  visibilityMode: true,
  allowedTenantIds: true,
  blockedTenantIds: true,
} satisfies Prisma.CourseSelect

/**
 * Gemeo em memoria de `courseCuratedForTenant`, para quando o curso ja veio
 * carregado (gate de venda, itens de pacote). Os dois tem teste de PARIDADE.
 */
export function isCourseCuratedForTenant(
  course: Prisma.CourseGetPayload<{ select: typeof COURSE_CURATION_SELECT }>,
  tenantId: string,
): boolean {
  switch (course.visibilityMode) {
    case "ALL":
      return true
    case "ALLOWLIST":
      return course.allowedTenantIds.includes(tenantId)
    case "DENYLIST":
      return !course.blockedTenantIds.includes(tenantId)
    default:
      // Modo que o `where` gemeo nao casaria (nenhum ramo do OR) — fail-closed.
      return false
  }
}
