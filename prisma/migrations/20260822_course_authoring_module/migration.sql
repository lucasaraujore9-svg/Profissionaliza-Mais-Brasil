-- Modulo "Produzir cursos" por UNIDADE.
--
-- A permissao `cursosAutorais.*` e de PESSOA dentro da unidade, e o preset do
-- dono e `owner: ALL` — ou seja, TODO dono de revenda ja nascia podendo produzir
-- curso e publicar na rede. Produzir conteudo e uma habilitacao COMERCIAL, que a
-- equipe do sistema mae concede unidade a unidade, no mesmo molde de
-- `can_sell_resellers`.
--
-- Default FALSE de proposito: ninguem e habilitado por migration. Nenhuma
-- unidade perde nada — o modulo foi ao ar hoje e nao ha curso de autoria
-- publicado em producao.
ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "course_authoring_enabled" BOOLEAN NOT NULL DEFAULT false;
