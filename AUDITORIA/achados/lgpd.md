# Auditoria — LGPD / Compliance
_Data: 2026-06-24 · Referência: .claude/skills/auditoria-saas/references/10-compliance-lgpd.md · Itens do inventário cobertos: 28/28 relevantes_

## Resumo
- Itens verificados: 28 · Achados: P0=1 P1=3 P2=2 P3=3 · Nota do domínio: 5/10
- Síntese: re-verificação contra o código de 2026-06-24. **Dois achados da rodada anterior foram corrigidos no código** — LGPD-003 (erasure do aluno agora propaga para `studentName`/`studentCpf` dos certificados e apaga os PDFs, commit `843d916`) e a parte de read-path do LGPD-006 (o fallback `redirect(pdfUrl,302)` virou 502 logado e as listagens admin/painel deixaram de devolver `pdfUrl` cru, expondo só `hasPdf`). **Permanecem abertos:** o R1 (LGPD-001 — bucket `certificates` historicamente PÚBLICO com CPF; toggle é externo ao repo e o `pdf_url` ainda é persistido na forma pública em `generate-pdf.ts:172`), a camada de consentimento de cookies/pixels (LGPD-002 — banner só "Entendi", pixels e Vercel Analytics carregam sem gate), a ausência de ROPA/subprocessadores nominais (LGPD-004), e a não-declaração de residência (LGPD-005). **Achados NOVOS:** ausência total de retenção/expurgo para `StudentLead` e `ContactMessage` — que agora guardam `ipAddress`+`userAgent` indefinidamente (LGPD-009, P2); a allowlist de redação do logger não cobre `email`/`telefone`/`fone`/`senha`/`lmsSenha`/`plataformaAlunoSenha` (LGPD-010, P3); e as constantes `CONSENT_VERSION` ("2026-05-v1"/"2026-06-v1") divergem da versão pública dos documentos ("1.3"), enfraquecendo a accountability do consentimento registrado (LGPD-011, P3). Positivos confirmados: senhas do LMS (`Enrollment.lmsSenha`) e da plataforma cifradas AES-256-GCM; consentimento de contato dos leads agora é gravado server-side (`consentAccepted`/`consentVersion`); audit trail persiste em `audit_logs`; impersonação ("como aluno/revenda") tem trilha `impersonation.start`.

## Achados

