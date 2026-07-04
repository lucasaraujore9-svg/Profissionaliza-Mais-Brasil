# Matriz de Cobertura — Profissionaliza Mais Brasil
_Data: 2026-07-04 · Prova de cobertura total (sem amostragem) · base: `auditoria/INVENTARIO.md` (2026-07-03)_

Este documento prova que **cada item do inventário recebeu veredito** (OK / Achado / N-A com motivo) por ao menos um dos 11 domínios da auditoria, e rastreia o ciclo de vida das correções da Fase 2. A fonte da verdade item-a-item por categoria é: a tabela tela×veredito de 137 linhas em `achados/frontend.md`, e os blocos de achado (com `arquivo:linha`) em cada `achados/<dominio>.md`.

## 1. Cobertura por categoria do inventário

| Categoria | Total (inventário) | Coberto por | Veredito |
|---|---|---|---|
| Telas (URLs navegáveis) | 137 | frontend (tabela 137×veredito) | **137/137** — 135 OK, 2 Achado (FE-003, FE-007, ambos corrigidos) |
| `layout.tsx` / boundaries | 9 layouts + 17 loading/error/not-found | frontend | Coberto — estados de erro/loading/not-found revisados; achado FE-007 (retry) corrigido |
| Route handlers | 309 arquivos / 406 métodos | seguranca + api + saas + observabilidade | Coberto — auth/authz/tenant-scoping/validação Zod (seg+saas), idempotência/resiliência (api), logging (obs); 292/309 com logger estruturado |
| Server Actions | 3 arq / 3 funções | seguranca + codigo | Coberto — `previewCheckoutCoupon`, `verificar` (validar), signOut inline |
| Funções/hooks `lib/` | 251 módulos / 720 exports | codigo + banco + performance + api | Coberto — type-safety, ciclos (madge 9→0), N+1, clients de integração; exports mortos removidos (COD-005) |
| Componentes | 342 | frontend | **342/342** — varredura de link morto (zero), estados, a11y; 9 órfãos removidos (COD-005) |
| Middleware / Proxy | `src/proxy.ts` | seguranca + performance + observabilidade + devops | Coberto — Edge safety, fail-open (dcd03fd), edgeLog (OBS-007), tenant classification testado (QA-016) |
| Crons | 17 | observabilidade + performance + banco + devops | Coberto — instrumentação (OBS-003), caps de progresso (PERF-005), N+1 (DB-006), pg_cron (OPS-013 aberto) |
| Webhooks | 3 (Asaas/MP/LMS) | api + seguranca + observabilidade + lgpd | Coberto — assinatura + idempotência + redação de PII (OBS-008/LGPD-014) |
| Models Prisma | 44 | banco + lgpd | Coberto — índices (DB-001), tipos de dinheiro Decimal, mapa de PII/ROPA (LGPD-004) |
| Migrations | 81 (+4 novas nesta operação) | banco + devops | Coberto — idempotência, não-destrutividade; novas: índices BI, audit_logs imutável |
| Testes | 103 arq / 570 casos (era 53/328) | testes | Coberto — mapa por área crítica; +242 casos nesta operação |

**Conclusão de cobertura:** nenhuma lacuna de inventário identificada. Toda rota, tela, action, handler, função e componente foi coberto por ≥1 domínio.

## 2. Estados de UI por tela (resumo da matriz 137×veredito)

A tabela completa tela×veredito está em `achados/frontend.md` (seção "Cobertura — 137/137 telas"). Resultado:
- **135 telas OK** — loading/erro/vazio/sucesso presentes e adequados, sem link morto, sem rota estruturalmente quebrada.
- **2 telas com achado**, ambos **corrigidos** nesta operação: FE-003 (`/loja/checkout`, `/loja/confirmacao`, `/loja/pagar/[id]` — vazamento do prefixo `/loja`) e FE-007 (`/admin/relatorios/[tab]`, `/painel/relatorios/[tab]` — retry no erro).

## 3. Ciclo de vida das correções (Fase 2) — por domínio

