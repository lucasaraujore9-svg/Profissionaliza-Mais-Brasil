# {{NOME}}

{{DESCRICAO}}

## Setup

```bash
npm install
cp .env.example .env.local
# preencher variaveis
npx prisma migrate dev
npx prisma db seed
npm run dev
```

## Workflow

Este projeto usa o metodo SPEC -> BREAK -> PLAN -> EXECUTE. Leia `CLAUDE.md` antes de contribuir.

- Spec: `docs/SPEC.md`
- Issues: `issues/`
- Docs de referencia: `docs/references/`
