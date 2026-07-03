# Monitoramento de uptime e alerta externo (OBS-005)

> **Status:** documentação de setup entregue. A **ativação** (configurar o
> monitor externo e o canal de alerta) é **ação/decisão do dono** — não é
> implementável só no repositório. Ver "Pendências" ao final.

O sistema já expõe o alvo certo; falta o *consumidor* externo e o canal de push.

---

## 1. O que já existe no repo

- **`GET /api/health`** — deep health check (`src/app/api/health/route.ts`):
  - Postgres `SELECT 1` → **503** se falha (não vaza `err.message` — API-002).
  - Redis `ping()` informativo (não derruba o 503).
  - `latencyMs` + `timestamp`. Sem auth (por design; é barato e idempotente).
- **Alertas in-app** `createNotification(roleTarget: SUPER_ADMIN)` em falhas de
  provisionamento/billing/cron (`src/lib/enrollment/fulfill.ts`,
  `src/lib/mercadopago/process.ts`, `src/lib/asaas/process.ts`,
  `src/lib/resellers/create.ts`, sweeps de cron após OBS-003).
  - **Limitação:** exigem o SUPER_ADMIN abrir o painel — **inúteis para "app fora
    do ar"**. Daí a necessidade de um canal externo (push).

---

## 2. Setup recomendado (PROPOSTA — a executar pelo dono)

### 2.1. Monitor de uptime

- **Ferramenta recomendada:** **Uptime Kuma** (self-hosted, alinhado à ⚠️MIGRAÇÃO
  VPS). Alternativas SaaS: Better Uptime, UptimeRobot, healthchecks.io.
- **Configuração do monitor HTTP:**
  - URL: `https://profissionalizamaisbrasil.com.br/api/health`
  - Intervalo: **60–120 s**.
  - Condição de "up": HTTP **200** **e** `checks.database === true` (usar keyword
    match `"status":"healthy"` se a ferramenta não fizer parse de JSON).
  - Timeout: 10 s (o endpoint tem `maxDuration = 10`).
- **Monitor de crons (heartbeat):** os crons rodam por pg_cron e o corpo HTTP é
  descartado (ver DR-RUNBOOKS §2 runbook F). Opção: cada cron faz um ping a um
  monitor "push/heartbeat" (healthchecks.io / Uptime Kuma push) no fim; ausência
  do ping no intervalo esperado dispara alerta — cobre o incidente histórico dos
  jobs mortos por ~6 semanas.

### 2.2. Canal de alerta externo

- Configurar no monitor um canal de **push** para 503/timeout: **Telegram**,
  WhatsApp ou **e-mail** (o Resend já está disponível no projeto).
- (Opcional) Ponte in-app → externo: encaminhar `createNotification` de nível
  `ERROR` para o mesmo canal, para que falhas críticas de provisionamento/cron
  não dependam de login no painel. Reaproveitar o `sendEmail` já existente.

### 2.3. Limiares acionáveis (depende de OBS-004)

Uma vez que métricas de latência/erro por endpoint existam (OBS-004, requer
decisão do dono), definir alertas por **taxa de erro** e **latência p95** — não
só up/down. Evitar ruído: alertar só em degradação sustentada.

---

## 3. Verificação (após ativação pelo dono)

- Monitor externo registrado batendo em `/api/health` a cada 1–2 min.
- Derrubar o DB em staging → alerta chega no canal externo em **< 2 min**.
- Heartbeat de cron ausente → alerta dispara.

---

## 4. Pendências (ação/decisão do dono)

- [ ] Escolher e provisionar o monitor (Uptime Kuma self-host recomendado).
- [ ] Configurar o canal de push (Telegram/WhatsApp/e-mail).
- [ ] Ligar heartbeats dos crons.
- [ ] Definir limiares p95/erro após OBS-004.
