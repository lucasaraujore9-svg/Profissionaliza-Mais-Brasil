# Fase 7 — Boas Práticas e Desconformidades

> Gerado da varredura paralela (sub-agentes Explore) + verificação adversarial. Total nesta fase: **15 achados**.

## Resumos dos finders

- Auditoria Next.js 16 / React 19 conventions completada. Encontrados 6 problemas principais: (1) uso de &lt;img&gt; em vez de next/image para imagens remotas já configuradas em remotePatterns, afetando performance de otimização em 3 locais; (2) falta de metadata em páginas públicas (loja, admin), impactando SEO e social sharing; (3) uso de data:image/png base64 inline quando SVG seria mais eficiente. Maior parte do código segue padrões Next.js 16 corretamente. Nenhum problema crítico de segurança de multi-tenancy ou 'use client' desnecessário.
- Auditoria de Fase 7 (Performance, Logs, Env) de SaaS multi-tenant Next.js 16 + React 19. Identificados 7 achados: 1 Crítico (falta de validação de segredo em cron), 3 Altos (exposição de erro em APIs, acesso direct a process.env sem validação centralizada, PII em logs de erro) e 3 informativos (bundle size, configuração defensiva). A isolação por tenantId é robusta em aplicação, mas validação de env spread no código e error disclosure representam riscos moderados.

## Achados detalhados

### 1. [Critico] Cron Endpoint sem Validação de Segredo em Fallback
- **arquivo:linha:** `src/app/api/cron/cleanup-webhook-logs/route.ts:23`
- **confiança (finder):** media
- **descrição:** A função `isCronAuthorized()` retorna `false` se `CRON_SECRET` estiver vazio (line 21 de src/lib/auth/bearer.ts), causando rejeição 401. Porém, em Vercel Deploy Previews ou CI/CD onde variáveis não são propagadas, o endpoint fica indisponível. A falha-aberta real ocorre se a lógica for invertida ou ignorada. Atualmente SEGURA, mas padrão é muito diferente de fail-fast.
- **impacto:** Se alguém acidentalmente remover a validação de secret ou se houver race condition com env não carregada, qualquer bot consegue disparar cron jobs e deletar/modificar dados críticos.
- **correção:** 1) Documentar explicitamente que CRON_SECRET é obrigatório em produção e não tem fallback. 2) Considerar adicionar uma assert() no boot do app (src/instrumentation.ts) que lance erro fatal se CRON_SECRET faltar em prod. 3) Adicionar test que verifica rejeição de cron sem auth header.

### 2. [Alto] Acesso Direto a process.env sem Validação Centralizada
- **arquivo:linha:** `src/app/api/admin/config/route.ts:37,43,47,56,60`
- **confiança (finder):** alta
- **descrição:** Linha 37: `process.env.NEXT_PUBLIC_APP_DOMAIN ?? ""`. Linhas 43,47,56,60: acesso direto `process.env.EA_API_URL`, `process.env.ASAAS_API_URL`, `process.env.ASAAS_WEBHOOK_TOKEN`, `process.env.NODE_ENV`. Não utiliza o `env` proxy centralizado de src/lib/env.ts, contaminando o código com múltiplos pontos de acesso ad-hoc sem tipagem ou validação. Existe enum de 122 ocorrências fora de env.ts.
- **impacto:** Mudanças em env.ts não capturam todos os usos. Desenvolvedores novos não sabem onde procurar validações. Tipagem fraca: não há garantia de que `process.env.NEXT_PUBLIC_APP_DOMAIN` é string (pode ser undefined). Regressão silenciosa: alguém pode renomear variável em env.ts mas esquecer de refatorar estas 122 ocorrências.
- **correção:** 1) Refatorar: substituir `process.env.X` por `env.X` usando o proxy de src/lib/env.ts em TODOS os 122 casos. 2) Adicionar ESLint rule `no-process-env` (banir process.env direto no source). 3) Mover NEXT_PUBLIC_* para env.ts tambem (mesmo que client-exposed, centraliza schema).

