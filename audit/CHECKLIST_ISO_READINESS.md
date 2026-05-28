# Checklist de Readiness para Auditoria — LGPD / ISO 27001-27002 / 25010

> Esta análise **não certifica** o projeto. Avalia a **prontidão técnica** para due diligence,
> auditoria interna e revisão de produção. Carimbos formais exigem auditor credenciado.
> **Prontidão geral adjudicada: PARCIAL** (documentação legal forte; lacunas técnicas de
> privacidade e ausência de testes/audit-log persistente).

| Área | Controle esperado | Evidência técnica (arquivo) | Lacuna | Status | Próxima ação |
|---|---|---|---|---|---|
| LGPD — Política | Política de privacidade publicada | `app/(main)/privacidade` (v1.1, 19 cláusulas, DPO, bases legais, sub-operadores) | — | ✅ Boa | Manter versionada |
| LGPD — Termos/Contrato | Termos de uso e contrato de revenda | `(main)/termos`, `(main)/contrato-de-revenda`, `(main)/reembolso` | — | ✅ Boa | — |
| LGPD — Consentimento | Registro de consentimento do titular | Consentimento de lead versionado | Aceite de termos sem `termsAcceptedAt`/versão no banco (R38) | ⚠️ Parcial | Registrar aceite com timestamp+versão |
| LGPD — Cookies | Banner + carregamento condicional | Banner existe | Vercel Analytics carrega incondicional (`layout.tsx:110-111`, R15) | ⚠️ Parcial | Carregar analytics só após consentimento |
| LGPD — Minimização | Coletar só o necessário | `schema.prisma` (Student: nome, cpf, email, telefone) | CPF/PII justificados (matrícula); revisar campos não usados | ✅ Boa | Documentar finalidade por campo |
| LGPD — Exposição de PII | PII protegida em repouso/trânsito | Senhas bcrypt; mpToken AES-256-GCM (`crypto.ts`) | **CPF em PDF de bucket público (R1)**; CPF em claro no banco | ❌ Crítico | Bucket privado + signed URL; avaliar cifra de CPF |
| LGPD — Direito de exclusão | Endpoint/fluxo de exclusão | — | Não implementado (R13) | ❌ | Implementar exclusão/anonimização |
| LGPD — Portabilidade | Exportação de dados do titular | Exports financeiros existem (admin) | Sem export por titular (aluno) | ⚠️ Parcial | Endpoint de exportação por titular |
| LGPD — Retenção | Política de retenção + expurgo | `cron/cleanup-webhook-logs` | TTL de Lead/Student não definido (R38) | ⚠️ Parcial | Definir e automatizar retenção |
| LGPD — Operadores (art.39) | DPA com sub-operadores | Política lista sub-operadores | Sem evidência de DPA assinado (Supabase, Vercel, Upstash, MP, Asaas, plataforma) | ⚠️ Documental | Firmar/arquivar DPAs |
| 27002 — Controle de acesso | RBAC + privilégio mínimo | Guards (`auth/guards.ts`), roles | Sem RLS (R3); inconsistências de papel PMB (R4) | ⚠️ Parcial | Escopar papéis; defesa em profundidade |
| 27002 — Criptografia | Dados sensíveis cifrados | bcrypt, AES-256-GCM | CPF em claro; CSP fraca (R18) | ⚠️ Parcial | Avaliar cifra de CPF; CSP nonce |
| 27002 — Trilha de auditoria | Log de ações sensíveis | `logAudit()` (Pino), eventos auth | **Não persistido em banco (R14)** — inutilizável p/ forense | ❌ | Tabela de audit log |
| 27002 — Gestão de segredos | Segredos fora do código, rotação | `env.ts`, `.mcp.json` gitignored, `SUPABASE_ACCESS_TOKEN` só local | Rotação de `ENCRYPTION_KEY` não documentada | ✅ Boa | Documentar rotação |
| 27002 — Segregação de funções | Papéis distintos com limites | 5 papéis | Limites entre papéis PMB frouxos (R4) | ⚠️ Parcial | Ver FASE 1 |
| 27002 — Gestão de mudanças | Deploy controlado, rollback | CI lint/typecheck; Vercel | Build muta DB sem lock/staging (R17); sem testes | ⚠️ Parcial | Staging + gate + testes |
| 27002 — Backup | Backup e teste de restore | Supabase (gerenciado) | Não documentado/testado | ⚠️ Documental | Confirmar e testar restore |
| 27002 — Resposta a incidentes | Plano de IR + rastreabilidade | `webhook_logs`, logs | Sem plano documentado; audit log volátil (R14) | ⚠️ Parcial | Documentar plano de IR |
| 25010 — Confiabilidade/Testabilidade | Testes automatizados | **0 testes** | Risco em fluxos de dinheiro | ❌ | Vitest + Playwright (FASE 2) |
| 25010 — Manutenibilidade | Baixo acoplamento/duplicação | Libs de domínio organizadas | Checkout 3x duplicado, schemas duplicados (R29) | ⚠️ Parcial | Refatorar duplicações |

## Classificação de prontidão por dimensão
- **Documentação legal (LGPD):** Boa
- **Privacidade técnica (PII/exclusão/audit):** Baixa→Parcial (R1, R13, R14)
- **Controle de acesso:** Parcial (forte na base, lacunas em R3/R4)
- **Operação/mudança:** Parcial (R17, sem staging)
- **Qualidade/testes (25010):** Baixa (0 testes)
- **Veredito global:** **Parcial** — não pronta para auditoria formal sem fechar R1, R13, R14 e introduzir testes.
