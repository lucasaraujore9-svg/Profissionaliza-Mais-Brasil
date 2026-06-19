# ADR-001 — Arquitetura Multiproduto (Bolsa Mais Brasil)

- **Status:** Proposto (aguardando validação final)
- **Data:** 2026-06-19
- **Decisores:** Lucas Araujo (PO) + Claude
- **Substitui/relaciona:** `profissionaliza-mais-brasil-blueprint.md`, `DOMINIOS-GUIDE.md`

> Este documento é a **fonte de verdade** da expansão do sistema atual (1 produto) para
> 3 produtos sob a holding **Bolsa Mais Brasil (BMBR)**. Deve ser lido antes de qualquer
> `/plan` relacionado a multiproduto. Pontos marcados com ⚠️ ainda estão abertos.

---

## 1. Contexto

Hoje existe **um** produto em produção e faturando: **Profissionaliza Mais Brasil (PMB)** —
plataforma SaaS multi-tenant de revenda de **cursos livres**. A BMBR quer "desmembrar o
marketplace" em **3 produtos** que compartilham ~80% da infraestrutura e divergem em 3 eixos:

| Produto | Marca | Modelo de pagamento | Edição pela revenda |
|---|---|---|---|
| **Livres** (atual) | Profissionaliza | Mercado Pago por revenda | total (preços, cupons) |
| **Pós** | Profissionaliza Pós | **valor base PMB + markup da revenda + split bancário automático** | markup + equipe |
| **Técnica** | Escola Técnica do Brasil | **tudo direto no Asaas PMB**; revenda recebe comissão | **nada** (só ativa/desativa) |

Os 3 eixos de divergência são **tema/layout**, **rotas de API da plataforma parceira (LMS)**
e **modelo de pagamento**. O usuário já possui os design systems dos novos produtos.

### Restrições levantadas (decisivas para o desenho)

1. **A mesma revenda pode atuar em mais de um produto**, com **um único login** — mas cada
   produto tem **site, links e domínios diferentes**.
2. **Quem contrata só uma modalidade** precisa de um **painel auto-suficiente** daquele produto.
3. O time **BMBR** gerencia tudo (todas as revendas, todos os módulos). Um admin com mais de um
   módulo ativado gerencia todos os que tem, no mesmo lugar.
4. **Pós/Split:** subcontas Asaas ainda não existem. Fase 1 = a revenda envia documentos
   (onboarding pela revenda). Fase 2 (em breve) = gestão própria (white-label via API).

---

## 2. Decisões

### D1 — Monorepo: 1 app de gestão + 3 apps de produto + core compartilhado
Repositório único (Turborepo). Lógica de negócio crítica vive em pacotes compartilhados;
correção no core = 1 PR vale para os 3 produtos. Forks separados foram **descartados** (toda
correção teria que ser portada 3× à mão e os repos divergiriam). App único com "vertical" foi
**descartado** porque acoplaria o produto em produção ao risco de deploy dos novos.

### D2 — Banco único, discriminado por `produto`
Um Postgres/Supabase. Decorrência direta da restrição #1: a mesma revenda atravessa produtos
com login único → banco separado tornaria comissão consolidada e identidade única inviáveis.
Isolamento entre produtos por código (mesmo padrão de isolamento por `tenantId` já existente).

### D3 — Eixo `produto` + permissões por *grant* `(usuário, produto, papel, escopo)`
Não se cria RBAC novo: adiciona-se o **eixo produto** sobre a estrutura comercial já existente
(papéis + escopo por unidade). Uma permissão deixa de ser `(usuário, papel, unidade)` e passa a
`(usuário, produto, papel, escopo)`. Serve tanto para **staff BMBR** quanto para **revenda**.
"Cadastro de funcionários" e demais recursos são **módulos ligáveis por produto**
(padrão `tecnicaEnabled`/`ejaEnabled` já usado no schema).

