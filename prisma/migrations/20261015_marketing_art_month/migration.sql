-- Banco de artes organizado por MES. month = 1..12 diz para qual mes a arte
-- foi feita (data comemorativa, campanha do mes); NULL = vale o ano todo
-- (divulgacao de curso, institucional, oferta).
--
-- Aditiva e idempotente. Backfill so das categorias que ja sao sazonais por
-- definicao, e so onde month ainda e NULL (re-executar nao sobrescreve o que o
-- admin escolheu depois).

ALTER TABLE marketing_arts ADD COLUMN IF NOT EXISTS month INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_arts_month_check'
  ) THEN
    ALTER TABLE marketing_arts
      ADD CONSTRAINT marketing_arts_month_check CHECK (month BETWEEN 1 AND 12);
  END IF;
END $$;

UPDATE marketing_arts SET month = 10
 WHERE month IS NULL
   AND category IN ('Dia dos Professores', 'Mês das Crianças', 'Outubro Rosa');

UPDATE marketing_arts SET month = 11
 WHERE month IS NULL
   AND category IN ('Novembro Azul', 'Black Friday');
