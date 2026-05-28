# Relatório 13 — Compliance LGPD e Prontidão ISO 27001/27002/27701

**Agente:** Compliance, LGPD e Preparação ISO  
**Data:** 2026-05-28  
**Prontidão geral:** **PARCIAL** — documentação legal sólida, implementação técnica com lacunas críticas de defesa em profundidade e ausência de controles formais de DPA, audit log persistente e direitos do titular.

> Nota: esta avaliação é de **prontidão técnica**, não certificação. Distingue lacunas técnicas (corrigíveis em código) de lacunas documentais/processuais (exigem decisão jurídica ou organizacional).

---

## CHECKLIST DE READINESS

| # | Controle | Referência LGPD / ISO | Evidência encontrada | Lacuna | Severidade |
|---|---|---|---|---|---|
| 1 | Política de Privacidade publicada | LGPD art. 9, 10, 41; ISO 27701 §6.4.1 | `docs/legal/POLITICA-DE-PRIVACIDADE.md` v1.1 (2026-05-21); página `/privacidade` renderiza o arquivo; cobertura completa (cláusulas 1–19, DPO nomeado, canal e-mail, prazos de retenção por categoria, bases legais tabeladas, sub-operadores listados) | Política menciona "contratos firmados" com sub-operadores (`docs/legal/POLITICA-DE-PRIVACIDADE.md:123`) mas nenhum DPA/addendum de processamento está presente em `docs/`. Phrase "conforme contratos firmados" não é evidência de DPA executado. | Médio (documental) |
| 2 | Termos de Uso e Contrato de Revenda | LGPD art. 7 V; ISO 27701 §7.2.1 | Arquivos `docs/legal/TERMOS-DE-USO-ALUNO.md`, `docs/legal/CONTRATO-DE-REVENDA.md` existem. Páginas `/termos`, `/contrato-de-revenda` publicadas. | Nenhum mecanismo de aceite rastreável no banco de dados (sem campo `terms_accepted_at` / `terms_version` nos models `User` ou `Student` no `prisma/schema.prisma`). Não há evidência de que o aceite é registrado para fins probatórios. | Alto (técnico) |
| 3 | Bases legais documentadas | LGPD art. 7; ISO 27701 §6.4.2.1 | Tabela detalhada em `docs/legal/POLITICA-DE-PRIVACIDADE.md:207–223` cobre todas as finalidades com base legal. | Nenhuma coluna de "base legal" ou "finalidade" nos models do banco (dados não estruturados para RoPA — Registro de Operações de Tratamento). | Médio (documental) |
| 4 | Minimização de dados | LGPD art. 6 III; ISO 27001 A.8.2 | Checkout coleta: nome, e-mail, CPF, fone, endereço (`src/app/api/checkout/route.ts:71–79`; `src/lib/students/upsert.ts:36–37`). | Model `Student` (`prisma/schema.prisma:488–555`) inclui campos `rg`, `rgResponsavel`, `cpfResponsavel`, `sexo`, `nascimento`, `responsavel`, `obs` — não coletados no checkout padrão mas disponíveis no schema. Campos opcionais em DB são aceitáveis, porém sem RoPA documentado justificando cada campo, representa risco de coleta excessiva em extensões futuras. Risco moderado hoje. | Baixo (técnico) |
| 5 | Dados sensíveis (art. 5 II LGPD) | LGPD art. 5 II, 11; ISO 27701 §8.4 | Política de privacidade (`docs/legal/POLITICA-DE-PRIVACIDADE.md:62`) declara explicitamente que PMB **não coleta** dados sensíveis. | Confirmado: schema não possui campos biométricos, raciais, de saúde ou religiosos. Sem lacuna técnica. | Informativo |
| 6 | Cookie Consent | LGPD art. 7 I; ISO 27701 §6.4.2.3 | `CookieConsent` implementado (`src/components/shared/cookie-consent.tsx`); banner exibido globalmente (`src/app/layout.tsx:105`); aceite/rejeição gravado em localStorage + cookie `pmb_cookie_consent_v1`. | Vercel Analytics (`@vercel/analytics/react`) e `SpeedInsights` carregam **incondicionalmente** no `RootLayout` (`src/app/layout.tsx:110–111`) independente do consentimento do usuário. Não há lógica de opt-out que bloqueie esses scripts quando o usuário rejeita cookies opcionais. Consentimento capturado mas não honrado para analytics. | Alto (técnico) |
| 7 | Consentimento em captação de leads | LGPD art. 7 I; ISO 27701 §7.3.2 | `src/app/api/loja/leads/route.ts:28–161`: campo `consent` obrigatório no body (Zod); `consentAccepted` e `consentVersion = "2026-05-v1"` salvos em `StudentLead`; campo `ipAddress` capturado do `x-forwarded-for`. `src/components/loja/lead-inquiry-card.tsx:32` inicializa checkbox `consent = true` (pré-marcado). | Checkbox de consentimento pré-marcado (`useState(true)`) configura consentimento passivo, prática não recomendada pela ANPD (art. 8, §1 LGPD exige manifestação inequívoca). `ipAddress` coletado e associado ao lead sem aviso específico no formulário. | Médio (técnico) |
| 8 | RLS — defesa em profundidade | ISO 27002 A.8.3 (Acesso privilegiado); ISO 27001 A.8.15 | `audit/_context.md` "FATO CRÍTICO #1": Prisma conecta como owner (`DATABASE_URL` = `postgres`), RLS não aplicado. Único registro de RLS em `prisma/migrations/20260430_notification_preferences`. | Toda a segurança de tenant scoping repousa **exclusivamente** em código de aplicação. Ausência de RLS significa que qualquer bug em uma das 200 rotas que omita `where: { tenantId }` resulta em vazamento cross-tenant direto. Já identificado por agente Supabase. | Crítico (técnico) |
| 9 | Criptografia de dados pessoais em repouso | LGPD art. 46; ISO 27002 A.8.24 | `mpAccessToken` criptografado AES-256-GCM (`src/lib/crypto.ts`); senhas bcrypt (`docs/SECURITY.md §2.4`); `plataformaAlunoSenha` zerada após envio de e-mail (`src/lib/enrollment/fulfill.ts:423`; `docs/SECURITY.md §2.5`). CPF armazenado em plaintext em `students.cpf` — dados pessoais (não sensíveis, mas identificadores diretos). | CPF em plaintext no banco. Embora não classificado como dado sensível (art. 5 II), a ANPD orienta proteção reforçada por ser identificador único. Bucket `certificates` público com PDFs que incluem CPF impresso (`src/lib/certificates/storage.ts:84` — URL pública `storage/v1/object/public/certificates/...`; `src/lib/certificates/generate-pdf.ts:70`). | Alto (técnico) |
| 10 | Certificados PDF em bucket público com CPF | LGPD art. 46, 48; ISO 27002 A.8.24 | `src/lib/certificates/storage.ts:82–84`: `certificatePublicUrl` gera URL `/storage/v1/object/public/certificates/{path}` — acesso anônimo. `src/lib/certificates/issue.ts:93`: `studentCpf: enrollment.student.cpf` incluído no snapshot. `generate-pdf.ts:70`: CPF renderizado no PDF. | PDF com nome e CPF do aluno acessível publicamente por qualquer pessoa que conheça a URL. URL é estruturada e enumerável (`{tenantId ?? "pmb"}/{code}.pdf`). Código de certificado de 7-8 chars é adivinhável por força bruta. **Agente Supabase já classificou como Crítico.** Confirmado por este agente. | Crítico (técnico) |
| 11 | Audit log de ações administrativas | LGPD art. 37, 48; ISO 27002 A.8.15 | `src/lib/audit.ts`: `logAudit()` emite eventos Pino estruturados (`event: "audit.*"`). Chamado em: bloqueio de aluno, impersonação, mark-paid de comissão, cancelamento de matrícula. | Audit log é **apenas em logs de runtime** (Pino → stdout) — não persistido em banco. Sem tabela `AuditLog` (schema.prisma não possui tal model — confirmado na leitura integral). Logs Pino dependem de exportação para Axiom/Datadog (não configurado em docs). Sem retenção garantida. Não é evidência de audit trail para investigação forense ou requisição da ANPD. | Alto (técnico + documental) |
| 12 | Direito de exclusão (art. 18 IV LGPD) | LGPD art. 18 IV; ISO 27701 §8.3.4 | Nenhum endpoint DELETE para `Student` ou `User` encontrado em `src/app/api/aluno/*` ou em qualquer rota acessível ao titular. `src/app/api/admin/alunos/[id]/route.ts` não expõe DELETE ao próprio aluno. Não há fluxo de auto-exclusão na área do aluno. | Direito de exclusão/esquecimento não implementado tecnicamente. Canal é exclusivamente e-mail ao DPO (mencionado na política). Processo manual sem SLA técnico garantido. | Alto (técnico) |
| 13 | Direito de portabilidade (art. 18 V LGPD) | LGPD art. 18 V; ISO 27701 §8.3.5 | Sem endpoint de exportação de dados pessoais pelo titular. Painel `/aluno` oferece visualização de matrículas e perfil editável (`src/app/api/aluno/perfil/route.ts`) mas sem exportação em formato interoperável. | Portabilidade não implementada tecnicamente. Processo manual via DPO. | Médio (técnico) |
| 14 | Direito de correção (art. 18 III LGPD) | LGPD art. 18 III; ISO 27701 §8.3.3 | `PATCH /api/aluno/perfil` (`src/app/api/aluno/perfil/route.ts`) permite editar nome, fone, endereço. Propaga para plataforma parceira. CPF não editável (correto — identificador único). | Correção básica implementada. E-mail e CPF não editáveis sem DPO. Aceitável para CPF; e-mail deveria ter fluxo técnico. | Baixo (técnico) |
| 15 | Direitos do titular — infraestrutura de atendimento | LGPD art. 18, 19; ISO 27701 §8.3 | Canal DPO definido na política (`profissionaliza@grupobolsamaisbrasil.com.br`), prazo 15 dias, processo descrito. | Sem sistema de ticket/protocolo para exercício de direitos. Atendimento 100% manual sem registro nem rastreabilidade. Risco de perda de prazos. | Médio (documental + processual) |
| 16 | Encarregado de Proteção de Dados (DPO) | LGPD art. 41; ISO 27701 §6.4.1.2 | DPO declarado na política (`docs/legal/POLITICA-DE-PRIVACIDADE.md §16`), canal de e-mail, endereço físico. | Identidade do DPO pessoa física não publicada na política nem comunicada à ANPD (art. 41, §1: controladores de grande porte devem publicar). Para porte atual, comunicação à ANPD é recomendada. | Baixo (documental) |
| 17 | Plano de resposta a incidentes | LGPD art. 48; ISO 27002 A.5.26; ISO 27035 | `docs/legal/POLITICA-DE-PRIVACIDADE.md §14` descreve procedimentos em alto nível. `docs/SECURITY.md §1` menciona "threat model". | **Sem plano documentado de IR (Incident Response)** com: critérios de acionamento, responsáveis, sequência de contenção, template de notificação ANPD, prazo de 72h para notificação conforme Resolução ANPD CD nº 15/2023. | Alto (documental) |
| 18 | Transferência internacional de dados | LGPD art. 33–36; ISO 27701 §7.5 | Política documenta sub-operadores internacionais (Vercel, Supabase, Upstash, Resend). Cláusula 8 menciona bases legais para transferência (contrato, cláusulas padrão). | "Cláusulas contratuais padrão firmadas com o sub-operador" afirmadas na política (`docs/legal/POLITICA-DE-PRIVACIDADE.md §8.2b`) mas nenhum DPA/SCCs assinados estão em documentação. Vercel e Supabase têm DPA público, mas evidência de aceite não está documentada. | Médio (documental) |
| 19 | Controle de acesso baseado em roles (RBAC) | LGPD art. 46 §1; ISO 27002 A.5.15, A.8.2 | Roles `SUPER_ADMIN`, `PMB_SALES`, `PMB_RESELLER_MGR`, `RESELLER`, `STUDENT` implementados em `src/lib/auth/guards.ts`. `STUDENT` tem acesso escopado ao próprio tenant por subdomain. | Sem princípio de menor privilégio formal para `SUPER_ADMIN`: acesso total inclusive impersonação, export de todos os alunos globais sem tenant-scoping em `/api/admin/alunos/global`. Não é uma lacuna bloqueadora mas não há revisão de acesso periódica documentada. | Baixo (processual) |
| 20 | Gestão de segredos e variáveis de ambiente | ISO 27002 A.8.13; LGPD art. 46 | `src/lib/env.ts` centraliza com validação Zod; `assertEnv()` no boot (`src/instrumentation.ts`). `.env.local`/`.env.vercel.production` gitignored. | `PMB_MP_ACCESS_TOKEN` armazenado em plaintext no env (não criptografado em banco como os tokens dos revendedores). Documentado em `CLAUDE.md` como exceção intencional. Risco moderado: exposição de secrets de infra depende de acesso à plataforma Vercel. | Baixo (técnico — risco aceito) |
| 21 | Rate limiting e prevenção de abuso | LGPD art. 46; ISO 27002 A.8.20 | Rate limiting Upstash Redis em login (8/min), uploads, webhooks (`src/lib/ratelimit.ts`). Falha open se Redis ausente (documentado em `audit/_context.md`). | "Falha open" em rate limit significa que se o Redis cair, brute force em login é desbloqueado. Mitiga-se parcialmente pelo bcrypt (custo computacional). | Médio (técnico) |
| 22 | Retenção de dados — webhook logs | LGPD art. 16; ISO 27701 §7.4.7 | Cron `cleanup-webhook-logs` (`src/app/api/cron/cleanup-webhook-logs/route.ts:10`): RETENTION_DAYS = 90 dias, deleta apenas registros `processed = true`. | Política de privacidade define "Logs de aplicação: 12 meses" (`docs/legal/POLITICA-DE-PRIVACIDADE.md:416`) — implementação de 90 dias está **abaixo do prazo declarado na política**. Inconsistência entre política e implementação. | Médio (técnico) |
| 23 | Retenção de dados — Student/Lead | LGPD art. 16; ISO 27701 §7.4.7 | Política define: "Cadastro de Aluno inativo: 5 anos" e "Logs de acesso: 6 meses (Marco Civil art. 15)". | Não há cron de limpeza de `Student` ou `Lead` inativos. Dados de `StudentLead` (nome, e-mail, telefone, IP, `consentAccepted`) acumulam indefinidamente sem purga automática. | Médio (técnico) |
| 24 | Consentimento para Vercel Analytics | LGPD art. 7 I; ISO 27701 §6.4.2.3 | `Analytics` e `SpeedInsights` carregam em `src/app/layout.tsx:110–111` sem verificar consent. Política classifica analytics como "Consentimento ou Legítimo interesse (IP anonimizado)". | Vercel Analytics coleta dados de navegação (IP, user-agent, URL, referrer) sem honrar a opção do usuário de "Recusar opcionais". Isso cria divergência entre política declarada e comportamento técnico real. | Alto (técnico) |
| 25 | Backup e continuidade | LGPD art. 46; ISO 27002 A.8.13 | Política afirma "Backups automáticos do banco de dados pelo Supabase". | Política de backup do Supabase não está documentada (frequência, retenção, teste de restore). `docs/SECURITY.md` não menciona backup. Para ISO 27001, evidência de backup testado é requisito. | Médio (documental) |
| 26 | Treinamento de equipe em LGPD | LGPD art. 46 §1; ISO 27002 A.6.3 | Mencionado na política (`docs/legal/POLITICA-DE-PRIVACIDADE.md §9.2`): "Treinamento periódico da equipe em LGPD e segurança da informação". | Sem evidência documental de treinamentos realizados (registros, datas, conteúdo). Declaração na política sem evidência. | Médio (documental) |

