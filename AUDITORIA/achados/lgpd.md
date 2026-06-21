# Auditoria — LGPD / Compliance
_Data: 2026-06-20 · Referência: .claude/skills/auditoria-saas/references/10-compliance-lgpd.md · Itens do inventário cobertos: 14/14 relevantes_

## Resumo
- Itens verificados: 14 · Achados: P0=1 P1=3 P2=2 P3=2 · Nota do domínio: 4/10
- Síntese: a base documental é forte (Política de Privacidade v1.3, Termos, Reembolso, DPO definido, art. 18 implementado para aluno e owner). O que reprova é a **camada de consentimento de cookies/pixels** (carregam automaticamente, banner só "Entendi" sem opção de recusar — divergência direta com a própria Política seção 11) e o **R1 ainda aberto** (PDF de certificado com CPF em bucket Supabase `public:true`, confirmado por fetch anônimo HTTP 200 em produção). Some-se a isso a **não-propagação da exclusão para a cópia no storage/DB do certificado** e a **ausência de lista nominal de subprocessadores (ROPA)**.

## Achados

### [LGPD-001] Certificados com CPF em bucket Supabase PÚBLICO (R1 ainda aberto)
- **Severidade:** P0
- **Status:** Aberto
- **Local:** `src/lib/certificates/storage.ts:1` (`const BUCKET = "certificates"`), `:82-85` (`certificatePublicUrl` → `/object/public/`) · `src/lib/certificates/generate-pdf.ts:80` (placeholder `cpf`), `:50/:102` (`studentCpf`) · `prisma/schema.prisma:1773` (`certificates.student_cpf`), `:1782` (`pdf_url`) · storage `bucket certificates.public = true` (produção)
- **Evidência:** Consulta live à Management API: `select id,public from storage.buckets` → `{"id":"certificates","public":true}`. Há 1 certificado em prod com `pdf_url` público e `student_cpf` preenchido. **Fetch anônimo (sem qualquer auth)** de `https://jpwskehhnplmmtgyyxmf.supabase.co/storage/v1/object/public/certificates/<tenantId>/<certId>.pdf` retornou **HTTP 200, content-type application/pdf, 2.024.979 bytes** — o PDF contém nome completo + CPF do aluno. O path foi endurecido para usar o `cuid` em vez do `code` enumerável (`generate-pdf.ts:36-42`), o que **reduz** a raspagem por força bruta, mas **não fecha** o problema: o objeto continua mundialmente legível sem autenticação e a `pdf_url` persistida no banco é a URL pública permanente; qualquer URL compartilhada/vazada (e-mail, histórico de browser, logs de CDN) expõe PII indefinidamente. Risco anotado como R1/Crítico em `audit/MATRIZ_DE_RISCOS.md:14` e segue "Bloqueado (decisão/externo)".
- **Impacto:** Exposição não autenticada de dado pessoal (CPF + nome) de qualquer aluno cujo certificado já foi emitido. Violação direta da LGPD (segurança art. 46, minimização art. 6º) e da própria Política seção 10 ("observados os princípios da necessidade e minimização"). Em produção, com volume real, vira incidente reportável à ANPD.
- **Correção:**
  1. Tornar o bucket `certificates` **privado** (`public: false`) no Supabase Storage. O read-path já está pronto: as 3 rotas de download (`api/student|admin|painel/certificates/[id]/download/route.ts`) fazem stream via service-role (`downloadCertificatePdf`) e a `/validar/[code]/page.tsx:282-295` usa `createSignedCertificateUrl` (signed URL 300s). Confirmar que NÃO há mais leitura direta de `pdfUrl` no client (ver LGPD-006 sobre fallback 302 e listagens que retornam `pdfUrl`).
  2. Remover o fallback `NextResponse.redirect(pdfUrl, 302)` das rotas de download (`student:80`, `admin:73`, `painel:66`) — ele redireciona para a URL pública; com o bucket privado vira 400, então trocar por erro 502 logado.
  3. Backfill: re-gravar `certificates.pdf_url` para a forma de path interno (ou null + regenerar on-demand) para que nenhuma URL pública persista no banco; ajustar `extractCertificatePath` se o formato armazenado mudar.
  4. Adicionar policy de defesa em profundidade em `storage.objects` para o bucket (RLS negando `anon`/`authenticated`, só service-role lê) — fecha R12 (`audit/MATRIZ_DE_RISCOS.md:25`).
