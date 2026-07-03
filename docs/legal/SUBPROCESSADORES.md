# Lista de Subprocessadores / Operadores

**Profissionaliza Mais Brasil** (unidade de negócios do GRUPO BOLSA MAIS BRASIL, CNPJ 66.553.170/0001-01)

> **STATUS: MINUTA — pendente de validação jurídica pelo Encarregado (DPO).**
> Este documento é o registro operacional dos terceiros (operadores/suboperadores, art. 5º VII e VIII
> da LGPD) que tratam dados pessoais em nome do Controlador. Foi montado a partir das integrações
> efetivamente presentes no código (`src/lib/`) em 2026-07-03. A base contratual/DPA de cada
> fornecedor **precisa ser confirmada** com o contrato vigente antes da publicação.

## Como este documento foi construído

Cada linha abaixo tem evidência no repositório. Referências cruzadas:

- Asaas → `src/lib/asaas/`
- Mercado Pago → `src/lib/mercadopago/`
- Plataforma de Ensino "EA" → `src/lib/plataforma-cursos/`
- LMS `lms.bmbr.com.br` → `src/lib/lms/`
- Resend + SMTP Hostinger → `src/lib/email/` (`resend.ts`, `smtp.ts`, `mailer.ts`)
- Upstash Redis → `src/lib/redis.ts`
- Supabase (Postgres + Storage) → `prisma/schema.prisma`, `src/lib/certificates/storage.ts`
- Vercel (hospedagem + Analytics/SpeedInsights + Domains) → `src/components/shared/analytics-gate.tsx`, config de domínios custom
- Pixels de terceiros → `src/components/shared/tracking-pixels.tsx`, `src/lib/tracking/snippets.ts`

## 1. Infraestrutura, banco e armazenamento

| Subprocessador | Finalidade | Dados pessoais tratados | País/Região | Base contratual / observação |
|---|---|---|---|---|
| **Supabase** (Postgres + Auth + Storage) | Banco de dados principal e armazenamento de arquivos (inclui PDFs de certificado) | Todo o PII da plataforma: nome, CPF, RG, e-mail, telefone, endereço, histórico acadêmico, certificados, dados de pagamento (metadados) | **A CONFIRMAR** (projeto `jpwskehhnplmmtgyyxmf`; região do projeto a declarar — ver LGPD-005). Provável fora do BR (EUA) → transferência internacional | DPA Supabase a anexar. ⚠️MIGRAÇÃO: será substituído por Postgres self-hosted + MinIO/R2 em VPS própria — atualizar antes do cutover |
| **Upstash Redis** | Cache de tenant + rate limiting | Chaves de cache e contadores; **sem PII sensível persistida** (identificadores de tenant/slug e IP para rate-limit em janela curta) | **A CONFIRMAR** (provável EUA) → transferência internacional | DPA a anexar. ⚠️MIGRAÇÃO: será substituído por Redis TCP self-hosted |
| **Vercel** (hospedagem) | Hospedagem da aplicação Next.js, edge/proxy, gestão de domínios custom (Vercel Domains) | Tráfego HTTP (IP, User-Agent, logs de runtime), dados submetidos em formulários em trânsito | **A CONFIRMAR** (EUA) → transferência internacional | DPA Vercel a anexar. ⚠️MIGRAÇÃO: será substituído por VPS + Cloudflare |
| **Vercel Analytics + Speed Insights** | Métricas de audiência e performance (Web Vitals) | Dados de navegação agregados/pseudonimizados; sem PII direta enviada pela aplicação | EUA → transferência internacional | Carregado incondicionalmente hoje (ver LGPD-002 — gating de consentimento pendente) |

## 2. Pagamentos e cobrança

| Subprocessador | Finalidade | Dados pessoais tratados | País/Região | Base contratual / observação |
|---|---|---|---|---|
| **Asaas** | Cobrança de mensalidades das unidades (revendas) — assinaturas/cobranças da PMB | Nome, CPF/CNPJ, e-mail, telefone do responsável pela unidade; dados da cobrança | Brasil | Base legal de retenção: obrigação fiscal/contábil. **Erasure não apaga automaticamente** (ver LGPD-013 + seção Retenção do ROPA) |
| **Mercado Pago** | Processamento de pagamento do aluno na vitrine da unidade (token MP por tenant) | Nome, e-mail, CPF do pagador; dados da transação (status, id, valor, método). **Não** armazena PAN/CVV (ambiente PCI-DSS do gateway) | Brasil (operação BR) | Token de acesso do revendedor cifrado AES-256-GCM no banco. Base legal de retenção: obrigação fiscal |

