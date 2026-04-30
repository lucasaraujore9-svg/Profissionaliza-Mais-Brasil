CREATE TYPE "NotificationLevel" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'ERROR');
CREATE TYPE "NotificationAudience" AS ENUM ('USER', 'STUDENT', 'TENANT', 'ROLE');

CREATE TABLE "notifications" (
  "id" TEXT NOT NULL,
  "audience" "NotificationAudience" NOT NULL,
  "user_id" TEXT,
  "student_id" TEXT,
  "tenant_id" TEXT,
  "role_target" "UserRole",
  "level" "NotificationLevel" NOT NULL DEFAULT 'INFO',
  "title" TEXT NOT NULL,
  "body" TEXT,
  "category" TEXT,
  "href" TEXT,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");
CREATE INDEX "notifications_student_id_read_at_idx" ON "notifications"("student_id", "read_at");
CREATE INDEX "notifications_tenant_id_read_at_idx" ON "notifications"("tenant_id", "read_at");
CREATE INDEX "notifications_role_target_read_at_idx" ON "notifications"("role_target", "read_at");
CREATE INDEX "notifications_audience_created_at_idx" ON "notifications"("audience", "created_at");
