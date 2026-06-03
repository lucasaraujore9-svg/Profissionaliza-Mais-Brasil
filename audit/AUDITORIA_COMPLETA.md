# AUDITORIA TÉCNICA COMPLETA — Profissionaliza Mais Brasil

**Data:** 2026-05-28 · **Orquestrador:** Claude (multiagente) · **Branch:** main
**Documentos irmãos:** `RESUMO_EXECUTIVO.md`, `MATRIZ_DE_RISCOS.md`, `MATRIZ_DE_PERMISSOES.md`, `PLANO_DE_ACAO.md`, `CHECKLIST_PRODUCAO.md`, `CHECKLIST_ISO_READINESS.md` e os 15 relatórios parciais em `agent-reports/`.

---

# 🔧 RODADA CORRETIVA 2026-06-03 — Erros e inconsistências corrigidos

> **Esta seção é a 2ª passada (2026-06-03), posterior à auditoria/hardening de 2026-05-28 (commit `9cad7b5`).**
> Documentos autoritativos desta rodada: **`CORRECOES_APLICADAS.md`** e **`INCONSISTENCIAS_CORRIGIDAS.md`**.

**Metodologia:** 16 finders paralelos (autz por área, isolamento de tenant, consistência sistêmica + regras de negócio, bugs, a11y, performance, schema, secrets, diff em andamento) → **verificação adversarial** das descobertas critical/high → correção (inline para segurança; 9 agentes paralelos para a11y) → validação.

**Descobertas (verificadas):** 66 — **0 Crítico · 10 Alto · 23 Médio · 21 Baixo · 12 Info** · 0 refutadas. Os 12 Info confirmaram que superfícies sensíveis (MRR/ARR, mark-paid, approve, impersonate, billing) **já estão corretamente restritas**.

**Padrão dominante:** *remediação parcial entre rotas irmãs* na rodada anterior — o "representante" de cada família foi corrigido (`revoke`, `approve`, `comissoes/demonstrativo`), mas as **rotas irmãs** ficaram sem o mesmo gate. Esta rodada uniformizou cada família.

### Erros e inconsistências corrigidos (resumo)
1. **Escalonamento de privilégio** — `requireResellerOwner` deixava consultor passar no guard owner-only (podia elevar o próprio `maxDiscount` a 100%). Corrigido com checagem de owner direto (`User.tenantId`).
2. **Vazamento/mutação cross-tenant de certificados (PII: nome+CPF)** — `download`/`regenerate`/`issue`/`enrollments` sem escopo de tenant. Corrigido com helper `adminCanAccessCertTenant` + escopo `__pmb__`-aware.
3. **Vazamento financeiro cross-manager (PIX/valores)** — leitura/export de saques e comissões sem escopo de `accountManagerId`. Corrigido (PMB_SALES→403; MGR→escopo).
4. **API × UI desalinhadas** — `analytics`, `tenant-payments`, `overdue`, `catalogo/sync(-log)` aceitavam toda a equipe PMB embora a UI seja SUPER_ADMIN-only. Corrigido.
5. **Relatórios cross-tenant** — PMB_SALES gerava relatórios de todos os revendedores; agregado `alunos-por-revendedor` vazava a MGR. Corrigido (flag `pmbSalesAllowed` + `needsSuperAdmin`).
6. **Bug de perda de dados** — salvar Unidade Técnica zerava `tecnicaCourses`. Corrigido (update condicional).
7. **Drift monetário** — preview de cupom em float vs cobrado em `Decimal`. Corrigido (`applyCouponDiscount`).
8. **Drift schema↔banco** — `onDelete` implícito `SetNull` vs `RESTRICT` real em `Enrollment`/`Payment`. Corrigido (anotação explícita).
9. **IDOR `checkout/status`** + **rate-limit ausente** em `validate-ref`/`capture-ref`. Corrigido.
10. **Acessibilidade** — 8 componentes (drawers sem dialog/Escape, inputs sem rótulo, ação destrutiva sem confirmação, botões-ícone sem nome, toggle sem `role=switch`). Corrigido.

**Arquivos alterados:** 30 modificados + 3 novos (`src/lib/certificates/admin-scope.ts`, `.../admin-scope.test.ts`). **Validação:** typecheck ✅ · lint ✅ · vitest ✅ **33/33**.

**Ainda aberto (decisão humana):** R1 (CPF em bucket público — **P0 infra**), R3 (RLS), R13/R15/R23 (LGPD/sessão), agendamento de crons (`vercel.json`×pg_cron), M7/M8 (sweep/prazo), CSP, índices/FK. Detalhe em `INCONSISTENCIAS_CORRIGIDAS.md › Pendências`.

