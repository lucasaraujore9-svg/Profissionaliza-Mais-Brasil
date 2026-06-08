-- Rastreamento de navegacao do lead (modulo de automacao).
-- `visitor_events` registra cada page view da vitrine identificado pelo cookie
-- anonimo pmb_vid (visitor_id). No momento da captura (form / checkout) o lead
-- herda todo o historico (backfill de lead_id) e os eventos seguintes ja nascem
-- vinculados. Aditivo: sem impacto em linhas existentes.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "VisitorEventKind" AS ENUM ('PAGE_VIEW', 'COURSE_VIEW');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable: vinculo do lead ao cookie do visitante
ALTER TABLE "student_leads"
  ADD COLUMN IF NOT EXISTS "visitor_id" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "visitor_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "visitor_id" TEXT NOT NULL,
    "lead_id" TEXT,
    "kind" "VisitorEventKind" NOT NULL DEFAULT 'PAGE_VIEW',
    "path" TEXT NOT NULL,
    "title" TEXT,
    "course_id" TEXT,
    "course_snapshot" TEXT,
    "referrer" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visitor_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "student_leads_visitor_id_idx" ON "student_leads"("visitor_id");
CREATE INDEX IF NOT EXISTS "visitor_events_visitor_id_created_at_idx" ON "visitor_events"("visitor_id", "created_at");
CREATE INDEX IF NOT EXISTS "visitor_events_lead_id_created_at_idx" ON "visitor_events"("lead_id", "created_at");
CREATE INDEX IF NOT EXISTS "visitor_events_tenant_id_created_at_idx" ON "visitor_events"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "visitor_events"
  ADD CONSTRAINT "visitor_events_tenant_id_fkey" FOREIGN KEY ("tenant_id")
  REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "visitor_events"
  ADD CONSTRAINT "visitor_events_lead_id_fkey" FOREIGN KEY ("lead_id")
  REFERENCES "student_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "visitor_events"
  ADD CONSTRAINT "visitor_events_course_id_fkey" FOREIGN KEY ("course_id")
  REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