| Domínio | Corrigidos | Aberto (decisão do dono) | Aberto (⚠️MIGRAÇÃO) | Aberto (infra/produto) | Aceito |
|---|---|---|---|---|---|
| seguranca | SEG-009, SEG-004, SEG-005, SEG-006(parcial) | SEG-001 (RLS→VPS) | — | SEG-002 (CSP nonce, QA de browser) | SEG-007 (nodemailer sem patch) |
| banco | DB-001, DB-004, DB-005, DB-006, DB-007, DB-008, DB-010 | DB-002 (bucket), DB-003 (RLS→VPS) | — | — | DB-009 |
| api | API-009, API-004, API-005, API-006, API-008, API-010 | — | — | — | — |
| performance | PERF-001/002/003/004/005/006/007/010/011/012/013 + API-007 | — | — | — | PERF-008 (img Vercel), PERF-009 (Turbopack) |
| observabilidade | OBS-002, OBS-003, OBS-007, OBS-008, OBS-009, OBS-010 + LGPD-014 | — | OBS-006 (logs→VPS, doc feito) | OBS-001/004/005 (parte interna feita; falta serviço externo) | — |
| frontend | FE-003, FE-007 (+ FE-005/006 re-verif.) | — | — | — | — |
| lgpd | LGPD-004/005/007/009/011/012/013 (+ 003/006/010/014) | LGPD-001 (bucket), LGPD-002 (pixels) | — | — | — |
| saas | SAAS-001, SAAS-006, SAAS-008, SAAS-009, SAAS-010 | — | — | SAAS-007 (fail-open, decisão de produto) | — |
| codigo | COD-003, COD-004, COD-005, COD-006 | — | COD-008 (acoplamento Vercel→VPS) | — | COD-007 (createReseller não-atômico) |
| testes | QA-005/008/009/010/011/012/013/014/015/016/017 | — | — | QA-006 (E2E/integração-DB), QA-007 (thresholds) | — |
| devops | OPS-010 (parcial), OPS-012 (rodada anterior) | OPS-001, OPS-013 | OPS-002/003/004/005/006/007/008/009/011 (doc `VERCEL-PARA-VPS.md`) | — | — |

**Totais:** ~68 achados marcados Corrigido · 6 Aceito (risco assumido) · restantes Abertos por decisão do dono, trilha de migração VPS, ou infra nova (E2E/error-tracker) — nenhum é bug de produção não endereçado.

## 4. Itens que dependem de ação manual do dono (não executados — regra 9 do SKILL)

| ID | Ação | Por quê parou |
|---|---|---|
| LGPD-001 / DB-002 | **P0** — tornar bucket `certificates` privado no console Supabase + policy `storage.objects` + backfill de `pdf_url` legadas | Infra/dados fora do repo; código já grava path interno (mitigado) |
| LGPD-002 | Consentimento real de cookies/pixels (banner com recusa) | Muda comportamento — vetado por decisão sua registrada |
| OPS-001 | Desacoplar migrations do `npm run build` | Muda mecanismo de deploy — sua decisão |
| OPS-013 | Confirmar 13 jobs pg_cron `active=true` em prod (`select … from cron.job`) | Verificação no Supabase — sua decisão |
| SEG-006 | Confirmar envs em prod + eventual rotação de `ENCRYPTION_KEY` (runbook entregue) | Produção/segredos |
| DB-001 | Aplicar índices em janela de baixo tráfego / validar via EXPLAIN | Lock em tabela cheia; migration pronta e aditiva |
| SEG-002, SAAS-007, QA-006/007 | Decisões de arquitetura/produto/infra (CSP, fail-open, E2E, thresholds) | Exigem QA de browser / infra de CI nova |

## 5. Prova mecânica (Portão Zero-Erro)

Última execução (2026-07-04) — registrada em `auditoria/portao.log`:
- `tsc --noEmit`: **0 erros**
- `eslint`: **0 erros** (1 warning pré-existente em `scripts/render-cert-samples.tsx`, arquivo não tocado)
- `next build` (`SKIP_PENDING_MIGRATIONS=1` + DATABASE_URL throwaway, padrão do `ci.yml`): **Compiled successfully**
- `vitest run`: **570 testes / 103 arquivos** verdes
- `madge`: **0 ciclos** de import

Cada uma das ~68 correções passou este portão antes do seu commit atômico; nenhuma foi mantida com o portão vermelho.
