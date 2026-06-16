-- =============================================================
-- Migration: matriz curricular (conteúdo programático) por curso
-- Data: 2026-06-19
-- Idempotente.
--
-- Cria a coluna. O backfill dos dados está em 20260620_course_matriz_backfill
-- (arquivo separado porque o runner apply-pending-migrations.mjs não reaplica
-- um filename já aplicado quando o conteúdo muda — só emite WARN).
--
-- Lista de tópicos exibida na página do curso e no verso do certificado.
-- Conteúdo global PMB (igual para todas as vitrines). Vazio => curso sem matriz
-- (a seção simplesmente não é renderizada).
--
-- Mapeia Course.matrizCurricular String[] @default([]) — text[] NOT NULL com
-- default array vazio, para casar com o client do Prisma.
-- =============================================================

ALTER TABLE "courses"
  ADD COLUMN IF NOT EXISTS "matriz_curricular" TEXT[] NOT NULL DEFAULT ARRAY[]::text[];