### [LGPD-001] Certificados com CPF em bucket Supabase PÚBLICO (R1 ainda aberto); URL pública ainda persistida no banco
- **Severidade:** P0
- **Status:** Aberto
- **Local:** `src/lib/certificates/storage.ts:1` (`const BUCKET = "certificates"`), `:82-84` (`certificatePublicUrl` → `/storage/v1/object/public/`) · `src/lib/certificates/generate-pdf.ts:80` (placeholder `cpf`), `:172` (`data: { pdfUrl: upload.publicUrl }` — grava a URL **pública** no banco), `:175` · `prisma/schema.prisma` model `Certificate` (`student_cpf`, `pdf_url`) · `audit/MATRIZ_DE_RISCOS.md:6,14` (R1 listado em **"Bloqueados (decisão/externo)"**, severidade Crítico/P0)
- **Evidência:** A rodada de 2026-06-20 confirmou via Management API que o bucket `certificates` estava `public:true` e que um `curl` anônimo (sem auth) de `https://jpwskehhnplmmtgyyxmf.supabase.co/storage/v1/object/public/certificates/<tenantId>/<certId>.pdf` retornava **HTTP 200 / application/pdf** com nome completo + CPF do aluno. Nesta sessão a consulta live ao Supabase está fora de escopo (apenas leitura de repo), então o estado do toggle **não pôde ser re-confirmado**; porém, o repo não contém nenhuma migration/policy que privatize o bucket (`grep storage.buckets prisma/migrations prisma/sql` → vazio) e `audit/MATRIZ_DE_RISCOS.md:6` continua classificando R1 como "Bloqueado (decisão/externo)" — ou seja, sem evidência de fechamento. Além disso, `generate-pdf.ts:172` **ainda persiste `upload.publicUrl`** (a URL no formato `/object/public/`) na coluna `certificates.pdf_url`; mesmo que o bucket seja privatizado, qualquer URL antiga compartilhada/vazada continua sendo a URL pública. O read-path já está endurecido (download via service-role + signed URL na validação), o que é pré-requisito mas não fecha o R1.
- **Impacto:** Enquanto o bucket for público, exposição não autenticada de CPF + nome de qualquer aluno com certificado emitido — violação direta da LGPD (art. 46 segurança, art. 6º minimização) e da própria Política seção 10. Em produção com volume, é incidente reportável à ANPD.
- **Correção:**
  1. **Verificação manual (fora do repo):** confirmar no Supabase (Management API ou Dashboard → Storage) o estado de `storage.buckets where id='certificates'`. Se `public=true`, tornar **privado** (`public:false`). O read-path já suporta: as 3 rotas `/api/{student,admin,painel}/certificates/[id]/download/route.ts` baixam via service-role (`downloadCertificatePdf`) e `/validar/[code]/page.tsx:290-293` usa `createSignedCertificateUrl` (300s).
  2. Trocar `generate-pdf.ts:172` para persistir o **path interno** (resultado de `upload.path`) em vez de `upload.publicUrl`, OU gravar a forma `/object/<bucket>/<path>` (não-pública); ajustar `extractCertificatePath` (`storage.ts:134`) se o formato mudar. Backfill: re-gravar `certificates.pdf_url` de todos os registros para o novo formato (ou null + regenerar on-demand) para que nenhuma URL `/object/public/` persista.
  3. Adicionar policy de defesa em profundidade em `storage.objects` para o bucket (negar `anon`/`authenticated`; só service-role lê) — fecha R12.
- **Verificação:** `curl -sI <url pública de um cert>` → 400/403 (não 200). `select public from storage.buckets where id='certificates'` → `false`. `GET /api/student/certificates/[id]/download` autenticado continua 200 streamando o PDF. Nenhum `pdf_url` em `certificates` começa com `/object/public/` após o backfill.

### [LGPD-002] Cookies/pixels de rastreamento carregam ANTES e SEM consentimento; banner sem opção de recusar
- **Severidade:** P1
- **Status:** Aberto
- **Local:** `src/components/shared/tracking-pixels.tsx:8-34` (injeta GA4/Google Ads/GTM/Meta/TikTok/LinkedIn/Pinterest/Microsoft UET/Clarity/Hotjar `strategy="afterInteractive"`, comentário explícito ":11 sem gate de consentimento") · `src/components/shared/cookie-consent.tsx:18-29` (`writeDismissed` grava só `"accepted"`), `:40-44` (docstring: "Os scripts de analytics/pixels carregam automaticamente... este banner apenas informa"), `:88-94` (único botão "Entendi") · `src/components/shared/analytics-gate.tsx` (Vercel Analytics + SpeedInsights incondicional) · `src/components/loja/visitor-tracker.tsx` + `src/app/api/loja/track/route.ts` (cookie `pmb_vid` + `VisitorEvent` sem consentimento)
- **Evidência:** `TrackingPixels` retorna os `<Script>` de todos os trackers de terceiros sempre que houver config, sem ler nenhum estado de consentimento (`if (scripts.length === 0) return null` é a única condição). O `CookieConsent` oferece só "Entendi" (`writeDismissed` grava `localStorage["pmb_cookie_consent_v1"]="accepted"`); não há "Recusar" nem gestão granular. A própria Política seção 11 (`docs/legal/POLITICA-DE-PRIVACIDADE.md:137`) diz que "Cookies analíticos, publicitários ou de terceiros poderão depender de consentimento ou mecanismo equivalente de gestão de preferências" — prática diverge do documento.
- **Impacto:** Carregar trackers de finalidade publicitária (Meta/TikTok/Google Ads) antes do consentimento é tratamento sem base legal válida (consentimento não é livre/inequívoco). Aplica-se ao site PMB e às vitrines de revenda (os pixels da PMB propagam silenciosamente). Risco legal direto (rubrica item 1 e item 5).
- **Correção:**
  1. Transformar o banner em consentimento real: "Aceitar", "Recusar" e "Gerenciar" com categorias (necessários sempre; analíticos/publicitários opt-in). Persistir estado granular versionado (ex.: `pmb_cookie_consent_v2 = {analytics:bool, ads:bool, ts, version}`) em localStorage + cookie.
  2. Gatear `TrackingPixels` e `analytics-gate.tsx`: só montar scripts de categoria não-essencial quando a categoria correspondente for `true`. Reusar o `useSyncExternalStore` de `cookie-consent.tsx` como fonte do estado.
  3. Registrar o consentimento (o quê, quando, versão) — mínimo timestamp+versão no objeto persistido.
