# Relatório de Dependências e Supply Chain — Agente 12

> Auditoria read-only. Nenhum arquivo foi modificado.
> Data de referência: 2026-05-28 | npm audit: 14 vulns (1 HIGH, 10 moderate, 3 low)

---

## Sumário executivo

| Severidade CVE | Qtd | Severidade real (uso no app) |
|---|---|---|
| HIGH | 1 (`xlsx`) | **Baixa** — só geração de export, nunca parse de upload |
| Moderate | 10 | Mix: 2 sem fix + resto devDep/transitivo sem vetor real |
| Low | 3 | Informativo |

Nenhuma vulnerabilidade tem vetor de exploração imediata relevante ao app, mas dois pontos exigem ação planejada: **substituição futura de `xlsx`** (sem fix upstream) e **atualização de `next-auth`** para versão stable quando disponível.

---

## 1. Análise detalhada de cada vulnerabilidade

### [Alto CVE / Baixo Real] xlsx — Prototype Pollution + ReDoS

- **CVE:** GHSA-4r6h-8v6p-xvw6 (Prototype Pollution, CVSS 7.8) + GHSA-5pgg-2g8v-p4x9 (ReDoS, CVSS 7.5)
- **Fix disponível:** Não — sem patch upstream, versão pinada em `^0.18.5`
- **Onde é usado:**
  - `src/components/admin/report-viewer.tsx:102` — `await import("xlsx")` client-side lazy
  - Operações: `XLSX.utils.aoa_to_sheet`, `XLSX.utils.book_new`, `XLSX.utils.book_append_sheet`, `XLSX.write`
- **Análise de vetor:**
  - **NUNCA** é chamado `XLSX.read()` com input externo. Ambos os CVEs (Prototype Pollution via `XLSX.read` + ReDoS em parser de fórmulas) exigem parsear um arquivo `.xlsx`/`.xls` hostil.
  - O componente **apenas gera** XLSX a partir de arrays JS vindos da API interna `/api/admin/relatorios/*` — dados que passam por Prisma antes de chegar ao sheet.
  - A `docs/SECURITY.md` §5 LOW confirma risco aceito e documentado: *"Reavaliar se algum dia adicionar upload de XLSX"*.
- **Vetor ativo:** NÃO — export-only, sem parse de input do usuário.
- **Severidade real:** Baixa no estado atual.
- **Alternativa recomendada:** `exceljs` (mantida ativamente, sem CVEs abertos). Migração isolada: trocar as 10 linhas em `report-viewer.tsx:98-114`. Baixo risco de quebra.

---

### [Moderate CVE / Baixo Real] nodemailer — SMTP Command Injection

- **CVEs:** GHSA-c7w3-x93f-qmm8 (envelope.size) + GHSA-vvjj-xcjg-gr5g (CRLF em transport name)
- **Fix disponível:** Não (`nodemailer <= 8.0.4`, versão instalada `^7.0.13`)
- **Onde é usado:** `src/lib/email/smtp.ts:1,68` — `nodemailer.createTransport()`
- **Análise de vetor:**
  - CVE GHSA-vvjj-xcjg-gr5g: requer valor malicioso em `options.name` (transport name) — passado ao EHLO/HELO. Em `smtp.ts:68`, `createTransport()` recebe apenas `host`, `port`, `secure`, `auth`. **`name` nunca é passado**, portanto esse vetor não existe.
  - CVE GHSA-c7w3-x93f-qmm8: requer `envelope.size` com valor controlado. `sendMail()` em `smtp.ts:97` recebe `{from, to, subject, html, replyTo}` — sem `envelope` object.
  - `replyTo` em `src/app/api/aluno/suporte/route.ts:110` recebe `student.email` (vem do banco Prisma, não do body da request). Não é input direto do usuário sem sanitização.
- **Vetor ativo:** NÃO — parâmetros vulneráveis não são usados.
- **Severidade real:** Baixa.
- **Observação:** `nodemailer` é dep direta (`^7.0.13`) mas a maioria dos call sites usa `sendEmail` via `mailer.ts` que roteia para Resend. O SMTP é fallback. Monitorar se `nodemailer` 9.x resolve os CVEs.

---

### [Moderate CVE / Informativo] postcss — XSS via `</style>`

- **CVE:** GHSA-qx2v-qp2m-jg93 (CVSS 6.1)
- **Fix disponível:** Não (bundled com `next`, que ainda não lançou fix)
- **Contexto:** `postcss` é dep transitiva de `next`. Roda **apenas em build-time** (transpilação Tailwind). Nunca processa CSS em runtime no servidor.
- **Vetor ativo:** NÃO — build-time only; não há rota que processe CSS user-supplied.
- **Severidade real:** Informativa.

