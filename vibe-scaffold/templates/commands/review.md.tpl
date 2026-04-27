# /review — Revisar codigo de uma issue

## Instrucoes

1. Perguntar qual issue
2. Ler `issues/NNN-*.md` + docs de referencia relevantes
3. Identificar arquivos tocados (grep por nomes mencionados, ou `git diff` desde o commit da issue)
4. Revisar cada arquivo contra:
   - **Design System** (se UI): paleta, tipografia, spacing, responsivo
   - **TypeScript**: sem `any`, tipos explicitos, imports corretos
   - **Zod**: presente em todos inputs de API, validacao ANTES de usar
   - **States**: loading, error, empty, retry
   - **Acessibilidade**: labels, alt, focus visivel
   - **Clean code**: sem console.log, sem hardcode em behaviors, 1 componente por arquivo
   - **Seguranca**: segredos nao vazam, webhooks validados, rate limit
5. Compilar:
   - **Criticos** (quebram funcao): ...
   - **Importantes** (violam padroes): ...
   - **Menores** (nice-to-have): ...
6. Se tudo OK: marcar issue com `✅` no titulo

## Output

Critica estruturada com fix sugerido, ou aprovacao clara.
