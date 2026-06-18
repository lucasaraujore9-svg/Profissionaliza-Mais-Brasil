-- =============================================================
-- Migration: Treinamentos ("Universidade PMB")
--
-- Conteudo global (sem tenant_id) criado pelo SUPER_ADMIN:
--   1) training_modules        — modulos ordenados/publicaveis.
--   2) training_videos         — videos (YouTube) dentro de um modulo.
--   3) training_progress       — aula assistida por usuario (dono/consultor).
--
-- Idempotente (roda como 1 transacao no apply-pending-migrations).
-- =============================================================

CREATE TABLE IF NOT EXISTS "training_modules" (
  "id"          TEXT PRIMARY KEY,
  "title"       TEXT NOT NULL,
  "description" TEXT,
  "cover_url"   TEXT,
  "position"    INTEGER NOT NULL DEFAULT 0,
  "published"   BOOLEAN NOT NULL DEFAULT false,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "training_modules_position_idx"
  ON "training_modules" ("position");

CREATE TABLE IF NOT EXISTS "training_videos" (
  "id"             TEXT PRIMARY KEY,
  "module_id"      TEXT NOT NULL,
  "title"          TEXT NOT NULL,
  "description"    TEXT,
  "youtube_id"     TEXT NOT NULL,
  "duration_label" TEXT,
  "position"       INTEGER NOT NULL DEFAULT 0,
  "published"      BOOLEAN NOT NULL DEFAULT true,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "training_videos_module_id_position_idx"
  ON "training_videos" ("module_id", "position");

CREATE TABLE IF NOT EXISTS "training_progress" (
  "id"           TEXT PRIMARY KEY,
  "user_id"      TEXT NOT NULL,
  "video_id"     TEXT NOT NULL,
  "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "training_progress_user_id_video_id_key"
  ON "training_progress" ("user_id", "video_id");

CREATE INDEX IF NOT EXISTS "training_progress_user_id_idx"
  ON "training_progress" ("user_id");

-- Foreign keys (guardadas por pg_constraint — ADD CONSTRAINT nao tem IF NOT EXISTS).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_videos_module_id_fkey') THEN
    ALTER TABLE "training_videos"
      ADD CONSTRAINT "training_videos_module_id_fkey"
      FOREIGN KEY ("module_id") REFERENCES "training_modules"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_progress_user_id_fkey') THEN
    ALTER TABLE "training_progress"
      ADD CONSTRAINT "training_progress_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_progress_video_id_fkey') THEN
    ALTER TABLE "training_progress"
      ADD CONSTRAINT "training_progress_video_id_fkey"
      FOREIGN KEY ("video_id") REFERENCES "training_videos"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
