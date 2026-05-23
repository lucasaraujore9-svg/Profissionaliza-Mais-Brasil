# Plano de Ação Pré-Lançamento — Profissionaliza Mais Brasil

**Data:** 2026-05-23
**Base:** 4 relatórios em `docs/qa/lancamento/01..04-*.md` — 190 findings (41 P0, 63 P1, 64 P2, 22 P3).

## Estado atual

- Build + tsc verdes.
- 90 páginas + 140 rotas API.
- Caminho feliz funcional (login → checkout → matrícula → certificado).
- **Bloqueadores reais para lançamento:** segurança (proxy IDOR, onboarding bypass, webhooks sem HMAC, /api/cobranca sem auth, Next 16.2.3 com 13 CVEs, upload de SVG, headers HTTP), bugs de função (/contato 400, consultor não loga, PIX ausente, crons não agendados) e vergonha pública (telefone fake, planos conflitantes, depoimentos inventados, métricas fabricadas, "João Silva" hardcoded).

## Estratégia de execução

Lotes seriais (cada lote contém mudanças paralelas internas). Build + tsc após cada lote. Loop até estabilizar.

### Lote 1 — P0 Segurança (BLOQUEIA LANÇAMENTO)

1. **Proxy**: deletar `x-tenant-id` e `x-tenant-slug` da entrada antes de processar. Re-inserir só quando resolvido no tenant branch. `src/proxy.ts:1` antes de qualquer branch.
2. **Onboarding**: remover transição `PENDING→ACTIVE` em `src/app/api/painel/onboarding/route.ts`. Persistir só `onboardingStep`. Ativação fica restrita ao webhook Asaas.
3. **Webhooks**: validar HMAC/token ANTES de criar WebhookLog ou queries. Asaas e MP.
4. **/api/cobranca/[paymentId]**: exigir auth do dono (aluno/reseller/admin) e validar ownership.
5. **Tokens MP**: remover fallback plain-text em `decryptTenantMpToken`. Falhar se decrypt falhar.
6. **Security headers**: adicionar `headers()` em `next.config.ts` com HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
7. **Next upgrade**: `npm i next@latest eslint-config-next@latest` (16.2.6+).
8. **Uploads**: bloquear `image/svg+xml` nos 3 endpoints; aceitar só PNG/JPG/WEBP.

### Lote 2 — P0 Bugs funcionais

9. **/contato**: reescrever form como Client Component que mapeia para o schema atual de `/api/leads` (ou adicionar campos `nome`+`mensagem` ao Lead schema).
10. **Consultor (TenantMember)**: callback `jwt` em `src/lib/auth.ts` faz lookup de TenantMember quando role=RESELLER e tenantId nulo.
11. **PIX UI**: aba PIX em `/painel/configuracoes` + endpoint que aceita `pixKey/pixKeyType`.
12. **Crons**: adicionar 3 entradas no `vercel.json` (sweep-tenants-overdue, sweep-students-overdue, reactivate-paid).
13. **Lead schema**: adicionar `message`, `interest`, `city` opcionais.

### Lote 3 — P0 Copy/UX (vergonha pública)

14. **userName="João Silva"**: ler sessão real no `painel/layout.tsx` e passar pro shell.
15. **Telefone fake `(11) 4000-0000`**: trocar por var ambiente `NEXT_PUBLIC_SUPPORT_WHATSAPP` em 4 superfícies + `wa.me` link real ou esconder.
16. **Plano**: deletar `planos-comparativo.tsx` órfão; ajustar `checkout-resumo-plano.tsx` para usar plano único R$ 209. Atualizar PreviewProps de email para R$ 209.
17. **Números fictícios**: remover "1.500.000 alunos", "180 mil alunos", "50 mil formados", "3 MIL+ parceiros", "100/120/200/2.400 cursos" — usar copy não-numerada onde não há dado real, ou ler do banco com fallback "+" (ex: hero-cta já faz isso). Substituir números fixos por contagens dinâmicas.
18. **Depoimentos fictícios**: comentar `testimonials.tsx` e `depoimentos-section.tsx` até existirem depoimentos reais.
19. **Fallback escolaavancada.com.br**: remover — mostrar mensagem se env vazia.
20. **Estrelas 4.9**: remover bloco de rating dos cards/detalhe até ter reviews reais.
21. **Meta description global**: trocar para texto de aluno.
22. **Acesso vitalício vs 12 meses**: padronizar (assumir vitalício).
23. **Links sociais**: esconder até ter URLs reais.

### Lote 4 — Setup essencial faltando

24. **not-found.tsx** com identidade PMB.
25. **error.tsx** + **global-error.tsx** com identidade PMB.
26. **robots.ts** disallowing /admin, /painel, /aluno, /api.
27. **sitemap.ts** com rotas estáticas + cursos dinâmicos.
28. **opengraph-image.tsx** default.
29. **Cookie consent banner** (componente client com 3 botões, persistido em cookie).

### Lote 5 — P1 Segurança

30. **Rate limit** com `@upstash/ratelimit`: login, forgot, leads, loja/cupom/validar, checkout, revendedores/cadastro, webhooks.
31. **Helper `apiError`**: respostas 500 genéricas + correlationId; logar erro completo.
32. **`/painel/layout.tsx`**: chamar `requireResellerSession` server-side.
33. **Reset tokens**: zerar `resetToken` em todos os endpoints de mudança de senha. Hash do token no banco.
34. **CSV injection**: prefixar `'` em células iniciadas com `=+\-@\t`.
35. **trustHost**: substituir por allowlist + AUTH_URL em prod.
36. **CSP**: politica básica com `script-src 'self' 'unsafe-inline' https://sdk.mercadopago.com`.

### Lote 6 — Polish

37. **Acentuação**: sweep "Indicacoes", "Comissoes", "Disponivel", "Codigo", "Configuracoes", "Visao", "Nao foi possivel", "voce", "nao", "sao" em arquivos UI.
38. **Templates de email**: trocar cor azul `#3B82F6` por verde PMB `#025918` + CTA dourado nos 4 templates restantes. Acentuação em `invite.tsx`. Footer LGPD com CNPJ.
39. **Mensagens prontas**: corrigir acentuação em `painel/indicacoes/materiais/page.tsx`.
40. **Finance cards**: trocar gradientes rosa/laranja/teal por padrão PMB lime/gold/verde.
41. **Charts admin**: cores PMB em vez de azul `#3B82F6` / indigo.
42. **Skeleton**: criar `TableSkeleton`, `CardGridSkeleton`, `DashboardSkeleton` e usar nos 3-4 lugares mais visíveis.
43. **PageHeader**: aplicar em `/admin/vendas` e `/admin/equipe`.
44. **Default vitrine primaryColor**: trocar `#2563eb` por verde PMB.
45. **h-13 inválido**: trocar para h-12 nos 5 botões.
46. **Sidebar tons verde**: padronizar para `--color-pmb-green` ou `--color-pmb-green-700` (escolher um).
47. **Emojis no admin/relatorios**: substituir por lucide icons.
48. **lucide brand icons**: trocar Camera/Users/PlayCircle por Instagram/Facebook/Youtube no footer.
49. **Hero-banner antigo de loja**: deletar.

### Loop

Após Lote 6 → `npm run build` + `tsc --noEmit` + re-análise multi-agente focada → novo plano residual → aplicar → loop até `RELATORIO-FINAL.md` listar 0 P0 e ≤ 5 P1.
