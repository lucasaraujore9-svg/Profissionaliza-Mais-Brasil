# Profissionaliza Mais Brasil

Plataforma SaaS multi-tenant de revenda de cursos profissionalizantes.

## Stack

Next.js 15 | TypeScript | Tailwind CSS | Prisma | PostgreSQL | Vercel

## Setup

```bash
npm install
cp .env.example .env.local  # Preencher valores
npx prisma migrate dev
npx prisma db seed
npm run dev
```

## Estrutura

```
docs/SPEC.md           Spec completa (paginas, componentes, behaviors)
docs/references/       Docs de referencia (architecture, design-system, workflow)
docs/architecture/     Blueprint e guia de dominios
docs/api/              Documentacao da API Escola Avancada
issues/                53 issues individuais (proto → infra → behavior → integration)
prisma/                Schema e migrations do banco
src/app/               App Router (admin, painel, loja, api)
src/lib/               Clients de API, auth, utils
src/components/        Componentes React
```

## Workflow: SPEC → BREAK → PLAN → EXECUTE

```
/setup      Inicializar projeto (deps, prisma, seed)
/plan       Planejar uma issue antes de codificar
/execute    Executar uma issue planejada
/status     Ver progresso do projeto
/next       Sugerir proxima issue
/review     Revisar codigo de uma issue
```
