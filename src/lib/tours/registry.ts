/**
 * Registro central dos tours guiados + seleção do tour ativo.
 *
 * O engine (tour-runner.tsx) chama `findTour(area, pathname, role)` a cada
 * mudança de rota para descobrir qual tutorial mostrar. Pure data — seguro
 * para client.
 */

import { type MemberRole, type TourArea, type TourDef } from "./types"
import { PAINEL_TOURS } from "./painel"
import { ALUNO_TOURS } from "./aluno"

export * from "./types"

export const ALL_TOURS: TourDef[] = [...PAINEL_TOURS, ...ALUNO_TOURS]

/**
 * Tour ativo para a rota atual, dentro da área e papel informados.
 *
 * Ordem de desempate: o primeiro TourDef que casa rota + papel vence. Por isso,
 * quando há roteiros distintos por papel para a mesma rota (ex.: overview
 * owner vs consultant), registre os mais específicos primeiro.
 */
export function findTour(
  area: TourArea,
  pathname: string,
  role: MemberRole,
): TourDef | undefined {
  return ALL_TOURS.find((t) => {
    if (t.area !== area) return false
    if (!t.matches(pathname)) return false
    if (t.roles && (role === null || !t.roles.includes(role))) return false
    return true
  })
}
