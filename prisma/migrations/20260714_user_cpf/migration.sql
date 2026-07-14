-- ============================================================================
-- CPF na conta de revenda/equipe (User) — login alternativo por CPF
-- ============================================================================
-- Contexto: o login por CPF sempre existiu SO para aluno (Student.cpf); a tela
-- de login promete "Email ou CPF" e donos de revenda tentavam CPF sem sucesso
-- (caso vanguardacursos, 2026-07-14). O cadastro de revendedor ja coletava o
-- CPF do responsavel (pessoal.cpf) mas DESCARTAVA o valor.
--
-- Unique: login por CPF precisa ser deterministico. Nullable: contas antigas
-- nao tem o dado (cadastram no painel > Configuracoes > Dados da conta).
-- Idempotente (roda no build via scripts/apply-pending-migrations.mjs).

ALTER TABLE users ADD COLUMN IF NOT EXISTS cpf TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_cpf_key ON users(cpf);
