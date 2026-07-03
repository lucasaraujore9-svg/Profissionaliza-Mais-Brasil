# ROPA — Registro das Operações de Tratamento de Dados Pessoais

**Profissionaliza Mais Brasil** (GRUPO BOLSA MAIS BRASIL, CNPJ 66.553.170/0001-01)

> **STATUS: MINUTA — pendente de validação jurídica pelo Encarregado (DPO).**
> Registro das operações de tratamento (art. 37 da LGPD), mapeado a partir dos models Prisma
> (`prisma/schema.prisma`) que carregam PII, em 2026-07-03. Bases legais são **preliminares** e
> precisam de confirmação jurídica. Cruzar com `docs/legal/SUBPROCESSADORES.md` (compartilhamentos)
> e `docs/legal/POLITICA-DE-PRIVACIDADE.md` (seções 4, 6, 8, 15, 16).

## 1. Papel do Controlador

- **Controlador:** Profissionaliza Mais Brasil (dados de conta, matrícula, certificação, segurança).
- **Controlador independente (parceiro):** a Unidade/Parceiro Licenciado, quanto aos dados que capta
  na própria operação comercial (Política seção 5).
- **Operadores/suboperadores:** ver `SUBPROCESSADORES.md`.

## 2. Inventário de tratamentos por model (PII)

Legenda de base legal (preliminar): EC = execução de contrato; OL = obrigação legal/regulatória;
LI = legítimo interesse; C = consentimento; ERD = exercício regular de direitos.

| Model (tabela) | Categorias de dados pessoais | Titulares | Finalidade | Base legal (prelim.) | Compartilhado com | Retenção atual |
|---|---|---|---|---|---|---|
| `User` (`users`) | Nome, e-mail, telefone, senha (hash), papel | Equipe PMB, revendedores, consultores | Autenticação, RBAC, gestão comercial | EC / LI | Supabase | Enquanto a conta existir |
| `Tenant` (`tenants`) | Dados da unidade, `asaasCustomerId`, domínio | Parceiro Licenciado (PJ/PF) | Gestão do contrato de revenda, cobrança | EC / OL | Asaas, Supabase | Enquanto a unidade existir |
| `Student` (`students`) | Nome, CPF, RG, e-mail, fone/fone2, sexo, nascimento, endereço, responsável (menores), credencial de aula (cifrada) | Alunos | Matrícula, acesso às aulas, certificação, suporte | EC | Plataforma EA/LMS, Supabase; MP/Asaas (pagamento) | Enquanto a conta existir; erasure anonimiza (LGPD-003) |
| `Enrollment` (`enrollments`) | Vínculo aluno-curso, credencial LMS (cifrada) | Alunos | Provisionamento e progresso do curso | EC | EA/LMS, Supabase | Vinculada ao aluno |
| `Payment` (`payments`) | Metadados de pagamento do aluno, valor, referências | Alunos | Processamento financeiro, conciliação | EC / OL | Mercado Pago, Supabase | **Obrigação fiscal** — não apagar no erasure |
| `TenantPayment` (`tenant_payments`) | Metadados de cobrança da unidade | Parceiros | Cobrança de mensalidade, conciliação | EC / OL | Asaas, Supabase | **Obrigação fiscal** — não apagar no erasure |
| `Certificate` (`certificates`) | Nome (snapshot), CPF (snapshot), curso, PDF | Alunos | Emissão e validação pública de certificado | EC / ERD | Supabase Storage | Snapshot; erasure limpa nome/CPF/PDF (LGPD-003). **R1/R12 aberto — LGPD-001** |
| `Lead` (`leads`) | E-mail, telefone, CPF, empresa, cidade/UF | Interessados B2B (revenda) | Captação e conversão de revendedores | LI / C | Supabase | **SEM expurgo — LGPD-009** |
| `StudentLead` (`student_leads`) | Nome, e-mail, telefone, IP, User-Agent, consentimento | Interessados em curso | Funil comercial de curso | C / LI | Supabase; parceiro (WhatsApp) | Reclassifica p/ ABANDONED; **sem delete — LGPD-009** |
| `ContactMessage` (`contact_messages`) | Nome, e-mail, telefone, mensagem, IP, User-Agent | Visitantes/alunos | Atendimento e suporte | EC / LI | Supabase; parceiro (roteado por tenant) | **SEM expurgo — LGPD-009** |
| `EmailLog` (`email_logs`) | E-mail do destinatário, assunto, template (sem corpo HTML) | Destinatários | Trilha de auditoria de envio | LI / OL | Supabase | **SEM expurgo — LGPD-009** |
| `WebhookLog` (`webhook_logs`) | Payload de gateway (CPF/e-mail/telefone) — **agora redigido** | Alunos/parceiros | Idempotência e diagnóstico de webhooks | LI | Supabase | 90d (processed:true apagado); payload de falhos > 180d redigido (LGPD-014) |
| `AuditLog` (`audit_logs`) | Ator, ação, alvo, metadados | Equipe/titulares | Trilha de auditoria de operações sensíveis | OL / LI | Supabase | Retenção longa (accountability) |
| `VisitorEvent` (`visitor_events`) | Cookie anônimo `pmb_vid`, sem IP | Visitantes | Analytics de navegação da vitrine | LI / C | Supabase | 90d (eventos sem lead) — cron `sweep-visitor-events` |

