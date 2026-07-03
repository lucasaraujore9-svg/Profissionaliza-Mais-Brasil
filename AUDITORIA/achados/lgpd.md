# Auditoria — LGPD / Compliance
_Data: 2026-07-03 · Referência: .claude/skills/auditoria-saas/references/10-compliance-lgpd.md · Itens do inventário cobertos: 34/34 relevantes_

## Resumo
- Itens verificados: 34 · Achados: P0=1 P1=2 P2=5 P3=2 · Nota do domínio: 5/10
- Síntese: re-verificação contra o código de 2026-07-03 (delta desde a rodada de 2026-06-24). **Três achados fecharam no código:** LGPD-003 (erasure do aluno propaga para `studentName`/`studentCpf` e apaga os PDFs — confirmado em `api/aluno/conta/route.ts:89-111`), LGPD-006 (read-path de certificado endurecido) e **LGPD-010 (redação do logger) — agora CORRIGIDO**: `REDACT_PATHS` cobre `email`/`telefone`/`fone`/`fone2`/`phone`/`senha`/`lmsSenha`/`plataformaAlunoSenha` (`logger.ts:54-110`). Além disso, a parte-2 do **LGPD-001 foi corrigida**: `generate-pdf.ts:181` agora persiste `upload.path` (path interno), não mais a URL `/object/public/`. **Permanecem abertos:** o R1 (LGPD-001 — bucket `certificates` historicamente PÚBLICO com CPF; toggle é externo ao repo e o repo ainda não traz policy de defesa em profundidade R12), a camada de consentimento de cookies/pixels (LGPD-002 — banner só "Entendi"), a ausência de ROPA/subprocessadores nominais (LGPD-004), a não-declaração de residência (LGPD-005), a falta de retenção/expurgo (LGPD-009, agora ampliada para incluir `Lead`/`EmailLog`), o checkbox pré-marcado (LGPD-007) e a divergência de versão de consentimento (LGPD-011). **Achados NOVOS desta rodada:** senha da plataforma de aulas enviada em **texto puro** no e-mail de matrícula (LGPD-012, P2; commit 614ac19); erasure/anonimização **não propaga a exclusão aos subprocessadores** EA/LMS/Asaas/MP — só bloqueia (LGPD-013, P2); e `WebhookLog.payload` guarda o payload **cru** de Asaas/MP com CPF/e-mail/telefone sem redação (LGPD-014, P2). Positivos confirmados: senhas LMS/plataforma cifradas AES-256-GCM; `to`+`subject`+`template` no `EmailLog` sem corpo HTML (senha do e-mail não persiste em log); tokens MP cifrados; audit trail em `audit_logs`; consentimento de contato registrado server-side.

## Achados