### 3. [Alto] Exposição de Detalhes de Erro Externo em Respostas API
- **arquivo:linha:** `src/app/api/painel/dominio/route.ts:161,213`
- **confiança (finder):** alta
- **descrição:** Linhas 161 e 213 retornam `error.message` da Vercel API diretamente ao cliente: `Falha ao adicionar domínio: ${message}`. Mensagens de erro da API Vercel podem conter informações técnicas sensíveis (IPs internos, nomes de serviço, detalhes de infraestrutura). A lógica em linha 211 tenta filtrar 'not found', mas ainda expõe qualquer outro erro.
- **impacto:** Atacante ou user malicioso consegue mapear infraestrutura da Vercel, descobrir configurações internas ou obter hints sobre falhas de autorização/configuração.
- **correção:** Retornar mensagem genérica ao cliente e logar o erro completo via contextLogger().error(). Exemplo: `return NextResponse.json({ error: 'Falha ao processar domínio. Tente novamente.' }, { status: 502 })` e dentro do catch: `contextLogger().error({ err: error, domain }, 'vercel domain operation failed')`.

### 4. [Alto] Exposição de Erro de Configuração em Webhook Assíncrono
- **arquivo:linha:** `src/app/api/webhooks/asaas/route.ts:57`
- **confiança (finder):** media
- **descrição:** Linha 57: Se `validateAsaasWebhook()` lance exceção (e.g., falta de env ASAAS_WEBHOOK_TOKEN), o catch retorna `{ error: message }` onde `message` é `error.message` cru. Mensagem pode ser 'ASAAS_WEBHOOK_TOKEN env var not set' ou similar, expondo infraestrutura.
- **impacto:** Um atacante que sonda o webhook descobre que a configuração está incompleta. Informação de recon útil para targeted attacks. Em produção, webhooks deveriam falhar silenciosamente ou com mensagem genérica.
- **correção:** Retornar `{ error: 'webhook processing failed' }` ao cliente. Logar erro completo via contextLogger().error({ err, event: 'asaas.webhook.config_error' }, msg).

### 5. [Alto] Uso de <img> para Supabase Storage quando remotePatterns já está configurado
- **arquivo:linha:** `src/components/admin/admin-certificate-settings-form.tsx:144`
- **confiança (finder):** alta
- **descrição:** Arquivo usa <img> com src={data.groupLogoUrl} onde groupLogoUrl vem de Supabase. next.config.ts já tem remotePatterns configurado para '*.supabase.co', portanto next/Image seria válido e mais eficiente. Comentário no código diz 'usamos <img> para não precisar configurar domain no next.config' — mas config já existe.
- **impacto:** Perda de otimizações do Next.js Image (resize automático, format negotiation, lazyloading nativo). Em tela de administração com múltiplas imagens, pode impactar performance de scroll. Upload de imagens não-otimizadas consome mais banda.
- **correção:** Migrar para import Image from 'next/image' e usar <Image src={data.groupLogoUrl} alt="..." width={...} height={...} className="..." /> ou usar fill com object-contain. Remover comentário obsoleto.
- **trecho:**

```
// Usamos <img> para nao precisar configurar domain no next.config
// eslint-disable-next-line @next/next/no-img-element
<img
  src={data.groupLogoUrl}
  alt="Logo do Grupo"
  className="max-h-full max-w-full object-contain"
/>
```

### 6. [Medio] Uso de <img> para capa de curso (thumbnail) quando Image seria superior
- **arquivo:linha:** `src/app/aluno/cursos/page.tsx:156`
- **confiança (finder):** media
- **descrição:** Página de cursos do aluno renderiza <img src={capa} ... /> para cover de curso. Capa provém de catalog/course que é Supabase URL. já que remotePatterns está configurado, deveria usar next/Image com fill + object-cover para responsive.
- **impacto:** Sem otimização automática de resolução. Em mobile, carrega imagem desktop size (desperdício de banda). Sem format negotiation (WebP). Layout shift possível se height não for fixed. Impacto perceptível em listagem com 10+ cursos.
- **correção:** Migrar para <Image src={capa} alt={e.course.nome} fill className="object-cover" /> em container com position-relative. Ou usar <Image ... width={400} height={240} ... /> com sizes prop. Remover eslint-disable comment.
- **trecho:**

```
// eslint-disable-next-line @next/next/no-img-element
<img
  src={capa}
  alt={e.course.nome}
  className="h-full w-full object-cover"
/>
```

### 7. [Medio] Uso de <img> com data:image ao invés de next/image para QR Code PIX
- **arquivo:linha:** `src/app/cobranca/[paymentId]/checkout-client.tsx:96`
- **confiança (finder):** media
- **descrição:** Componente renderiza <img> com src=`data:image/png;base64,${pix.encodedImage}` em vez de usar next/Image. Embora data: URIs sejam válidas em <img>, Next.js Image com fill ou placeholder poderia otimizar renderização em browsers modernos via native lazy loading e LQIP.
- **impacto:** Perda de otimizações nativas do Next.js Image: sem native lazy loading, sem placeholder support, sem otimização automática de formato (WebP). Em checkout crítico, isso reduz performance percebida.
- **correção:** Manter como está se o data: URI for gerado do servidor. Se houver alternativa (SVG ou URL), migrar para next/Image. Considerar usar `<picture>` com SVG fallback ao invés de base64 para reduzir tamanho payload.
- **trecho:**

