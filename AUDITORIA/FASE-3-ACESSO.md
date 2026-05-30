# Fase 3 — Níveis de Acesso e Papéis

> Gerado da varredura paralela (sub-agentes Explore) + verificação adversarial. Total nesta fase: **11 achados**.

## Resumos dos finders

- Auditoria de fase 3 (matriz de papéis e proteção de páginas) em Next.js 16 + Prisma + NextAuth v5 multi-tenant. Sistema de roles bem implementado (SUPER_ADMIN, PMB_SALES, PMB_RESELLER_MGR, RESELLER, STUDENT) com guards em src/lib/auth/guards.ts. Isolamento de tenant via x-tenant-id/x-tenant-slug (proxy remove headers client). Encontradas 3 vulnerabilidades: (1) páginas /admin sem verificação adicional além do layout, (2) endpoint /api/cobranca com enumeração de pagamentos apenas rate-limitada, (3) potencial TOCTOU em operações de certificados e equipe.
- Auditoria de coerência de autorização e impersonation concluída. Sistema bem defendido: impersonation é exclusivo de SUPER_ADMIN com auditoria completa, cupons PMB possuem caps reforçados via PMB_SALES_CAP (50%), consultores têm maxDiscount enforçado em /painel/cupons, e isolamento multi-tenant é mantido em checkouts. Porém, identificadas 3 findings de severidade Medio: (1) Flag de impersonation com httpOnly=false expõe dados de auditoria ao client; (2) /api/checkout da vitrine PMB não valida maxDiscount de consultores (não aplicável aqui mas contexto); (3) Limite de desconto não revalidado no client-side antes de submeter checkout (mas server-side está protegido).

## Achados detalhados