### [LGPD-001] Certificados com CPF em bucket Supabase PÚBLICO (R1) + sem policy de defesa em profundidade (R12)
- **Severidade:** P0
- **Status:** Aberto
- **Local:** `src/lib/certificates/storage.ts:1` (`const BUCKET = "certificates"`), `:82-85` (`certificatePublicUrl` → `/storage/v1/object/public/`) · `src/lib/certificates/generate-pdf.ts:78-86` (placeholder `cpf` no PDF) · `prisma/schema.prisma` model `Certificate` (linha 1829 — `studentCpf`, `pdfUrl`) · `audit/MATRIZ_DE_RISCOS.md:6` (R1/R3/R8 em **"Bloqueados (decisão/externo)"**), `:14` (R1 Crítico/P0), `:25` (R12 defesa em profundidade P1)
- **Evidência:** A rodada de 2026-06-20 confirmou via Management API que o bucket `certificates` estava `public:true` e que um `curl` anônimo de `.../storage/v1/object/public/certificates/<tenantId>/<certId>.pdf` retornava HTTP 200 / application/pdf com nome+CPF. Nesta sessão a consulta live está fora de escopo (só leitura de repo). O repo **não contém** nenhuma migration/policy que privatize o bucket ou restrinja `storage.objects` (`grep storage.buckets|storage.objects prisma/migrations prisma/sql` → vazio) e `audit/MATRIZ_DE_RISCOS.md:14` continua classificando R1 como "Requer decisão humana" — sem evidência de fechamento. **Mitigações confirmadas nesta rodada:** (a) o read-path já baixa via service-role / signed URL; (b) `generate-pdf.ts:181` **deixou de persistir** a `publicUrl` — grava `upload.path` (path interno), fechando a parte de "URL pública permanente no banco"; (c) `pdfPathFor` usa o `cuid` do certificado (não o `code` de ~28 bits), mitigando enumeração. **O que continua aberto:** o próprio estado `public` do bucket (verificação externa) e a ausência de policy `storage.objects` negando `anon`/`authenticated` (R12) — sem essa 2ª barreira, se o toggle voltar a `true` (ou nunca tiver sido invertido), PDFs com CPF ficam expostos sem auth.
- **Impacto:** Enquanto o bucket for público, exposição não autenticada de CPF+nome de qualquer aluno com certificado emitido — violação direta da LGPD (art. 46 segurança, art. 6º minimização) e da própria Política seção 10. Em produção com volume, é incidente reportável à ANPD. ⚠️MIGRAÇÃO: ao migrar Storage→MinIO/R2, a policy de bucket precisa nascer privada por padrão.
- **Correção:**
  1. **Verificação manual (fora do repo):** no Supabase (Management API ou Dashboard → Storage), confirmar `select public from storage.buckets where id='certificates'`. Se `true`, tornar **privado** (`public:false`). O read-path já suporta (rotas `/api/{student,admin,painel}/certificates/[id]/download` via `downloadCertificatePdf`; `/validar/[code]` via `createSignedCertificateUrl`).
  2. Adicionar migration idempotente com policy em `storage.objects` para `bucket_id='certificates'`: negar `select` a `anon` e `authenticated`, permitir só `service_role`. Versionar em `prisma/sql/` ou `prisma/migrations/` (fecha R12).
  3. Backfill: como o `pdf_url` histórico pode conter a forma `/object/public/`, re-gravar todos os registros de `certificates.pdf_url` para o path puro (ou null + regenerar on-demand), garantindo que nenhuma URL `/object/public/` persista. `extractCertificatePath` já aceita as duas formas, então isso é limpeza, não bloqueio.
- **Verificação:** `curl -sI <url pública de um cert>` → 400/403 (não 200). `select public from storage.buckets where id='certificates'` → `false`. Policy presente em `storage.objects`. `GET /api/student/certificates/[id]/download` autenticado continua 200. Nenhum `pdf_url` começa com `/object/public/` após backfill.

### [LGPD-002] Cookies/pixels de rastreamento carregam ANTES e SEM consentimento; banner sem opção de recusar
- **Severidade:** P1
- **Status:** Aberto
- **Local:** `src/components/shared/tracking-pixels.tsx:8-34` (injeta GA4/Google Ads/GTM/Meta/TikTok/LinkedIn/Pinterest/Microsoft UET/Clarity/Hotjar `strategy="afterInteractive"`; docstring :8-13 declara "sem gate de consentimento") · `src/components/shared/analytics-gate.tsx:10-17` (Vercel Analytics + SpeedInsights incondicional) · `src/components/shared/cookie-consent.tsx:18-29` (`writeDismissed` grava só `"accepted"`), `:40-44` (docstring: "scripts carregam automaticamente… banner apenas informa"), `:88-95` (único botão "Entendi") · `src/components/loja/visitor-tracker.tsx` + `src/app/api/loja/track/route.ts` (cookie `pmb_vid` + `VisitorEvent`)
- **Evidência:** `TrackingPixels` retorna os `<Script>` de todos os trackers de terceiros sempre que houver config (`if (scripts.length === 0) return null` é a única condição) — não lê nenhum estado de consentimento. `AnalyticsGate` monta `<Analytics/>`+`<SpeedInsights/>` sem condição. O `CookieConsent` oferece só "Entendi" (`localStorage["pmb_cookie_consent_v1"]="accepted"`); não há "Recusar" nem gestão granular. A Política seção 11 (`docs/legal/POLITICA-DE-PRIVACIDADE.md:137`) diz que cookies analíticos/publicitários "poderão depender de consentimento ou mecanismo equivalente de gestão de preferências" — prática diverge do documento. **Propagação silenciosa:** a config PMB é mesclada e aplicada também nas vitrines de revenda, então os pixels da PMB carregam nos subdomínios dos revendedores sem consentimento do visitante da vitrine.
- **Impacto:** Carregar trackers de finalidade publicitária (Meta/TikTok/Google Ads) antes do consentimento é tratamento sem base legal válida (consentimento não livre/inequívoco), no site PMB e nas vitrines de revenda. Risco legal direto (rubrica itens 1 e 5). Decisão do dono de manter o banner informativo está registrada, mas o risco permanece.
- **Correção:**
  1. Transformar o banner em consentimento real: "Aceitar", "Recusar" e "Gerenciar" com categorias (necessários sempre; analíticos/publicitários opt-in). Persistir estado granular versionado (ex.: `pmb_cookie_consent_v2 = {analytics, ads, ts, version}`) em localStorage + cookie.
  2. Gatear `TrackingPixels` e `analytics-gate.tsx`: só montar scripts de categoria não-essencial quando a categoria for `true`. Reusar o `useSyncExternalStore` de `cookie-consent.tsx` como fonte do estado.
  3. Registrar o consentimento (o quê, quando, versão) no objeto persistido.
