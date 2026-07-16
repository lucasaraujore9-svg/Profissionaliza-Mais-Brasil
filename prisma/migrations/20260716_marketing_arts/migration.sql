-- Banco de artes de divulgacao (global, admin cria -> painel consome).
-- Idempotente (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "marketing_arts" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT,
  "file_path" TEXT NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "has_price" BOOLEAN NOT NULL DEFAULT false,
  "logo_corner" TEXT NOT NULL DEFAULT 'top-right',
  "published" BOOLEAN NOT NULL DEFAULT true,
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketing_arts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "marketing_arts_published_position_idx" ON "marketing_arts" ("published", "position");
