-- Tipo de conteudo: curso (aulas em video) ou e-book (arquivo para ler).
--
-- O catalogo so tinha uma forma de produto. A unidade e a PMB passam a poder
-- publicar e-book, que compartilha TODA a camada comercial (matricula, cobranca,
-- cupom, pacote, split, assinatura) e muda so o que o aluno recebe — e, por
-- isso, o que a pagina de venda promete.
--
-- Aditiva e idempotente. SEM backfill: `content_type` nasce 'COURSE' em todas as
-- linhas existentes, que e exatamente o que elas sao. O e-book so aparece quando
-- o LMS mandar um no sync do catalogo.

-- ── Enum ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContentType') THEN
    CREATE TYPE "ContentType" AS ENUM ('COURSE', 'EBOOK');
  END IF;
END $$;

-- ── Colunas ─────────────────────────────────────────────────────────────────
ALTER TABLE "courses"
  ADD COLUMN IF NOT EXISTS "content_type"       "ContentType" NOT NULL DEFAULT 'COURSE',
  -- NULL = nao informado pelo autor. A vitrine simplesmente nao mostra a linha,
  -- em vez de anunciar "0 paginas".
  ADD COLUMN IF NOT EXISTS "ebook_pages"        INTEGER,
  ADD COLUMN IF NOT EXISTS "ebook_downloadable" BOOLEAN       NOT NULL DEFAULT true;

-- Indice do discriminador: as listagens do /admin e os relatorios separam os
-- dois tipos, e a vitrine filtra por ele quando a unidade separa as prateleiras.
CREATE INDEX IF NOT EXISTS "courses_content_type_idx" ON "courses" ("content_type");