---

## CLASSIFICAÇÃO DE PRONTIDÃO POR DIMENSÃO

| Dimensão | Prontidão |
|---|---|
| Documentação legal (Política, Termos, Contrato) | **Boa** — documentos completos, bases legais cobertas, DPO nomeado |
| Direitos do Titular (art. 18) | **Baixa** — exclusão e portabilidade ausentes tecnicamente |
| Segurança técnica de dados PII | **Parcial** — criptografia de tokens OK, CPF plaintext, PDFs públicos com CPF (crítico) |
| Audit trail e rastreabilidade | **Baixa** — log apenas em runtime sem persistência garantida |
| Resposta a incidentes | **Baixa** — mencionada na política mas sem plano operacional documentado |
| Controle de acesso | **Parcial** — RBAC implementado, sem RLS como rede de segurança |
| Retenção e eliminação | **Parcial** — webhook logs com cron mas Student/Lead sem purga; inconsistência 90d vs 12m |
| Gestão de sub-operadores (art. 39) | **Baixa** — política menciona DPAs mas sem evidência de execução |
| Consentimento | **Parcial** — cookie banner presente, leads com consentimento versionado, mas analytics carrega antes do consentimento e checkbox pré-marcado |

---

## TOP 5 LACUNAS PRIORITÁRIAS

