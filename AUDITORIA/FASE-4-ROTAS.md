# Fase 4 — Rotas e APIs

> Gerado da varredura paralela (sub-agentes Explore) + verificação adversarial. Total nesta fase: **14 achados**.

## Resumos dos finders

- Auditoria exaustiva de tratamento de erros em API handlers do SaaS multi-tenant. Identificados 7 problemas críticos e altos em respostas HTTP inadequadas, erros engolidos sem logging, e falhas de rollback silenciosas em operações financeiras críticas.
- Auditoria de performance (Fase 4) no SaaS multi-tenant Next.js 16 + Prisma 7: identificadas 7 problemas críticos de queries — 2 N+1 em loop, 1 falta de paginação sem limite aparente, índices compostos faltando e includes desnecessários. Isolamento tenantId em filtros confirma-se robusto, mas performance degrada sob volume com vitrines de revendas grandes.

## Achados detalhados

### 1. [Critico] N+1 em loop: upsert sequencial de TenantPayments do Asaas
- **arquivo:linha:** `src/app/api/admin/revendedores/[id]/route.ts:212-234`
- **confiança (finder):** alta
- **descrição:** Dentro do tratamento de sincronização de pagamentos Asaas (GET /api/admin/revendedores/[id]), ocorre um for loop que executa prisma.tenantPayment.upsert() **sequencialmente** para cada pagamento retornado da API do Asaas. Se a API retornar 20-30 pagamentos, isso resulta em 20-30 queries serializadas em vez de batch. Este padrão bloqueia a execução (await dentro do loop) e causa latência acumulada.
- **impacto:** Para revendedores com muitos pagamentos históricos (cenário comum em tenants ativos), cada visualização de /admin/revendedores/[id] sofre delay de 2-5s devido a queries sequenciais. O endpoint torna-se lento quando há rotina de sync ou ajuste manual frequente.
- **correção:** Refatorar para usar Promise.all() para executar uperts em paralelo. Exemplo: `await Promise.all(asaasPayments.data.map(p => prisma.tenantPayment.upsert(...)))`

### 2. [Alto] N+1 em self-heal: findFirst sequencial para cada template padrão
- **arquivo:linha:** `src/app/api/admin/automacao/templates/route.ts:30-45`
- **confiança (finder):** alta
- **descrição:** GET /api/admin/automacao/templates executa um for loop sobre DEFAULT_AUTOMATION_TEMPLATES (4-5 items) onde CADA iteração faz await prisma.automationMessageTemplate.findFirst() + create sequencialmente. Quando templates não existem (primeira carga), causa 4-5 queries encontradas + 4-5 creates quando deveriam ser batch operations.
- **impacto:** Primeira visualização de admin/automacao/templates sofre delay (não crítico pois é setup único), mas padrão é anti-pattern que se replica em outros endpoints. Cache não é usado, então cada reload sem templates refaz as queries.
- **correção:** Usar transação para batch upsert. Ou simplesmente findMany + identificar missing localmente + createMany uma única vez.

### 3. [Alto] Catch silencioso sem logging em operação de cleanup (deleteVitrineAsset)
- **arquivo:linha:** `src/app/api/painel/vendas/route.ts:332`
- **confiança (finder):** alta
- **descrição:** Na linha 332, `await deleteVitrineAsset(previousPath).catch(() => {})` engole erros silenciosamente sem registrar no log. Este padrão aparece também nas linhas 384, 385, 489, 490. Erros de limpeza que não são registrados ocultam problemas de sincronização com storage externo e dificultam debug em produção.
- **impacto:** Erros em operações de cleanup não são rastreados. Se um asset não for deletado do Supabase, o blob permanece no storage consumindo quota indefinidamente sem alertar. Dificulta investigação de anomalias de custo.
- **correção:** Substitua `catch(() => {})` por `.catch(swallowCleanup('painel.vendas.deleteAsset'))` usando a helper existente em src/lib/errors.ts. O app já possui infraestrutura de logging para side-effects não-críticos.

