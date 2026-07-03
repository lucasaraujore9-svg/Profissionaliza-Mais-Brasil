# Centralização e retenção de logs (OBS-006 · ⚠️MIGRAÇÃO)

> **Status:** documentação de setup entregue. A **implementação** da stack de
> logs própria é parte da **⚠️MIGRAÇÃO Vercel→VPS** e depende de **decisão do
> dono** (ferramenta, retenção, custo). Não é implementável só no repositório.

---

## 1. Situação atual (Vercel)

- Logs são **Pino JSON no stdout** (`src/lib/logger.ts`), com `requestId`/
  `tenantId` via `AsyncLocalStorage` e redação de PII (`REDACT_PATHS`).
- Agregação/retenção hoje = **Vercel Runtime Logs / Log Drains**.
- Sem `AXIOM_TOKEN`/`AXIOM_DATASET` em prod (memória
  `reference_logs_vercel_runtime`), `createHttpLogStream()` retorna `null`
  (`src/lib/observability/log-transport.ts`) → app fica **só em stdout**.
- `vercel logs <url> --json` é **live-tail sem histórico**.

O código já está pronto para fan-out HTTP: `log-transport.ts` envia para um
endpoint Axiom-compatible quando `AXIOM_URL`/`AXIOM_TOKEN`/`AXIOM_DATASET`
existem — esse mesmo caminho pode apontar para um coletor próprio.

---

## 2. Problema na migração para VPS/Swarm

No Docker Swarm **não existe Vercel Log Drain**. Sem uma stack própria, os logs
morrem no stdout do container — **sem histórico nem busca**. Combinado com a
ausência de error-tracker (OBS-001), a observabilidade cairia a quase zero.

---

## 3. Stack recomendada (PROPOSTA — a decidir/implementar pelo dono)

- **Coleta:** **Promtail/Grafana Alloy** (ou **Vector**) lendo o stdout dos
  containers via log-driver do Docker.
- **Armazenamento/busca:** **Loki**.
- **Visualização:** **Grafana** (mesma stack de métricas se OBS-004 avançar com
  Prometheus).
- **Labels:** `service`, `env`, `tenantId`, `requestId` (já emitidos nos logs).
- **Retenção:** definir por escrito — sugestão **30–90 dias** (validar custo ×
  necessidade de auditoria/LGPD).

Alternativa de menor esforço: apontar `AXIOM_URL`/`AXIOM_TOKEN`/`AXIOM_DATASET`
para um endpoint Axiom-compatible (ex.: Vector com sink HTTP) — o
`log-transport.ts` já suporta sem mudança de código.

---

## 4. Verificação (após implementação)

- Em staging-Swarm, um log emitido pelo app aparece **pesquisável** no
  Grafana/Loki com label `requestId`.
- Política de retenção configurada e documentada.

---

## 5. Pendências (decisão/ação do dono)

- [ ] Escolher a stack (Loki+Alloy+Grafana vs Vector→Loki vs Axiom-compatible).
- [ ] Definir e configurar a retenção.
- [ ] Prover as envs (`AXIOM_URL`/`AXIOM_TOKEN`/`AXIOM_DATASET`) ou o log-driver.
