# Venda direta parcelada (aluno escolhe o meio) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um tipo só de venda direta parcelada (entrada opcional + N parcelas iguais) em que o aluno escolhe PIX, boleto ou cartão na página `/pagar/<id>`, nos dois gateways, na loja da unidade e na PMB.

**Architecture:** Reusa `BoletoInstallment` como livro de parcelas de QUALQUER meio, sob `paymentType = BOLETO_INSTALLMENT` + discriminador `Enrollment.flexInstallments`. PIX/boleto = a plataforma cria a cobrança da linha (Asaas `POST /payments`, MP `/v1/payments` com `parc_<linha>`); cartão = assinatura do gateway sobre as linhas restantes, cada cobrança dela baixa a próxima linha. Regras puras (agenda, rótulos, o que a linha oferece) num módulo só, consultado pela página E pelo servidor.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Prisma 7 / Postgres, Zod, Vitest, Asaas v3, Mercado Pago (`/v1/payments`, `/preapproval`), React Email.

**Spec:** `docs/superpowers/specs/2026-11-06-venda-direta-parcelada-design.md`

## Global Constraints

- Parcelas sempre do mesmo valor; entrada opcional de valor próprio. Piso `MIN_INSTALLMENT_AMOUNT = 5` (`src/lib/installments/schedule.ts`) por linha, inclusive a entrada; `MAX_BOLETO_INSTALLMENTS = 24` parcelas (sem contar a entrada); sem entrada, mínimo `MIN_BOLETO_INSTALLMENTS = 2`.
- Entrada vence no dia da venda; "1º vencimento" do formulário é o da parcela 1 (padrão: venda + 1 mês).
- Meio do plano: escolhido na 1ª linha paga depois da entrada (ou na 1ª, sem entrada). Só muda quando a cobrança do cartão é negada; o meio que pagar a linha negada vira o meio do plano.
- Cartão = assinatura do gateway, 1ª cobrança imediata. Entrada no cartão = 1x avulsa.
- Cartão negado: cancela a assinatura na 1ª recusa; a linha só vira negada depois do cancelamento CONFIRMADO.
- Link sempre página da plataforma; nunca `invoiceUrl` hospedada, `init_point`, `ticket_url` (`src/lib/checkout/payment-link-coverage.test.ts`).
- Toda cobrança Asaas leva `splits: await asaasSplitsForEnrollment(enrollmentId)` (`src/lib/course-authoring/split-server.ts:199`).
- Todo POST público novo de checkout: `rejectBot()` (`src/lib/checkout/bot-guard.ts`) e path coberto por `BOTID_PROTECTED_PATHS` (`src/instrumentation-client.ts`); `checkout/bot-guard-coverage.test.ts` tem de passar.
- E-mail ao aluno nunca em rajada: no máximo 15 por execução do cron, enviados em sequência (o pool SMTP já espaça 15 s por caixa).
- Migration aditiva e idempotente (`IF NOT EXISTS`), sem backfill. Carnê antigo e MONTHLY antigo (sem `flexInstallments`) não mudam de comportamento.
- Vitrine e assinatura de planos (`StudentSubscription`) fora do escopo. Pix Automático fora.
- Portão por task: `npm run typecheck` · `npm run lint` · `npm test`. Build no fim (`DATABASE_URL` qualquer exportado; ver CLAUDE.md).

## Review Focus

1. **Parcela cobrada duas vezes no cartão negado** — o aluno paga no PIX enquanto o gateway ainda vai retentar o cartão. Esperado: PIX/boleto só abrem depois do cancelamento confirmado; cancelamento não confirmado deixa a linha sem oferta e alerta o admin. Teste em Task 7.
2. **Webhook da assinatura entregue duas vezes** — mesmo `asaasPaymentId`/`mpPaymentId` chega de novo. Esperado: baixa UMA linha só. Teste em Task 6.
3. **Aluno troca de PIX para boleto na mesma linha antes de pagar** — esperado: a cobrança anterior é apagada (Asaas: `deleted: true` confirmado; MP: `cancelPayment`) antes da nova; nunca duas em aberto. Teste em Task 5.
4. **POST forjado pagando a parcela 1 com a entrada em aberto, ou método não oferecido** — esperado: 409 `METHOD_NOT_OFFERED`, decidido pela mesma `flexOffer` da página. Teste em Task 8.
5. **Cron marca linha do cartão como vencida no dia da cobrança, antes do webhook** — esperado: carência de 3 dias para linha de plano no cartão sem recusa. Teste em Task 11.

---

### Task 1: Schema e migration

**Files:**
- Modify: `prisma/schema.prisma` (model `Enrollment` ~:1510, model `BoletoInstallment` :1860)
- Create: `prisma/migrations/20261106_flex_installments/migration.sql`

