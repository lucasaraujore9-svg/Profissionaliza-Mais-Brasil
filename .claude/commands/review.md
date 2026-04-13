# /review — Revisar codigo de uma issue completada

Verifique a qualidade e conformidade da implementacao com os padroes do projeto.

## Instrucoes

1. Pergunte qual issue revisar (ou leia do argumento)
2. Leia o arquivo da issue em `issues/NNN-nome.md`
3. Leia os docs de referencia:
   - `docs/design/STITCH-DESIGN-PLAN.md` — se proto
   - `CLAUDE.md` — padroes de codigo
   - `docs/architecture/DOMINIOS-GUIDE.md` — se multi-tenant
   - `docs/architecture/profissionaliza-mais-brasil-blueprint.md` — se behavior/API
4. Identifique todos os ARQUIVOS criados/modificados pela issue:
   - Grep por nomes de componentes/rotas mencionadas
   - Busque por date ranges do git se disponivel
   - Leia cada arquivo
5. Revise CADA ARQUIVO contra os criterios abaixo:
   - **Design System** (se UI/proto):
     - [ ] Usa paleta correta (Electric Blue #3B82F6, Canvas #FAFAFA, etc)
     - [ ] Fontes corretas (Satoshi headings, JetBrains Mono codigos)
     - [ ] Spacing consistente com design system
     - [ ] Responsivo (mobile/tablet/desktop)
   - **TypeScript / Tipos**:
     - [ ] Sem uso de `any`
     - [ ] Tipos explicitos em parameters e returns
     - [ ] Imports corretos com alias @/*
   - **Zod Validation** (se API routes):
     - [ ] Todos inputs tem schema Zod
     - [ ] Validacao acontece ANTES de usar dados
     - [ ] Erros de validacao retornam 400 com mensagem clara
   - **Multi-tenant** (se aplicavel):
     - [ ] Queries filtram por WHERE tenant_id
     - [ ] Middleware injeta x-tenant-id header
     - [ ] Nenhum acesso cross-tenant possivel
   - **States & Loading** (se tiver chamada HTTP):
     - [ ] Loading state exibido enquanto fetching
     - [ ] Error state exibido com mensagem clara
     - [ ] Retry logic presente para falhas
   - **Acessibilidade Basica**:
     - [ ] Imagens tem alt text
     - [ ] Inputs tem labels
     - [ ] Botoes tem text ou aria-label
     - [ ] Focus states visivel
   - **Clean Code**:
     - [ ] Sem console.log ou debug code
     - [ ] Sem dados hardcoded em behaviors (OK em protos)
     - [ ] Componentes em arquivos separados (um componente por arquivo)
     - [ ] Funcoes sao pequenas e focadas
     - [ ] Nenhuma lgica complexa sem documentacao
   - **Seguranca**:
     - [ ] MP access tokens criptografados (se aplicavel)
     - [ ] Webhooks validados (HMAC, tokens, etc)
     - [ ] Rate limiting configurado (se aplicavel)
     - [ ] Nenhuma credencial em codigo

6. Compile a lista de PROBLEMAS encontrados:
   - **Criticos** (quebram funcionalidade):
     - [ ] Problema 1 — Fix: sugestao
     - [ ] Problema 2 — Fix: sugestao
   - **Importantes** (violam padroes):
     - [ ] Problema 1 — Fix: sugestao
   - **Menores** (nice-to-have):
     - [ ] Problema 1 — Fix: sugestao

7. Se tudo OK:
   - Marque a issue como revisada (add ✅ ao titulo se aplicavel)
   - Sugira fazer /next para pegar proxima issue

## Output esperado
Uma critica estruturada com problemas encontrados e sugestoes de fix, ou aprovacao clara se tudo OK.