- **Verificação:** Após o toggle: `curl -sI <url pública de um cert>` deve retornar 400/403 (não 200). `select public from storage.buckets where id='certificates'` → `false`. Download autenticado de aluno (`GET /api/student/certificates/[id]/download`) continua 200 streamando o PDF. Página `/validar/{code}` continua exibindo botão de download via signed URL.

### [LGPD-002] Cookies/pixels de rastreamento carregam ANTES e SEM consentimento; banner sem opção de recusar
- **Severidade:** P1
- **Status:** Aberto
- **Local:** `src/components/shared/tracking-pixels.tsx:8-35` (injeta GA4, Google Ads, GTM, Meta, TikTok, LinkedIn, Pinterest, Microsoft UET, Clarity, Hotjar `strategy="afterInteractive"` sem gate) · `src/app/(main)/layout.tsx:90,142` e `src/app/loja/layout.tsx:98` (montagem incondicional) · `src/components/shared/analytics-gate.tsx:10-17` (Vercel Analytics + SpeedInsights incondicional; o próprio comentário: "não há gate de consentimento") · `src/components/shared/cookie-consent.tsx:40-44,88-95` (banner com único botão "Entendi"; `writeDismissed` grava só `"accepted"`) · `src/components/loja/visitor-tracker.tsx` + `src/app/api/loja/track/route.ts` (grava cookie `pmb_vid` e `VisitorEvent` sem consentimento)
- **Evidência:** `TrackingPixels` retorna os `<Script>` de todos os trackers de terceiros sempre que houver config, sem ler nenhum estado de consentimento. `AnalyticsGate` é um nome enganoso: não há gate — renderiza `<Analytics />` e `<SpeedInsights />` direto. O `CookieConsent` oferece apenas "Entendi" (texto: "Ao continuar navegando, você concorda"), gravando sempre `"accepted"`; não existe botão "Recusar" nem gestão granular. Isso **contradiz a própria Política de Privacidade** (`docs/legal/POLITICA-DE-PRIVACIDADE.md:137`): "Cookies analíticos, publicitários ou de terceiros poderão depender de consentimento ou mecanismo equivalente de gestão de preferências".
- **Impacto:** Carregar trackers de terceiros (especialmente Meta/TikTok/Google Ads — finalidade publicitária, não-essencial) antes do consentimento é tratamento sem base legal válida (consentimento não é livre/inequívoco). Divergência prática × Política = risco legal direto (ref. seção 5 da rubrica). Aplicável tanto ao site PMB quanto às vitrines de revenda (os pixels da PMB propagam silenciosamente para todas as vitrines).
- **Correção:**
  1. Transformar o banner em consentimento real: botões "Aceitar", "Recusar" e (idealmente) "Gerenciar" com categorias (necessários sempre; analíticos/publicitários opt-in). Persistir o estado granular (ex.: `pmb_cookie_consent_v2 = {analytics:bool, ads:bool, ts, version}`) em localStorage + cookie.
  2. Gatear `TrackingPixels` e `AnalyticsGate`: só montar os scripts de categoria não-essencial quando a categoria correspondente estiver `true`. Usar o `useSyncExternalStore` que já existe no `cookie-consent.tsx` como fonte do estado.
  3. Registrar o consentimento (o quê, quando, versão do termo) — exigido pela rubrica item 1 e pela Política. Mínimo: timestamp + versão no objeto persistido; idealmente um `ConsentLog` server-side para leads/alunos identificáveis.
  4. Renomear `AnalyticsGate` para refletir o comportamento real ou implementar de fato o gate.