---

# 📜 AUDITORIA 2026-05-28 (rodada anterior — preservada abaixo)

---

## 1. Resumo executivo
Sistema SaaS multi-tenant de revenda de cursos, **maduro e bem defendido** na superfície clássica de
segurança. Typecheck, lint e (lógica de) build verdes. Riscos reais concentrados em: **1 Crítico de
privacidade** (CPF em bucket público), **autorização inconsistente entre papéis PMB**, **bugs em
fluxos de dinheiro**, **ausência total de testes** e **lacunas de LGPD** (exclusão, audit log,
consentimento de analytics). Risco geral **MÉDIO**. Ver `RESUMO_EXECUTIVO.md`.

**Contagem adjudicada:** Crítico **1** · Alto **16** · Médio **15** · Baixo **6** · Informativos diversos · Corrigido **1**.

## 2. Escopo da auditoria
- Código-fonte completo em `src/` (718 arquivos `.ts/.tsx`), `prisma/`, `scripts/`, configs de raiz.
- 200 route handlers, 108 páginas, 253 componentes, 107 libs, 31 migrations, 31 models, proxy multi-tenant.
- Integrações: Mercado Pago, Asaas, plataforma parceira, Vercel (domínios), Upstash, Supabase Storage, WhatsApp gateway, e-mail.
- **Fora de escopo:** segredos reais (`.env.local`/`.env.vercel.production`), execução DAST com banco real, infraestrutura Supabase/Vercel além do código, conteúdo da plataforma parceira.

## 3. Metodologia multiagente
16 papéis: Orquestrador (1), Reconhecimento (01), Segurança (02), Supabase/RLS/Storage (03),
Auth/Acesso (04), Arquitetura Next (05), Rotas/APIs (06), Bugs/Regras (07), UI/W3C/A11y (08),
Performance (09), Testes (10), DevOps (11), Dependências (12), Compliance/LGPD/ISO (13),
Red Team (14), Validador (15). Cada agente leu arquivos reais, citou `arquivo:linha`, classificou por
severidade e separou confirmado de hipótese. O **Red Team** desafiou e recalibrou; o **Validador**
adjudicou severidades finais, deduplicou e refutou achados frágeis. Referências: OWASP Top 10 2021,
ASVS, CWE, ISO 27001/27002, ISO 25010, WCAG 2.2, LGPD.

## 4. Mapa técnico do projeto
Next.js 16.2.6 (App Router) · React 19 · TS strict · Prisma 7.7 + `@prisma/adapter-pg` + `pg` Pool ·
PostgreSQL/Supabase · NextAuth v5 (Credentials/JWT) · Upstash Redis · Tailwind 4 + shadcn/ui · Zod 4 ·
npm. Detalhes completos em `agent-reports/01-reconhecimento.md`.

**Dois fatos estruturais:** (a) **RLS não é aplicado** — Prisma conecta como owner; autorização vive
100% no app. (b) **Zero testes**; CI só lint+typecheck (audit informativo).

## 5. Comandos executados
| Comando | Resultado |
|---|---|
| `npm run typecheck` | **exit 0** (1ª e 2ª execução) |
| `npm run lint` | **exit 0** (1ª e 2ª execução) |
| `npm audit` | 14 vulns (1 HIGH `xlsx`, 10 moderate, 3 low) |
| `npm run build` | **não executado** — `build` roda `db:apply-pending` que muta o banco. Usar `SKIP_PENDING_MIGRATIONS=1 npx next build` em ambiente isolado. |
| inventário (`find`/`grep`) | 718 ts/tsx, 200 rotas, 108 páginas, 31 migrations |

## 6. Resultado de lint, typecheck, test, build e audit
- **Lint:** ✅ limpo. **Typecheck:** ✅ limpo. **Test:** ❌ inexistente (0 arquivos). **Build:** ⚠️ não
  rodado por mutar DB; lógica de tipos/lint válida. **Audit:** ⚠️ 14 vulns, severidade real rebaixada
  pelo padrão de uso (ver §23).

## 7. Visão geral de riscos
Ver `MATRIZ_DE_RISCOS.md` (R1–R38 com impacto, probabilidade, prioridade e status). Concentração:
privacidade (R1, R12–R15), autorização (R3, R4, R6, R22–R24), dinheiro (R2, R5–R9), performance (R16,
R32), DevOps (R17, R27), qualidade (testes).