### [Crítico — Técnico] PDF de certificado com CPF em bucket público
- Arquivo: `src/lib/certificates/storage.ts:82–84`; `src/lib/certificates/generate-pdf.ts:70`
- CPF e nome do aluno impressos em PDF acessível por URL pública sem autenticação. URL previsível: `{tenantId}/{code}.pdf` onde `code` é ~7 chars alfanuméricos.
- Confirmado pelo agente Supabase (Relatório 03).
- Ação: tornar bucket `certificates` privado; servir via signed URL temporária (Supabase `createSignedUrl`); ou remover CPF do PDF e manter no banco apenas.

### [Crítico — Técnico] RLS ausente — toda segurança multi-tenant em aplicação
- Arquivo: `src/lib/prisma.ts` (conexão como owner)
- Sem Row Level Security, qualquer query Prisma sem filtro `tenantId` expõe dados de todos os tenants. Confirmado pelo agente de Supabase/RLS (Relatório 03).
- Impacto LGPD: violação do art. 46 (medidas de segurança) e do art. 48 (incidente de vazamento).
- Ação: criar usuário de banco com menor privilégio + políticas RLS, ou ao menos habilitar RLS com `FORCE ROW LEVEL SECURITY` para criar rede de segurança.

### [Alto — Técnico] Vercel Analytics sem respeito ao consentimento do usuário
- Arquivo: `src/app/layout.tsx:108–111`
- `<Analytics />` e `<SpeedInsights />` carregam incondicionalmente. Política declara consentimento como base legal para analytics de performance.
- Ação: condicionais na renderização baseadas em `pmb_cookie_consent_v1`; ou migrar para Vercel Analytics com modo "privacy-first" sem cookies (verificar se suficiente para LGPD).

