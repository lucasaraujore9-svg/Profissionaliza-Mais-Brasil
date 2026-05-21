# Plano de Design System — Google Stitch

## Projeto: Profissionaliza Mais Brasil

### Dials de Estilo

| Dial | Valor | Justificativa |
|------|-------|---------------|
| Criatividade | 6 | Profissional mas com personalidade. Nao e editorial, e SaaS educacional |
| Densidade | 5 | Balanceado — vitrine precisa de respiro, paineis precisam de info |
| Variancia | 6 | Alguma assimetria mas manter consistencia entre paginas |
| Motion Intent | 5 | Hover states e entrance animations suaves, nada cinematico |

### Paleta de Cores

| Token | Hex | Uso |
|-------|-----|-----|
| Canvas | #F9FAFB | Background principal |
| Surface | #FFFFFF | Cards, containers |
| Charcoal Ink | #18181B | Texto primario (Zinc-950) |
| Steel Secondary | #71717A | Texto secundario, descricoes |
| Whisper Border | rgba(226,232,240,0.5) | Bordas de cards |
| **Electric Blue** (acento) | #3B82F6 | CTAs, links, elementos ativos |
| Blue Hover | #2563EB | Hover states |
| Success | #10B981 | Status ativo, pagamento confirmado |
| Warning | #F59E0B | Inadimplencia, alertas |
| Danger | #E11D48 | Bloqueado, cancelado, erros |

### Tipografia

| Tipo | Fonte | Peso | Uso |
|------|-------|------|-----|
| Display | Satoshi | 700-800 | Headlines, titulos de secao |
| Body | Satoshi | 400 | Texto corrido, descricoes |
| Mono | Geist Mono | 400 | Precos, codigos, metricas |

### Componentes Chave

| Componente | Estilo |
|-----------|--------|
| Buttons | Flat, Electric Blue fill, white text, rounded-xl, scale(0.98) on active |
| Cards | rounded-2xl, white fill, whisper border, shadow-sm difusa, p-6 |
| Inputs | Label acima, rounded-lg, focus ring blue 2px offset |
| Navigation | Sticky, clean, logo a esquerda, links ao centro, CTA a direita |
| Badges | Rounded-full, cores semanticas (success/warning/danger) |
| Tables | Zebra striping sutil, header em Charcoal com border-bottom |

---

## Telas a Gerar (19 telas, 4 grupos)

### GRUPO 1: Site Principal (3 telas)

#### Tela 1.1 — Landing Page Principal
```
Pagina institucional da Profissionaliza Mais Brasil para atrair revendedores.

**DESIGN SYSTEM (REQUIRED):**
- Platform: Web, Desktop-first
- Theme: Light, clean professional education SaaS
- Background: Canvas (#F9FAFB)
- Surface: White (#FFFFFF)
- Primary Accent: Electric Blue (#3B82F6) for CTAs and highlights
- Text Primary: Charcoal Ink (#18181B)
- Text Secondary: Steel (#71717A)
- Font Display: Satoshi — headlines, section titles
- Font Body: Satoshi — body text, descriptions
- Roundness: generous (1rem cards, 0.75rem buttons)
- Shadows: soft diffused (0 4px 6px -1px rgba(0,0,0,0.05))

**PAGE STRUCTURE:**
1. **Navbar:** Logo "Profissionaliza Mais Brasil" left, links center (Como Funciona, Cursos, Planos), CTA "Seja Revendedor" button right
2. **Hero (Split Screen):** Left side: headline "Tenha sua propria escola de cursos profissionalizantes", subtext about the reseller opportunity, CTA "Comece Agora". Right side: mockup of a storefront on laptop/phone
3. **Como Funciona:** 3-step horizontal flow with numbered circles (1. Assine o plano 2. Configure sua vitrine 3. Comece a vender), NOT 3 equal cards — use a connected timeline layout
4. **Numeros:** Bento grid with key metrics: [X]+ cursos disponiveis, [X]+ revendedores ativos, [X]+ alunos matriculados, [X]+ categorias. Use placeholder brackets, do NOT invent data
5. **Catalogo Preview:** Horizontal scroll of 4-5 course cards showing real category examples (Informatica, Idiomas, Saude, Administracao, Design) with course count per category
6. **Planos:** Single plan card (or 2-3 tiers) with monthly price, features list, CTA. Asymmetric layout, not centered cards
7. **Depoimentos:** 2-column offset testimonial cards with avatar placeholders and realistic Brazilian names
8. **Footer:** 4-column grid with links, social icons (Instagram, WhatsApp), copyright

**CONSTRAINTS:**
- No emojis, no Inter font, no pure black
- No 3-equal-card feature layouts — use timeline or bento
- No centered hero — use split screen
- No overlapping elements, no filler text
- No fabricated data — use [placeholder] brackets
- Responsive: single column below 768px
- Brazilian Portuguese only
```