---

### [Moderate CVE / Baixo Real] uuid — Missing buffer bounds check

- **CVE:** GHSA-w5hq-g745-h8pq (CVSS 7.5, mas requer buf explícito)
- **Fix:** `npm audit fix --force` instala `mercadopago@0.5.0` (breaking — API completamente diferente)
- **Contexto:** `uuid` é dep de `mercadopago >= 1.0.0`. O app usa `mercadopago@^2.12.0`.
- **Vetor:** CVE exige chamar `uuidv3/v5/v6(name, namespace, buf, offset)` com `buf` customizado. O SDK do mercadopago usa `uuid` internamente para geração de IDs de preferência — nunca passa `buf` externo.
- **Vetor ativo:** NÃO — exploração exige chamada direta com buf controlado pelo atacante.
- **Severidade real:** Baixa.
- **Ação:** Aguardar `mercadopago >= 3.x` sem breaking change, ou upgrade para v2 da API MP quando disponível.

---

### [Moderate CVE / Informativo] brace-expansion — DoS em range numérico

- **CVE:** GHSA-jxxr-4gwj-5jf2 (CVSS 6.5)
- **Fix disponível:** Sim via `npm audit fix` (sem breaking change)
- **Localização:** `node_modules/@typescript-eslint/typescript-estree/node_modules/brace-expansion` — **devDependency** (eslint toolchain)
- **Vetor ativo:** NÃO — nunca roda em produção; apenas em CI/lint.
- **Ação:** `npm audit fix` pode resolver sem risco. Baixa prioridade.

---

### [Moderate CVE / Informativo] @hono/node-server + @prisma/dev + prisma — Middleware bypass

- **CVE:** GHSA-92pp-h63x-v22m (serveStatic bypass via slashes duplos)
- **Fix:** Downgrade para `prisma@6.19.3` (breaking — versão atual é 7.7)
- **Contexto:** `@hono/node-server` é dep de `@prisma/dev` que por sua vez é dep interna do CLI `prisma`. Nunca exposta como servidor HTTP em produção — o app roda no Next.js/Vercel.
- **Vetor ativo:** NÃO — `@prisma/dev` é utilitário de desenvolvimento do Prisma CLI (usado em `prisma studio`, `prisma migrate`).
- **Severidade real:** Informativa.

---

### [Low CVE / Informativo] next-auth + @auth/core + @auth/prisma-adapter

- **CVE:** Via `nodemailer` (low, sem score CVSS definido para esse path)
- **Contexto:** `next-auth 5.0.0-beta.30` — beta em produção. A vulnerabilidade é por ser dep do nodemailer — mesma análise acima (vetor de `name` não usado).
- **Ação documentada em SECURITY.md §5:** *"Atualizar para 5.0.0 stable quando sair"*.

---

## 2. Tabela consolidada

| Pacote | Versão atual | Problema | Sev CVE | Sev real (uso) | Ação | Risco de quebra |
|---|---|---|---|---|---|---|
| `xlsx` | `^0.18.5` | Prototype Pollution + ReDoS | HIGH | **Baixa** (export-only) | Migrar para `exceljs` quando conveniente | Baixo — 10 linhas em 1 arquivo |
| `nodemailer` | `^7.0.13` | SMTP Injection (transport name + envelope.size) | Moderate | **Baixa** (parâmetros vulneráveis não usados) | Monitorar v9; não há ação urgente | N/A |
| `mercadopago` | `^2.12.0` | uuid < 11.1.1 (via dep) | Moderate | **Baixa** (buf não passado) | Aguardar SDK sem breaking | Alto — API breaking em v0.5.0 |
| `next` | `^16.2.6` | postcss XSS via `</style>` | Moderate | **Informativa** (build-time only) | Aguardar fix no upstream Next | N/A (bundled) |
| `@react-email/ui` | `^6.1.5` | Via postcss/next (devDep) | Moderate | **Informativa** | Aguardar | N/A |
| `brace-expansion` | (via @typescript-eslint) | DoS em range numérico | Moderate | **Informativa** (devDep, CI only) | `npm audit fix` | Nenhum |
| `prisma` | `^7.7.0` | Via @hono/node-server (devDep interna CLI) | Moderate | **Informativa** | Aguardar Prisma corrigir internamente | Não fazer downgrade para 6.x |
| `next-auth` | `5.0.0-beta.30` | Via nodemailer | Low | **Informativa** | Migrar para stable quando lançar | Médio — mudanças em beta |
| `@auth/core` | `*` | Via nodemailer | Low | **Informativa** | Junto com next-auth | N/A (transitiva) |
| `@auth/prisma-adapter` | `^2.11.1` | Via @auth/core | Low | **Informativa** | Junto com next-auth | N/A (transitiva) |

