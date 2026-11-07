# CLAUDE.md — Profissionaliza Mais Brasil

> **Leia este arquivo INTEIRO antes de executar qualquer tarefa.**
> Documentacao detalhada esta em `/docs/`. Consulte antes de implementar.

## O Que E Este Projeto

Plataforma SaaS multi-tenant de revenda de cursos profissionalizantes online.

- **Admin Master** gerencia o ecossistema e cobra mensalidades dos revendedores via **Asaas**
- **Revendedores** tem vitrines proprias com dominio personalizado e vendem cursos via **Mercado Pago**
- **Alunos** compram cursos e sao auto-matriculados na **plataforma parceira** (plataforma white-label com API)

Nos NAO somos uma plataforma de cursos. Os alunos assistem aulas na plataforma parceira. Nos construimos a camada comercial, vitrine, gestao e cobranca.

## Historico de decisoes

O historico completo (o que foi feito, por que, armadilhas e invariantes de cada area) mora em
`docs/historico/decisoes.md`. **Antes de mexer numa area, leia a secao dela la**
(`grep -n "^### " docs/historico/decisoes.md`). Registre feature nova LA, nao aqui;
aqui entra so uma linha no indice abaixo.

### Indice do historico

- O que ja esta implementado
- Validacao executada em 2026-04-15
- Credenciais pos-seed (2026-04-15)
- Nova fornecedora LMS (2026-06-19, branch `feat/lms-provider`)
- Papeis da equipe da unidade (2026-07-28, branch `feat/painel-roles`)
- Papeis e permissoes do sistema mae (2026-07-28)
- Diretor de unidades (2026-07-29)
- Par ver/editar em todas as areas (2026-07-31)
- API de parceiros — consulta de unidades (2026-08-05)
- Venda direta com mais de um curso (2026-08-05)
- Cota de aulas LIGADA em producao (2026-08-07)
- Churn honesto + cortesia excepcional (2026-08-07)
- Revisao da cortesia: 10 defeitos + trava por titular (2026-08-08)
- Responsavel financeiro para aluno menor (2026-08-13)
- Aproveitamento do certificado + progresso sob demanda (2026-08-14)
- Cancelamento automatico por inadimplencia (2026-08-21)
- Cursos de autoria da unidade + split Asaas (2026-08-21)
- Cancelamento por inadimplencia EXECUTADO + cron diario (2026-08-24)
- Autoria de curso pela unidade LIGADA em producao (2026-08-24)
- Identidade da unidade dentro do LMS (2026-08-24)
- Responsabilidade pelo conteudo de curso de autoria (2026-08-24)
- Video obrigatorio so FORA da propria vitrine (2026-09-24)
- Regras pedagogicas: a unidade define como as aulas abrem (2026-08-25)
- Curso renomeado na fornecedora virava duplicata invendavel (2026-08-31)
- Periodicidade da assinatura + venda direta (2026-09-03)
- Comissao de indicacao aparece no dia 1, nao no dia 20 (2026-09-09)
- Tipo de conteudo: curso ou e-book (2026-09-09)
- Comissao de indicacao virou rateio de RECEITA (2026-09-09)
- Relatorio de indicacoes (2026-09-09)
- Assinatura virou modulo opcional por unidade (2026-09-10)
- Vagas da assinatura + um acesso por vez (2026-09-14)
- Venda direta de assinatura da unidade paga NA LOJA (2026-09-14)
- Link de pagamento de loja e sempre a pagina da plataforma (2026-09-14)
- Curso exclusivo de algumas unidades vale na VENDA, nao so na vitrine (2026-09-15)
- Valor da parcela na vitrine + unidade Asaas vende parcelado (2026-09-15)
- Assinatura no boleto (carne) (2026-09-16)
- Assinatura paga pela vitrine sumia do painel (2026-09-24)
- Revisao da estrutura de assinatura (2026-09-25)
- Checkout de assinatura travado + apagão de e-mail (2026-09-28)
- Assinatura no PIX nos dois gateways + Pix Automatico no Asaas (2026-09-29)
- Chamado otymus: compra pendente com cupom + diagnostico EA (2026-09-29)
- Ordem das aulas trocavel por aluno depois da venda (2026-09-30)
- Aluno logado compra combo e ve assinatura em /aluno/comprar (2026-09-30)
- Limpeza de cadastros de teste (2026-09-30)
- Email de cobranca da unidade com retentativa (2026-10-01)
- Pix Automatico: 1o pagamento nao computava (2026-10-01)
- Conta removida: assinatura viva e e-mail preso no LMS (2026-10-01)
- Remocao de curso na plataforma legada NUNCA funcionou (2026-10-01, em aberto)
- Personalizacao da identidade por papel de cor (2026-10-01)
- API de parceiros — criar unidade (2026-10-02)
- Webhooks de saida (2026-10-02)
- Estorno MP revogava a matricula errada (2026-10-13)
- Banco de artes organizado por mês (2026-10-15)
- Teste de cartao roubado no checkout publico (2026-10-20)
- Assinatura de unidade no Asaas: cartao recorrente ou Pix Automatico (2026-10-22)
- Fatura da unidade nunca some do PMB (2026-10-26)
- Assinatura parcelada no cartão (2026-10-28)
- Venda direta com valor zero vira bolsa (2026-10-28)
- Carne com valores por parcela + edicao depois da venda (2026-10-29)
- 1a mensalidade paga fora da plataforma (marketplace) (2026-10-29)
- Carne para matricula liberada sem cobranca (2026-10-29)
- CNPJ da unidade (2026-11-04)
- Curso mensal: mensalidade so na venda direta (2026-11-05)
- Mensalidade da unidade: R$ 329 mes a mes, R$ 289 no debito automatico (2026-11-05)
- Curso sem forma de pagamento: fim do MONTHLY no cadastro (2026-11-06)
- Venda direta parcelada: o aluno escolhe o meio (2026-11-06)

