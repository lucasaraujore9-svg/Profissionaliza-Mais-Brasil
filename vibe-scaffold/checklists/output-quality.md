# Checklist de Qualidade — vibe-scaffold

Revisar TODOS os itens abaixo antes de entregar qualquer output ao usuario.

## SPEC.md

- [ ] Tem secao "Visao Geral" com descricao clara
- [ ] Todos os atores estao listados com permissoes
- [ ] Cada pagina tem: objetivo, componentes, comportamentos, criterio de aceite
- [ ] Criterios de aceite sao verificaveis (checkbox, nao texto vago)
- [ ] Fluxos criticos tem passos numerados
- [ ] Lacunas marcadas com `TODO:` (nunca inventar)
- [ ] Secao "Nao-objetivos" presente

## Issues

- [ ] Numeracao segue taxonomia: 001-019 proto, 020-029 infra, 030-049 behavior, 050-059 integration
- [ ] Cada issue tem: Tipo, Pagina, Depende de, Prioridade, O Que Fazer, Componentes, Comportamentos, Criterio de Aceite
- [ ] Nenhuma dependencia circular
- [ ] infra nao depende de proto
- [ ] behavior depende do proto correspondente
- [ ] Cada issue e atomica (1 PR mental)
- [ ] `issues/README.md` existe com convencao explicada
- [ ] 3-6 criterios de aceite por issue

## CLAUDE.md

- [ ] Primeira linha diz para ler o arquivo inteiro
- [ ] Descricao do projeto presente
- [ ] Stack listada com versoes
- [ ] Workflow SPEC->BREAK->PLAN->EXECUTE documentado
- [ ] Tabela de slash commands presente
- [ ] Tabela de documentacao essencial com links
- [ ] Estrutura de pastas documentada
- [ ] Padroes de codigo listados
- [ ] Fluxos criticos em pseudocodigo
- [ ] Variaveis de ambiente listadas
- [ ] Nenhum link aponta para arquivo inexistente

## Reference Docs

- [ ] `docs/references/architecture.md` presente com principios, camadas, convencoes
- [ ] `docs/references/design-system.md` presente com paleta, tipografia, componentes
- [ ] `docs/references/workflow.md` presente com metodo detalhado
- [ ] Se multi-tenant: secao de arquitetura multi-tenant em architecture.md

## Slash Commands

- [ ] 6 comandos presentes: setup, plan, execute, status, next, review
- [ ] Cada comando comeca com `# /nome — Descricao`
- [ ] Instrucoes numeradas e imperativas
- [ ] Cada comando termina com "Output esperado"
- [ ] /setup calibrado para o stack do projeto
- [ ] /execute tem checklist por tipo (proto/infra/behavior/integration)
- [ ] /review tem checklist de qualidade especifico ao projeto

## Config Files

- [ ] `.env.example` presente com variaveis comentadas (sem valores reais)
- [ ] `.gitignore` inclui: node_modules, .next, .env.local, .DS_Store, .mcp.json
- [ ] `README.md` presente com setup e link para CLAUDE.md
- [ ] `.claude/settings.json` presente

## Integridade geral

- [ ] Todos os arquivos existem no filesystem (nao so mencionados)
- [ ] Nenhum placeholder `{{VAR}}` restante nos arquivos finais
- [ ] Portugues BR em todos os documentos
- [ ] Caminhos de arquivo consistentes entre CLAUDE.md e filesystem real
- [ ] Nenhum arquivo criado fora da pasta raiz do projeto
