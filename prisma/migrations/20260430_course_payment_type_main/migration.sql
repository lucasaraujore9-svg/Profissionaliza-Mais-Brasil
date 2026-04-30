ALTER TABLE "courses"
  ADD COLUMN IF NOT EXISTS "payment_type_main" "PaymentType" NOT NULL DEFAULT 'ONE_TIME',
  ADD COLUMN IF NOT EXISTS "monthly_months_main" INTEGER;
