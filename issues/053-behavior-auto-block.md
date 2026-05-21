# Issue 053 — Auto Block/Unblock: Bloqueio Inadimplência

**Tipo:** behavior
**Página:** global
**Depende de:** 024, 040
**Prioridade:** P1

## O Que Fazer

Implementar bloqueio automático de alunos por inadimplência. Quando Tenant entra OVERDUE: check billing_mode, se AUTO bloqueia na plataforma + DB, se MANUAL notifica revendedor. Quando pagamento resolvido: desbloqueia.

## Componentes Envolvidos
- Webhook Asaas PAYMENT_OVERDUE dispara bloqueio
- Webhook Asaas PAYMENT_RECEIVED dispara desbloqueio
- lib/plataforma-cursos usuarios/editar { status: bloqueado }
- Email notificação revendedor (modo MANUAL)

## Comportamentos
- `block-on-overdue-auto` — Tenant billing_mode=AUTO → bloqueia na plataforma
- `notify-on-overdue-manual` — Tenant billing_mode=MANUAL → notifica revendedor
- `unblock-on-payment-received` — Webhook PAYMENT_RECEIVED desbloqueia
- `update-student-status-ea` — POST plataforma usuarios/editar { status: bloqueado/ativo }
- `update-student-status-db` — Enrollment { status: BLOCKED }

## Critério de Aceite
- [ ] Webhook PAYMENT_OVERDUE (issue 050) dispara bloqueio
- [ ] Query Tenant.billing_mode
- [ ] Se AUTO: POST plataforma usuarios/editar { aluno: ea_student_id, status: bloqueado }
- [ ] UPDATE Enrollment { status: BLOCKED }
- [ ] Se MANUAL: enviar email revendedor notificação
- [ ] Webhook PAYMENT_RECEIVED (issue 050) dispara desbloqueio
- [ ] POST plataforma usuarios/editar { aluno: ea_student_id, status: ativo }
- [ ] UPDATE Enrollment { status: ACTIVE }
- [ ] Logging completo (bloqueio/desbloqueio)
- [ ] Trata errors gracefully
- [ ] Admin pode ver status bloqueio em /painel/alunos
