# ADR-001 — Defesa em profundidade no banco (RLS) — Issue 119

**Status:** Proposto (requer decisão do owner) · **Data:** 2026-05-28 · **Riscos:** R3, R12, R25, R26

## Contexto
O app acessa o Postgres via Prisma com `pg.Pool` usando `DATABASE_URL` cujo usuário é o
**owner** das tabelas (`src/lib/prisma.ts`). Como o owner ignora RLS, **nenhuma policy de
Row Level Security é aplicada**, mesmo que existisse. Todo o isolamento multi-tenant depende
de filtros `where tenantId` no código de aplicação. A auditoria confirmou que os filtros
existem e estão corretos na amostra, mas **não há rede de segurança no banco**: uma única
query futura sem `where tenantId` vaza dados cross-tenant sem nenhuma barreira.

## Decisão a tomar
Escolher entre:

### Opção A — Adotar RLS com role de aplicação não-owner (defesa em profundidade real)
- Criar um role Postgres não-owner para o runtime; o app passa a conectar com ele.
- Habilitar `ENABLE ROW LEVEL SECURITY` nas tabelas com `tenantId` + policies por tenant/dono.
- O app precisa setar o contexto de tenant por conexão (ex: `SET app.tenant_id = ...` + policy
  `USING (tenant_id = current_setting('app.tenant_id'))`), o que é não-trivial com pool/serverless.
- **Prós:** barreira real no banco; conformidade mais forte. **Contras:** mudança grande e
  arriscada (pode quebrar todo acesso), exige reescrever a estratégia de conexão; risco de
  downtime. Migração precisa de ambiente de staging (issue 120) e testes (issues 109/110).

### Opção B — Manter owner, compensar com testes + revisão (risco aceito documentado)
- Manter a arquitetura atual; **compensar** com: (1) testes automatizados de tenant-scoping
  (issue 110) que falham se alguma rota vazar; (2) revisão obrigatória de toda query nova;
  (3) lint/CI que sinalize `findMany`/`findFirst` sem filtro de tenant em rotas de tenant.
- **Prós:** sem risco de quebra; rápido. **Contras:** continua sem barreira no banco.

## Recomendação
**Opção B no curto prazo** (com a suíte de testes de tenant-scoping como compensação),
e **planejar a Opção A** para quando staging (120) e cobertura de testes (110) estiverem
maduros. RLS sem staging + testes é arriscado demais para um sistema que move dinheiro.

## Itens seguros que podem ser feitos JÁ (independente da decisão A/B)
1. **Storage (R12):** tornar privados os buckets com PII (certificados — ver issue 100) e criar
   policies em `storage.objects` mesmo usando service-role (2ª barreira).
2. **FKs de Tenant (R25):** revisar `onDelete` de Payment/Certificate/WebhookLog — hoje `SetNull`
   reclassifica pagamentos como receita PMB ao deletar tenant. Avaliar `Restrict`/`NoAction`.
   *Não aplicado automaticamente:* muda semântica de deleção — requer confirmação de que tenants
   nunca são hard-deletados (ou que a reclassificação é indesejada).
3. **CHECK de coerência (R26):** adicionar constraints que garantam coerência tenant↔registro.
   *Não aplicado automaticamente:* pode rejeitar dados legados inconsistentes — exige auditoria
   dos dados atuais antes.

## Consequências
- Enquanto a Opção A não for adotada, o item de readiness ISO/27002 "controle de acesso em
  camadas" permanece **Parcial** (ver `CHECKLIST_ISO_READINESS.md`).
- A suíte de testes de tenant-scoping (issue 110) passa a ser **bloqueante no CI**.
