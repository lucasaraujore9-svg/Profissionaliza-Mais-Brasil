-- Papeis e permissoes da equipe da unidade (revenda).
--
-- Ate aqui existiam so dois papeis de fato (owner e consultant) e ambos viam o
-- painel completo do dono. Passamos a ter 4 papeis atribuiveis
-- (manager | consultant | support | finance) com preset de permissoes + ajuste
-- fino por pessoa. Fonte da verdade dos presets: src/lib/auth/painel-permissions.ts.
--
-- Idempotente. NAO faz backfill: as linhas existentes seguem com
-- role='consultant' e passam a cair no preset restrito de Vendedor — que e
-- exatamente o objetivo da mudanca. O dono repromove em /painel/equipe quem
-- atuava como gerente.

ALTER TABLE "tenant_members"
  ADD COLUMN IF NOT EXISTS "extra_permissions" TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE "tenant_members"
  ADD COLUMN IF NOT EXISTS "revoked_permissions" TEXT[] NOT NULL DEFAULT '{}';

-- O default antigo da coluna era 'manager' (herdado de quando o model era so um
-- placeholder). Nenhuma linha nasce sem role explicito hoje, mas alinhamos o
-- default com o preset mais restrito para o caso de um INSERT futuro omiti-lo.
ALTER TABLE "tenant_members" ALTER COLUMN "role" SET DEFAULT 'consultant';

-- Listagem da equipe e roteamento de notificacao filtram por (tenant, papel).
CREATE INDEX IF NOT EXISTS "tenant_members_tenant_id_role_idx"
  ON "tenant_members" ("tenant_id", "role");