- **Verificação:** Com consentimento ausente/recusado, inspecionar a página: nenhuma requisição a `google-analytics.com`, `connect.facebook.net`, `analytics.tiktok.com`, etc. Após "Aceitar", os scripts aparecem. Teste manual no DevTools (Network) + um teste de componente que monta `TrackingPixels` sem consentimento e assert `scripts.length === 0`.

### [LGPD-003] Exclusão/anonimização do aluno NÃO propaga para a cópia de CPF no certificado (DB + storage público)
- **Severidade:** P1
- **Status:** Aberto
- **Local:** `src/app/api/aluno/conta/route.ts:56-86` (anonimiza `Student` mas comentário explícito "preservando os registros (Enrollment/Payment/Certificate)") · `prisma/schema.prisma:1773` (`certificates.student_cpf` — snapshot independente do `Student.cpf`) · `src/lib/certificates/storage.ts:82` (PDF no bucket público com CPF) · `src/lib/lgpd/anonymize.ts:14-19` (anonimização do owner também não toca certificados)
- **Evidência:** O `DELETE /api/aluno/conta` limpa todos os campos de PII de `Student` (`cpf:null`, `nome:"Conta removida"`, etc.), mas o certificado mantém `studentCpf`/`studentName` snapshotados na tabela `certificates` e o **PDF com CPF permanece no bucket público** (LGPD-001). Após o aluno exercer o "direito ao esquecimento", o CPF dele continua: (a) na coluna `certificates.student_cpf`, (b) embutido no PDF, (c) acessível anonimamente via URL pública. Confirmado em prod: o único certificado existente tem `student_cpf` preenchido e PDF público acessível.
- **Impacto:** A erasure é incompleta — exatamente o anti-padrão da rubrica ("Exclusão que deixa cópia no storage/log = P1"). O titular acredita que seus dados foram removidos, mas o CPF segue exposto. Risco legal e de credibilidade.
- **Correção:** Definir e implementar a política de propagação. Opções (decisão jurídica): (a) ao anonimizar o `Student`, **revogar** os certificados não emitidos sob obrigação e remover o PDF (`deleteCertificatePdf`) + limpar `certificates.student_cpf`; ou (b) se o certificado deve sobreviver por exercício regular de direitos, **regenerar** o PDF sem CPF (o template já suporta `studentCpf:null`, ver `generate-pdf.ts:102`) e limpar a coluna. Em ambos, garantir que o bucket esteja privado (LGPD-001). Registrar a decisão no comentário do código e no audit log da anonimização.
- **Verificação:** Teste de integração: anonimizar um aluno com certificado emitido → assertar `certificates.student_cpf IS NULL` e que o PDF não contém mais o CPF (ou foi removido). `select student_cpf from certificates where student_id = <id anonimizado>` → null.

### [LGPD-004] Sem lista nominal de subprocessadores / ROPA; Política só descreve categorias genéricas
- **Severidade:** P1
- **Status:** Aberto
- **Local:** `docs/legal/POLITICA-DE-PRIVACIDADE.md:104-117` (seção 8 lista apenas categorias: "Plataformas de pagamento", "Empresas de tecnologia e hospedagem", "Prestadores de serviços") · `:178-180` (seção 16 transferência internacional genérica) · ausência de doc ROPA em `docs/` (só `docs/legal/`)
- **Evidência:** `grep -i "asaas|mercado pago|resend|upstash|vercel|supabase|aws|google" docs/legal/POLITICA-DE-PRIVACIDADE.md` → nenhum resultado. O sistema, porém, transmite PII a: **Asaas** (cobrança revendas — CPF/e-mail/nome), **Mercado Pago** (pagamento aluno), **plataforma parceira EA** (matrícula — nome/CPF/e-mail), **LMS lms.bmbr.com.br** (2ª fornecedora — provisionamento de aluno), **Resend** (e-mails transacionais com nome/e-mail), **Upstash** (cache/rate-limit — pode conter identificadores), **Supabase** (banco + storage — todo o PII), **Vercel** (hospedagem + Analytics/SpeedInsights), e os pixels de terceiros (Meta/Google/TikTok). Nenhum desses está nomeado nem há um Registro das Operações de Tratamento (ROPA).
- **Impacto:** Rubrica item 4: "Subprocessadores mapeados e com base contratual... Registro das operações de tratamento (ROPA) atualizado." Sem isso, não se atende ao direito do titular a "informações sobre compartilhamentos realizados" (art. 18, IV/VII — citado na própria Política `:192`) nem se demonstra accountability à ANPD. Vários desses (Vercel, Upstash, Resend, Meta, Google) implicam **transferência internacional** (EUA), tratada apenas genericamente na seção 16.
- **Correção:** Produzir e versionar um documento ROPA/subprocessadores em `docs/legal/SUBPROCESSADORES.md` (e/ou anexo à Política) listando cada operador, finalidade, dados tratados, país de processamento e base legal/DPA. Publicar a lista nominal (ou linkável) na Política seção 8. Verificar que há DPA/cláusulas-padrão contratadas com cada um (verificação manual — fora do repo).
- **Verificação:** Existência do doc com a lista completa cruzada contra as integrações reais do `src/lib/` (asaas, mercadopago, lms, plataforma-cursos, email, redis, storage, vercel). Verificação manual dos contratos/DPA com cada fornecedor.

