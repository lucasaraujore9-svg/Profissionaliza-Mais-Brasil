# Fase 2 — Segurança

> Gerado da varredura paralela (sub-agentes Explore) + verificação adversarial. Total nesta fase: **57 achados**.

## Resumos dos finders

- Auditoria exaustiva de isolamento multi-tenant em SaaS de revenda de cursos (Next.js 16 + Prisma + Supabase). Encontradas 7 vulnerabilidades CRÍTICAS de escalação de privilégio / cross-tenant data leak via consultas Prisma que acessam recursos por ID sem validar tenantId, e uso de tabela Course (global) em lugar de TenantCourse (isolada por tenant) em páginas de vitrine.
- Auditoria exaustiva de um SaaS multi-tenant Next.js 16 revelou VULNERABILIDADES CRÍTICAS de IDOR (Insecure Direct Object Reference) em múltiplos endpoints administrativos (admin/alunos/*). Os endpoints GET validam corretamente tenantId, mas endpoints PATCH/POST não validam, permitindo que PMB_TEAM members editem, bloqueiem, resitem senhas e notifiquem alunos de OUTROS tenants, violando completamente o isolamento multi-tenant garantido pela arquitetura. Encontradas também inconsistências de validação que facilitam exploração. Schema de Zod está bem-implementado (whitelist), mas a camada de autorização falha em alguns pontos críticos.
- Auditoria de cobertura de autenticação em route handlers de mutação completada. Escaneados 170+ endpoints em src/app/api/{admin,painel,aluno,loja}. Padrão geral é forte com uso consistente de helpers de autenticação (requireAdminSession, requireStudentSession, requireResellerSession, isCronAuthorized, isInternalAuthorized). Identificadas 2 issues: 1 deficiência em defesa em profundidade (end-impersonation), 1 oportunidade de código limpo (redeclaração inline). Webhooks e crons possuem validação HMAC/token apropriada.
- Auditoria exaustiva de webhooks, crons e rotas internas revelou um sistema bem implementado com defesa em profundidade contra ataques cross-tenant e forjamento. Pontos fortes: validação de token (Asaas) e HMAC SHA256 (MP), idempotência via chave única, autenticação de crons/internas com constant-time comparison. Crítica: falta validação de timestamp em webhooks MP (permitindo replay attacks).
- Auditoria EXAUSTIVA de segurança/criptografia em Next.js 16 multi-tenant com Prisma 7 + NextAuth v5. Isolamento de tenant é 100% na aplicação (sem RLS). Criptografia AES-256-GCM bem implementada com IV aleatório, authTag validado e chave de 32 bytes. Logger com redação automática de secrets (mpAccessToken, tokens, passwords, CPF). Supabase service_role usado apenas no server-side. Detectadas 3 vulnerabilidades: (1) Geração de cupom com Math.random() ao invés de crypto.random - CRÍTICA; (2) Shuffle de cursos com Math.random() para seção aleatória; (3) Sem validação de boundary em hash.length. Nenhuma exposição de secrets em logs ou respostas detectada. Bearer tokens use timing-safe comparison. Reset tokens hash com SHA-256. JWT via NextAuth com impersonation flag HMAC-assinado. Isolamento multi-tenant bem validado em rotas críticas. Webhook MP com validação HMAC SHA-256 timing-safe. Senhas com bcryptjs salt 12.
- Auditoria EXAUSTIVA concluída em SaaS multi-tenant Next.js + Prisma + NextAuth. Analisados 764 arquivos em src/. Detectadas vulnerabilidades de CSRF em operações autenticadas e ausência de sanitização em camadas adicionais de React Markdown. Múltiplas defesas em profundidade implementadas (validação de magic bytes, isolamento de tenant, rate limiting, validação de webhooks). Nenhum RCE, SQL injection ou vazamento direto cross-tenant encontrado.
- Auditoria EXAUSTIVA de IDOR em SaaS Next.js 16 multi-tenant com isolamento 100% por filtro tenantId. Identificadas 3 críticas (download de certificados sem validação de tenant em admin) e 1 alta (payment ID públicos sem token por cobrança). Rotas de reseller/painel implementam validação correta na maioria dos casos. Notificações implementam ownership check adequado.
- Auditoria exaustiva de validação de input em route handlers do SaaS multi-tenant PMB (Next.js 16 + Prisma 7). Examinadas 50+ rotas críticas de vitrine, aluno, revendedor e admin. Codebase possui Zod em uso generalizado, porém várias rotas apresentam falhas de validação de input que podem levar a DoS, vazamento de dados e manipulação de valores financeiros.

## Achados detalhados

### 1. [Critico] IDOR: Admin Certificate Download sem validação de tenantId ✅verificado→**Critico**
- **arquivo:linha:** `/src/app/api/admin/certificates/[id]/download/route.ts:28-34`
- **confiança (finder):** alta
- **descrição:** GET /api/admin/certificates/[id]/download recupera certificado por ID único sem verificar se o certificado pertence ao tenant da sessão. A linha 28 chama findUnique({ where: { id } }) que ignora completamente o filtro tenantId. Qualquer admin pode baixar/revogar certificados de qualquer tenant.
- **impacto:** Um admin de um tenant pode acessar certificados de outro tenant, violando isolamento multi-tenant. Vaza dados de alunos (nomes, progresso) de outras revendas via PDF de certificado.
- **correção:** Validar cert.tenantId contra contexto após findUnique: (1) confirme que cert.tenantId === ctx.tenantId antes de permitir acesso, OU (2) use findFirst({ where: { id, tenantId: ctx.tenantId } }) como em painel/certificates/[id]/download linha 32.
- **trecho:**

```
const cert = await prisma.certificate.findUnique({ where: { id } })
if (!cert) { return NextResponse.json(...404) }
// Nunca valida cert.tenantId!
```
- **veredito adversarial:** CONFIRMADO — Vulnerabilidade IDOR confirmada e explorável. A rota GET /api/admin/certificates/[id]/download (linha 28) chama `prisma.certificate.findUnique({ where: { id } })` SEM validar se o certificado pertence ao tenant do admin autenticado. Comparação com rotas similares prova a falha intencional:

1. ROTA DE LISTAGEM (/api/admin/certificates): VALIDA tenantId (linhas 33-48 do route.ts)
2. ROTA DE REVOGAÇ

### 2. [Critico] IDOR: Admin Certificate Regenerate sem validação de tenantId ✅verificado→**Critico**
- **arquivo:linha:** `/src/app/api/admin/certificates/[id]/regenerate/route.ts:23-29`
- **confiança (finder):** alta
- **descrição:** POST /api/admin/certificates/[id]/regenerate encontra certificado por ID único sem validar tenant. Uma admin de um tenant pode regenerar (sobrescrever) o PDF de certificados de outro tenant.
- **impacto:** Acesso não autorizado a dados de outra revendedora. Uma PMB_SALES pode regenerar certificados de revendedores. Modificação de dados críticos (PDF de certificado issuado para aluno de outro tenant).
- **correção:** Adicionar validação imediatamente após findUnique: if (cert.tenantId !== ctx.tenantId) return 403. Considerar usar findFirst com tenantId na where clause para ser defensivo.
- **trecho:**

```
const cert = await prisma.certificate.findUnique({ where: { id } })
if (!cert) { return 404 }
if (cert.revokedAt) { return 410 }
// Falta validação de tenant!
```
- **veredito adversarial:** CONFIRMADO — A vulnerabilidade IDOR é REAL e EXPLORADA. A rota POST /api/admin/certificates/[id]/regenerate (linhas 23-29 em route.ts) faz findUnique({ where: { id } }) SEM validar tenantId, permitindo que PMB_SALES ou PMB_RESELLER_MGR regenerem (sobrescrevam) PDFs de certificados de outros tenants. O padrão correto de validação existe em /api/admin/certificates/[id]/revoke (linha 48-55) que SIM bloqueia: "if 

### 3. [Critico] Preço de curso usa Number() sem validação de NaN ⚠️**REFUTADO/AJUSTADO→FalsoPositivo**
- **arquivo:linha:** `/src/app/api/checkout/route.ts:208-213`
- **confiança (finder):** alta
- **descrição:** Linhas 208-213: basePrice = Number(course.precoVitrineMain ?? course.precoPromocional ?? course.precoOriginal ?? 0). Se precoVitrineMain é string inválida (ex: 'abc'), Number('abc') = NaN. A linha 214 check 'basePrice <= 0' NÃO rejeita NaN (NaN <= 0 é false). Checkout prossegue com preço NaN, causando serialização JSON problemática.
- **impacto:** Crítico: preço inválido (NaN) é enviado para MP/Asaas. Webhook recebe valor inválido. Matrícula fica com finalAmount=NaN no BD, quebra relatórios financeiros e reconciliação.
- **correção:** Usar Prisma.Decimal ou validar explicitamente após Number(): const price = Number(...); if (!Number.isFinite(price) || price <= 0) return error(...). Ou melhor: garantir no schema do BD que preços são sempre numéricos (Prisma Decimal nativamente).
- **veredito adversarial:** REFUTADO/AJUSTADO (FalsoPositivo) — A vulnerabilidade alegada é um FALSO POSITIVO. A premissa é incorreta: campos Prisma.Decimal do PostgreSQL NUNCA podem conter strings inválidas como 'abc'. Os preços são armazenados como DECIMAL(10,2) no PostgreSQL, deserializados como objetos Prisma.Decimal (não strings), e toda entrada é validada via Zod ou parseBRPrice() que lança erro em NaN. Portanto, basePrice nunca pode ser NaN, e o check '

### 4. [Critico] IDOR em POST /api/admin/alunos/[id]/bloquear - Block Cross-Tenant ✅verificado→**Critico**
- **arquivo:linha:** `src/app/api/admin/alunos/[id]/bloquear/route.ts:23-29`
- **confiança (finder):** alta
- **descrição:** O endpoint que bloqueia alunos seleciona tenantId (linha 25) mas não o valida. Apenas restringe a SUPER_ADMIN (linha 15), porem ainda permite que um SUPER_ADMIN bloqueie alunos de ANY tenant, não apenas do PMB. GET valida `where: { id, tenantId: pmbTenant.id }` mas POST não. Bloquear é ação destrutiva que suspende matriculas ativas.
- **impacto:** SUPER_ADMIN pode bloquear alunos de tenants revendedores, suspensos suas matriculas ativas sem permissão. Violação de disponibilidade e isolamento de dados.
- **correção:** Adicionar validação: se intent é permitir SUPER_ADMIN gerenciar todos, manter como está com validação explicit. Se intent é apenas PMB, adicionar `tenantId: pmbTenant.id` na clausula where. Recomenda-se primeira opcao com validacao explicit pois SUPER_ADMIN deve ter acesso global, mas auditar e logar claramente.
- **trecho:**

```
const student = await prisma.student.findUnique({
  where: { id },
  select: { id: true, status: true, tenantId: true },
})
if (!student) {
  return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
}
```
- **veredito adversarial:** CONFIRMADO — O endpoint POST /api/admin/alunos/[id]/bloquear seleciona um Student apenas por ID sem validar tenantId. O GET equivalente (linha 26 de [id]/route.ts) usa findFirst({where: {id, tenantId: pmbTenant.id}}) para validar propriedade. O POST valida apenas role === "SUPER_ADMIN" mas permite bloqueio de ANY student, incluindo de tenants revendedores. A ação é destrutiva (suspende matrículas ativas em lot

### 5. [Critico] IDOR em POST /api/admin/alunos/[id]/notify - Notificações Cross-Tenant ✅verificado→**Critico**
- **arquivo:linha:** `src/app/api/admin/alunos/[id]/notify/route.ts:29-35`
- **confiança (finder):** alta
- **descrição:** O endpoint POST de notificação de alunos usa `findUnique({ where: { id } })` (linha 29-31) sem validar tenantId. Um PMB_TEAM member pode enviar notificações para alunos de qualquer tenant. Comparar com GET que valida `where: { id, tenantId: pmbTenant.id }`. Isto permite spam ou notificações maliciosas direcionadas a alunos de competidores.
- **impacto:** Violação de privacidade e isolamento multi-tenant: notificações/broadcast não-autorizadas a alunos de tenants terceiros. Possível abuso para phishing ou disseminação de mensagens maliciosas.
- **correção:** Adicionar validação de tenant antes de chamar notifyStudent(): substituir por `findFirst({ where: { id, tenantId: pmbTenant.id } })` ou deletar silenciosamente se tenantId não corresponder.
- **trecho:**

```
const student = await prisma.student.findUnique({
  where: { id },
  select: { id: true },
})
if (!student) {
  return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
}
```
- **veredito adversarial:** CONFIRMADO — A vulnerabilidade IDOR é real e explorável. Confirmo: (1) POST /api/admin/alunos/[id]/notify usa findUnique(where: { id }) sem validação de tenantId (linha 29-31 do route.ts); (2) requirePmbTeam() valida apenas o role (PMB_SALES/PMB_RESELLER_MGR/SUPER_ADMIN), não o tenant, e a session retornada nunca é usada para validar isolamento; (3) notifyStudent() não faz validação de tenant (lib/students/man

### 6. [Critico] Admin PATCH alunos - findUnique sem validação de tenantId ✅verificado→**Critico**
- **arquivo:linha:** `src/app/api/admin/alunos/[id]/route.ts:138-141`
- **confiança (finder):** alta
- **descrição:** Rota PATCH /api/admin/alunos/[id] faz findUnique(id) SEM verificar se o student pertence ao PMB tenant. Um Super Admin pode editar qualquer student do sistema passando um ID válido de outro tenant.
- **impacto:** Escalação de privilégio total: qualquer admin PMB (SUPER_ADMIN, PMB_SALES, PMB_RESELLER_MGR) consegue editar/corromper dados de students de qualquer revendedor.
- **correção:** Adicionar `tenantId: pmbTenant.id` ao where do findUnique na linha 138. Ou manter findFirst(where: {id, tenantId: pmbTenant.id}) como feito no GET acima.
- **trecho:**

```
const exists = await prisma.student.findUnique({
  where: { id },
  select: { id: true },
})
if (!exists) return NextResponse.json(...)
```
- **veredito adversarial:** CONFIRMADO — A exploração é REALMENTE possível. O endpoint PATCH em /api/admin/alunos/[id] usa `prisma.student.findUnique({ where: { id } })` sem validar tenantId (linha 138-141 de route.ts). A função applyStudentEdit() também faz update sem cláusula WHERE de tenantId. Um admin PMB autenticado pode passar ANY student ID válido de outro tenant e editá-lo sem restrição. O GET endpoint no mesmo arquivo filtra cor

### 7. [Critico] IDOR em PATCH /api/admin/alunos/[id] - Escalonamento Cross-Tenant ✅verificado→**Critico**
- **arquivo:linha:** `src/app/api/admin/alunos/[id]/route.ts:138-144`
- **confiança (finder):** alta
- **descrição:** O endpoint PATCH de administrador para editar alunos não valida o tenantId do aluno antes de aplicar edições. Enquanto GET valida `where: { id, tenantId: pmbTenant.id }` (linha 26), PATCH apenas faz `findUnique({ where: { id } })` sem filtro de tenant (linhas 138-141). Isto permite que um PMB_TEAM member (PMB_SALES, PMB_RESELLER_MGR) edite dados (nome, email, cpf, phone, address) de alunos pertencentes a OTHER tenants, não apenas do PMB tenant institucional.
- **impacto:** Um PMB_SALES ou PMB_RESELLER_MGR pode corromper dados de alunos de qualquer tenant, incluindo tenants de revendedores concorrentes. Isto viola o isolamento multi-tenant garantindo que cada tenant veja apenas seus próprios dados.
- **correção:** Adicionar validação de tenantId: trocar `findUnique({ where: { id } })` por `findFirst({ where: { id, tenantId: pmbTenant.id } })` semelhante ao GET. Ou, caso o intent seja permitir PMB_TEAM editar qualquer aluno, documentar explicitamente na arquitetura.
- **trecho:**

```
const exists = await prisma.student.findUnique({
  where: { id },
  select: { id: true },
})
if (!exists) {
  return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
}
```
- **veredito adversarial:** CONFIRMADO — A vulnerabilidade IDOR é REAL e totalmente explorável. Análise completa:

ESTRUTURA DO CÓDIGO:
- Student model tem campo tenantId obrigatório (FK para Tenant)
- GET endpoint (linha 23-26) filtra corretamente: findFirst({ where: { id, tenantId: pmbTenant.id } })
- PATCH endpoint (linha 138-144) NÃO filtra: findUnique({ where: { id } }) - sem validação de tenantId

FLUXO VULNERÁVEL:
1. requirePmbTea

### 8. [Critico] Certificate issue - findUnique(enrollmentId) sem validação de tenantId ✅verificado→**Critico**
- **arquivo:linha:** `src/app/api/admin/certificates/issue/route.ts:36-39`
- **confiança (finder):** alta
- **descrição:** Rota POST /api/admin/certificates/issue aceita enrollmentId do body e faz findUnique(id) SEM validar tenantId. Admin PMB consegue gerar certificados válidos para qualquer enrollment de qualquer revendedor/student do sistema.
- **impacto:** Emissão de certificados fraudulentos: qualquer admin PMB consegue emitir certificados válidos para alunos que nunca completaram cursos, em tenants diferentes.
- **correção:** Adicionar validação: findFirst(where: {id, tenantId: null}) para cursos PMB, ou findFirst(where: {id, enrollment: {tenantId}}) para validar contra enrollment's tenantId.
- **trecho:**

```
const enrollment = await prisma.enrollment.findUnique({
  where: { id: parsed.data.enrollmentId },
  select: { id: true },
})
```
- **veredito adversarial:** CONFIRMADO — A vulnerabilidade é REAL e EXPLORÁVEL. A rota POST /api/admin/certificates/issue (linhas 36-39 do route.ts) faz findUnique(enrollmentId) sem validar tenantId. Um admin PMB_SALES ou PMB_RESELLER_MGR consegue emitir certificados válidos para matrículas de QUALQUER revendedor simplesmente passando um enrollmentId forjado no body. Comparação com code: a rota de revogação (revoke/route.ts linha 50) VAL

### 9. [Critico] Catálogo aluno - retorna Course global em vez de TenantCourse ✅verificado→**Critico**
- **arquivo:linha:** `src/app/api/aluno/catalogo/route.ts:14-35`
- **confiança (finder):** alta
- **descrição:** GET /api/aluno/catalogo lista courses da tabela Course (tenantId=null = cursos globais PMB) em vez de filtrar apenas courses que o student pode ver via sua loja. Student de uma loja consegue ver preços/conteúdo de courses de outras lojas ou courses bloqueados para seu tenant.
- **impacto:** Vazamento de informações: student consegue enumerar e acessar detalhes de todos os cursos globais do sistema, incluindo preços e descrições customizadas de courses bloqueados para seu tenant.
- **correção:** Mudar de Course para TenantCourse com filtro tenantId, OU aplicar visibilityFilter + tenantId para respeitar ALLOWLIST/DENYLIST. Usar listTenantCourses() da lib/tenant/courses.ts que já tem essa lógica.
- **trecho:**

```
const [courses, ownedEnrollments] = await Promise.all([
  prisma.course.findMany({
    where: { status: "ATIVO", hiddenMain: false },
    ...
  }),
  ...
])
```
- **veredito adversarial:** CONFIRMADO — A vulnerabilidade é EXPLORAVELMENTE REAL. O endpoint GET /api/aluno/catalogo retorna course.findMany({where: {status: "ATIVO", hiddenMain: false}}) SEM filtros de tenantId ou visibilityMode, permitindo students enumerate todos os cursos globais ignorando CourseVisibility.ALLOWLIST/DENYLIST e TenantCourse.isVisible. O codebase possui função visibilityFilter() correta em /src/lib/tenant/courses.ts a

### 10. [Critico] Painel bloquear aluno - findUnique após validação (race condition) ⚠️**REFUTADO/AJUSTADO→Baixo**
- **arquivo:linha:** `src/app/api/painel/alunos/[id]/bloquear/route.ts:39-41`
- **confiança (finder):** alta
- **descrição:** Rota POST bloqueia aluno. Faz findFirst(id, tenantId) validando tenant (linha 19-22) mas depois faz findUnique(id) SEM tenantId (linha 39-41). Entre essas queries, outro request pode ter movido o student para outro tenant ou deletado o record, causando TOCTOU (time-of-check/time-of-use).
- **impacto:** Race condition: revendedor consegue, em condição de race, bloquear access de student de outro tenant se o student for movido/sincronizado entre requests.
- **correção:** Reusar o student object da linha 19-22, ou fazer update() direto no studentId verificado. Evitar findUnique separado.
- **trecho:**

```
const student = await prisma.student.findFirst({
  where: { id, tenantId: ctx.tenantId },
  select: { id: true },
})
...
const updated = await prisma.student.findUnique({
  where: { id: student.id },  // AQUI: sem tenantId
  select: { id: true, status: true, apostila: true },
})
```
- **veredito adversarial:** REFUTADO/AJUSTADO (Baixo) — A finding descreve uma race condition TOCTOU onde um revendedor bloquearia access de student de outro tenant através de sincronização. Porém, análise do código revela: (1) não existe mecanismo no codebase que transfere/move students entre tenants; (2) Student.tenantId é imutável após criação (apenas onDelete Cascade); (3) o findFirst na linha 19-22 valida que student pertence ao ctx.tenantId do re

### 11. [Critico] Painel reset-password - chama resetStudentPassword sem tenantId ⚠️**REFUTADO/AJUSTADO→Baixo**
- **arquivo:linha:** `src/app/api/painel/alunos/[id]/reset-password/route.ts:27`
- **confiança (finder):** alta
- **descrição:** Rota POST /api/painel/alunos/[id]/reset-password valida que o student pertence ao tenantId (linha 19-22) mas depois chama resetStudentPassword(id) que NÃO recebe tenantId. Combinado com a vulnerabilidade em management.ts, permite resetar senha de aluno de outro tenant.
- **impacto:** Account takeover via revendedor: revendedor consegue resetar senha de aluno de outro tenant se conseguir o student ID.
- **correção:** Passar tenantId para resetStudentPassword() e validar dentro da função.
- **trecho:**

```
const student = await prisma.student.findFirst({
  where: { id, tenantId: ctx.tenantId },
  select: { id: true },
})
if (!student) ...

const result = await resetStudentPassword(id)  // AQUI: sem tenantId
```
- **veredito adversarial:** REFUTADO/AJUSTADO (Baixo) — A rota POST /api/painel/alunos/[id]/reset-password realiza validação crítica ANTES de chamar resetStudentPassword(). Na linha 19-22 do route.ts, executa: `prisma.student.findFirst({where: {id, tenantId: ctx.tenantId}})`. Se o revendedor tentar explorar com um ID de aluno de outro tenant, esse findFirst retornará null e a rota retornará erro 404 na linha 24, impedindo a chamada para resetStudentPas

### 12. [Critico] Geração de código de cupom com Math.random() - Previsível ⚠️**REFUTADO/AJUSTADO→FalsoPositivo**
- **arquivo:linha:** `src/app/api/painel/cupons/generate-code/route.ts:8-14`
- **confiança (finder):** alta
- **descrição:** A função randomCode() usa Math.random() para gerar códigos de cupom, que é um PRNG fraco e previsível. Um atacante pode adivinhar códigos de cupom gerando sequências de números aleatórios do Math.random() com seed similar.
- **impacto:** Atacante pode forjar códigos de cupom válidos, aplicar descontos não autorizados a qualquer compra, causar perda de receita direta.
- **correção:** Usar crypto.randomBytes() ao invés de Math.random(). Exemplo: const code = crypto.randomBytes(5).toString('hex').substring(0, 10).toUpperCase(); ou para manter alfabeto: const bytes = crypto.randomBytes(10); const code = bytes.reduce((s, b) => s + ALPHABET[b % ALPHABET.length], '');
- **veredito adversarial:** REFUTADO/AJUSTADO (FalsoPositivo) — A finding alega que atacantes podem adivinhar códigos de cupom usando Math.random(), mas isto ignora três camadas críticas de proteção: (1) Autenticação obrigatória via requireResellerSession() - sem credenciais válidas é impossível chamar generate-code; (2) Isolamento por tenant via unique constraint [tenantId, code] - cada revendedor tem namespace isolado e cupons PMB (tenantId=null) são listado

### 13. [Critico] loadShowcase() e funções de catálogo - retornam Course sem tenantId ✅verificado→**Critico**
- **arquivo:linha:** `src/lib/catalog/home.ts:284-330`
- **confiança (finder):** alta
- **descrição:** Funções loadShowcase(), loadCurated(), loadByCategoria(), loadCatalogo() retornam cursos da tabela Course (sem tenantId) quando chamadas de /loja/page.tsx que TEM tenant.id disponível. Qualquer vitrine consegue listar/exibir cursos de outras vitrines ou cursos não habilitados para seu tenant.
- **impacto:** Vazamento cross-tenant de catálogo: vitrines conseguem exibir em seus storefronts (herói banner, seções) cursos que não possuem permissão (visibilityMode=DENYLIST ou course não vinculado à sua TenantCourse).
- **correção:** Adicionar parâmetro tenantId às funções. Mudar de Course.findMany() para TenantCourse.findMany(where: {tenantId, ...}) e respectiva visibilityFilter.
- **trecho:**

```
export async function loadShowcase(): Promise<ShowcaseCard[]> {
  try {
    const rows = await prisma.course.findMany({
      where: {
        status: "ATIVO",
        hiddenMain: false,
        destaque: true,
        capaImageUrl: { not: null },
      },
```
- **veredito adversarial:** CONFIRMADO — A vulnerabilidade é REAL e CRÍTICA. As funções loadShowcase(), loadCurated(), loadByCategoria() e loadCatalogo() em /src/lib/catalog/home.ts queryam a tabela Course SEM aplicar o visibilityFilter(tenantId). Comparando com getTenantCourseBySlug() (que APLICA corretamente), é claro que essas funções carecem da validação. A função pickRandomCourseIds() em /src/lib/home/sections.ts recebe tenantId mas

### 14. [Critico] Ausência de validação de timestamp no webhook HMAC - Replay Attack ✅verificado→**Alto**
- **arquivo:linha:** `src/lib/mercadopago/webhook.ts:19-42`
- **confiança (finder):** alta
- **descrição:** A função validateMpWebhookSignature() valida apenas o HMAC SHA256 usando x-signature e x-request-id, mas NÃO valida o timestamp (ts) extraído de x-signature. Segundo a documentação do MP, o timestamp deve ser validado para rejei­tar webhooks antigos/repetidos. Um atacante que capture um webhook válido pode reenviá-lo indefinidamente sem ser detectado, causando processamentos duplicados apesar da idempotência via mpPaymentId (defesa em profundidade falha).
- **impacto:** Um atacante sem acesso ao MP_WEBHOOK_SECRET pode reenviar um webhook capturado N vezes, causando processamento duplicate de pagamentos. Embora haja proteção via `mpPaymentId UNIQUE`, a duplicação de processamento (mesmo que silenciosa no DB) engatilha notificações, emails e operações side-effect múltiplas vezes.
- **correção:** Implementar validação de timestamp comparando (now - ts) <= TOLERANCE_SECONDS (ex: 300s). Rejeitar com 401 se fora da janela. Exemplo: `const now = Math.floor(Date.now() / 1000); if (Math.abs(now - parseInt(ts)) > 300) return false;` após parsear `ts` de x-signature. Testar casos extremos (relógio dessincronizado em 5min).
- **trecho:**

```
const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`
const computed = createHmac('sha256', secret).update(manifest).digest('hex')
if (computed.length !== hash.length) return false
return timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'))
// ❌ ts não é comparado com Date.now()
```
- **veredito adversarial:** CONFIRMADO — A vulnerabilidade de Replay Attack é CONFIRMADA mas com severidade AJUSTADA de Critico para ALTO.

CONFIRMAÇÃO DA EXPLORAÇÃO:
1. A função validateMpWebhookSignature() (webhook.ts:19-42) extrai o timestamp (ts) do header x-signature mas NUNCA valida se ele está dentro de uma janela de tempo aceitável
2. Um atacante que capture um webhook válido (assinado legitimamente com o HMAC correto) pode reenv

### 15. [Critico] applyStudentEdit - findUnique sem validação de tenantId ✅verificado→**Critico**
- **arquivo:linha:** `src/lib/students/management.ts:39-59`
- **confiança (finder):** alta
- **descrição:** Função applyStudentEdit(studentId, data) chamada por rotas admin recebe apenas studentId e não recebe tenantId como parâmetro. Faz update() direto sem validar que o student pertence ao tenant da sessão. Qualquer rota que chame isso com ID forjado consegue editar dados de outro tenant.
- **impacto:** Data corruption cross-tenant: modificação de nome, email, CPF, endereço, data de nascimento de estudantes de tenants diferentes via qualquer rota que chame applyStudentEdit.
- **correção:** Adicionar parâmetro tenantId obrigatório à função. Validar onde: {id: studentId, tenantId} antes do update.
- **trecho:**

```
export async function applyStudentEdit(
  studentId: string,
  data: EditStudentInput,
): Promise<void> {
  await prisma.student.update({
    where: { id: studentId },
    data: { ... }
  })
}
```
- **veredito adversarial:** CONFIRMADO — A vulnerabilidade é REAL e EXPLORADA facilmente. Na rota PATCH `/api/admin/alunos/[id]` (linhas 115-156 do arquivo /Users/lucasaraujo/Documents/Projetos Git/Profissionaliza-Mais-Brasil/src/app/api/admin/alunos/[id]/route.ts), existe uma falha CRÍTICA de validação de tenant: (1) a rota autentica com `requirePmbTeam()` que é a equipe PMB central; (2) a validação de existência do student usa `findUni

### 16. [Critico] resetStudentPassword - findUnique(studentId) sem tenantId ✅verificado→**Critico**
- **arquivo:linha:** `src/lib/students/management.ts:114-178`
- **confiança (finder):** alta
- **descrição:** Função resetStudentPassword(studentId) faz findUnique(studentId) SEM receber tenantId como parâmetro. Qualquer rota que chame isso consegue resetar senha de student de qualquer tenant passando um ID válido.
- **impacto:** Account takeover: revendedor consegue resetar senha de aluno de outro tenant, recebendo a senha temporária via email se tiver acesso ao email do aluno, ou bloqueando acesso ao aluno.
- **correção:** Adicionar parâmetro tenantId obrigatório. Validar where: {id: studentId, tenantId} antes de resetar.
- **trecho:**

```
export async function resetStudentPassword(
  studentId: string,
): Promise<ResetPasswordResult | { error: string }> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },  // AQUI: sem tenantId
    select: {
      id: true,
      nome: true,
      email: true,
      tenant: { select: { slug: true, name: true } },
    },
  })
```
- **veredito adversarial:** CONFIRMADO — A vulnerabilidade é REAL no endpoint /api/admin/alunos/[id]/reset-password. A função resetStudentPassword(studentId) é chamada sem validação de tenantId, e um PMB_RESELLER_MGR (account manager) pode resetar senha de qualquer student no sistema descobrindo seu ID. Porém, o endpoint /api/painel/alunos/[id]/reset-password está PROTEGIDO pois faz findFirst({ id, tenantId: ctx.tenantId }) antes de cham

### 17. [Alto] Paginação sem limite máximo absoluto (DoS potencial) ⚠️**REFUTADO/AJUSTADO→FalsoPositivo**
- **arquivo:linha:** `/src/app/api/admin/vendas/route.ts:34`
- **confiança (finder):** alta
- **descrição:** O parâmetro 'limit' é limitado a 200 via Math.min(Number(...), 200), porém Number() converte strings não-numéricas para NaN, e Math.min(NaN, 200) retorna 200. Se um atacante enviar limit=NaN, limit=Infinity, ou limit=undefined (defaulting sem validação), a query Prisma take não é limitada adequadamente em cenários edge.
- **impacto:** Potencial DoS ao forçar queries grandes sem limite, consumindo memória e CPU do servidor. Embora Math.min(NaN, 200) = 200, a falta de validação Zod explícita deixa a lógica frágil.
- **correção:** Use Zod com z.coerce.number().int().min(1).max(200) para garantir que 'limit' é sempre número válido, rejeitando NaN/Infinity. Exemplo: const schema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }). Isso garante type safety e rejeita payloads malformados cedo.
- **veredito adversarial:** REFUTADO/AJUSTADO (FalsoPositivo) — A vulnerabilidade alegada contém um erro fundamental: Math.min(NaN, 200) retorna NaN, não 200. Embora seja verdade que falta validação Zod no parâmetro 'limit', o Prisma.findMany() rejeitará 'take: NaN' durante sua validação de schema, resultando em um erro de tipo em vez de uma query sem limite. Portanto, a exploração de DoS descrita não é executável. A falta de validação é um issue de código lim

### 18. [Alto] Enumeração de Payment IDs em pay-card endpoint (mesmo risco que GET /cobranca/[id]) ✅verificado→**Alto**
- **arquivo:linha:** `/src/app/api/cobranca/[paymentId]/pay-card/route.ts:39-41`
- **confiança (finder):** media
- **descrição:** POST /api/cobranca/[paymentId]/pay-card também usa isKnownAsaasPayment() com rate-limit 20/min. Permite tentativa de pagamento com cartão falso para enumeração. Atacante pode descobrir quais paymentIds existem testando pagamentos fictícios.
- **impacto:** Mesma enumeração que GET. Pior: cada tentativa de pagamento falso deixa log e potencialmente causa webhook. Information disclosure de payment IDs válidos.
- **correção:** Mesma correção: exigir payment token. Rate-limit agressivo (5/min global) para POST também. Adicionar CAPTCHA se fizer sentido para endpoint público.
- **trecho:**

```
if (!(await isKnownAsaasPayment(paymentId))) {
  return 404
}
// Rate-limit insuficiente para POST
```
- **veredito adversarial:** CONFIRMADO — A enumeração de paymentIds é EXPLORÁVEL. A função isKnownAsaasPayment() é chamada na linha 39 ANTES de validar o body, permitindo testar IDs sem enviar dados válidos. O rate-limit é de 5/min (não 20 como alegado), insuficiente para impedir enumeração distribuída. Endpoints são públicos (por design, para permitir checkout sem auth). O risco é REAL: atacante pode descobrir IDs de cobrança válidos co

### 19. [Alto] Enumeração de Payment IDs via rate-limit inadequado (IDOR mitigado mas incompleto) ✅verificado→**Medio**
- **arquivo:linha:** `/src/app/api/cobranca/[paymentId]/route.ts:1-45`
- **confiança (finder):** media
- **descrição:** GET /api/cobranca/[paymentId] valida ownership via isKnownAsaasPayment() que confirma paymentId existe em (Payment ou TenantPayment). Rate-limit de 20/min por IP bloqueia varredura automatizada. MAS: (1) rate-limit por IP é bypassável com proxies (2) TODO comentário em linha 7 reconhece que 'token por cobrança' seria defesa ideal (3) mensagem de erro 404 é genérica, não revela propriedade. Risco residual: enumeration lento é possível.
- **impacto:** Atacante com paciência + múltiplos IPs pode enumerar estrutura de paymentIds existentes. Taxa de descoberta é reduzida a ~1 payment/min/IP, viável para descoberta de pattern. Não é leitura direta (404 bloqueia) mas é information disclosure.
- **correção:** Implementar 'payment token' gerado no momento da criação: gerar JWT/HMAC(paymentId + SECRET) válido por 24h, requerê-lo em acesso público (/api/cobranca). Token é enviado por email/SMS ao pagador. Valor está em: (1) nega enumeração totalmente (2) rate-limit continua como defesa em profundidade (3) alinha com TODO do código.
- **trecho:**

```
// TODO(segurança): a defesa ideal seria um token assinado por cobrança
// emitido no momento da criação da cobrança e validado aqui
if (!(await isKnownAsaasPayment(paymentId))) {
  return 404  // genérico, mas enumeration é possível
```
- **veredito adversarial:** CONFIRMADO — A enumeração de Payment IDs via múltiplos IPs é realmente possível e exploração lenta é viável (20 reqs/min/IP com proxies rotativos). Porém a severidade é MÉDIA, não ALTA, porque: (1) A informação divulgada é apenas existência do ID, sem acesso a dados sensíveis (IDOR já mitigado via 404 genérico). (2) Rate limit por IP efetivamente inviabiliza automação em larga escala - enumeração requer paciên

### 20. [Alto] IDOR em POST /api/admin/alunos/[id]/reset-password - Password Reset Cross-Tenant ✅verificado→**Alto**
- **arquivo:linha:** `src/app/api/admin/alunos/[id]/reset-password/route.ts:13`
- **confiança (finder):** alta
- **descrição:** O endpoint POST que reseta senha de aluno chama `resetStudentPassword(id)` (linha 13) sem validar tenantId antes. A funcao resetStudentPassword (management.ts) tambem não valida tenant, apenas busca o aluno por id. Um PMB_TEAM member pode resetar senha de qualquer aluno.
- **impacto:** Account takeover potencial: reset de senha de alunos de outros tenants, permitindo acesso não-autorizado as contas de estudantes em plataformas concorrentes.
- **correção:** Validar tenantId antes de chamar resetStudentPassword. Exemplo: adicionar verificação `const student = await prisma.student.findFirst({ where: { id, tenantId: pmbTenant.id }, select: { id: true } }); if (!student) return 404;` Então chamar `resetStudentPassword(id)`.
- **trecho:**

```
const result = await resetStudentPassword(id)
```
- **veredito adversarial:** CONFIRMADO — A exploração é REAL e exploável. O endpoint POST /api/admin/alunos/[id]/reset-password valida somente autenticação (requirePmbTeam) mas NÃO valida tenantId antes de chamar resetStudentPassword(id). A função resetStudentPassword faz findUnique({ where: { id } }) sem filtrar por tenantId, permitindo que um PMB_TEAM member resete a senha de QUALQUER student, inclusive de outros tenants/revendedores. 

### 21. [Alto] Defesa anti-bot fraca em ambiente não-produção ⚠️**REFUTADO/AJUSTADO→Baixo**
- **arquivo:linha:** `src/app/api/webhooks/mercadopago/route.ts:52-57`
- **confiança (finder):** media
- **descrição:** A validação de x-signature e x-request-id é pulada quando NODE_ENV !== 'production' (linhas 54). Isto permite que em preview/staging mal-configurados um atacante envie webhooks MP válidos SEM assinatura, ativando pagamentos forjados. Embora haja log.warn(), o webhook é processado (status 200) e pode efetuar matching de enrollment.
- **impacto:** Em staging/preview compartilhado ou exposto, um atacante consegue forjar webhooks MP aprovando matrículas sem pagamento. Embora require external_reference correto (defesa em profundidade), a janela de ataque existe.
- **correção:** Require x-signature + x-request-id em TODOS os ambientes, sem exceção. Remover condição NODE_ENV === 'production'. Se necessário dev-local ngrok testing, usar MP_WEBHOOK_DEV_BYPASS=1 + INTERNAL_SECRET para garantir que bypass NUNCA ocorre silenciosamente.
- **trecho:**

```
if (process.env.NODE_ENV === 'production' && (!xSignature || !xRequestId)) {
    log.warn(...)
    return NextResponse.json({error: 'missing signature'}, {status: 401})
}
// ❌ Em staging, webhook sem assinatura passa direto
```
- **veredito adversarial:** REFUTADO/AJUSTADO (Baixo) — FALSO POSITIVO. A vulnerabilidade descrita não é explorável para "forjar webhooks MP aprovando matrículas sem pagamento" como alegado.

CONFIRMADO (defesa fraca em design):
- route.ts linha 54 pula validação de x-signature/x-request-id quando NODE_ENV !== "production"
- Webhooks mal-formados chegam até processMpWebhook em staging/preview
- log.warn() não bloqueia processamento

NÃO EXPLORÁVEL (def

### 22. [Alto] CSRF em operações POST autenticadas com sameSite=lax ⚠️**REFUTADO/AJUSTADO→FalsoPositivo**
- **arquivo:linha:** `src/lib/auth.ts:63-72`
- **confiança (finder):** alta
- **descrição:** NextAuth configurado com sameSite=lax permite que cookies de sessão sejam enviados em POST cross-site (por design do padrão). Qualquer formulário POST autenticada pode ser explorada via CSRF. Exemplo: DELETE de cursos (/api/painel/cursos/[id]), modificação de config de vitrine (/api/painel/vitrine/upload), alteração de equipe (/api/painel/equipe/[id]).
- **impacto:** Um atacante pode enganar um revendedor autenticado para deletar cursos, modificar preços, mudar banner/logo, remover membros da equipe ou realizar outras operações mutáveis sem seu consentimento.
- **correção:** Implementar proteção CSRF explícita: (1) Gerar e validar CSRF tokens em operações de state-change (POST/PUT/DELETE), armazenar no request context JWT ou cookie separado; (2) Validar Origin/Referer header para rotas críticas; (3) Considerar mudar sameSite para 'Strict' em produção (quebrará legítimos cross-site navigations); (4) Usar fetch com credentials: 'include' apenas em aplicação interna.
- **trecho:**

```
sameSite: "lax",
    path: "/",
    secure: isProd,
```
- **veredito adversarial:** REFUTADO/AJUSTADO (FalsoPositivo) — A finding descreve corretamente a configuração sameSite=lax em src/lib/auth.ts:68, que teoricamente permite cookies em POST cross-site. No entanto, todos os endpoints mutáveis (/api/painel/cursos/[id], /api/painel/equipe/[id], /api/painel/vitrine/upload) são chamados EXCLUSIVAMENTE via fetch() com Content-Type: application/json desde o frontend (equipe-painel-client.tsx:112, course-edit-drawer.tsx

### 23. [Medio] IDOR Atenuado: Admin Certificate Revoke com validação limitada de tenantId
- **arquivo:linha:** `/src/app/api/admin/certificates/[id]/revoke/route.ts:37-55`
- **confiança (finder):** media
- **descrição:** POST /api/admin/certificates/[id]/revoke valida tenantId em linha 50, MAS apenas para bloquear PMB_SALES/PMB_RESELLER_MGR de revogar certs de revendedores. SUPER_ADMIN pode revogar qualquer certificado (incluindo de outros tenants). Cenário: SUPER_ADMIN A revogar certificado de SUPER_ADMIN B (ambos admins mas em contextos diferentes).
- **impacto:** SUPER_ADMIN de um tenant pode revogar certificados emitidos por outro tenant, invalidando documentação de alunos estrangeiros. Atenuado porque SUPER_ADMIN é papel global, não scoped por tenant como RESELLER.
- **correção:** Aplicar mesma lógica de painel/certificates/[id]/revoke linha 47: if (cert.tenantId !== ctx.tenantId && ctx.role === 'PMB_RESELLER_MGR') return 403. OU se SUPER_ADMIN deve revogar cross-tenant, documentar explicitamente e adicionar audit log muito verboso.
- **trecho:**

```
if (cert.tenantId !== null && ctx.role !== 'SUPER_ADMIN') {
  return 403
}
// SUPER_ADMIN passa sem validação de tenant
```

### 24. [Medio] Mesma vulnerabilidade: cálculo float de desconto sem helper centralizado
- **arquivo:linha:** `/src/app/api/admin/cupons/validate/route.ts:73-74`
- **confiança (finder):** media
- **descrição:** Linha 73-74 repete o cálculo: (basePrice * Number(coupon.discountValue)) / 100. Código similar está em 3+ rotas (cupons/validate, loja/cupom/validar, admin/vendas). Cada uma faz arredondamento diferente ou em pontos diferentes.
- **impacto:** Divergência de centavos entre validação (resposta para cliente) e faturamento (BD). Cliente vê desconto X, mas cobrança é X±0.01 em casos extremos.
- **correção:** Centralizar cálculo em lib/coupons/discount.ts:applyCouponDiscount(). Todas as rotas devem chamar este helper. Ele já usa Prisma.Decimal internamente (confirmado linha 201-204 em loja/checkout/route.ts).

### 25. [Medio] Parâmetro 'days' sem validação Zod, cálculo não-seguro
- **arquivo:linha:** `/src/app/api/admin/referrals/commissions/export/route.ts:93`
- **confiança (finder):** media
- **descrição:** Linhas 92-98: const days = Number(daysParam); if (Number.isFinite(days) && days > 0). Se daysParam='0' ou daysParam='-999', Number.isFinite retorna true e check days > 0 rejeita, mas logic é redundante. Se daysParam='1e308', Number converte para Infinity (Number.isFinite(Infinity) = false, OK). Porém sem Zod: não há schema explícito, permitindo parse de valores edge.
- **impacto:** Bajo: rejeição funciona por sorte (Number.isFinite + days > 0). Mas frágil — mudanças futuras podem quebrar. Exports podem ficar lentos se days=Infinity passa.
- **correção:** Usar Zod: z.object({ daysParam: z.coerce.number().int().min(1).max(365).optional() }). Ou validar explicitamente antes de usar.

### 26. [Medio] Cap de desconto em flutuante sem precisão
- **arquivo:linha:** `/src/app/api/admin/vendas/route.ts:310-312`
- **confiança (finder):** media
- **descrição:** Linhas 310-312: const cap = ... ; const effectivePct = (applied.discountAmount / basePrice) * 100; if (effectivePct > cap + 0.01). Usa float para cálculo percentual. Com valores grandes (ex: basePrice=999.99, discountAmount=500), effectivePct pode ter erro de précision. A margem 0.01 (1 centavo) é arbitrária e não garante segurança da validação.
- **impacto:** PMB_SALES com cap 50% pode conseguir aplicar 50.02% (passa a margem) através de cálculo float. Fura restrição de permissão.
- **correção:** Usar Prisma.Decimal para calcular percentual com precisão: const pct = new Decimal(applied.discountAmount).dividedBy(new Decimal(basePrice)).times(100); if (pct.greaterThan(cap)) { reject; }. Ou usar biblioteca Decimal.js.

### 27. [Medio] Cálculo de desconto com float sem arredondamento consistente
- **arquivo:linha:** `/src/app/api/loja/cupom/validar/route.ts:131`
- **confiança (finder):** media
- **descrição:** Na linha 131, discountAmount = (basePrice * discountValue) / 100 usa aritmética float diretamente. Depois na linha 145 usa Number(discountAmount.toFixed(2)), mas a resposta pode divergir de valores salvos no BD que usam Prisma.Decimal. Exemplo: 100 * 33 / 100 = 33.00000000001 em float.
- **impacto:** Centavos perdidos/ganhos em descontos em operações repetidas. Embora individual pareça menor, volumes altos podem resultar em dinheiro não contabilizado. Viola auditoria financeira.
- **correção:** Usar o helper applyCouponDiscount(...) centralizado (que já usa Prisma.Decimal internamente, linha 198 em /loja/checkout/route.ts). Remover cálculo manual: use const calc = applyCouponDiscount({basePrice, discountType, discountValue}) para garantir consistência com outras rotas (/checkout, /admin/vendas, etc).

### 28. [Medio] React Markdown sem sanitização adicional (defense-in-depth)
- **arquivo:linha:** `src/app/(main)/privacidade/page.tsx:27`
- **confiança (finder):** media
- **descrição:** React Markdown v10 é usado sem plugins rehype-sanitize ou allowedElements. Embora v10 desabilite HTML por padrão (seguro), não há camada adicional de sanitização explícita. Se um upstream atualizar markdown com HTML, ou se houver refatoração futura para v9/v8, o risco reaparece.
- **impacto:** Baixo (v10 é seguro por padrão). Risco futuro de XSS persistente se markdown for gerado dinamicamente (atualmente é estático, lido de arquivo). Risco de regressão se dependência for downgraideada.
- **correção:** Adicionar plugin rehype-sanitize com whitelist explícita: <ReactMarkdown rehypePlugins={[[rehypeSanitize, { allowedElements: ['p', 'a', 'strong', 'em', 'ul', 'ol', 'li'] }]]} />. Documentar que markdown estático é seguro e não permite markup dinâmico.
- **trecho:**

```
<ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
```

### 29. [Medio] Falta defesa em profundidade em end-impersonation
- **arquivo:linha:** `src/app/api/admin/end-impersonation/route.ts:14-88`
- **confiança (finder):** media
- **descrição:** O endpoint POST valida a integridade do flag HMAC e do JWT backup, mas não chama requireAdminSession() no início para validar que o usuário ATUAL está autenticado como admin. A validação de HMAC é suficiente para evitar forjamento simples do flag, e o JWT garante o backup é válido, mas falta camada adicional de autenticação.
- **impacto:** Reduz defesa em profundidade. Um atacante com XSS que conseguisse forjar um novo flag HMAC (tem acesso ao AUTH_SECRET no contexto JS) poderia explorar a falta de verificação inicial. Risco: escalação a partir de vulnerabilidade XSS em sub-domínios ou contextos onde Auth_SECRET é exposto.
- **correção:** Adicione `const guard = await requireAdminSession(); if (!guard.ok) return guard.response;` no início da função, após a validação do flag HMAC. Isto garante defesa em profundidade: validação do flag + validação de sessão ativa.
- **trecho:**

```
export const POST = withRequestContext(
  { action: "admin.end_impersonation" },
  async () => {
    const log = contextLogger()
    const cookieStore = await cookies()
    const flag = decodeImpersonationFlag(...)
    if (!flag) { ... }
    // FALTA: const guard = await requireAdminSession();
    const backup = cookieStore.get(IMPERSONATION_BACKUP_COOKIE)
    ...
```

### 30. [Medio] Falta de Proteção contra Elevação de Maxdiscount em /api/painel/equipe/[id]
- **arquivo:linha:** `src/app/api/painel/equipe/[id]/route.ts:14-17`
- **confiança (finder):** media
- **descrição:** No endpoint PATCH de painel/equipe/[id], a schema valida apenas maxDiscount (0-100) e status, não permitindo alterar role. A validação de tenantId está correta (linha 41). A vulnerabilidade é POTENCIAL: se um consultor pudesse editar seu próprio membershipId (conhecido), poderia tentar incrementar maxDiscount. Análise mostra schema é whitelist (correto), mas recomenda auditoria de como membershipId é descoberto/exposto.
- **impacto:** Se um consultor descobrir seu próprio membershipId, poderia aumentar seu cap de desconto além do permitido via PATCH. Violação de controle de negócio.
- **correção:** Schema está bem-definido (whitelist). Confirmar que membershipId NÃO é sequencial/previsível. Se expostos via API GET /api/painel/equipe, validar que são opacos ou criptografados. Manter auditoria de quem altera maxDiscount.
- **trecho:**

```
const patchSchema = z.object({
  maxDiscount: z.number().int().min(0).max(100).nullable().optional(),
  status: z.enum(["ATIVO", "INATIVO"]).optional(),
})
```

### 31. [Medio] Shuffle de cursos em seção aleatória com Math.random() - Não criptograficamente seguro
- **arquivo:linha:** `src/lib/home/sections.ts:estimado ~110-120`
- **confiança (finder):** media
- **descrição:** Fisher-Yates shuffle implementado com Math.random() para embaralhar courseIds em seções de home aleatórias. Enquanto menos crítico que cupons (não gera ativos de negócio diretos), o shuffle é previsível e pode ser explorado para viés de exibição.
- **impacto:** Atacante pode prever qual curso será exibido em primeira posição de uma seção aleatória, permitindo manipulação de métricas de clique/conversão ou biasing de exibição de determinados cursos.
- **correção:** Usar crypto.randomBytes() para gerar índice: const randomIndex = crypto.randomBytes(4).readUInt32BE(0) % (i + 1);

### 32. [Medio] MP_WEBHOOK_DEV_BYPASS permite desativar HMAC sem detecção óbvia
- **arquivo:linha:** `src/lib/mercadopago/process.ts:273-283`
- **confiança (finder):** media
- **descrição:** O bypass exige MP_WEBHOOK_DEV_BYPASS=1 + NODE_ENV !== 'production', mas é ativado silenciosamente com log.warn(). Em staging onde alguém acidentalmente deixa ambas as flags ativas, toda validação HMAC é desativada. O comentário menciona isso, mas não há hardstop ou erro crítico.
- **impacto:** Se ambas as flags forem ativadas em staging/preview, webhooks MP são processados sem validação de assinatura. Risco baixo se as variáveis forem properly versionadas, mas detecção de anomalia é baseada em log inspection.
- **correção:** Adicionar notificação error-level ao contexto logger e/ou throw Exception em produção if MP_WEBHOOK_DEV_BYPASS é detectado. Ou require HMAC em todos os ambientes sempre (preferido). Se bypass for necessário, exigir que esteja EXPLICITAMENTE documentado no .env em comentário bold e monitorar alertas de log.
- **trecho:**

```
const explicitBypass = process.env.MP_WEBHOOK_DEV_BYPASS === '1' && process.env.NODE_ENV !== 'production'
if (!explicitBypass) {
    await markLog(logId, false, 'MP_WEBHOOK_SECRET ausente — request rejeitado')
    return
}
contextLogger().warn({...}, 'MP_WEBHOOK_DEV_BYPASS ativo — validação de HMAC pulada (apenas dev)')
```

### 33. [Medio] Validação de HMAC sem verificação de tamanho de buffer antes de timingSafeEqual
- **arquivo:linha:** `src/lib/mercadopago/webhook.ts:estimado ~15-25`
- **confiança (finder):** media
- **descrição:** Na função validateMpWebhookSignature(), há check 'if (computed.length !== hash.length) return false;' mas os buffers são criados a partir de strings hex sem garantir encoding consistente. Se 'hash' vier com padding ou espaços não-trimados, o comparison poderia falhar falsos negativos.
- **impacto:** Webhooks válidos do Mercado Pago poderiam ser rejeitados se houver variação no encoding, causando enrollments não processadas. Ou, em edge case, HMAC inválidos poderiam ser aceitos se houver bug no parsing.
- **correção:** Adicionar trim() e validação de hex: const hash = parts.v1?.trim(); if (!ts || !hash || !/^[0-9a-f]{64}$/i.test(hash)) return false; Manter timingSafeEqual como está (já correto).

### 34. [Baixo] Course obtido sem validação de visibilidade no tenant (design, não vulnerabilidade crítica)
- **arquivo:linha:** `src/app/api/aluno/comprar/route.ts:66-78`
- **confiança (finder):** media
- **descrição:** Rota /api/aluno/comprar busca Course via findUnique sem validar que Course está vinculado/visível no Tenant do aluno. Porém, análise de contexto mostra que: (1) Cursos compartilhados PMB têm status=ATIVO + hiddenMain=false, (2) courseIds vêm de /api/aluno/catalogo que também filtra globalmente, (3) TenantCourse.price só é usado em vendas de revendedor (/painel/vendas). Enrollment criado com tenantId=null (compra direta PMB, não de revendedor).
- **impacto:** Nenhum (design intencional). Aluno PODE comprar qualquer Course PMB global se souber o courseId, mas isso é o comportamento esperado — catálogo é global, preço também.
- **correção:** Documentar a arquitetura: Cursos compartilhados (Course) vs cursos de revendedor (TenantCourse + custom pricing). Adicionar comentário em findUnique explicando que Course é global.
- **trecho:**

```
prisma.course.findUnique({
      where: { id: parsed.data.courseId },
```

### 35. [Baixo] Crons implementam autenticação Bearer correta - sem findings críticos
- **arquivo:linha:** `src/app/api/cron/cleanup-webhook-logs/route.ts, src/app/api/cron/reactivate-paid/route.ts, src/app/api/cron/sweep-tenants-overdue/route.ts, src/app/api/cron/referral-monthly-payout/route.ts, src/app/api/cron/sweep-abandoned-leads/route.ts, src/app/api/cron/sweep-students-overdue/route.ts, src/app/api/cron/sync-cursos/route.ts, src/app/api/cron/sync-progresso/route.ts:varies (all call isCronAuthorized)`
- **confiança (finder):** alta
- **descrição:** Todos os 8 crons verificam isCronAuthorized() ANTES de executar lógica sensível. A função usa timingSafeEqual() para comparar CRON_SECRET. Implementação é sólida: falha fechado (retorna false se env não está definida), rejeita com 401.
- **impacto:** Nenhum risco crítico identificado. Crons estão bem protegidos. Se CRON_SECRET não estiver definido ou for vazio, todos os crons retornam 401.
- **correção:** Nenhuma ação necessária. Considerar adicionar rate-limiting por IP se crons forem invocados via webhook externo (Vercel Cron, ex-terceiros), mas estado atual é seguro.
- **trecho:**

```
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = request.headers.get('authorization') ?? ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : header
  if (!bearer) return false
  return safeEqual(bearer, secret)
}
```

### 36. [Baixo] Rotas internas implementam autenticação INTERNAL_SECRET corretamente
- **arquivo:linha:** `src/app/api/internal/resolve-tenant/route.ts:27-29, 44-51`
- **confiança (finder):** alta
- **descrição:** resolve-tenant/ verifica isInternalAuthorized() usando x-internal-secret header com timingSafeEqual(). Rate-limit defense-in-depth implementado (60 req/min). Sanitização de slug/domain via regex. Nenhum vazamento de dados de tenant não-autorizado (404 generic).
- **impacto:** Nenhum risco crítico. A rota está bem protegida contra enumeração e tampering.
- **correção:** Nenhuma ação necessária. Considerar documentar o rate-limit (60/min) em comentário se vier a ser publicado.
- **trecho:**

```
if (!isInternalAuthorized(request)) {
    return NextResponse.json({error: 'unauthorized'}, {status: 401})
}
const rl = await rateLimit(request, {name: 'internal-resolve', limit: 60, windowSec: 60})
```

### 37. [Baixo] Verificação de autenticação inline em vez de usar helper
- **arquivo:linha:** `src/app/api/painel/config/billing-mode/route.ts:15-22`
- **confiança (finder):** alta
- **descrição:** Vários endpoints em /painel reedeclaream a lógica de verificação de autenticação inline via `const session = await auth()` em vez de usar o helper centralizado `requireResellerSession()`. Exemplos: config/billing-mode/route.ts, config/connect-mp/route.ts. A validação é correta, mas o padrão é inconsistente com rotas que usam helpers.
- **impacto:** Reduz consistência e manutenibilidade. Código duplicado em múltiplos endpoints aumenta risco de alguém esquecer de validar tenantId ou role em uma nova rota.
- **correção:** Padronize: importe e use `requireResellerSession()` no início de todos os endpoints /painel que servem revendedores. Exemplo: const ctx = await requireResellerSession(); if (!ctx) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 }); Depois use ctx.tenantId e ctx.userId.
- **trecho:**

```
const session = await auth()
if (
  !session?.user ||
  session.user.role !== 'RESELLER' ||
  !session.user.tenantId
) {
  return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
}
```

### 38. [Baixo] Reimplementação de helper de autenticação (DRY violation)
- **arquivo:linha:** `src/app/api/painel/config/route.ts:13-22`
- **confiança (finder):** alta
- **descrição:** A função requireResellerSession é redeclarada localmente (linhas 13-22) em vez de ser importada do arquivo centralizado src/lib/auth/reseller-session.ts. A implementação é idêntica e funciona, mas viola DRY (Don't Repeat Yourself) e aumenta risco de divergência futura.
- **impacto:** Risco de manutenção baixo: mudanças futuras na lógica de autenticação podem não ser aplicadas aqui, levando a comportamentos inconsistentes. Código redundante aumenta superfície de ataque acidental.
- **correção:** Remova a função local e importe: `import { requireResellerSession } from '@/lib/auth/reseller-session'`. Substitua as chamadas locais para usar a versão centralizada.
- **trecho:**

```
async function requireResellerSession() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'RESELLER' || !session.user.tenantId) {
    return null
  }
  return {
    userId: session.user.id as string,
    tenantId: session.user.tenantId as string,
  }
}
```

### 39. [Baixo] Bearer tokens e secrets compartilhados validados com timingSafeEqual - CORRETO
- **arquivo:linha:** `src/lib/auth/bearer.ts:1-38`
- **confiança (finder):** alta
- **descrição:** isCronAuthorized() e isInternalAuthorized() usam safeEqual() que chama timingSafeEqual() do crypto nativo. Compara buffers com mesmo tamanho para prevenir timing attacks. CRON_SECRET e INTERNAL_SECRET exigem >=32 chars em produção.
- **impacto:** Positivo - proteção contra timing attacks.
- **correção:** Manter conforme.

### 40. [Baixo] Impersonation flag HMAC-assinado com SHA-256 e timingSafeEqual - SEGURO
- **arquivo:linha:** `src/lib/auth/impersonate.ts:88-104`
- **confiança (finder):** alta
- **descrição:** encodeImpersonationFlag() assina payload com HMAC SHA-256 usando authSecret. Format: base64url(json).base64url(hmac). decodeImpersonationFlag() verifica HMAC com timingSafeEqual. Previne forjamento de flag mesmo se XSS/cookie injection ocorrer (antes o flag era base64 puro).
- **impacto:** Positivo - proteção contra escalação via impersonation forjada.
- **correção:** Manter conforme.

### 41. [Baixo] Reset tokens hash com SHA-256 - BEM IMPLEMENTADO
- **arquivo:linha:** `src/lib/auth/reset-token.ts:14-21`
- **confiança (finder):** alta
- **descrição:** generateResetToken() gera plain (hex de 32 random bytes = 256 bits) e hash com SHA-256. Plain vai no email (TTL 5min), hash vai no banco. Ataque ao DB não revela reset token plain.
- **impacto:** Positivo - se DB for comprometido, reset tokens não podem ser reutilizados.
- **correção:** Manter conforme. Implementação correta.

### 42. [Baixo] Criptografia AES-256-GCM corretamente implementada - SEM VULNERABILIDADES
- **arquivo:linha:** `src/lib/crypto.ts:26-43`
- **confiança (finder):** alta
- **descrição:** Padrão AES-256-GCM com IV aleatório (12 bytes), authTag verificado (16 bytes), chave validada (32 bytes). IV nunca reutilizado (novo para cada operação). Format: iv:encrypted:tag (hex encoded). Decryptografia com setAuthTag() antes de final(), validando integridade.
- **impacto:** Positivo - mp_access_token de tenants é criptografado com padrão forte e nunca retornado ao client em plaintext.
- **correção:** Manter conforme. Considerar documentar que ENCRYPTION_KEY deve ser rotacionado periodicamente em produção (não implementado, mas não crítico).

### 43. [Baixo] Logger com redação de secrets abrangente - BEM CONFIGURADO
- **arquivo:linha:** `src/lib/logger.ts:45-101`
- **confiança (finder):** alta
- **descrição:** Pino com redact paths cobrindo: mpAccessToken, token, password, passwordHash, cpf, cnpj, cartNumber, cvv, iv, ciphertext, headers sensíveis (authorization, cookie, asaas-access-token, x-signature). Usa errorSerializer para serializar erros sem expor props customizadas.
- **impacto:** Positivo - secrets nunca tocam stdout mesmo em error payloads ou logs estruturados.
- **correção:** Manter conforme. Considerar adicionar 'creditCard' (já listado), 'bankAccount' e 'routingNumber' se integração bancária for adicionada.

### 44. [Baixo] Supabase service_role sempre lido de process.env server-side - SEM VAZAMENTO
- **arquivo:linha:** `src/lib/supabase/storage.ts e src/lib/certificates/storage.ts:3-20`
- **confiança (finder):** alta
- **descrição:** SUPABASE_SERVICE_ROLE_KEY lido apenas em funções assíncronas server-side (uploadVitrineAsset, uploadCertificatePdf, etc.). Nunca importado em components com 'use client'. Headers incluem Authorization e apikey com serviceRoleKey, mas apenas usados em fetch server-side.
- **impacto:** Positivo - service_role não é exposto ao client.
- **correção:** Manter conforme. Considerar usar Supabase anon_key + RLS policies como defense-in-depth no futuro (hoje isolamento é na aplicação).

### 45. [Informativo] Take hardcoded sem parâmetro de paginação
- **arquivo:linha:** `/src/app/api/admin/alunos/route.ts:50`
- **confiança (finder):** baixa
- **descrição:** Linha 50: take: 100 é hardcoded. Sem suporte a limit/offset via query params. GET lista exatamente 100 alunos sempre. Embora seguro, é inflexível.
- **impacto:** Baixo. Limitação UX — interface pode precisar exibir mais alunos. Não é vulnerabilidade.
- **correção:** Adicionar z.coerce.number().int().min(1).max(200) para limit e offset via query params, como /loja/courses faz. Manter default 50, máximo 200.

### 46. [Informativo] Período de dashboard hardcoded, validação correta
- **arquivo:linha:** `/src/app/api/admin/dashboard/route.ts:20-29`
- **confiança (finder):** baixa
- **descrição:** Linhas 20-29: 'periodRaw' é validado com switch/include check, depois usado em periodStart.setDate(now.getDate() - 30). Seguro porque valores são whitelist.
- **impacto:** Positivo: check de whitelist está em lugar certo.
- **correção:** Manter como exemplo de validação segura.

### 47. [Informativo] Validação com Zod presente e bem estruturada
- **arquivo:linha:** `/src/app/api/checkout/route.ts:116-125`
- **confiança (finder):** media
- **descrição:** Linhas 116-125: checkouts usam z.safeParse() com schemas completos (cpf, telefone, cartão com regex). Validação é forte com custom refinements (isValidCpf, isValidPhone).
- **impacto:** Positivo: checkout tem validação robusta de input.
- **correção:** Manter como referência. Aplicar mesmo padrão em rotas que ainda usam parseFloat/parseInt sem Zod.

### 48. [Informativo] Validação de paginação correta e como referência
- **arquivo:linha:** `/src/app/api/loja/courses/route.ts:10-11`
- **confiança (finder):** media
- **descrição:** Usa Zod corretamente com z.coerce.number().int().min(1).max(100) para limit e .min(0) para offset. Padrão deve ser copiado para outras rotas.
- **impacto:** Positivo: rota já está segura com validação robusta.
- **correção:** Usar /loja/courses como template para todas as outras rotas de listagem (admin/alunos, admin/vendas, etc). Aplicar limites máximos explícitos.

### 49. [Informativo] Arquitetura: Validação Inconsistente de Tenant em admin/alunos
- **arquivo:linha:** `src/app/api/admin/alunos/[id]/route.ts:8-156`
- **confiança (finder):** alta
- **descrição:** Padrão inconsistente entre GET e PATCH no mesmo endpoint: GET do admin/alunos valida tenantId='pmbTenant', mas PATCH não. Similar em outros endpoints (notify, bloquear, reset-password). GET também valida whereEnrollments com filtro de soldByUserId para PMB_SALES, mas PATCH ignora isso.
- **impacto:** Confusão arquitetural: código é vulnerável por acidente, não design proposital. Risco de futuros developers replicarem padrão inseguro.
- **correção:** Padronizar: TODO endpoint que acessa student por id deve validar tenantId ANTES de qualquer operacao. Considerar criar helper function `requireStudent(id, tenantId)` que centraliza a logica.
- **trecho:**

```
// GET valida tenantId
where: { id, tenantId: pmbTenant.id }
// PATCH nao valida
where: { id }
```

### 50. [Informativo] Descriptografia de mp_access_token sempre feita antes de uso - PADRÃO CORRETO
- **arquivo:linha:** `src/app/api/loja/checkout/route.ts, src/app/api/painel/vendas/route.ts:310-344, ~variável`
- **confiança (finder):** alta
- **descrição:** Em ambas as rotas, mpAccessToken é lido do banco (criptografado), descriptografado via decryptTenantMpToken() imediatamente antes de chamar createPreference/createPreapproval. Nunca retornado ao client.
- **impacto:** Positivo - padrão de segurança aplicado consistentemente.
- **correção:** Manter conforme.

### 51. [Informativo] Proteção contra open redirect implementada corretamente
- **arquivo:linha:** `src/components/auth/login-form.tsx:70-79`
- **confiança (finder):** alta
- **descrição:** Login form valida callbackUrl contra prefixos perigosos (// e /\), garantindo que redirecionamento pós-login fica local. Testes contra //evil.com e /\evil.com passam.
- **impacto:** Positivo — nenhum risco. Open redirect é efetivamente prevenido.
- **correção:** Manter implementação. Considerar refatorar em helper reutilizável (utils/safe-redirect.ts) para aplicar em futuras rotas de redirecionamento.
- **trecho:**

```
const isSafePath =
        !!redirectTo &&
        redirectTo.startsWith("/") &&
        !redirectTo.startsWith("//") &&
        !redirectTo.startsWith("/\\")
```

### 52. [Informativo] Idempotência via chave única bem implementada
- **arquivo:linha:** `src/lib/asaas/process.ts, src/lib/mercadopago/process.ts:varies`
- **confiança (finder):** alta
- **descrição:** Ambos Asaas e MP usam asaasPaymentId e mpPaymentId como chaves UNIQUE em tabelas Payment/TenantPayment. Primeira coisa após validar assinatura é verificar findUnique(mpPaymentId). Replay é no-op (return early).
- **impacto:** Nenhum risco. Idempotência é forte.
- **correção:** Nenhuma ação.
- **trecho:**

```
const alreadyPaid = await prisma.payment.findUnique({where: {mpPaymentId: paymentId}, select: {id: true}})
if (alreadyPaid) {await markLog(logId, true, 'payment ja processado'); return}
```

### 53. [Informativo] Asaas token validation - strong, sem bypass mode
- **arquivo:linha:** `src/lib/asaas/webhook.ts:16-32`
- **confiança (finder):** alta
- **descrição:** validateAsaasWebhook() usa timingSafeEqual() e exige ASAAS_WEBHOOK_TOKEN sempre (sem dev bypass). Rejeita fechado se env não está definida. Mais seguro que MP.
- **impacto:** Nenhum risco. Implementação é segura.
- **correção:** Nenhuma ação. Asaas está bem.
- **trecho:**

```
const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN
if (!expectedToken) {
    contextLogger().error({event: 'asaas.webhook.missing_token_env'}, '...')
    return false
}
```

### 54. [Informativo] Validação de webhook MP com defesa em profundidade - BEM ESTRUTURADA
- **arquivo:linha:** `src/lib/mercadopago/process.ts:256-295`
- **confiança (finder):** alta
- **descrição:** Passo 1: Idempotência (check mpPaymentId já processado). Passo 2: HMAC validation com MP_WEBHOOK_SECRET (timing-safe) antes de tocar em tenant. Passo 3: Resolução de tenant por slug. Passo 4: getPayment(tenant.mpAccessToken, paymentId) — se paymentId não pertencer à conta MP do tenant, API retorna 404. Bypass de HMAC só com flag explícita MP_WEBHOOK_DEV_BYPASS=1 em dev.
- **impacto:** Positivo - múltiplas camadas de validação.
- **correção:** Manter conforme.

### 55. [Informativo] Validação de magic bytes implementada em todos os uploads
- **arquivo:linha:** `src/lib/storage/validate-image.ts:14-56`
- **confiança (finder):** alta
- **descrição:** Todos os endpoints de upload (logo, banner, capa, certificate) usam isValidImageMagic() para validar que conteúdo bate com MIME declarado. Defesa contra MIME spoofing.
- **impacto:** Positivo — upload seguro contra executáveis disfarçados de imagem.
- **correção:** Manter. Considerar adicionar validação de dimensões de imagem (width/height) para prevenir DoS via imagens 1x1000000px.
- **trecho:**

```
case "image/png":
      return (
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47
      )
```

### 56. [Informativo] Proxy sanitiza x-tenant-id/x-tenant-slug de cliente - sem bypassa
- **arquivo:linha:** `src/proxy.ts:197-202`
- **confiança (finder):** alta
- **descrição:** Headers x-tenant-id e x-tenant-slug são sempre deletados antes de rotação de classificação de host. Apenas setados pelo proxy APÓS validar que o host resolve a um tenant real. Impossível client-side injection.
- **impacto:** Nenhum risco de cross-tenant via header injection.
- **correção:** Nenhuma ação. Implementação é sólida.
- **trecho:**

```
const sanitizedHeaders = new Headers(request.headers)
sanitizedHeaders.delete('x-tenant-id')
sanitizedHeaders.delete('x-tenant-slug')
```

### 57. [Informativo] Resolução de tenant via INTERNAL_SECRET timing-safe - CORRETO
- **arquivo:linha:** `src/proxy.ts:176-190`
- **confiança (finder):** alta
- **descrição:** resolveTenantFromDB() usa fetch com header x-internal-secret. isInternalAuthorized() na rota receptora valida com safeEqual/timingSafeEqual. Proxy injeta x-tenant-id/x-tenant-slug apenas após resolução bem-sucedida.
- **impacto:** Positivo - headers de tenant não podem ser injetados pelo cliente.
- **correção:** Manter conforme.
