-- Novo papel PMB_RESELLER_DIRECTOR (Diretor de unidades): o Gerente de unidades
-- sem o recorte de carteira — responde por TODAS as revendas da rede.
--
-- Idempotente (ADD VALUE IF NOT EXISTS). Isolado numa migration propria porque
-- Postgres nao deixa USAR um valor de enum recem-adicionado no mesmo arquivo
-- ("unsafe use of new value") — ver a convencao em
-- scripts/apply-pending-migrations.mjs.
--
-- Sem backfill: nenhum usuario existente muda de papel. Quem deve virar diretor
-- e promovido a mao em /admin/equipe.

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PMB_RESELLER_DIRECTOR';