### 1. [Critico] Enumeração de pagamentos via força bruta em endpoint público /api/cobranca/[paymentId] ✅verificado→**Alto**
- **arquivo:linha:** `src/app/api/cobranca/[paymentId]/route.ts:7-11`
- **confiança (finder):** alta
- **descrição:** Endpoint público sem autenticação permite listar informações de qualquer cobrança via força bruta. Defesa: rate-limit de 20 req/min por IP (line 16). TODO comentário reconhece fraqueza: 'defesa ideal seria um token assinado por cobrança (HMAC/JWT)'. Atacante pode enumerar pagamentos se conseguir muitos IPs (botnet, proxies rotativos).
- **impacto:** Vazamento de informações de pagamento (valores, datas, status) de qualquer aluno/revendedor. Impossibilita estimativa de MRR ou padrão de pagamentos de terceiros sem autenticação.
- **correção:** Implementar token assinado (HMAC-SHA256 ou JWT) emitido no momento da criação da cobrança e incluído no link enviado por email/SMS. Validar token antes de retornar dados. Exemplo: paymentToken = hmac(paymentId + secret, key), incluir em URL /api/cobranca/[paymentId]?token=[paymentToken].
- **veredito adversarial:** CONFIRMADO — Vulnerabilidade CONFIRMADA. O endpoint /api/cobranca/[paymentId] é publicamente acessível sem autenticação do cliente. isKnownAsaasPayment() apenas valida se o paymentId existe no banco (sem filtro por usuário logado), retornando true para qualquer payment de qualquer tenant. Subsequentemente, getPayment() chamado sem validação de ownership expõe dados sensíveis (valor, status, data vencimento, de

### 2. [Alto] Página /admin/analytics sem verificação de autenticação no page.tsx
- **arquivo:linha:** `src/app/admin/analytics/page.tsx:1-14`
- **confiança (finder):** alta
- **descrição:** AdminAnalyticsClient não tem proteção no page. Renderiza sem validação de role.
- **impacto:** Ausência de defesa em profundidade.
- **correção:** Adicionar: const session = await requireAdminSession(); if (!session) redirect('/login');

### 3. [Alto] Múltiplas páginas /admin sem proteção em page.tsx: banner, notificacoes, financeiro, relatorios
- **arquivo:linha:** `src/app/admin/banner/page.tsx:1`
- **confiança (finder):** alta
- **descrição:** Total de ~11 páginas em /admin encontradas sem requireAdminSession() ou similar no page.tsx. Todas confiam exclusivamente em layout.tsx (src/app/admin/layout.tsx:16).
- **impacto:** Padrão de proteção inconsistente. Se houver bug em layout ou em middleware de redirect, múltiplas páginas ficam desprotegidas.
- **correção:** Criar helper ou padrão reutilizável: async function protectAdminPage() { const s = await requireAdminSession(); if (!s) redirect(...); return s; } Adicionar em cada página.

### 4. [Alto] Páginas /admin dependem exclusivamente de proteção em layout — sem validação adicional em page.tsx ✅verificado→**Medio**
- **arquivo:linha:** `src/app/admin/layout.tsx:16`
- **confiança (finder):** alta
- **descrição:** Páginas como /admin/revendedores, /admin/meu-perfil, /admin/analytics, /admin/banner, /admin/notificacoes, etc. NÃO fazem verificação de role em seus page.tsx. Dependem 100% de requireAdminSession() no layout.tsx. Se o layout fosse burlado ou houvesse bug em redirect, essas páginas ficariam acessíveis sem proteção.
- **impacto:** Um usuário não-admin que conseguisse acessar /admin/revendedores/page.tsx (ex: via race condition ou bug de redirect) veria dados sensíveis. Aplicação de defesa em profundidade fraca.
- **correção:** Adicionar verificação de role em cada page.tsx dentro de /admin. Exemplo: const session = await requireAdminSession(); if (!session) redirect(...); no início de AdminResellersPage(). Padrão: duas camadas de proteção (layout + page).
- **veredito adversarial:** CONFIRMADO — A finding é CONFIRMADA mas com severidade REDUZIDA de Alto para Médio. 

CONFIRMADO:
- 6 páginas (/admin/analytics, /admin/revendedores, /admin/notificacoes, /admin/relatorios, /admin/meu-perfil, /admin/banner) NÃO fazem validação de role em suas page.tsx
- Dependem 100% de requireAdminSession() no layout.tsx (linha 16)
- Isso viola defesa em profundidade — nenhuma camada redundante de proteção

C

### 5. [Alto] Página /admin/meu-perfil sem verificação de autenticação no page.tsx
- **arquivo:linha:** `src/app/admin/meu-perfil/page.tsx:1-22`
- **confiança (finder):** alta
- **descrição:** Page component não valida role. Depende do layout. ProfileTabs é client-side, faz chamadas autenticadas, mas a página em si não bloqueia acesso de usuários não-autenticados ou não-admin no server.
- **impacto:** Página pode ser acessada sem autenticação adequada se layout fosse contornado.
- **correção:** Adicionar: const session = await requireAdminSession(); if (!session) redirect('/login');

### 6. [Alto] Página /admin/revendedores sem verificação de autenticação no page.tsx
- **arquivo:linha:** `src/app/admin/revendedores/page.tsx:1-14`
- **confiança (finder):** alta
- **descrição:** Page component ResellerListClient não faz requireAdminSession(). Depende inteiramente do layout.tsx para bloquear acesso. Se layout fosse contornado, página renderizaria sem proteção.
- **impacto:** Fraqueza de defesa em profundidade. Acesso a ResellerListClient (componente client que faz fetch de /api/admin/revendedores) sem garantia de role.
- **correção:** Adicionar ao inicio de AdminResellersPage: const session = await requireAdminSession(); if (!session) redirect('/login');

### 7. [Medio] Flag de impersonation com httpOnly=false permite XSS exfiltração de dados de auditoria
- **arquivo:linha:** `src/app/api/admin/revendedores/[id]/impersonate/route.ts:103`
- **confiança (finder):** alta
- **descrição:** O cookie IMPERSONATION_FLAG_COOKIE é configurado com httpOnly=false (linha 103) para ser 'visível ao client para banner'. O flag contém dados de auditoria sensíveis: adminUserId, adminName, targetUserId, targetName, startedAt. Uma vulnerabilidade XSS no cliente (iframe, injeção de script, ou supply-chain attack via biblioteca) pode exfiltrar esses dados via document.cookie, permitindo atacante descobrir quem foi impersonado e quando.
- **impacto:** Exfiltração de dados de auditoria de impersonation via XSS; correlação de impersonations com atividades suspeitas; rastreamento de quais revendedores foram alvo de investigação. Violação de confidencialidade da trilha forense.
- **correção:** Remover httpOnly=false. Para exibir o banner de 'você está impersonando X', use uma rota GET /api/admin/impersonation-status que retorna o flag apenas se HMAC validar na sessão. Alternativa: armazenar flag em localStorage com TTL e validar server-side sem expor via cookie. Justificativa: a segurança do flag (HMAC) não compensa a exposição ao XSS.

### 8. [Medio] Checkout PMB não valida maxDiscount de consultores (falta de defesa em profundidade)
- **arquivo:linha:** `src/app/api/checkout/route.ts:303-346`
- **confiança (finder):** media
- **descrição:** O endpoint /api/checkout (vitrine PMB para cursos diretos) não consulta nem valida maxDiscount de TenantMember caso o cupom seja criado por um consultor do tenant PMB. Embora cupons PMB (tenantId=null) sejam criados por PMB_SALES/PMB_RESELLER_MGR com cap de 50%, se um futuro flow permitir consultores criar cupons PMB, o checkout não teria 2ª validação. Em /painel/vendas (linhas 170-182), há validação: se member.role='consultant' e member.maxDiscount existe, o cap é aplicado. Em /checkout, isso está ausente.
- **impacto:** Falta de defesa em profundidade: se regra de criação de cupom por role mudar, checkout não detecta violação de cap. Consultor com maxDiscount=20% poderia (teoricamente) aplicar cupom de 50% se regra de criação falhar. Baixo risco atual pois PMB_SALES é role distinto, mas violação de princípio de múltiplas camadas de validação.
- **correção:** Adicionar validação de cap em /api/checkout mesmo para cupons PMB: (1) Detectar se cupom foi criado por role=PMB_SALES e aplicar cap de 50%. (2) Ou, mais robustomente, adicionar campo createdByRole ao Coupon e validar no checkout. Isso protege contra regressões futuras. Código referência: /painel/vendas linhas 220-228.

### 9. [Medio] TOCTOU (Time-Of-Check-Time-Of-Use) em download de certificados — check de tenantId após findUnique
- **arquivo:linha:** `src/app/api/painel/certificates/[id]/download/route.ts:28-34`
- **confiança (finder):** media
- **descrição:** Rota faz findUnique(id) sem tenantId (line 28), depois checa if (cert.tenantId !== ctx.tenantId) (line 32). Entre esses dois statements, outro revendedor poderia teoricamente modificar cert.tenantId (race condition). Ideal seria findFirst({ where: { id, tenantId } }) em uma única query.
- **impacto:** Exposição de certificados cross-tenant se timing perfeito (improvável em prática, pois Prisma + PostgreSQL são transacionais, mas defesa em profundidade ainda assim enfraquecida).
- **correção:** Refatorar para consulta atômica: await prisma.certificate.findFirst({ where: { id, tenantId: ctx.tenantId }, ... }) ao invés de findUnique + check separado.

### 10. [Medio] ImpersonationFlag armazena adminUserId e targetUserId em texto legível no flag HMAC (risco de data leak em logs)
- **arquivo:linha:** `src/lib/auth/impersonate.ts:72-78`
- **confiança (finder):** media
- **descrição:** A interface ImpersonationFlag (linhas 72-78) contém adminUserId, adminName, targetUserId, targetName em JSON que é Base64URL encoded no cookie. Embora HMAC-protegido contra forjamento, se o flag for logado (contextLogger, error stack traces, ou debug dumps), o Base64URL pode ser rapidamente decodificado por atacante com acesso a logs. O endpoint end-impersonation não loga o flag decodificado (bom), mas se houver erro em decodeImpersonationFlag, o valor bruto pode aparecer em stack traces.
- **impacto:** Risco de data leak (PII: userId, nomes) em logs de erro ou debug; violação de confidencialidade da auditoria; correlação entre IDs e nomes de revendedores investigados. Severidade reduzida porque HMAC protege contra tampering e logs devem estar protegidos, mas ainda é defesa em profundidade falta.
- **correção:** Implementar safe logging: (1) Em decodeImpersonationFlag, se houver erro, logar apenas hash do flag, não o valor bruto. (2) Adicionar sanitização em contextLogger.error para nunca logar raw flag. (3) Considerar armazenar apenas hashes (adminUserId_hash, targetUserId_hash) no flag e validar contra DB. Referência: /lib/audit.ts já aplica boas práticas de logging estruturado.

### 11. [Baixo] TOCTOU em deleção de membro da equipe — check não-atômico
- **arquivo:linha:** `src/app/api/painel/equipe/[id]/route.ts:63-64`
- **confiança (finder):** media
- **descrição:** DELETE route faz findUnique({ where: { id } }) (line 63), depois checa if (!member || member.tenantId !== tenantId) (line 64). Janela pequena de TOCTOU. Refatorar para findFirst({ where: { id, tenantId } }) em uma query.
- **impacto:** Possibilidade teórica de deletar membro de outro tenant em timing perfeito. Improvável em produção dado serialização do Prisma, mas viola princípio de operação atômica.
- **correção:** Mudar para: const member = await prisma.tenantMember.findFirst({ where: { id, tenantId } }); if (!member) return 404;
