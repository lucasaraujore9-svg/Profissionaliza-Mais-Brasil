# SPEC — Profissionaliza Mais Brasil

Plataforma SaaS multi-tenant de revenda de cursos profissionalizantes.
Admin Master cobra revendedores via Asaas. Revendedores vendem cursos via Mercado Pago.
Alunos sao auto-matriculados na Escola Avancada (plataforma white-label com API).

---

## PAGINA: Landing Page (`/`)

### Componentes
- **Navbar**: Logo PMB, links (Como Funciona, Catalogo, Planos), CTA "Seja Revendedor"
- **HeroSection**: Split screen — headline esquerda + mockup vitrine direita, 1 CTA
- **ComoFunciona**: Timeline 3 passos (Assine, Configure, Venda)
- **NumerosBento**: Bento grid com metricas reais do banco ([X] cursos, [X] revendedores, [X] alunos)
- **CatalogoPreview**: Scroll horizontal de categorias com contagem de cursos
- **PlanosSection**: Cards de planos de revenda com precos e features
- **DepoimentosSection**: 2 colunas offset com depoimentos
- **FooterMain**: 4 colunas links, social, copyright

### Comportamentos
- `view-landing`: Carregar metricas reais do banco e renderizar pagina
- `click-seja-revendedor`: Navegar para /seja-revendedor
- `click-login`: Navegar para /login

---

## PAGINA: Seja Revendedor (`/seja-revendedor`)

### Componentes
- **HeroCTA**: Headline left-aligned + value proposition
- **BeneficiosZigZag**: Blocos alternados imagem/texto (5 beneficios)
- **TimelineDetalhada**: Timeline vertical 5 passos do cadastro a primeira venda
- **PlanosComparativo**: Tabela/cards de planos com features
- **FAQAccordion**: 6-8 perguntas frequentes
- **FormularioInteresse**: Nome, Email, WhatsApp, Cidade + submit

### Comportamentos
- `submit-interesse`: Validar form com Zod → salvar lead no banco → mostrar confirmacao
- `scroll-to-planos`: Smooth scroll ao clicar CTA do hero

---

## PAGINA: Checkout Revendedor (`/seja-revendedor/checkout`)

### Componentes
- **FormCadastro**: Steps wizard (dados pessoais → empresa → plano → pagamento)
- **ResumoPlano**: Card com plano selecionado, valor, forma de pagamento
- **ProgressBar**: Indicador de step atual

### Comportamentos
- `complete-cadastro`: Validar cada step → criar User (RESELLER) no banco → criar customer Asaas → criar subscription Asaas → redirecionar para pagamento
- `select-plano`: Atualizar resumo com plano selecionado
- `select-billing-type`: Escolher PIX/Boleto/Cartao

---

## PAGINA: Login (`/login`)

### Componentes
- **LoginForm**: Email, Senha, link "Esqueci minha senha", botao "Entrar"
- **BrandPanel**: Logo + tagline + pattern decorativo (lado esquerdo)

### Comportamentos
- `do-login`: Validar credenciais via NextAuth → redirecionar conforme role (ADMIN→/admin, RESELLER→/painel)
- `click-forgot-password`: Navegar para /forgot-password
- `show-error`: Exibir mensagem de erro inline se credenciais invalidas

---

## PAGINA: Forgot Password (`/forgot-password`)

### Componentes
- **ForgotForm**: Email + botao "Enviar link de recuperacao"
- **ConfirmationState**: Mensagem de sucesso apos envio

### Comportamentos
- `request-reset`: Validar email → enviar email de reset via Resend → mostrar confirmacao
- `click-back-login`: Voltar para /login

---

## PAGINA: Homepage Vitrine (`/loja`)

### Componentes
- **NavbarLoja**: Logo do tenant, barra busca, link WhatsApp, carrinho (futuro)
- **HeroBanner**: Banner full-width customizavel (imagem do tenant) com tagline overlay
- **CategoryPills**: Filtro horizontal de categorias (pills clicaveis)
- **CourseGrid**: Grid 3col/2col/1col de cards de cursos
- **CourseCard**: Capa, titulo, categoria badge, preco (Mono), CTA "Ver Detalhes"
- **FeaturedSection**: Bento 2-col para cursos destacados
- **FooterLoja**: Nome tenant, WhatsApp, social, "Powered by PMB"

