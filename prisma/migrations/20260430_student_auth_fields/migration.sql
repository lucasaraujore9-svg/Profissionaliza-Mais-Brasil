ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'STUDENT';

ALTER TABLE "students"
  ADD COLUMN IF NOT EXISTS "password_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "password_set_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reset_token" TEXT,
  ADD COLUMN IF NOT EXISTS "reset_token_expires" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "students_reset_token_key" ON "students"("reset_token");
CREATE INDEX IF NOT EXISTS "students_reset_token_idx" ON "students"("reset_token");