## 8. Achados críticos
**R1 — [CRÍTICO] Certificados com PII (nome+CPF) em bucket Supabase público e enumerável.**
- Arquivos: `src/lib/certificates/storage.ts`, `generate-pdf.ts:~70`, `src/lib/certificates/code.ts:8-9`, `src/app/validar/[code]/page.tsx`, rota de download.
- Evidência: URL `/storage/v1/object/public/certificates/{tenantId|pmb}/{code}.pdf`; `code` aparece em `/validar/{code}` e tem **~28 bits** de entropia (8º hex descartado); Storage acessado direto sem rate-limit (o limite de `/validar` não cobre o Storage).
- Impacto: download anônimo em massa de PDFs com PII → violação LGPD (arts. 6, 46, 48), CWE-200/CWE-330, OWASP A01/A02.
- Cenário: atacante varre `code`s observados/forjados e baixa certificados sem autenticação.
- Recomendação: bucket privado + signed URL curta por rota autenticada; código de alta entropia; rate-limit. Alternativa: validação pública sem CPF + download autenticado.
- **Status: Requer decisão humana** (muda fluxo público de validação). **Confiança: Alta.**

## 9. Achados altos
Resumo (detalhe em `MATRIZ_DE_RISCOS.md` e relatórios parciais):
- **R2** Orphan enrollment no `/api/checkout` (sem try/catch no bloco MP) — `checkout/route.ts:~304-441` (07).
- **R3** RLS ausente / sem defesa em profundidade — `prisma.ts:15-21` (03).
- **R4** PMB_SALES/PMB_RESELLER_MGR alteram status/policy/billing de qualquer tenant — `admin/revendedores/[id]/*` (05, 14).
- **R5** Float no desconto de cupom em `/api/checkout` e `admin/vendas` — (07).
- **R6** Cupom FIXED burla cap de 50% — `admin/vendas:~227-236` (07, 14).
- **R7** `setMonth` sem clamp no sweep de inadimplência — `sweep-students-overdue:115-116` (07).
- **R8** OVERDUE de venda direta PMB não bloqueia na plataforma — `asaas/process.ts:182-190` (07).
- **R9** `/api/checkout` sem rate-limit (06).
- **R10** Senha temporária em resposta JSON plaintext — `admin/revendedores/route.ts:~378` (06).
- **R11** `alterar-senha-inicial` sem rate-limit/sem senha atual (04, 06).
- **R12** Storage 100% service-role sem policies de defesa em profundidade (03).
- **R13** Direito de exclusão LGPD não implementado (13).
- **R14** Audit log não persistido em banco (13).
- **R15** Vercel Analytics ignora consentimento de cookies — `layout.tsx:110-111` (13).
- **R16** Relatórios/broadcast/analytics sem limite → OOM/timeout (09).
- **R17** Build muta DB sem advisory lock; sem staging (11).

## 10. Achados médios
R18 CSP `unsafe-inline`/`unsafe-eval`; R19 uploads sem rate-limit; R20 `x-forwarded-for` como chave de RL;
R21 `GET /cobranca/[paymentId]` vaza info financeira; R22 `mustChangePassword` só no client; R23 JWT 30d
sem revogação; R24 revoke de certificado cross-scope; R25 FK `onDelete:SetNull` contábil; R26 `tenantId`
nullable sem CHECK; R27 bootstrap de migrations mascara drift; R28 `proxy.ts:189 includes(".")`; R29
duplicação de checkout/helpers/`TenantContext`; R30 5 itens WCAG nível Alto; R32 cache/PgBouncer.

## 11. Achados baixos
R33 `xlsx` HIGH (uso só export); R34 `animejs`/`zustand` não usados, `shadcn` mal classificado; R35 bcrypt
cost/min-senha inconsistentes; R36 HMAC MP sem janela temporal; R37 `db:reset` sem guarda/`target ES2017`;
R38 `termsAcceptedAt`/retenção ausentes.

## 12. Achados informativos
- Rate-limit é **fail-closed em prod** (correção de percepção); comentário em `auth.ts:89` está correto ("dev").
- `zustand` declarado mas sem store em uso; split incompleto `lib/schemas` vs `lib/validation`.
- Sem function/trigger/RPC no Postgres; anon key nunca usada no client.
- Impersonation, caps de cupom e "último super admin" corretamente validados server-side.

## 13. Segurança aplicacional
Ver `agent-reports/02-seguranca.md`. Sem Críticos/Altos *de aplicação* confirmados (o Crítico R1 é de
Storage/privacidade). Vetores clássicos mitigados: sem `eval`, sem CORS wildcard, sem secret em
`NEXT_PUBLIC_*`, proxy sanitiza headers, uploads validam MIME+magic bytes+5MB. Pendências: CSP (R18),
rate-limit de upload (R19), `x-forwarded-for` (R20), info financeira em `/cobranca` (R21).

