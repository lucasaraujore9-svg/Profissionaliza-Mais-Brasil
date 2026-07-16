-- Variante STORIES (9:16) por arte. O file_path existente passa a ser a
-- variante FEED. Idempotente (IF NOT EXISTS).

ALTER TABLE "marketing_arts" ADD COLUMN IF NOT EXISTS "story_file_path" TEXT;
ALTER TABLE "marketing_arts" ADD COLUMN IF NOT EXISTS "story_width" INTEGER;
ALTER TABLE "marketing_arts" ADD COLUMN IF NOT EXISTS "story_height" INTEGER;