**Interfaces:**
- Produces:
  - `enum InstallmentMethod { PIX BOLETO CREDIT_CARD }`
  - `Enrollment.flexInstallments Boolean @default(false) @map("flex_installments")` — discriminador da venda nova.
  - `Enrollment.flexHasDownPayment Boolean @default(false) @map("flex_has_down_payment")` — linha 1 é a entrada.
  - `Enrollment.installmentMethod InstallmentMethod? @map("installment_method")` — meio do plano; null = ainda não escolhido.
  - `BoletoInstallment.method InstallmentMethod?` — meio da cobrança emitida para a linha.
  - `BoletoInstallment.cardDeclinedAt DateTime? @map("card_declined_at")`
  - `BoletoInstallment.availableEmailSentAt DateTime? @map("available_email_sent_at")`

- [ ] **Step 1:** Adicionar enum e colunas acima, com comentário curto apontando para o spec.
- [ ] **Step 2:** Migration SQL à mão: `DO $$ BEGIN CREATE TYPE "InstallmentMethod" ... EXCEPTION WHEN duplicate_object THEN null; END $$;` e `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` para as 6 colunas. Sem backfill.
- [ ] **Step 3:** `npx prisma generate && npm run typecheck` — zero erro.
- [ ] **Step 4:** Commit `feat(parcelado): colunas do plano parcelado com meio escolhido pelo aluno`.

---

### Task 2: Regras puras do plano (`flex.ts`)

**Files:**
- Create: `src/lib/installments/flex.ts`
- Test: `src/lib/installments/flex.test.ts`

**Interfaces:**
- Consumes: `MIN_INSTALLMENT_AMOUNT`, `MAX_BOLETO_INSTALLMENTS`, `MIN_BOLETO_INSTALLMENTS`, `isWithinRevealWindow` (`schedule.ts`).
- Produces:
  ```ts
  export type FlexMethod = "PIX" | "BOLETO" | "CREDIT_CARD"
  export interface FlexScheduleInput { count: number; installmentValue: number; downPayment: number | null; firstDueDate: Date; saleDate: Date }
  export interface FlexRowDraft { number: number; amount: number; dueDate: Date }
  export function flexScheduleError(i: FlexScheduleInput): string | null
  export function buildFlexSchedule(i: FlexScheduleInput): FlexRowDraft[]
  export function flexTotal(i: Pick<FlexScheduleInput, "count" | "installmentValue" | "downPayment">): number
  export function flexRowLabel(row: { number: number }, hasDownPayment: boolean, rowsTotal: number): string
  export function flexPlanSummary(i: { hasDownPayment: boolean; downPayment: number | null; count: number; installmentValue: number }): string
  export interface FlexRowState { number: number; status: "SCHEDULED"|"GENERATED"|"PAID"|"OVERDUE"|"CANCELLED"; dueDate: Date; cardDeclinedAt: Date | null }
  export interface FlexPlanState { hasDownPayment: boolean; method: FlexMethod | null; subscriptionActive: boolean; rows: FlexRowState[] }
  export type FlexOffer =
    | { kind: "pay"; rowNumber: number; methods: FlexMethod[]; card: "single" | "subscription" | null }
    | { kind: "auto"; nextDueDate: Date }      // cartão em dia
    | { kind: "waiting"; availableFrom: Date } // próxima linha fora da janela
    | { kind: "done" }
  export function flexOffer(plan: FlexPlanState, now: Date): FlexOffer
  ```

Regras de `flexOffer` (tabela do spec): linha da vez = menor `number` não PAID/CANCELLED. Entrada em aberto → `methods: [PIX, BOLETO, CREDIT_CARD], card: "single"`. `method === null` → os três, `card: "subscription"`. `method` PIX/BOLETO → só ele, `card: null`. `method === CREDIT_CARD` e linha da vez com `cardDeclinedAt` → os três, `card: "subscription"`; sem recusa e `subscriptionActive` → `auto`. Linha fora da janela → `waiting` com `dueDate − 7 dias`.

