# Issue 064 — Area PMB Sales (Vendas Diretas na Vitrine PMB)

**Tipo:** behavior + UI
**Escopo:** `src/app/admin/vendas/*` + `src/app/api/admin/vendas/*` + `src/app/api/admin/cupons/*` + `src/app/api/admin/alunos/*`
**Depende de:** 061, 062
**Prioridade:** P1

## Objetivo

PMB_SALES e SUPER_ADMIN usam esta area para operar vendas diretas na vitrine principal PMB: cadastrar aluno, aplicar cupom (ate 50% para PMB_SALES, ate 100% para SUPER_ADMIN), gerar cobranca via Mercado Pago da PMB.

## Paginas

### `admin/vendas/page.tsx` — Dashboard
- MetricCards: vendas do mes (valor + quantidade), ticket medio, cupons usados
- PMB_SALES ve **apenas as proprias** (`Payment.soldByUserId = self`); SUPER_ADMIN ve todas
- Grafico de vendas por dia
- Tabela ultimas vendas

### `admin/vendas/nova/page.tsx` — Wizard nova venda
Steps:
1. **Aluno** — buscar por email/CPF ou cadastrar novo
2. **Curso** — selecionar da vitrine principal (cursos com `status=ATIVO`); preco = `Course.precoVitrineMain`
3. **Cupom** — opcional; validacao server-side: PMB_SALES nao pode aplicar > 50%
4. **Pagamento** — gerar link MP (preference) da conta PMB; retorna URL
5. **Confirmacao** — mostrar link para enviar ao aluno (WhatsApp/email)

### `admin/vendas/cupons/page.tsx`
- Lista de cupons criados pelo usuario (ou todos se SUPER_ADMIN)
- Modal criar cupom: codigo, desconto %, validade, limite de uso, cursos aplicaveis
- Validacao: desconto > 50% bloqueado pra PMB_SALES
- Cupons criados aqui tem `tenantId=null` (so valem na vitrine principal PMB) — jamais vazam pra vitrine de revendedor

### `admin/vendas/alunos/page.tsx`
- Lista de alunos da vitrine PMB (Enrollments com `tenantId=null`)
- Perfil: historico de compras, contato, status na plataforma
- PMB_SALES ve so alunos que ele cadastrou; SUPER_ADMIN ve todos

## Schema ajustes

```prisma
model Payment {
  // ...
  soldByUserId String? @map("sold_by_user_id")
  soldByUser   User?   @relation("SoldPayments", fields: [soldByUserId], references: [id])
}

model Enrollment {
  // ...
  soldByUserId String? @map("sold_by_user_id")
  soldByUser   User?   @relation("SoldEnrollments", fields: [soldByUserId], references: [id])
}
```

## API

- `GET /api/admin/vendas` — lista filtrada por soldByUserId (PMB_SALES) ou todas (SUPER_ADMIN)
- `POST /api/admin/vendas` — cria venda: valida cupom (cap por papel), cria Enrollment+Payment, gera preferencia MP (conta PMB), retorna `initPoint` URL
- `POST /api/admin/cupons` — cria cupom com `tenantId=null`; valida cap (50% ou 100%)
- `GET /api/admin/cupons` — lista
- `PATCH /api/admin/cupons/[id]/toggle` — ativar/desativar
- `GET /api/admin/alunos` — lista
- `POST /api/admin/alunos` — cadastra aluno + cria usuario da plataforma (`usuarios/novo`)

## Guards

- Todas as rotas: `requirePmbSales()` (aceita SUPER_ADMIN tambem)
- `POST /api/admin/vendas` e `POST /api/admin/cupons`: cap de desconto validado server-side com base em `session.user.role`

## Criterios de Aceite

- [ ] PMB Sales completa venda ponta-a-ponta e aluno recebe link MP
- [ ] Cupom 60% criado por PMB_SALES retorna 403
- [ ] Cupom da vitrine PMB (tenantId=null) NAO aparece na vitrine do revendedor
- [ ] PMB_SALES ve apenas proprias vendas/alunos
- [ ] Matricula na plataforma acontece apos pagamento MP (reusa webhook existente mas com branch "tenantId null → conta PMB")
- [ ] `npm run build` verde