- **Verificação:** Com consentimento ausente/recusado, no DevTools Network não deve haver requisição a `google-analytics.com`/`connect.facebook.net`/`analytics.tiktok.com`. Teste de componente: montar `TrackingPixels` sem consentimento → não renderiza scripts de terceiros.

### [LGPD-004] Sem lista nominal de subprocessadores / ROPA; Política só descreve categorias genéricas
- **Severidade:** P1
- **Status:** Aberto
- **Local:** `docs/legal/POLITICA-DE-PRIVACIDADE.md:85` (operadores genéricos), `:111` ("Empresas de tecnologia e hospedagem"), `:178-180` (transferência internacional genérica) · ausência de `docs/legal/SUBPROCESSADORES.md` (só há CONTRATO-DE-REVENDA, POLITICA-DE-PRIVACIDADE, TERMOS-DE-USO-ALUNO)
- **Evidência:** `ls docs/legal/` retorna apenas 3 arquivos; não existe lista de subprocessadores. O sistema transmite PII a: **Asaas** (cobrança revendas — CPF/e-mail/nome), **Mercado Pago** (pagamento aluno), **plataforma EA** (matrícula — `src/lib/plataforma-cursos/`), **LMS lms.bmbr.com.br** (provisionamento — `src/lib/lms/`), **Resend/SMTP Hostinger** (e-mails — `src/lib/email/`), **Upstash** (cache/rate-limit — `src/lib/redis.ts`), **Supabase** (banco+storage — todo o PII), **Vercel** (hospedagem + Analytics/SpeedInsights) e os pixels de terceiros (Meta/TikTok/Google/LinkedIn/Pinterest/Microsoft/Clarity/Hotjar). Nenhum nominado; sem ROPA.
- **Impacto:** Rubrica item 4. Sem isso não se atende ao direito do titular a informação sobre compartilhamentos (art. 18) nem se demonstra accountability à ANPD. Vários implicam transferência internacional (EUA) — ver LGPD-005.
- **Correção:** Produzir e versionar `docs/legal/SUBPROCESSADORES.md` listando cada operador, finalidade, dados tratados, país de processamento e base contratual/DPA, cruzado contra `src/lib/{asaas,mercadopago,lms,plataforma-cursos,email,redis,certificates}`. Publicar a lista (ou link) na Política seção 8. Verificar DPA com cada fornecedor (manual). ⚠️MIGRAÇÃO: atualizar quando trocar Supabase/Upstash/Vercel por Postgres self-hosted/Redis TCP/MinIO/R2/Cloudflare.
- **Verificação:** Doc existe com a lista completa cruzada contra as integrações reais de `src/lib/`. Verificação manual dos contratos/DPA.