- [ ] **Step 1: Testes que falham** (`flex.test.ts`):
  - `buildFlexSchedule({count:3, installmentValue:100, downPayment:250, firstDueDate:2026-12-10, saleDate:2026-11-06})` → `[{1,250,2026-11-06},{2,100,2026-12-10},{3,100,2027-01-10},{4,100,2027-02-10}]`.
  - Sem entrada, `count:3` → 3 linhas, a 1ª em `firstDueDate`.
  - Dia 31 em fevereiro cai no último dia do mês (mesma regra de `buildInstallmentSchedule`).
  - `flexScheduleError`: `installmentValue: 4.99` → mensagem; `downPayment: 4` → mensagem; `count: 25` → mensagem; `count: 1` sem entrada → mensagem; `count: 1` com entrada → null.
  - `flexTotal({count:3, installmentValue:100.1, downPayment:250})` → `550.3` (centavos exatos).
  - `flexRowLabel({number:1}, true, 4)` → `"Entrada"`; `({number:3}, true, 4)` → `"Parcela 2 de 3"`; `({number:3}, false, 3)` → `"Parcela 3 de 3"`.
  - `flexPlanSummary({hasDownPayment:true, downPayment:250, count:3, installmentValue:100})` → `"Entrada R$ 250,00 + 3x R$ 100,00 · total R$ 550,00"`; sem entrada → `"3x R$ 100,00 · total R$ 300,00"`.
  - `flexOffer`: um caso por linha da tabela acima (entrada aberta; método null; PIX; BOLETO; cartão em dia → `auto`; cartão com `cardDeclinedAt` → três; linha futura → `waiting`; todas pagas → `done`).
- [ ] **Step 2:** `npx vitest run src/lib/installments/flex.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3:** Implementar `flex.ts`. Datas UTC; reaproveitar o cálculo de mês de `buildInstallmentSchedule`.
- [ ] **Step 4:** Rodar de novo → PASS.
- [ ] **Step 5:** Commit `feat(parcelado): regras puras de agenda, rotulo e oferta por parcela`.

---

### Task 3: Criar o plano na venda (`flex-sale.ts`)

**Files:**
- Create: `src/lib/installments/flex-sale.ts`
- Test: `src/lib/installments/flex-sale.test.ts` (prisma mockado, padrão de `plan.test.ts`)

**Interfaces:**
- Consumes: `buildFlexSchedule`, `flexScheduleError`, `flexTotal` (Task 2); `registerExternalFirstPayment` (`src/lib/enrollment/external-first-payment-server.ts:22`).
- Produces:
  ```ts
  export interface CreateFlexPlanInput {
    enrollmentId: string
    tenant: TenantContext            // o mesmo tipo que registerExternalFirstPayment recebe
    schedule: FlexScheduleInput
    paidBefore?: { paidAt: Date }    // "1ª já paga fora": linha 1 nasce PAID
  }
  export async function createFlexPlan(input: CreateFlexPlanInput): Promise<{ rows: number; total: number }>
  ```
  Grava `flexInstallments: true`, `flexHasDownPayment`, `installmentsTotal = nº de linhas`, `finalAmount = flexTotal`, linhas `SCHEDULED` com `gateway` da matrícula. **Nenhuma cobrança no gateway.** Com `paidBefore`: chama `registerExternalFirstPayment` com o valor da linha 1 e marca a linha 1 `PAID`.

- [ ] **Step 1: Testes que falham:** cria 4 linhas e `finalAmount 550.3` para o caso da Task 2; não chama nenhum client de gateway (mock do Asaas/MP com `expect(...).not.toHaveBeenCalled()`); `paidBefore` → linha 1 PAID e `registerExternalFirstPayment` chamado com `amount` da linha 1; `flexScheduleError` não nulo → lança sem gravar nada.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar em uma `prisma.$transaction` (enrollment update + `boletoInstallment.createMany`); `registerExternalFirstPayment` depois do commit.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(parcelado): cria o plano na venda sem cobrar no gateway`.

---

### Task 4: Rotas de venda direta

**Files:**
- Modify: `src/app/api/painel/vendas/route.ts` (schema :67-228, carnê :413-427 e :1054-1172, MONTHLY :1177-1343)
- Modify: `src/app/api/admin/vendas/route.ts` (schema :161-258, `carneCurso` :582-692, MONTHLY :887-1047)
- Test: `src/app/api/painel/vendas/route.test.ts` e `src/app/api/admin/vendas/route.test.ts` (criar se não existir, padrão de outros `route.test.ts` do repo)

**Interfaces:**
- Consumes: `createFlexPlan` (Task 3); `effectiveSalesCap` (`src/lib/coupons/sales-cap.ts:35`) no admin; teto do membro (`member.maxDiscount`, 100 para o dono, painel :622-633); `vitrineCoursePrice`/`tenantCourseMonths` (`src/lib/tenant/monthly-policy.ts`); `rollbackSaleEnrollment`.
- Produces: campo Zod novo nas duas rotas, substituindo `boletoInstallment` de curso (painel) e `carneCurso` (admin):
  ```ts
  parcelado: z.object({
    count: z.number().int().min(1).max(MAX_BOLETO_INSTALLMENTS),
    installmentValue: z.number().positive(),
    downPayment: z.number().positive().nullable().optional(),
    firstDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).optional()
  ```
  Resposta: `{ data: { enrollmentId, studentId, mode: "parcelado", paymentUrl, finalAmount, discountAmount, installment: { count, installmentValue, downPayment, total } } }`. `paymentUrl` como hoje (`storeBaseUrl(tenant)/pagar/<id>` e `pmbAppUrl()/pagar/<id>`).