#### Tela 1.2 — Pagina "Seja Revendedor"
```
Pagina de conversao para novos revendedores com detalhes do plano e formulario.

[Mesmo DESIGN SYSTEM acima]

**PAGE STRUCTURE:**
1. **Hero (Left-Aligned):** Headline "Comece a vender cursos profissionalizantes hoje", subtext with value proposition, CTA scroll to pricing
2. **Beneficios:** Zig-zag 2 columns — alternating image/text blocks: Vitrine personalizada, Dominio proprio, Precos flexiveis, Painel completo, Pagamento direto na sua conta
3. **Como funciona detalhado:** Vertical timeline with 5 steps from signup to first sale
4. **Planos e Precos:** Feature comparison table (if multiple tiers) or single highlighted plan card
5. **FAQ:** Accordion style, 6-8 common questions
6. **CTA Final:** Clean section with form (Nome, Email, WhatsApp, Cidade) and "Quero ser revendedor" button

**CONSTRAINTS:**
- Same as Tela 1.1
```

#### Tela 1.3 — Login / Auth Pages
```
Clean login page with role selection (Admin or Revendedor).

[Mesmo DESIGN SYSTEM]

**PAGE STRUCTURE:**
1. **Split Layout:** Left 40%: brand panel with logo, tagline, and subtle pattern. Right 60%: login form
2. **Form:** Email, Senha, "Esqueci minha senha" link, "Entrar" button
3. **Toggle tabs:** "Sou Revendedor" / "Sou Admin" at top of form

**CONSTRAINTS:**
- Minimal, no distractions
- Same design system
```

---

### GRUPO 2: Vitrine do Revendedor (4 telas)

#### Tela 2.1 — Homepage da Vitrine (Multi-Tenant)
```
Storefront homepage for a course reseller. This is the tenant's branded store.

**DESIGN SYSTEM (REQUIRED):**
- Platform: Web, Desktop-first
- Theme: Light, the primary accent color is DYNAMIC (changes per tenant) — use Electric Blue as default
- Background: Canvas (#F9FAFB)
- Surface: White (#FFFFFF)
- Primary Accent: [tenant_color] (#3B82F6 default) for CTAs
- Text Primary: Charcoal Ink (#18181B)
- Text Secondary: Steel (#71717A)
- Font Display: Satoshi
- Font Body: Satoshi
- Roundness: generous
- Shadows: soft diffused

**PAGE STRUCTURE:**
1. **Navbar:** Tenant logo (placeholder) left, search bar center, WhatsApp contact right
2. **Hero Banner:** Full-width customizable banner image with overlay text (tenant tagline)
3. **Categorias:** Horizontal pill filter bar (Todos, Informatica, Idiomas, Saude, etc.)
4. **Grid de Cursos:** 3-column responsive grid (NOT equal cards — vary height with featured badge on some). Each card: course cover image, title, category badge, price, "Ver Detalhes" button. Monthly courses show "a partir de R$ [X]/mes"
5. **Destaques:** If tenant has featured courses, show a wider 2-column bento section above the grid
6. **Footer:** Minimal — tenant name, WhatsApp, social links, "Powered by Profissionaliza Mais Brasil" discrete

**CONSTRAINTS:**
- Must feel like the RESELLER'S brand, not PMB's
- Logo and colors are dynamic (theming system)
- Same anti-slop rules
- Responsive: 2 columns tablet, 1 column mobile
```

#### Tela 2.2 — Pagina do Curso
```
Individual course detail page in the reseller's storefront.

[Mesmo DESIGN SYSTEM da vitrine]

**PAGE STRUCTURE:**
1. **Breadcrumb:** Home > Categoria > Nome do Curso
2. **Hero do Curso (Split):** Left: course cover image (large). Right: title, category badge, description excerpt, price (large Mono font), parcelas info, CTA "Matricular Agora" button, coupon field
3. **Sobre o Curso:** Full description text (from EA API "obs" field)
4. **Ementa/Modulos:** Collapsible accordion list of lessons (from EA API "cursos/aulas")
5. **Detalhes Rapidos:** Horizontal stat bar: [X] aulas, [X]h carga horaria, Certificado incluso, Acesso imediato
6. **CTA Inferior:** Sticky bottom bar on mobile with price + "Matricular" button

**CONSTRAINTS:**
- Price must be prominent (Geist Mono, large)
- Coupon field inline near CTA
- Same anti-slop rules
```

