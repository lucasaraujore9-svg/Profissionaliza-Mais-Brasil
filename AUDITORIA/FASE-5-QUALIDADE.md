# Fase 5 — Bugs e Qualidade

> Gerado da varredura paralela (sub-agentes Explore) + verificação adversarial. Total nesta fase: **20 achados**.

## Resumos dos finders

- Auditoria CRÍTICA identificou 6 bugs reais em SaaS multi-tenant. Bugs prioritários: (1) Redis failure causes missing x-tenant-id header — CRITICAL isolamento tenant bypass em proxy.ts; (2) Timezone bug in due-date.ts (local vs UTC) quebra vencimentos em multi-region; (3) Silent .catch() em payout.ts engole erros críticos de notificação de clawback. Qualidade de dados: anti-fraude por email fraco, reduce sem type guards, divisão sem validação de ranges.
- Auditoria EXAUSTIVA de qualidade TypeScript em SaaS multi-tenant Next.js 16. Arquitetura sólida com isolamento de tenant via aplicação, autenticação JWT segura e validação Zod robusta. Encontradas 8 findings: 1 Critico de segurança (payment enumeration), 2 Alto em non-null assertions (payment logic, email), 5 Medio/Bajo em code smell. Projeto bem defensivo com áreas pontuais para melhoria.
- Auditoria EXAUSTIVA de hooks e client components em SaaS multi-tenant Next.js 16. Identificados 6 achados críticos e altos focando em memory leaks, race conditions, listeners não removidos, polling incorreto e isolamento multi-tenant. O padrão geral é sólido mas com falhas pontuais em cleanup de resources e dependencies em useEffect.

## Achados detalhados

### 1. [Critico] TODO: Payment enumeration attack via rate-limit bypass
- **arquivo:linha:** `/src/app/api/cobranca/[paymentId]/route.ts:7-10`
- **confiança (finder):** alta
- **descrição:** Código usa apenas rate-limit por IP (20req/min) em vez de token assinado por cobrança. Permite ~28k tentativas/dia para enumerar payments válidos.
- **impacto:** Information disclosure: atacante pode enumerar payments públicos e descobrir status/valores sem autenticação.
- **correção:** Implementar token JWT com {paymentId, exp} na criação da cobrança e validar aqui. Elimina enumeração.

### 2. [Critico] Race condition e setState após unmount em polling de pagamento
- **arquivo:linha:** `src/app/cobranca/[paymentId]/checkout-client.tsx:31-46`
- **confiança (finder):** alta
- **descrição:** PixTab setupola para verificar pagamento a cada 5s. Há cleanup (linha 44-46), MAS se o componente desmontar enquanto fetch está in-flight, `onPaid()` será chamado mesmo após unmount. Além disso, `pollRef.current` é verificado dentro do async mas pode ter sido clearado no cleanup. A dependência `[paymentId, onPaid, pix]` causa re-criação do interval toda vez que `onPaid` mudar (é callback inline).
- **impacto:** 1. Chamada de callback após unmount (React warning). 2. Múltiplos intervals simultâneos se `pix` or `paymentId` mudar. 3. Em checkout com múltiplos abas, pode dispara confirmation prematura ou em payment errado se paymentId mudar.
- **correção:** 1. Usar AbortController para cancelar fetch in-flight. 2. Usar useCallback estável para `onPaid`. 3. Guardar cancelToken/mounted flag para evitar setState após unmount. Exemplo: `const isMountedRef = useRef(true); return () => { isMountedRef.current = false; }`
- **trecho:**

```
const pix = billingInfo?.pix
useEffect(() => {
  if (!pix) return
  pollRef.current = setInterval(async () => {
    try {
      const res = await fetch(`/api/cobranca/${paymentId}`)
      ...
      if (status === 'RECEIVED') {
        onPaid()  // Pode disparar após unmount
      }
    } catch { }
  }, 5000)
  return () => { if (pollRef.current) clearInterval(pollRef.current) }
}, [paymentId, onPaid, pix])
```

