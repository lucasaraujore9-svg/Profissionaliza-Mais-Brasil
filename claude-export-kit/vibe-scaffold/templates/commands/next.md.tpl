# /next — Sugerir proxima issue

## Instrucoes

1. Listar `issues/*.md`
2. Para cada pendente, identificar: numero, titulo, tipo, prioridade, dependencias
3. Filtrar: dependencias todas completas?
4. Ordenar candidatas:
   - P0 > P1 > P2
   - infra antes de behavior
   - behavior antes de integration
   - alfabetica como desempate
5. Sugerir TOP 3 com: numero, titulo, tipo, prioridade, resumo, por que foi escolhida
6. Perguntar: "Rodar /plan NNN? ou /execute NNN se ja planejada?"

## Output

3 sugestoes ordenadas com contexto para decisao.