#### Tela 2.3 — Checkout
```
Checkout page before redirecting to Mercado Pago.

[Mesmo DESIGN SYSTEM]

**PAGE STRUCTURE:**
1. **2-Column Layout:** Left 60%: order summary (course name, image, price, coupon applied, final amount). Right 40%: student form (Nome, Email, Telefone, CPF)
2. **Coupon Section:** Already applied or input field + "Aplicar" button
3. **Payment Method Info:** "Voce sera redirecionado para o Mercado Pago" with MP logo and accepted methods (Pix, Cartao, Boleto)
4. **CTA:** "Finalizar Compra" large button

**CONSTRAINTS:**
- Clean, trust-building
- Show security badges subtly
```

#### Tela 2.4 — Confirmacao de Compra
```
Success page after payment confirmation.

[Mesmo DESIGN SYSTEM]

**PAGE STRUCTURE:**
1. **Success State:** Large check icon (not emoji), "Matricula confirmada!"
2. **Details Card:** Course name, student name, access info: "Voce recebera um email com seu login e senha para acessar as aulas"
3. **Next Steps:** Numbered list: 1. Verifique seu email 2. Acesse [plataforma] 3. Comece a estudar
4. **CTA:** "Voltar para a vitrine" link

**CONSTRAINTS:**
- Celebratory but not over-the-top
- No confetti or excessive animation
```

---

### GRUPO 3: Painel do Revendedor (6 telas)

#### Tela 3.1 — Dashboard do Revendedor
```
Reseller management dashboard with key metrics and recent activity.

**DESIGN SYSTEM (REQUIRED):**
- Platform: Web, Desktop-first
- Theme: Light, professional dashboard
- Background: #F1F5F9 (Slate-100, slightly darker than Canvas for dashboard feel)
- Surface: White (#FFFFFF)
- Primary Accent: Electric Blue (#3B82F6)
- Text Primary: Charcoal Ink (#18181B)
- Text Secondary: Steel (#71717A)
- Font Display: Satoshi — page titles, metric numbers
- Font Body: Satoshi — labels, descriptions
- Font Mono: Geist Mono — amounts, counts
- Roundness: generous (1rem)
- Shadows: soft diffused

**PAGE STRUCTURE:**
1. **Sidebar:** Vertical nav with icon+label: Dashboard, Cursos, Alunos, Cupons, Financeiro, Vitrine, Dominio, Configuracoes. Tenant logo at top, collapse toggle
2. **Header:** Page title "Dashboard", date range picker, notification bell
3. **Metric Cards Row:** 4 cards in bento layout (NOT equal): Vendas do Mes (R$ [X] with trend arrow), Alunos Ativos ([X]), Novos Este Mes ([X]), Taxa de Conversao ([X]%). Use Geist Mono for numbers
4. **Chart Area:** Line chart of revenue over last 6 months (placeholder data with note)
5. **Recent Sales Table:** Last 10 sales with columns: Aluno, Curso, Valor, Status (badge), Data
6. **Quick Actions:** 2 action cards: "Criar Cupom" and "Adicionar Curso"

**CONSTRAINTS:**
- Dashboard neutral palette — no colorful backgrounds
- Metrics in Geist Mono
- Use [placeholder] for all data values
- Sidebar is permanent on desktop, drawer on mobile
- Same anti-slop rules
```

#### Tela 3.2 — Gestao de Cursos (Precificacao)
```
Course catalog management — toggle visibility, set prices, configure payment type.

[Mesmo DESIGN SYSTEM dashboard]

**PAGE STRUCTURE:**
1. **Header:** "Meus Cursos" title, search bar, filter by category dropdown
2. **Course List:** Table/card hybrid — each row: course cover thumbnail, name, category, original price (muted), YOUR price (editable), payment type toggle (Unico/Mensal), visibility toggle, "Editar" button
3. **Bulk Actions:** Top bar with "Selecionar Todos", "Ativar Selecionados", "Desativar Selecionados"
4. **Edit Drawer:** Side panel that opens when editing: price field, payment type radio, custom description textarea, featured toggle, save/cancel buttons

**CONSTRAINTS:**
- Table layout for desktop, card layout for mobile
- Inline editing where possible
```

