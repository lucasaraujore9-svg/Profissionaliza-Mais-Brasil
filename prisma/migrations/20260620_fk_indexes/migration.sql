-- DB-002: índices em colunas de FK ainda não indexadas. O Postgres NÃO cria
-- índice automático para FKs; sem eles, junções/cascatas e filtros por essas
-- colunas fazem seq scan (lento sob volume) e DELETE no pai trava varrendo o filho.
--
-- Apenas as colunas comprovadamente SEM índice (verificado em pg_indexes):
-- sold_by_user_id (enrollments/payments) e marked_paid_by_id (tenant_payments/
-- referral_payouts) JÁ tinham índice e foram deixadas de fora.
--
-- Idempotente (IF NOT EXISTS) — seguro re-rodar. SEM CONCURRENTLY: o runner
-- aplica cada migration dentro de uma transação (apply-pending-migrations.mjs),
-- e CREATE INDEX CONCURRENTLY não roda em transação.

CREATE INDEX IF NOT EXISTS "enrollments_coupon_id_idx" ON "enrollments"("coupon_id");
CREATE INDEX IF NOT EXISTS "enrollments_tenant_course_id_idx" ON "enrollments"("tenant_course_id");
CREATE INDEX IF NOT EXISTS "payments_coupon_id_idx" ON "payments"("coupon_id");
CREATE INDEX IF NOT EXISTS "coupons_created_by_user_id_idx" ON "coupons"("created_by_user_id");
CREATE INDEX IF NOT EXISTS "certificates_course_id_idx" ON "certificates"("course_id");
CREATE INDEX IF NOT EXISTS "visitor_events_course_id_idx" ON "visitor_events"("course_id");
CREATE INDEX IF NOT EXISTS "student_notes_author_id_idx" ON "student_notes"("author_id");
CREATE INDEX IF NOT EXISTS "tenant_support_notes_author_id_idx" ON "tenant_support_notes"("author_id");
CREATE INDEX IF NOT EXISTS "referral_payouts_proof_uploaded_by_id_idx" ON "referral_payouts"("proof_uploaded_by_id");
CREATE INDEX IF NOT EXISTS "training_progress_video_id_idx" ON "training_progress"("video_id");