## 14. Supabase, PostgreSQL, RLS e Storage
Ver `agent-reports/03-supabase-rls.md`. **RLS ausente/bypassed** (R3) — único ponto de policy
(`20260430_notification_preferences`) só nega `anon`, inócuo. Storage service-role sem policies (R12),
bucket `certificates` público com PII (R1). FK `onDelete` contábil (R25), `tenantId` nullable (R26).
Pontos positivos: filtros `where tenantId` da sessão consistentes; uploads sem path traversal.

## 15. Autenticação, autorização e níveis de acesso
Ver `agent-reports/04-auth-acesso.md`. Base sólida (NextAuth v5, bcrypt, RL, cookies endurecidos,
login de aluno escopado por tenant, layouts checam role server-side). Lacunas: R4 (escopo de papéis
PMB), R22 (`mustChangePassword`), R23 (revogação de sessão), R11 (troca de senha). 30/200 rotas sem auth
— todas públicas intencionais ou gated por token/HMAC.

## 16. Matriz de permissões
Ver `MATRIZ_DE_PERMISSOES.md`. Destaque: **não há camada DB/RLS**; autorização = UI + API. Pontos de
atenção: R1, R4, R6, R21, R22, R24.

## 17. Rotas, APIs, Server Actions e Middleware
Ver `agent-reports/06-rotas-apis.md` (200 rotas tabeladas + 2 server actions seguras). Achados: R9, R10,
R11, R16, R28. Webhooks e crons protegidos; proxy seguro mas com `includes(".")` causando falhas
funcionais na vitrine.

## 18. Arquitetura Next.js e full-stack
Ver `agent-reports/05-arquitetura-next.md`. Boa separação por libs de domínio; lógica em API routes
(server actions quase não usadas). Dívidas: R29 (checkout 3x duplicado, helpers/`TenantContext`
duplicados — causa-raiz de R2/R5), 15 páginas com role-check manual, componentes grandes, `zustand`
declarado sem uso, split de schemas incompleto.

## 19. Bugs e inconsistências
Ver `agent-reports/07-bugs-consistencia.md`. Foco em dinheiro/matrícula: R2 (Crítico→Alto), R5, R6, R7,
R8. Cada um com reprodução e teste sugerido.

## 20. UI, layout, W3C e acessibilidade
Ver `agent-reports/08-ui-w3c-acessibilidade.md`. 5 itens WCAG nível Alto (R30): foco invisível (2.4.11),
erros sem `role="alert"` (4.1.3), formulários sem `autocomplete` (1.3.5), hierarquia h1→h3 (1.3.1),
slideshow sem pausa (2.2.2) + 9 médios + 6 baixos. Correções localizadas e verificáveis.

## 21. Performance e escalabilidade
Ver `agent-reports/09-performance.md`. Altos: relatórios sem `take`, broadcast `scope=ALL` + N+1,
analytics 180d em memória (R16). Médios/baixos: dashboards sem cache, pool=10 sem PgBouncer (R32),
178 Client Components sem `dynamic()`, `force-dynamic` na home/vitrine.

## 22. Testes e qualidade
Ver `agent-reports/10-testes.md`. **0 testes** num sistema que move dinheiro. Stack recomendada: Vitest
(unit) + Playwright (e2e). Top prioridades: `applyCouponDiscount`, `validateMpWebhookSignature`,
`addMonthsClamped`, `isValidCpf`/`crypto`, idempotência de `fulfillEnrollment`, e2e de acesso/IDOR.

## 23. Dependências e supply chain
Ver `agent-reports/12-dependencias.md`. 14 vulns; severidade **real** baixa: `xlsx` HIGH só no caminho
de export (`XLSX.read` nunca chamado), `nodemailer`/`uuid`/`postcss`/`brace-expansion` sem vetor ativo.
Ações: migrar `xlsx`→`exceljs`, remover `animejs`/`zustand`, mover `shadcn` p/ devDeps, `npm audit fix`
do `brace-expansion`.

## 24. DevOps, deploy e ambientes
Ver `agent-reports/11-devops-config.md`. Altos: deploy muta DB sem advisory lock (R17), 18 env usadas
sem doc (R31, **corrigido em `.env.example`**), 7 documentadas sem uso (inclui `SUPABASE_ACCESS_TOKEN`
de admin). Médios: `AUTH_SECRET`/`NEXTAUTH_SECRET` ambos opcionais, sem staging, `db:reset` exposto.
Checklist em `CHECKLIST_PRODUCAO.md`.

