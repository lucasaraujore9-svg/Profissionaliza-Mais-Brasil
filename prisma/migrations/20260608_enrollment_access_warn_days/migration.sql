-- Funil de avisos do fim do prazo de 12 meses de acesso.
-- `access_warn_days_sent` guarda os marcos (em dias antes do `expires_at`:
-- 60/30/15/2) que ja foram notificados, dando dedup + catch-up ao cron
-- `sweep-students-expired`. Aditivo e com DEFAULT: sem impacto em linhas existentes.
ALTER TABLE "enrollments"
  ADD COLUMN IF NOT EXISTS "access_warn_days_sent" INTEGER[] NOT NULL DEFAULT '{}';