## 3. Plataformas de ensino (matrícula/provisionamento)

| Subprocessador | Finalidade | Dados pessoais tratados | País/Região | Base contratual / observação |
|---|---|---|---|---|
| **Plataforma de Ensino "EA"** (fornecedora legada, `SUAESCOLA.com/api/v2`) | Matrícula automática do aluno na plataforma onde as aulas são ministradas | Nome, CPF, e-mail, telefone, polo/vendedor, credencial de acesso do aluno | **A CONFIRMAR** | Erasure hoje **bloqueia** o acesso (não deleta) — ver LGPD-013 |
| **LMS `lms.bmbr.com.br`** (fornecedora nova, API M2M REST `/api/v1`) | Provisionamento de acesso, progresso e certificação (PMB → LMS → parceiros) | Nome, e-mail, CPF do aluno (como externalId); dados de matrícula/progresso | **A CONFIRMAR** (mesmo grupo BMBR) | Suporta revogação via API (`revokeLmsEnrollment` / `setLmsStudentAccess`). Erasure a estender p/ exclusão — ver LGPD-013 |

## 4. Comunicação (e-mail)

| Subprocessador | Finalidade | Dados pessoais tratados | País/Região | Base contratual / observação |
|---|---|---|---|---|
| **Resend** | Envio transacional de e-mails (provider alternativo) | E-mail do destinatário, nome, conteúdo do e-mail (confirmações, credenciais, avisos) | EUA → transferência internacional | `EmailLog` grava apenas `to`/`subject`/`template`/`status` — sem corpo HTML |
| **SMTP Hostinger** | Envio transacional de e-mails (provider primário) | E-mail do destinatário, nome, conteúdo do e-mail | **A CONFIRMAR** | Idem — sem corpo HTML persistido |

## 5. Pixels de rastreamento de terceiros (marketing/analytics)

> Carregados por `src/components/shared/tracking-pixels.tsx` quando há configuração. **Hoje sem gate
> de consentimento** (ver LGPD-002 — decisão do dono de manter banner informativo registrada). A
> config da PMB propaga para as vitrines de revenda. A aplicação **não** envia e-mail/CPF/telefone
> aos pixels (ver `tracking-purchase-event.tsx`), mas os provedores coletam IP/cookies de navegação.

| Subprocessador | Finalidade | País/Região |
|---|---|---|
| Google (GA4, Google Ads, GTM) | Analytics + publicidade | EUA |
| Meta (Facebook Pixel) | Publicidade / remarketing | EUA |
| TikTok Pixel | Publicidade | EUA / global |
| LinkedIn Insight Tag | Publicidade B2B | EUA |
| Pinterest Tag | Publicidade | EUA |
| Microsoft UET (Bing Ads) | Publicidade | EUA |
| Microsoft Clarity | Analytics de comportamento (heatmap/session) | EUA |
| Hotjar | Analytics de comportamento | EUA / UE |

## 6. Transferência internacional

Vários subprocessadores acima tratam dados fora do Brasil (EUA, principalmente). A transferência
internacional está prevista na Política de Privacidade (seção 16), mas **de forma genérica**. Ação
pendente (ver LGPD-005): declarar a região efetiva do Supabase e a base de transferência
(cláusulas contratuais padrão / decisão de adequação / consentimento específico, conforme o caso).

## 7. Manutenção deste documento

- Revisar a cada nova integração adicionada em `src/lib/`.
- ⚠️MIGRAÇÃO Vercel→VPS: atualizar Supabase→Postgres self-hosted, Upstash→Redis TCP,
  Vercel→VPS+Cloudflare, Storage→MinIO/R2 **antes** de mover dados de produção.
- Publicar a lista (ou link para ela) na seção 8 da Política de Privacidade.
- Anexar/confirmar o DPA de cada fornecedor (tarefa manual do DPO).