### D4 — App de gestão único, *grant-gated* (o "geral" é o caso de quem tem todos os módulos)
`apps/gestao` é **um** aplicativo. O menu/escopo = união dos módulos do usuário logado:
- Time **BMBR** = todos os grants → vê o "geral" (ativar revenda, escolher módulos, todas as revendas).
- Admin com **PMB+POS** → gere os dois juntos.
- Admin de um produto só → vê só aquele.

Não se constroem 4 painéis de gestão; constrói-se um, diferenciado por grant.

### D5 — Painel da revenda é **por produto** (3 painéis específicos), unificado só pela identidade
Cada produto tem seu próprio painel de revenda (riquezas diferentes, ver §4), porque quem contrata
só uma modalidade precisa de painel auto-suficiente. A **mesma conta** acessa os 3 via
**SSO cross-domínio já existente** (`project_reseller_cross_domain_sso`). **Não** há um painel
de revenda unificado/condicional gigante.

### D6 — "Recebimento" e "pagamento" são *strategy* por produto
| Produto | Como a revenda recebe | O que a revenda cadastra |
|---|---|---|
| Livres | MP da própria revenda | token MP (atual) |
| Técnica | comissão paga pela PMB | **chave PIX + conta bancária** |
| Pós | **split automático** no ato da venda | **subconta Asaas (`walletId`)** |

### D7 — Asaas Split com onboarding desacoplado da execução (2 fases)
O checkout da Pós só pergunta: *"esta revenda tem `walletId` ACTIVE?"*. Se sim, divide
`base → carteira PMB` e `markup → carteira revenda`. Se não, **bloqueia a venda** (gate de KYC).
O *como* a subconta é criada (Fase 1 docs pela revenda / Fase 2 API white-label) troca por baixo
**sem tocar** no checkout/split/comissão.

```
PosResellerWallet { resellerId, walletId, status, onboardingMode }
  status:         PENDING_DOCS → UNDER_REVIEW → ACTIVE | REJECTED
  onboardingMode: RESELLER_SUBMITTED (fase 1) | PMB_MANAGED (fase 2)
```

---

## 3. Estrutura-alvo (monorepo)

```
apps/
  gestao     → app de gestão BMBR (D4): grant-gated, cross-produto,
               ativa revendas + escolhe módulos + venda direta + relatórios.   (domínio interno)
  livres     → vitrine + painel de revenda Profissionaliza (atual).            (domínios livres)
  pos        → vitrine + painel de revenda Profissionaliza Pós.                (domínios pós)
  tecnica    → vitrine + painel de revenda Escola Técnica (simplificado).      (domínios técnica)
packages/
  core       → auth, tenant, prisma, billing, comissão, asaas, mercadopago
  crm        → CRM / venda direta (lead com tag de produto; rodízio por produto)
  ui         → design tokens + componentes-base (tema por app)
  adapters/  → plataforma parceira (LMS) por produto: livres | tecnica | pos
prisma/      → schema único (banco compartilhado)
```

Roteamento por hostname permanece no `proxy.ts` (já roteia por domínio); ganha o eixo de produto.

---

## 4. Matriz de painéis por produto

| Camada | Livres (PMB) | Pós | Técnica |
|---|---|---|---|
| **Gestão BMBR** (`apps/gestao`) | ✓ (grant-gated) | ✓ | ✓ (do geral: ativa/desativa) |
| **Painel próprio do produto / ações** | completo | completo (igual PMB; cadastro de funcionários) | **simplificado**: venda direta + relatórios |
| **Painel da revenda** | completo (preços, cupons, financeiro, equipe) | rico (equipe + markup + recebimento/split + relatórios) | **mínimo** (relatórios + chave PIX + conta bancária; não edita nada) |
| **Recebimento da revenda** | MP próprio | subconta Asaas (split) | PIX/conta (comissão paga pela PMB) |

---

## 5. Identidade e permissões