### [Alto — Técnico] Ausência de mecanismo técnico de exclusão de dados do titular (art. 18 IV)
- Evidência de ausência: nenhum `export const DELETE` em rotas `/api/aluno/*`; nenhum campo `deletedAt` (soft-delete) em `Student`.
- Ação: implementar endpoint `DELETE /api/aluno/conta` com soft-delete (anonimização progressiva) e hard-delete após período de carência; criar workflow de atendimento de solicitações LGPD.

### [Alto — Documental] Ausência de DPAs/acordos de processamento com sub-operadores
- Evidência: `docs/legal/POLITICA-DE-PRIVACIDADE.md:123` afirma "conforme contratos firmados" mas nenhum addendum de proteção de dados com Supabase, Vercel, Upstash, Resend, plataforma parceira está documentado.
- LGPD art. 39 exige que operadores forneçam garantias suficientes ao controlador.
- Ação: assinar DPA disponíveis publicamente (Vercel Data Processing Addendum, Supabase DPA) e registrá-los em `docs/legal/DPAs/`; para plataforma parceira, incluir cláusula de DPA no contrato.

---

## ACHADOS ADICIONAIS POR SEVERIDADE

### Alto
- **Audit log sem persistência**: `src/lib/audit.ts` emite apenas para Pino (stdout). Sem tabela `AuditLog` no banco. Para investigação de incidente ou requisição ANPD, logs de runtime podem não estar disponíveis. (ISO 27002 A.8.15)
- **Aceite de termos sem registro técnico**: não há `termsAcceptedAt` nem `termsVersion` em `User` ou `Student`. Impossível provar aceite individual para fins probatórios.

