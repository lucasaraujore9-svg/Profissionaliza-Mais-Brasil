# Relatório de Auditoria — Testes e Qualidade (Agente 10)

> **Referência:** ISO/IEC 25010 — Testabilidade, Confiabilidade  
> **Data:** 2026-05-28  
> **Severidade geral da ausência:** CRÍTICO (sistema move dinheiro real, matricula alunos automaticamente, sem nenhuma rede de segurança automatizada)

---

## PASSO 1 — Confirmação de Ausência de Testes

### Evidência verificada

```
find . -path ./node_modules -prune -o \( -name "*.test.*" -o -name "*.spec.*" \) -print
# → (saída vazia — 0 arquivos)
```

- `package.json` — scripts: `dev`, `build`, `lint`, `typecheck`, `audit:prod`, `email`. **Nenhum `test`**.
- `devDependencies` — apenas: `eslint`, `eslint-config-next`, `pino-pretty`, `react-email`, `tailwindcss`, `tsx`, `typescript` e `@types/*`. **Nenhum vitest/jest/playwright/testing-library**.
- `.github/workflows/ci.yml` — jobs: `Lint + Typecheck + Audit`. Build executa migrações no banco de produção (`scripts/apply-pending-migrations.mjs`). **Nenhum step de test**.

**Conclusão:** 0 testes automatizados. CI cobre apenas lint + typecheck + npm audit (informativo, `continue-on-error: true`).

---

## PASSO 2 — Diagnóstico por Fluxo de Negócio

### 2.1 Inventário de unidades puras testáveis (alto impacto, baixo custo)

| Arquivo:Função | O que faz | Risco sem teste |
|---|---|---|
| `src/lib/coupons/discount.ts:applyCouponDiscount` | Calcula desconto percentual/fixo com `Prisma.Decimal`, clampeia ao preço base, arredondamento bancário HALF_EVEN | Desconto negativo, arredondamento divergente do exibido, desconto > 100% |
| `src/lib/crypto.ts:encrypt` / `decrypt` | AES-256-GCM roundtrip, valida IV/tag de 16 bytes | Token MP corrompido no banco = todas as vendas do tenant quebram silenciosamente |
| `src/lib/validation/cpf.ts:isValidCpf` | Algoritmo da Receita Federal, rejeita todos-iguais | CPF inválido aceito = plataforma parceira rejeita `criarAluno` após MP confirmar pagamento (aluno paga mas não matricula) |
| `src/lib/validation/phone.ts:isValidPhone` / `normalizePhone` | Normaliza +55/0055, valida 10/11 dígitos, verifica 9º dígito celular | Telefone rejeitado pela plataforma parceira |
| `src/app/api/cron/sweep-students-overdue/route.ts:addMonthsClamped` | Data de vencimento com clamp no último dia do mês | Bug em 31/jan+1m → deveria ser 28/fev, overflow nativo do JS retorna 3/mar, atrasa bloqueio por inadimplência |
| `src/lib/students/upsert.ts:upsertStudent` | Lógica de deduplicação CPF/email com 4 casos (byCpf, byEmail compatível, byEmail conflitante, race P2002) | Corrupção de dados: CPF de aluno A sobrescreve aluno B, ou `StudentEmailConflictError` não disparada quando deveria |
| `src/lib/mercadopago/webhook.ts:validateMpWebhookSignature` | HMAC SHA-256 com timingSafeEqual, parsing `ts=…,v1=…` | Assinatura inválida aceita = webhooks forjados podem fazer matrícula fraudulenta |

### 2.2 Análise de risco por fluxo crítico

#### Fluxo 1: Checkout → Matrícula Automática (MP)
**Arquivos:** `src/app/api/loja/checkout/route.ts`, `src/lib/mercadopago/process.ts`, `src/lib/enrollment/fulfill.ts`, `src/lib/students/plataforma-actions.ts`

