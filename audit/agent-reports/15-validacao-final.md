# 15 — Validação Final e Consolidação

**Agente:** Revisor Final / Validador (Orquestrador)
**Data:** 2026-05-28

## 1. Comandos re-executados

| Comando | 1ª execução | Re-execução (pós-análise) | Notas |
|---|---|---|---|
| `npm run typecheck` (`tsc --noEmit`) | exit 0 | **exit 0** | strict, sem erros |
| `npm run lint` (`eslint`) | exit 0 | **exit 0** | flat config, sem warnings |
| `npm audit` | 14 vulns (1 H / 10 M / 3 L) | idem | xlsx HIGH sem fix |
| `npm run build` | **não executado** | **não executado** | `build` roda `db:apply-pending` que MUTA o banco. Validação de build deve usar `SKIP_PENDING_MIGRATIONS=1 npx next build` em ambiente isolado. |

Os agentes operaram em modo READ-ONLY; a única alteração aplicada foi em `.env.example`
(documentação, sem impacto em runtime). Typecheck/lint permanecem verdes após a alteração.

## 2. Validação cruzada dos achados (dedupe + recalibração)

O Red Team (relatório 14) desafiou os demais. Conclusões adjudicadas pelo Orquestrador:

### Achados REFUTADOS (removidos ou rebaixados a Informativo)
- **"Rate-limit de login fail-open em prod"** (sugerido em 02/04): **REFUTADO.** `src/lib/ratelimit.ts:57-64` retorna `ok: !isProd` → **fail-CLOSED em produção**. O comentário em `src/lib/auth.ts:89` diz explicitamente "(dev)", logo está correto. Permanece como observação Informativa: garantir monitoramento de "Redis ausente" via `assertEnv` (`src/lib/env.ts:171`).
- **Forja de webhook Asaas e Mercado Pago** (hipótese de 02/14): **REFUTADO.** Asaas valida token no header e MP exige `x-signature`/HMAC + `getPayment` com token do tenant (pagamento precisa existir de fato na conta). O `data.id` é manipulável, mas não rende fulfillment sem pagamento real. Idempotência por `mpPaymentId` cobre replay.
- **IDOR em 10 rotas `[id]` não amostradas** (preocupação de 04): **REFUTADO** pelo Red Team — todas filtram por `tenantId`/owner derivado da sessão.
- **Injeção de header `x-tenant-id`/`x-tenant-slug`**: **REFUTADO** — `src/proxy.ts:181-183` sanitiza headers do cliente.
- **Path traversal no upload**: **REFUTADO** — `path` é 100% derivado da sessão; uploads validam MIME + magic bytes + 5MB.

### Achados RECALIBRADOS
- **`revendedores/[id]/policy|billing` sem checar `accountManagerId`**: 04 marcou Informativo/Médio; Red Team **eleva para Alto** (flip de `billingMode` para MANUAL desliga auto-block de inadimplência → impacto de segurança/financeiro). Adjudicado: **Alto** (R4).
- **Orphan enrollment `/api/checkout`** (07 marcou Crítico): adjudicado **Alto** (R2) — bloqueia recompra de cliente legítimo e corrompe estado, mas não há vazamento de dados nem acesso indevido.
- **Certificado PII público** (03/13 marcaram Crítico): **MANTIDO Crítico** (R1) e reforçado pelo Red Team com a cadeia de exploração (código previsível ~28 bits + Storage sem rate-limit).

### Achados NOVOS do Red Team (não vistos pelos demais)
- PMB_SALES suspende/reativa qualquer revendedor (`revendedores/[id]/status`) — **Alto** (R4).
- Cross-scope revoke de certificado (`admin/certificates/[id]/revoke`) — **Médio**.
- Entropia real do código de certificado = 28 bits (8º hex char descartado em `code.ts:8-9`) — agrava R1.

## 3. Confiança e limitações
- Auditoria majoritariamente **estática** (sem DAST/execução com banco real). Cenários de
  ataque são raciocínio sobre código lido, não exploração executada.
- RLS no Postgres inferido pelo modo de conexão (Prisma como owner) e migrations; não
  inspecionado via conexão direta ao banco.
- Cobertura de UI/acessibilidade é estática (sem navegador/axe-core/Lighthouse reais).
- `.env.local`/`.env.vercel.production` não lidos (contêm segredos).

## 4. Veredito de consolidação
Codebase **maduro e bem defendido** na superfície clássica (XSS/SQLi/IDOR/mass-assignment
amplamente mitigados; headers, rate-limit, HMAC, criptografia de token presentes). Os riscos
reais concentram-se em: (1) **exposição de PII via Storage público** (único Crítico),
(2) **inconsistências de autorização entre papéis PMB**, (3) **bugs em fluxos de dinheiro**
(cupom/orphan/inadimplência), (4) **ausência total de testes** e (5) **lacunas de LGPD**
(exclusão, audit log persistente, consentimento de analytics).
