# Issue 030 — Conectar Landing a CMS

**Tipo:** behavior
**Pagina:** /
**Depende de:** 001, 020
**Prioridade:** P1

## O Que Fazer

Substituir dados hardcoded da landing por fetch do banco (Server Component).

## Componentes Envolvidos

- `src/app/page.tsx` (converter para async)
- `src/lib/queries/landing.ts`

## Comportamentos

- Fetch no servidor (nao client)
- Fallback se nao houver dados no banco
- Revalidacao a cada 60s (ISR)

## Criterio de Aceite

- [ ] Dados vem do banco
- [ ] Sem `'use client'` desnecessario
- [ ] Loading state com `loading.tsx`
- [ ] Error boundary com `error.tsx`