## 3. Retenção e expurgo (estado atual)

| Dado | Prazo | Mecanismo | Situação |
|---|---|---|---|
| `WebhookLog` (processed) | 90 dias | cron `cleanup-webhook-logs` (DELETE) | **Ativo** |
| `WebhookLog` (falhos c/ PII) | 180 dias | cron `cleanup-webhook-logs` (REDIGE payload) | **Ativo** (LGPD-014) |
| `VisitorEvent` sem lead | 90 dias | cron `sweep-visitor-events` (DELETE) | **Ativo** |
| `StudentLead` | reclassifica ABANDONED | cron `sweep-abandoned-leads` (não deleta) | **Sem expurgo** — LGPD-009 |
| `Lead`, `ContactMessage`, `EmailLog` | — | — | **Sem expurgo** — LGPD-009 |

> Prazos-alvo sugeridos (a definir juridicamente — LGPD-009): leads não convertidos 12–24 meses;
> mensagens de contato resolvidas 12 meses; `EmailLog` 6–12 meses; `StudentLead` ABANDONED 12 meses.
> Alternativa menos agressiva: anonimizar `ipAddress`/`userAgent` após N dias.

## 4. Direitos do titular e propagação (erasure)

- Fluxo do aluno: `DELETE /api/aluno/conta` anonimiza `Student`, limpa `Certificate` (nome/CPF/PDF)
  e **bloqueia** o acesso em EA/LMS. Propagação de **exclusão** aos subprocessadores é parcial —
  ver LGPD-013.
- Fluxo do revendedor: `src/lib/lgpd/anonymize.ts` anonimiza o owner no banco PMB.
- **Não se apaga por obrigação legal:** dados fiscais/de pagamento em `Payment`/`TenantPayment` e nos
  gateways **Asaas/Mercado Pago** têm base de retenção contábil/fiscal (art. 16, I LGPD) — isso é
  conformidade, não omissão. Documentar prazo no DPA.

## 5. Transferência internacional

Ver `SUBPROCESSADORES.md` seção 6 e Política seção 16. Declarar região do Supabase e base de
transferência (LGPD-005). ⚠️MIGRAÇÃO Vercel→VPS muda residência e conjunto de operadores.

## 6. Pendências de conformidade (rastreamento)

- LGPD-001 (P0): bucket `certificates` + policy de defesa em profundidade (R12).
- LGPD-002 (P1): consentimento de cookies/pixels.
- LGPD-005 (P2): declarar residência dos dados.
- LGPD-009 (P2): implementar retenção/expurgo de Lead/StudentLead/ContactMessage/EmailLog.
- LGPD-013 (P2): propagar erasure aos subprocessadores com API.