### [LGPD-005] Residência dos dados não declarada (região Supabase) + ⚠️MIGRAÇÃO muda residência e subprocessadores
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `docs/legal/POLITICA-DE-PRIVACIDADE.md:178-180` (transferência internacional genérica, sem região nem fornecedor) · `CLAUDE.md` ("Alvo de migração: VPS própria + MinIO + Postgres self-hosted") · MEMORY: `project_infra_vps_cloudflare`
- **Evidência:** A Política não declara a região do projeto Supabase (`jpwskehhnplmmtgyyxmf`) nem onde os dados residem; transferência internacional só genérica. ⚠️MIGRAÇÃO planejada troca Supabase Cloud por Postgres self-hosted + Redis TCP + MinIO/R2 numa VPS com Cloudflare — **muda a residência e o conjunto de subprocessadores**.
- **Impacto:** Rubrica item 4 (residência conhecida e compatível com o prometido). Se a região atual do Supabase for fora do BR, é transferência internacional que precisa de salvaguarda explícita. Na migração, Política + ROPA precisam ser atualizadas antes do cutover, senão a prática diverge do documento.
- **Correção:** (a) Confirmar a região do projeto Supabase (Dashboard → Settings → General) e declarar residência/transferência na Política. (b) No plano de migração, incluir gate de compliance: atualizar Política + ROPA (LGPD-004) com a nova localização e regiões **antes** de migrar dados de produção; reavaliar a base de transferência internacional.
- **Verificação:** Manual — região do Supabase documentada; checklist de migração com gate de atualização da Política/ROPA antes do cutover.

### [LGPD-009] Sem retenção/expurgo de StudentLead, ContactMessage, Lead e EmailLog — PII (incl. IP+User-Agent) guardada indefinidamente
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `prisma/schema.prisma` model `StudentLead` (linha 1959 — `nome`/`email`/`telefone`, `ipAddress`/`userAgent`), model `ContactMessage` (linha 1335 — `nome`/`email`/`telefone`/`mensagem`, `ipAddress`/`userAgent`), model `Lead` (linha 1265 — `email`/`phone`/`cpf`/`companyName`), model `EmailLog` (linha 1476 — `to` e-mail indexado) · `src/app/api/cron/sweep-abandoned-leads/route.ts` (só move `StudentLead` p/ ABANDONED via `sweepAbandonedLeadsForContext` — nunca deleta) · `src/app/api/contato/route.ts:94-111` (grava `ipAddress`+`userAgent`) · `prisma/sql/pg_cron_jobs.sql:48-61` (crons de expurgo cobrem apenas `webhook_logs` e `visitor_events`)
- **Evidência:** `grep "studentLead.deleteMany|contactMessage.deleteMany|lead.deleteMany|emailLog.deleteMany" src/` → **vazio**. Os únicos `deleteMany` de retenção são `cleanup-webhook-logs` (90d) e `sweep-visitor-events` (90d). O `sweep-abandoned-leads` apenas reclassifica stage. As rotas de captura gravam IP (`x-forwarded-for`) + user-agent. `Lead` (B2B revenda) acumula CPF+e-mail+telefone sem qualquer expurgo. `EmailLog.to` guarda o e-mail de todo destinatário indefinidamente.
- **Impacto:** Viola a rubrica item 3 ("Retenção: prazos definidos + rotina de expurgo") e o princípio da necessidade (art. 15/16 LGPD). Lead não-convertido, mensagem de contato resolvida (com IP/UA) e histórico de `EmailLog` (e-mails) acumulam para sempre, ampliando a superfície de vazamento e o escopo de uma requisição de exclusão.
- **Correção:**
  1. Definir prazos de retenção (decisão jurídica; sugestão: leads não-convertidos 12–24 meses; mensagens de contato resolvidas 12 meses; `EmailLog` 6–12 meses). Documentar na Política.
  2. Criar cron `sweep-stale-pii` (ou estender `cleanup-webhook-logs`) com `prisma.studentLead.deleteMany` (ABANDONED antigos), `contactMessage.deleteMany` (RESOLVED além do prazo), `lead.deleteMany` (LOST/não-convertidos antigos) e `emailLog.deleteMany` (além do prazo). Registrar em `prisma/sql/pg_cron_jobs.sql` (padrão `app_internal.run_cron`). Alternativa menos agressiva: anonimizar `ipAddress`/`userAgent` (set null) após N dias.
  3. Proteger a rota com `isCronAuthorized` + `maxDuration`/batches, como os demais sweeps.
- **Verificação:** Após rodar em staging, `select count(*) from student_leads where stage='ABANDONED' and updated_at < now() - interval '<prazo>'` → 0; idem `contact_messages` resolvidas, `leads` antigos e `email_logs`. Teste de unidade do helper de expurgo com dados sintéticos.

