# Auditoria 07 — Bugs, Consistência e Regras de Negócio

**Agente:** Bug Hunter / Business Logic  
**Data:** 2026-05-28  
**Escopo:** Fluxos de dinheiro, matrícula automática, cupons, comissões, inadimplência

---

## Sumário Executivo

| Severidade | Quantidade |
|-----------|-----------|
| Crítico    | 1         |
| Alto       | 3         |
| Médio      | 3         |
| Baixo      | 2         |
| Informativo| 2         |

**Top 5 por impacto financeiro/matrícula (ordem decrescente):**
1. [Crítico] Orphan enrollment + coupon travado em falha MP — PMB checkout
2. [Alto] PMB checkout usa float aritmético para desconto em vez do Decimal helper
3. [Alto] PMB_SALES cap de 50% não se aplica a cupons do tipo FIXED em /api/admin/vendas
4. [Alto] `sweep-students-overdue` inconsistência de datas em `stillActive` (setMonth sem clamp)
5. [Médio] PAYMENT_OVERDUE de venda direta PMB não bloqueia o aluno na plataforma

---

## Achados Confirmados

---

### [Crítico] Orphan enrollment PENDING + cupom permanentemente consumido em falha de MP — PMB checkout

- **Agente responsável:** Bugs / Consistência
- **Categoria:** Fluxo incompleto — falta de rollback
- **Arquivo:** `src/app/api/checkout/route.ts`
- **Linha/trecho:** Criação do enrollment: linha ~304; bloco MP: linhas ~350–441; outer catch: linhas ~675–709
- **Evidência:**
  - O enrollment é criado em `prisma.enrollment.create` (linha ~304) **antes** do bloco MP.
  - O bloco MP (`if (gateway === "MP")`) não tem `try/catch` próprio — erros de `createPreapproval`/`createPreference` propagam para o outer catch (linha 675).
  - O outer catch libera `consumedCouponId` (linha 681) mas **não deleta o enrollment criado** — a variável `enrollment.id` não está em scope de limpeza no outer catch.
  - Contraste: `/api/loja/checkout`, `/api/aluno/comprar` e `/api/painel/vendas` todos rastreiam `createdEnrollmentId` e executam `enrollment.delete` no catch.
- **Descrição:** Se a API do Mercado Pago retornar 5xx ou timeout durante `createPreapproval`/`createPreference`, o aluno fica com um enrollment `PENDING` órfão. Na próxima tentativa ele cai em `DUPLICATE_ENROLLMENT` (409) e não consegue mais comprar o curso sem intervenção manual no banco. O cupom é liberado pelo outer catch, mas o enrollment não — causando bloqueio permanente.
- **Impacto:** Cliente não consegue comprar; receita perdida; requer intervenção manual no DB.
- **Cenário de risco:** Qualquer instabilidade da API do Mercado Pago (comum em picos) atinge 100% das compras na vitrine PMB com gateway MP.
- **Recomendação:** Adicionar no início do outer try a variável `let createdEnrollmentId: string | null = null`, atribuir após `prisma.enrollment.create`, e no outer catch chamar `prisma.enrollment.delete({ where: { id: createdEnrollmentId } })` antes de liberar o cupom — exatamente como fazem as outras 3 rotas.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Alto] PMB checkout usa float JS para desconto de cupom, não Decimal — divergência de arredondamento

- **Agente responsável:** Bugs / Consistência
- **Categoria:** Cálculo monetário incorreto
- **Arquivo:** `src/app/api/checkout/route.ts`
- **Linha/trecho:** Linhas ~241–256
- **Evidência:**
  ```ts
  // /api/checkout/route.ts:241-256
  const raw =
    coupon.discountType === "PERCENTAGE"
      ? (basePrice * Number(coupon.discountValue)) / 100
      : Number(coupon.discountValue)
  discountAmount = Math.min(raw, basePrice)
  const finalAmount = Number((basePrice - discountAmount).toFixed(2))
  ```
  Contraste: `/api/loja/checkout` (linha ~198), `/api/aluno/comprar` (linha ~156) e `/api/painel/vendas` (linha ~203) usam `applyCouponDiscount` do helper `src/lib/coupons/discount.ts` que usa `Prisma.Decimal` com `ROUND_HALF_EVEN`.
