# Issue 107 — Não expor senha temporária de revendedor em resposta/log

**Tipo:** sec (remediação)
**Escopo:** `src/app/api/admin/revendedores/route.ts` (~linha 378) · fluxo de criação de revendedor/usuário · e-mail de boas-vindas
**Depende de:** nenhuma
**Prioridade:** P1
**Risco:** R10 (Alto)

## Contexto / Evidência
A criação de revendedor retorna `tempPassword` em **plaintext** no corpo JSON da resposta HTTP
(intencional para exibir no admin UI). Isso vaza em log drains/observabilidade e em qualquer proxy
que registre corpo de resposta.

## O Que Fazer
1. Preferir **enviar a senha temporária por e-mail** ao revendedor + forçar `mustChangePassword` no
   1º login (já existe a flag).
2. Se a UI precisar exibir a senha uma única vez, retornar num campo claramente marcado e **garantir
   que nenhuma camada loga o corpo** dessa resposta (e nunca persistir a senha).
3. Confirmar que a senha não aparece em logs (`grep` por logging do response body).

## Decisão humana necessária
- Como o admin entrega a credencial hoje? (e-mail automático vs exibição na tela)

## Critério de Aceite
- [ ] Senha temporária não trafega em JSON logável (ou some da resposta).
- [ ] `mustChangePassword` forçado no 1º acesso do revendedor.
- [ ] Nenhum log contém a senha.
- [ ] R10 atualizado em `audit/MATRIZ_DE_RISCOS.md`.
- [ ] `npm run typecheck` + `lint` verdes.
