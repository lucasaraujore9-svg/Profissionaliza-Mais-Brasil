# Resumo Executivo — Auditoria Técnica PMB

**Data:** 2026-05-28 · **Método:** auditoria multiagente (16 papéis) · **Escopo:** código-fonte completo
(718 arquivos, 200 rotas de API, 31 migrations, 108 páginas).

## Estado geral
O **Profissionaliza Mais Brasil** é um sistema **maduro e bem construído** para o estágio em que está.
A superfície de ataque clássica (XSS, injeção SQL, manipulação de preço, acesso indevido entre
revendedores, falsificação de webhook de pagamento) foi testada e está **majoritariamente protegida**.
Build, verificação de tipos e linter passam sem erros. Há criptografia de tokens de pagamento,
limitação de tentativas de login, cabeçalhos de segurança e validação de dados.

**Risco geral: MÉDIO.** Não há porta dos fundos aberta nem vazamento massivo evidente, mas existe
**1 problema crítico de privacidade**, **inconsistências de permissão entre perfis administrativos**,
**bugs em fluxos que envolvem dinheiro** e **ausência total de testes automatizados** — itens que
precisam ser resolvidos antes de operar em escala com tranquilidade jurídica e financeira.

## Achados por severidade (consolidado e adjudicado)
| Severidade | Qtd | 
|---|---|
| 🔴 Crítico | 1 |
| 🟠 Alto | 16 |
| 🟡 Médio | 15 |
| 🟢 Baixo | 6 |
| ⚪ Informativo | diversos |
| ✅ Corrigido nesta auditoria | 1 (`.env.example`) |

## Principais riscos de NEGÓCIO
1. **Vazamento de CPF de alunos (LGPD).** Os PDFs de certificado ficam num armazenamento **público**
   com endereço **adivinhável**, sem exigir login — qualquer pessoa pode baixar certificados com
   nome e CPF em massa. É o risco mais grave e o mais urgente (exposição de dados pessoais = multa ANPD).
2. **Perda de vendas e clientes travados.** Uma falha no checkout principal pode deixar a compra
   "presa", impedindo o aluno de comprar novamente.
3. **Descontos sem limite.** Um tipo de cupom escapa do teto de 50% da equipe de vendas, permitindo
   zerar o preço de um curso.
4. **Inadimplência mal aplicada.** Em alguns casos o aluno/revendedor inadimplente continua com acesso
   além do previsto.
5. **Sem rede de testes.** Qualquer alteração futura pode quebrar cobrança ou matrícula sem ninguém
   perceber, porque o sistema não tem testes e a esteira só verifica estilo de código.

## Principais riscos TÉCNICOS
- **Sem RLS no banco:** toda a segurança depende do código da aplicação; não há uma segunda barreira
  no banco de dados. Hoje funciona, mas é frágil.
- **Permissões entre perfis administrativos** (vendas/gerente) permitem agir sobre revendedores que
  não deveriam gerenciar.
- **Deploy aplica alterações no banco** sem ambiente de testes separado e sem trava contra execução
  concorrente.
- **Performance:** relatórios e disparos em massa carregam tudo em memória — risco de lentidão/queda
  sob volume.
- **Audit log não é guardado** em banco — dificulta investigar incidentes.

## O que IMPEDE ir para produção (com tranquilidade)
- Corrigir a exposição de CPF nos certificados (Crítico).
- Corrigir os bugs de dinheiro (checkout órfão, cálculo de desconto, cupom FIXED, inadimplência).
- Escopar as permissões dos perfis administrativos.
- Configurar no Vercel as variáveis obrigatórias (ex.: chave do webhook do Mercado Pago) — sem ela,
  matrículas automáticas não acontecem.

## O que IMPEDE passar numa auditoria formal (LGPD/ISO)
- Exposição de PII (certificados) e CPF em claro.
- Falta de fluxo de **exclusão de dados** do titular.
- **Audit log** não persistido.
- **Zero testes** automatizados (qualidade/confiabilidade).
- Pendências documentais: contratos com fornecedores de dados (DPA), retenção, plano de incidentes.

## Investimento técnico recomendado (ordem de grandeza)
- **Fase 1 (urgente, ~1–2 semanas de engenharia):** certificados privados, bugs de dinheiro,
  escopo de permissões, rate-limits faltantes, configurar env no Vercel.
- **Fase 2 (~3–4 semanas):** testes (unit + e2e), performance dos relatórios, acessibilidade,
  refatorar duplicações de checkout.
- **Fase 3 (contínuo):** RLS/defesa em profundidade, audit log persistente, staging, CSP forte,
  exclusão de dados e formalização documental LGPD/ISO.

> Conclusão: base sólida, sem indícios de comprometimento, mas com **um risco crítico de privacidade**
> e um conjunto de **correções de dinheiro e permissão** que devem preceder a operação em escala.
