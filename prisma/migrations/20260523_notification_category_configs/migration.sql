-- =============================================================
-- Migration: Tabela `notification_category_configs`
-- Data: 2026-05-23
-- Idempotente.
--
-- Centraliza os defaults globais (ligado/desligado, level) das
-- categorias de notificacoes automaticas que o sistema dispara.
-- O usuario individual ainda controla seu canal via
-- `notification_preferences`; este registro funciona como kill-switch
-- global. Quando enabled=FALSE, `createNotification` nem cria o
-- registro nem dispara push para aquela combinacao (target, category).
--
-- target identifica para quem aquele tipo e mandado:
--   - TENANT  : revendedores (audience=TENANT no createNotification)
--   - STUDENT : alunos       (audience=STUDENT)
--   - ADMIN   : equipe PMB   (audience=ROLE)
-- =============================================================

CREATE TABLE IF NOT EXISTS "notification_category_configs" (
  "target"        TEXT NOT NULL,
  "category"      TEXT NOT NULL,
  "label"         TEXT NOT NULL,
  "description"   TEXT,
  "enabled"       BOOLEAN NOT NULL DEFAULT TRUE,
  "default_level" "NotificationLevel" NOT NULL DEFAULT 'INFO',
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("target", "category")
);

-- Seed categorias conhecidas (idempotente via ON CONFLICT)
INSERT INTO "notification_category_configs" ("target","category","label","description","enabled","default_level","updated_at") VALUES
  ('TENANT','tenant-billing','Mensalidade da revenda','Cobrança gerada, paga, em atraso, suspensão e reativação da mensalidade Asaas.',TRUE,'INFO',CURRENT_TIMESTAMP),
  ('TENANT','payment','Pagamento na vitrine','Aluno pagou um curso na vitrine da unidade.',TRUE,'SUCCESS',CURRENT_TIMESTAMP),
  ('TENANT','sale','Nova venda','Resumo de venda concluída no painel da unidade.',TRUE,'SUCCESS',CURRENT_TIMESTAMP),
  ('TENANT','referral','Indicações','Comissões geradas, disponíveis e pagas pelo programa de indicações.',TRUE,'INFO',CURRENT_TIMESTAMP),
  ('TENANT','announcement','Comunicados do PMB','Avisos e novidades que o Admin Master dispara para as unidades.',TRUE,'INFO',CURRENT_TIMESTAMP),
  ('STUDENT','enrollment','Matrícula','Confirmação de matrícula, vinculo manual feito pelo admin e conclusão de curso.',TRUE,'SUCCESS',CURRENT_TIMESTAMP),
  ('STUDENT','payment','Pagamento','Compra aprovada, mensalidade paga e reativação por pagamento em dia.',TRUE,'SUCCESS',CURRENT_TIMESTAMP),
  ('STUDENT','certificate','Certificado','Certificado emitido após conclusão do curso.',TRUE,'SUCCESS',CURRENT_TIMESTAMP),
  ('STUDENT','announcement','Comunicados e novidades','Avisos disparados pelo PMB ou pela unidade do aluno.',TRUE,'INFO',CURRENT_TIMESTAMP),
  ('ADMIN','lead','Novo lead','Interessado em se tornar revendedor enviou o formulário.',TRUE,'INFO',CURRENT_TIMESTAMP),
  ('ADMIN','tenant','Novo revendedor','Revendedor cadastrado ou atribuído a um gerente.',TRUE,'INFO',CURRENT_TIMESTAMP),
  ('ADMIN','tenant-billing','Cobrança das unidades','Alertas de inadimplência e reativação das mensalidades dos revendedores.',TRUE,'WARNING',CURRENT_TIMESTAMP),
  ('ADMIN','sale','Vendas','Vendas concluídas no ecossistema (admin recebe todas).',TRUE,'INFO',CURRENT_TIMESTAMP),
  ('ADMIN','referral','Payout de indicações','Comissões disponibilizadas e pagamentos efetuados.',TRUE,'INFO',CURRENT_TIMESTAMP)
ON CONFLICT ("target","category") DO NOTHING;
