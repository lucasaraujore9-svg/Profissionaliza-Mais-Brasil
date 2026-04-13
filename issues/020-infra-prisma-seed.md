# Issue 020 — Prisma Migrate + Seed Data

**Tipo:** infra
**Página:** global
**Depende de:** nenhuma
**Prioridade:** P0

## O Que Fazer

Executar prisma migrate dev com schema.prisma fornecido, gerar Prisma Client, e criar seed script com dados teste para desenvolvimento local.

## Componentes Envolvidos
- schema.prisma — já fornecido em prisma/schema.prisma
- prisma/migrations/ — geradas automaticamente
- prisma/seed.ts — script seed com dados teste
- .env.local — variáveis DATABASE_URL, DIRECT_URL configuradas

## Comportamentos
- `prisma-migrate-dev` — executar npx prisma migrate dev
- `generate-client` — executar npx prisma generate
- `seed-database` — executar npx prisma db seed
- `verify-schema` — verificar tables criadas no banco

## Critério de Aceite
- [ ] DATABASE_URL e DIRECT_URL configurados no .env.local
- [ ] npx prisma migrate dev executa sem erros
- [ ] Tables criadas no PostgreSQL (11 models: User, Tenant, Course, etc)
- [ ] seed.ts criado em prisma/seed.ts
- [ ] Seed inclui: 1 Admin user, 3 Reseller users, 10 Test courses, 20 Test students
- [ ] npx prisma db seed executa sem erros
- [ ] npx prisma studio inicia e exibe dados seed
- [ ] Migrations em prisma/migrations/
- [ ] Prisma Client gerado em node_modules/.prisma/client