#### Tela 3.3 — Gestao de Alunos
```
Student management list with status indicators and actions.

[Mesmo DESIGN SYSTEM dashboard]

**PAGE STRUCTURE:**
1. **Header:** "Alunos" title, search by name/email/CPF, filters (status, curso)
2. **Stats Bar:** 4 inline metrics: Total, Ativos, Bloqueados, Inadimplentes
3. **Student Table:** Columns: Nome, Email, Curso(s), Status (colored badge), Progresso (%), Ultimo Acesso, Acoes (dropdown: Ver Detalhes, Bloquear/Desbloquear, Enviar Mensagem)
4. **Student Detail Drawer:** Side panel with full student info, enrollment history, payment history, progress per course, action buttons

**CONSTRAINTS:**
- Status badges: green=Ativo, red=Bloqueado, amber=Devedor, gray=Inativo
- Progresso shown as subtle progress bar in table
```

#### Tela 3.4 — Gestao de Cupons
```
Coupon management with creation form and usage tracking.

[Mesmo DESIGN SYSTEM dashboard]

**PAGE STRUCTURE:**
1. **Header:** "Cupons" title, "Novo Cupom" button
2. **Active Coupons:** Card grid showing: code (Mono font), discount amount, uses (X/max), valid until, status toggle
3. **Create Coupon Modal:** Form with: code (auto-generate option), discount type (% or R$), value, max uses, validity dates, save button
4. **Usage History:** Table below with: date, student, course, discount applied

**CONSTRAINTS:**
- Coupon codes always in Geist Mono, uppercase
- Clear visual for expired vs active
```

#### Tela 3.5 — Financeiro do Revendedor
```
Financial reports for the reseller — sales, revenue, payment status.

[Mesmo DESIGN SYSTEM dashboard]

**PAGE STRUCTURE:**
1. **Header:** "Financeiro" title, date range picker, export button
2. **Summary Cards:** Receita Bruta, Receita Liquida, Ticket Medio, Inadimplencia (%)
3. **Revenue Chart:** Bar chart by month
4. **Payment List:** Table: Data, Aluno, Curso, Valor, Forma (Pix/Cartao/Boleto badge), Status, MP ID
5. **Filters:** Status filter (Aprovado, Pendente, Rejeitado), payment type filter

**CONSTRAINTS:**
- All amounts in Geist Mono
- Color-coded status badges
```

#### Tela 3.6 — Configuracao de Dominio
```
Domain configuration page for the reseller.

[Mesmo DESIGN SYSTEM dashboard]

**PAGE STRUCTURE:**
1. **Subdomain Section:** Shows current subdomain (slug.profissionalizamaisbrasil.com.br) with green "Ativo" badge. Link to preview
2. **Custom Domain Section:** Input field for domain, "Adicionar" button. If domain added: status indicator (Aguardando DNS / Verificado / Erro), DNS instructions card with CNAME record to configure, "Verificar DNS" button, "Remover" button
3. **DNS Instructions Card:** Visual table showing Type: CNAME, Name: @, Value: cname.vercel-dns.com. Copy button for value

**CONSTRAINTS:**
- Clear step-by-step visual for DNS config
- Status indicators with appropriate colors
```

---

### GRUPO 4: Painel Admin Master (6 telas)

#### Tela 4.1 — Dashboard Admin
```
Admin master dashboard with global metrics across all resellers.

[Mesmo DESIGN SYSTEM dashboard mas com acento diferente para distinguir: usar Deep Blue #1E40AF como acento admin]

**PAGE STRUCTURE:**
1. **Sidebar:** Dashboard, Revendedores, Catalogo, Financeiro, Analytics, Configuracoes
2. **Top Metrics Bento:** Receita Total (mensalidades), Revendedores Ativos, Total Alunos, Cursos Vendidos Hoje
3. **Revenue Chart:** Dual line chart — receita mensalidades + receita total alunos (all resellers combined)
4. **Reseller Health Table:** Top 10 revendedores by revenue: Nome, Alunos, Vendas Mes, Status, Ultima Mensalidade
5. **Alerts Panel:** Cards for overdue payments, pending reseller approvals, catalog sync status

**CONSTRAINTS:**
- Admin panels use slightly different accent to distinguish from reseller panels
- All data is [placeholder]
```