### 3. [Critico] Missing x-tenant-id Header When Redis Cache Unavailable
- **arquivo:linha:** `src/proxy.ts:280-282`
- **confiança (finder):** alta
- **descrição:** The proxy only sets the x-tenant-id header when Redis successfully returns tenant data. If Redis is down or returns null, the header is NOT set for subsequent /loja routes. This means database queries without x-tenant-id would execute without proper multi-tenant filtering, potentially allowing cross-tenant data access.
- **impacto:** Critical tenant isolation bypass. If Redis becomes unavailable, API routes relying on x-tenant-id header for tenant filtering could leak data across tenants or allow unauthorized access to other tenant's data.
- **correção:** Implement fallback to query database directly for tenant resolution when Redis fails, or at minimum: (1) reject requests when x-tenant-id cannot be resolved, (2) add downstream route guards that explicitly check x-tenant-id is present, (3) implement Redis connection monitoring with alerting.
- **trecho:**

```
const cachedTenant = await resolveTenantFromRedis(tenantSlug)
if (cachedTenant && cachedTenant.status !== 'ACTIVE') { ... }
const requestHeaders = new Headers(sanitizedHeaders)
requestHeaders.set('x-tenant-slug', tenantSlug)
if (cachedTenant) {
  requestHeaders.set('x-tenant-id', cachedTenant.id)
}
return NextResponse.rewrite(url, { request: { headers: requestHeaders } })
```

### 4. [Alto] Non-null assertions perigosos em payment subscription IDs
- **arquivo:linha:** `/src/app/api/admin/revendedores/[id]/billing/route.ts:121, 139, 148, 150, 180`
- **confiança (finder):** alta
- **descrição:** Múltiplos non-null assertions (!) em tenant.asaasSubscriptionId, tenant.asaasCustomerId e parsed.data.planValue sem validação prévia. Código falha silenciosamente se valores forem null.
- **impacto:** Payment processing quebra; usuários não conseguem gerenciar subscriptions; erro não rastreável em produção.
- **correção:** Adicionar guards: if (!tenant.asaasSubscriptionId) return NextResponse.json({error: 'Subscription not found'}, {status: 400})

### 5. [Alto] Non-null assertion em RESEND_API_KEY sem boot validation
- **arquivo:linha:** `/src/lib/email/mailer.ts:166`
- **confiança (finder):** alta
- **descrição:** process.env.RESEND_API_KEY! como fallback SMTP sem garantir que env existe. Falha com TypeError cryptic em runtime.
- **impacto:** Email fallback quebra em produção se variável não configurada. Erro em runtime não é fail-fast.
- **correção:** Usar env.ts para validar como requiredInProd ou adicionar guard explícito antes do uso.

### 6. [Alto] Fetch em useEffect sem AbortController: loadding de gerentes não cancelado
- **arquivo:linha:** `src/components/admin/reseller-list-client.tsx:91-109`
- **confiança (finder):** alta
- **descrição:** useEffect (linha 91) carrega gerentes sem AbortController e sem mounted check. Se `data?.role` muda (ex: roleswitch de PMB_SALES para SUPER_ADMIN), fetch anterior de gerentes continua pendente. Quando completa, `setManagers()` dispara mesmo que o novo role seja diferente. Pior: se role flutua entre SUPER_ADMIN/não-SUPER_ADMIN (bug de sync de session), múltiplos fetches paralelos competem.
- **impacto:** setState em valor inesperado de role; gerentes carregados para contexto errado; possível vazamento se component desmontar durante fetch.
- **correção:** Adicionar AbortController e mounted flag. Alternativa rápida: `const isMountedRef = useRef(true); return () => { isMountedRef.current = false; }` e `isMountedRef.current && setManagers(...)`
- **trecho:**

```
useEffect(() => {
  if (data?.role !== 'SUPER_ADMIN') return
  fetch('/api/admin/equipe')
    .then(r => r.json())
    .then(body => {
      setManagers(...) // Sem check de mounted
    })
    .catch(() => setManagers([]))
}, [data?.role])
```

### 7. [Alto] Memory leak: listeners de teclado/pointer não removidos corretamente
- **arquivo:linha:** `src/components/painel/onboarding-tour.tsx:173-185`
- **confiança (finder):** alta
- **descrição:** useEffect para destravar áudio registra listeners com `once: true`, mas o cleanup tenta remover listeners SEM `once: true`. O browser não encontra handlers para remover porque o listener original já foi destruído após disparar uma vez. Resultado: listeners fantasma permanecem na memória.
- **impacto:** Vazamento de memória em componentes que montam/desmontam frequentemente. Cada remontagem adiciona listeners não limpáveis. Pode degradar performance em SPAs com navegação ativa.
- **correção:** Substituir `addEventListener(..., { once: true })` por gerenciamento manual com flag. Alternativa: usar a mesma configuração no cleanup: `window.removeEventListener('pointerdown', handler, { once: true })`
- **trecho:**

