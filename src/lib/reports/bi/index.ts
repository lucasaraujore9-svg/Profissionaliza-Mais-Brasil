import type { BiModule } from "./context"
import { visaoGeralModule } from "./visao-geral"
import { receitaVendasModule } from "./receita-vendas"
import { alunosMatriculasModule } from "./alunos-matriculas"
import { redeRevendedoresModule } from "./rede-revendedores"
import { financeiroModule } from "./financeiro"
import { indicacoesComissoesModule } from "./indicacoes-comissoes"
import { cursosCuponsModule } from "./cursos-cupons"
import { leadsConversaoModule } from "./leads-conversao"

export type { BiContext, BiModule } from "./context"

/**
 * Registro de módulos de BI do admin, indexado pelo slug da aba (mesmos slugs
 * de `src/lib/reports/tabs.ts`). A aba "exportacoes" não tem módulo: ela reusa
 * o catálogo de CSV existente (reports-client).
 */
export const biModules: Record<string, BiModule> = {
  "visao-geral": visaoGeralModule,
  "receita-vendas": receitaVendasModule,
  "alunos-matriculas": alunosMatriculasModule,
  "rede-revendedores": redeRevendedoresModule,
  financeiro: financeiroModule,
  "indicacoes-comissoes": indicacoesComissoesModule,
  "cursos-cupons": cursosCuponsModule,
  "leads-conversao": leadsConversaoModule,
}

export function getBiModule(slug: string): BiModule | null {
  return biModules[slug] ?? null
}