### [LGPD-005] Residência dos dados não declarada (região Supabase) + ⚠️MIGRAÇÃO muda residência e subprocessadores
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `docs/legal/POLITICA-DE-PRIVACIDADE.md:178-180` (transferência internacional genérica) · `CLAUDE.md` (alvo: VPS própria + MinIO + Postgres self-hosted) · MEMORY: `project_infra_vps_cloudflare`, `project_arquitetura_multiproduto` (R2/MinIO + Postgres self-hosted)
- **Evidência:** A Política não declara a região atual do projeto Supabase (`jpwskehhnplmmtgyyxmf`) nem onde os dados residem; trata transferência internacional só de forma genérica. ⚠️MIGRAÇÃO planejada (CLAUDE.md "Alvo de migração") troca Supabase Cloud por Postgres self-hosted + Redis TCP + storage MinIO/R2 numa VPS própria com Cloudflare — **muda a residência dos dados e o conjunto de subprocessadores** declarados aos titulares.
- **Impacto:** Rubrica item 4: residência conhecida e compatível com o prometido. Hoje há lacuna documental; na migração, a Política e o ROPA (LGPD-004) precisarão ser atualizados antes do cutover, senão a prática diverge do documento. Se a região atual do Supabase for fora do BR, isso é transferência internacional que precisa de salvaguarda explícita.
- **Correção:** (a) Confirmar a região do projeto Supabase (Dashboard → Settings → General) e declarar a residência/transferência na Política. (b) No plano de migração, incluir item de compliance: atualizar Política + ROPA com a nova localização (VPS/Cloudflare/R2/MinIO) e suas regiões antes de migrar dados de produção; reavaliar a base de transferência internacional (Cloudflare/R2 são EUA).
- **Verificação:** Manual — região do Supabase documentada; checklist de migração com gate de atualização da Política/ROPA antes do cutover.