- **Verificação:** Com consentimento ausente/recusado, no DevTools Network não deve haver requisição a `google-analytics.com`/`connect.facebook.net`/`analytics.tiktok.com`. Teste de componente: montar `TrackingPixels` sem consentimento → `scripts.length === 0`.

### [LGPD-004] Sem lista nominal de subprocessadores / ROPA; Política só descreve categorias genéricas
- **Severidade:** P1
- **Status:** Aberto
- **Local:** `docs/legal/POLITICA-DE-PRIVACIDADE.md:85` (operadores/suboperadores genéricos), `:111` ("Empresas de tecnologia e hospedagem"), `:178-180` (seção 16 transferência internacional genérica) · ausência de `docs/legal/SUBPROCESSADORES.md` (só CONTRATO-DE-REVENDA, POLITICA-DE-PRIVACIDADE, TERMOS-DE-USO-ALUNO)
- **Evidência:** `grep -i "asaas|mercado pago|resend|upstash|vercel|supabase|lms.bmbr|google|meta|tiktok" docs/legal/*.md` não retorna nenhum operador nomeado na Política. O sistema, porém, transmite PII a: **Asaas** (cobrança revendas — CPF/e-mail/nome), **Mercado Pago** (pagamento aluno), **plataforma EA** (matrícula), **LMS lms.bmbr.com.br** (provisionamento de aluno — `src/lib/lms/`), **Resend** (e-mails), **Upstash** (cache/rate-limit), **Supabase** (banco+storage — todo o PII), **Vercel** (hospedagem + Analytics/SpeedInsights) e os pixels de terceiros. Nenhum nominado nem há ROPA.
- **Impacto:** Rubrica item 4 ("Subprocessadores mapeados e com base contratual; ROPA atualizado"). Sem isso não se atende ao direito do titular a informações sobre compartilhamentos (art. 18, citado em `:191`) nem se demonstra accountability à ANPD. Vários implicam transferência internacional (EUA).
- **Correção:** Produzir e versionar `docs/legal/SUBPROCESSADORES.md` listando cada operador, finalidade, dados tratados, país de processamento e base legal/DPA, cruzado contra `src/lib/{asaas,mercadopago,lms,plataforma-cursos,email,redis,storage}`. Publicar a lista (ou link) na Política seção 8. Verificar DPA com cada fornecedor (manual, fora do repo).
- **Verificação:** Doc existe com a lista completa cruzada contra as integrações reais de `src/lib/`. Verificação manual dos contratos/DPA.