```
<img
  src={`data:image/png;base64,${pix.encodedImage}`}
  alt="QR Code PIX"
  className="h-48 w-48"
/>
```

### 8. [Medio] Uso de <img> para logo de revendedor quando Image já está disponível no mesmo arquivo
- **arquivo:linha:** `src/app/validar/[code]/page.tsx:369`
- **confiança (finder):** media
- **descrição:** Página importa Image do next/image (linha 1) mas usa <img> com conditional fallback para logoSrc. Quando logoSrc existe, renderiza <img>; senão, renderiza <Image>. Ambas as branches deveriam usar Image para consistência e otimização.
- **impacto:** Inconsistência de otimização: uma branch recebe native lazy loading / format negotiation, outra não. Se logoSrc é URL remota (presumidamente de tenant), falta resize automático. Impacto menor em página de validação (pouca interação), mas afeta CLS em carregamento inicial.
- **correção:** Manter <Image> para ambas branches. Para logoSrc remoto, adicionar a next.config.ts se o domínio for desconhecido, ou usar <Image src={logoSrc} ... /> com remotePatterns wildcard já existente se for Supabase.
- **trecho:**

```
{logoSrc ? (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={logoSrc} alt={unidade} ... />
) : (
  <Image src="/images/logo.png" ... />
)}
```

### 9. [Medio] Heavy Client Imports (xlsx, jsPDF, jspdf-autotable) via Dynamic Import
- **arquivo:linha:** `src/components/admin/report-viewer.tsx:102,121,122`
- **confiança (finder):** media
- **descrição:** Linhas 102,121,122 usam `await import()` dinamicamente, o que é correto para lazy-loading. Porém, esses imports ainda residem no client bundle e são carregados no evento click. xlsx (~700KB), jsPDF (~400KB), jspdf-autotable (~150KB) somam ~1.2MB extra no cliente. Impacto: relatórios demoram a renderizar, users com conexão lenta veem loading prolongado.
- **impacto:** Performance: latência ao exportar relatórios (especialmente mobile). Bundle creeping: cada feature requer libs pesadas. Se tiver muitos relatórios, bundle fica insustentável.
- **correção:** 1) Mover export para server-side: criar API route `/api/admin/relatorios/[type]/export?format=xlsx` que retorna arquivo já processado. 2) Deixar client apenas com CSV (nativo, <5KB) e fetch para Excel/PDF. 3) Alternativa light: usar library menor como `tiny-xlsx` ou `papaparse`.

### 10. [Medio] Uso de <img> para data:image/png em checkout quando SVG seria mais eficiente
- **arquivo:linha:** `src/components/loja/pmb-checkout-form.tsx:710-716`
- **confiança (finder):** media
- **descrição:** Similar ao cobranca/checkout-client.tsx, renderiza QR Code via <img src="data:image/png;base64,..." /> em formulário de checkout da loja. Base64 encoded image inline aumenta bundle size e tamanho de resposta HTML inicial.
- **impacto:** Tamanho de payload HTML cresce com cada QR gerado. Base64 é 33% maior que binário equivalente. Em mobile com conexão lenta, delay na renderização do QR é perceptível. Cacheability é zero (inline data: URI).
- **correção:** Gerar QR como SVG no servidor via 'qrcode' ou 'qr-image' e retornar SVG string inline (sem base64). Se precisar PNG, servir como rota /api/checkout/qr/:paymentId que retorna Content-Type: image/png + Cache-Control headers. Permitir browser cache.
- **trecho:**

```
<img
  src={`data:image/png;base64,${status.qrImageBase64}`}
  alt="QR Code PIX"
  width={240}
  height={240}
  className="h-60 w-60"
/>
```