### [LGPD-006] Listagens de certificados (admin/painel) ainda retornam `pdfUrl` público ao client
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/app/api/admin/certificates/route.ts:83,102` (`pdfUrl: c.pdfUrl` no payload) · `src/app/api/painel/certificates/route.ts:56,72` · fallback 302 → URL pública em `api/student|admin|painel/certificates/[id]/download/route.ts`
- **Evidência:** As listagens de certificados devolvem `pdfUrl` (a URL pública persistida) diretamente para o client admin/revendedor. Enquanto o bucket for público (LGPD-001), essa URL é mundialmente acessível; mesmo após privatizar, distribuir a URL pública pelo client é desnecessário e atrapalha o fechamento do R1.
- **Impacto:** Reforça LGPD-001 (PII de CPF em URL pública distribuída pela API). Mesmo com bucket privado, manter `pdfUrl` no payload mantém URLs obsoletas circulando.
- **Correção:** Parar de expor `pdfUrl` cru nas listagens; o client deve sempre baixar via a rota `/[id]/download` (stream/signed). Remover o fallback `redirect(pdfUrl, 302)` das 3 rotas de download (trocar por 502 logado). Tratar em conjunto com LGPD-001.
- **Verificação:** Resposta de `GET /api/admin/certificates` não contém `pdfUrl` público (ou contém só o id); download continua funcionando via rota dedicada.

### [LGPD-007] Checkbox de consentimento de contato pré-marcado (opt-in por padrão)
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `src/components/loja/lead-inquiry-card.tsx:32` (`useState(true)`), `:143-153` · `src/components/loja/checkout-inquiry-form.tsx:35` (`useState(true)`), `:159-...`
- **Evidência:** O checkbox "Aceito receber contato via WhatsApp..." inicia marcado (`useState(true)`). É um consentimento explícito e desmarcável (o submit é bloqueado se `!consent`), mas pré-marcado é um soft dark-pattern; o consentimento mais defensável é o opt-in ativo (desmarcado por padrão), sobretudo para comunicação comercial via WhatsApp.
- **Impacto:** Baixo — há checkbox real e bloqueio de submit, mas o default pré-marcado enfraquece a "manifestação livre" do consentimento. Risco menor de questionamento.
- **Correção:** Iniciar `consent` em `false` (opt-in ativo) nos dois formulários, mantendo o gate de submit. Avaliar registrar o consentimento server-side (cruza com LGPD-002) no `StudentLead`.
- **Verificação:** O checkbox aparece desmarcado por padrão; submit só habilita após marcar.

### [LGPD-008] Política/Termos versão hardcoded sem registro de aceite versionado por titular
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `src/app/(main)/privacidade/page.tsx:34` ("Versão 1.3") · `src/app/(main)/termos/page.tsx:34` ("Versão 1.3") · ausência de campo de aceite versionado no `Student`/`StudentLead`/`User` (não encontrado em `prisma/schema.prisma`)
- **Evidência:** A versão dos documentos é texto fixo no JSX. Não há registro de qual versão dos Termos/Política cada titular aceitou e quando (não há `termsAcceptedAt`/`privacyVersion` nos models de usuário/aluno). A rubrica pede consentimento "registrado: o quê, quando, versão do termo".
- **Impacto:** Baixo — dificulta comprovar, em disputa, qual versão o titular aceitou. Não bloqueia operação, mas é lacuna de accountability.
- **Correção:** Persistir no cadastro de aluno/lead a versão aceita + timestamp (ex.: `acceptedTermsVersion`, `acceptedTermsAt`). Centralizar a constante de versão (única fonte) em vez de hardcode duplicado nas duas páginas.
- **Verificação:** Novos cadastros gravam versão+data; constante de versão única referenciada por ambas as páginas.

## Cobertura
Itens do inventário e da referência relevantes ao domínio LGPD e seu veredito:

- `src/lib/lgpd/anonymize.ts` (anonimização do owner — art. 18) — **OK** (implementado, idempotente, audit log); ressalva não-propagação a certificados → LGPD-003.
- `src/app/api/admin/revendedores/[id]/anonimizar/route.ts` — **OK** (SUPER_ADMIN-only, Zod confirm literal, audit, bloqueia tenant PMB).
- `src/app/api/aluno/conta/route.ts` (DELETE — erasure do aluno) — **Achado LGPD-003** (não propaga ao certificado/storage).
- `src/app/api/aluno/perfil/route.ts` (PATCH — retificação nome/email/fone) — **OK** (direito de retificação atendido, Zod, valida conflito de e-mail).
- `src/components/aluno/delete-account-section.tsx` / `src/components/painel/delete-account-request.tsx` (UI de exclusão) — **OK** (fluxo do titular existe).
- `src/app/(main)/privacidade/page.tsx` + `docs/legal/POLITICA-DE-PRIVACIDADE.md` — **OK na base**; divergência prática (cookies) → LGPD-002; subprocessadores genéricos → LGPD-004; residência → LGPD-005; versionamento → LGPD-008.
- `src/app/(main)/termos/page.tsx` + `docs/legal/TERMOS-DE-USO-ALUNO.md` — **OK** (tenant-aware); versionamento → LGPD-008.
- `src/app/(main)/reembolso/page.tsx` — **OK** (garantia 7 dias, canal claro; coleta nome+CPF por e-mail é proporcional).
- `src/components/shared/cookie-consent.tsx` — **Achado LGPD-002** (banner só informativo, sem recusar).
- `src/components/shared/tracking-pixels.tsx` + `(main)/layout.tsx` + `loja/layout.tsx` — **Achado LGPD-002** (pixels sem gate de consentimento).
- `src/components/shared/analytics-gate.tsx` — **Achado LGPD-002** (Vercel Analytics/SpeedInsights incondicional; nome enganoso).
- `src/components/shared/tracking-purchase-event.tsx` + `src/lib/tracking/snippets.ts` — **OK** (não envia CPF/e-mail/telefone para pixels — sem advanced matching com PII).
- `src/components/shared/ref-cookie-capture.tsx` + `api/public/capture-ref|validate-ref` — **OK** (cookie httpOnly de indicação; sem PII sensível, finalidade legítima de comissão).
- `src/components/loja/visitor-tracker.tsx` + `src/app/api/loja/track/route.ts` + `recordVisitorEvent` — **OK na minimização** (cookie anônimo `pmb_vid`, NÃO grava IP, path sem query string — `schema.prisma:2001-2002`, gate por módulo de automação); ressalva: cookie/evento gravado sem consentimento → relacionado a LGPD-002.
- `prisma/schema.prisma` model `VisitorEvent` (:1984) — **OK** (sem IP, query string removida, retenção via cron).
- `src/app/api/cron/sweep-visitor-events/route.ts` — **OK** (retenção 90 dias para eventos anônimos não-convertidos; eventos com lead preservados).
- `src/app/api/cron/cleanup-webhook-logs/route.ts` — **OK** (retenção 90 dias; preserva falhas para reprocesso). Ressalva: payloads de webhook (MP/Asaas) podem conter PII por até 90 dias — aceitável dado o prazo + finalidade de auditoria.
- `src/lib/certificates/storage.ts` + bucket `certificates` (`public:true`) — **Achado LGPD-001 (P0)**.
- `src/lib/certificates/generate-pdf.ts` (CPF no PDF) — **Achado LGPD-001** (PII no PDF público); path por cuid já endurecido (mitiga enumeração, não fecha).
- `src/app/api/student|admin|painel/certificates/[id]/download/route.ts` — **OK no caminho principal** (stream privado, no-store); fallback 302 → URL pública e exposição de `pdfUrl` nas listagens → LGPD-006.
- `src/app/validar/[code]/page.tsx` — **OK** (usa signed URL de 300s, não a URL pública permanente; exibe só dados mínimos de validação conforme Política seção 10).
- Bucket `vitrine-assets` (`public:true`) — **OK** (verificado via Management API: contém apenas logos/banners/assets de template de certificado `certificates/__pmb__/{background,logo,seal,signature}.png`, sem PII).
- Tokens MP por tenant (`src/lib/mercadopago/client.ts:1,38-39`, `process.ts`) — **OK** (cifrados AES-256-GCM via `crypto.ts`, decifrados só server-side; nunca em `NEXT_PUBLIC_*`).
- DPO / canal do titular (`POLITICA-DE-PRIVACIDADE.md:194-200`) — **OK** (privacidade@profissionalizamaisbrasil.com.br, prazo 7 dias úteis).
- Direitos do titular: acesso/confirmação — **N/A no código** (atendido por canal manual do DPO, não há endpoint de exportação/portabilidade automatizado; aceitável para o porte, mas portabilidade automatizada é melhoria futura, não achado por ora — coberto pela existência do canal DPO).
- ⚠️MIGRAÇÃO (Supabase→VPS/MinIO/R2, subprocessadores) — **Achado LGPD-005** (residência/subprocessadores mudam).