Regras:
- `parcelado` cria matrícula `PENDING`, `paymentType: "BOLETO_INSTALLMENT"`, `gateway` como hoje (painel `tenant.salesGateway`; admin `gate.forcedGateway ?? settings.pmbDirectSaleGateway` — o admin deixa de forçar ASAAS, porque o MP agora tem cobrança por linha), `originalAmount` = preço de vitrine, `discountAmount = max(0, originalAmount − total)`, `externalReference` como o ramo MONTHLY de cada rota (`enr_<id>` / `pmb_enr_<id>`). Depois `createFlexPlan`; falha → `rollbackSaleEnrollment` e 502.
- Desconto implícito passa pelo teto: admin `effectiveSalesCap`; painel o mesmo teto do membro usado no cupom. Acima → 403 `DISCOUNT_CAP`.
- Curso MONTHLY na venda direta deixa de criar matrícula `MONTHLY`: a UI (Task 13) manda `parcelado` com `count = tenantCourseMonths` e `installmentValue` = mensalidade. O ramo MONTHLY só segue existindo para a API não quebrar enquanto o deploy vira; remover o ramo de curso MONTHLY sem `primeiraMensalidadeExterna`.
- `primeiraMensalidadeExterna` + `parcelado` → `createFlexPlan({ paidBefore })` (antes era proibido junto com carnê; refine :195-204 muda).
- MP não exige mais endereço na venda (o boleto pede no pagamento).
- Remover `amounts` (personalizar valores) de ambos os schemas e `installmentAmountsError` dos ramos removidos.

- [ ] **Step 1: Testes que falham** (por rota): `parcelado` válido → 200, `createFlexPlan` chamado com a agenda; total abaixo do teto do vendedor → 403 `DISCOUNT_CAP`; `installmentValue: 4` → 400; `parcelado` + `primeiraMensalidadeExterna` → `createFlexPlan` com `paidBefore`; `createFlexPlan` lança → matrícula removida, 502; admin com gateway MP → matrícula `gateway: "MP"`.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar nas duas rotas.
- [ ] **Step 4:** Rodar → PASS; `npm run typecheck`.
- [ ] **Step 5:** Commit `feat(vendas): venda direta parcelada com entrada e parcelas iguais`.

---

### Task 5: Cobrança avulsa de uma linha (PIX / boleto / cartão 1x)

**Files:**
- Create: `src/lib/installments/flex-charge.ts`
- Modify: `src/lib/installments/plan.ts` — exportar `emitMpBoletoForRow` (:494) generalizado para PIX, ou extrair o miolo para `flex-charge.ts`
- Test: `src/lib/installments/flex-charge.test.ts`

**Interfaces:**
- Consumes: `withAdvisoryLock`, `advisoryLockKeyFrom` (`src/lib/enrollment/fulfill.ts`); `asaasPixInstrument` (`src/lib/asaas/payment-instrument.ts:24`); `boletoResult` e `payWithCreditCard` como usados em `processExistingAsaasInstallmentPayment` (`src/lib/asaas/transparent-process.ts:168`); `deleteAsaasPayment` com confirmação `deleted`; `mpBoletoPaymentParams` (`mp-boleto.ts:51`); `cancelPayment` (`src/lib/mercadopago/client.ts:319`); `settleBoletoInstallment` (`settle.ts:33`); `asaasSplitsForEnrollment`; chave Asaas por loja (o `PlanContext` de `plan.ts`: conta-mãe se `tenantId null`, senão a da unidade).
- Produces:
  ```ts
  export type FlexChargeResult =
    | { kind: "approved" }
    | { kind: "pending"; pix?: { qrCode: string; qrCodeBase64: string }; boleto?: { url: string; digitableLine?: string } }
    | { kind: "error"; httpStatus: number; code: string; error: string }
  export async function chargeFlexRow(input: {
    rowId: string
    method: "PIX" | "BOLETO" | "CREDIT_CARD"   // CREDIT_CARD aqui = 1x avulsa (entrada)
    payer: FlexPayer                            // nome, email, cpf (resolvePayer), endereço p/ boleto MP, ip
    card?: FlexCardInput                        // Asaas: creditCard+holderInfo; MP: token+payment_method_id+issuer
  }): Promise<FlexChargeResult>
  ```