### [LGPD-012] Senha da plataforma de aulas enviada em texto puro no e-mail de matrícula
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/lib/email/templates/enrollment.tsx:118-122` (`{school.password}` renderizado inline: "Senha:" seguido do valor em `credentialValueMono`) · `src/lib/enrollment/fulfill.ts` (popula `school.password` a partir do provisionamento em memória — commit 614ac19) · `EnrollmentTemplate.PreviewProps` :175 (`password: "mrmc3112"`)
- **Evidência:** O template de matrícula imprime a senha inicial da Plataforma da Escola (EA/LMS) em texto puro no corpo do e-mail quando `school.password` está presente (1ª criação EA / `partnerAccess` LMS). O commit garante que a senha **não é logada nem persistida em claro** — confirmado: `EmailLog` (`schema.prisma:1476`) grava só `to`/`subject`/`template`/`status`/`provider`/`error`, **sem** o corpo HTML; logger redige `senha`/`lmsSenha`/`plataformaAlunoSenha` (LGPD-010 corrigido). Porém o e-mail em si trafega e **fica retido na caixa de entrada do titular** em cleartext, e e-mail (SMTP) não é canal fim-a-fim seguro.
- **Impacto:** Exposição de credencial de acesso a sistema de terceiros por canal não-seguro; qualquer comprometimento da caixa do aluno (ou de um relay intermediário) expõe a senha. Boas práticas (e a leitura de art. 46 da LGPD sobre medidas de segurança) desaconselham enviar senha em cleartext. Severidade contida porque é senha inicial de plataforma externa, trocável pelo aluno, e não é reaproveitada como senha do Sistema Acadêmico.
- **Correção:** Preferir não enviar a senha inline: (a) forçar troca no 1º acesso da plataforma de aulas e enviar só um link de definição/reset; ou (b) instruir o acesso via SSO da área do aluno (`/api/aluno/curso/[enrollmentId]/acessar` já existe para EA/LMS), omitindo a senha do e-mail. Se o envio inline for mantido por decisão de produto, registrar a decisão de risco e orientar troca imediata de senha no texto.
- **Verificação:** Render do template sem `school.password` no corpo (ou com placeholder de "defina sua senha"); teste do template garante ausência de senha literal quando o fluxo SSO/reset é usado.

### [LGPD-013] Erasure/anonimização do titular não propaga exclusão aos subprocessadores (EA/LMS/Asaas/MP) — só bloqueia
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/app/api/aluno/conta/route.ts:54-55` (`blockStudentInEA` best-effort, sem exclusão) · `src/lib/students/plataforma-actions.ts:583-641` (`blockStudentInEA` → `setLmsStudentAccess(...,"blocked")`; não deleta) · `src/lib/lgpd/anonymize.ts` (anonimiza o owner no banco PMB; não toca Asaas/MP) · sem chamada de delete a EA/LMS/Asaas no fluxo de erasure
- **Evidência:** No erasure do aluno, a PII é anonimizada no banco PMB e o acesso na plataforma parceira é **bloqueado** (`blockStudentInEA` → EA + `setLmsStudentAccess "blocked"`), mas **não há exclusão** dos dados do aluno (nome/CPF/e-mail) nos sistemas EA/LMS. Na anonimização do revendedor, os dados no Asaas (customer/subscription com CPF/e-mail) permanecem. Não há endpoint/rotina que propague a exclusão para os subprocessadores.
- **Impacto:** A LGPD (art. 18, VI) exige eliminação dos dados tratados com base no consentimento, e o operador/controlador deve informar os terceiros com quem compartilhou (art. 18, §6). Após o "esquecimento", a PII do titular continua residente em EA/LMS/Asaas/MP. Sem DPA que garanta a propagação (LGPD-004), o direito não é plenamente atendido.
- **Correção:** (a) Onde a API do subprocessador permitir, disparar exclusão/anonimização na propagação do erasure (ex.: endpoint de exclusão de aluno no LMS; supressão/anonimização de customer no Asaas quando não houver obrigação contábil pendente). (b) Onde não for possível, documentar no DPA (LGPD-004) o prazo/rotina de expurgo do subprocessador e registrar a limitação na Política. (c) Registrar em audit trail o resultado da propagação por sistema.
- **Verificação:** Fluxo de erasure chama o delete/anonymize de cada subprocessador que suporta; audit log registra sucesso/limitação por sistema; DPA cobre os que não suportam.

