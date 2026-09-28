-- Espacamento entre envios da mesma caixa SMTP (rodizio distribuido no tempo).
-- Aditiva e idempotente, sem backfill: NULL = caixa nunca usada, sai primeiro.
ALTER TABLE smtp_accounts ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMP(3);
