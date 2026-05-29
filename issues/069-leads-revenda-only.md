# Issue 069 — Caminho revenda: /api/leads vira exclusivo de revendedor

**Tipo:** behavior
**Escopo:** `src/app/api/leads/route.ts` + `src/components/main/formulario-interesse.tsx`
**Depende de:** 068
**Prioridade:** P1

## Contexto

`/api/leads` hoje atende dois usos misturados: a landing de revendedor (`companyName`) e o form de contato generico (`name`/`message`/`source`). Com o `ContactMessage` (068) cuidando do contato, `/api/leads` passa a ser **exclusivo de revenda**.

Principio: "Quero ser revendedor" e sempre uma relacao com a PMB — nunca com uma unidade. Esse caminho ignora contexto de tenant e cai sempre no funil B2B da PMB.

## O que fazer

### 1. `src/app/api/leads/route.ts`

- Remover o ramo de contato generico (`message`/`mensagem`/`source` como mensagem solta). O schema passa a focar em revenda: `email`, `companyName` (ou `nome`), `phone`/`telefone`, `plan`, `city`, `state`, `source`.
- Persistir `plan`/`city`/`state`/`source` nas colunas novas do `Lead` (em vez de serializar em `notes`). Manter `notes` so para observacao livre, se houver.
- Corrigir o `href` das notificacoes: hoje aponta para `/admin/revendedores`; passar a apontar para a tela de leads B2B (`/admin/leads` ou a tela correta de leads de revenda — confirmar no roteamento existente).
- Manter: rate limit, email de confirmacao (`lead-confirmation`), notificacao `ROLE` para `PMB_SALES` + `SUPER_ADMIN`, categoria `lead`.

### 2. `src/components/main/formulario-interesse.tsx`

- Remover o TODO da linha ~38; enviar `plan`/`city`/`state` quando os campos existirem no form.
- `source: "/seja-revendedor"`.
- (Opcional de produto) Adicionar selecao de plano (Profissionaliza / PRO) e cidade/UF — se nao adicionar UI agora, ao menos enviar `source`.

## Criterios de Aceite

- [ ] `/api/leads` cria `Lead` com `plan`/`city`/`state`/`source` estruturados
- [ ] Form de contato generico NAO usa mais este endpoint (migrado na 070)
- [ ] Notificacao linka para a tela de leads de revenda correta
- [ ] `formulario-interesse.tsx` envia `source` e campos novos
- [ ] `npx tsc --noEmit` + `npm run build` verdes