---

## 3. Dependências não usadas / mal classificadas

### 3.1. `animejs` — não usado em `src/`

- **Declarada em:** `package.json` `dependencies` (produção) como `"animejs": "^4.4.1"`
- **Evidência de uso:**
  - `grep -rn "animejs\|anime(" src/` → **zero resultados**
  - Apenas `gsap` é importado dinamicamente em `src/components/main/anim/landing-animations.tsx:29-30`
- **Conclusão:** Redundante com `gsap`. Nunca importada em código algum.
- **Ação:** Remover de `dependencies`. Reduz bundle size (não importada, mas aumenta superfície de ataque em `node_modules`).

### 3.2. `gsap` — único motor de animação usado (redundância com animejs)

- **Declarada em:** `dependencies` como `"gsap": "^3.15.0"`
- **Uso confirmado:** `src/components/main/anim/landing-animations.tsx:29-30` (import dinâmico `gsap` + `gsap/ScrollTrigger`)
- **Conclusão:** Legítima. Manter. Remover `animejs`.

### 3.3. `zustand` — declarada mas sem stores

- **Declarada em:** `dependencies` como `"zustand": "^5.0.12"`
- **Evidência de uso:**
  - `grep -rn "zustand" src/` → **zero resultados**
  - Não há diretório `src/stores/` com stores implementados
- **Conclusão:** Dependência declarada mas não implementada. CLAUDE.md menciona "Zustand (state)" na stack, mas o estado ainda é gerenciado via `useState`/contexto do React.
- **Ação:** Remover de `dependencies` até que stores sejam efetivamente criados.

### 3.4. `shadcn` — CLI instalado como runtime dependency

- **Declarada em:** `dependencies` como `"shadcn": "^4.2.0"`
- **Evidência de uso:**
  - `grep -rn "from.*shadcn" src/` → **zero resultados**
  - `shadcn` é um CLI para scaffolding de componentes (`npx shadcn add button`)
- **Conclusão:** Deveria ser `devDependencies` ou omitida (pode ser chamada via `npx shadcn` sem instalar). Não é importada em runtime.
- **Ação:** Mover para `devDependencies` ou remover (CLI não precisa estar em deps).

### 3.5. `@react-pdf/renderer` e `jspdf` — dois geradores de PDF em produção

- **`@react-pdf/renderer`** usado em:
  - `src/lib/referrals/demonstrativo-template.tsx:9` — template React de PDF para demonstrativos
  - `src/lib/referrals/demonstrativo.ts:1` — `renderToBuffer`
  - `src/lib/certificates/templates/modern.tsx:9`, `classic.tsx:9` — certificados de aluno
  - `src/lib/certificates/generate-pdf.ts:1`
- **`jspdf` + `jspdf-autotable`** usado em:
  - `src/components/admin/report-viewer.tsx:121-122` — export PDF de relatórios admin
- **Conclusão:** Não são redundantes — cada um cobre um caso diferente. `@react-pdf/renderer` gera PDFs estruturados (certificados, demonstrativos) server-side; `jspdf` gera tabelas de relatório client-side. Ambos justificados.

### 3.6. `shadcn` vs `@base-ui/react` — componentes UI

- **`@base-ui/react`** usado em `src/components/ui/tabs.tsx`, `alert-dialog.tsx`, `sheet.tsx`, `accordion.tsx`, `dialog.tsx`
- **Conclusão:** `@base-ui/react` é a primitiva UI real (Radix-like). `shadcn` é apenas o CLI de scaffolding. Sem redundância real em runtime.

### 3.7. Classificação incorreta: `react-email` e `@react-email/ui` em devDependencies

- **`react-email`** em `devDependencies:79` (`"react-email": "^6.1.5"`) — correto, é o servidor de preview local (`npm run email`)
- **`@react-email/ui`** em `devDependencies:66` — correto, é helper de UI para o preview
- **`@react-email/components`** em `dependencies:25` — correto, é importado em templates de email que rodam em produção (`src/lib/email/mailer.ts`)

### 3.8. `@react-email/ui` como devDependency — gera vuln "moderate" por postcss/next

- O `npm audit` marca `@react-email/ui` com moderate por herdar a vuln do `postcss` via `next`. Sendo devDependency sem vetor de produção, é informativo.

---

## 4. Lockfile e scripts