**Risco:** Este é o fluxo de maior exposição financeira. Um bug em qualquer ponto pode resultar em:
- Aluno paga mas não é matriculado (receita sem entrega)
- Aluno matriculado em curso errado (cross-enrollment)
- Webhook processado duas vezes (matrícula duplicada na plataforma parceira)
- Webhook forjado aceito por falha no HMAC (matrícula fraudulenta)

**Proteções existentes em código** (sem cobertura de teste):
- Idempotência via `Payment.mpPaymentId` unique + advisory lock PostgreSQL
- HMAC com `timingSafeEqual`
- Filtro `tenantId` em `resolveEnrollmentId`

#### Fluxo 2: Cálculo de Preço/Cupom
**Arquivos:** `src/lib/coupons/discount.ts`, `src/lib/coupons/consume.ts`

**Risco:** `applyCouponDiscount` usa `Prisma.Decimal` com `ROUND_HALF_EVEN`. Antes usava float JS com `(basePrice * discountValue) / 100`. Um bug aqui cobra valor errado do comprador — sem teste, o rollback para float é silencioso. O `tryConsumeCoupon` faz UPDATE atômico SQL — testável apenas com DB real, mas a lógica de "clamp nunca abaixo de 0" em `releaseCoupon` é trivialmente verificável.

#### Fluxo 3: Bloqueio por Inadimplência (cron)
**Arquivo:** `src/app/api/cron/sweep-students-overdue/route.ts`

**Risco:** `addMonthsClamped` substitui `Date.setMonth` nativo para evitar overflow (31/jan → 3/mar em vez de 28/fev). Este bug causaria atraso sistemático no bloqueio de inadimplentes. A função é **completamente pura** — ideal para teste unitário sem mocks.

#### Fluxo 4: Guards de Autorização
**Arquivo:** `src/lib/auth/guards.ts`

**Risco:** 200 route handlers dependem de `requireSuperAdmin`, `requirePmbTeam`, `requireResellerOwner(tenantId)` etc. O guard `requireResellerOwner` faz `session.tenantId !== tenantId` — um bug aqui permite IDOR cross-tenant. Sem testes, não há garantia de que a lógica de comparação de tenantId funciona corretamente em todos os cenários (tenantId null, role errada, sessão expirada).

#### Fluxo 5: Criptografia do Token MP
**Arquivo:** `src/lib/crypto.ts`

**Risco:** `ENCRYPTION_KEY` ausente ou com tamanho errado lança `Error` — mas o erro acontece em runtime durante o checkout. Roundtrip encrypt→decrypt nunca foi testado formalmente. Formato `iv:encrypted:tag` com split(":") quebra se o ciphertext contiver ":" (não acontece com hex, mas a asserção nunca foi verificada).

### 2.3 Superfície não coberta por tipo de teste

```
200 route handlers      → 0 testes de integração/e2e
 31 modelos Prisma       → 0 testes de migrations/constraints
  7 unidades puras       → 0 testes unitários
  3 fluxos de webhook    → 0 testes de replay/idempotência
  5 roles de usuário     → 0 testes de controle de acesso
```

---

## PASSO 3 — Diagnóstico Formal e Estratégia

### 3.1 Stack recomendada

#### Vitest (unit + integration)
**Justificativa:**
- Compatível com o ecosistema ESM/TypeScript do projeto sem transpilação adicional (tsx já está em devDeps)
- Mais rápido que Jest para projetos TypeScript por usar esbuild nativamente
- Funciona com `vi.mock()` para isolar Prisma em testes unitários
- Para testes de integração com DB real: `@vitest/integration` + banco de teste Supabase ou SQLite via `prisma-client-js` com driver alternativo
- Configuração mínima: `vitest.config.ts` + `"test": "vitest"` no package.json
- **Custo de setup:** ~2 horas

#### Playwright (E2E)
**Justificativa:**
- Suporte nativo a Next.js com `@playwright/test` + `experimental-ct-react`
- Multi-browser por padrão — cobre casos específicos do checkout (MP SDK)
- Gravação de traces para debug de falhas
- Pode testar a lógica multi-tenant (subdomain routing via `baseURL` configurável por projeto)
- **Custo de setup:** ~4 horas + ambiente de staging com variáveis MP sandbox

