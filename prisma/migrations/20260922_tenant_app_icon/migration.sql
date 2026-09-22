-- Icone do app (PWA) por unidade. Aditiva e idempotente, sem backfill:
-- app_icon_url nasce NULL = o manifest segue caindo em favicon_url -> logo_url.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "app_icon_url" TEXT;
