# /status — Ver status do projeto

Analise o progresso do projeto baseado nas issues.

## Instrucoes

1. Liste todos os arquivos em `issues/` (use ls ou glob)
2. Para cada arquivo, leia o titulo:
   - Se titulo contem "✅", marque como COMPLETADA
   - Se titulo contem "🚧", marque como EM PROGRESSO
   - Senao, marque como PENDENTE
3. Verifique quais componentes/rotas/funcoes ja existem no codebase:
   - Grep por nomes mencionados nas issues
   - Verifique se existe arquivo correspondente
4. Produza um relatorio estruturado:
   - **Resumo geral**:
     - Total de issues: X
     - Completadas: X
     - Em progresso: X
     - Pendentes: X
     - % conclusao
   - **Issues completadas** (listar com checkpoint):
     - [x] NNN — Titulo
     - [x] NNN — Titulo
   - **Issues em progresso**:
     - [🚧] NNN — Titulo
   - **Issues pendentes** (em ordem de dependencia):
     - [ ] NNN — Titulo (depende de: NNN, NNN)
     - [ ] NNN — Titulo
   - **Proximas 3 issues sugeridas** (baseado em dependencias + prioridade):
     - NNN — Titulo (P0)
     - NNN — Titulo (P1)
     - NNN — Titulo (P1)
5. Mostre o progresso por TIPO:
   - Prototipos (UI screens): X/Y completadas
   - Infraestrutura (auth, middleware, etc): X/Y completadas
   - Comportamentos (server components, queries): X/Y completadas
   - Webhooks/Cron: X/Y completadas
6. Inclua um indicador visual:
   ```
   [████████░░░░░░░░░░] 40% — 8/20 issues completadas
   ```

## Output esperado
Um status report claro que o usuario pode enviar para stakeholders ou acompanhar progresso.