Regras: sob `withAdvisoryLock(advisoryLockKeyFrom(\`FLEX_ROW:${rowId}\`))` (ocupado → 409 `PAYMENT_IN_PROGRESS`). Linha já tem cobrança em aberto do MESMO método → devolve a mesma (PIX: QR ao vivo; boleto: PDF + linha digitável). Método diferente → Asaas `deleteAsaasPayment` + releitura `deleted: true` (senão erro 409 `PREVIOUS_CHARGE_STUCK`, sem criar nada); MP `cancelPayment`. Cria a nova: Asaas `POST /payments` (`billingType`, `value = row.amount`, `dueDate = max(row.dueDate, hoje)`, `externalReference: carne_<enrollmentId>`, `splits`); MP `/v1/payments` com `external_reference: parc_<rowId>`, chave de idempotência `parc_<rowId>:<row.updatedAt>:<method>`. Grava `asaasPaymentId`/`mpPaymentId`, `method`, `status: GENERATED`, `invoiceUrl` = PDF do boleto (nunca fatura hospedada), `digitableLine`. Cartão aprovado na hora → `settleBoletoInstallment`. Boleto MP sem endereço completo → 400 `ADDRESS_REQUIRED`; endereço recebido é salvo no aluno.

- [ ] **Step 1: Testes que falham:** PIX numa linha sem cobrança cria uma (Asaas e MP); PIX de novo devolve a mesma sem criar; troca PIX→BOLETO apaga a anterior e só então cria (ordem verificada nos mocks); Asaas `deleted: false` → 409 `PREVIOUS_CHARGE_STUCK` e nenhuma criação; split presente no payload Asaas; boleto MP sem endereço → `ADDRESS_REQUIRED`; cartão aprovado → `settleBoletoInstallment` chamado.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(parcelado): cobranca de uma parcela no PIX, boleto ou cartao nos dois gateways`.

---

### Task 6: Assinatura no cartão sobre as linhas restantes

**Files:**
- Create: `src/lib/installments/flex-card.ts`
- Modify: `src/lib/asaas/process.ts` (~:770, ramo `asaasSubscriptionId` da PMB) e `src/lib/asaas/reseller-process.ts` (ramo `asaasSubscriptionId`)
- Modify: `src/lib/mercadopago/process.ts` (tópico `subscription_authorized_payment`, :431-451)
- Test: `src/lib/installments/flex-card.test.ts`

**Interfaces:**
- Consumes: `createAsaasSubscription` e `buildCardPair` como no ramo MONTHLY de `src/lib/asaas/transparent-process.ts:452`; `createPreapproval` como em `src/lib/mercadopago/transparent-process.ts:153`; `settleBoletoInstallment`.
- Produces:
  ```ts
  export async function startFlexCardSubscription(input: { enrollmentId: string; fromRowNumber: number; payer: FlexPayer; card: FlexCardInput }): Promise<FlexChargeResult>
  export async function settleFlexSubscriptionPayment(input: { enrollmentId: string; event: InstallmentPaymentEvent }): Promise<"settled" | "duplicate" | "no_open_row">
  ```

Regras de `startFlexCardSubscription`: valor = `amount` da linha `fromRowNumber` (todas iguais), `maxPayments`/`end_date` = nº de linhas abertas a partir dela, 1ª cobrança hoje. Reescreve o `dueDate` das linhas abertas a partir dela para hoje + k meses (auditoria `enrollment.flex.card_schedule` em `audit_logs`). Antes, apaga/cancela cobrança PIX/boleto em aberto dessas linhas (mesma rotina da Task 5). Grava `installmentMethod: CREDIT_CARD`, `asaasSubscriptionId`/`mpSubscriptionId`, limpa `cardDeclinedAt` da linha. Split no Asaas.

`settleFlexSubscriptionPayment`: se alguma linha já tem esse id de pagamento → `"duplicate"`; senão grava o id na menor linha aberta e chama `settleBoletoInstallment`. Nos webhooks, matrícula com `flexInstallments` desvia para cá ANTES do caminho MONTHLY (`fulfillFromAsaasPayment` / `fulfillFromMp`).

- [ ] **Step 1: Testes que falham:** 3 linhas abertas → assinatura com `maxPayments: 3`, valor da linha, split; datas reescritas; mesmo `asaasPaymentId` duas vezes → 2ª devolve `"duplicate"` e baixa só uma linha; pagamento sem linha aberta → `"no_open_row"` e nada muda; MP: `authorized_payment` aprovado de matrícula flex chama `settleFlexSubscriptionPayment`, não `fulfillFromMp`.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar → PASS; `npm test` inteiro (webhooks mexidos).
- [ ] **Step 5:** Commit `feat(parcelado): cartao vira assinatura do gateway sobre as parcelas restantes`.

---

### Task 7: Cartão negado

**Files:**
- Create: `src/lib/installments/flex-decline.ts`
- Create: `src/lib/email/templates/installment-card-declined.tsx` (+ entrada no union `EmailTemplate`, `src/lib/email/mailer.ts:72`)
- Modify: `src/lib/asaas/process.ts`, `src/lib/asaas/reseller-process.ts` (evento `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` de cobrança de assinatura flex)
- Modify: `src/lib/mercadopago/process.ts` (`authorized_payment` com pagamento `rejected` de matrícula flex)
- Test: `src/lib/installments/flex-decline.test.ts`

**Interfaces:**
- Consumes: `cancelSubscription` (`src/lib/asaas/client.ts:304`, devolve `{deleted}`); `cancelPreapproval` (`src/lib/mercadopago/client.ts:301`); `deleteAsaasPayment`; `sendEmail` (`mailer.ts:366`), marca via `loadTenantEmailBrand`, dedupe como `notifyStudentPaymentPending` (`src/lib/mercadopago/student-payment-emails.ts:127`).
- Produces: `export async function handleFlexCardDeclined(input: { enrollmentId: string; gatewayPaymentId: string }): Promise<"declined" | "cancel_unconfirmed" | "ignored">`

Regras: cancela a assinatura; Asaas exige `deleted: true` e também apaga a cobrança recusada (`deleteAsaasPayment` confirmado); MP exige `status: "cancelled"` na resposta. Só então: `cardDeclinedAt = now` na menor linha aberta, limpa `asaasSubscriptionId`/`mpSubscriptionId`, e-mail ao aluno (assunto "Seu cartão foi recusado", link `/pagar/<id>` da loja certa). Cancelamento não confirmado → `"cancel_unconfirmed"`, linha intocada (a página segue `auto`, sem PIX/boleto), alerta ao admin pelo mesmo canal de `cancelOpenCarneRows`. Repetição (linha já negada) → `"ignored"`, sem 2º e-mail.

- [ ] **Step 1: Testes que falham:** cancelamento confirmado → linha com `cardDeclinedAt`, e-mail 1x; `deleted: false` → `"cancel_unconfirmed"`, `cardDeclinedAt` nulo, nenhum e-mail; 2ª recusa da mesma linha → `"ignored"`; depois de `"declined"`, `flexOffer` da Task 2 com o estado gravado devolve os três meios.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar + template.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(parcelado): cartao recusado cancela a assinatura e abre PIX/boleto`.