### 4. [Alto] Falha silenciosa em bolsa de estudo com rollback incompleto
- **arquivo:linha:** `src/app/api/painel/vendas/route.ts:329-332`
- **confiança (finder):** alta
- **descrição:** Na linha 329-332, se `fulfillScholarshipEnrollment()` falhar, a enrollment é deletada mas sem try/catch ao redor do delete (`await prisma.enrollment.delete({...}).catch(() => {})`). Se o delete também falhar, a falha é engolida e o enrollment fica órfã no DB.
- **impacto:** Crédito de bolsa concedido mas matrícula inconsistente. Aluno recebe acesso mas enrollment fica PENDING. Causa divergência entre realidade (acesso aprovado) e DB (ainda aguardando).
- **correção:** Implemente two-phase rollback com logging: `.catch(swallow('painel.vendas.rollback_bolsa'))`. Considere transação do Prisma para atomicidade.

### 5. [Alto] Rollback silencioso em checkout de revenda com cupom
- **arquivo:linha:** `src/app/api/painel/vendas/route.ts:384-385, 489-490`
- **confiança (finder):** alta
- **descrição:** Linhas 384-385 e 489-490 usam `.catch(() => {})` em cleanup crítico: `await prisma.enrollment.delete({...}).catch(() => {})`. Se Mercado Pago retorna erro, o código tenta deletar enrollment órfã. Se delete falhar, não há registro. O cupom fica com usedCount inflado.
- **impacto:** Enrollment órfã (PENDING) fica no DB. Próxima tentativa retorna 409 DUPLICATE_ENROLLMENT, bloqueando cliente permanentemente. Cupom esgota de forma invisível.
- **correção:** Registre errors de rollback: `.catch(swallowCleanup('painel.vendas.rollback'))`. Use Prisma transaction para atomicidade.

### 6. [Medio] Índice @@index([tenantId, status]) em Enrollment — falta createdAt para queries com date range
- **arquivo:linha:** `prisma/schema.prisma:635-646`
- **confiança (finder):** media
- **descrição:** Schema Enrollment tem @@index([tenantId, status]) e @@index([tenantId, createdAt]) separados, mas muitas queries filtram por (tenantId, status, createdAt range). Sem índice composto cobrindo os 3 campos, planner escolhe índice parcial e full-scan.
- **impacto:** Queries de dashboard/relatórios com filtro status + data range sofrem full-scan em enrollments grandes (milhões de rows). Escalação problemática conforme dados crescem.
- **correção:** Adicionar índice composto: `@@index([tenantId, status, createdAt])` no modelo Enrollment. Verificar Payment igualmente para [tenantId, mpStatus, createdAt].

### 7. [Medio] Operação de cleanup sem logging em sessão WhatsApp
- **arquivo:linha:** `src/app/api/admin/automacao/whatsapp/status/route.ts:72`
- **confiança (finder):** media
- **descrição:** Na linha 72, `await stopSession(settings.pmbWaSessionName).catch(() => {})` engole erros de desconexão. Se falhar, nenhum registro é feito, deixando sessão 'fantasma' na plataforma remota.
- **impacto:** Sessão WhatsApp ativa na plataforma remota enquanto app acredita estar desconectado. Possível duplicação de mensagens ou bloqueio de conta.
- **correção:** Altere para `.catch(swallowCleanup('admin.wa.stopSession'))` para registrar falhas.

### 8. [Medio] Paginação fixa (take: 200) sem cursor — risco de query lenta em muitos registros
- **arquivo:linha:** `src/app/api/admin/financeiro/tenant-payments/route.ts:73-91`
- **confiança (finder):** media
- **descrição:** Rota `/api/admin/financeiro/tenant-payments` carrega `take: 200` de TenantPayments com filtros complexos (status, date range, search em tenant.name). Suporta filtros mas não implementa cursor-based pagination. Se admin filtra período inteiro (1+ anos), pode retornar 1000+ linhas.
- **impacto:** Queries sem range date ou com range amplo sofrem full-table scan em milhões de rows quando plataforma escala. Índice composto @@index([tenantId, status, dueDate]) não cobre search full-text em tenant.name.
- **correção:** Implementar cursor-based pagination com `cursor` e `take`. Mover filtro search tenant.name para subquery. Confirmar índice está sendo usado.

