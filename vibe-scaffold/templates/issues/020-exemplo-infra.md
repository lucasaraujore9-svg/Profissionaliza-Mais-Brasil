# Issue 020 — Prisma Setup

**Tipo:** infra
**Pagina:** global
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Configurar Prisma com PostgreSQL, criar client singleton e schema inicial com entidades principais.

## Componentes Envolvidos

- `prisma/schema.prisma`
- `prisma/seed.ts`
- `src/lib/prisma.ts`

## Comportamentos

- Client singleton (evita pool esgotado em dev)
- Migracao inicial aplicavel com `npx prisma migrate dev`
- Seed idempotente

## Criterio de Aceite

- [ ] `npx prisma generate` roda sem erro
- [ ] `npx prisma migrate dev --name init` cria tabelas
- [ ] `npx prisma db seed` popula dados de teste
- [ ] `npx prisma studio` abre e mostra dados