#### Alternativas descartadas
- **Jest:** mais lento, config mais verbosa para ESM/TypeScript
- **Cypress:** mais pesado, pior suporte a TypeScript e multi-domain
- **Testing Library apenas:** não cobre fluxos server-side

---

### 3.2 Tabela de Priorização

| Fluxo | Tipo de Teste | Por que é Crítico | Esforço | Prioridade |
|---|---|---|---|---|
| `applyCouponDiscount` — desconto percentual/fixo/clamp/arredondamento | Unit (Vitest) | Cobra valor errado do comprador se arredondamento divergir; regressão silenciosa se alguém trocar Decimal por float | XS (1h) | P0 |
| `addMonthsClamped` — datas de vencimento mensais | Unit (Vitest) | Bug atrasa bloqueio de inadimplentes; função é 100% pura | XS (30min) | P0 |
| `isValidCpf` — validação com dígito verificador | Unit (Vitest) | CPF inválido aceito → plataforma parceira rejeita após MP confirmar → aluno paga mas não matricula | XS (1h) | P0 |
| `encrypt`/`decrypt` — roundtrip AES-256-GCM | Unit (Vitest) | Token MP corrompido no banco quebra todas as vendas do tenant | XS (30min) | P0 |
| `validateMpWebhookSignature` — HMAC parsing | Unit (Vitest) | Assinatura forjada aceita → matrícula fraudulenta | S (2h) | P0 |
| Idempotência do fulfill — replay de webhook | Integration (Vitest + DB teste) | Dois webhooks paralelos = matrícula duplicada na plataforma parceira + double charge | M (4h) | P1 |
| Guards de acesso por role — `requireResellerOwner` | Integration (Vitest mock auth) | IDOR cross-tenant: revendedor A vê dados de revendedor B | M (3h) | P1 |
| Checkout vitrine — fluxo feliz + cupom inválido | E2E (Playwright) | Maior fonte de receita do sistema sem nenhuma validação funcional | L (8h) | P1 |
| Login por role + acesso negado | E2E (Playwright) | 5 roles distintos; qualquer erro de guard expõe dados de outro tenant | M (4h) | P2 |
| IDOR cross-tenant — aluno A não acessa pedido de aluno B | E2E (Playwright) | RLS ausente no banco; única defesa é código de aplicação | L (8h) | P2 |
| `upsertStudent` — deduplicação CPF/email + race P2002 | Integration (Vitest + DB teste) | Corrupção de dados financeiros em double-submit de checkout | M (4h) | P2 |
| Bloqueio por inadimplência — sweep cron | Integration (Vitest + DB teste) | `blockStudentInEA` chama API externa; precisa mock + verificar que não bloqueia aluno com outro curso ativo | M (4h) | P2 |
| `isValidPhone` / `normalizePhone` — +55, formatos variados | Unit (Vitest) | Telefone inválido enviado à plataforma parceira | XS (1h) | P3 |
| Webhook Asaas — PAYMENT_RECEIVED/OVERDUE | Integration (Vitest mock) | Ativa/suspende tenant por inadimplência; replay deve ser no-op | M (4h) | P3 |

---

## PASSO 4 — Esqueletos de Casos de Teste Críticos

### Caso 1: `applyCouponDiscount` — Aritmética de Cupom