- **package-lock.json:** presente. `postinstall: prisma generate` — legítimo e necessário.
- **Scripts suspeitos:** nenhum `preinstall` ou `postinstall` anormal em deps de terceiros detectado.
- **`npm run build`:** executa `db:apply-pending` antes do `next build` — risco documentado no `_context.md` (nunca rodar sem `SKIP_PENDING_MIGRATIONS=1` em dev).
- **`prisma 7.7` (beta):** versão beta em produção. Sem vuln de segurança confirmada, mas monitorar issues de estabilidade. SECURITY.md §5 LOW documenta isso.
- **`next-auth 5.0.0-beta.30`:** beta em produção há meses. Monitorar release de `5.0.0` stable em https://github.com/nextauthjs/next-auth/releases.

---

## 5. npm outdated (falhou por timeout)

`npm outdated` excedeu o timeout de 60s nesta execução (provavelmente por resolução de registry lenta). Majors conhecidos em beta/atraso identificados por análise direta do `package.json`:

| Pacote | Versão atual | Status |
|---|---|---|
| `next-auth` | 5.0.0-beta.30 | Beta em prod — aguardar stable |
| `prisma` | 7.7.0 | Beta (maio 2026) — monitorar issues |
| `next` | 16.2.6 | Versão atual — OK |

---

## 6. Achados no formato padrão da auditoria

### [Baixo] xlsx HIGH sem fix — export-only, risco aceito e documentado

- **Agente responsável:** Dependências (Agente 12)
- **Categoria:** Supply Chain / Vulnerabilidade conhecida
- **Arquivo:** `src/components/admin/report-viewer.tsx:102`
- **Linha/trecho:** `const XLSX = await import("xlsx")`
- **Evidência:** Apenas `XLSX.utils.aoa_to_sheet`, `XLSX.utils.book_new`, `XLSX.utils.book_append_sheet`, `XLSX.write` são chamados. `XLSX.read` ausente em todo o codebase.
- **Descrição:** CVEs exigem parsear arquivo hostil com `XLSX.read`. O app só gera exports a partir de dados internos do banco.
- **Impacto real:** Nenhum vetor ativo — atacante precisaria induzir o servidor a parsear um XLSX hostil, o que não é possível com o código atual.
- **Recomendação:** Migrar para `exceljs` em ciclo de manutenção normal. Bloquear adição de `XLSX.read` em code review.
- **Status:** Recomendado (baixa urgência)
- **Confiança:** Alta

### [Informativo] animejs declarada em dependencies sem nenhum uso

- **Agente responsável:** Dependências (Agente 12)
- **Categoria:** Dependency hygiene
- **Arquivo:** `package.json:31`
- **Linha/trecho:** `"animejs": "^4.4.1"`
- **Evidência:** Zero importações em `src/`. `gsap` é o único motor de animação em uso (`src/components/main/anim/landing-animations.tsx:29`).
- **Impacto:** Superfície de `node_modules` desnecessária; ligeiro aumento de tamanho do bundle de dependências.
- **Recomendação:** `npm uninstall animejs`
- **Status:** Recomendado
- **Confiança:** Alta

### [Informativo] zustand declarada em dependencies sem nenhum uso

- **Agente responsável:** Dependências (Agente 12)
- **Categoria:** Dependency hygiene
- **Arquivo:** `package.json:60`
- **Linha/trecho:** `"zustand": "^5.0.12"`
- **Evidência:** Zero importações em `src/`. Nenhum store implementado.
- **Recomendação:** Remover até implementar stores efetivos.
- **Status:** Recomendado
- **Confiança:** Alta

### [Informativo] shadcn CLI em dependencies (deveria ser devDependencies)

- **Agente responsável:** Dependências (Agente 12)
- **Categoria:** Dependency classification
- **Arquivo:** `package.json:53`
- **Linha/trecho:** `"shadcn": "^4.2.0"` (em `dependencies`)
- **Evidência:** Nenhum `import` em runtime. Função: CLI de scaffolding de componentes shadcn/ui.
- **Recomendação:** Mover para `devDependencies` ou remover (uso via `npx shadcn`).
- **Status:** Recomendado
- **Confiança:** Alta

---

## 7. Resumo de ações

| Prioridade | Ação | Risco de quebra |
|---|---|---|
| P1 (planejada) | Migrar `xlsx` → `exceljs` em `report-viewer.tsx` | Baixo |
| P2 (baixa urgência) | `npm audit fix` para `brace-expansion` (devDep) | Nenhum |
| P3 (hygiene) | `npm uninstall animejs zustand` | Nenhum |
| P3 (hygiene) | Mover `shadcn` para devDependencies | Nenhum |
| P4 (monitorar) | Migrar `next-auth` para stable 5.0.0 | Médio |
| P4 (monitorar) | Monitorar `mercadopago` SDK v3 sem breaking | Alto se agir agora |
