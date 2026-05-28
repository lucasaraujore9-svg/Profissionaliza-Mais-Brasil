# 01 — Reconhecimento e Mapeamento

**Agente:** Reconhecimento (executado pelo Orquestrador)
**Data:** 2026-05-28
**Método:** leitura direta de configs, inventário via `find`/`grep`, execução de comandos de validação.

## 1. Mapa técnico

| Item | Valor |
|---|---|
| Framework | Next.js 16.2.6 (App Router) |
| Runtime UI | React 19.2.4 |
| Linguagem | TypeScript 5 (strict) |
| ORM | Prisma 7.7 + `@prisma/adapter-pg` + `pg` Pool |
| Banco | PostgreSQL (Supabase cloud, ref `jpwskehhnplmmtgyyxmf`) |
| Auth | NextAuth v5 beta (Credentials, JWT) |
| Cache/RL | Upstash Redis (`@upstash/redis`, `@upstash/ratelimit`) |
| UI | Tailwind 4, shadcn/ui, lucide-react, sonner, animejs, gsap |
| Validação | Zod 4 |
| State | Zustand 5 |
| Email | nodemailer (SMTP Hostinger) + Resend + React Email |
| PDF/planilha | jspdf, @react-pdf/renderer, xlsx, qrcode |
| Pagamentos | mercadopago SDK, Asaas (REST custom) |
| Push | web-push (VAPID) |
| Hospedagem | Vercel |
| Gerenciador | npm (`package-lock.json`, 607 KB) |

## 2. Inventário de superfície

| Categoria | Quantidade |
|---|---|
| Arquivos `.ts/.tsx` em `src` | 718 |
| Route handlers (`api/**/route.ts`) | 200 |
| Páginas (`page.tsx`) | 108 |
| Componentes (`components/**/*.tsx`) | 253 |
| Libs (`lib/**/*.ts`) | 107 |
| Server actions (`"use server"`) | 2 |
| Migrations SQL | 31 |
| Models Prisma | 31 |
| Arquivos de teste | **0** |

### Áreas de API (top-level sob `src/app/api/`)
`admin/` (≈90 rotas), `painel/` (≈55 rotas), `aluno/`, `loja/`, `checkout/`,
`cobranca/`, `webhooks/` (asaas, mercadopago), `cron/` (8 jobs), `internal/`,
`public/`, `push/`, `notifications/`, `pmb/`, `revendedores/`, `leads/`,
`student/`, `health/`, `metrics/`, `auth/`, `home/`.

### Áreas de UI (route groups)
`(auth)`, `(main)` (institucional: como-funciona, cursos, sobre, ajuda, privacidade,
termos, reembolso, contato, contrato-de-revenda, seja-revendedor, categoria, certificado, checkout),
`admin/` (22 seções), `painel/`, `aluno/`, `loja/`, `livrecursos/`, `validar/[code]`,
`cobranca/[paymentId]`, `inadimplente`, `alterar-senha-inicial`, `logout`, `offline`.

### Libs de domínio (`src/lib/`)
`tenant`, `home`, `vercel`, `redis`, `auth`, `plataforma-cursos`, `enrollment`,
`referrals`, `catalog`, `mercadopago`, `asaas`, `certificates`, `observability`,
`schemas`, `storage`, `supabase` (só `storage.ts`), `students`, `coupons`,
`revendedor`, `api`, `automation`, `notifications`, `email`, `validation`, `reports`.

## 3. Scripts npm
| Script | Comando | Observação |
|---|---|---|
| dev | `next dev` | |
| build | `npm run db:apply-pending && next build` | **⚠ aplica migrations no banco antes de buildar** |
| db:apply-pending | `node scripts/apply-pending-migrations.mjs` | tracking em `_pmb_applied_migrations`, hash sha256 |
| db:seed | `prisma db seed` (`tsx prisma/seed.ts`) | |
| db:reset | `prisma migrate reset --force` | **destrutivo** |
| lint | `eslint` | |
| typecheck | `tsc --noEmit` | |
| audit:prod | `npm audit --omit=dev --audit-level=high` | |
| postinstall | `prisma generate` | |

## 4. Comandos de validação executados

| Comando | Resultado | Notas |
|---|---|---|
| `npm run typecheck` | **PASS (exit 0)** | TS strict, sem erros |
| `npm run lint` | **PASS (exit 0)** | ESLint flat config |
| `npm audit` | 14 vulns (1 HIGH, 10 moderate, 3 low) | HIGH = `xlsx` |
| `npm run build` | **não executado deliberadamente** | muta o banco; usar `SKIP_PENDING_MIGRATIONS=1 npx next build` |

## 5. CI/CD
- `.github/workflows/ci.yml`: jobs `Lint + Typecheck + Audit` em PR e push main.
  Node 20, `npm ci` com `SKIP_PENDING_MIGRATIONS=1`. **Audit é `continue-on-error`
  (não bloqueia).** Não há job de testes (não existem testes). Não há job de build.
- `vercel.json`: `{ "crons": [] }` — crons migrados para Supabase pg_cron.

## 6. Pontos críticos detectados na recon (entregues aos especialistas)

1. **RLS ausente / bypassed** — Prisma conecta como owner; controle de acesso 100%
   em aplicação. (→ agentes 03, 04, 05, 14)
2. **Zero testes** — nenhuma rede contra regressão em fluxos de dinheiro/permissão.
   (→ agente 10)
3. **`xlsx` HIGH** sem fix + nodemailer/postcss/uuid moderate. (→ agente 12)
4. **CSP com `unsafe-inline`/`unsafe-eval`**. (→ agentes 02, 08)
5. **Build muta o banco** (deploy = migration sem gate separado). (→ agente 11)
6. **Rate limit de login falha em modo aberto** se Redis indisponível. (→ agentes 02, 04)
7. **200 rotas** a verificar individualmente quanto a guard + filtro de tenant. (→ agentes 04, 06, 14)
8. **2 usos de `dangerouslySetInnerHTML`** a inspecionar. (→ agentes 02, 08)
9. **Storage bucket público `vitrine-assets`** com service_role; verificar validação
   de upload (tamanho/MIME/path traversal). (→ agentes 02, 03)

## 7. Áreas que exigem revisão especializada (delegação)
- Segurança aplicacional (02), Supabase/RLS/Storage (03), Auth/Acesso (04),
  Arquitetura Next (05), Rotas/APIs (06), Bugs/Regras (07), UI/A11y/W3C (08),
  Performance (09), Testes (10), DevOps (11), Dependências (12), Compliance/LGPD (13),
  Red Team (14), Validação Final (15).

## 8. Limitações desta fase
- Não há ambiente de execução do app com banco real disponível para testes dinâmicos
  (DAST); a auditoria é majoritariamente estática + raciocínio de exploração.
- Conteúdo de `.env.local`/`.env.vercel.production` não foi lido (gitignored, contém segredos).
- RLS real no Postgres não pôde ser inspecionado via conexão (sem credenciais de DB
  nesta sessão); inferido pelas migrations e pelo modo de conexão do Prisma.
