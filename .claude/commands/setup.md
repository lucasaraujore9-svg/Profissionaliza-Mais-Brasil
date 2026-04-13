# /setup — Inicializar Projeto do Zero

Voce esta inicializando o projeto Profissionaliza Mais Brasil do zero.

## ANTES DE COMECAR
Leia o CLAUDE.md na raiz do projeto. Ele contem toda a arquitetura.

## PASSOS (executar em ordem)

### 1. Criar projeto Next.js
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```
Se a pasta ja tem arquivos, responda "Yes" para sobrescrever (os docs estao em /docs/ e nao serao afetados).

### 2. Instalar dependencias core
```bash
npm install prisma @prisma/client @auth/prisma-adapter next-auth@beta
npm install @upstash/redis @upstash/ratelimit
npm install zod zustand
npm install resend @react-email/components
npm install mercadopago
npm install -D prisma @types/node
```

### 3. Instalar shadcn/ui
```bash
npx shadcn@latest init
```
Escolher: New York style, Zinc base color, CSS variables YES.

Depois instalar componentes base:
```bash
npx shadcn@latest add button card input label select textarea badge dialog dropdown-menu table tabs toast separator skeleton avatar sheet
```

### 4. Configurar Prisma
O schema ja existe em `prisma/schema.prisma`. Apenas inicialize:
```bash
npx prisma generate
```

### 5. Executar migrate dev
```bash
npx prisma migrate dev --name init
```

### 6. Seed dados (opcional)
```bash
npx prisma db seed
```

### 7. Criar .env.local
Criar arquivo `.env.local` na raiz com as variaveis do CLAUDE.md (valores em branco para o dev preencher).

### 8. Criar .env.example
Copiar .env.local sem os valores (apenas as chaves).

### 9. Criar arquivos base
- `src/lib/prisma.ts` — Prisma client singleton com global cache
- `src/lib/redis.ts` — Upstash Redis client
- `src/lib/utils.ts` — cn() helper do shadcn + parseBRPrice() + formatCurrency()
- `src/lib/crypto.ts` — encrypt/decrypt com AES-256-GCM
- `src/lib/auth.ts` — NextAuth.js config
- `src/middleware.ts` — Multi-tenant middleware (critico!)
- `src/types/index.ts` — tipos globais exportados

### 10. Inicializar Git
```bash
git init
git add .
git commit -m "chore: initial project setup with Next.js 15 + Prisma + shadcn"
```

### 11. Verificar
```bash
npm run dev
```
Confirmar que roda sem erros em localhost:3000.

## VERIFICACAO FINAL
Checklist antes de prosseguir:
- [ ] `npm run dev` roda sem erros
- [ ] Prisma schema foi migrado (`npx prisma generate` passou)
- [ ] `.env.local` existe com variaveis de exemplo
- [ ] `src/lib/prisma.ts` existe
- [ ] `src/lib/redis.ts` existe
- [ ] `src/lib/utils.ts` existe
- [ ] `src/lib/crypto.ts` existe
- [ ] `src/lib/auth.ts` existe
- [ ] `src/middleware.ts` existe
- [ ] `src/types/index.ts` existe
- [ ] Git inicializado

## RESULTADO ESPERADO
Projeto rodando com todas as deps, Prisma configurado e migrado, shadcn/ui funcionando, git inicializado e pronto para receber features.