---

### Task 8: Rotas de pagamento da parcela

**Files:**
- Create: `src/lib/installments/flex-pay.ts` (núcleo comum)
- Create: `src/app/api/loja/checkout/parcela/route.ts` (POST, loja; tenant por `x-tenant-id`/`x-tenant-slug`)
- Create: `src/app/api/checkout/parcela/route.ts` (POST, PMB; `isPmbAppHost`, `tenantId: null`)
- Create: `src/app/api/loja/checkout/parcela/status/route.ts` e `src/app/api/checkout/parcela/status/route.ts` (GET `?row=` → `{ paid: boolean }`)
- Test: `src/lib/installments/flex-pay.test.ts`

**Interfaces:**
- Consumes: `flexOffer` (Task 2), `chargeFlexRow` (Task 5), `startFlexCardSubscription` (Task 6), `rejectBot`, `resolvePayer`.
- Produces:
  ```ts
  export async function payFlexRow(input: { enrollmentId: string; tenantId: string | null; rowId: string; method: FlexMethod; payer: FlexPayer; card?: FlexCardInput }, now?: Date): Promise<FlexChargeResult>
  ```
  Body das duas rotas (o mesmo que os formulários já mandam): `{ enrollmentId, boletoInstallmentId, formData }`; o método sai de `formData` (Asaas `billingType`; MP `payment_method_id` `pix` / boleto / cartão).

Regras: matrícula da loja certa e `flexInstallments` (senão 404); `flexOffer` recalculado no servidor; `rowId` ≠ linha da vez ou método fora de `methods` → 409 `METHOD_NOT_OFFERED`. Cartão: `card === "single"` → `chargeFlexRow(CREDIT_CARD)`; `"subscription"` → `startFlexCardSubscription(fromRowNumber = linha da vez)`. PIX/BOLETO pago numa linha negada ou com `method` nulo → grava `installmentMethod` = esse meio. As duas rotas chamam `rejectBot()`; os paths já caem em `/api/loja/checkout/*` e `/api/checkout/*` de `BOTID_PROTECTED_PATHS`.

