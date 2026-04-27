# /setup — Inicializar projeto

Execute uma vez no comeco do projeto.

## Instrucoes

1. Confirmar stack com o usuario
2. `npm install` (ou equivalente)
3. Criar `.env.local` a partir de `.env.example` e pedir valores faltantes
4. `npx prisma migrate dev --name init` (se usa Prisma)
5. `npx prisma db seed` (se ha seed)
6. Instalar shadcn base: `npx shadcn@latest init && npx shadcn@latest add button input card dialog`
7. Rodar `npm run dev` e confirmar que sobe em localhost
8. Commitar: `chore: initial setup`

## Checklist final

- [ ] Deps instaladas
- [ ] `.env.local` preenchida
- [ ] DB migrada e seedada
- [ ] App sobe sem erro
- [ ] `CLAUDE.md` lido