### 9. [Medio] Include _count aninhado em findMany (200 rows) — query complexa sem paginação
- **arquivo:linha:** `src/app/api/painel/alunos/route.ts:20-52`
- **confiança (finder):** media
- **descrição:** GET `/api/painel/alunos` carrega `take: 200` students com `_count.enrollments` (contagem aninhada com WHERE) por cada aluno. Combinado com search (regex insensitive) em nome/email/cpf, resulta em query complexa. Sem cursor pagination quando take: 200 é atingido.
- **impacto:** Painel de revendedor com 100+ alunos sofre delay (múltiplos JOINs e agregações). Revendedor com 500+ alunos experimentará timeout. Busca full-text não é otimizada.
- **correção:** Implementar cursor pagination com take <= 50. Mover contagem aninhada para query separada em batch. Adicionar índice parcial se search é frequente.

### 10. [Medio] Status code 500 em falha de geração (não é erro do servidor)
- **arquivo:linha:** `src/app/api/painel/cupons/generate-code/route.ts:37-38`
- **confiança (finder):** media
- **descrição:** Linha 37-38: se após 5 tentativas houver colisão de código, retorna status 500. Mas 500 significa erro interno do servidor, não problema transitório.
- **impacto:** Cliente assume falha grave. CDN pode cachear erro. APM dispara alertas falsos de outage.
- **correção:** Use status 503 (Service Unavailable) ou 429 (Too Many Requests) em vez de 500.

### 11. [Medio] Erro de parsing JSON engolido sem mensagem contextual
- **arquivo:linha:** `src/app/api/painel/cursos/[id]/visibility/route.ts:35-37`
- **confiança (finder):** media
- **descrição:** Linha 35-37: `try { payload = await request.json() } catch { payload = null }`. JSON inválido recebe null silenciosamente. Depois `toggleSchema.safeParse(null)` falha com mensagem genérica sem registrar erro original.
- **impacto:** Cliente recebe mensagem de validação genérica ao invés de 'JSON inválido'. Dificulta debug de requisições malformadas.
- **correção:** Retorne 400 com logging explícito no catch: `contextLogger().warn({err}); return NextResponse.json({error: 'JSON inválido'}, {status: 400})`

### 12. [Medio] Falta de paginação: findMany sem take em relação N-para-M (referrals)
- **arquivo:linha:** `src/app/painel/indicacoes/page.tsx:115-129`
- **confiança (finder):** media
- **descrição:** Página `/painel/indicacoes` executa `prisma.tenant.findMany({ where: { referrerTenantId: tenant.id }, ... })` SEM `take` ou `skip`, carregando TODOS os tenants indicados por este revendedor (potencialmente centenas se for affiliate bem-sucedido). Inclui select de `referralCommissionsGenerated` para cada tenant, multiplicando a carga.
- **impacto:** Revendedores com 50+ indicados sofrem delay ao carregar a página: query retorna 50+ rows, cada um com agregação de comissões. SEM índice composto (tenantId, createdAt), a query full-scan. Escalação ruim: top affiliates (100+ referrals) causam timeout.
- **correção:** Adicionar `take: 100` e implementar paginação no front. Alternativa: usar aggregation groupBy em vez de fetchAll relacional.

### 13. [Baixo] Include desnecessário de referralCommissionsReceived em findMany Tenant
- **arquivo:linha:** `src/app/admin/indicacoes/page.tsx:32-52`
- **confiança (finder):** baixa
- **descrição:** GET `/admin/indicacoes` carrega `prisma.tenant.findMany()` com `include: { referralCommissionsReceived: { select: { amount, status } } }` para TODOS os tenants com referrals. Então faz loop para somar em memória. Retorna dados desnecessários quando poderia usar aggregation.
- **impacto:** Overhead de network/parsing quando há 1000+ referrals. Minor issue mas indica oportunidade de otimização.
- **correção:** Refatorar para usar prisma.referralCommission.groupBy com _sum. Reduz payload e deixa cálculo no DB.

### 14. [Baixo] Catch vazio em cleanup de asset anterior
- **arquivo:linha:** `src/app/api/painel/cursos/[id]/capa/route.ts:114-117`
- **confiança (finder):** media
- **descrição:** Linhas 114-117: `try { await deleteVitrineAsset(previousPath) } catch { }`. Erros em delete do asset antigo são ignorados sem log.
- **impacto:** Assets órfãos acumulam no Supabase consumindo quota. Custo cresce sem alertas.
- **correção:** Registre: `.catch(swallowCleanup('painel.cursos.deleteOldCapa'))`. Pattern já existe no codebase.