- **Descrição:** Aritmética float JS acumula erro em valores como R$ 99,99 × 33% = 32,9967, que `toFixed(2)` pode arredondar diferente do `Prisma.Decimal.ROUND_HALF_EVEN`. O `discount.ts` foi criado especificamente para eliminar essa divergência, mas a rota PMB pública não foi migrada. Além disso, o `discount.ts` já inclui o clamp `raw.gt(base) ? base : raw` de forma decimal-safe, enquanto o inline usa `Math.min`.
- **Impacto:** Valor cobrado no Mercado Pago pode divergir dos relatórios financeiros em centavos; desconto arredondado diferente entre canais de venda.
- **Cenário de risco:** Cupom percentual com casas decimais (ex: 33,33%) em curso de preço fracionado.
- **Recomendação:** Substituir o cálculo inline por `applyCouponDiscount` do helper centralizado, exatamente como as outras 3 rotas fazem.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Alto] PMB_SALES cap de 50% não cobre cupons do tipo FIXED em /api/admin/vendas

- **Agente responsável:** Bugs / Consistência
- **Categoria:** Regra de negócio incompleta
- **Arquivo:** `src/app/api/admin/vendas/route.ts`
- **Linha/trecho:** Linhas ~227–234
- **Evidência:**
  ```ts
  const cap = guard.session.role === "PMB_SALES" ? PMB_SALES_CAP : 100
  if (
    coupon.discountType === "PERCENTAGE" &&
    Number(coupon.discountValue) > cap
  ) {
    return NextResponse.json(...)  // 403
  }
  ```
  A condição só rejeita cupons `PERCENTAGE`. Cupons do tipo `FIXED` de qualquer valor são aceitos para PMB_SALES sem verificação percentual equivalente.  
  Embora `/api/admin/cupons/route.ts` (linha ~90) impeça PMB_SALES de **criar** cupons FIXED, um SUPER_ADMIN pode criar um cupom FIXED e um PMB_SALES pode aplicá-lo livremente.
- **Descrição:** PMB_SALES com cap de 50% consegue aplicar um cupom FIXED de R$999 em curso de R$100 (tornando gratuito) se um SUPER_ADMIN tiver criado tal cupom. O cap percentual não é calculado para valores absolutos.
- **Impacto:** PMB_SALES pode fechar vendas com desconto acima do autorizado, comprometendo margem.
- **Cenário de risco:** SUPER_ADMIN cria cupom FIXED para uso próprio; PMB_SALES o aplica via painel de vendas.
- **Recomendação:** No bloco de validação do cap em `/api/admin/vendas`, calcular `effectivePct = (discountAmount / basePrice) * 100` para ambos os tipos de cupom e rejeitar se `effectivePct > cap` (mesmo padrão já implementado em `/api/painel/vendas` linha ~213–218).
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Alto] `sweep-students-overdue` usa `setMonth` sem clamp no filtro `stillActive`

- **Agente responsável:** Bugs / Consistência
- **Categoria:** Bug de data/edge-case
- **Arquivo:** `src/app/api/cron/sweep-students-overdue/route.ts`
- **Linha/trecho:** Linhas 109–117 (função `stillActive` inline) vs linhas 18–27 (`addMonthsClamped`)
- **Evidência:**
  ```ts
  // linha 92 — CORRETO (usa addMonthsClamped):
  const expectedNextDue = addMonthsClamped(enrollment.startedAt, enrollment.installmentsPaid)

  // linhas 115–116 — INCORRETO (usa setMonth nativo sem clamp):
  const due = new Date(e.startedAt)
  due.setMonth(due.getMonth() + e.installmentsPaid)
  ```
  O próprio arquivo documenta o bug de `setMonth` overflow nas linhas 14–16.
- **Descrição:** Para alunos com `startedAt` em dia 31 (ex: 31/jan), `due.setMonth(1+1)` resulta em 3/mar (overflow para março) em vez de 28/fev. Isso faz `stillActive = true` incorretamente por um mês extra — o aluno inadimplente com outro curso que passou do vencimento é considerado "em dia" e **não é bloqueado** quando deveria ser.
- **Impacto:** Bloqueio atrasado em ~1 mês para alunos inadimplentes com `startedAt` no dia 31.
- **Cenário de risco:** Assinatura iniciada em 31/jan pagou parcela 1 (jan) mas não pagou parcela 2 (fev). O filtro `stillActive` classifica como em dia até março. Aluno continua com acesso indevido.
- **Recomendação:** Substituir a criação de `due` pelo `addMonthsClamped` já disponível no mesmo arquivo.
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

