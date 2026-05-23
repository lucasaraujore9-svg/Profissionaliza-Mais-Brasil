CREATE TABLE "push_subscriptions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT,
  "student_id" TEXT,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "failure_count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_subscriptions_user_id_endpoint_key"
  ON "push_subscriptions"("user_id", "endpoint");
CREATE UNIQUE INDEX "push_subscriptions_student_id_endpoint_key"
  ON "push_subscriptions"("student_id", "endpoint");
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");
CREATE INDEX "push_subscriptions_student_id_idx" ON "push_subscriptions"("student_id");
