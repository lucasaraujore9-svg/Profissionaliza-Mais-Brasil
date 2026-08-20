import { z } from "zod"

/**
 * Validacao compartilhada do plano de assinatura. Vive num modulo PURO (sem
 * Prisma) porque os formularios do /admin e do /painel sao componentes de
 * cliente — importar dali um modulo que toca o banco arrastaria o driver `pg`
 * para o navegador e quebraria o build com "Can't resolve 'dns'".
 */

export const SUBSCRIPTION_SCOPES = ["ALL", "CATEGORY", "PACKAGE", "COURSES"] as const

/**
 * O escopo precisa vir COMPLETO: `CATEGORY` sem categoria, `PACKAGE` sem pacote
 * e `COURSES` sem curso produziriam um plano que nao libera nada — o resolvedor
 * e fail-closed, entao o aluno pagaria por um catalogo vazio. Barrar na entrada
 * evita criar o produto quebrado.
 */
export const planShape = {
  name: z.string().trim().min(3, "Nome muito curto").max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  coverImageUrl: z.string().trim().max(1000).nullable().optional(),
  price: z.number().positive("Preço deve ser maior que zero"),
  scope: z.enum(SUBSCRIPTION_SCOPES),
  categoryIds: z.array(z.string().min(1)).default([]),
  packageId: z.string().min(1).nullable().optional(),
  courseIds: z.array(z.string().min(1)).default([]),
  featured: z.boolean().optional(),
  enabled: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
}

type PlanScopeFields = {
  scope: (typeof SUBSCRIPTION_SCOPES)[number]
  categoryIds?: string[]
  packageId?: string | null
  courseIds?: string[]
}

export function scopeIsComplete(v: PlanScopeFields): boolean {
  switch (v.scope) {
    case "CATEGORY":
      return (v.categoryIds?.length ?? 0) > 0
    case "PACKAGE":
      return Boolean(v.packageId)
    case "COURSES":
      return (v.courseIds?.length ?? 0) > 0
    case "ALL":
      return true
  }
}

export const SCOPE_INCOMPLETE_MESSAGE =
  "Selecione o conteúdo do plano (categoria, pacote ou cursos)"

export const createPlanSchema = z
  .object(planShape)
  .refine(scopeIsComplete, {
    message: SCOPE_INCOMPLETE_MESSAGE,
    path: ["scope"],
  })

/**
 * Na edicao os campos sao opcionais, mas a checagem de completude tem que rodar
 * sobre o estado RESULTANTE — o caller mescla com a linha atual antes de validar.
 */
export const updatePlanSchema = z.object({
  name: planShape.name.optional(),
  description: planShape.description,
  coverImageUrl: planShape.coverImageUrl,
  price: planShape.price.optional(),
  scope: planShape.scope.optional(),
  categoryIds: z.array(z.string().min(1)).optional(),
  packageId: z.string().min(1).nullable().optional(),
  courseIds: z.array(z.string().min(1)).optional(),
  featured: z.boolean().optional(),
  enabled: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
})