```
window.addEventListener('pointerdown', handler, { once: true })
window.addEventListener('keydown', handler, { once: true })
return () => {
  window.removeEventListener('pointerdown', handler)
  window.removeEventListener('keydown', handler)
}
```

### 8. [Alto] Fetch sem AbortController: carregamento de dados antigos sobrescreve novos
- **arquivo:linha:** `src/components/painel/student-detail-drawer.tsx:109-127`
- **confiança (finder):** alta
- **descrição:** useEffect (linha 103) carrega student por ID. Implementa `cancelled` flag corretamente, MAS se `studentId` mudar rapidamente (user abre drawer de Student A, depois logo B), o fetch de A pode completar APÓS o de B ser iniciado. A flag `cancelled` impede setState mas fetch anterior continua in-flight consumindo banda. Pior: JSON parsing do fetch antigo acontece mesmo com flag cancelada.
- **impacto:** Carregamento desnecessário de dados; possível exibição de dados errados em race de IDs; desperdício de banda em mobile; pode expor dados de student errado em logs de network se houver erro.
- **correção:** Usar AbortController: `const ctrl = new AbortController(); return () => { ctrl.abort(); }`. Passar signal ao fetch: `fetch(..., { signal: ctrl.signal })`
- **trecho:**

```
useEffect(() => {
  if (!open || !studentId) return
  let cancelled = false
  setLoading(true)
  fetch(`/api/painel/alunos/${studentId}`)
    .then(res => res.json())
    .then(body => {
      if (cancelled) return  // Flag checado MAS fetch já completo
      setStudent(body.data)
    })
  return () => { cancelled = true }
}, [open, studentId])
```

### 9. [Alto] Memory leak: listener de mousedown não removido em cleanup de ciclo anterior
- **arquivo:linha:** `src/components/shared/notification-bell.tsx:172-185`
- **confiança (finder):** alta
- **descrição:** useEffect (linha 213) registra `document.addEventListener('mousedown', handleClick)` em cleanup sem verificar se o listener já existe. Se o componente re-renderiza enquanto `open` muda, múltiplas instâncias de `handleClick` são registradas (closure diferente a cada render). O cleanup remove apenas a última, deixando outras pendentes.
- **impacto:** Vazamento progressivo de listeners. Cada toggle de `open` adiciona mais handlers. Em uso intenso (abrir/fechar notificações frequentemente), pode causar memory leak crítico e clicks duplicados capturados.
- **correção:** Usar useCallback com dependências estáveis para `handleClick`, ou usar AbortController para unsubscribe garantido. Padrão seguro: `const controller = new AbortController(); return () => { document.removeEventListener('mousedown', handleClick, { signal: controller.signal }); }`
- **trecho:**

```
useEffect(() => {
  if (!open) return
  function handleClick(e: MouseEvent) { ... }
  document.addEventListener('mousedown', handleClick)
  return () => document.removeEventListener('mousedown', handleClick)
}, [open])
```

### 10. [Alto] Timezone Bug: Local Time Instead of UTC in Due Date Calculation
- **arquivo:linha:** `src/lib/checkout/due-date.ts:6-10`
- **confiança (finder):** alta
- **descrição:** The dueDateInDays function uses getDate() and setDate() which operate in local server timezone, not UTC. When converting to ISO string for API submission, this creates a date string that may be off by hours depending on server timezone vs expected timezone. Example: if server is UTC+3 and calculation expects UTC, the due date could be 1 day off.
- **impacto:** Payment due dates submitted to Asaas will be incorrect based on server timezone, causing billing cycles to shift. For multi-region deployments or if server timezone differs from business timezone, payments become due on wrong dates, potentially causing failed collections or customer complaints.
- **correção:** Replace with UTC-based calculation: use Date.UTC(), getUTCDate(), setUTCDate(), or use a date library like date-fns with explicit timezone handling. Change to: const d = new Date(); const newDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days)); return newDate.toISOString().slice(0, 10);
- **trecho:**

```
export function dueDateInDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
```