### Comportamentos
- `load-catalog`: Buscar tenant_courses do banco filtrado por tenant_id → renderizar grid
- `filter-by-category`: Filtrar cursos pela categoria selecionada (client-side)
- `search-courses`: Filtrar por texto digitado na busca
- `click-course`: Navegar para /loja/curso/[slug]

---

## PAGINA: Pagina do Curso (`/loja/curso/[slug]`)

### Componentes
- **Breadcrumb**: Home > Categoria > Nome do Curso
- **CourseHero**: Split — capa grande esquerda + info direita (titulo, descricao, preco, CTA)
- **PriceDisplay**: Preco em Mono grande + info parcelas + tipo (unico/mensal)
- **CouponField**: Input + botao "Aplicar" + feedback visual
- **CourseDescription**: Texto longo da descricao (API EA campo "obs")
- **LessonAccordion**: Lista colapsavel de aulas/modulos (API EA cursos/aulas)
- **CourseStats**: Stats inline: aulas, carga horaria, certificado
- **StickyCTA**: Barra sticky no mobile com preco + botao "Matricular"

### Comportamentos
- `load-course`: Buscar curso do banco + aulas da API EA → renderizar
- `apply-coupon`: POST /api/coupons/validate → validar codigo → atualizar preco exibido
- `remove-coupon`: Limpar cupom aplicado → restaurar preco original
- `click-matricular`: Navegar para /loja/checkout?curso=[id]&cupom=[code]

---

## PAGINA: Checkout Aluno (`/loja/checkout`)

### Componentes
- **OrderSummary**: Curso, preco original, desconto, valor final
- **StudentForm**: Nome, Email, Telefone, CPF
- **PaymentInfo**: Logo MP + metodos aceitos (Pix, Cartao, Boleto)
- **CheckoutButton**: "Finalizar Compra" (large)

### Comportamentos
- `submit-checkout`: Validar form com Zod → criar student (PENDING) no banco → criar enrollment (PENDING) → criar preferencia MP (com access_token do tenant, descriptografado) → redirecionar para init_point do MP
- `submit-checkout-monthly`: Mesmo fluxo mas cria preapproval no MP ao inves de preferencia
- `display-applied-coupon`: Ler cupom da URL → exibir desconto aplicado

---

## PAGINA: Confirmacao (`/loja/confirmacao`)

### Componentes
- **SuccessIcon**: Icone de check grande (nao emoji)
- **ConfirmationCard**: Curso, nome do aluno, info de acesso
- **NextSteps**: Lista numerada (1. Verifique email 2. Acesse plataforma 3. Comece a estudar)
- **BackToStore**: Link "Voltar para a vitrine"

### Comportamentos
- `show-confirmation`: Ler dados do enrollment via query params → exibir confirmacao
- `click-back`: Navegar para homepage da vitrine

---

## PAGINA: Dashboard Revendedor (`/painel`)

### Componentes
- **SidebarPainel**: Nav vertical (Dashboard, Cursos, Alunos, Cupons, Financeiro, Vitrine, Dominio, Config)
- **HeaderPainel**: Titulo pagina, date picker, notificacoes
- **MetricCards**: 4 cards bento — Vendas Mes (R$), Alunos Ativos, Novos Este Mes, Conversao (%)
- **RevenueChart**: Line chart receita ultimos 6 meses (Recharts)
- **RecentSalesTable**: Ultimas 10 vendas: Aluno, Curso, Valor, Status, Data
- **QuickActions**: 2 cards acao: Criar Cupom, Ver Catalogo

### Comportamentos
- `load-dashboard`: Buscar metricas do banco filtradas por tenant_id → renderizar cards e chart
- `change-date-range`: Atualizar metricas baseado no periodo selecionado
- `click-quick-action`: Navegar para pagina correspondente

---

## PAGINA: Gestao Cursos (`/painel/cursos`)

### Componentes
- **CourseListHeader**: Titulo, busca, filtro categoria
- **CourseListTable**: Tabela/card hibrido — thumbnail, nome, categoria, preco original (muted), MEU preco (editavel), tipo pagamento toggle, visibilidade toggle, botao Editar
- **CourseEditDrawer**: Drawer lateral — preco, tipo pagamento, descricao custom, destaque toggle

