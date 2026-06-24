# Ações manuais — exigem você (não executo sem OK)
_2026-06-24 · itens que a auditoria/correção NÃO aplica sozinha: infra, segredos, deploy, decisão de produto/arquitetura._

> O código já foi endurecido onde dava (8 commits no branch `fix/auditoria-2026-06-24`).
> Os itens abaixo dependem de você. Cada um traz o passo exato.

---

## 1. 🔴 P0 — Virar o bucket `certificates` para PRIVADO (DB-001 / LGPD-001)

**Por quê:** o bucket guarda PDF de certificado com **CPF + nome** (PII). Enquanto for público, um GET anônimo na URL do objeto retorna o PDF sem autenticação (incidente reportável à ANPD).

**Já está seguro no código** (commit `11bf3c0` + estado atual): TODOS os read-paths servem o PDF via **service-role/stream** ou **signed URL de curta duração** — nunca a URL pública. O `pdfUrl` no banco passou a guardar só o *path* (não a URL pública). Então **virar o bucket privado NÃO quebra download** (aluno, admin, painel, /validar).

**Passo (Supabase):**
1. Dashboard → **Storage** → bucket `certificates` → **Configuration/Settings** → desligue **"Public bucket"**.
   (Ou via SQL na console do projeto: `update storage.buckets set public = false where id = 'certificates';`)
2. **Verifique que o vazamento fechou:** `curl -I "https://<PROJECT>.supabase.co/storage/v1/object/public/certificates/<algum-path>.pdf"` deve passar de **200** para **400/404**.
3. **Verifique que o download ainda funciona:** baixe um certificado em `/aluno/cursos`, em `/admin/certificados` e abra um `/validar/<code>` — o PDF deve carregar normalmente (via signed URL/stream).

**Backfill opcional (não destrutivo):** as linhas antigas têm `pdfUrl` na forma de URL pública; o código lê ambas as formas, então **não é obrigatório**. Se quiser limpar:
```sql
-- converte URL pública legada -> path puro (idempotente; só afeta linhas no formato antigo)
update certificates
set pdf_url = split_part(pdf_url, '/storage/v1/object/public/certificates/', 2)
where pdf_url like '%/storage/v1/object/public/certificates/%';
```

---

## 2. 🟠 P1 — RLS no banco (SEG-001 / DB-002) — arquitetural, sua decisão

**Por quê:** o isolamento entre revendas é 100% em código (todo query escopado por `tenantId` na sessão). Funciona hoje (zero IDOR por input confirmado), mas **não há rede de segurança no banco**: um único `findMany` futuro sem `where:{tenantId}` vaza dados entre revendas. O risco **aumenta** na migração para Postgres self-hosted (acesso direto fora da app).

**Não implemento sozinho** (mudança estrutural ampla + risco de quebrar tudo). Abordagem recomendada (faseada):
1. Habilitar RLS nas tabelas tenant-scoped, com policy keyada num GUC de sessão (ex.: `current_setting('app.current_tenant')`).
2. Setar o GUC via `SET LOCAL` por request, dentro de uma transação Prisma (`$transaction`) — **cuidado:** `SET LOCAL` exige a mesma conexão; com Supavisor/pgBouncer em transaction-mode isso precisa de validação.
3. Rollout por tabela, começando pelas de maior risco (Student, Enrollment, Payment, Certificate), com **teste de isolamento de tenant** (já é o gap QA — ver COBERTURA).

Decida se/quando topa esse projeto; descrevo o plano detalhado quando quiser.

---

## 3. 🟠 P1 — Desacoplar migrations do `next build` (OPS-001) — sua decisão de deploy

**Por quê:** `npm run build` roda `db:apply-pending` ANTES do `next build` (aplica DDL na prod durante o build). O pior caso (DB novo) já foi mitigado (`coreSchemaExists`), por isso rebaixei de P0→P1. Mas qualquer `build` com env de prod (rollback, build manual, preview) dispara DDL sem janela/revisão.

**Opção recomendada:** tirar `db:apply-pending` do script `build` e rodá-lo como **passo de deploy separado** (job de CI/CD pós-build, idealmente com aprovação). Posso preparar a mudança de `package.json` + CI, mas **muda o fluxo de deploy** — confirme antes.

---

## 4. 🟠 Segredos em produção (SEG-006) — verificar/rotacionar no Vercel

Confirme que estão setados no Vercel (Production) e no lado do LMS:
- `PMB_WEBHOOK_SECRET` — **sem ele o receiver do webhook LMS responde 503** (certificado/progresso/suporte do LMS não chegam). O **lado LMS** precisa apontar `PMB_WEBHOOK_URL` para `https://profissionalizamaisbrasil.com.br/api/webhooks/lms` e assinar com **este mesmo segredo**.
- `MP_WEBHOOK_SECRET`, `ASAAS_WEBHOOK_TOKEN` — sem eles os webhooks de pagamento são rejeitados (sem matrícula automática).
- `ENCRYPTION_KEY`, `CRON_SECRET`, `LMS_API_URL`/`LMS_API_KEY`.

**Runbook de rotação do `ENCRYPTION_KEY`:** rotacionar quebra a leitura de tudo que está cifrado em repouso (mpAccessToken dos tenants, `lmsSenha`/`plataformaAlunoSenha` por matrícula) — exige re-cifrar os dados com a chave nova numa migração controlada. **Não rotacione sem esse plano.**

---

## 5. 🟠 P1 — Consentimento de cookies/pixels (LGPD-002) — decisão de PRODUTO

**Estado atual (decisão do dono):** pixels (Meta/TikTok/Google Ads) e Vercel Analytics **carregam automaticamente**; o banner de cookies é só informativo ("Entendi"). Isso **diverge da LGPD** (base legal de consentimento) e da própria Política, seção 11.

Como foi uma **escolha de produto deliberada**, não altero sozinho. Se quiser conformidade: banner com **Aceitar/Recusar** e carregar os trackers só após opt-in (o `analytics-gate.tsx` já é o ponto de gating). Confirme que quer mudar o comportamento.

---

## 6. 🟡 Docs/processo (posso escrever; precisam da sua validação)

- **OBS-002 — DR/runbook:** sem RTO/RPO/runbook de incidente. Posso redigir `docs/ops/DR-RUNBOOK.md` (alvos de recuperação + passo-a-passo de restore + rollback). Histórico do projeto tem incidentes (crons mortos 6 semanas, outage Redis) — vale ter.
- **LGPD-004 — ROPA/subprocessadores:** sem lista nominal (Asaas/MP/EA/LMS/Resend/Upstash/Supabase/Vercel + pixels, vários com transferência internacional). Posso redigir `docs/legal/SUBPROCESSADORES.md` + ROPA; você valida contra os DPAs reais.

---

## 7. 🟡 ⚠️MIGRAÇÃO Vercel→VPS (pré-cutover, NÃO agora — OPS-002/003/004/005)

Não bloqueia a produção atual. Checklist consolidado no `RELATORIO.md` (seção ⚠️MIGRAÇÃO). Principais: `@upstash/redis` REST→TCP (`ioredis`/SRH), `output:'standalone'` + Dockerfile/stack Swarm, `proxy.ts` Edge→Node, Supabase Storage→MinIO (reescrever URLs persistidas — já mitigado para certificados ao guardar path), pg_cron→scheduler próprio, Swarm secrets.
