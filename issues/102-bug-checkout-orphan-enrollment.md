# Issue 102 — Rollback de enrollment órfão no `/api/checkout` (PMB)

**Tipo:** bug (remediação)
**Escopo:** `src/app/api/checkout/route.ts` (bloco MP ~linhas 304–441)
**Depende de:** nenhuma (idealmente feita junto/depois de 114, que extrai o helper comum)
**Prioridade:** P1
**Risco:** R2 (Alto)

## Contexto / Evidência
No checkout da vitrine PMB, o bloco que cria preference/preapproval no Mercado Pago **não tem
try/catch próprio**. Se `createPreapproval`/`createPreference` lançar (5xx, timeout), o
`enrollment.PENDING` já criado fica **órfão** e bloqueia o aluno de recomprar (retorna 409
`DUPLICATE_ENROLLMENT`) permanentemente. O `catch` externo libera o cupom, mas **não deleta o
enrollment**. As outras 3 rotas de checkout (`loja/checkout`, `aluno/comprar`, `admin/vendas`)
rastreiam `createdEnrollmentId` e deletam no catch — esta não.

## O Que Fazer
1. Rastrear `createdEnrollmentId` antes da chamada MP.
2. Envolver a criação MP em try/catch que, em erro: deleta o `enrollment` PENDING criado, libera o
   cupom (já ocorre) e retorna erro 502/503 ao cliente.
3. Garantir idempotência: se já existir enrollment PENDING recente do mesmo aluno+curso, permitir
   retomar/limpar em vez de travar com 409 para sempre (alinhar com as outras rotas).

## Critério de Aceite
- [ ] Falha na criação MP não deixa enrollment PENDING órfão.
- [ ] Cliente consegue refazer a compra após falha transitória.
- [ ] Comportamento idêntico ao das outras 3 rotas de checkout.
- [ ] Teste manual: simular erro MP (token inválido) e confirmar limpeza.
- [ ] (Etapa 2) teste automatizado do rollback.
- [ ] R2 atualizado em `audit/MATRIZ_DE_RISCOS.md`.
- [ ] `npm run typecheck` + `lint` verdes.
