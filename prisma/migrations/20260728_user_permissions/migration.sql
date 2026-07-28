-- Permissoes por pessoa da equipe interna PMB (sistema mae).
--
-- Ate aqui o admin era 100% papel-fixo: sete valores de UserRole e checagens
-- espalhadas ("role !== 'SUPER_ADMIN'") em 139 rotas e 47 paginas. Passamos ao
-- mesmo modelo ja em producao do lado da unidade: o papel define um PRESET e
-- estas duas colunas ajustam pessoa a pessoa.
--
-- Fonte da verdade dos presets: src/lib/auth/admin-permissions.ts.
--
-- Idempotente. NAO faz backfill de proposito: com as duas listas vazias, cada
-- pessoa resolve exatamente o preset do seu papel — que reproduz a matriz que
-- os guards antigos ja aplicavam. Nenhuma conta muda de poder no deploy.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "extra_permissions" TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "revoked_permissions" TEXT[] NOT NULL DEFAULT '{}';