## Achados Prováveis / Médios

---

### [Médio] PAYMENT_OVERDUE de venda direta PMB (Asaas) não bloqueia aluno na plataforma

- **Agente responsável:** Bugs / Consistência
- **Categoria:** Fluxo de bloqueio incompleto
- **Arquivo:** `src/lib/asaas/process.ts`
- **Linha/trecho:** Linhas 182–190 (`processPmbDirectSale`, branch `PAYMENT_OVERDUE`)
- **Evidência:**
  ```ts
  if (event === "PAYMENT_OVERDUE") {
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { status: "SUSPENDED" },
    }).catch(swallow("asaas.process"))
  }
  ```
  Contraste: para cobranças de tenant (linhas 358–374), `PAYMENT_OVERDUE` suspende o tenant E chama `blockTenantStudents` se `billingMode === "AUTO"`. Para alunos individuais na vitrine PMB, apenas o enrollment é suspenso localmente — nenhuma chamada à plataforma parceira.
- **Descrição:** Aluno com curso MONTHLY comprado na vitrine PMB (gateway Asaas) inadimplente fica com `enrollment.SUSPENDED` no banco, mas o acesso na plataforma parceira permanece ativo (`status: ativo`). O `sweep-students-overdue` eventualmente bloqueia via `blockStudentInEA`, mas só após `STUDENT_GRACE_DAYS=5` dias adicionais.
- **Impacto:** Aluno inadimplente acessa cursos por até ~5 dias após o vencimento quando o webhook Asaas chega imediatamente.
- **Recomendação:** No branch `PAYMENT_OVERDUE` de `processPmbDirectSale`, chamar `blockStudentInEA(enrollment.studentId)` após suspender o enrollment (idêntico ao comportamento do sweep).
- **Correção aplicada:** Não
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Médio] Webhook Asaas PAYMENT_OVERDUE suspende tenant imediatamente, sem período de graça

- **Agente responsável:** Bugs / Consistência
- **Categoria:** Inconsistência de regra de negócio
- **Arquivo:** `src/lib/asaas/process.ts` vs `src/app/api/cron/sweep-tenants-overdue/route.ts`
- **Linha/trecho:** `process.ts` linhas ~358–374; `sweep-tenants-overdue/route.ts` linhas 72–79
- **Evidência:**
  - Webhook (`process.ts:358`): `PAYMENT_OVERDUE` → suspende tenant **imediatamente** (`status: "SUSPENDED"`).
  - Sweep (`sweep-tenants-overdue:72`): só suspende após `grace = policy?.gracePeriodDays ?? DEFAULT_GRACE_DAYS (3)` dias.
- **Descrição:** O Asaas envia `PAYMENT_OVERDUE` no dia do vencimento. Via webhook, o tenant é suspenso no mesmo dia — sem graça. Via sweep (para cobrir falhas de webhook), há 3 dias de graça. Os dois caminhos aplicam regras diferentes para o mesmo evento. Revendedor pode ser suspenso no dia do vencimento sem ter chance de pagar.
- **Impacto:** Experiência inconsistente; revendedores perdem acesso no dia do vencimento quando o webhook chega, mas teriam 3 dias se o webhook falhar.
- **Recomendação:** Definir o período de graça no webhook path também. Opção: em `processAsaasWebhook`, calcular `ageDays` a partir de `payment.dueDate` e só suspender se `ageDays >= DEFAULT_GRACE_DAYS`.
- **Correção aplicada:** Não
- **Status:** Requer decisão humana (é intencional ter graça?)
- **Confiança:** Alta

---

### [Médio] TODO de clawback para comissões já pagas (reembolso após pagamento de comissão)

- **Agente responsável:** Bugs / Consistência
- **Categoria:** Fluxo incompleto — financeiro
- **Arquivo:** `src/lib/referrals/commission.ts`
- **Linha/trecho:** Linhas 191–193
- **Evidência:**
  ```ts
  // linha 191-193:
  *  - PAID: NAO REVERTE o pagamento ja feito (dinheiro ja saiu).
  *    TODO: implementar saldo negativo via row espelhada com amount<0
  *    abatendo proximas comissoes. Hoje, registro manual.
  ```
  Quando `cancelCommissionForTenantPayment` é chamado para uma comissão já `PAID`, o sistema apenas marca `cancelReason = "[CLAWBACK_PENDING]..."` e bloqueia payouts automáticos futuros. Não há mecanismo automático de débito.