#### Tela 4.2 — Gestao de Revendedores
```
Reseller management with individual actions and policy configuration.

**PAGE STRUCTURE:**
1. **Header:** "Revendedores" title, search, filters (status, plano)
2. **Stats Bar:** Total, Ativos, Suspensos, Cancelados, Inadimplentes
3. **Reseller Table:** Nome, Slug, Plano, Mensalidade, Status (badge), Alunos, Ultimo Pagamento, Acoes
4. **Reseller Detail Page (click through):** Full profile, payment history (Asaas), student count, revenue generated, vitrine preview link, config: billing mode, cancellation policy (JSON editor or form), suspend/activate/cancel buttons

**CONSTRAINTS:**
- Individual policy configuration is KEY — show it prominently
- Cancellation needs confirmation dialog with options
```

#### Tela 4.3 — Financeiro Admin (Asaas)
```
Admin financial dashboard — reseller subscription payments.

**PAGE STRUCTURE:**
1. **Summary:** MRR (Monthly Recurring Revenue), Inadimplencia Rate, Churn Rate, LTV
2. **Payment List:** All reseller payments from Asaas: Revendedor, Valor, Vencimento, Status, Tipo (Pix/Boleto/Cartao), Asaas ID
3. **Overdue Section:** Highlighted list of overdue payments with days late and suggested actions

**CONSTRAINTS:**
- MRR and financial metrics in Geist Mono
```

#### Tela 4.4 — Catalogo Master
```
Course catalog synced from plataforma parceira.

**PAGE STRUCTURE:**
1. **Header:** "Catalogo de Cursos" title, "Sincronizar Agora" button, last sync timestamp
2. **Course Grid:** Card layout: cover image, nome, categoria, aulas, carga horaria, status (Ativo/Inativo), "Ver Detalhes" button
3. **Sync Log:** Collapsible section showing last sync results: new courses, updated, errors

**CONSTRAINTS:**
- Show sync status prominently
- Courses are read-only (managed by EA)
```

#### Tela 4.5 — Analytics Global
```
Cross-reseller analytics dashboard.

**PAGE STRUCTURE:**
1. **Filters:** Date range, reseller selector (all or specific)
2. **KPI Cards:** Alunos Matriculados, Cursos Mais Vendidos, Ticket Medio Global, Taxa Conversao Media
3. **Charts:** Vendas por categoria (pie), Crescimento de alunos (line), Top 5 revendedores (horizontal bar), Vendas por forma de pagamento (donut)
4. **Ranking Table:** Revendedores ranked by: vendas, alunos, ticket medio

**CONSTRAINTS:**
- Chart placeholders with clear labels
- No fabricated data
```

#### Tela 4.6 — Configuracoes do Sistema
```
System settings for the admin.

**PAGE STRUCTURE:**
1. **Tabs:** Geral, Planos, Integracao, Webhooks
2. **Geral:** Nome da plataforma, logo upload, cores padrao
3. **Planos:** Configurar planos de revenda (valor, features)
4. **Integracao:** Status das APIs (EA conectada? Asaas configurado?), tokens (masked), test connection buttons
5. **Webhooks:** Log de webhooks recentes, retry failed

**CONSTRAINTS:**
- Tokens always masked (show last 4 chars)
- Test connection with visual feedback
```

---

## Ordem de Execucao no Stitch

### Sprint 1: Foundation
1. Criar projeto no Stitch
2. Criar Design System
3. Gerar Tela 1.1 (Landing Page) — estabelece o visual
4. Gerar Tela 1.3 (Login)

### Sprint 2: Vitrine
5. Gerar Tela 2.1 (Homepage Vitrine)
6. Gerar Tela 2.2 (Pagina do Curso)
7. Gerar Tela 2.3 (Checkout)
8. Gerar Tela 2.4 (Confirmacao)

### Sprint 3: Painel Revendedor
9. Gerar Tela 3.1 (Dashboard)
10. Gerar Tela 3.2 (Cursos)
11. Gerar Tela 3.3 (Alunos)
12. Gerar Tela 3.4 (Cupons)
13. Gerar Tela 3.5 (Financeiro)
14. Gerar Tela 3.6 (Dominio)

### Sprint 4: Painel Admin + Extras
15. Gerar Tela 4.1 (Dashboard Admin)
16. Gerar Tela 4.2 (Revendedores)
17. Gerar Tela 4.3 (Financeiro Admin)
18. Gerar Tela 4.4 (Catalogo)
19. Gerar Tela 4.5 (Analytics)
20. Gerar Tela 4.6 (Configuracoes)
21. Gerar Tela 1.2 (Seja Revendedor)