- [ ] **Step 1: Testes que falham:** entrada aberta e POST para a linha 2 → 409 `METHOD_NOT_OFFERED`; plano em PIX e POST de BOLETO → 409; linha negada + PIX → `installmentMethod: PIX` gravado; método null + CREDIT_CARD → `startFlexCardSubscription` chamado; matrícula de outra loja → 404.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar núcleo e as 4 rotas (Zod no body; rotas finas).
- [ ] **Step 4:** Rodar → PASS; `npx vitest run src/lib/checkout` (bot-guard-coverage).
- [ ] **Step 5:** Commit `feat(parcelado): rotas de pagamento da parcela na loja e na PMB`.

---

### Task 9: Formulários aceitam lista de meios

**Files:**
- Modify: `src/components/loja/asaas-checkout-form.tsx` (props :40, método inicial :186, abas :513-517)
- Modify: `src/components/loja/mp-checkout-form.tsx` (props :53, métodos :219/:261, POST :567, polling :631)

**Interfaces:**
- Produces: nos dois formulários, prop `methods?: ("PIX" | "BOLETO" | "CREDIT_CARD")[]` (default: todos; `cardOnly` vira atalho para `["CREDIT_CARD"]`) e `cardNote?: string` (texto sob a aba de cartão, ex. "As próximas parcelas serão cobradas automaticamente neste cartão"). `MpCheckoutForm` ganha `boletoInstallmentId?: string`, enviado no POST e como `installment_id` no polling (mesmo contrato do Asaas).

- [ ] **Step 1:** Implementar as props; checar que os usos atuais (`cardOnly`) seguem iguais.
- [ ] **Step 2:** `npm run typecheck && npm run lint`.
- [ ] **Step 3:** Commit `feat(checkout): formularios aceitam a lista de meios e a parcela`.

---

### Task 10: Página `/pagar/<id>` do plano parcelado

**Files:**
- Create: `src/components/loja/flex-installment-page.tsx` (server component)
- Modify: `src/app/loja/pagar/[id]/page.tsx` e `src/app/(main)/pagar/[id]/page.tsx` — selecionar as colunas novas; `flexInstallments` → `<FlexInstallmentPage .../>` antes de qualquer outro ramo
- Modify: `src/components/aluno/installments-section.tsx` — estado "Cartão recusado" na linha (`cardDeclinedAt`), rótulo por linha via prop opcional `label`
- Modify (correção legada): `src/app/loja/pagar/[id]/page.tsx:244` e `src/app/(main)/pagar/[id]/page.tsx:~201` — `currentNumber` = parcela em aberto de verdade, não 1

**Interfaces:**
- Consumes: `flexOffer`, `flexRowLabel`, `flexPlanSummary` (Task 2); formulários (Task 9) com `processPath`/`statusPath` das rotas da Task 8; `InstallmentsSection`; `OrderSummary`.
- Produces: `export async function FlexInstallmentPage(props: { enrollmentId: string; scope: { tenantId: string | null }; store: "loja" | "pmb" }): Promise<JSX.Element>`

Conteúdo: título = `flexRowLabel` da linha da vez + valor; resumo = `flexPlanSummary`; corpo por `flexOffer.kind`: `pay` → formulário do gateway da matrícula com `methods` e `boletoInstallmentId` (cartão com `card: "subscription"` leva `cardNote`); `auto` → "Cobrança automática no cartão. Próxima em dd/mm."; `waiting` → "A próxima parcela fica disponível em dd/mm."; `done` → "Plano quitado." Lista de linhas embaixo. Nunca renderiza `invoiceUrl` hospedada (só o PDF gravado pela Task 5).

- [ ] **Step 1:** Implementar componente e os dois desvios nas páginas.
- [ ] **Step 2:** `npm run typecheck && npm run lint && npx vitest run src/lib/checkout/payment-link-coverage.test.ts` (se a página nova ler `invoiceUrl`, entra na lista fechada com justificativa).
- [ ] **Step 3:** Commit `feat(parcelado): pagina de pagamento mostra a parcela da vez e os meios`.

---

### Task 11: Varredura diária

**Files:**
- Modify: `src/lib/installments/sweep.ts` (`runBoletoInstallmentSweep`, passo A :49-74 e B :76-99)
- Create: `src/lib/email/templates/installment-available.tsx` (+ union `EmailTemplate`)
- Test: `src/lib/installments/sweep.test.ts`

**Interfaces:**
- Consumes: `chargeFlexRow` (Task 5), `sendEmail`.
- Produces: `SweepResult` ganha `flexGenerated`, `flexEmailed`.

