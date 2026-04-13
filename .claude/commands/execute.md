# /execute — Executar uma issue planejada

Voce e um agente de execucao. Voce recebe uma issue (ja planejada) e IMPLEMENTA.

## Instrucoes

1. Pergunte qual issue executar (ou leia do argumento passado)
2. Leia o arquivo da issue em `issues/NNN-nome.md`
3. Leia os documentos de referencia relevantes:
   - Proto? → `docs/design/STITCH-DESIGN-PLAN.md` + `CLAUDE.md` padroes
   - Behavior/API? → `docs/architecture/profissionaliza-mais-brasil-blueprint.md` + `CLAUDE.md`
   - Integracao EA? → `docs/api/escola-avancada-api-completa.md`
   - Multi-tenant? → `docs/architecture/DOMINIOS-GUIDE.md`
   - Qualquer um → `CLAUDE.md` padroes de codigo
4. Identifique o TIPO da issue (deve estar no arquivo):
   - **proto**: Criar componentes com dados hardcoded, foco em design system
   - **infra**: Criar modulos de infraestrutura (auth, middleware, cache, crypto)
   - **behavior**: Conectar UI a dados reais (server components, API routes, Zod)
   - **integration**: Implementar clients de API externa, webhooks, cron

5. Execute o plano seguindo as regras do CLAUDE.md:
   - TypeScript strict (nao usar any)
   - Componentes: PascalCase, um por arquivo em `src/components/[contexto]/`
   - API Routes: Validar TODOS inputs com Zod antes de usar
   - Queries: SEMPRE filtrar por tenant_id no contexto vitrine/painel
   - Erros: try/catch tipado, nunca engolir erros silenciosamente
   - Tokens MP: NUNCA expor no client, criptografar com AES-256-GCM no banco
   - Webhooks: logar TUDO em webhook_logs table, retornar 200 imediato, processar async
   - Imports: usar alias @/* para imports relativos longos

6. Apos implementar cada arquivo, verifique:
   - Tipos corretos (sem any)
   - Imports corretos
   - Formatacao de codigo consistente
   - Zod schemas presentes em inputs de API

7. Apos completar TODOS os arquivos, faca commit:
   ```bash
   git add .
   git commit -m "feat(NNN): descricao curta da issue"
   ```

8. Execute checklist de verificacao:
   - [ ] Todos os componentes/arquivos da issue foram criados
   - [ ] Todos os comportamentos/logicas da issue foram implementados
   - [ ] Responsivo (mobile/tablet/desktop) — se UI
   - [ ] Estados de loading e erro tratados — se tiver chamada HTTP
   - [ ] Tenant isolation respeitado (WHERE tenant_id) — se aplicavel
   - [ ] Nenhum console.log ou debug code deixado
   - [ ] Nenhum dado hardcoded em behaviors (OK em protos)
   - [ ] TypeScript strict (sem any)

## Regras por Tipo

### Proto (protos de UI)
- Dados hardcoded em constantes no topo do arquivo
- Usar shadcn/ui como base dos componentes
- Cores do design system (Electric Blue #3B82F6, Canvas #FAFAFA, etc)
- Fonte Satoshi para headings, JetBrains Mono para precos/codigos
- Responsivo mobile-first
- Sem chamadas a API real (OK usar dados mock)

### Infra (modulos de infraestrutura)
- Modulos em `src/lib/` ou `src/middleware.ts`
- Exportar tipos junto com funcoes
- Documentacao breve de como usar
- Testes manuais documentados no criterio de aceite

### Behavior (conectar UI a dados reais)
- Server Components para data fetching (quando possivel)
- Client Components apenas para interatividade local
- Server Actions ou API Routes para mutations
- Zod schemas para validacao de inputs (API Routes)
- use 'use client' apenas quando necessario
- Queries filtram por tenant_id automaticamente

### Integration (APIs externas, webhooks, cron)
- Clients em `src/lib/[servico]/` (ex: `src/lib/escola-avancada/`)
- Retry logic para chamadas externas (exponential backoff)
- Logging detalhado em cada etapa
- Tratamento de rate limits e timeouts
- Webhooks loguem entrada em webhook_logs
- Cron jobs em `src/app/api/cron/` com verificacao de CRON_SECRET