### Médio
- **Inconsistência de retenção**: webhook logs purgados em 90 dias (`src/app/api/cron/cleanup-webhook-logs/route.ts:10`) vs política que declara 12 meses para "logs de aplicação". (`docs/legal/POLITICA-DE-PRIVACIDADE.md:416`)
- **StudentLead sem purga automática**: dados de nome, e-mail, telefone e IP em `StudentLead` acumulam sem cron de limpeza.
- **Checkbox de consentimento pré-marcado**: `src/components/loja/lead-inquiry-card.tsx:32` — `useState(true)` — consentimento passivo.
- **Ausência de RoPA (Registro de Operações de Tratamento)**: sem inventário formal das operações de tratamento (ISO 27701 §6.4.2.1; LGPD art. 37). Provável exigência futura da ANPD.
- **Plano de resposta a incidentes ausente**: Resolução ANPD CD nº 15/2023 exige notificação em até 72h de incidentes relevantes. Sem playbook documentado.

### Baixo
- **DPO: identidade não publicada** — art. 41, §1 LGPD.
- **CPF plaintext** no banco (não sensível legalmente, mas identificador forte). Criptografia de campo reduz superfície em caso de dump de banco.
- **Direito de portabilidade sem implementação técnica** — processo exclusivamente manual.
- **Treinamentos de equipe sem evidência documental**.