Regras (só linhas de matrícula `flexInstallments`):
- Plano em BOLETO: linha na janela de 7 dias sem cobrança → `chargeFlexRow(BOLETO)`, nos DOIS gateways (o passo A atual só cobre MP de carnê legado; continua igual para ele).
- Plano em PIX ou BOLETO: linha na janela com `availableEmailSentAt` nulo → e-mail "Sua parcela está disponível" com valor, vencimento e link; grava `availableEmailSentAt`. Máximo 15 e-mails por execução, em sequência; o resto fica para a próxima.
- Plano no CARTÃO sem `cardDeclinedAt`: passo B só marca `OVERDUE` com `dueDate + 3 dias <= now`.
- Plano com `installmentMethod` nulo (aluno nunca escolheu): sem emissão; e-mail de disponível vale igual.

- [ ] **Step 1: Testes que falham:** linha BOLETO Asaas na janela → `chargeFlexRow` chamado; 20 linhas elegíveis → 15 e-mails e 15 `availableEmailSentAt`; linha de cartão vencida há 1 dia → não vira OVERDUE; há 4 dias → vira; carnê legado (sem flex) segue o caminho atual.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(parcelado): varredura emite boleto, avisa parcela disponivel e da carencia ao cartao`.

---

### Task 12: Renegociação e cancelamento

**Files:**
- Modify: `src/lib/installments/edit.ts`
- Modify (só se o teste falhar): `src/lib/enrollment/cancel.ts` (`cancelPendingBoletoInstallments` ~:332)
- Test: `src/lib/installments/edit.test.ts`, `src/lib/enrollment/cancel.test.ts`

**Interfaces:** nenhuma nova.

Regras: `edit.ts` recusa (409 `CARD_PLAN_NOT_EDITABLE`, "Plano no cartão: o valor é fixo na assinatura.") quando `flexInstallments && installmentMethod === "CREDIT_CARD" && (asaasSubscriptionId || mpSubscriptionId)`. Cancelar matrícula flex: assinatura cancelada (`cancelAtGateway` já cobre) e linhas abertas com cobrança apagadas (Asaas e MP).

- [ ] **Step 1: Testes que falham:** edição de linha em plano no cartão → 409; plano PIX → edita; cancelamento de matrícula flex com assinatura Asaas + linha PIX em aberto → `cancelSubscription` e `deleteAsaasPayment` chamados.
- [ ] **Step 2:** Rodar → FAIL (pelo menos o de `edit.ts`).
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `fix(parcelado): plano no cartao nao edita parcela avulsa`.

---

### Task 13: Formulários de venda direta

**Files:**
- Modify: `src/components/painel/painel-nova-venda-client.tsx` (estado :336, flags :352-370, body :515-566, seção "3. Pagamento" :1224-1415)
- Modify: `src/components/admin/nova-venda-client.tsx` (estado :283-298, body :490-520, bloco :987-1125)
- Delete se ficar sem uso: `src/components/shared/installment-amounts-field.tsx`

**Interfaces:**
- Consumes: `flexScheduleError`, `flexPlanSummary` (Task 2) para validar e mostrar a prévia no cliente; campo `parcelado` das rotas (Task 4).

UI: seletor "À vista" | "Parcelado" (curso). Parcelado: nº de parcelas, valor da parcela, "Tem entrada?" + valor da entrada, 1º vencimento (padrão hoje + 1 mês), `ExternalFirstPaymentField` (mantido). Prévia: `flexPlanSummary`. Curso mensal: abre em "Parcelado" com `count = meses da unidade` e `installmentValue = mensalidade`. Sem escolha de meio. Planos de assinatura (`boletoCarne`) não mudam.

- [ ] **Step 1:** Implementar nas duas telas; remover "Personalizar valores".
- [ ] **Step 2:** `npm run typecheck && npm run lint`.
- [ ] **Step 3:** Commit `feat(vendas): formulario de venda parcelada com entrada`.

---

### Task 14: Registro e portão

**Files:**
- Modify: `docs/historico/decisoes.md` (seção nova "Venda direta parcelada: o aluno escolhe o meio (2026-11-06)")
- Modify: `CLAUDE.md` (uma linha no índice)

- [ ] **Step 1:** Seção no histórico: decisões do dono, discriminador `flexInstallments`, cartão = assinatura sobre linhas, cancelamento na 1ª recusa, carência de 3 dias, teto de 15 e-mails/execução, "não validado contra os gateways reais".
- [ ] **Step 2:** Portão completo: `npm run typecheck` · `npm run lint` · `npm test` · `DATABASE_URL=postgres://x npm run build` — tudo verde.
- [ ] **Step 3:** Commit `docs: registra venda direta parcelada com meio escolhido pelo aluno`.
- [ ] **Step 4:** Validação real (dono, depois do deploy, Chrome real por causa do BotID): uma venda de valor baixo por gateway, pagando entrada no PIX, 1ª parcela no cartão, e um boleto.
