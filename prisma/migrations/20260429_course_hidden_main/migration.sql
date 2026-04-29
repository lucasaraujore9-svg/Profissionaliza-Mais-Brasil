-- Permite admin ocultar um curso só na vitrine principal sem afetar revendedores.
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "hidden_main" BOOLEAN NOT NULL DEFAULT false;