### Comportamentos
- `load-courses`: Buscar todos os cursos do catalogo + config do tenant_course → renderizar
- `toggle-visibility`: PATCH /api/tenants/courses — alterar is_visible
- `update-price`: PATCH /api/tenants/courses — alterar price
- `toggle-payment-type`: PATCH /api/tenants/courses — alternar ONE_TIME/MONTHLY
- `edit-course-details`: Abrir drawer → salvar alteracoes

---

## PAGINA: Gestao Alunos (`/painel/alunos`)

### Componentes
- **StudentListHeader**: Titulo, busca (nome/email/CPF), filtros (status, curso)
- **StudentStatsBar**: 4 metricas inline — Total, Ativos, Bloqueados, Inadimplentes
- **StudentTable**: Nome, Email, Curso(s), Status (badge), Progresso (%), Ultimo Acesso, Acoes
- **StudentDetailDrawer**: Drawer com dados completos, historico, acoes

### Comportamentos
- `load-students`: Buscar students do banco por tenant_id → renderizar tabela
- `search-student`: Filtrar tabela por texto
- `filter-by-status`: Filtrar por status selecionado
- `view-student-detail`: Abrir drawer com dados completos + progresso (API EA cursosvinculados)
- `block-student`: POST /api/students/[id]/block → chama EA usuarios/editar {status:"bloqueado", apostila:"bloquear"} → atualizar banco
- `unblock-student`: POST /api/students/[id]/unblock → chama EA usuarios/editar {status:"ativo", apostila:"liberar"} → atualizar banco
- `send-message`: POST /api/students/[id]/message → chama EA usuarios/enviarmensagem

---

## PAGINA: Gestao Cupons (`/painel/cupons`)

### Componentes
- **CouponHeader**: Titulo, botao "Novo Cupom"
- **CouponGrid**: Cards — codigo (Mono), desconto, usos (X/max), validade, toggle ativo
- **CreateCouponModal**: Form — codigo (auto-generate), tipo (% ou R$), valor, max usos, datas
- **UsageTable**: Tabela historico: data, aluno, curso, desconto

### Comportamentos
- `load-coupons`: Buscar coupons do banco por tenant_id
- `create-coupon`: POST /api/coupons → validar com Zod → salvar no banco
- `toggle-coupon`: PATCH /api/coupons/[id] → alterar is_active
- `auto-generate-code`: Gerar codigo aleatorio de 8 chars uppercase

---

## PAGINA: Financeiro Revendedor (`/painel/financeiro`)

### Componentes
- **FinanceHeader**: Titulo, date range picker, botao exportar
- **SummaryCards**: Receita Bruta, Liquida, Ticket Medio, Inadimplencia %
- **RevenueBarChart**: Barras mensais (Recharts)
- **PaymentTable**: Data, Aluno, Curso, Valor, Forma (badge), Status (badge), MP ID
- **FilterBar**: Status, tipo pagamento

### Comportamentos
- `load-financials`: Buscar payments do banco por tenant_id + periodo → calcular metricas
- `filter-payments`: Filtrar tabela por status e/ou forma pagamento
- `export-csv`: Gerar CSV dos pagamentos filtrados → download
- `change-period`: Atualizar metricas e tabela pelo periodo selecionado

---

## PAGINA: Config Dominio (`/painel/dominio`)

### Componentes
- **SubdomainDisplay**: Mostra subdominio atual + badge "Ativo" + link preview
- **CustomDomainForm**: Input dominio + botao "Adicionar"
- **DomainStatus**: Indicador visual: Aguardando DNS / Verificado / Erro
- **DNSInstructions**: Card com CNAME record para copiar
- **VerifyButton**: Botao "Verificar DNS"

### Comportamentos
- `load-domain-config`: Buscar tenant → exibir subdominio e dominio custom (se houver)
- `add-custom-domain`: POST /api/tenants/domain → chamar Vercel API addCustomDomain → salvar no banco → exibir instrucoes DNS
- `verify-dns`: POST /api/tenants/domain/verify → chamar Vercel API verifyDomain → atualizar status
- `remove-domain`: DELETE /api/tenants/domain → chamar Vercel API removeCustomDomain → limpar do banco

