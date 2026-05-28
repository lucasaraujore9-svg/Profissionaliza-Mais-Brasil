# Issue 115 — Hardening da camada edge: IP confiável no rate-limit + matcher do proxy

**Tipo:** sec (remediação)
**Escopo:** `src/lib/ratelimit.ts` (`ipFrom`, ~128) · `src/lib/auth.ts` (~90, chave de RL de login) · `src/proxy.ts` (~189)
**Depende de:** nenhuma
**Prioridade:** P3
**Risco:** R20 (Médio) + R28 (Médio)

## Contexto / Evidência
`ipFrom` usa o **1º segmento** de `x-forwarded-for` (controlável pelo cliente) como chave de
rate-limit. Mitigado na Vercel (que normaliza o XFF), mas em outro proxy permitiria bypass do
anti-brute-force de login forjando o header.

## O Que Fazer
1. Na Vercel, preferir cabeçalho confiável (`x-real-ip`/`x-vercel-forwarded-for`) ou pegar o IP do
   **final** da cadeia XFF (o que o proxy confiável anexou), não o primeiro.
2. Documentar a suposição de proxy confiável; falhar de forma segura se o IP não for resolúvel.
3. **R28:** revisar `proxy.ts:189` — `pathname.includes(".")` faz qualquer caminho com ponto
   (`.json`, `.html`) em subdomínio de tenant pular a resolução de tenant, causando 400
   `TENANT_MISSING` nas rotas da loja. Ajustar para excluir apenas extensões de asset estático
   reais (lista explícita) em vez de qualquer ponto.

## Critério de Aceite
- [ ] Chave de rate-limit baseada em IP não-forjável atrás do proxy de produção.
- [ ] Login e demais buckets usam a mesma fonte de IP.
- [ ] Caminhos legítimos com ponto na vitrine resolvem o tenant (sem 400 espúrio).
- [ ] R20/R28 atualizados em `audit/MATRIZ_DE_RISCOS.md`.
- [ ] `npm run typecheck` + `lint` verdes.
