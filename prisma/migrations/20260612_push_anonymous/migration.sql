-- =============================================================
-- Migration: Push para visitantes anônimos + segmentação por unidade
-- Data: 2026-06-12
-- Idempotente.
--
-- Permite que visitantes não logados assinem notificações push. Nesse caso
-- a row de push_subscriptions tem user_id e student_id NULL. A coluna
-- tenant_id registra em qual vitrine (revendedor) a assinatura nasceu, para
-- segmentar campanhas por unidade (NULL = site institucional PMB).
--
-- O índice em endpoint serve ao caminho anônimo do POST /api/push/subscribe,
-- que deduplica por endpoint (não há (user_id|student_id, endpoint) único
-- quando ambos são NULL — no Postgres NULLs são distintos).
-- =============================================================

ALTER TABLE "push_subscriptions"
  ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;

CREATE INDEX IF NOT EXISTS "push_subscriptions_tenant_id_idx"
  ON "push_subscriptions" ("tenant_id");

CREATE INDEX IF NOT EXISTS "push_subscriptions_endpoint_idx"
  ON "push_subscriptions" ("endpoint");