---

## PAGINA: Config Vitrine (`/painel/vitrine`)

### Componentes
- **LogoUpload**: Upload de imagem + preview
- **ColorPickers**: Primary color + Secondary color
- **BannerUpload**: Upload de banner + preview
- **TextFields**: Tagline, Descricao, WhatsApp, Instagram, Facebook
- **LivePreview**: Preview ao vivo da vitrine com as alteracoes

### Comportamentos
- `load-vitrine-config`: Buscar tenant → preencher form com dados atuais
- `upload-logo`: Upload para Supabase Storage → atualizar tenant.logo_url
- `upload-banner`: Upload para Supabase Storage → atualizar tenant.banner_url
- `update-colors`: PATCH /api/tenants/config → atualizar cores → invalidar cache Redis
- `save-texts`: PATCH /api/tenants/config → salvar tagline, descricao, social links

---

## PAGINA: Configuracoes Revendedor (`/painel/configuracoes`)

### Componentes
- **AccountForm**: Nome, Email, Telefone
- **BillingModeToggle**: AUTO / MANUAL com explicacao
- **MPConnectionCard**: Status conexao MP, botao conectar, token mascarado
- **PasswordForm**: Senha atual, Nova senha, Confirmar

### Comportamentos
- `load-settings`: Buscar tenant + user → preencher forms
- `update-account`: PATCH /api/users/me → atualizar dados pessoais
- `toggle-billing-mode`: PATCH /api/tenants/config → alterar billing_mode
- `connect-mp`: Iniciar fluxo OAuth do MP OU salvar access_token (criptografado)
- `change-password`: Validar senha atual → hash nova senha → atualizar

---

## PAGINA: Onboarding Revendedor (`/painel/onboarding`)

### Componentes
- **OnboardingWizard**: Container dos steps com progress bar
- **Step1Company**: Nome empresa, CNPJ/CPF
- **Step2Vitrine**: Upload logo, selecao cores, banner
- **Step3MercadoPago**: Conectar conta MP
- **Step4Precos**: Selecionar cursos + definir precos
- **Step5Review**: Resumo + botao "Publicar Vitrine"

### Comportamentos
- `navigate-steps`: Avancar/voltar entre steps, salvar progresso parcial
- `complete-onboarding`: Atualizar tenant com todos os dados → status=ACTIVE → redirecionar para dashboard

---

## PAGINA: Dashboard Admin (`/admin`)

### Componentes
- **SidebarAdmin**: Nav (Dashboard, Revendedores, Catalogo, Financeiro, Analytics, Config)
- **AdminMetricCards**: MRR, Revendedores Ativos, Total Alunos, Cursos Vendidos
- **DualRevenueChart**: Dual line — mensalidades + receita alunos (Recharts)
- **TopResellersTable**: Top 10 por receita: Nome, Alunos, Vendas Mes, Status
- **AlertsPanel**: Cards: pagamentos vencidos, aprovacoes pendentes, sync status

### Comportamentos
- `load-admin-dashboard`: Buscar metricas globais (sem filtro tenant) → renderizar
- `click-reseller`: Navegar para /admin/revendedores/[id]

---

## PAGINA: Gestao Revendedores (`/admin/revendedores`)

### Componentes
- **ResellerListHeader**: Titulo, busca, filtros (status, plano)
- **ResellerStatsBar**: Total, Ativos, Suspensos, Cancelados, Inadimplentes
- **ResellerTable**: Nome, Slug, Plano, Mensalidade, Status, Alunos, Ultimo Pag, Acoes

### Comportamentos
- `load-resellers`: Buscar todos os tenants → renderizar tabela
- `search-reseller`: Filtrar por nome/slug
- `filter-by-status`: Filtrar por status

---

## PAGINA: Detalhe Revendedor (`/admin/revendedores/[id]`)

### Componentes
- **ResellerProfile**: Dados completos, vitrine preview link
- **PaymentHistory**: Tabela pagamentos Asaas
- **StudentCount**: Metricas de alunos e receita
- **PolicyConfig**: Form billing_mode + cancellation_policy
- **ActionButtons**: Suspender, Ativar, Cancelar (com confirmation dialog)

