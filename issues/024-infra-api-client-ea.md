# Issue 024 — Escola Avançada API Client

**Tipo:** integration
**Página:** global
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Implementar client API Escola Avançada com todos 21 endpoints. CRITICAL: form-data NÃO JSON. Retry logic, error handling, tipos TypeScript. Base: https://SUAESCOLA.com/api/v2/

## Componentes Envolvidos
- lib/escola-avancada/client.ts — main EA API client
- lib/escola-avancada/endpoints/ — arquivos por seção (usuarios, cursos, funcionarios, etc)
- lib/escola-avancada/types.ts — tipos EA responses
- lib/escola-avancada/errors.ts — custom errors

## Comportamentos
- `form-data-encoding` — usar form-data NÃO JSON
- `auth-token-header` — token via form-data
- `retry-logic` — retry 3x com backoff
- `error-handling` — custom errors com mensagens

## Critério de Aceite
- [ ] lib/escola-avancada/client.ts criado
- [ ] 21 endpoints implementados (usuarios/novo, usuarios/editar, usuarios/vinculocurso, etc)
- [ ] Form-data encoding (não JSON)
- [ ] Auth token via form-data field (não header)
- [ ] Retry logic 3 tentativas com backoff exponencial
- [ ] Error handling com custom exceptions
- [ ] TypeScript tipos para request/response
- [ ] DELETE usa HEADERS (não body)
- [ ] Preços em formato BR (virgula decimal)
- [ ] Validações input antes enviar (Zod)
- [ ] Logging requests/responses (em dev mode)
