import { env } from "@/lib/env"
import { isLmsConfigured } from "./config"
import { lmsRequest } from "./client"
import { normalizeLmsPublicUrl } from "./urls"

/**
 * AUTORIA DE CURSO PELA UNIDADE — a ponte com o repo do LMS.
 *
 * O conteudo (modulos, aulas, video, material) mora no LMS; o PMB e a camada
 * comercial. Hoje o namespace M2M `/api/v1` do LMS e so leitura de catalogo +
 * comandos de matricula: a area de autoria vive em `/api/autoria`, interna, e
 * nao existe nocao de curso com DONO. Este modulo e o contrato que o LMS
 * precisa expor, documentado em `docs/api/lms-autoria-unidade.md`.
 *
 * Enquanto o LMS nao responder, `isLmsAuthoringEnabled()` e falso e a camada
 * comercial inteira continua funcionando: a unidade monta o curso, define
 * alcance, preco e comissao, e ele fica em RASCUNHO — o que nao pode acontecer
 * e um curso PUBLICADO sem conteudo, porque a venda seria cobrada e o
 * provisionamento falharia com o aluno ja tendo pago.
 */
export function isLmsAuthoringEnabled(): boolean {
  return isLmsConfigured() && env.LMS_AUTHORING_ENABLED === "true"
}

export interface CreateLmsCourseShellInput {
  /** `tenantExternalId` da unidade dona — o mesmo de PUT /tenants/:id. */
  ownerTenantExternalId: string
  title: string
  description?: string | null
  workload?: string | null
}

export interface LmsCourseShell {
  id: string
  slug: string
}

/**
 * Cria a casca do curso no LMS e devolve a identidade dele.
 *
 * O PMB e quem cria — nao o LMS — para que a linha em `courses` ja nasca com
 * `authorTenantId` e `lmsCourseId` amarrados. Se a criacao partisse do LMS, o
 * curso chegaria aqui pelo sync do catalogo e teria que ser adotado por
 * heuristica, com o risco de virar curso do catalogo da PMB.
 */
export async function createLmsCourseShell(
  input: CreateLmsCourseShellInput,
): Promise<LmsCourseShell> {
  const res = await lmsRequest<{ data: LmsCourseShell }>("POST", "/courses", {
    body: {
      ownerTenantExternalId: input.ownerTenantExternalId,
      title: input.title,
      description: input.description ?? null,
      workload: input.workload ?? null,
    },
  })
  return res.data
}

/** Publica ou despublica a casca no LMS, acompanhando o estado no PMB. */
export async function setLmsCoursePublished(
  lmsCourseId: string,
  published: boolean,
): Promise<void> {
  await lmsRequest<{ data: unknown }>(
    "PATCH",
    `/courses/${encodeURIComponent(lmsCourseId)}`,
    { body: { published } },
  )
}

/**
 * Link de uso unico para a unidade editar o CONTEUDO do curso dela no LMS.
 *
 * Escopado ao `ownerTenantExternalId` do lado de la: o token nao pode abrir a
 * autoria de curso de outra unidade nem do catalogo da PMB. Essa checagem e
 * responsabilidade do LMS — aqui so mandamos quem esta pedindo.
 */
export async function createLmsAuthorSsoToken(input: {
  ownerTenantExternalId: string
  lmsCourseId: string
  returnUrl?: string
}): Promise<{ url: string }> {
  const res = await lmsRequest<{ url: string }>("POST", "/sso/author-token", {
    body: {
      tenantExternalId: input.ownerTenantExternalId,
      courseId: input.lmsCourseId,
      returnUrl: input.returnUrl,
    },
  })
  return { url: normalizeLmsPublicUrl(res.url) ?? res.url }
}
