-- Pixels de rastreamento (marketing/analytics third-party) configuráveis por
-- revenda e pela PMB. Formato JSON validado por src/lib/tracking/schema.ts.
-- Disparam SOMENTE após consentimento LGPD. Aditivo: sem impacto em linhas
-- existentes. Idempotente.

-- Pixels da própria vitrine do revendedor.
ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "tracking_pixels" JSONB;

-- Pixels da PMB (sistema mãe):
--   tracking_pixels_self   -> site institucional PMB + vitrine PMB
--   tracking_pixels_global -> injetados em TODAS as vitrines de revendedores
ALTER TABLE "system_settings"
  ADD COLUMN IF NOT EXISTS "tracking_pixels_self" JSONB;
ALTER TABLE "system_settings"
  ADD COLUMN IF NOT EXISTS "tracking_pixels_global" JSONB;