### Informativo
- **PMB não coleta dados sensíveis** (art. 5 II LGPD) — confirmado no schema. Risco zero nesta dimensão.
- **Consentimento de lead versionado** (`CONSENT_VERSION = "2026-05-v1"`) — boa prática confirmada em `src/app/api/loja/leads/route.ts:14`.
- **Impersonação com logAudit** — ação sensível auditada em `src/app/api/admin/revendedores/[id]/impersonate/route.ts:110`.
- **Cookies de sessão** com atributos seguros (`httpOnly`, `sameSite`, `__Secure-` em prod) — conformidade com ISO 27002 A.8.20.
- **HSTS e security headers** configurados em `next.config.ts` — confirmado por outros agentes.

---

## RECOMENDAÇÕES PRIORITÁRIAS

1. **[Imediato]** Tornar bucket `certificates` privado no Supabase Dashboard → servir PDFs via signed URL temporária (`createSignedUrl` com TTL 1h). Impacto: remove vazamento de CPF via URL pública. Esforço: ~4h técnicas.

2. **[Imediato]** Condicionar `<Analytics />` e `<SpeedInsights />` ao consentimento: verificar cookie `pmb_cookie_consent_v1` antes de renderizar. Esforço: ~2h técnicas.

3. **[Curto prazo — 2 semanas]** Assinar DPAs públicos de Vercel e Supabase; incluir cláusula de DPA em contrato com plataforma parceira. Registrar em `docs/legal/DPAs/`. Esforço: jurídico.

4. **[Curto prazo — 2 semanas]** Implementar tabela `AuditLog` no Prisma e migrar `logAudit()` para persistência em banco. Reter por 12 meses. Esforço: ~8h técnicas.

5. **[Médio prazo — 1 mês]** Implementar `DELETE /api/aluno/conta` com anonimização progressiva (nome → "Aluno Removido", e-mail → hash, CPF → null, preservar matrícula anonimizada por obrigação fiscal) + workflow de atendimento de solicitações LGPD com registro e prazo.

6. **[Médio prazo — 1 mês]** Corrigir inconsistência de retenção de webhook logs (90d → 365d ou ajustar política para 90d com justificativa). Adicionar cron de purga para `StudentLead` inativos/perdidos após prazo definido.

7. **[Médio prazo]** Elaborar Plano de Resposta a Incidentes com: gatilhos de acionamento, responsáveis, sequência de contenção, template de notificação ANPD (Resolução CD nº 15/2023), prazo de 72h. Salvar em `docs/INCIDENT-RESPONSE.md`.

8. **[Longo prazo]** Elaborar RoPA formal; habilitar RLS no Supabase como defesa em profundidade; adicionar `termsAcceptedAt`/`termsVersion` em `User` e `Student`; implementar portabilidade técnica.