### [LGPD-009] Sem retenção/expurgo de StudentLead e ContactMessage — PII (incl. IP+User-Agent) guardada indefinidamente
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `prisma/schema.prisma` model `StudentLead` (`nome`/`email`/`telefone` em :1944-1946, `ipAddress`/`userAgent` em :1980-1981) e model `ContactMessage` (`nome`/`email`/`telefone`/`mensagem` em :1322-1328, `ipAddress`/`userAgent` em :1339-1340) · `src/app/api/cron/sweep-abandoned-leads/route.ts:36-66` (apenas move stage para ABANDONED — nunca deleta) · `src/app/api/{loja/leads,pmb/leads,loja/checkout-inquiry,contato}/route.ts` (gravam `ipAddress`+`userAgent`) · `prisma/sql/pg_cron_jobs.sql:48-66` (crons de expurgo só cobrem webhook_logs e visitor_events)
- **Evidência:** `grep "studentLead.deleteMany|contactMessage.deleteMany" src/` → vazio. O único sweep de leads (`sweep-abandoned-leads`) chama `sweepAbandonedLeadsForContext` que reclassifica para ABANDONED, sem expurgo. As rotas de captura gravam o IP (`request.headers.get("x-forwarded-for")?.split(",")[0]`) e o user-agent: `loja/leads/route.ts:117-119,177-178`, `pmb/leads/route.ts:108-110,144-145`, `contato/route.ts:94-111`. Os únicos crons de retenção são `cleanup-webhook-logs` (90d) e `sweep-visitor-events` (90d) — nenhum toca leads ou mensagens de contato.
- **Impacto:** Viola a rubrica item 3 ("Retenção: prazos definidos + rotina de expurgo — não guardar para sempre") e o princípio da necessidade (art. 15/16 LGPD). Lead que nunca converteu e mensagem de contato (com nome/e-mail/telefone/IP/UA) acumulam para sempre, ampliando a superfície de um eventual vazamento e o escopo de uma requisição de exclusão.
- **Correção:**
  1. Definir prazo de retenção (decisão jurídica; sugestão: leads não-convertidos 12–24 meses; mensagens de contato resolvidas 12 meses). Documentar na Política (seção de retenção).
  2. Criar cron `sweep-stale-leads` (e/ou estender `cleanup-webhook-logs`) que faça `prisma.studentLead.deleteMany` de leads ABANDONED/sem conversão mais antigos que o prazo, e `contactMessage.deleteMany` de mensagens RESOLVED além do prazo. Registrar o job em `prisma/sql/pg_cron_jobs.sql` (padrão `app_internal.run_cron('/api/cron/...')`). Como alternativa de minimização menos agressiva: anonimizar `ipAddress`/`userAgent` (set null) após N dias mantendo o restante para histórico comercial.
  3. Proteger a rota com `isCronAuthorized` e `maxDuration`/batches como nos demais sweeps.
- **Verificação:** Após rodar o cron em staging, `select count(*) from student_leads where stage='ABANDONED' and updated_at < now() - interval '<prazo>'` → 0; idem para `contact_messages` resolvidas. Teste de unidade do helper de expurgo com dados sintéticos.

### [LGPD-005] Residência dos dados não declarada (região Supabase) + ⚠️MIGRAÇÃO muda residência e subprocessadores
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `docs/legal/POLITICA-DE-PRIVACIDADE.md:178-180` (transferência internacional genérica, sem região nem fornecedor) · `CLAUDE.md` ("Alvo de migração: VPS própria + MinIO + Postgres self-hosted") · MEMORY: `project_infra_vps_cloudflare`, `project_arquitetura_multiproduto`
- **Evidência:** A Política não declara a região do projeto Supabase (`jpwskehhnplmmtgyyxmf`) nem onde os dados residem; transferência internacional só genérica. ⚠️MIGRAÇÃO planejada troca Supabase Cloud por Postgres self-hosted + Redis TCP + storage MinIO/R2 numa VPS com Cloudflare — **muda a residência e o conjunto de subprocessadores** declarados.
- **Impacto:** Rubrica item 4 (residência conhecida e compatível com o prometido). Hoje há lacuna documental; na migração, Política + ROPA precisam ser atualizados antes do cutover, ou a prática diverge do documento. Se a região atual do Supabase for fora do BR, é transferência internacional que precisa de salvaguarda explícita.
- **Correção:** (a) Confirmar a região do projeto Supabase (Dashboard → Settings → General) e declarar residência/transferência na Política. (b) No plano de migração, incluir gate de compliance: atualizar Política + ROPA (LGPD-004) com a nova localização (VPS/Cloudflare/R2/MinIO) e regiões **antes** de migrar dados de produção; reavaliar a base de transferência internacional.
- **Verificação:** Manual — região do Supabase documentada; checklist de migração com gate de atualização da Política/ROPA antes do cutover.

