-- Novo papel PMB_DESIGNER: gerencia o banco de artes de divulgacao.
-- Idempotente (ADD VALUE IF NOT EXISTS).

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PMB_DESIGNER';
