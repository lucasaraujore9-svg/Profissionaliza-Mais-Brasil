# Issue 051 — Webhook Mercado Pago: Auto-Enrollment

**Tipo:** integration
**Página:** global
**Depende de:** 020, 024, 026, 027
**Prioridade:** P0

## O Que Fazer

Implementar webhook Mercado Pago para matricular alunos automaticamente. Valida HMAC SHA256, recebe payment ID, faz GET detalhes, cria student + enrollment na plataforma + DB, envia email confirmação.

## Componentes Envolvidos
- POST /api/webhooks/mercadopago — webhook endpoint
- lib/mercadopago/webhook.ts — HMAC validation
- GET /v1/payments/{id} — detalhes pagamento
- plataforma usuarios/novo, usuarios/vinculocurso, usuarios/envioemail
- Email confirmação matrícula

## Comportamentos
- `validate-hmac-sha256` — verificar assinatura HMAC
- `parse-payment-id` — webhook envia só ID
- `get-payment-details` — GET MP /v1/payments/{id}
- `create-student-ea` — POST plataforma usuarios/novo
- `vincular-curso-ea` — POST plataforma usuarios/vinculocurso
- `send-email-ea` — POST plataforma usuarios/envioemail
- `update-enrollment-db` — status APPROVED
- `send-confirmation-email` — Resend email aluno

## Critério de Aceite
- [ ] POST /api/webhooks/mercadopago implementado
- [ ] Valida HMAC SHA256 com MP_WEBHOOK_SECRET
- [ ] Se HMAC inválido, retorna 401
- [ ] Log webhook_logs { event_type, payment_id, status, error }
- [ ] Retorna 200 imediato
- [ ] Parse payload, extrai payment_id (notification ID)
- [ ] GET /v1/payments/{id} com tenant MP token (decriptado)
- [ ] Verifica status == approved
- [ ] POST plataforma usuarios/novo { polo, vendedor, status: ativo, apostila: liberar }
- [ ] POST plataforma usuarios/vinculocurso { aluno: ea_user_id, idcurso: course_ea_id }
- [ ] POST plataforma usuarios/envioemail { aluno: ea_user_id }
- [ ] UPDATE Enrollment { status: APPROVED, ea_student_id }
- [ ] Envia email confirmação matrícula com Resend
- [ ] Async processing