### [LGPD-007] Checkbox de consentimento de contato pré-marcado (opt-in por padrão)
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `src/components/loja/lead-inquiry-card.tsx:32` (`const [consent, setConsent] = useState(true)`), `:145,151,162` · `src/components/loja/checkout-inquiry-form.tsx:35` (`useState(true)`), `:161,167,180`
- **Evidência:** O checkbox "Aceito receber contato via WhatsApp..." inicia marcado (`useState(true)`). Há bloqueio de submit (`disabled={... || !consent}`) e o consentimento é gravado server-side (positivo — ver LGPD-011), mas pré-marcado é soft dark-pattern; o opt-in defensável é desmarcado por padrão, sobretudo para comunicação comercial via WhatsApp.
- **Impacto:** Baixo — há checkbox real, bloqueio de submit e registro server-side; o default pré-marcado enfraquece a "manifestação livre".
- **Correção:** Iniciar `consent` em `false` (opt-in ativo) nos dois formulários, mantendo o gate de submit. O registro server-side (`consentAccepted`) já existe.
- **Verificação:** O checkbox aparece desmarcado por padrão; submit só habilita após marcar.

### [LGPD-010] Allowlist de redação do logger não cobre e-mail/telefone/senha (PII pode vazar em log futuro)
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `src/lib/logger.ts:45-103` (`REDACT_PATHS`) — cobre `password`/`token`/`cpf`/`cnpj`/`rg`/cartão/crypto, mas **não** `email`/`telefone`/`fone`/`fone2`/`senha`/`plataformaAlunoSenha`/`lmsSenha`/`nome`
- **Evidência:** `grep` no `REDACT_PATHS` confirma ausência de `email`, `telefone`/`fone`, `senha` (campos em português usados nos models — `password`/`passwordHash` são cobertos, mas `Student.plataformaAlunoSenha`/`Enrollment.lmsSenha` e os campos `*.senha` não). Hoje **nenhuma chamada de log passa esses campos inline** (varredura `grep "email:|telefone:|senha:" ... | grep logger` → vazio), então não é vazamento confirmado — é gap de defesa em profundidade. A rubrica item 3 nomeia explicitamente "Telefone/CPF/e-mail em log = P1"; CPF está coberto, mas e-mail/telefone não, e qualquer log futuro que espalhe um objeto `Student`/payload de webhook (Asaas/MP carregam `email`/`phone`) vazaria.
- **Impacto:** Baixo hoje (sem leak ativo); médio se um log de payload completo for adicionado. Senha cifrada em campo `senha`/`lmsSenha` logada por engano vazaria o ciphertext (e `iv`/`ciphertext` já são redactados, mas o nome do campo `senha` não).
- **Correção:** Adicionar a `REDACT_PATHS` os paths: `email`, `*.email`, `telefone`, `*.telefone`, `fone`, `*.fone`, `fone2`, `*.fone2`, `senha`, `*.senha`, `plataformaAlunoSenha`, `*.plataformaAlunoSenha`, `lmsSenha`, `*.lmsSenha`. Considerar masking parcial para e-mail/telefone (em vez de `[REDACTED]` total) para não atrapalhar suporte.
- **Verificação:** Teste do logger: logar `{ email, telefone, senha }` → saída com `[REDACTED]` nesses campos.

