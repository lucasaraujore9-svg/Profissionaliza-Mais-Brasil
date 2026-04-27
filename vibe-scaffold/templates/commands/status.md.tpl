# /status — Ver status do projeto

## Instrucoes

1. Listar `issues/*.md`
2. Para cada issue, marcar estado pelo titulo:
   - contem `✅` -> COMPLETADA
   - contem `🚧` -> EM PROGRESSO
   - senao -> PENDENTE
3. Produzir relatorio:
   - Total / Completadas / Em progresso / Pendentes / % conclusao
   - Lista por estado
   - Progresso por tipo (proto/infra/behavior/integration)
   - Proximas 3 issues sugeridas (ver /next)
4. Barra visual:
   ```
   [████████░░░░░░░░░░] 40% — 8/20 issues completadas
   ```

## Output

Relatorio compartilhavel com stakeholders.