### 11. [Medio] console.warn e console.error em Edge Runtime (Middleware)
- **arquivo:linha:** `src/lib/redis/cache.ts:24,57`
- **confiança (finder):** media
- **descrição:** Linhas 24,57: console.warn e console.error com JSON.stringify em arquivo que roda no middleware (src/lib/redis/cache.ts com `'use edge'` ou compatível). Comentário diz 'Edge-runtime compatível', mas middleware é routed via proxy. Outputs de console em Vercel Edge rotas com prefixo especial e podem ser vistos em logs de deploy (não no stdout normal).
- **impacto:** Logs de development vazam para produção se não forem removidos. Em prod, esses outputs ficam em logs de infraestrutura de forma menos controlada que Pino/Logger estruturado.
- **correção:** Substituir `console.warn/error` por `contextLogger().warn/error()` OU remover prints de debug en produção. Se precisar de warn em edge: usar `logger.warn()` que é Edge-compatible, ou aceitar que será integrado nos Vercel Logs.

### 12. [Informativo] Falta de metadata em página protegida de administração
- **arquivo:linha:** `src/app/admin/page.tsx:1-20`
- **confiança (finder):** media
- **descrição:** Página /admin é protegida por guards, force-dynamic, mas não exporta generateMetadata. Menos crítica que loja (acesso restrito), mas afeta documentação interna e SEO de crawlers autenticados. Sem metadata, browser tabs mostram título genérico.
- **impacto:** Usabilidade interna (abas do navegador não indicam seção) + audit de SEO. Impacto baixo pois página é autenticada, mas é inconsistência com boas práticas Next.js.
- **correção:** Adicionar generateMetadata mínimo: export const metadata = { title: 'Painel Administrativo - PMB', }; ou versão dinâmica se houver contexto de tenant.
- **trecho:**

```
// /src/app/admin/page.tsx sem generateMetadata ou metadata export
```

### 13. [Informativo] Health Check Expõe Mensagens de Erro de Database
- **arquivo:linha:** `src/app/api/health/route.ts:42`
- **confiança (finder):** baixa
- **descrição:** Linha 42: `error: err instanceof Error ? err.message : 'db error'` retorna mensagem bruta do erro do Prisma (e.g., 'connection timeout', 'role "app" does not exist'). Health endpoint é público (sem auth) e usado por bots de monitoramento externo.
- **impacto:** Erro de produção pode revelar nome de user PostgreSQL ('role' syntax), timeouts de conn pool (hint de capacidade), ou detalhes de schema se houver erro SQL. Informação útil para reconnaissance.
- **correção:** Retornar mensagem genérica: `error: 'database unavailable'` ou remover campo error completamente em 503. Logar erro completo via logger para interno troubleshooting.

### 14. [Informativo] Falta de generateMetadata em página pública da loja
- **arquivo:linha:** `src/app/loja/page.tsx:1-57`
- **confiança (finder):** alta
- **descrição:** Página /loja é uma vitrine pública multi-tenant (force-dynamic). Não exporta generateMetadata. Sem metadata, Open Graph tags (og:title, og:image, og:description) ficam vazias — compartilhamentos em redes sociais exibem títulos genéricos, reduzindo CTR.
- **impacto:** SEO / Social Sharing: WhatsApp, Facebook, LinkedIn não exibem preview customizado quando link é compartilhado. Para SaaS multi-tenant, cada revendedor deveria ter seu próprio title/description baseado em tenant.branding. Impacto de marketing é direto em conversão.
- **correção:** Implementar export async function generateMetadata({ params, searchParams }: any) { const tenant = await getCurrentTenant(); return { title: tenant?.nomeFantasia || 'Cursos Profissionalizantes', description: '...', openGraph: { title: ..., description: ..., type: 'website' } }; }. Reutilizar dados do tenant já carregado.
- **trecho:**

```
export const dynamic = "force-dynamic"

export default async function LojaHomePage() {
  const tenant = await getCurrentTenant()
  // ... sem generateMetadata
```

### 15. [Informativo] Validação de ENCRYPTION_KEY com Regex Permissivo (case-insensitive)
- **arquivo:linha:** `src/lib/env.ts:55`
- **confiança (finder):** baixa
- **descrição:** Linha 55: `/^[0-9a-f]{64}$/i` com flag `i` (case-insensitive). Aceita tanto minúsculas quanto MAIÚSCULAS. Não é bug de segurança, mas cria inconsistência: documentação diz 'openssl rand -hex 32' (que gera minúsculas), mas sistema aceita variações. Potencial para confusão em onboarding de novos admins.
- **impacto:** Baixo — validação ainda garante 32 bytes. Mas regex loose pode levar a bugs downstream se código assumir minúsculas.
- **correção:** Remover flag `i`: `/^[0-9a-f]{64}$/` (força minúsculas). Ou aceitar explicitamente e documentar: 'accepts uppercase or lowercase'.
