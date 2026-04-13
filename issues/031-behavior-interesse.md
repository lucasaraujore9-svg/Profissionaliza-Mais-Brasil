# Issue 031 — Seja Revendedor: Captação de Interesse

**Tipo:** behavior
**Página:** /seja-revendedor
**Depende de:** 002, 020
**Prioridade:** P1

## O Que Fazer

Implementar form captação interesse revendedor. Validação Zod, save lead em DB, enviar email confirmação, exibir mensagem sucesso.

## Componentes Envolvidos
- FormularioInteresse (do proto 002) com validação
- POST /api/leads — criar lead no banco
- Email de confirmação com Resend
- Success state após submit

## Comportamentos
- `submit-interesse-form` — validar inputs com Zod, POST /api/leads
- `validate-email` — email format válido
- `validate-telefone` — telefone format válido
- `show-success` — exibir mensagem "Obrigado\! Entraremos em contato"
- `send-confirmation-email` — Resend email com dados lead

## Critério de Aceite
- [ ] FormularioInteresse com 3 inputs (email, nome empresa, telefone)
- [ ] Zod schema para validação
- [ ] POST /api/leads implementado
- [ ] Prisma create Lead { email, company_name, phone, reseller_id (null inicial) }
- [ ] Validação email format (Zod email)
- [ ] Validação telefone format (validação BR)
- [ ] Submit form POST /api/leads com dados
- [ ] Success message "Obrigado\! Entraremos em contato"
- [ ] Email confirmação enviado com Resend
- [ ] Form reseta após submit bem-sucedido
- [ ] Loader button durante submit
- [ ] Error message se submit falhar
