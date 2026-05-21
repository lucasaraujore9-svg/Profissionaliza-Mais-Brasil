# /plan — Planejar uma issue antes de executar

Voce e um agente de planejamento. Antes de escrever qualquer codigo, voce PLANEJA.

## Instrucoes

1. Pergunte ao usuario qual issue executar (ou leia do argumento passado)
2. Leia o arquivo da issue em `issues/NNN-nome.md`
3. Leia os documentos de referencia relevantes:
   - `docs/architecture/profissionaliza-mais-brasil-blueprint.md` — visao geral
   - `docs/architecture/DOMINIOS-GUIDE.md` — multi-tenant (se tiver dominio/tenant envolvido)
   - `docs/api/plataforma-cursos-api-completa.md` — integracao plataforma (se tiver API da plataforma envolvida)
   - `docs/design/STITCH-DESIGN-PLAN.md` — design system (se for proto ou UI)
   - `CLAUDE.md` — padroes de codigo, stack, variaveis
4. Verifique dependencias da issue — as issues dependentes ja foram completadas?
   - Leia issue/index.md ou verifique nomes de issues com ✅
5. Busque no codebase por codigo relacionado:
   - Grep por nomes de componentes, rotas, tipos mencionados
   - Verifique se ja existe implementacao parcial
6. Produza um PLANO DE EXECUCAO com:
   - **Tipo**: proto | infra | behavior | integration
   - **Arquivos a criar/modificar** (paths completos):
     - Listados em ordem de execucao
     - Com descricao do que fazer em cada
   - **Dependencias externas**:
     - shadcn/ui components (quais instalar?)
     - NPM packages
     - Variaveis de ambiente
   - **Dados mock** (se proto) ou **queries Prisma** (se behavior):
     - Constantes hardcoded no topo
     - Schema Prisma a usar
   - **Pontos de atencao**:
     - Multi-tenant filter (WHERE tenant_id)
     - Zod validation necessaria
     - Rate limiting
     - Webhooks (se aplicavel)
     - Criptografia (MP tokens)
     - Erros a tratar
   - **Criterios de aceite**:
     - Checklist de como validar que ficou pronto
7. NAO escreva codigo. Apenas o plano estruturado.

## Output esperado
Um plano detalhado e acionavel que o comando /execute pode seguir. Use markdown headings e listas para organizacao clara.
