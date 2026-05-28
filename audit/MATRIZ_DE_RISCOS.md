# Matriz de Riscos — Auditoria PMB (2026-05-28)

> **Atualização de remediação (2026-05-28):** muitos riscos já foram corrigidos em código.
> Status autoritativo por issue em `issues/REMEDIACAO-INDEX.md`.
> **Corrigidos:** R2, R4, R5, R6, R7, R9, R10(parcial), R11, R15, R16, R17, R19, R20, R21, R22,
> R24, R28, R30, R31, R35, R37 + R14 (audit log). **Bloqueados (decisão/externo):** R1, R3, R8,
> R12, R13, R18, R23, R25, R26, R32, R33(parcial), R36. Validação: typecheck ✅ / lint ✅ / testes ✅ (10).

Severidades adjudicadas pelo Orquestrador após revisão cruzada e recalibração do Red Team.
Probabilidade: Alta/Média/Baixa de exploração/ocorrência real. Prioridade = Severidade × Probabilidade.

| ID | Sev | Categoria | Problema | Impacto | Prob. | Prioridade | Status |
|---|---|---|---|---|---|---|---|
| **R1** | **Crítico** | Privacidade/Storage | Certificados PDF com nome+CPF em bucket Supabase **público**; código do PDF previsível (~28 bits, `code.ts:8-9`) e exposto em `/validar/{code}`; Storage sem rate-limit | Raspagem em massa de PII; violação LGPD | Alta | **P0** | Requer decisão humana |
| R2 | Alto | Bug/Dinheiro | `/api/checkout` (PMB): bloco MP sem try/catch → `enrollment.PENDING` órfão trava recompra (409) e libera cupom mas não deleta enrollment (`checkout/route.ts:~304-441`) | Perda de venda; cliente travado | Média | P1 | Recomendado |
| R3 | Alto | Arquitetura/DB | **RLS ausente** — Prisma conecta como owner (`prisma.ts:15-21`); sem rede de segurança no banco. Qualquer query sem `where tenantId` vaza | Vazamento cross-tenant se uma rota falhar | Média | P1 | Requer decisão humana |
| R4 | Alto | AuthZ | PMB_SALES / PMB_RESELLER_MGR alteram `status`/`policy`/`billing` de **qualquer** tenant sem checar `accountManagerId` (`revendedores/[id]/status|policy|billing`) | Sabotagem de loja; desligar auto-block de inadimplência | Média | P1 | Requer decisão humana |
| R5 | Alto | Bug/Dinheiro | Desconto de cupom com aritmética float em `/api/checkout` e `/api/admin/vendas` (não usa `applyCouponDiscount`/Decimal) | Divergência de centavos cobrado vs relatório | Alta | P1 | Recomendado |
| R6 | Alto | AuthZ/Dinheiro | Cap de 50% do PMB_SALES só valida cupom `PERCENTAGE`; `FIXED` burla o limite (`admin/vendas:~227-236`) | Desconto ilimitado (preço→0) | Média | P1 | Requer decisão humana |
| R7 | Alto | Bug/Negócio | `stillActive` no sweep usa `setMonth` sem clamp (`sweep-students-overdue:115-116`) vs `addMonthsClamped` no resto | Atraso de ~1 mês no bloqueio de inadimplente (dia 31) | Média | P1 | Recomendado |
| R8 | Alto | Bug/Negócio | Venda direta PMB com `PAYMENT_OVERDUE` (Asaas) só marca `SUSPENDED` no banco, não chama `blockStudentInEA` (`asaas/process.ts:182-190`) | Aluno inadimplente mantém acesso na plataforma parceira | Média | P1 | Recomendado |
| R9 | Alto | DoS/Custo | `/api/checkout` (PMB) sem rate-limit (loja/checkout tem) | Flood de cobranças Asaas/MP, custo + lixo no banco | Média | P1 | Recomendado |
| R10 | Alto | Exposição | Senha temporária de revendedor retornada em **plaintext** no JSON (`admin/revendedores/route.ts:~378`) | Vaza em log drains/observabilidade | Média | P1 | Requer decisão humana |
| R11 | Alto | AuthN | `alterar-senha-inicial` sem rate-limit e sem exigir senha atual | Brute-force/abuso da troca obrigatória | Baixa | P2 | Recomendado |
| R12 | Alto | Storage | Acesso a Storage 100% via service-role, buckets sem policy de defesa em profundidade | Reforça R1; sem 2ª barreira | Média | P1 | Requer decisão humana |
| R13 | Alto | LGPD | Direito de exclusão do titular não implementado (sem DELETE de conta/soft-delete) | Não-conformidade art. 18 LGPD | Alta | P1 | Requer decisão humana |
| R14 | Alto | LGPD/Forense | `logAudit()` emite só Pino/stdout, sem tabela no banco | Sem trilha para investigação/ANPD | Alta | P1 | Recomendado |
| R15 | Alto | LGPD | Vercel Analytics carrega incondicionalmente (`layout.tsx:110-111`) ignorando banner de cookies | Divergência política × comportamento | Alta | P1 | Recomendado |
| R16 | Alto | Performance | Relatórios (15 `findMany` sem `take`), broadcast `scope=ALL` + N+1, analytics 180d em memória | OOM/timeout em produção com volume | Média | P1 | Recomendado |
| R17 | Alto | DevOps | Build aplica migrations sem `pg_advisory_lock`; sem staging separado (previews→prod DB) | Race em deploy concorrente; corrupção de schema | Baixa | P2 | Requer decisão humana |
| R18 | Médio | Segurança | CSP com `'unsafe-inline'` + `'unsafe-eval'` em script-src (`next.config.ts:32`) | Remove defesa contra XSS futuro | Média | P2 | Requer decisão humana |
| R19 | Médio | Segurança | Rotas de upload admin/painel sem rate-limit (`certificate-template/upload` e 5 outras) | Abuso de upload | Baixa | P2 | Recomendado |
| R20 | Médio | Segurança | `x-forwarded-for` (1º segmento, controlável) como chave de rate-limit (`ratelimit.ts:128`) | Possível bypass (mitigado na Vercel) | Baixa | P3 | Recomendado |
| R21 | Médio | IDOR/Info | `GET /api/cobranca/[paymentId]` vaza valor/descrição da cobrança sem token por-cobrança | Enumeração de info financeira | Média | P2 | Recomendado |
| R22 | Médio | AuthZ | `mustChangePassword` enforced só no client (login-form), não em guards/layouts | Bypass via deep-link/API direta | Média | P2 | Recomendado |
| R23 | Médio | Sessão | JWT 30 dias sem revogação; desativar/rebaixar usuário não invalida token vigente | Janela de acesso pós-desativação | Média | P2 | Requer decisão humana |
| R24 | Médio | AuthZ | Cross-scope revoke de certificado (`admin/certificates/[id]/revoke` sem `tenantId`) | PMB_SALES revoga cert de revendedor | Baixa | P3 | Recomendado |
| R25 | Médio | DB/Contábil | FKs de Tenant com `onDelete: SetNull` em Payment/Certificate/WebhookLog (`schema.prisma:649,780,1201`) | Deletar tenant reclassifica pagamentos como receita PMB | Baixa | P2 | Requer decisão humana |
| R26 | Médio | DB | `tenantId` nullable em 6 models sem CHECK de coerência | Filtro com `tenantId=undefined` pode casar conjunto errado | Baixa | P2 | Recomendado |
| R27 | Médio | DevOps | Bootstrap de migrations marca tudo como aplicado sem rodar; pode mascarar drift (`apply-pending-migrations.mjs:103-117`) | Migration não aplicada silenciosamente | Baixa | P3 | Recomendado |
| R28 | Médio | Proxy | `proxy.ts:189` `pathname.includes(".")` pula resolução de tenant → 400 em paths com ponto na vitrine | Falha funcional (seguro) | Baixa | P3 | Recomendado |
| R29 | Médio | Arquitetura | 3 rotas de checkout 60% duplicadas + `dueDateInDays`/`normalizeE164` duplicadas; `TenantContext` bifurcado | Manutenção: fix precisa ser replicado (causa de R2/R5) | Alta | P2 | Recomendado |
| R30 | Médio | A11y | 5 itens WCAG nível Alto: `focus:outline-none` sem ring (2.4.11), erros sem `role="alert"` (4.1.3), formulários sem `autocomplete` (1.3.5), hierarquia h1→h3 (1.3.1), slideshow sem pausa (2.2.2) | Barreira a usuários com deficiência; risco legal | Alta | P2 | Recomendado |
| R31 | Médio | Env/DevOps | Vars usadas sem doc (MP_WEBHOOK_SECRET, PMB_*, WA_GATEWAY_*) | Deploy quebrado/feature off silenciosa | Média | P2 | **Corrigido** (.env.example) |
| R32 | Médio | Performance | `getSystemSettings` sem cache no hot-path; dashboards sem Redis cache; pool=10 sem PgBouncer (porta 5432) | Esgotar 60 conexões do Supabase free sob carga | Média | P2 | Recomendado |
| R33 | Baixo | Dep/SupplyChain | `xlsx` HIGH (proto pollution/ReDoS) — mas só usado p/ export (`report-viewer.tsx:102`), nunca `XLSX.read` | Risco real baixo; migrar p/ exceljs | Baixa | P3 | Recomendado |
| R34 | Baixo | Dep | `animejs` e `zustand` sem nenhum uso; `shadcn` (CLI) em dependencies | Peso/ruído de dependências | Baixa | P3 | Recomendado |
| R35 | Baixo | AuthN | bcrypt cost inconsistente (10 vs 12); senha mínima 6 (login) vs 8 (reset) | Endurecimento | Baixa | P3 | Recomendado |
| R36 | Baixo | Webhook | HMAC MP sem janela temporal (replay) — mitigado por idempotência | Replay no-op | Baixa | P3 | Recomendado |
| R37 | Baixo | DevOps | `db:reset --force` exposto sem guarda de `NODE_ENV`; `tsconfig target ES2017` | Erro operacional; bundle | Baixa | P3 | Recomendado |
| R38 | Baixo | LGPD | Aceite de termos sem `termsAcceptedAt`; retenção de Lead/Student sem TTL definido | Rastreabilidade de consentimento | Média | P2 | Requer decisão humana |

**Totais (adjudicados):** Crítico **1** · Alto **16** · Médio **15** · Baixo **6** + Informativos diversos.
**Corrigido nesta auditoria:** 1 (R31, parcial — `.env.example`).