### [LGPD-014] WebhookLog persiste payload cru de Asaas/MP com CPF/e-mail/telefone sem redação
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `prisma/schema.prisma:1172` (`payload Json // Payload completo recebido`), `:1173` (`headers Json?`) · `src/app/api/webhooks/*/route.ts` (gravam o payload recebido) · retenção: `src/app/api/cron/cleanup-webhook-logs/route.ts:34` (90 dias)
- **Evidência:** `WebhookLog.payload` guarda o corpo **completo** recebido dos gateways. Payloads de Asaas (`payment.customer` com nome/CPF/e-mail) e Mercado Pago (`payer` com e-mail/CPF) contêm PII, armazenada sem redação no banco. A retenção de 90d (`cleanup-webhook-logs`) e a preservação apenas dos que falharam mitigam parcialmente, mas por até 90 dias há PII de titulares em cleartext em `webhook_logs`, acessível a qualquer operador com acesso ao banco.
- **Impacto:** Minimização (art. 6º/15/16) — guarda-se mais PII do que o necessário para diagnóstico. Amplia a superfície de um vazamento de banco. Diferente do payload LMS (roteado por id interno), Asaas/MP trazem CPF/e-mail/telefone diretamente.
- **Correção:** Redigir/minimizar o payload antes de persistir (manter só os campos necessários à idempotência/diagnóstico: `id`, `event`, `status`, `externalReference`; remover `customer`/`payer` PII), ou cifrar a coluna. Manter a retenção de 90d. Aplicar a mesma allowlist do logger (`REDACT_PATHS`) ao snapshot gravado.
- **Verificação:** Novo `webhook_logs.payload` de Asaas/MP não contém CPF/e-mail/telefone (só campos de controle). Teste do gravador de webhook com payload sintético contendo PII → persiste redigido.

### [LGPD-007] Checkbox de consentimento de contato pré-marcado (opt-in por padrão)
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `src/components/loja/lead-inquiry-card.tsx:32` (`const [consent, setConsent] = useState(true)`), `:145,162` · `src/components/loja/checkout-inquiry-form.tsx:35` (`useState(true)`), `:161,180`
- **Evidência:** O checkbox "Aceito receber contato via WhatsApp…" inicia marcado (`useState(true)`). Há bloqueio de submit (`disabled={… || !consent}`) e o consentimento é gravado server-side (`consentAccepted`/`consentVersion` — positivo), mas pré-marcado é soft dark-pattern; o opt-in defensável é desmarcado por padrão, sobretudo para comunicação comercial via WhatsApp.
- **Impacto:** Baixo — há checkbox real, bloqueio de submit e registro server-side; o default pré-marcado enfraquece a "manifestação livre".
- **Correção:** Iniciar `consent` em `false` (opt-in ativo) nos dois formulários, mantendo o gate de submit.
- **Verificação:** O checkbox aparece desmarcado por padrão; submit só habilita após marcar.

### [LGPD-011] Versão do consentimento registrado diverge da versão pública dos documentos
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `src/app/api/loja/leads/route.ts:17` (`CONSENT_VERSION = "2026-05-v1"`) · `src/app/api/pmb/leads/route.ts:14` (`"2026-05-v1"`) · `src/app/api/loja/checkout-inquiry/route.ts:15` (`"2026-06-v1"`) · `src/app/(main)/privacidade/page.tsx:34` ("Versão 1.3 — 10 de junho de 2026") · `src/app/(main)/termos/page.tsx:34` ("Versão 1.3 — 11 de junho de 2026")
- **Evidência:** O consentimento de contato é gravado com `consentVersion`, mas há **três strings hardcoded distintas** ("2026-05-v1"/"2026-05-v1"/"2026-06-v1") que **não correspondem** à versão pública dos documentos ("1.3"). Não há registro de aceite versionado de Termos/Política por `Student`/`User` (sem `acceptedTermsVersion`/`acceptedTermsAt`).
- **Impacto:** Baixo — em disputa, a `consentVersion` gravada não rastreia para uma versão real/datada do documento exibido ao titular, enfraquecendo a comprovação. Hardcode triplicado dificulta manter coerência.
- **Correção:** Centralizar uma única constante (ex.: `src/lib/legal/version.ts` exportando `LEGAL_VERSION = "1.3"` + data), referenciada pelas duas páginas e pelas três rotas de lead. Persistir a versão aceita + timestamp atrelada a essa constante. Idealmente registrar aceite de Termos/Política também para `Student`/`User`.
- **Verificação:** As três rotas e as duas páginas referenciam a mesma constante; a string é única no repo.