### 11. [Alto] Silent Error Swallowing: Floating Promise in createNotification
- **arquivo:linha:** `src/lib/referrals/payout.ts:353`
- **confiança (finder):** alta
- **descrição:** At line 353, createNotification().catch(() => {}) silently swallows all errors without logging or handling. This means if the notification system fails (e.g., database unavailable, network issue), the error is completely hidden. The admin will never know that critical clawback-blocking notifications failed to send, leading to unprocessed payouts and financial discrepancies.
- **impacto:** Critical system notifications about blocked payouts due to clawback can silently fail, leaving admins unaware of pending manual interventions. This could result in automated payouts being created when they should be blocked, or admins being unable to track which referrers need manual review.
- **correção:** Implement proper error handling: (1) log the error with contextLogger().error(), (2) increment a metric/counter for failed notifications, (3) optionally re-throw if critical, or (4) queue for retry. Example: await createNotification(...).catch(err => { contextLogger().error({event: 'payout_notification_failed', tenantId}, 'Failed to notify admin of clawback block', err); })
- **trecho:**

```
await createNotification({
  audience: 'ROLE',
  roleTarget: 'SUPER_ADMIN',
  level: 'WARNING',
  title: `Payout bloqueado por clawback pendente`,
  body: `..., href: '/admin/indicacoes/comissoes',
}).catch(() => {})
```

### 12. [Medio] Non-null assertion em studentId sem type narrowing
- **arquivo:linha:** `/src/app/api/notifications/route.ts:42, 45`
- **confiança (finder):** media
- **descrição:** user.studentId! usado em ternário onde studentId é optional. Há check isStudent && Boolean(user.studentId) mas TypeScript não infere narrowing.
- **impacto:** Se studentId for undefined inesperadamente, código tenta chamar listForStudent(undefined) e falha.
- **correção:** Type guard explícito antes de usar: const sid = user.studentId; if (isStudent && !sid) return error.

### 13. [Medio] Non-null assertion em passwordSetAt sem null check
- **arquivo:linha:** `/src/components/aluno/student-password-form.tsx:69`
- **confiança (finder):** media
- **descrição:** passwordSetAt! usado em new Date(passwordSetAt!).toLocaleDateString() onde null é possível se isFirstTime=false mas passwordSetAt=null.
- **impacto:** UI crash ao renderizar página com estado inesperado.
- **correção:** Adicionar ternário: passwordSetAt ? `Last: ${new Date(passwordSetAt).toLocaleDateString()}` : 'Never'

### 14. [Medio] Non-null assertions desnecessários em config loading
- **arquivo:linha:** `/src/lib/email/smtp.ts:55, 59, 60, 61`
- **confiança (finder):** media
- **descrição:** Non-null assertions (!) em host, user, password, from que já passaram validação com filter(Boolean), mas TypeScript não infere narrowing.
- **impacto:** Code smell que enfraquece defesa ao longo do tempo se alguém refatorar.
- **correção:** Usar satisfies ou refatorar validação para type narrowing explícito.

### 15. [Medio] Race condition em operações otimistas: revert desincronizado com servidor
- **arquivo:linha:** `src/components/vitrine/use-home-sections.ts:156-158`
- **confiança (finder):** media
- **descrição:** Hook implementa otimistic UI bem (setState antes de fetch). PORÉM, em operações concorrentes rápidas (ex: user clica 'mover seção para cima' 2x em sequência), podem haver 2+ fetches in-flight. Se o 2º falhar mas o 1º suceder, o `prev = sections` do catch fica desincronizado com estado real do servidor. Além disso, `[apiBase, sections]` como deps em `toggleEnabled`, `move`, `reorder` causa novo closure a cada mudança de sections, reiniciando fetches incompletos.
- **impacto:** Inconsistência de dados. UI pode exibir ordem diferente do servidor. Em batch de operações (arrastar múltiplas seções), erros parciais deixam estado corrompido.
- **correção:** 1. Adicionar request ID / versão para detectar respostas obsoletas. 2. Usar AbortController para cancelar requests antigos quando novo pedido chega. 3. Validar resposta contra versão esperada antes de aplicar. 4. Considerar usar useTransition (React 18+) para sync automático.
- **trecho:**

```
const move = useCallback(
  async (id: string, delta: -1 | 1) => {
    const prev = sections
    if (!prev) return
    setSections(next) // Otimista
    try {
      const res = await fetch(...)
      if (!res.ok) throw new Error(...)
    } catch (err) {
      setSections(prev) // Pode estar stale
      toast.error(...)
    }
  },
  [apiBase, sections], // sections muda a cada fetch
)
```

### 16. [Medio] Incomplete Anti-Fraud Email Check Allows Circumvention
- **arquivo:linha:** `src/lib/referrals/commission.ts:118-130`
- **confiança (finder):** media
- **descrição:** Anti-fraud validation at line 118-130 only compares owner emails between referrer and referred tenants. This check is incomplete and can be bypassed by creating separate accounts with different emails. The comment mentions validating CPF/CNPJ but code only validates email, making it insufficient to prevent same person from creating multiple referral chains for self-enrichment.
- **impacto:** Weak anti-fraud allows same person to create multiple referral chains with different email addresses, circumventing pyramid scheme prevention and enabling self-referral commission generation.
- **correção:** Improve anti-fraud validation: (1) add CPF/CNPJ comparison to User model, (2) validate against Asaas customer IDs for banking identity, (3) check shared bank account details, (4) log all validation results for audit trail, (5) consider requiring manual approval for flagged cases.
- **trecho:**

```
if (referrer.owner?.email && referred.id !== referrer.id) {
  const referredOwner = await prisma.user.findFirst({
    where: { tenantId: referred.id },
    select: { email: true },
  })
  if (referredOwner?.email && referredOwner.email === referrer.owner.email) return null
}
```

### 17. [Medio] Percent Validation Missing Range Checks for Edge Cases
- **arquivo:linha:** `src/lib/referrals/commission.ts:137-141`
- **confiança (finder):** media
- **descrição:** Percent validation at line 137 only checks for falsy or negative values, not for valid ranges. A percent value like 0.000001 or 150 (if data corrupted) would pass validation and create unexpected commission amounts through Decimal arithmetic.
- **impacto:** Malformed database values could create commissions with extreme amounts or precision issues, leading to unexpected revenue leaks or zero-value transactions that fail to trigger alerts.
- **correção:** Add range validation: if (isNaN(percent) || !isFinite(percent) || percent < 0.01 || percent > 100) return null; Ensure percent is between 0.01 and 100.
- **trecho:**

```
const percent = referred.referralPercent != null ? Number(referred.referralPercent) : settings.defaultPercent
if (!percent || percent <= 0) return null
const amount = baseAmount.mul(percentDecimal).div(100).toDecimalPlaces(2)
```

### 18. [Medio] Reduce Operation Lacks Type Guards for Null Amounts
- **arquivo:linha:** `src/lib/referrals/payout.ts:102-105`
- **confiança (finder):** media
- **descrição:** Decimal reduce operation (lines 102-105) has no validation that amounts are non-null or valid Decimals. While schema constraints should prevent nulls, database corruption or migration errors could result in null amounts that would cause reduce to fail unexpectedly with unclear error.
- **impacto:** Monthly payout processing could fail completely for all tenants if even one commission has null amount, blocking all referral payouts and creating support backlog. No graceful error handling or partial processing fallback.
- **correção:** Add validation: validate all amounts exist before reduce, use .map(c => { if (!c.amount) throw new Error(...); return c; }).reduce(...), or use Optional chaining with fallback to 0.
- **trecho:**

```
const available = await prisma.referralCommission.findMany({
  where: { referrerTenantId: input.referrerTenantId, status: 'AVAILABLE' },
  select: { id: true, amount: true },
})
const totalAmount = available.reduce((acc, c) => acc.add(c.amount), new Prisma.Decimal(0))
```

### 19. [Baixo] Dead code: unused parameter tenantId
- **arquivo:linha:** `/src/lib/home/sections.ts:420`
- **confiança (finder):** media
- **descrição:** void args.tenantId silencia lint para parâmetro aceito mas nunca usado na função pickRandomCourseIds.
- **impacto:** Code smell indicando possível incompletude de implementação.
- **correção:** Remover tenantId da assinatura se não será usado, ou implementar filtragem multi-tenant.

### 20. [Informativo] Pattern de cast 'as unknown as Prisma.InputJsonValue'
- **arquivo:linha:** `/src/lib/home/sections.ts:304`
- **confiança (finder):** media
- **descrição:** Múltiplos casts to 'as unknown as Prisma.InputJsonValue' em 5+ arquivos como bridge para JSON serializable. Reduz type safety.
- **impacto:** Mudanças em shape dos dados não são capturadas em compile-time.
- **correção:** Criar type-helper centralizado para consolidar o padrão e melhorar mantenibilidade.
