# Issue 119 — Defesa em profundidade no banco: RLS/role, policies de Storage, FKs e CHECKs

**Tipo:** db / arquitetura (remediação)
**Escopo:** `src/lib/prisma.ts` · `prisma/schema.prisma` · `prisma/migrations/*` · Supabase (roles, RLS, `storage.objects` policies)
**Depende de:** 100 (Storage privado) — coordenar
**Prioridade:** P2 (arquitetural; alto impacto, alto risco de quebra)
**Risco:** R3 (Alto) + R12 (Alto) + R25 (Médio) + R26 (Médio)

## Contexto / Evidência
- **R3:** Prisma conecta como **owner** (`prisma.ts:15-21`) → RLS não se aplica; sem rede de segurança
  no banco. Qualquer query sem `where tenantId` vaza.
- **R12:** Storage 100% via service-role, sem policies em `storage.objects` como 2ª barreira.
- **R25:** FKs de Tenant com `onDelete: SetNull` (Payment/Certificate/WebhookLog — `schema.prisma:649,780,1201`)
  → deletar tenant reclassifica pagamentos como receita PMB (corrupção contábil).
- **R26:** `tenantId` nullable em 6 models sem CHECK de coerência (filtro com `undefined` casa conjunto errado).

## O Que Fazer (decisão arquitetural — avaliar opções)
1. **Defesa em profundidade no acesso:** avaliar criar um role de aplicação **não-owner** para o Prisma
   + ativar **RLS** com policies por `tenantId`/dono. Alternativa de menor custo: manter owner mas
   **compensar com testes de tenant-scoping** (issue 110) + documentar formalmente o risco aceito.
2. **Storage:** criar policies em `storage.objects` (mesmo usando service-role) como 2ª barreira;
   buckets com PII privados (alinha com issue 100).
3. **FKs:** revisar `onDelete` dos vínculos de Tenant para `Restrict`/`NoAction` onde fizer sentido
   contábil (não reclassificar pagamentos).
4. **CHECKs:** adicionar constraints de coerência tenant↔registro onde aplicável.

## Decisão humana necessária
- Adotar RLS+role não-owner (mudança grande, risco de quebrar acesso) **ou** aceitar risco com
  compensação por testes? — **arquitetura/negócio**.

## Critério de Aceite
- [ ] Decisão de RLS/defesa em profundidade tomada e **documentada** (ADR).
- [ ] Se RLS adotado: policies por tenant validadas sem quebrar fluxos (testes 110 passam).
- [ ] Policies de `storage.objects` ativas; buckets com PII privados.
- [ ] `onDelete` das FKs de Tenant revisado (sem reclassificação contábil).
- [ ] CHECKs de coerência adicionados onde aplicável (migration idempotente).
- [ ] R3/R12/R25/R26 atualizados em `audit/MATRIZ_DE_RISCOS.md`.
- [ ] `npm run typecheck` + `lint` verdes.