### [LGPD-011] Versão do consentimento registrado diverge da versão pública dos documentos
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `src/app/api/loja/leads/route.ts:17` (`CONSENT_VERSION = "2026-05-v1"`) · `src/app/api/pmb/leads/route.ts:14` (`"2026-05-v1"`) · `src/app/api/loja/checkout-inquiry/route.ts:15` (`"2026-06-v1"`) · `src/app/(main)/privacidade/page.tsx:34` ("Versão 1.3 — 10 de junho de 2026") · `src/app/(main)/termos/page.tsx:34` ("Versão 1.3 — 11 de junho de 2026")
- **Evidência:** O consentimento de contato dos leads agora é gravado com `consentVersion` (positivo vs. rodada anterior), mas há **três strings de versão distintas e hardcoded** ("2026-05-v1", "2026-05-v1", "2026-06-v1") que **não correspondem** à versão pública dos documentos jurídicos ("1.3"). Não há, além disso, registro de aceite versionado de Termos/Política por `Student`/`User` (não há `acceptedTermsVersion`/`acceptedTermsAt` nesses models).
- **Impacto:** Baixo — em disputa, a `consentVersion` gravada não rastreia para uma versão real/datada do documento exibido ao titular, enfraquecendo a comprovação. Hardcode triplicado dificulta manter coerência.
- **Correção:** Centralizar uma única constante de versão (ex.: `src/lib/legal/version.ts` exportando `LEGAL_VERSION = "1.3"` + data), referenciada pelas duas páginas e pelas três rotas de lead. Persistir, no cadastro de aluno/lead, a versão aceita + timestamp atrelada a essa constante. Idealmente registrar aceite de Termos/Política também para `Student`/`User`.
- **Verificação:** As três rotas e as duas páginas referenciam a mesma constante; novos leads gravam a versão atual; a string é única no repo.

## Cobertura
Itens do inventário e da referência relevantes ao domínio LGPD e seu veredito (28 itens):

