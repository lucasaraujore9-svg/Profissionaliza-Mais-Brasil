/**
 * Tipos do framework de tutoriais guiados (driver.js).
 *
 * Cada página/função tem um TourDef com `id` estável. O engine genérico
 * (src/components/shared/tour/tour-runner.tsx) escolhe o tour ativo a partir
 * da rota atual, do papel e da área, auto-inicia uma vez por página e persiste
 * a dispensa (User/Student.dismissedTours) para não reabrir sozinho.
 *
 * Este módulo é importado por componente client — mantenha-o livre de imports
 * de servidor (Prisma, next/headers, etc.). É só dado + funções puras.
 */

/**
 * Espelha session.user.memberRole. Import type-only — painel-permissions é
 * dado puro, sem import de servidor, então não quebra a regra acima.
 */
import type { PainelMemberRole } from "@/lib/auth/painel-permissions"

export type MemberRole = PainelMemberRole | null

/** Em qual shell o tour vive. Define onde o engine é montado. */
export type TourArea = "painel" | "aluno"

export interface TourStep {
  /** Seletor CSS do alvo. Ausente = passo centralizado (sem destaque). */
  selector?: string
  title: string
  /** Aceita HTML simples (<b>, <br>). */
  description: string
  side?: "left" | "right" | "top" | "bottom"
  align?: "start" | "center" | "end"
}

export interface TourDef {
  /**
   * Identificador estável e único do tour (ex.: "painel.cursos").
   * É o valor gravado em dismissedTours — NÃO renomeie depois de publicado
   * sem migrar os dados, senão usuários reveem o tour.
   */
  id: string
  area: TourArea
  /** Rótulo curto (debug/admin). */
  label: string
  /** True se o tour deve estar ativo nesta rota (pathname do Next). */
  matches: (pathname: string) => boolean
  /**
   * Papéis (painel) para os quais o tour vale. `undefined` = todos.
   * Permite roteiros distintos owner vs consultant para a mesma rota.
   */
  roles?: Exclude<MemberRole, null>[]
  steps: TourStep[]
}

/** Casa exatamente com a rota (ex.: "/painel/cursos"). */
export const exact =
  (route: string) =>
  (pathname: string): boolean =>
    pathname === route

/** Casa a rota e qualquer sub-rota (ex.: "/painel/cursos" e "/painel/cursos/123"). */
export const prefix =
  (route: string) =>
  (pathname: string): boolean =>
    pathname === route || pathname.startsWith(route + "/")