- **Descrição:** Se um revendedor foi pago sua comissão de indicação e o tenant indicado depois solicita estorno da mensalidade do Asaas, o sistema alerta o admin mas não debita automaticamente. Payouts futuros ficam bloqueados até resolução manual. Sem controle de SLA para resolução do clawback.
- **Impacto:** Financeiro — comissões pagas indevidamente ficam "abertas" indefinidamente sem cobrança automática.
- **Recomendação:** Implementar row de `ReferralCommission` com `amount < 0` para abater próximos payouts (conforme o TODO), ou pelo menos adicionar alerta de aging no admin quando clawback fica pendente por >N dias.
- **Correção aplicada:** Não
- **Status:** Requer decisão humana (design choice)
- **Confiança:** Alta

---

## Achados de Baixa Severidade / Informativos

---

### [Baixo] admin/vendas também usa float para cálculo de desconto de cupom

- **Agente responsável:** Bugs / Consistência
- **Categoria:** Cálculo monetário inconsistente
- **Arquivo:** `src/app/api/admin/vendas/route.ts`
- **Linha/trecho:** Linhas ~239–252
- **Evidência:** Mesmo padrão da rota PMB checkout — usa `(basePrice * Number(coupon.discountValue)) / 100` em float em vez de `applyCouponDiscount`.
- **Descrição:** Quatro rotas de checkout: três usam `applyCouponDiscount` (Decimal), duas (`/api/checkout` e `/api/admin/vendas`) usam float inline.
- **Impacto:** Centavos de discrepância em preços fracionados.
- **Recomendação:** Migrar para `applyCouponDiscount` em ambas as rotas restantes.
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Baixo] Comentário duplicado "── Passo 5:" em processMpWebhook

- **Agente responsável:** Bugs / Consistência
- **Categoria:** Qualidade de código
- **Arquivo:** `src/lib/mercadopago/process.ts`
- **Linha/trecho:** Linhas 321 e 328
- **Evidência:** Dois labels "── Passo 5:" — o segundo deveria ser "Passo 6".
- **Descrição:** Comentário cosmético, não afeta lógica.
- **Status:** Informativo
- **Confiança:** Alta

---

### [Informativo] `formulario-interesse.tsx` tem TODO de persistir campo `interesse`

- **Agente responsável:** Bugs / Consistência
- **Categoria:** Feature incompleta
- **Arquivo:** `src/components/main/formulario-interesse.tsx`
- **Linha/trecho:** Linha 38
- **Evidência:** `// TODO: estender o lead model pra persistir 'interesse'`
- **Descrição:** Dado de segmentação de lead não é persistido; sem impacto em dinheiro ou matrícula.
- **Status:** Informativo
- **Confiança:** Alta

---

## Fluxos Verificados como Corretos

- **Idempotência de matrícula via advisory lock:** `fulfill.ts` usa `pg_try_advisory_lock` por `externalPaymentId` — dois webhooks simultâneos não duplicam matrícula. Confirmado.
- **Consumo atômico de cupom:** `tryConsumeCoupon` usa `UPDATE ... WHERE used_count < max_uses` em instrução SQL única — sem race condition. Confirmado.
- **Isolamento cross-tenant em cupons:** `/api/loja/checkout` filtra `coupon.tenantId = tenant.id`, `/api/admin/vendas` filtra `coupon.tenantId = tenant.id` (comentário explica o risco evitado). Confirmado.
- **Anti-pirâmide em comissões:** `createCommissionForTenantPayment` explicitamente só olha 1 nível (`referrer.referrerTenantId` nunca consultado). Confirmado.
- **Rollback de enrollment em falha de API externa:** `loja/checkout`, `aluno/comprar`, `painel/vendas` — todos rastreiam `createdEnrollmentId` e deletam no catch. Confirmado (exceto PMB checkout, reportado acima).
- **Cron reactivate-paid não tem bug cross-enrollment:** `payments: { some: { ... } }` filtra payments que pertencem ao próprio enrollment via FK `Payment.enrollmentId`. Confirmado.
- **Bloqueio em massa com billingMode:** `blockTenantStudents` em `auto-block.ts` usa BATCH_SIZE=8 para não estourar rate-limit da plataforma parceira. Confirmado.