- `src/lib/lgpd/anonymize.ts` (anonimização do owner — art. 18) — **OK** (cifra senha, INATIVO, audit; owner não tem certificado, logo sem propagação de cert necessária).
- `src/app/api/admin/revendedores/[id]/anonimizar/route.ts` — **OK** (SUPER_ADMIN-only, confirm literal, audit).
- `src/app/api/aluno/conta/route.ts` (DELETE — erasure do aluno) — **OK / LGPD-003 CORRIGIDO** (commit `843d916`: anonimiza Student + propaga `studentName="Conta removida"`/`studentCpf=null`/`pdfUrl=null` em `certificate.updateMany` e apaga PDFs via `deleteCertificatePdf`; audit log).
- `src/app/api/aluno/perfil/route.ts` (PATCH — retificação) — **OK** (direito de retificação, Zod, valida conflito de e-mail).
- `src/components/aluno/delete-account-section.tsx` / `src/components/painel/delete-account-request.tsx` — **OK** (fluxo do titular existe).
- `src/app/(main)/privacidade/page.tsx` + `docs/legal/POLITICA-DE-PRIVACIDADE.md` — **OK na base**; cookies → LGPD-002; subprocessadores → LGPD-004; residência → LGPD-005; versão → LGPD-011.
- `src/app/(main)/termos/page.tsx` + `docs/legal/TERMOS-DE-USO-ALUNO.md` — **OK** (tenant-aware); versionamento → LGPD-011.
- `src/app/(main)/reembolso/page.tsx` — **OK** (garantia 7 dias, canal claro).
- `src/components/shared/cookie-consent.tsx` — **Achado LGPD-002** (banner só "Entendi", sem recusar).
- `src/components/shared/tracking-pixels.tsx` + `src/lib/tracking/snippets.ts` + `(main)/layout.tsx` + `loja/layout.tsx` — **Achado LGPD-002** (pixels sem gate); snippets **OK** quanto a não enviar PII para pixels (sem advanced matching).
- `src/components/shared/analytics-gate.tsx` — **Achado LGPD-002** (Vercel Analytics/SpeedInsights incondicional).
- `src/components/shared/tracking-purchase-event.tsx` — **OK** (não envia email/CPF/telefone aos pixels).
- `src/components/shared/ref-cookie-capture.tsx` + `api/public/capture-ref|validate-ref` — **OK** (cookie httpOnly de indicação, finalidade legítima).
- `src/components/loja/visitor-tracker.tsx` + `src/app/api/loja/track/route.ts` + model `VisitorEvent` — **OK na minimização** (cookie anônimo `pmb_vid`, sem IP, sem query string); cookie/evento sem consentimento → relacionado a LGPD-002.
- `src/app/api/cron/sweep-visitor-events/route.ts` — **OK** (retenção 90 dias para eventos anônimos).
- `src/app/api/cron/cleanup-webhook-logs/route.ts` — **OK** (retenção 90 dias; preserva falhas).
- `src/app/api/cron/sweep-abandoned-leads/route.ts` — **Achado LGPD-009** (só reclassifica stage; nunca expurga).
- `prisma/schema.prisma` model `StudentLead` (`ipAddress`/`userAgent` :1980-1981) — **Achado LGPD-009** (retenção indefinida de IP/UA/PII).
- `prisma/schema.prisma` model `ContactMessage` (`ipAddress`/`userAgent` :1339-1340) — **Achado LGPD-009** (idem; sem expurgo).
- `src/app/api/{loja/leads,pmb/leads,loja/checkout-inquiry}/route.ts` (captura de lead + consentimento) — **OK no registro** (`consentAccepted`/`consentVersion` gravados — melhoria vs. rodada anterior); default pré-marcado → LGPD-007; versão divergente → LGPD-011.
- `src/app/api/contato/route.ts` (mensagem de contato) — **OK no fluxo**; armazena IP/UA sem expurgo → LGPD-009.
- `src/lib/certificates/storage.ts` + bucket `certificates` — **Achado LGPD-001 (P0)** (bucket público historicamente; `pdf_url` ainda persistido na forma pública em `generate-pdf.ts:172`).
- `src/lib/certificates/generate-pdf.ts` (CPF no PDF, persiste publicUrl) — **Achado LGPD-001**; path por cuid mitiga enumeração.
- `src/app/api/{student,admin,painel}/certificates/[id]/download/route.ts` — **OK / LGPD-006 read-path CORRIGIDO** (fallback 302→URL pública removido, agora 502 logado via `downloadCertificatePdf`/`extractCertificatePath`).
- `src/app/api/{admin,painel}/certificates/route.ts` (listagens) — **OK / LGPD-006 CORRIGIDO** (não expõem `pdfUrl` cru; só `hasPdf` boolean — :83/:102 e :56/:72).
- `src/app/validar/[code]/page.tsx` — **OK** (signed URL 300s, não a URL pública permanente).
- `src/lib/students/lms-credentials.ts` + `src/lib/students/load-detail.ts` + `Enrollment.lmsSenha` + `src/app/api/cron/resync-lms-credentials/route.ts` — **OK** (senha do LMS cifrada AES-256-GCM `encrypt()`; decifrada só server-side, try/catch degradando a null; lida sempre pelo `studentId` da sessão).
- `src/app/api/webhooks/lms/route.ts` + `src/lib/webhooks/lms-process.ts` (suporte LMS → ContactMessage) — **OK** (HMAC + idempotente; suporte roteado por `studentExternalId` interno + tenant-scoped; payload em webhook_logs com retenção 90d via `cleanup-webhook-logs`); ressalva de retenção de payload coberta pelo prazo.
- `src/lib/logger.ts` (`REDACT_PATHS`) — **Achado LGPD-010** (redige CPF/token/senha-EN, mas não email/telefone/senha-PT/lmsSenha — gap de defesa em profundidade; sem leak ativo).
- `src/lib/audit.ts` (audit trail) — **OK** (persiste em `audit_logs` + Pino; R14 resolvido); impersonação `impersonation.start` em `api/admin/{alunos,revendedores}/[id]/impersonate` e `api/painel/alunos/[id]/impersonate` — **OK** (trilha de acesso "como").
- Tokens MP por tenant (`src/lib/mercadopago/client.ts`) — **OK** (cifrados AES-256-GCM, server-only, nunca `NEXT_PUBLIC_*`).
- DPO / canal do titular (`POLITICA-DE-PRIVACIDADE.md:191-200`) — **OK** (privacidade@..., portabilidade/exclusão listadas; export automatizado é melhoria futura, não achado).
- ⚠️MIGRAÇÃO (Supabase→VPS/MinIO/R2, subprocessadores, residência) — **Achado LGPD-005**.