```
ResellerAccount (conta-mãe)         ← login único do admin da revenda
   └── grant (produto LIVRES, papel) → Storefront/Tenant → domínios livres
   └── grant (produto POS,    papel) → Storefront/Tenant → domínios pós
   └── grant (produto TECNICA,papel) → Storefront/Tenant → domínios técnica

Staff BMBR (User)
   └── grant (produto, papel, escopo)  ← time BMBR = grants de todos os produtos
```

- Cada "vitrine de produto" continua sendo essencialmente um `Tenant` (domínio, tema, produto, preço).
- Vários `Tenant` da mesma revenda apontam para a conta-mãe (`accountId` / `ResellerAccount`).
- Login, comissão e extrato rolam pela **conta**; vitrine/domínio/preço rolam por **tenant+produto**.
- ⚠️ **Aberto:** conta-mãe "real" (`ResellerAccount` dedicado) **vs** versão leve (`ownerUserId`
  + email ligando N tenants). A versão real é mais robusta para comissão consolidada; a leve é
  mais barata para a v1.

---

## 6. Seams confirmados no código atual (auditoria 2026-06-19)

- `src/lib/plataforma-cursos/client.ts` — wrapper HTTP **100% desacoplado** de tenant/curso →
  vira 3 adapters (`adapters/{livres,tecnica,pos}`). É onde entram as "rotas de API diferentes".
- `src/lib/asaas/client.ts`, `src/lib/mercadopago/client.ts` — desacoplados; ganham split na Pós.
- **Falta discriminador**: não existe `produto`/`vertical` em `Tenant`/`Course`/`Enrollment` →
  é o campo-chave a adicionar (+ snapshot em `Enrollment` para reconciliação de comissão).
- Tema já é por-tenant (`primaryColor`/`secondaryColor`, `getCurrentTenant()`) → design systems
  novos entram como tema base de cada app.
- Comissão (`src/lib/referrals/*`) é product-agnostic hoje → precisa de `Enrollment.produto` para
  comissão por produto.

---

## 7. Consequências

**Positivas:** isola o produto em produção do risco dos novos; correção no core vale para os 3;
identidade/comissão consolidadas; adicionar um 4º produto = mais um valor no enum + 1 app fino.

**Negativas/custos:** refactor inicial de extração do core (alguns dias) antes de "andar";
schema cresce (produto, conta-mãe, wallet); 20+ queries passam a filtrar por produto.

**Riscos:** (1) **Asaas Split** é o item genuinamente novo — prototipar em **sandbox** antes de
fechar schema; split para carteira não-aprovada **falha** → gate de KYC obrigatório no checkout.
(2) Extração do core não pode alterar comportamento do `apps/livres` (regressão em produção).

---

## 8. Fases de implementação (proposta)

1. **Extrair o core** do app atual para o monorepo, sem mudar comportamento — `apps/livres`
   idêntico, consumindo `packages/core`. Passo seguro, não toca no que fatura.
2. **Schema**: `produto` (Tenant/Course/Enrollment) + conta-mãe + `PosResellerWallet`.
   Migration idempotente (deploy já aplica via `scripts/apply-pending-migrations.mjs`).
3. **`apps/gestao`**: extrair admin atual + tornar grant-gated por produto.
4. **`apps/tecnica`** (mais simples — valida o monorepo): tema + adapter LMS + pagamento direto
   Asaas PMB + painel mínimo (relatórios + PIX/conta).
5. **`apps/pos`**: tema + adapter LMS + **Asaas Split** (sandbox primeiro) + painel rico.
6. **Roteamento**: novos domínios por produto no `proxy.ts`.

---

## 9. Questões abertas (⚠️)

1. Conta-mãe **real** (`ResellerAccount`) vs **leve** (`ownerUserId`) na v1.
2. Comissão por produto: **rate diferente por produto** (ex.: 5% livres, 10% técnica, 15% pós)?
   Isso exige `Enrollment.produto` + split de linha na fatura/comissão.
3. Domínios definitivos de cada produto (apex + wildcard) para configurar no `proxy.ts` + Vercel.
4. Pós: o **markup** da revenda tem teto/mínimo definido pela PMB? Como é exibido na vitrine?
