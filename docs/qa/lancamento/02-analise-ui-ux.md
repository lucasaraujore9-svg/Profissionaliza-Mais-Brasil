# Análise UI/UX/Layouts — Pré-Lançamento
**Data:** 2026-05-23

## Sumário

### Pontos fortes do sistema
- Identidade visual coerente nas vitrines públicas (home PMB e telas `loja/*`): paleta verde/dourado/lime aplicada de forma consistente no hero, navbar, footer e detalhe de curso. Quem entra pela primeira vez sente que é uma marca.
- Layout do painel admin e revendedor segue o mesmo esqueleto (sidebar verde + header sticky branco + main `bg-pmb-mist`), o que dá previsibilidade de navegação entre os papéis.
- Tokens de cor PMB definidos via CSS variables em `src/app/globals.css` (`--color-pmb-green`, `--color-pmb-gold`, `--color-pmb-lime`, `--color-pmb-mist`, etc.) facilitam tematização por tenant — o sistema realmente troca cor no domínio do revendedor.
- `PageHeader` (`src/components/painel/page-header.tsx`) é reutilizado em quase todas as telas internas, garantindo header padronizado.
- Componentes shadcn/ui de base (Button, Input, Label, Select, Sheet, Dialog, Card, Sonner) estão instalados e o Sonner já está plugado para toasts globais.
- Mobile menu funcional na `NavbarMain` (`src/components/shared/layouts/navbar-main.tsx`).
- Edges cases pensados: páginas `/inadimplente`, `/loja/suspended`, `/offline` existem e estão razoáveis visualmente (apesar de inconsistências pontuais).