### Comportamentos
- `load-reseller-detail`: Buscar tenant por ID + pagamentos + metricas
- `suspend-reseller`: PATCH /api/admin/tenants/[id] → status=SUSPENDED → invalidar cache → vitrine mostra pagina suspensa
- `activate-reseller`: PATCH /api/admin/tenants/[id] → status=ACTIVE → invalidar cache
- `cancel-reseller`: PATCH /api/admin/tenants/[id] → status=CANCELLED + confirmation dialog com opcoes (manter alunos, migrar, suspender tudo)
- `update-policy`: PATCH /api/admin/tenants/[id] → atualizar billing_mode e cancellation_policy

---

## PAGINA: Financeiro Admin (`/admin/financeiro`)

### Componentes
- **AdminFinanceSummary**: MRR, Inadimplencia %, Churn %, LTV
- **PaymentList**: Todas mensalidades: Revendedor, Valor, Vencimento, Status, Tipo, Asaas ID
- **OverdueSection**: Lista destacada de inadimplentes com dias de atraso

### Comportamentos
- `load-admin-financials`: Buscar tenant_payments → calcular MRR, churn, inadimplencia
- `filter-overdue`: Filtrar apenas vencidos

---

## PAGINA: Catalogo Master (`/admin/catalogo`)

### Componentes
- **CatalogHeader**: Titulo, botao "Sincronizar Agora", ultimo sync timestamp
- **CourseGrid**: Cards: capa, nome, categoria, aulas, carga horaria, status
- **SyncLog**: Secao colapsavel com resultado do ultimo sync

### Comportamentos
- `load-catalog`: Buscar courses do banco → renderizar grid
- `trigger-sync`: POST /api/cron/sync-cursos (com CRON_SECRET) → executar sync → atualizar grid
- `view-sync-log`: Expandir/colapsar log de sync

---

## PAGINA: Analytics Global (`/admin/analytics`)

### Componentes
- **AnalyticsFilters**: Date range, revendedor selector
- **KPICards**: Matriculas, Curso Mais Vendido, Ticket Medio, Conversao
- **SalesByCategoryChart**: Pie chart
- **StudentGrowthChart**: Line chart
- **TopResellersChart**: Horizontal bar chart
- **PaymentMethodsChart**: Donut chart
- **RankingTable**: Revendedores por vendas, alunos, ticket medio

### Comportamentos
- `load-analytics`: Queries Prisma agregadas → calcular e renderizar
- `filter-by-period`: Atualizar todos os graficos/metricas
- `filter-by-reseller`: Filtrar dados por revendedor especifico

---

## PAGINA: Config Admin (`/admin/configuracoes`)

### Componentes
- **ConfigTabs**: Geral, Planos, Integracao, Webhooks
- **GeneralTab**: Nome plataforma, logo, cores padrao
- **PlansTab**: Config planos de revenda (valor, features)
- **IntegrationTab**: Status APIs (EA, Asaas), tokens mascarados, botoes "Testar Conexao"
- **WebhooksTab**: Log de webhooks recentes, retry failed

### Comportamentos
- `load-settings`: Buscar config do sistema
- `test-ea-connection`: POST /api/admin/test-ea → chamar EA cursos/listar → exibir resultado
- `test-asaas-connection`: POST /api/admin/test-asaas → chamar Asaas → exibir resultado
- `retry-webhook`: POST /api/admin/webhooks/[id]/retry → reprocessar webhook falho

---

## WEBHOOKS (Background — sem pagina)

### Comportamentos
- `process-asaas-webhook`: Receber evento Asaas → validar token → logar → processar (PAYMENT_RECEIVED → ativar tenant, PAYMENT_OVERDUE → notificar admin)
- `process-mp-webhook`: Receber evento MP → validar HMAC → logar → GET payment → processar (approved → matricula automatica completa na EA)
- `auto-enroll-student`: Criar aluno EA → vincular curso EA → enviar email EA → atualizar banco
- `auto-block-student`: Checar billing_mode → se AUTO: bloquear na EA + banco → notificar
- `auto-unblock-student`: Pagamento atrasado agora aprovado → desbloquear na EA + banco

### Cron
- `sync-courses`: Diario 6h → EA cursos/listar → comparar → sync banco
