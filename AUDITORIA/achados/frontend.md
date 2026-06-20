# Achados — Domínio: frontend / UX
_Auditor read-only · 2026-06-20 · Nota do domínio: **8.5/10** · P0=0 · P1=0 · P2=1 · P3=3_

> Cobertura: 124/124 telas + 322/322 componentes. `tsc --noEmit` = zero erros; 124/124 `page.tsx` com
> `export default`; nenhuma rota estruturalmente quebrada. **1 único link morto em todo o `src/`.**

## Links mortos (origem → destino inexistente)
- `src/lib/mercadopago/process.ts:270` e `:312` → **`/admin/webhooks`** (rota inexistente). Renderizado clicável em `notification-bell.tsx:401` e `notifications-page.tsx:304`. → FE-001.

### [FE-001] Notificação crítica de webhook leva o SUPER_ADMIN a um 404 (`/admin/webhooks`)
- **Severidade:** P2
- **Status:** Aberto
- **Local:** `src/lib/mercadopago/process.ts:270,312` (geração) · render em `src/components/shared/notification-bell.tsx:401` e `src/components/shared/notifications-page.tsx:304`
- **Evidência:** `href:"/admin/webhooks"` nas notificações "Webhook MP sem tenant" e "MP_WEBHOOK_SECRET ausente"; `find src/app/admin/webhooks` → não existe; não está no set de 124 rotas.
- **Impacto:** quando um pagamento MP chega sem tenant resolvido ou sem `MP_WEBHOOK_SECRET`, o admin recebe alerta acionável mas o clique dá 404 — exatamente ao investigar venda sem matrícula automática.
- **Correção:** Opção A (mínima): trocar `href` p/ rota existente (`/admin/configuracoes` ou `/admin/financeiro`). Opção B (completa, recomendada): criar `src/app/admin/webhooks/page.tsx` (guard SUPER_ADMIN) listando `WebhookLog` (filtro `success=false`/`logId`) e ajustar `href` p/ `/admin/webhooks?logId={logId}`.
- **Verificação:** grep `/admin/webhooks` resolve p/ rota existente; clicar a notificação não dá 404.

### [FE-002] Componente `CheckoutButton` morto aponta p/ `/loja/confirmacao` (hardcode do prefixo `/loja`)
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `src/components/loja/checkout-button.tsx:8`
- **Evidência:** `grep CheckoutButton` → nenhuma referência fora do próprio arquivo (órfão). `href="/loja/confirmacao"` expõe prefixo interno `/loja`.
- **Impacto:** dead code; risco se reusado (em revenda mostraria `/loja/confirmacao` em vez do caminho limpo).
- **Correção:** remover o arquivo, ou parametrizar via prop `confirmacaoPath` como os forms reais.
- **Verificação:** componente removido ou sem href hardcoded de `/loja/*`.

### [FE-003] `confirmacaoPath` default `/loja/confirmacao` expõe prefixo `/loja` na URL da revenda
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `src/components/loja/asaas-checkout-form.tsx:103`, `mp-checkout-form.tsx:133` (default `/loja/confirmacao`); instanciados sem override em `src/app/loja/checkout/page.tsx:149-160,318-323`
- **Evidência:** em subdomínio de revenda o proxy reescreve só `/curso /checkout /confirmacao /contato /pagar`; `/loja/confirmacao` é servido pelo route físico (não 404) mas deixa `/loja` visível pós-compra. Inconsistente com o checkout PMB (`/checkout/confirmacao`).
- **Impacto:** cosmético/consistência de URL (não quebra).
- **Correção:** passar `confirmacaoPath="/confirmacao"` (e statusPath equivalente) no `loja/checkout/page.tsx`.
- **Verificação:** URL de confirmação em vitrine é `/confirmacao?enrollment_id=...` sem `/loja`.

### [FE-004] `<Link target="_blank">` sem `rel="noopener noreferrer"`
- **Severidade:** P3
- **Status:** Aberto
- **Local:** `src/components/painel/onboarding-wizard.tsx:189`
- **Evidência:** abre nova aba sem `rel` (destinos internos, risco baixo).
- **Correção:** adicionar `rel="noopener noreferrer"`.
- **Verificação:** atributo presente.

## Cobertura
- (main) 18/18 · (auth) 3/3 · (landing) 3/3 + livrecursos 1/1 · raiz 8/8 · admin 43/43 (96 comp) · painel 30/30 (68 comp) · aluno 9/9 (10 comp) · loja 9/9 (24 comp). Componentes shared/ui/main/vitrine/auth/pwa/placar/seo 322/322 via grep exaustivo de href/Link/router.push/redirect/createNotification.href.
- Positivos: error/not-found/global-error em todas as áreas com retry; `(auth)/(landing)/livrecursos` herdam boundary raiz; 2 `<img>` são QR data-URI legítimos; assets locais OK; zero hardcode de domínio; `(main)`/`loja`/`aluno` layouts tenant-aware (cross-tenant guard em `aluno/layout.tsx:101`); formulários com Label/required/disabled-on-submit/erro-servidor/sucesso; jsx-a11y ativo. Sem ⚠️MIGRAÇÃO no domínio frontend.
