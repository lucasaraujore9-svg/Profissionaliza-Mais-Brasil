-- RESPONSAVEL FINANCEIRO para aluno MENOR DE IDADE.
--
-- Idempotente: aplicada automaticamente no build por scripts/apply-pending-migrations.mjs
-- e segura para re-execucao (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).
-- Sem backfill — ver a nota sobre responsavel_definido_em abaixo.
--
-- POR QUE: ate aqui existia UMA identidade por venda. O `Student` era ao mesmo
-- tempo quem estuda e quem paga, e como o gateway exige um pagador adulto com
-- CPF, os vendedores cadastravam a MAE como se fosse a aluna. Resultado: o
-- certificado — que le `students.nome`/`students.cpf` no ato da emissao — saia
-- no nome do responsavel. Estas colunas separam os dois papeis mantendo UMA
-- linha por aluno (`students` e a ancora do login, do plataformaAlunoId, do
-- lmsStudentId, do asaasCustomerId e de todas as matriculas; parti-la em duas
-- seria cirurgia de risco desproporcional).
--
-- `responsavel`, `rg_responsavel` e `cpf_responsavel` JA EXISTIAM desde
-- 20260413_init (herdados do schema da plataforma de aulas, que sempre aceitou
-- esses campos) e nunca foram escritos por codigo nosso — sao reusados, nao
-- recriados.

-- Contato do responsavel. NAO da para reusar students.email/fone: eles passam a
-- ser do ALUNO (email e a chave de login dele, @@unique([tenant_id, email]), e
-- o que o LMS exige). Sem coluna propria, o Mercado Pago falha duro
-- (PAYER_EMAIL_MISSING) e o Asaas manda telefone de menor para analise de risco
-- de cartao em creditCardHolderInfo.
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "responsavel_email" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "responsavel_fone" TEXT;

-- Grau de parentesco. TEXT com allowlist no Zod, e nao enum Postgres, de
-- proposito: ALTER TYPE ... ADD VALUE exige migration isolada (ver
-- scripts/apply-pending-migrations.mjs) e isto e um campo descritivo.
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "responsavel_parentesco" TEXT;

-- Quando o bloco foi COLETADO. E um FATO, nao uma regra derivada: um booleano
-- "responsavel_obrigatorio" desincronizaria de `nascimento` no dia do 18o
-- aniversario, que e precisamente a classe de bug que este recurso combate.
--
-- DELIBERADAMENTE SEM BACKFILL: nao carimbar as linhas herdadas da EA com
-- updated_at. NULL precisa continuar significando "nunca passou pelo fluxo
-- novo" — e essa distincao que a tela de titularidade consome para saber o que
-- ainda nao foi revisado.
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "responsavel_definido_em" TIMESTAMP(3);

-- Customer Asaas DO RESPONSAVEL, separado de students.asaas_customer_id.
-- Sem esta coluna o `cus_` da mae cairia no campo do aluno e ele passaria a
-- cobrar nela PARA SEMPRE — inclusive depois dos 18 —, e como o codigo reusa o
-- customer em cache o erro nunca seria detectado.
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "responsavel_asaas_customer_id" TEXT;

-- Revisao de titularidade: marca "olhei este cadastro e esta correto", para o
-- caso sair da fila sem precisar de um model + cron de varredura (a base toda
-- cabe numa tela: 230 alunos, 17 com certificado).
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "titularidade_revisada_em" TIMESTAMP(3);
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "titularidade_revisada_por_id" TEXT;

-- src/lib/auth.ts autentica o aluno por email OU CPF. Depois de uma correcao de
-- titularidade, students.cpf passa a ser o do FILHO — e a mae, que era quem
-- vinha entrando, perderia o acesso em silencio. O login passa a aceitar
-- tambem o cpf_responsavel, e este indice sustenta esse OR.
CREATE INDEX IF NOT EXISTS "students_tenant_id_cpf_responsavel_idx"
  ON "students" ("tenant_id", "cpf_responsavel");

-- Rastro da correcao no proprio certificado. O `code` publico NAO muda: ele ja
-- circulou (impresso, WhatsApp, entregue a empregador) e troca-lo faria
-- /validar/{code} responder "nao encontrado" para quem conferisse o codigo
-- antigo — o que le como fraude, o oposto da mensagem pretendida.
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "corrected_at" TIMESTAMP(3);
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "corrected_by_user_id" TEXT;
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "correction_reason" TEXT;