## Achados corrigidos nesta rodada (referência — não contam no total)

### [LGPD-003] Erasure do aluno não propagava para a PII copiada nos certificados — CORRIGIDO
- **Status:** Corrigido · **Local:** `src/app/api/aluno/conta/route.ts:89-111`
- **Evidência:** O DELETE anonimiza `Student` e faz `certificate.updateMany` setando `studentName="Conta removida"`/`studentCpf=null`/`pdfUrl=null`/`pdfGeneratedAt=null`, depois apaga os PDFs do bucket via `deleteCertificatePdf(extractCertificatePath(...))`. Audit log `student.account.anonymize`.

### [LGPD-006] Read-path de certificado expunha URL pública — CORRIGIDO
- **Status:** Corrigido · **Local:** `src/lib/certificates/generate-pdf.ts:181` (persiste `upload.path`, não `publicUrl`) · rotas de download via `downloadCertificatePdf` · `/validar/[code]` via `createSignedCertificateUrl`
- **Evidência:** `generate-pdf.ts:178-184` grava o path interno; `extractCertificatePath` (`storage.ts:143`) aceita path puro + URL legada. Listagens admin/painel expõem só `hasPdf`.

### [LGPD-010] Allowlist de redação do logger não cobria e-mail/telefone/senha — CORRIGIDO
- **Status:** Corrigido · **Local:** `src/lib/logger.ts:54-110`
- **Evidência:** `REDACT_PATHS` agora inclui `senha`/`*.senha`/`lmsSenha`/`plataformaAlunoSenha` (:54-62), `email`/`*.email`/`*.*.email` (:100-102), `telefone`/`fone`/`fone2`/`phone` (:103-110), além de cpf/cnpj/rg/token/cartão/crypto já existentes.

## Cobertura
Itens do inventário e da referência relevantes ao domínio LGPD e seu veredito (34 itens):