```typescript
// src/lib/coupons/discount.test.ts
import { describe, it, expect } from "vitest"
import { applyCouponDiscount } from "./discount"

describe("applyCouponDiscount", () => {
  it("desconto percentual arredonda para baixo (ROUND_HALF_EVEN)", () => {
    // R$ 99,99 * 33% = R$ 32,9967 → arredonda para R$ 32,9967 → 33,00? ou 33,00?
    // Verificar que ROUND_HALF_EVEN produz resultado estável
    const result = applyCouponDiscount({
      basePrice: "99.99",
      discountType: "PERCENTAGE",
      discountValue: "33",
    })
    expect(result.discountAmount).toBe(33.00)
    expect(result.finalAmount).toBe(66.99)
    expect(result.finalAmount + result.discountAmount).toBeCloseTo(99.99, 2)
  })

  it("desconto FIXED nunca ultrapassa o preço base", () => {
    const result = applyCouponDiscount({
      basePrice: "100.00",
      discountType: "FIXED",
      discountValue: "200.00",
    })
    expect(result.discountAmount).toBe(100.00)
    expect(result.finalAmount).toBe(0.00)
  })

  it("desconto percentual de 100% zera o valor", () => {
    const result = applyCouponDiscount({
      basePrice: "199.90",
      discountType: "PERCENTAGE",
      discountValue: "100",
    })
    expect(result.finalAmount).toBe(0.00)
  })

  it("desconto FIXED exato igual ao preço base resulta em 0", () => {
    const result = applyCouponDiscount({
      basePrice: "50.00",
      discountType: "FIXED",
      discountValue: "50.00",
    })
    expect(result.finalAmount).toBe(0.00)
    expect(result.discountAmount).toBe(50.00)
  })

  it("desconto percentual fracionário — teste de arredondamento bancário", () => {
    // R$ 10,00 * 33,33% = R$ 3,333 → banker's rounding → R$ 3,33
    const result = applyCouponDiscount({
      basePrice: "10.00",
      discountType: "PERCENTAGE",
      discountValue: "33.33",
    })
    expect(result.discountAmount).toBe(3.33)
    expect(result.finalAmount).toBe(6.67)
  })
})
```

---

### Caso 2: `addMonthsClamped` — Overflow de Data

```typescript
// src/app/api/cron/sweep-students-overdue/addMonthsClamped.test.ts
// (exportar a função para teste ou duplicar inline)
import { describe, it, expect } from "vitest"

describe("addMonthsClamped", () => {
  it("janeiro 31 + 1 mês = fevereiro 28 (ano não bissexto)", () => {
    const result = addMonthsClamped(new Date("2025-01-31"), 1)
    expect(result.getFullYear()).toBe(2025)
    expect(result.getMonth()).toBe(1) // fevereiro (0-indexed)
    expect(result.getDate()).toBe(28) // não 3/março (overflow nativo JS)
  })

  it("janeiro 31 + 1 mês = fevereiro 29 (ano bissexto)", () => {
    const result = addMonthsClamped(new Date("2024-01-31"), 1)
    expect(result.getDate()).toBe(29)
    expect(result.getMonth()).toBe(1)
  })

  it("março 31 + 1 mês = abril 30 (mês com 30 dias)", () => {
    const result = addMonthsClamped(new Date("2025-03-31"), 1)
    expect(result.getMonth()).toBe(3) // abril
    expect(result.getDate()).toBe(30)
  })

  it("dia 15 + 1 mês = dia 15 do mês seguinte (caso normal)", () => {
    const result = addMonthsClamped(new Date("2025-02-15"), 1)
    expect(result.getMonth()).toBe(2) // março
    expect(result.getDate()).toBe(15)
  })

  it("dezembro 31 + 1 mês = janeiro 31 do ano seguinte", () => {
    const result = addMonthsClamped(new Date("2025-12-31"), 1)
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(0)
    expect(result.getDate()).toBe(31)
  })
})
```

---

### Caso 3: Idempotência de `fulfillEnrollment`

