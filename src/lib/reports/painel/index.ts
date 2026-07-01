import type { PainelBiModule } from "./context"
import { visaoGeralModule } from "./visao-geral"
import { receitaModule } from "./receita"
import { alunosModule } from "./alunos"
import { cursosCuponsModule } from "./cursos-cupons"
import { financeiroModule } from "./financeiro"
import { indicacoesModule } from "./indicacoes"

export type { PainelBiContext, PainelBiModule } from "./context"

/**
 * Registro dos módulos de BI do painel (revenda), indexado pelo slug da aba.
 * "exportacoes" não tem módulo — reusa o catálogo CSV tenant-scoped.
 */
export const painelBiModules: Record<string, PainelBiModule> = {
  "visao-geral": visaoGeralModule,
  receita: receitaModule,
  alunos: alunosModule,
  "cursos-cupons": cursosCuponsModule,
  financeiro: financeiroModule,
  indicacoes: indicacoesModule,
}

export function getPainelBiModule(slug: string): PainelBiModule | null {
  return painelBiModules[slug] ?? null
}