### Bugs conhecidos (pendentes)

- Consultor (TenantMember) nao popula `session.user.tenantId` no JWT — cap de desconto e validado server-side via lookup de TenantMember na API.
- `npm run build` local para em "Collecting page data" por falta de `DATABASE_URL`: as envs Sensitive da Vercel nao descem no `vercel env pull`. Compile + typecheck passam; para fechar o build localmente, exporte um `DATABASE_URL` qualquer.

## Stack

Next.js 16 (App Router, `src/proxy.ts` no lugar de middleware) + TypeScript strict · Tailwind 4 + shadcn/ui ·
Prisma 7 + PostgreSQL (Supabase) · NextAuth v5 (Auth.js) · Upstash Redis (cache de tenant + rate limit) ·
Vercel · Zod · Zustand · React Email (SMTP pool + Resend de fallback).

## Portao (Definicao de Pronto)

`npm run typecheck` · `npm run lint` · `npm test` · `npm run build` (ver bug do `DATABASE_URL` acima).
Migrations: `prisma/migrations/<data>_<nome>`, sempre aditivas e idempotentes. Job novo de pg_cron
(`prisma/sql/pg_cron_jobs.sql`) NAO se agenda sozinho no deploy.

**Nunca** rodar `npm run db:reset` / `db:seed` contra o banco de producao.

## Workflow

Feature nova segue SPEC → BREAK → PLAN → EXECUTE: `docs/SPEC.md`, issues em `issues/NNN-*.md`,
`/plan NNN` e `/execute NNN`. Outros comandos: `/setup`, `/status`, `/next`, `/review`.
Detalhe em `docs/references/workflow.md`.

## Documentacao de referencia

| Arquivo | O que contem |
|---------|-------------|
| `docs/historico/decisoes.md` | Historico de decisoes, armadilhas e invariantes por area |
| `docs/references/architecture.md` | Padroes: thin client/fat server, behavior isolation, multi-tenant, naming |
| `docs/references/design-system.md` | Tipografia, cores, componentes, layouts |
| `docs/architecture/profissionaliza-mais-brasil-blueprint.md` | Atores, fluxos, integracoes, modelo de dados |
| `docs/architecture/DOMINIOS-GUIDE.md` | **CRITICO**: multi-tenant, wildcard DNS, dominios custom via Vercel API |
| `docs/api/plataforma-parceira-api-completa.md` | Endpoints da plataforma legada (EA) com cuidados |
| `docs/api/parceiros-v1.md` | API de parceiros (`/api/v1`) e webhooks de saida |
| `docs/qa/PERFIS.md` | Matriz de perfis e credenciais de seed para QA |
| `prisma/schema.prisma` | Schema do banco |
| `.env.example` | Lista completa e atual das variaveis de ambiente |

## Arquitetura Multi-Tenant (MAIS IMPORTANTE DO SISTEMA)

A plataforma usa **dois dominios distintos** (proxy em `src/proxy.ts`):