```typescript
// src/lib/enrollment/fulfill.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock do Prisma e dependências externas
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ pg_try_advisory_lock: true }]),
    payment: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    enrollment: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn((ops) => Promise.all(ops)),
  },
}))
vi.mock("@/lib/students/plataforma-actions")
vi.mock("@/lib/email/mailer")
vi.mock("@/lib/notifications")

describe("fulfillEnrollment — idempotência", () => {
  it("segundo webhook com mesmo mpPaymentId retorna sem processar", async () => {
    const { prisma } = await import("@/lib/prisma")
    const { ensureStudentOnPlatform } = await import("@/lib/students/plataforma-actions")

    // Simula: pagamento já existe no banco
    vi.mocked(prisma.payment.findFirst).mockResolvedValue({ id: "existing-payment" })

    const { fulfillEnrollment } = await import("./fulfill")
    await fulfillEnrollment(
      { id: "tenant-1", slug: "loja1", plataformaVendedorId: "42" },
      "enrollment-1",
      { gateway: "MP", externalPaymentId: "mp_pay_001", amount: 299, paidAt: new Date() },
    )

    // ensureStudentOnPlatform NÃO deve ter sido chamado
    expect(ensureStudentOnPlatform).not.toHaveBeenCalled()
    expect(prisma.payment.create).not.toHaveBeenCalled()
  })

  it("lock não adquirido (outro processo em andamento) retorna sem erro", async () => {
    const { prisma } = await import("@/lib/prisma")
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ pg_try_advisory_lock: false }])

    const { fulfillEnrollment } = await import("./fulfill")
    // Deve retornar silenciosamente, sem throw
    await expect(
      fulfillEnrollment(
        { id: "tenant-1", slug: "loja1", plataformaVendedorId: "42" },
        "enrollment-1",
        { gateway: "MP", externalPaymentId: "mp_pay_002", amount: 299, paidAt: new Date() },
      )
    ).resolves.toBeUndefined()
  })
})
```

---

### Caso 4: `validateMpWebhookSignature` — HMAC

```typescript
// src/lib/mercadopago/webhook.test.ts
import { describe, it, expect } from "vitest"
import { createHmac } from "node:crypto"
import { validateMpWebhookSignature } from "./webhook"

function makeSignature(dataId: string, requestId: string, ts: string, secret: string): string {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  const v1 = createHmac("sha256", secret).update(manifest).digest("hex")
  return `ts=${ts},v1=${v1}`
}

describe("validateMpWebhookSignature", () => {
  const SECRET = "test-secret-32chars-padding-here"
  const DATA_ID = "12345678"
  const REQUEST_ID = "req-abc-123"
  const TS = "1716912000"

  it("assinatura válida retorna true", () => {
    const sig = makeSignature(DATA_ID, REQUEST_ID, TS, SECRET)
    expect(validateMpWebhookSignature(sig, REQUEST_ID, DATA_ID, SECRET)).toBe(true)
  })

  it("secret errado retorna false", () => {
    const sig = makeSignature(DATA_ID, REQUEST_ID, TS, SECRET)
    expect(validateMpWebhookSignature(sig, REQUEST_ID, DATA_ID, "wrong-secret")).toBe(false)
  })

  it("data_id adulterado retorna false", () => {
    const sig = makeSignature(DATA_ID, REQUEST_ID, TS, SECRET)
    expect(validateMpWebhookSignature(sig, REQUEST_ID, "tampered-id", SECRET)).toBe(false)
  })

  it("headers ausentes retornam false (null safety)", () => {
    expect(validateMpWebhookSignature(null, REQUEST_ID, DATA_ID, SECRET)).toBe(false)
    expect(validateMpWebhookSignature("ts=1,v1=abc", null, DATA_ID, SECRET)).toBe(false)
    expect(validateMpWebhookSignature("ts=1,v1=abc", REQUEST_ID, null, SECRET)).toBe(false)
  })

  it("formato de assinatura inválido (sem ts ou v1) retorna false", () => {
    expect(validateMpWebhookSignature("invalid-format", REQUEST_ID, DATA_ID, SECRET)).toBe(false)
    expect(validateMpWebhookSignature("ts=1", REQUEST_ID, DATA_ID, SECRET)).toBe(false)
  })

  it("assinatura com comprimento diferente retorna false (sem timing attack)", () => {
    const shortSig = "ts=1,v1=abc"
    expect(validateMpWebhookSignature(shortSig, REQUEST_ID, DATA_ID, SECRET)).toBe(false)
  })
})
```

