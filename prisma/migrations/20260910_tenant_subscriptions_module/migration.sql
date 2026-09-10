-- Modulo "Vender assinaturas" por UNIDADE.
--
-- A assinatura de aluno nasceu aberta para toda revenda: o preset do dono e
-- `owner: ALL`, entao `assinaturas.*` nunca barrou ninguem, e plano da PMB
-- (tenant_id null) aparece sozinho em todas as vitrines. Vender assinatura
-- passa a ser uma habilitacao COMERCIAL, concedida unidade a unidade pela
-- equipe do sistema mae — mesmo molde de `course_authoring_enabled`.
--
-- Default FALSE para TODA unidade, por decisao do dono (2026-09-10), inclusive
-- as que ja montaram plano. Nada e apagado: os planos ficam guardados e voltam
-- a ser vendidos quando o modulo for ligado. Quem ja assina segue com acesso e
-- com a recorrencia no gateway — o gate fecha a VENDA, nao a assinatura viva.
ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "subscriptions_enabled" BOOLEAN NOT NULL DEFAULT false;
