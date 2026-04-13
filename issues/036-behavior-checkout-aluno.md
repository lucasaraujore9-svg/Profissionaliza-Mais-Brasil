# Issue 036 — Checkout Aluno: Pagamento + Confirmação

**Tipo:** behavior
**Página:** /loja/checkout
**Depende de:** 007, 026, 027
**Prioridade:** P1

## O Que Fazer

Implementar checkout aluno completo: form dados aluno, criar student PENDING no DB, criar enrollment PENDING, gerar MP preference com token decriptado, redirecionar para MP init_point.

## Componentes Envolvidos
- StudentForm (do proto 007) com validação Zod
- POST /api/loja/checkout — criar student + enrollment + MP preference
- lib/mercadopago client para criar preference
- lib/crypto decrypt MP token do tenant
- Redirect para MP payment link (init_point)

## Comportamentos
- `submit-checkout` — POST /api/loja/checkout com dados form
- `validate-student-data` — Zod schema validar nome, email, CPF, telefone, endereço
- `create-student-pending` — Prisma Student { status: PENDING, tenant_id, ... }
- `create-enrollment-pending` — Prisma Enrollment { status: PENDING, student_id, course_id, ... }
- `create-mp-preference` — MP POST /checkout/preferences
- `decrypt-mp-token` — AES-256-GCM decrypt tenant.mp_access_token_encrypted
- `redirect-mp-init-point` — navegar para preference.init_point

## Critério de Aceite
- [ ] StudentForm com inputs: nome, email, CPF, telefone, endereço
- [ ] Zod schema validate CPF (formato valido)
- [ ] POST /api/loja/checkout implementado
- [ ] Cria Student { email, name, cpf, phone, address, tenant_id, status: PENDING }
- [ ] Cria Enrollment { student_id, course_id, tenant_id, status: PENDING }
- [ ] MP preference { items: [{ title, quantity: 1, unit_price }], payer: { email, name } }
- [ ] Decrypt tenant.mp_access_token_encrypted com lib/crypto
- [ ] POST MP /checkout/preferences com token decriptado
- [ ] Retorna preference.init_point
- [ ] Redirect para init_point (MP payment page)
- [ ] Se falha MP, mostrar erro e manter dados form