---

### Caso 5: Guards de Autorização — Cross-Tenant IDOR

```typescript
// src/lib/auth/guards.test.ts
import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}))
vi.mock("@/lib/prisma")

describe("requireResellerOwner — isolamento de tenant", () => {
  it("revendedor do tenant A negado para acessar tenant B", async () => {
    const { auth } = await import("@/lib/auth")
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-a", role: "RESELLER", tenantId: "tenant-a" },
    } as any)

    const { requireResellerOwner } = await import("./guards")
    const result = await requireResellerOwner("tenant-b") // tenant diferente!
    
    expect(result.ok).toBe(false)
    expect((result as { ok: false; response: Response }).response.status).toBe(403)
  })

  it("SUPER_ADMIN não pode usar requireResellerOwner (deve usar requireSuperAdmin)", async () => {
    const { auth } = await import("@/lib/auth")
    vi.mocked(auth).mockResolvedValue({
      user: { id: "super", role: "SUPER_ADMIN", tenantId: null },
    } as any)

    const { requireResellerOwner } = await import("./guards")
    const result = await requireResellerOwner("any-tenant")
    
    // SUPER_ADMIN não deve passar por requireResellerOwner — ele usa guards próprios
    expect(result.ok).toBe(false)
  })

  it("usuário não autenticado retorna 403", async () => {
    const { auth } = await import("@/lib/auth")
    vi.mocked(auth).mockResolvedValue(null)

    const { requireResellerOwner } = await import("./guards")
    const result = await requireResellerOwner("tenant-a")
    expect(result.ok).toBe(false)
  })
})

describe("requireSuperAdmin", () => {
  it("PMB_SALES não pode acessar rota de SUPER_ADMIN", async () => {
    const { auth } = await import("@/lib/auth")
    vi.mocked(auth).mockResolvedValue({
      user: { id: "sales-user", role: "PMB_SALES", tenantId: null },
    } as any)

    const { requireSuperAdmin } = await import("./guards")
    const result = await requireSuperAdmin()
    expect(result.ok).toBe(false)
    expect((result as { ok: false; response: Response }).response.status).toBe(403)
  })
})
```

---

## Achados Formais (Formato Padrão da Auditoria)

### [Crítico] Ausência total de testes em sistema de processamento de pagamentos e matrículas

- **Agente responsável:** Agente 10 — Testes e Qualidade
- **Categoria:** Testabilidade / Confiabilidade (ISO/IEC 25010)
- **Arquivo:** `package.json`, `.github/workflows/ci.yml` (ausência), todos os 200 route handlers
- **Linha/trecho:** N/A — ausência
- **Evidência:** `find . -path ./node_modules -prune -o \( -name "*.test.*" -o -name "*.spec.*" \) -print` → saída vazia. `package.json` sem `"test"` script, sem vitest/jest/playwright em devDeps.
- **Descrição:** O projeto processa pagamentos reais via Mercado Pago e Asaas, realiza matrícula automática em plataforma terceira e opera sistema multi-tenant com 5 roles distintos. Nenhum teste automatizado existe — 0% de cobertura em 200 route handlers, 7 funções de cálculo financeiro críticas, 5 fluxos de webhook e toda a lógica de controle de acesso.
- **Impacto:** Qualquer refatoração (ex: troca de Prisma.Decimal por float, mudança na lógica de cupom, alteração no guard de role) pode introduzir regressão silenciosa que só é descoberta por relato de cliente ou auditoria manual.
- **Cenário de risco:** 1) Desenvolvedor corrige bug em `applyCouponDiscount`, acidentalmente remove o clamp `raw.gt(base)`, CI passa (apenas typecheck), deploy em produção — cupom FIXED de R$ 500 em curso de R$ 100 cobra R$ -400 do cliente ou gera erro no MP. 2) Bug em `addMonthsClamped` atrasa bloqueio de inadimplentes por 3 dias toda vez que o ciclo coincide com mês de 31 dias seguido de mês curto.
- **Recomendação:** Implementar Vitest para testes unitários e de integração; Playwright para E2E. Começar pelos 7 casos P0 identificados (esforço total estimado: ~6 horas). Adicionar `"test": "vitest"` ao CI antes do `typecheck`. Ver Passo 3 e esqueletos acima.
- **Correção aplicada:** Nenhuma (READ-ONLY)
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Alto] `addMonthsClamped` não é exportada — não testável sem modificação

