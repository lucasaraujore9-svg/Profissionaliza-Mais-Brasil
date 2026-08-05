-- API de parceiros (/api/v1): chaves de integracao por sistema.
-- Idempotente: aplicada automaticamente no build por scripts/apply-pending-migrations.mjs
-- e segura para re-execucao (IF NOT EXISTS / DO block no FK).
--
-- Uma chave por SISTEMA INTEGRADO. O segredo em texto puro so existe no
-- instante da criacao (a UI mostra uma vez); aqui fica apenas o SHA-256 dele.
-- Revogar um parceiro nao derruba os demais.
--
-- Sem backfill: nasce vazia. Enquanto nao houver chave ATIVA, /api/v1 responde
-- 401 para todo mundo — que e o estado seguro.

CREATE TABLE IF NOT EXISTS "api_keys" (
  "id"            TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "prefix"        TEXT NOT NULL,
  "key_hash"      TEXT NOT NULL,
  "scopes"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status"        TEXT NOT NULL DEFAULT 'ACTIVE',
  "revoked_at"    TIMESTAMP(3),
  "expires_at"    TIMESTAMP(3),
  "last_used_at"  TIMESTAMP(3),
  "last_used_ip"  TEXT,
  "usage_count"   INTEGER NOT NULL DEFAULT 0,
  "created_by_id" TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- Lookup da chave e por hash: unique => indice O(1), sem varrer a tabela.
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_key_hash_key" ON "api_keys" ("key_hash");
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_prefix_key"   ON "api_keys" ("prefix");
CREATE INDEX IF NOT EXISTS "api_keys_status_created_at_idx" ON "api_keys" ("status", "created_at");

-- Quem criou a chave. SET NULL: desligar a pessoa da equipe nao pode apagar a
-- chave que sustenta a integracao de um parceiro.
DO $$
BEGIN
  ALTER TABLE "api_keys"
    ADD CONSTRAINT "api_keys_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
