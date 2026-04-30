CREATE TABLE "notification_preferences" (
  "id" TEXT NOT NULL,
  "user_id" TEXT,
  "student_id" TEXT,
  "category" TEXT NOT NULL,
  "in_app" BOOLEAN NOT NULL DEFAULT true,
  "email" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_preferences_user_id_category_key"
  ON "notification_preferences"("user_id", "category");
CREATE UNIQUE INDEX "notification_preferences_student_id_category_key"
  ON "notification_preferences"("student_id", "category");
CREATE INDEX "notification_preferences_user_id_idx" ON "notification_preferences"("user_id");
CREATE INDEX "notification_preferences_student_id_idx" ON "notification_preferences"("student_id");

ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_notification_preferences"
  ON "notification_preferences"
  FOR ALL TO anon
  USING (false) WITH CHECK (false);