- **Agente responsável:** Agente 10 — Testes e Qualidade
- **Categoria:** Testabilidade
- **Arquivo:** `src/app/api/cron/sweep-students-overdue/route.ts`
- **Linha/trecho:** Linha 18 — `function addMonthsClamped(...)` (não exportada)
- **Evidência:** Função privada dentro do route handler. Só pode ser testada via integração completa do cron ou se extraída para módulo dedicado.
- **Descrição:** A função `addMonthsClamped` resolve um bug crítico do JS nativo (overflow de mês) e é a base de todo o cálculo de vencimento de mensalidades. Estar embutida no route handler impede teste unitário isolado.
- **Impacto:** Bug não detectável sem execução da rota inteira com DB real e alunos inadimplentes.
- **Recomendação:** Mover para `src/lib/dates.ts` e exportar. Custo: 5 minutos.
- **Status:** Recomendado
- **Confiança:** Alta

---

### [Médio] CI não tem step de build — regressions de compilação só detectadas em deploy

- **Agente responsável:** Agente 10 — Testes e Qualidade
- **Categoria:** Confiabilidade de pipeline
- **Arquivo:** `.github/workflows/ci.yml`
- **Linha/trecho:** Todos os steps (lint, typecheck, audit)
- **Evidência:** CI executa `npm run lint`, `npm run typecheck`, `npm audit`. `npm run build` não está no CI porque dispara `db:apply-pending` que muta o banco de produção.
- **Descrição:** `typecheck` captura erros TypeScript mas não captura erros de bundling Next.js (imports dinâmicos inválidos, páginas com export padrão errado, edge runtime com imports incompatíveis). Uma falha de build só é descoberta no deploy Vercel.
- **Recomendação:** Adicionar step `SKIP_PENDING_MIGRATIONS=1 npx next build` ao CI (conforme documentado no próprio `audit/_context.md`). Usar ambiente sem `DATABASE_URL` para forçar skip do Prisma Client init ou mockar com `PRISMA_SKIP_VALIDATION=1`.
- **Status:** Recomendado
- **Confiança:** Alta

---

## Resumo Executivo

**Diagnóstico em 1 linha:** O projeto move dinheiro real com 0% de cobertura de testes — qualquer refatoração em cálculo de desconto, HMAC de webhook, datas de vencimento ou guards de acesso pode introduzir regressão silenciosa que chega a produção via CI que só executa lint e typecheck.

**Top 5 prioridades de teste (ordem de ROI):**

1. **`applyCouponDiscount`** — Unit (Vitest) — XS esforço, protege cálculo financeiro direto ao consumidor
2. **`validateMpWebhookSignature`** — Unit (Vitest) — previne matrícula fraudulenta por HMAC forjado  
3. **`addMonthsClamped`** — Unit (Vitest) — função pura, bug causa atraso sistemático de bloqueio de inadimplentes
4. **`isValidCpf` + `encrypt`/`decrypt`** — Unit (Vitest) — CPF inválido = aluno paga mas não matricula; crypto quebrada = todas as vendas de um tenant param
5. **Idempotência de `fulfillEnrollment`** — Integration (Vitest + DB teste) — replay de webhook = matrícula duplicada na plataforma parceira

**Estimativa de setup inicial:** 2 dias (1 dia Vitest + 7 testes P0; 1 dia Playwright + fluxo de checkout feliz).
