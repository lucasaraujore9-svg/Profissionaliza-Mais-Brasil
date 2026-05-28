-- =============================================================
-- Migration: Notas internas por aluno (student_notes)
-- Data: 2026-05-27
-- Idempotente.
-- - Tabela usada por admin/painel para comentarios internos sobre
--   um aluno (suporte/contexto). NUNCA exibida ao proprio aluno.
-- =============================================================

CREATE TABLE IF NOT EXISTS "student_notes" (
  "id"         TEXT PRIMARY KEY,
  "student_id" TEXT NOT NULL,
  "author_id"  TEXT NOT NULL,
  "body"       TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "student_notes_student_id_created_at_idx"
  ON "student_notes"("student_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'student_notes_student_id_fkey'
  ) THEN
    ALTER TABLE "student_notes"
      ADD CONSTRAINT "student_notes_student_id_fkey"
      FOREIGN KEY ("student_id") REFERENCES "students"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'student_notes_author_id_fkey'
  ) THEN
    ALTER TABLE "student_notes"
      ADD CONSTRAINT "student_notes_author_id_fkey"
      FOREIGN KEY ("author_id") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END$$;
