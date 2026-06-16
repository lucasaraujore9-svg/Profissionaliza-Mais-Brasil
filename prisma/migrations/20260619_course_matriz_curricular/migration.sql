-- =============================================================
-- Migration: matriz curricular (conteúdo programático) por curso
-- Data: 2026-06-19
-- Idempotente.
--
-- Lista de tópicos exibida na página do curso e (futuramente) no verso do
-- certificado. Conteúdo global PMB (igual para todas as vitrines). Vazio =>
-- curso sem matriz (a seção simplesmente não é renderizada).
--
-- Mapeia Course.matrizCurricular String[] @default([]) — text[] NOT NULL com
-- default array vazio, para casar com o client do Prisma.
-- =============================================================

ALTER TABLE "courses"
  ADD COLUMN IF NOT EXISTS "matriz_curricular" TEXT[] NOT NULL DEFAULT ARRAY[]::text[];

-- =============================================================
-- Backfill da matriz curricular oficial (extraída dos PDFs de matriz).
-- Idempotente: UPDATE por slug; reaplicar apenas reescreve o mesmo conteúdo.
-- Cursos sem statement abaixo permanecem com matriz vazia (layout atual).
-- >>> BACKFILL_PLACEHOLDER <<<
-- =============================================================