- `src/lib/lgpd/anonymize.ts` (anonimização do owner — art. 18) — **OK no banco PMB**; não propaga a Asaas → parcialmente coberto por **LGPD-013**.
- `src/app/api/admin/revendedores/[id]/anonimizar/route.ts` — **OK** (SUPER_ADMIN-only, confirm literal, audit).
- `src/app/api/aluno/conta/route.ts` (DELETE — erasure) — **OK / LGPD-003 CORRIGIDO**; propagação a EA/LMS/Asaas → **LGPD-013**.
- `src/app/api/aluno/perfil/route.ts` (PATCH — retificação) — **OK** (Zod, valida conflito de e-mail).
- `src/app/api/aluno/senha/route.ts` + `src/app/api/aluno/senha-plataforma/route.ts` — **OK** (troca de senha; senha da plataforma cifrada, decifra server-side).
- `src/components/aluno/delete-account-section.tsx` / `src/components/painel/delete-account-request.tsx` — **OK** (fluxo do titular existe).
- `src/app/(main)/privacidade/page.tsx` + `docs/legal/POLITICA-DE-PRIVACIDADE.md` — **OK na base**; cookies → LGPD-002; subprocessadores → LGPD-004; residência → LGPD-005; versão → LGPD-011.
- `src/app/(main)/termos/page.tsx` + `docs/legal/TERMOS-DE-USO-ALUNO.md` — **OK** (tenant-aware); versionamento → LGPD-011.
- `src/app/(main)/reembolso/page.tsx` — **OK** (garantia 7 dias, canal claro).
- `src/components/shared/cookie-consent.tsx` — **Achado LGPD-002** (banner só "Entendi").
- `src/components/shared/tracking-pixels.tsx` + `src/lib/tracking/snippets.ts` + layouts (main)/(loja) — **Achado LGPD-002** (pixels sem gate; propagação PMB→vitrines); snippets **OK** quanto a não enviar PII aos pixels.
- `src/components/shared/analytics-gate.tsx` — **Achado LGPD-002** (Vercel Analytics/SpeedInsights incondicional).
- `src/components/shared/tracking-purchase-event.tsx` — **OK** (não envia email/CPF/telefone aos pixels).
- `src/components/shared/ref-cookie-capture.tsx` + `api/public/capture-ref|validate-ref` — **OK** (cookie httpOnly de indicação, finalidade legítima).
- `src/components/loja/visitor-tracker.tsx` + `src/app/api/loja/track/route.ts` + model `VisitorEvent` — **OK na minimização** (cookie anônimo `pmb_vid`, sem IP); cookie sem consentimento → relacionado a LGPD-002.
- `src/app/api/cron/sweep-visitor-events/route.ts` — **OK** (retenção 90 dias, eventos anônimos).
- `src/app/api/cron/cleanup-webhook-logs/route.ts` — **OK como retenção** (90d); payload cru → **LGPD-014**.
- `src/app/api/cron/sweep-abandoned-leads/route.ts` — **Achado LGPD-009** (só reclassifica; nunca expurga).
- `prisma/schema.prisma` model `StudentLead` (`ipAddress`/`userAgent`) — **Achado LGPD-009**.
- `prisma/schema.prisma` model `ContactMessage` (`ipAddress`/`userAgent`) — **Achado LGPD-009**.
- `prisma/schema.prisma` model `Lead` (`cpf`/`email`/`phone`) — **Achado LGPD-009** (retenção indefinida, novo escopo).
- `prisma/schema.prisma` model `EmailLog` (`to`) — **Achado LGPD-009** (sem expurgo); corpo HTML NÃO persistido → **OK** p/ LGPD-012.
- `prisma/schema.prisma` model `WebhookLog` (`payload`/`headers` Json cru) — **Achado LGPD-014**.
- `src/app/api/{loja/leads,pmb/leads,loja/checkout-inquiry}/route.ts` — **OK no registro** (`consentAccepted`/`consentVersion`); default pré-marcado → LGPD-007; versão divergente → LGPD-011.
- `src/app/api/contato/route.ts` — **OK no fluxo**; IP/UA sem expurgo → LGPD-009.
- `src/lib/email/templates/enrollment.tsx` (credenciais no e-mail de matrícula) — **Achado LGPD-012** (senha da plataforma em texto puro).
- `src/lib/email/mailer.ts` + `smtp.ts` + `EmailLog` — **OK** (log grava só metadados, sem corpo/senha).
- `src/lib/certificates/storage.ts` + bucket `certificates` — **Achado LGPD-001 (P0)** (bucket público historicamente; R12 policy ausente).
- `src/lib/certificates/generate-pdf.ts` (CPF no PDF) — **OK / parte-2 CORRIGIDA** (persiste path, não publicUrl); CPF no PDF permanece coberto por LGPD-001.
- `src/app/api/{student,admin,painel}/certificates/[id]/download/route.ts` — **OK / LGPD-006 CORRIGIDO** (service-role stream, sem 302→URL pública).
- `src/app/validar/[code]/page.tsx` — **OK** (signed URL de curta duração).
- `src/lib/students/lms-credentials.ts` + `Enrollment.lmsSenha` + `Student.plataformaAlunoSenha` + `resync-lms-credentials` — **OK** (cifrado AES-256-GCM; decifra server-side).
- `src/lib/students/plataforma-actions.ts` (`blockStudentInEA`/`setLmsStudentAccess`/`revokeLmsEnrollment`) — **OK no bloqueio**; não deleta PII no parceiro → **LGPD-013**.
- `src/lib/logger.ts` (`REDACT_PATHS`) — **OK / LGPD-010 CORRIGIDO** (email/telefone/fone/phone/senha/lmsSenha/plataformaAlunoSenha redigidos).
- `src/lib/audit.ts` (audit trail) — **OK** (persiste em `audit_logs`; impersonação `impersonation.start`).
- Tokens MP por tenant (`src/lib/mercadopago/client.ts`) — **OK** (cifrados AES-256-GCM, server-only, nunca `NEXT_PUBLIC_*`).
- DPO / canal do titular (`POLITICA-DE-PRIVACIDADE.md:191-200`) — **OK** (privacidade@…, portabilidade/exclusão listadas; export automatizado é melhoria futura, não achado).
- ⚠️MIGRAÇÃO (Supabase→VPS/MinIO/R2, subprocessadores, residência) — **Achados LGPD-004 + LGPD-005**.
