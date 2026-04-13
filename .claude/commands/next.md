# /next — Sugerir proxima issue para executar

Analise as dependencias e sugira a proxima issue logica.

## Instrucoes

1. Liste todos os arquivos em `issues/` (use ls ou glob)
2. Para cada issue, identifique:
   - Titulo e numero (NNN)
   - Se completa (✅ no titulo)
   - Dependencias mencionadas (formato: "depende de: NNN, NNN")
   - Prioridade (P0 > P1 > P2, extrair do titulo ou conteudo)
   - Tipo (proto, infra, behavior, integration, extrair do conteudo)

3. Para cada issue PENDENTE, verifique:
   - Todas as suas dependencias foram completadas?
   - SIM → candidata para proxima
   - NAO → marque como bloqueada

4. Entre as candidatas nao-bloqueadas, aplique ordem:
   - Prioridade P0 primeiro
   - Depois infra/fundacao (antes de behavior)
   - Depois behavior
   - Depois integration/webhooks
   - Dentro mesma prioridade/tipo: ordem alfabetica

5. Sugira os TRES proximas issues em ordem:
   - **1. NNN — Titulo**
     - Tipo: infra
     - Prioridade: P0
     - Resumo: o que precisa fazer
     - Nenhuma dependencia bloqueante
   - **2. NNN — Titulo**
     - (mesmo formato)
   - **3. NNN — Titulo**
     - (mesmo formato)

6. Para cada uma, pergunte ao usuario:
   ```
   Quer fazer /plan para a issue NNN?
   ou /execute se ja foi planejada?
   ou /status para ver progresso geral?
   ```

## Output esperado
Uma sugestao clara de qual issue fazer proximo, com contexto suficiente para tomar decisao.
