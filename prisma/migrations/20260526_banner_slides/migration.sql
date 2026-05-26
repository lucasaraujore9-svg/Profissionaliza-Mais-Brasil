-- =============================================================
-- Migration: Banner slides para hero do site PMB e vitrines de revenda
-- Data: 2026-05-26
-- Idempotente.
-- =============================================================

CREATE TABLE IF NOT EXISTS "banner_slides" (
  "id"          TEXT PRIMARY KEY,
  "tenant_id"   TEXT,
  "order"       INTEGER NOT NULL DEFAULT 0,
  "desktop_url" TEXT NOT NULL,
  "mobile_url"  TEXT NOT NULL,
  "link_url"    TEXT,
  "active"      BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "banner_slides_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "banner_slides_tenant_id_order_idx"
  ON "banner_slides"("tenant_id", "order");

-- Migra o bannerUrl existente (1 imagem) para 1 slide por tenant que tinha banner.
-- desktop_url = mobile_url = bannerUrl (mesma imagem nos dois ate o operador
-- subir uma versao mobile dedicada). Idempotente: nao recria slide existente.
INSERT INTO "banner_slides" ("id", "tenant_id", "order", "desktop_url", "mobile_url", "active", "created_at", "updated_at")
SELECT
  'legacy-' || t."id",
  t."id",
  0,
  t."banner_url",
  t."banner_url",
  TRUE,
  NOW(),
  NOW()
FROM "tenants" t
WHERE t."banner_url" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "banner_slides" b WHERE b."id" = 'legacy-' || t."id"
  );
