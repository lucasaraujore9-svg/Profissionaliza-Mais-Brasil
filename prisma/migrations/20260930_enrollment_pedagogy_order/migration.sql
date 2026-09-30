-- =============================================================
-- Migration: ordem de liberacao das aulas por matricula
-- Data: 2026-09-30
-- Idempotente. Aditiva. Sem backfill.
--
-- enrollments.pedagogy_order
--   Override da ORDEM (livre / sequencial / gotejamento) de UMA matricula,
--   definido pela unidade depois da venda. NULL em todas as linhas existentes
--   = segue a regra do curso/unidade, que e o comportamento de hoje.
-- =============================================================

ALTER TABLE "enrollments"
  ADD COLUMN IF NOT EXISTS "pedagogy_order" JSONB;
