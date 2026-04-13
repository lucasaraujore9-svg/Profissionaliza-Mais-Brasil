# Issue 037 — Confirmação: Exibição Success Page

**Tipo:** behavior
**Página:** /loja/confirmacao
**Depende de:** 007
**Prioridade:** P1

## O Que Fazer

Implementar página confirmação após checkout. Ler enrollment_id de query params, carregar enrollment do DB, exibir resumo compra, instruções próximos passos.

## Componentes Envolvidos
- GET /loja/confirmacao?enrollment_id=X
- GET /api/loja/confirmacao/[id] — carregar enrollment completo
- ConfirmationCard (do proto 007) com dados reais

## Comportamentos
- `load-confirmation-page` — ler enrollment_id do query params
- `fetch-enrollment-details` — GET /api/loja/confirmacao/[id]
- `display-success-message` — exibir SuccessIcon + mensagem
- `display-next-steps` — instruções acesso Escola Avançada

## Critério de Aceite
- [ ] URL /loja/confirmacao?enrollment_id=X
- [ ] GET /api/loja/confirmacao/[id] implementado
- [ ] Query Prisma Enrollment WHERE id E tenant_id
- [ ] Retorna { id, student, course, createdAt, status }
- [ ] SuccessIcon animado renderiza
- [ ] ConfirmationCard exibe número pedido (enrollment.id)
- [ ] Exibe resumo: aluno, curso, data
- [ ] NextSteps mensagem: "Você será redirecionado à Escola Avançada em 5 segundos"
- [ ] Link manual "Ir para Escola Avançada"
- [ ] Se enrollment não encontrado, exibir erro
