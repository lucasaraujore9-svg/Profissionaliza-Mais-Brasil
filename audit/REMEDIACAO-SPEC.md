# SPEC de Remediação — Hardening, Segurança, Dinheiro & Compliance

> Plano de implementação derivado da auditoria multiagente (2026-05-28).
> Segue o workflow do projeto: **SPEC → BREAK → PLAN → EXECUTE**.
> Esta SPEC é o "BREAK": quebra os 38 riscos (R1–R38) em **24 issues executáveis**
> (`issues/100-*.md` … `issues/123-*.md`), agrupadas em **3 etapas**.
> Use `/plan NNN` e `/execute NNN` para implementar cada uma.

## Princípios de execução
1. **Nada de fix destrutivo sem gate.** Migrations idempotentes; nada que apague dados sem decisão humana.
2. **Cada issue fecha com prova:** typecheck + lint verdes e, quando aplicável, teste automatizado novo.
3. **Fluxos de dinheiro exigem teste manual** do checkout antes de marcar como done.
4. **Não aplicar em produção sem staging** (Etapa 3 cria o staging; até lá, validar em preview com banco isolado).
5. **Ordem importa:** Etapa 1 (bloqueadores) → Etapa 2 (qualidade) → Etapa 3 (arquitetura/compliance).
   Issues dentro da etapa têm `Depende de` explícito.

## Rastreabilidade Risco → Issue
| Risco | Sev | Issue |
|---|---|---|
| R1 Certificados PII público | Crítico | 100 |
| R12 Storage sem policy | Alto | 100, 119 |
| R4 Escopo papéis PMB | Alto | 101 |
| R24 Revoke cert cross-scope | Médio | 101 |
| R2 Orphan enrollment checkout | Alto | 102 |
| R5 Desconto float | Alto | 103 |
| R6 Cupom FIXED burla cap | Alto | 104 |
| R7 setMonth sem clamp | Alto | 105 |
| R8 OVERDUE PMB não bloqueia EA | Alto | 105 |
| R9 /api/checkout sem rate-limit | Alto | 106 |
| R11 alterar-senha sem RL | Alto | 106 |
| R19 uploads sem RL | Médio | 106 |
| R10 senha temp em JSON | Alto | 107 |
| R31 env vars no Vercel | Médio | 108 |
| — Infra de testes | — | 109 |
| — Testes de fluxos críticos | — | 110 |
| R16 relatórios/broadcast/analytics | Alto | 111 |
| R30 WCAG nível Alto | Médio | 112 |
| R21 cobranca vaza info | Médio | 113 |
| R22 mustChangePassword client-only | Médio | 113 |
| R29 duplicação checkout/helpers | Médio | 114 |
| R20 x-forwarded-for RL | Médio | 115 |
| R13 exclusão LGPD | Alto | 116 |
| R38 termsAcceptedAt/retenção | Baixo | 116 |
| R14 audit log persistente | Alto | 117 |
| R15 consentimento analytics | Alto | 118 |
| R3 RLS ausente | Alto | 119 |
| R25 onDelete contábil | Médio | 119 |
| R26 tenantId nullable sem CHECK | Médio | 119 |
| R17 deploy muta DB sem lock | Alto | 120 |
| R27 bootstrap migrations | Médio | 120 |
| R37 db:reset/target | Baixo | 120 |
| R23 sessão JWT 30d | Médio | 121 |
| R18 CSP unsafe-inline/eval | Médio | 121 |
| R35 bcrypt/senha | Baixo | 121 |
| R36 HMAC replay | Baixo | 121 |
| R32 cache/PgBouncer | Médio | 122 |
| R33 xlsx | Baixo | 123 |
| R34 deps não usadas | Baixo | 123 |

## ETAPA 1 — Bloqueadores de produção (P0/P1)
Segurança crítica, fluxos de dinheiro e autorização. **Nada vai a produção em escala sem isto.**
Issues: **100, 101, 102, 103, 104, 105, 106, 107, 108**.
Critério de saída da etapa: R1 resolvido; bugs de dinheiro corrigidos com teste manual; permissões
escopadas; env de produção configurada; webhook MP funcional.

## ETAPA 2 — Curto prazo (qualidade, testes, A11y, performance)
Issues: **109, 110, 111, 112, 113, 114, 115**.
Critério de saída: Vitest + Playwright no CI; 6 fluxos críticos cobertos; relatórios sem OOM;
5 itens WCAG Alto corrigidos; duplicação de checkout eliminada.

## ETAPA 3 — Médio prazo (arquitetura, compliance, observabilidade)
Issues: **116, 117, 118, 119, 120, 121, 122, 123**.
Critério de saída: exclusão de dados + audit log persistente + consentimento; decisão de RLS/defesa
em profundidade implementada; staging + migrations gated; CSP forte; cache/pooler; deps limpas.

## Definição de Pronto (global)
- [ ] `npm run typecheck` e `npm run lint` verdes.
- [ ] Teste(s) automatizado(s) novo(s) quando a issue toca lógica (Etapa 2+).
- [ ] Risco correspondente movido para "Corrigido" em `audit/MATRIZ_DE_RISCOS.md`.
- [ ] Item correspondente marcado em `audit/CHECKLIST_PRODUCAO.md` / `CHECKLIST_ISO_READINESS.md`.
- [ ] Fluxos de dinheiro/PII validados manualmente em ambiente isolado antes de produção.