## 25. Compliance, LGPD e preparação ISO
Ver `agent-reports/13-compliance-lgpd-iso.md` e `CHECKLIST_ISO_READINESS.md`. Prontidão **Parcial**.
Forte: política/termos/contrato publicados, DPO nomeado, consentimento de lead, impersonation auditada.
Lacunas: R1 (PII pública), R13 (exclusão), R14 (audit log), R15 (analytics), DPAs documentais, retenção.

## 26. Red Team: cenários de ataque
Ver `agent-reports/14-red-team.md`. 11 cenários, 4 achados novos, 5 refutados, 3 recalibrados.
**Confirmados:** raspagem de CPF (R1), suspensão/reconfiguração de qualquer revendedor por PMB_SALES
(R4), revoke cross-scope (R24), cupom FIXED (R6). **Refutados:** forja de webhook Asaas/MP, IDOR em 10
rotas `[id]`, injeção de header de tenant, brute-force fail-open, path traversal de upload.

## 27. Correções aplicadas
- **`.env.example`** reescrito e alinhado a `src/lib/env.ts` — documenta as ~18 variáveis usadas mas
  ausentes (incl. `MP_WEBHOOK_SECRET`, `AUTH_SECRET`, `PMB_*`, `WA_GATEWAY_*`, `EA_STUDENT_LOGIN_URL`,
  `AXIOM_*`, `DATABASE_POOL_MAX`, vars públicas de contato) com avisos sobre `SUPABASE_ACCESS_TOKEN`.
  Typecheck/lint permanecem verdes. (R31 — parcial; falta configurar as vars no Vercel.)

## 28. Correções recomendadas
Detalhadas em `PLANO_DE_ACAO.md` (FASE 1/2/3). Não aplicadas automaticamente por envolverem decisão de
negócio, mudança de permissão, fluxo de pagamento/PII, ou risco de quebra (conforme regras da auditoria).

## 29. Riscos aceitos ou pendentes
- `xlsx` HIGH: risco aceito documentado em `docs/SECURITY.md` (uso só export). Recomenda-se migração eventual.
- CSP com `unsafe-inline`/`unsafe-eval`: aceito por dependência do SDK MP; migrar p/ nonce.
- RLS ausente: risco arquitetural a ser decidido (defesa em profundidade vs custo de migração).

## 30. Plano de ação por prioridade
Ver `PLANO_DE_ACAO.md`. FASE 1 (urgente/produção): R1, R2, R4, R5, R6, R7, R8, R9, R10, R11.
FASE 2 (curto prazo): testes, R16, R30, R21, R22, R24, R19, R20, R29. FASE 3 (médio prazo): R3, R12–R15,
R17, R23, R18, R32, R33–R38.

## 31. Checklist de produção
Ver `CHECKLIST_PRODUCAO.md`.

## 32. Checklist de readiness para auditoria
Ver `CHECKLIST_ISO_READINESS.md` — prontidão **Parcial**.

## 33. Limitações da auditoria
- Análise **estática** + raciocínio adversarial; sem DAST/execução com banco real.
- RLS inferido pelo modo de conexão e migrations; não inspecionado por conexão direta.
- A11y/UI sem navegador/axe-core/Lighthouse; contraste avaliado por inspeção de tokens.
- Segredos reais não lidos (gitignored).
- `npm run build` não executado (mutaria o banco).
- **Nenhuma área ficou sem análise:** as 200 rotas, 31 migrations, proxy, libs, schemas, componentes,
  configs, CI, env e dependências foram cobertos. Onde a profundidade foi amostral (ex.: leitura
  exaustiva de cada um dos 253 componentes), está sinalizado nos relatórios parciais. **Itens
  explicitamente não analisados dinamicamente:** comportamento em runtime, infra Supabase/Vercel,
  conteúdo/contratos da plataforma parceira, evidências documentais de DPA/backup/IR (exigem acesso
  organizacional).

## 34. Próximos passos
1. Tratar **R1** (privacidade/CPF) imediatamente — maior risco jurídico.
2. Aplicar correções de dinheiro e permissão da FASE 1 (com testes manuais do checkout).
3. Configurar as variáveis obrigatórias no Vercel (esp. `MP_WEBHOOK_SECRET`).
4. Introduzir Vitest + Playwright e adicionar job de testes no CI.
5. Endereçar LGPD técnico (exclusão, audit log persistente, consentimento de analytics) e formalizar
   pendências documentais.
6. Reexecutar esta auditoria como squad fixo a cada release maior (os relatórios em `agent-reports/`
   servem de baseline reproduzível).