### Principais inconsistências
1. **Design system documentado x design real são dois sistemas diferentes.** `docs/references/design-system.md` define cor primária Electric Blue (#3B82F6), fonte Satoshi e altura padrão de input/botões. O código real usa verde PMB (#025918), fonte DM_Sans e alturas próprias. O design system está completamente desatualizado e enganaria qualquer dev novo.
2. **shadcn é cosmético: muitas telas reimplementam o componente em vez de usar.** 138 `<button>` raw vs 151 `<Button>` shadcn, 15 `<select>` nativos com classes Tailwind soltas, 29 `<table>` HTML em vez do `Table` do shadcn, zero `Skeleton` (mesmo o componente existindo). Tabs custom em vários lugares (config-tabs, finance-filter-bar) em vez do shadcn `Tabs`. Resultado: cada tela tem seu próprio "padrão".
3. **Cores hardcoded fora do tema PMB.** Cards de financeiro (`admin-finance-summary.tsx`, `finance-summary-cards.tsx`) usam gradientes `from-rose-500 to-pink-600`, `from-amber-500 to-orange-600`, `from-purple-500 to-fuchsia-600` que não estão na paleta. Charts admin usam `#3B82F6` (azul) e `#6366F1` (indigo). Página inteira de vitrine antiga (`hero-banner.tsx` em `loja/`) usa quadrados purple/pink/yellow como ilustração placeholder.
4. **Estados de loading textuais (sem skeleton).** 31 ocorrências de "Carregando..." em texto plano. Componente `Skeleton` existe em `src/components/ui/skeleton.tsx` e nunca é importado.
5. **Conteúdo de marketing fabricado/inconsistente.** Depoimentos hardcoded com cidade/curso/renda inventados em duas seções diferentes. Stats fake na home ("180 mil alunos", "1.500.000 vidas", "50 mil alunos formados em 12 áreas") sem fonte ou bandeira de placeholder. Rating "4.9" estampado em todo curso. Telefone `(11) 4000-0000` em 4 lugares.
6. **Bug visível em produção: `userName="João Silva"` hardcoded** no layout shell do painel revendedor.

### Top 5 problemas de UX que mais doem antes do lançamento
1. **`userName="João Silva"` hardcoded** no header do painel do revendedor — todo revendedor logado vê "João Silva" no canto da tela. (`src/app/painel/layout-shell.tsx:15`)
2. **Avaliação "4.9" + 5 estrelas pintadas em todo curso** mesmo sem nenhuma review real no banco — usuário desconfia.
3. **Depoimentos e métricas fabricadas** ("180 mil alunos", "Patrícia Mendes faturando R$ X") em telas públicas sem aviso de placeholder.
4. **Inconsistência grosseira de paleta dentro do admin**: dashboards verdes coabitam com cards finance em gradiente rosa/laranja/teal/roxo. O usuário pensa que entrou em outra ferramenta.
5. **Telefone `(11) 4000-0000` fake exposto** em Footer + Ajuda + Contato + Reembolso e link `wa.me/551140000000` que não existe.

---

## Mapa de telas vistas (design / usabilidade / consistência)

| Área | Tela | Design | Usabilidade | Consistência |
|------|------|--------|-------------|--------------|
| Auth | `/login` | 4 | 4 | 3 |
| Main | `/` (home institucional) | 4 | 4 | 3 |
| Main | `/cursos` | 4 | 4 | 4 |
| Main | `/sobre`, `/ajuda`, `/contato` | 3 | 3 | 3 |
| Main | `/seja-revendedor` | 4 | 4 | 3 |
| Main | `/checkout` (PMB direto) | 3 | 3 | 3 |
| Livrecursos | `/livrecursos` | 4 | 4 | 2 (separado do PMB) |
| Loja | `/loja` (vitrine tenant) | 4 | 4 | 4 |
| Loja | `/loja/curso/[slug]` | 4 | 4 | 4 |
| Loja | `/loja/checkout` | 3 | 4 | 3 |
| Admin | `/admin` (dashboard) | 3 | 3 | 2 (cards diferentes do resto) |
| Admin | `/admin/revendedores` | 3 | 4 | 3 |
| Admin | `/admin/equipe` | 2 | 3 | 2 |
| Admin | `/admin/vendas` | 2 | 3 | 2 |
| Admin | `/admin/alunos` | 3 | 3 | 2 |
| Admin | `/admin/financeiro` | 2 | 3 | 1 (gradientes pop) |
| Admin | `/admin/indicacoes` | 3 | 4 | 4 (única usando shadcn Table) |
| Admin | `/admin/analytics` | 2 | 3 | 1 (cores azul/indigo) |
| Admin | `/admin/relatorios` | 3 | 3 | 2 (emojis) |
| Admin | `/admin/catalogo` | 3 | 3 | 3 |
| Admin | `/admin/configuracoes` | 3 | 3 | 3 |
| Admin | `/admin/certificados` | 4 | 4 | 4 |
| Painel | `/painel` (dashboard) | 3 | 3 | 3 |
| Painel | `/painel/cursos` | 4 | 4 | 4 |
| Painel | `/painel/financeiro` | 3 | 3 | 2 (gradientes pop) |
| Painel | `/painel/configuracoes` | 3 | 3 | 2 (tabs custom) |
| Painel | `/painel/vitrine` | 4 | 4 | 3 |
| Painel | `/painel/dominio` | 3 | 4 | 3 |
| Painel | `/painel/onboarding` | 4 | 4 | 3 |
| Painel | `/painel/certificados` | 4 | 4 | 4 |
| Aluno | `/aluno` | 3 | 3 | 3 |
| Aluno | `/aluno/cursos` | 3 | 4 | 3 |
| Aluno | `/aluno/perfil` | 2 | 3 | 2 |
| Outros | `/validar` | 4 | 4 | 3 |
| Outros | `/inadimplente` | 4 | 4 | 4 |
| Outros | `/loja/suspended` | 3 | 4 | 3 |
| Outros | `/offline` | 4 | 4 | 4 |
| Outros | `/cobranca/[id]` | 3 | 4 | 3 |

---

## Findings detalhados

### [UX-P0-001] `userName="João Silva"` hardcoded no painel do revendedor
**Onde:** `src/app/painel/layout-shell.tsx` (linha 15)
**Severidade:** P0
**Categoria:** Mock vs prod
**Descrição:** O header do painel do revendedor mostra literalmente "João Silva" como nome do usuário logado, qualquer que seja o revendedor que acessar. Bug grave de produção — esse texto vai para todos os usuários reais.
**Correção sugerida:** Buscar `session.user.name` (`auth()` no layout server e propagar para o shell client, idem ao padrão admin) e passar via prop. Já existe a infra: o sidebar do painel aceita `tenantName` e `userEmail`.
**Esforço:** S

### [UX-P0-002] Avaliação "4.9" fake em todos os cursos
**Onde:** `src/components/shared/course-detail-view.tsx` (linhas 172-178), `src/components/main/home/course-card.tsx` (linhas 81-94)
**Severidade:** P0
**Categoria:** Mock vs prod
**Descrição:** Detalhe de curso mostra `<strong>4.9</strong>` + 5 estrelas preenchidas, sempre, mesmo sem nenhum review. Card de curso na home mostra rating string + 5 estrelas todas preenchidas (`{[0,1,2,3,4].map((i) => <Star className="fill-..." />)}`). Comprador percebe imediatamente que é placeholder e perde confiança.
**Correção sugerida:** Ou (a) buscar rating real do banco e esconder o bloco quando não houver, ou (b) substituir por outro selo de credibilidade (selo "Curso oficial", "Certificado MEC", etc).
**Esforço:** S

### [UX-P0-003] Depoimentos fictícios em duas seções da home
**Onde:** `src/components/main/home/testimonials.tsx` (linhas 13-44), `src/components/main/depoimentos-section.tsx` (linhas 4-29)
**Severidade:** P0
**Categoria:** Mock vs prod / Copy
**Descrição:** Três depoimentos hardcoded ("Josilene Barbosa - Confeitaria do Zero - Faturando R$ 2.400/mês") com cidades, valores monetários, profissões e iniciais coloridas. Outra seção tem "Patrícia Mendes - Parceira desde 2024" + dois secundários inventados. Sem qualquer indicação de placeholder. É um problema regulatório (depoimento falso) e de UX (usuário ataca isso primeiro).
**Correção sugerida:** Ou remover a seção até existirem depoimentos reais, ou substituir por estudo de caso/uma proof point genuína ("mais de X parceiros ativos", "presente em Y cidades") sem nominar pessoas.
**Esforço:** M

### [UX-P0-004] Telefone WhatsApp fake `(11) 4000-0000` em produção
**Onde:** `src/components/shared/layouts/footer-main.tsx:67`, `src/app/(main)/ajuda/page.tsx:75`, `src/app/(main)/reembolso/page.tsx:30`, `src/app/(main)/contato/page.tsx:23` + link `wa.me/551140000000`
**Severidade:** P0
**Categoria:** Mock vs prod
**Descrição:** Quatro páginas públicas exibem `(11) 4000-0000` como WhatsApp do atendimento e o link aponta para `wa.me/551140000000` (número inexistente). Usuário clica e cai num chat morto.
**Correção sugerida:** Centralizar contato em uma única env var (`NEXT_PUBLIC_SUPPORT_WHATSAPP` + `NEXT_PUBLIC_SUPPORT_EMAIL`) usada em todas as telas. Tirar o número antes do go-live.
**Esforço:** S

### [UX-P0-005] Cards de financeiro em paleta totalmente fora do tema
**Onde:** `src/components/admin/admin-finance-summary.tsx` (linhas 35-57), `src/components/painel/finance-summary-cards.tsx` (linhas 23-48)
**Severidade:** P0
**Categoria:** Consistência visual
**Descrição:** Em `admin/financeiro` e `painel/financeiro` os cards de KPI usam gradientes `from-emerald-500 to-teal-600`, `from-rose-500 to-pink-600`, `from-amber-500 to-orange-600`, `from-purple-500 to-fuchsia-600`. Todo o resto do produto é verde/dourado/lime. O dashboard parece de outro produto. É um dos primeiros lugares que o admin/revendedor abre.
**Correção sugerida:** Trocar para cards brancos com ícone colorido (mesmo padrão do `admin-metric-cards.tsx`, que usa `bg-[var(--color-pmb-lime-50)]`). Reservar gradiente verde só para um card "destaque" (ex: MRR).
**Esforço:** S

### [UX-P0-006] Charts admin com cores fora da paleta (azul/indigo)
**Onde:** `src/components/admin/analytics-charts.tsx` (linha 13: `DONUT_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#6366F1", ...]`, linha 161-169)
**Severidade:** P0
**Categoria:** Consistência visual
**Descrição:** O analytics global do admin usa azul `#3B82F6` para receita, gradient `#6366F1→#3B82F6` para conversão. Nenhuma dessas cores existe no design PMB — o resto do admin é verde escuro. Olha como se fosse um Chart.js demo.
**Correção sugerida:** Usar `var(--color-pmb-green)`, `var(--color-pmb-gold)`, `var(--color-pmb-cyan)`, `var(--color-pmb-lime)` (já estão definidas e usadas como chart-1..chart-5 no globals.css). Ou trocar para Recharts (mencionado no design-system) com paleta tematizada.
**Esforço:** M

### [UX-P0-007] Stats fabricadas na home institucional
**Onde:** `src/app/(main)/sobre/page.tsx` (linhas 33-35, 56-60), `src/components/main/manifesto-fundador.tsx` (linhas 12-29), `src/components/main/home/testimonials.tsx` (linhas 56-60)
**Severidade:** P0
**Categoria:** Copy de microUX / Mock vs prod
**Descrição:** "Mais de 50 mil alunos formados em 12 áreas profissionais" (sobre), "2.400 cursos" (sobre), "1.500.000 vidas transformadas" + "3 MIL+ parceiros" (manifesto), "180 mil alunos" (testimonials). Números não vêm do banco, são literais. Se for desafiado em um anúncio Meta ou processo Procon, é problema.
**Correção sugerida:** Substituir por números reais (mesmo que pequenos) puxados do Prisma. Ou usar copy não-numerada ("centenas de parceiros", "milhares de cursos vendidos"). HeroCTA já faz isso certo (`loadCursoCount` + `Math.max(real, fallback)`); replicar o padrão.
**Esforço:** M

### [UX-P0-008] Design system documentado conflita com o código real
**Onde:** `docs/references/design-system.md` (todas as seções), `docs/design/STITCH-DESIGN-PLAN.md`
**Severidade:** P0
**Categoria:** Documentação / Consistência
**Descrição:** Doc oficial define: primária Electric Blue `#3B82F6`, fonte Satoshi (heading + body), Inter fallback, input default e exemplos com classes `bg-blue-600`. Código real usa: verde PMB `#025918`, fonte DM_Sans (no `src/app/layout.tsx`), variações de input próprio. Dev novo lendo o doc vai produzir telas erradas (e telas como o hero-banner antigo de loja realmente foram feitas seguindo o doc errado — quadradinhos coloridos misturados).
**Correção sugerida:** Reescrever `design-system.md` para refletir o tema PMB verde/dourado/DM_Sans. Eliminar `STITCH-DESIGN-PLAN.md` ou marcá-lo como histórico. Acrescentar lista de "componentes obrigatórios" (Button do shadcn, Table do shadcn, etc.).
**Esforço:** M

### [UX-P0-009] Skeleton existe mas nunca é usado — 31x "Carregando..." textual
**Onde:** `src/components/admin/admin-dashboard-client.tsx:62`, `src/components/admin/reseller-list-client.tsx:142`, `src/components/painel/finance-payment-table.tsx:60-67`, `src/components/admin/reports-client.tsx:68`, `src/components/painel/student-table.tsx:74`, `src/components/painel/certificates-list.tsx`, `src/components/painel/config-tabs.tsx:74`, e dezenas mais
**Severidade:** P0
**Categoria:** Loading / Consistência
**Descrição:** `src/components/ui/skeleton.tsx` existe. Nenhum lugar no app o importa. Em vez disso, tela após tela mostra "Carregando revendedores...", "Carregando dashboard...", "Carregando notificações..." em cinza num card vazio. Layout salta quando dados chegam, parece amador.
**Correção sugerida:** Criar 3-4 skeletons reutilizáveis (`TableSkeleton`, `CardGridSkeleton`, `DashboardSkeleton`) e substituir os strings. Pelo menos no dashboard admin, lista de revendedores e tabela de financeiro.
**Esforço:** M

### [UX-P1-001] Tab interno reimplementado em 4 locais em vez do shadcn `Tabs`
**Onde:** `src/components/painel/config-tabs.tsx` (linhas 84-100), `src/components/admin/admin-config-tabs.tsx`, `src/components/painel/finance-filter-bar.tsx` (linhas 62-77), `src/components/painel/course-list-wrapper.tsx` (linhas 110-126)
**Severidade:** P1
**Categoria:** Consistência visual
**Descrição:** Cada tela tem sua própria implementação de "tabs" usando `<button>` com classes condicionais. Visual fica diferente em cada lugar (cores, padding, sombras). shadcn `Tabs` está disponível em `src/components/ui/tabs.tsx`.
**Correção sugerida:** Padronizar usando o componente shadcn. Pelo menos para tabs principais de configuração.
**Esforço:** M

### [UX-P1-002] Tabelas custom em 29 lugares, shadcn `Table` em apenas 1
**Onde:** uso correto em `src/app/admin/indicacoes/page.tsx:117`; uso custom em `src/components/admin/equipe-client.tsx:125`, `src/app/admin/vendas/page.tsx:107`, `src/components/painel/finance-payment-table.tsx:76`, `src/components/painel/student-table.tsx:92`, `src/app/painel/vendas/page.tsx:82`, e ~25 outros
**Severidade:** P1
**Categoria:** Consistência visual
**Descrição:** Cada tabela define seu próprio `bg-gray-50`, `text-xs uppercase`, padding, divisores. Variam: algumas têm `border-b border-gray-100`, outras `divide-y divide-gray-200`, alguns headers em `bg-[var(--color-pmb-mist)]`, outros em `bg-gray-50`. Sem sortable, sem paginação consistente.
**Correção sugerida:** Padronizar via `Table` shadcn. Considerar criar `DataTable` wrapper com paginação/sort. No mínimo unificar a estética entre admin equipe / admin vendas / painel vendas / painel financeiro.
**Esforço:** L

### [UX-P1-003] `<button>` raw 47% das vezes em vez de `<Button>` shadcn
**Onde:** 138 ocorrências espalhadas; exemplos `src/components/admin/reports-client.tsx:111-120`, `src/components/painel/finance-bar-chart.tsx:34-46`, `src/components/painel/student-table.tsx:135-153`, `src/components/shared/notifications-page.tsx:152-180`
**Severidade:** P1
**Categoria:** Consistência visual
**Descrição:** Botões avulsos têm cor de fundo, hover, padding, font-weight e radius próprios. Resultado: hover/focus/disabled não são padronizados. Ex: alguns botões cancelar têm `bg-white border-gray-300`, outros `bg-gray-50`.
**Correção sugerida:** Sweep dos arquivos mais visíveis para trocar por `<Button variant="...">`. Priorizar páginas que o cliente vê: dashboard, financeiro, notificações.
**Esforço:** L

### [UX-P1-004] Native `<select>` em 15 lugares com estilo diferente
**Onde:** `src/components/admin/global-students-client.tsx:111-126`, `src/components/painel/finance-filter-bar.tsx:79`, `src/components/admin/reports-client.tsx:96-110`, `src/components/painel/certificates-list.tsx`, e outros
**Severidade:** P1
**Categoria:** Consistência visual
**Descrição:** Selects nativos com classes Tailwind avulsas. Visual quebra em Safari/Chrome diferentes (style nativo do browser). shadcn `Select` está em uso em 48 lugares — não tem desculpa.
**Correção sugerida:** Substituir pelo `Select` shadcn. Especialmente em filtros de tabela.
**Esforço:** M

### [UX-P1-005] Página /admin/financeiro mistura padrão de header com `p-8` extra
**Onde:** `src/app/admin/vendas/page.tsx:62` (`<div className="space-y-6 p-8">`)
**Severidade:** P1
**Categoria:** Consistência visual
**Descrição:** A maioria das páginas do admin usa `<div className="space-y-6">` no topo confiando no `p-4 lg:p-6` do main. Esta página acrescenta `p-8` extra, então o conteúdo fica mais para dentro do que as irmãs. Também não usa `<PageHeader>` reutilizado.
**Correção sugerida:** Remover `p-8`, usar `<PageHeader>` para o título "Vendas Diretas PMB".
**Esforço:** S

### [UX-P1-006] Acentuação faltante em strings da UI ("Indicacoes", "Comissoes", "Disponivel")
**Onde:** `src/app/admin/indicacoes/page.tsx:89` ("Indicacoes"), `:98` ("Comissoes"), `:111-124` ("Disponivel"); `src/app/painel/certificados/page.tsx:73` ("e puxada"), `:73` ("Classico"); `src/app/admin/equipe/page.tsx` ("ultima atividade" em comentários)
**Severidade:** P1
**Categoria:** Copy / Polimento
**Descrição:** Vários títulos e labels sem cedilha/acento. "Indicacoes" no h1 em vez de "Indicações". "Disponivel" 4x repetido. "Classico" no card de layout. Olho do usuário sente.
**Correção sugerida:** Sweep grep nos arquivos mais visíveis e corrigir.
**Esforço:** S

### [UX-P1-007] Hero da vitrine /loja antigo com placeholder colorido
**Onde:** `src/components/loja/hero-banner.tsx` (linhas 47-57)
**Severidade:** P1
**Categoria:** Mock vs prod
**Descrição:** Hero da vitrine que existe ainda no código mostra 4 quadradinhos `from-yellow-300 to-orange-400 / from-pink-400 to-red-500 / from-green-400 to-emerald-600 / from-purple-400 to-violet-600` como "ilustração". Banner "Até 40% OFF em todo catálogo" hardcoded. Botões "Ver cursos" e "Fale conosco" sem `href`.
**Correção sugerida:** Esse componente parece morto (a vitrine real usa `HeroBanner` do `components/main/home/`). Apagar `src/components/loja/hero-banner.tsx` se não for usado, ou consolidar.
**Esforço:** S

### [UX-P1-008] Default `primaryColor: #2563eb` no editor de vitrine não bate com tema PMB
**Onde:** `src/components/painel/vitrine-editor.tsx` (linhas 13-24)
**Severidade:** P1
**Categoria:** Consistência visual
**Descrição:** Quando o revendedor abre o editor da vitrine pela primeira vez (antes de salvar), o `defaultConfig` mostra primary `#2563eb` (azul) e secondary `#1e40af`. Não bate com o tema PMB nem com o que ele realmente verá depois (verde/gold). Causa confusão.
**Correção sugerida:** Trocar default para `#025918` / `#F2B705` (cores PMB) — assim o preview já reflete o estado real até o tenant customizar.
**Esforço:** S

### [UX-P1-009] Emojis decorativos em headers do admin/relatórios
**Onde:** `src/components/admin/reports-client.tsx` (linhas 14-20: `GROUP_ICONS = { Vendas: "💼", Alunos: "🎓", Revendedores: "🏪", Financeiro: "💰", Catálogo: "📚" }`), `src/components/main/home/testimonials.tsx:103` (`💰`)
**Severidade:** P1
**Categoria:** Consistência visual / Design system
**Descrição:** O design system explícito diz "no emojis". Ícones lucide-react estão disponíveis e são usados na maioria do app. Esses 5+1 emojis quebram o tom profissional (depoimentos com 💰 em selo verde fica especialmente brega).
**Correção sugerida:** Substituir por `<DollarSign />`, `<GraduationCap />`, `<Store />`, `<Wallet />`, `<BookOpen />`, etc. de lucide-react.
**Esforço:** S

### [UX-P1-010] Empty states inconsistentes (alguns bonitos, outros texto cru)
**Onde:** bom: `src/app/painel/vendas/page.tsx:69-79` (icon + cta), `src/components/painel/course-list-wrapper.tsx:151` (border-dashed). Ruim: `src/components/painel/finance-payment-table.tsx:70-74` ("Nenhuma transação encontrada no período."), `src/components/painel/student-table.tsx:81-87`, `src/app/admin/indicacoes/page.tsx:130-134`
**Severidade:** P1
**Categoria:** Empty state
**Descrição:** Algumas listas têm empty state caprichado com ícone + CTA, outras só texto cinza centralizado. Não tem componente reutilizável `EmptyState`.
**Correção sugerida:** Criar `src/components/shared/empty-state.tsx` com `<EmptyState icon={Icon} title="..." description="..." action={<Button>...</Button>} />`. Substituir nas tabelas principais.
**Esforço:** M

### [UX-P1-011] Hardcoded `bg-[#FAFAFA]` em vez do token
**Onde:** `src/app/(main)/seja-revendedor/checkout/page.tsx:8`, `src/app/loja/checkout/page.tsx:124`
**Severidade:** P1
**Categoria:** Consistência visual
**Descrição:** Dois checkouts importantes usam cor inline `#FAFAFA` em vez de `var(--color-pmb-mist)` ou `var(--background)`. Quando o tema for ajustado o checkout fica fora.
**Correção sugerida:** Trocar por `bg-[var(--color-pmb-mist)]` ou `bg-muted/40`.
**Esforço:** S

### [UX-P1-012] SVGs custom inline em vez de lucide-react
**Onde:** `src/app/cobranca/[paymentId]/page.tsx:97-110` (calendário inline), `src/app/cobranca/[paymentId]/page.tsx:118-133` (check inline), `src/app/validar/page.tsx:24-46` (ShieldIcon custom)
**Severidade:** P1
**Categoria:** Consistência / Iconografia
**Descrição:** Página de cobrança e validar definem SVGs próprios. lucide-react já tem `Calendar`, `Check`, `Shield`, `ShieldCheck`. Manter uma só fonte de ícones.
**Correção sugerida:** Trocar pelos componentes lucide. Reduz bundle e mantém visual coeso.
**Esforço:** S

### [UX-P1-013] Layout shell do aluno usa cor da sidebar diferente do painel revendedor
**Onde:** `src/components/aluno/student-shell.tsx:54` (`bg-[var(--color-pmb-green)]`), `src/components/shared/layouts/sidebar-painel.tsx:55` (`bg-[var(--color-pmb-green-700)]`), `src/components/shared/layouts/sidebar-admin.tsx:73` (`bg-[var(--color-pmb-green)]`)
**Severidade:** P1
**Categoria:** Consistência visual
**Descrição:** Três sidebars do produto, três tons de verde levemente diferentes. Aluno usa green normal, revendedor green-700 (mais escuro), admin green normal. Não há padrão escrito, parece descuido.
**Correção sugerida:** Padronizar todas para `--color-pmb-green` (ou todas em -700) e documentar. Se a diferença for proposital (aluno ≠ revendedor), reforçar com diferença maior (ex: gold-tinted no aluno).
**Esforço:** S

### [UX-P1-014] Login form: checkbox "Lembrar-me" sem `id`/`htmlFor`
**Onde:** `src/components/auth/login-form.tsx` (linhas 141-147)
**Severidade:** P1
**Categoria:** Acessibilidade
**Descrição:** `<label className="..."><input type="checkbox" />Lembrar-me...</label>` está OK (input dentro do label), mas o checkbox não tem `name`, `id` ou `value`. Form não passa estado de "remember me" para backend — ou o feature é fake, ou está quebrada. UX percebe se for fake.
**Correção sugerida:** Ou conectar de verdade (id + name + estado controlado + cookie longa-vida) ou remover o checkbox.
**Esforço:** S

### [UX-P1-015] PainelLayoutShell ignora session real do tenant
**Onde:** `src/app/painel/layout-shell.tsx` (linhas 8-12)
**Severidade:** P1
**Categoria:** Personalização / Mock vs prod
**Descrição:** Layout shell do painel não recebe `tenantName`/`userEmail` reais, só hardcoded. SidebarPainel aceita esses props mas o shell não passa. Resultado: sidebar mostra "Meu Painel" / "Revendedor" genérico, não o nome da escola do revendedor.
**Correção sugerida:** No layout server (`src/app/painel/layout.tsx`), buscar `auth() + prisma.tenant.findUnique` e passar para o shell client. Já tem `requireSession` semelhante usado pelo admin.
**Esforço:** M

### [UX-P1-016] Header dashboard mostra `userName` mas só em `sm:` (perdendo em mobile)
**Onde:** `src/components/shared/layouts/header-dashboard.tsx:45-49`
**Severidade:** P1
**Categoria:** Responsividade
**Descrição:** Nome do usuário esconde em mobile (`hidden sm:inline`). Em telas pequenas o usuário não sabe quem está logado — ícone de "Sair" fica isolado sem contexto.
**Correção sugerida:** Mostrar avatar/inicial em mobile pelo menos. Ou um dropdown que abre menu com nome+email+sair.
**Esforço:** S

### [UX-P1-017] Botões inline com `h-13` (classe Tailwind inexistente)
**Onde:** `src/components/main/manifesto-fundador.tsx:133`, `src/components/main/plano-unico.tsx:69`, `src/components/main/solucao-section.tsx:45`, `src/components/main/formulario-interesse.tsx:228`, `src/components/main/hero-cta.tsx:85`
**Severidade:** P1
**Categoria:** Implementação
**Descrição:** `h-13` não é classe default do Tailwind (`h-12` = 48px, `h-14` = 56px). A altura é ignorada e o botão fica menor que o pretendido. Visual fica inconsistente em landing.
**Correção sugerida:** Trocar para `h-12` ou `h-14`. Ou adicionar `13: '3.25rem'` no tailwind.config.
**Esforço:** S

### [UX-P1-018] Sidebar do admin/painel sem responsivo de tablet (768-1024px)
**Onde:** `src/app/admin/layout-shell.tsx:21` (`hidden h-full lg:block`), `src/app/painel/layout-shell.tsx:9-10`
**Severidade:** P1
**Categoria:** Responsividade
**Descrição:** Em telas tablet (768-1024px) a sidebar some completamente (volta ao Sheet/Sheet do mobile). O design system fala em "Tablet: Collapsed (icons) Drawer menu". Implementação atual é "tablet = mobile".
**Correção sugerida:** Acrescentar variante `md:` exibindo sidebar colapsada com só ícones (sem labels). Tablet em pé é caso real de uso de admin.
**Esforço:** M

### [UX-P1-019] Aluno: pagamentos pendentes têm botão "Pagar agora" mas a URL Asaas pode estar expirada
**Onde:** `src/app/aluno/page.tsx:97-122`
**Severidade:** P1
**Categoria:** Usabilidade
**Descrição:** "Pagar agora" usa `e.asaasInvoiceUrl` direto. Não há fallback para gerar nova URL nem aviso se a cobrança venceu. Aluno clica, cai numa página vazia ou 404.
**Correção sugerida:** Acrescentar rota intermediária que verifica se a invoice está ativa; se não, redireciona para gerar uma nova. Ou pelo menos mostrar tooltip "Link válido até DD/MM".
**Esforço:** M

### [UX-P1-020] Dashboard admin sem skeleton de chart, layout salta brutalmente
**Onde:** `src/components/admin/admin-dashboard-client.tsx:60-66`
**Severidade:** P1
**Categoria:** Loading state
**Descrição:** Enquanto carrega: bloco "Carregando métricas..." 64px de altura. Quando chega: KPIs (140px) + chart (400px) + tabela (300px). O conteúdo aparece com offset de ~800px de uma vez. Visualmente desconfortável.
**Correção sugerida:** Skeleton com mesma altura aproximada dos blocos finais. Especialmente o chart de receita.
**Esforço:** M

### [UX-P2-001] Configurações tem item ainda só com "Indicações" — parece vazia
**Onde:** `src/app/admin/configuracoes/page.tsx:8-15` (só 1 SUB_SETTINGS), `src/components/admin/admin-config-client.tsx`
**Severidade:** P2
**Categoria:** Empty state / Information architecture
**Descrição:** Card "Módulos" só tem um item ("Indicações"). Embaixo vem o componente principal com 4 tabs. Hierarquia confusa — por que indicações é um módulo separado e gateway é tab interna?
**Correção sugerida:** Ou agrupar tudo nos cards Módulos (Indicações, Certificados, Gateway, Webhooks como cards de entrada) ou só usar as tabs. Não misturar.
**Esforço:** M

### [UX-P2-002] StudentProfileForm: campos editáveis (cep, cidade, etc.) sem máscara nem validação
**Onde:** `src/components/aluno/student-profile-form.tsx:61-73`
**Severidade:** P2
**Categoria:** Formulários
**Descrição:** CEP/telefone livres, sem máscara. CPF e Email read-only sem indicação visual (só `readOnly` no input). Usuário fica perdido se tentar editar.
**Correção sugerida:** Aplicar máscaras (CEP, telefone). Mostrar lock icon nos read-only com tooltip "Para alterar entre em contato".
**Esforço:** M

### [UX-P2-003] Drawer/Sheet usado para edição em alguns lugares, modal em outros — sem regra
**Onde:** Sheet em `src/components/admin/equipe-client.tsx:179-242`, `src/components/painel/course-edit-drawer.tsx`. Dialog em `src/components/admin/reseller-list-client.tsx:194-230`, `src/components/admin/new-reseller-dialog.tsx`
**Severidade:** P2
**Categoria:** Consistência
**Descrição:** Edição de curso usa Drawer (right slide-in), edição de revendedor usa Dialog modal centralizado. Mesmo tipo de ação, padrão diferente. Cria atrito cognitivo.
**Correção sugerida:** Convenção: edição grande (5+ campos) = Sheet; ação rápida/confirm = Dialog. Documentar.
**Esforço:** S

### [UX-P2-004] Aluno: card "Cursos ativos" mistura `ACTIVE` e `COMPLETED` mas mostra um número só
**Onde:** `src/app/aluno/page.tsx:28-30`
**Severidade:** P2
**Categoria:** Hierarquia da informação
**Descrição:** "Cursos ativos: 3" inclui concluídos. Aluno que concluiu tudo vê "3 ativos" e estranha.
**Correção sugerida:** Separar em "Em andamento" e "Concluídos" ou mostrar progresso geral.
**Esforço:** S

### [UX-P2-005] Toolbar de filtros não tem botão "Limpar tudo" consistente
**Onde:** `src/components/admin/reports-client.tsx:111-120` (tem "Limpar"), `src/components/painel/finance-filter-bar.tsx` (sem), `src/components/admin/reseller-list-toolbar.tsx` (verificar)
**Severidade:** P2
**Categoria:** Formulários / Filtros
**Descrição:** Algumas toolbars têm botão de reset, outras não. Usuário fica preso aos filtros aplicados.
**Correção sugerida:** Sempre incluir "Limpar filtros" quando há mais de um campo.
**Esforço:** S

### [UX-P2-006] Botão "Salvar" e "Cancelar" trocados de ordem entre Sheets/Dialogs
**Onde:** `src/components/admin/equipe-client.tsx:230-240` (Cancelar | Enviar), `src/components/admin/reseller-list-client.tsx:218-227` (Cancelar | Salvar). Outros podem variar.
**Severidade:** P2
**Categoria:** Padrão de interação
**Descrição:** Geralmente OK (cancelar à esquerda, ação primária à direita). Vale verificar todos os modais para garantir.
**Correção sugerida:** Auditar e padronizar.
**Esforço:** S

### [UX-P2-007] Avatar inline (iniciais) usado em vários lugares sem componente comum
**Onde:** `src/components/aluno/student-shell.tsx:98-100`, `src/components/shared/layouts/sidebar-admin.tsx:120-123`, `src/components/painel/recent-sales.tsx:70-77`, `src/components/admin/global-students-client.tsx`, `src/components/painel/student-table.tsx:111-117`
**Severidade:** P2
**Categoria:** Consistência
**Descrição:** Cinco implementações diferentes de "avatar com iniciais": variam tamanho (h-8, h-9, h-10, h-12), background (lime-50, gold, lime, custom CSS variable), tipografia (xs, sm).
**Correção sugerida:** Criar `src/components/shared/initial-avatar.tsx` com sizes (`sm | md | lg`) e usar em todos. `src/components/ui/avatar.tsx` existe — pode envelopar.
**Esforço:** M

### [UX-P2-008] Tabela `course-list-wrapper` mostra 4 colunas (sm:grid-cols-2/lg:grid-cols-3/xl:grid-cols-4) mas em telas muito largas (>1600px) os cards ficam apertados
**Onde:** `src/components/painel/course-list-wrapper.tsx:155`
**Severidade:** P2
**Categoria:** Responsividade
**Descrição:** Sem `2xl:grid-cols-5`. Aparência fica aerada com tablet, comprimida em 1080p. Cursos com nomes longos quebram em duas linhas.
**Correção sugerida:** Acrescentar `2xl:grid-cols-5` ou definir min-width nos cards.
**Esforço:** S

### [UX-P2-009] HeroCTA / hero institucional sem alt no mockup ilustrativo
**Onde:** `src/components/main/hero-mockup.tsx` (sem alt-text descrevendo o mockup), `src/components/main/home/hero-banner.tsx` (linhas 18-25 - background-image inline)
**Severidade:** P2
**Categoria:** Acessibilidade
**Descrição:** Mockup do hero é decorativo. OK ser `aria-hidden` mas atualmente tem várias spans com texto visível para SR (Browser chrome, escolamaria.com.br) que confundem leitor de tela.
**Correção sugerida:** Marcar wrapper inteiro como `aria-hidden="true"` se for puramente decorativo.
**Esforço:** S

### [UX-P2-010] Footer institucional com lucide `Camera` representando Instagram
**Onde:** `src/components/shared/layouts/footer-main.tsx` (linhas 3, 80-92)
**Severidade:** P2
**Categoria:** Iconografia
**Descrição:** Para representar Instagram/Facebook/YouTube, footer usa `Camera`/`Users`/`PlayCircle` da lucide-react. Camera não é Instagram. Olha estranho.
**Correção sugerida:** lucide-react tem brand icons (Instagram, Facebook, Youtube). Importar e trocar.
**Esforço:** S

### [UX-P2-011] LivrecursosHeader sem mobile menu
**Onde:** `src/components/livrecursos/header.tsx`
**Severidade:** P2
**Categoria:** Responsividade
**Descrição:** Nav sempre visível com 3 links + CTA dourado, sem media query. Em telas <420px os links comprimem feio.
**Correção sugerida:** Mobile menu hamburger replicando padrão da NavbarMain.
**Esforço:** M

### [UX-P2-012] Dialog de novo revendedor sem campos com asterisco para obrigatórios
**Onde:** `src/components/admin/new-reseller-dialog.tsx` (geral)
**Severidade:** P2
**Categoria:** Formulários
**Descrição:** Sem distinguir visualmente obrigatórios. Erros aparecem só no submit.
**Correção sugerida:** `<Label>Nome <span className="text-destructive">*</span></Label>` e validação onBlur.
**Esforço:** S

### [UX-P2-013] Análise: o admin/equipe usa h1 com `font-display text-2xl` em vez do PageHeader
**Onde:** `src/components/admin/equipe-client.tsx:91-95`
**Severidade:** P2
**Categoria:** Consistência
**Descrição:** Página de equipe tem h1 inline. Outras admin pages usam `<PageHeader title="..." description="..." />`. Pequena inconsistência tipográfica.
**Correção sugerida:** Refatorar para usar `PageHeader`.
**Esforço:** S

### [UX-P2-014] Toggle visibilidade do curso (`Eye`/`EyeOff`) sem feedback de sucesso/erro
**Onde:** `src/components/painel/course-list-wrapper.tsx:75-89`
**Severidade:** P2
**Categoria:** Feedback
**Descrição:** Optimistic UI bom, mas se a request falha, o load retorna ao estado anterior sem toast. Usuário acha que está OK.
**Correção sugerida:** Em caso de erro `toast.error("Falha ao atualizar visibilidade")`.
**Esforço:** S

### [UX-P2-015] Charts admin não têm eixo Y, tooltip nem legendas
**Onde:** `src/components/admin/analytics-charts.tsx` (LineChart, BarChart inline)
**Severidade:** P2
**Categoria:** Usabilidade
**Descrição:** SVG cru — você vê a linha subindo mas não sabe se é R$ 100 ou R$ 100 mil. Sem hover/tooltip mostrando valores.
**Correção sugerida:** Adotar Recharts (já no design-system) com eixos, grid e tooltip.
**Esforço:** L

### [UX-P2-016] Notificações: o filtro de categorias é `<select>` nativo
**Onde:** `src/components/shared/notifications-page.tsx:217-229`
**Severidade:** P2
**Categoria:** Consistência
**Descrição:** Mesmo arquivo já mostra que sabe fazer toggle pill (`filter === f`). Mas categoria fica em `<select>` nativo — estética destoante.
**Correção sugerida:** Trocar por shadcn Select.
**Esforço:** S

### [UX-P2-017] Não há `<ThemeProvider>` no root layout — next-themes instalado mas inerte
**Onde:** `src/app/layout.tsx`, `src/components/ui/sonner.tsx:3`
**Severidade:** P2
**Categoria:** Dark mode
**Descrição:** Sonner importa `useTheme` de next-themes mas o app não tem `<ThemeProvider attribute="class">` envolvendo. Resultado: dark mode definido no CSS (`.dark` em `globals.css:98-130`) nunca ativa. Toggle de tema seria fácil mas não existe.
**Correção sugerida:** Decidir: ou implementar dark mode (envolver com ThemeProvider + toggle no header) ou remover next-themes da dependência se for fora de escopo.
**Esforço:** M

### [UX-P2-018] Inadimplente: cor `#25D366` (verde WhatsApp) hardcoded
**Onde:** `src/app/inadimplente/page.tsx:105`
**Severidade:** P2
**Categoria:** Consistência
**Descrição:** Botão WhatsApp usa cor exata da marca WhatsApp (`#25D366`). Está OK em isolado mas convive com botões verdes PMB na mesma tela. Visualmente o usuário não sabe qual é primário.
**Correção sugerida:** Manter o verde WhatsApp (é convenção) mas ajustar tamanho/peso para diferenciar.
**Esforço:** S

### [UX-P2-019] Banner "impersonation" em painel revendedor existe mas é genérico
**Onde:** `src/components/admin/impersonation-banner.tsx` (não inspecionei detalhe, mas baseline aparece sempre que admin entra como tenant)
**Severidade:** P2
**Categoria:** Feedback
**Descrição:** Acrescentar verificação que o styling do banner realmente avisa visualmente (faixa amarela no topo da tela, sticky). Se for sutil, admin pode esquecer que está como outro.
**Correção sugerida:** Faixa amarela com borda + texto "Você está vendo como {nome}". Botão "Sair do modo" bem visível.
**Esforço:** S

### [UX-P2-020] Card de detalhe de curso /loja tem H2 "Sobre o curso" mas conteúdo pode ser uma palavra
**Onde:** `src/components/shared/course-detail-view.tsx:219-234`
**Severidade:** P2
**Categoria:** Empty state
**Descrição:** Quando `course.descricao` é null/curta, o fallback é um parágrafo genérico ("Curso profissionalizante online com material completo..."). Falta indicação que descrição precisa ser cadastrada. Para o revendedor isso pode passar despercebido.
**Correção sugerida:** Para admin/revendedor logado, mostrar warning "Esta descrição é genérica. Personalize em /painel/cursos".
**Esforço:** M

### [UX-P2-021] FAQ na página de curso é hardcoded igual em todos os cursos
**Onde:** `src/components/shared/course-detail-view.tsx:63-80` (FAQ array com 4 itens fixos)
**Severidade:** P2
**Categoria:** Mock vs prod / Personalização
**Descrição:** O FAQ "Quanto tempo tenho para concluir o curso? Acesso vitalício" é o mesmo em qualquer curso. Para o aluno faz sentido até descobrir que vai estar em todos. Para SEO seria melhor cada curso ter FAQ contextual.
**Correção sugerida:** Permitir FAQ override por curso (fallback para o atual). Curto prazo: aceitável manter genérico.
**Esforço:** L

### [UX-P2-022] APRENDIZADO_DEFAULT e PARA_QUEM hardcoded e idêntico em todos os cursos
**Onde:** `src/components/shared/course-detail-view.tsx:47-61`
**Severidade:** P2
**Categoria:** Mock vs prod
**Descrição:** "O que você vai aprender" é sempre os mesmos 6 bullets genéricos ("Fundamentos teóricos", "Ferramentas e materiais") — independente do curso. Aluno comprando confeitaria vai ver "Como atender clientes com excelência" exatamente como aluno de informática.
**Correção sugerida:** Marcar como dependente de descrição editorial. Permitir override por curso ou esconder quando descrição é insuficiente.
**Esforço:** M

### [UX-P3-001] Spacing inconsistente entre seções do admin (algumas `space-y-6`, outras `space-y-5`)
**Onde:** Vários arquivos
**Severidade:** P3
**Categoria:** Spacing
**Descrição:** Sweep geral mostraria pequenas diferenças. Não é crítico mas é o tipo de detalhe que diferencia um produto polido.
**Correção sugerida:** Padronizar via classe utilitária `page-stack` no global.
**Esforço:** S

### [UX-P3-002] Hover dos cards (`hover:-translate-y-0.5`, `hover:shadow-md`) varia entre 0.5px e 1px
**Onde:** Course card vs catalog course grid vs other listing
**Severidade:** P3
**Categoria:** Microinteração
**Descrição:** Não é problema sério; mas diferentes magnitudes percebem-se quando o usuário troca de tela rápido.
**Correção sugerida:** Adotar uma escala (subtle: -0.5px, normal: -1px, prominent: -2px).
**Esforço:** S

### [UX-P3-003] Botões grandes da landing PMB usam `transition-transform hover:scale-[1.02]`
**Onde:** `src/components/main/hero-cta.tsx:85`, `src/components/main/formulario-interesse.tsx:228`
**Severidade:** P3
**Categoria:** Microinteração
**Descrição:** Scale on hover em CTAs de landing pode parecer datado. Tudo bem se for proposital.
**Correção sugerida:** Considerar usar lift+shadow (mais moderno) em vez de scale.
**Esforço:** S

### [UX-P3-004] Footer institucional não tem busca/feed de novidades, só links estáticos
**Onde:** `src/components/shared/layouts/footer-main.tsx`
**Severidade:** P3
**Categoria:** IA
**Descrição:** Falta uma área "Novidades / Blog" ou "Newsletter". Pequeno gap de SEO/engajamento.
**Correção sugerida:** Em fase pós-lançamento, considerar inscrição newsletter no footer.
**Esforço:** M

### [UX-P3-005] Tipografia: tamanhos de fontes da landing PMB são `text-[34px] md:text-[44px] lg:text-[52px]` (literais)
**Onde:** Vários componentes `src/components/main/home/*.tsx`
**Severidade:** P3
**Categoria:** Design system
**Descrição:** Em vez de classes Tailwind padrão (`text-3xl md:text-5xl`), usa valores literais. Funciona mas é mais difícil refatorar.
**Correção sugerida:** Migrar para escalas Tailwind quando possível.
**Esforço:** L

### [UX-P3-006] Aluno: card "Acesse sua área de aulas" abre nova aba sem aviso
**Onde:** `src/app/aluno/page.tsx:195-213` (`target="_blank" rel="noopener noreferrer"`)
**Severidade:** P3
**Categoria:** Microcopy
**Descrição:** Acesso externo abre nova aba — comportamento OK mas usuário não sabe disso. Adicionar `external-link` icon ajuda.
**Correção sugerida:** `<ExternalLink className="h-3 w-3" />` ao lado do texto.
**Esforço:** S

### [UX-P3-007] Pwa install prompt mostra duas vezes botão dismiss
**Onde:** `src/components/pwa/install-prompt.tsx:108-114, 117-123`
**Severidade:** P3
**Categoria:** Usabilidade
**Descrição:** Top-right X + bottom "Agora não". Redundante. Manter só um.
**Correção sugerida:** Remover o X se já tem "Agora não" no rodapé.
**Esforço:** S

### [UX-P3-008] Botão "Salvar alterações" em vez de só "Salvar" daria pista de mudança
**Onde:** `src/components/painel/account-form.tsx` (não inspecionado mas padrão)
**Severidade:** P3
**Categoria:** Microcopy
**Descrição:** Genérico. Verificar texto dos CTAs.
**Correção sugerida:** Padronizar "Salvar alterações" para formulários de edição.
**Esforço:** S

### [UX-P3-009] StudentForm coleta endereço sem geocoding/CEP autopreencher
**Onde:** `src/components/loja/student-form.tsx:220-233`
**Severidade:** P3
**Categoria:** Microconveniência
**Descrição:** Aluno digita endereço inteiro. ViaCEP autopreenche cidade/estado/rua a partir do CEP.
**Correção sugerida:** Acoplar busca ViaCEP no input de CEP.
**Esforço:** M

### [UX-P3-010] Hero de course-detail usa Image como background — performance e CLS
**Onde:** `src/components/shared/course-detail-view.tsx:123-130`
**Severidade:** P3
**Categoria:** Performance percebida
**Descrição:** `<Image src={capa} fill priority />` sem dimensões fixas pode causar CLS no carregamento.
**Correção sugerida:** Trocar para `<Image>` com aspect ratio fixo. Considerar placeholder blur.
**Esforço:** S

### [UX-P3-011] Loja vitrine não tem breadcrumb visível
**Onde:** `src/app/loja/page.tsx` (home), `src/app/loja/curso/[slug]/page.tsx` (detalhe)
**Severidade:** P3
**Categoria:** Navegação
**Descrição:** Detalhe de curso tem botão "Voltar para a loja" mas não breadcrumb. Para vitrines grandes (com categoria) seria útil.
**Correção sugerida:** Acrescentar breadcrumb Home > Categoria > Curso.
**Esforço:** M

### [UX-P3-012] Logo PMB usa `width={1536} height={1024}` — aspect-ratio extremo
**Onde:** `src/components/shared/layouts/navbar-main.tsx:76-79`, `src/components/shared/layouts/footer-main.tsx:52-55`
**Severidade:** P3
**Categoria:** Performance / Acessibilidade
**Descrição:** Image declarada com 1536x1024 (aspect ratio ~1.5) mas renderizada como h-14 (56px) auto-width. Browser baixa imagem grande mesmo. Imagem original deveria ser otimizada para essa altura.
**Correção sugerida:** Servir versão menor para navbar/footer. Tomar cuidado com Image priority na navbar.
**Esforço:** S

### [UX-P3-013] Texto "Powered by Profissionaliza Mais Brasil" só aparece no painel auth
**Onde:** `src/components/auth/brand-panel.tsx:114`
**Severidade:** P3
**Categoria:** Marca
**Descrição:** Vitrine de tenants não tem branding sutil do PMB no footer (apenas se for revendedor white-label). Para discoverability isso é uma escolha consciente, mas pode estar implícito; verificar.
**Correção sugerida:** Confirmar política de white-label (com/sem PMB rodapé). Documentar.
**Esforço:** S

### [UX-P3-014] Header dashboard tem só "Sair" em mobile, perde a notificação bell
**Onde:** `src/components/shared/layouts/header-dashboard.tsx`
**Severidade:** P3
**Categoria:** Responsividade
**Descrição:** `NotificationBell` sempre visível, mas o nome do usuário some em mobile. Em mobile o usuário pode confundir o sino com algo do app.
**Correção sugerida:** Drawer/menu lateral abrindo notificações em mobile (já existe parcial).
**Esforço:** M

### [UX-P3-015] `FALLBACK_CATEGORIAS` na navbar — se loadCategorias falhar, mostra 5 categorias inventadas
**Onde:** `src/components/shared/layouts/navbar-main.tsx:9-15`
**Severidade:** P3
**Categoria:** Mock vs prod
**Descrição:** Fallback é razoável, mas se nunca atualizar tem categorias hardcoded sempre visíveis quando o load falha. OK como fallback robusto.
**Correção sugerida:** Manter, mas garantir que o fallback usa nomes realmente alinhados com o cadastro do banco.
**Esforço:** S