| Hostname | O que renderiza |
|---|---|
| `profissionalizamaisbrasil.com.br` (e `www`) | Site PMB institucional + `/admin` + `/painel` + `/aluno` + `/loja` direto. **Subdominios aqui sao sempre reservados (www, app, api, ...) — nunca tenant.** |
| `livrecursos.com.br` (e `www`) | Landing dedicada a captacao de revendedores (rewrite para `/livrecursos`). |
| `{slug}.livrecursos.com.br` | Vitrine do revendedor `{slug}` (rewrite para `/loja/*`). |
| `dominio-custom.com.br` | Vitrine do revendedor que configurou dominio proprio (lookup por `customDomain` no banco). |

**Helpers obrigatorios em `src/lib/tenant/urls.ts`** — sempre use estas funcoes em vez de concatenar strings de dominio:

- `appDomain()` → `profissionalizamaisbrasil.com.br`
- `vitrineDomain()` → `livrecursos.com.br`
- `appUrl()` → `https://profissionalizamaisbrasil.com.br`
- `vitrineHost(slug)` → `{slug}.livrecursos.com.br`
- `vitrineUrl(slug)` → `https://{slug}.livrecursos.com.br`
- `cnameTarget()` → `cname.livrecursos.com.br` (alvo CNAME para custom domains)

**Implementacao detalhada em:** `docs/architecture/DOMINIOS-GUIDE.md`

**Regras:**
- Proxy roda no Edge Runtime — NAO pode usar Prisma direto
- Usar Upstash Redis como cache (funciona no Edge) + Supabase client como fallback
- TTL do cache: 5 minutos
- Subdominios reservados em livrecursos.com.br: www, app, api, admin, painel, mail, smtp, ftp, cdn, assets, static, staging, dev, test
- TODA query no contexto da vitrine DEVE filtrar por tenant_id
- NUNCA permitir acesso cross-tenant
- Cookies de sessao sao automaticamente isolados pelos dominios (PMB e livrecursos nao compartilham sessao)

## Integracoes API — Resumo Rapido

### plataforma parceira (form-data, NAO JSON!)
- Base: `https://SUAESCOLA.com/api/v2/`
- Auth: Token via form-data
- **Doc completa:** `docs/api/plataforma-parceira-api-completa.md`
- CUIDADOS: `vinculocurso` sem idcurso = vincula TODOS. DELETE usa HEADERS. Precos em formato BR.

### Asaas (JSON, REST padrao)
- Base: `https://api.asaas.com/v3/`
- Auth: Header `access_token`
- Webhook: token no header `asaas-access-token`, responder 200 em <22s

### Mercado Pago (JSON, REST)
- Base: `https://api.mercadopago.com/`
- Auth: Bearer Token (do REVENDEDOR, nao nosso!)
- Webhook: HMAC SHA256, envia so ID — precisa GET para detalhes
- `mp_access_token` DEVE ser criptografado com AES-256-GCM no banco

## Fluxos criticos — onde moram

- Pagamento aprovado → matricula: webhooks em `src/lib/mercadopago/process.ts` e `src/lib/asaas/process.ts`,
  liberacao em `src/lib/enrollment/fulfill.ts` (provisiona na EA ou no LMS).
- Inadimplencia do aluno: `Tenant.billingMode` (AUTO bloqueia na plataforma, MANUAL notifica a unidade),
  `src/lib/auto-block.ts`.
- Inadimplencia da unidade: `src/lib/tenants/overdue-policy.ts` + `overdue-sweep.ts`.

## Padroes de Codigo

- Componentes: PascalCase, um por arquivo
- API Routes: validar TODOS inputs com Zod
- Prisma: SEMPRE filtrar por tenant_id no contexto de vitrine
- Erros: try/catch com tipos customizados, nunca swallow errors
- Tokens: NUNCA expor no client. MP access_token criptografado (AES-256-GCM, `src/lib/crypto.ts`).
- Webhooks: logar TUDO em webhook_logs, processar async, retornar 200 imediato

## MCP — Supabase

Configurado em `.mcp.json` (local, nunca commitar: token de admin com poder total no projeto).
Project ref `jpwskehhnplmmtgyyxmf`. Outra maquina: copiar `.mcp.json.example`, preencher
`SUPABASE_ACCESS_TOKEN` (do `.env.local`), reiniciar o Claude Code. Token vazado: revogar em
supabase.com/dashboard/account/tokens.
