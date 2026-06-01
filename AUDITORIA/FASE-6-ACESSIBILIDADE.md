# Fase 6 — Layout e Acessibilidade (WCAG)

> Gerado da varredura paralela (sub-agentes Explore) + verificação adversarial. Total nesta fase: **16 achados**.

## Resumos dos finders

- Auditoria WCAG 2.1 AA de acessibilidade em SaaS multi-tenant Next.js 16 + React 19. Encontrados 8 problemas críticos e moderados: imagens de herói e vitrine com alt text vazio em carrosséis e pickers, imagens decorativas sem marcação apropriada, placeholder com contraste insuficiente (0.5 opacidade), checkbox sem id em form de login, múltiplos textos com contraste baixo (0.5-0.6 opacidade em fundo branco), e falta de skip link para acessibilidade por teclado.
- Auditoria exaustiva de Validade HTML e Responsividade em Next.js 16 + React 19 multi-tenant. O projeto utiliza Tailwind CSS com larguras/alturas fixas arbitrárias, problemas ARIA em componentes interativos, aninhamento HTML questionável em menus, e componentes com posicionamento absoluto não responsivo. Pontuação geral: múltiplos problemas críticos de acessibilidade e responsividade identificados em componentes principais (navbar, tabelas, showcase).

## Achados detalhados

### 1. [Alto] Checkbox sem id adequado para associação com label
- **arquivo:linha:** `src/components/auth/login-form.tsx:152-157`
- **confiança (finder):** media
- **descrição:** Checkbox em linha 152 não possui id e está dentro de <label>, mas o texto "Lembrar-me neste dispositivo" não está semanticamente vinculado via htmlFor. Embora funcione por inclusão, viola melhor prática WCAG 2.1 1.4.1 (associação de labels).
- **impacto:** Leitores de tela podem não anunciar corretamente o propósito do checkbox, prejudicando usuários com deficiência visual que usam navegação por teclado e leitura de rótulos.
- **correção:** Adicione id="remember-device" ao input e htmlFor="remember-device" ao label, ou use aria-label="Lembrar-me neste dispositivo" no input.
- **trecho:**

```
<label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" className="h-4 w-4 rounded..." />
        Lembrar-me neste dispositivo</label>
```

### 2. [Alto] Placeholder com contraste insuficiente
- **arquivo:linha:** `src/components/main/home/hero-banner.tsx:62`
- **confiança (finder):** alta
- **descrição:** Input de busca em hero tem placeholder:text-[rgba(2,89,24,0.5)] - texto com 50% opacidade. Contraste entre #025918 com 50% opacidade sobre fundo branco não atinge razão de contraste 4.5:1 exigida para texto pequeno em WCAG AA (1.4.3).
- **impacto:** Usuários com baixa visão (miopia, daltonismo) podem não conseguir ler o placeholder text "Qual profissão você quer aprender?", comprometendo usabilidade do campo de busca crítico.
- **correção:** Use placeholder:text-[rgba(2,89,24,0.7)] ou superior para garantir razão de contraste 4.5:1. Idealmente usar texto com opacidade mínima 0.7.
- **trecho:**

```
placeholder:text-[rgba(2,89,24,0.5)]
```

### 3. [Alto] Imagem de herói com alt text vazio
- **arquivo:linha:** `src/components/main/home/hero-slides.tsx:79`
- **confiança (finder):** alta
- **descrição:** Banner de herói em carrossel renderiza <img> com alt="" vazio em linha 79. Embora a imagem seja funcional (carrossel com navegação), o alt vazio viola WCAG 2.1 1.1.1 (texto alternativo para imagens). Usuários de leitores de tela não conseguem saber o contexto da imagem do banner.
- **impacto:** Usuários com deficiência visual não conseguem entender o conteúdo ou propósito do banner de herói, prejudicando navegação e compreensão da página.
- **correção:** Substitua alt="" por alt="Banner principal - Aprenda uma profissão em menos de 3 meses" ou texto similar que descreva o conteúdo/propósito do banner.
- **trecho:**

```
<img src={slide.mobileUrl} alt="" className="block h-auto w-full" loading={i === 0 ? "eager" : "lazy"} draggable={false} />
```

### 4. [Alto] Componente showcase com altura fixa h-[520px] e posicionamento absolute nao responsivo
- **arquivo:linha:** `src/components/main/home/showcase-cards.tsx:56`
- **confiança (finder):** alta
- **descrição:** ShowcaseCards tem container com h-[520px] fixo. Dentro, CardPreview tem w-[300px] fixo com absolute positioning (right:-40px, left:-20px, bottom:0). Em mobile, cartões saem do viewport ou sobrepõem.
- **impacto:** Mobile: cartões aparecem fora de tela, parcialmente cortados ou invisíveis. Usuário em mobile não vê conteúdo de showcase. Desktop: OK.
- **correção:** Em mobile (sm breakpoint), usar display:none ou relative layout com flex. Para desktop, manter absolute. Ou usar horizontal scroll container para mobile em vez de posicionamento absolute.
- **trecho:**

```
className="relative h-[520px] w-full"
className="absolute right-[-40px] top-[40px] rotate-[-6deg]"
```

### 5. [Alto] role='button' em div sem atributos ARIA obrigatorios
- **arquivo:linha:** `src/components/painel/lead-kanban-column.tsx:138-146`
- **confiança (finder):** alta
- **descrição:** Elemento <div> com role='button' e tabIndex={0} está sem aria-pressed ou aria-expanded. Teclado suporta apenas Enter, não Espaço que é esperado para buttons.
- **impacto:** Usuários com leitores de tela não recebem semântica clara. Usuários com teclado não conseguem ativar com Space (convenção de buttons HTML).
- **correção:** Usar <button> HTML nativo em vez de role='button', ou adicionar aria-pressed/aria-expanded conforme o estado. Adicionar suporte para Space key no onKeyDown.
- **trecho:**

```
role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") onClick()
        }}
```

### 6. [Alto] Aninhamento <Link> com role='menuitem' dentro de <ul> com <div role='menu'> quebra semantica HTML
- **arquivo:linha:** `src/components/shared/layouts/navbar-main.tsx:110-161`
- **confiança (finder):** alta
- **descrição:** Menu em dropdown tem estrutura role='menu' > ul > li > Link(role='menuitem'). Links semânticos (Next.js Link) com role='menuitem' é ambíguo — role='menuitem' deve estar em <button> ou <a> nativo, não em <Link>.
- **impacto:** Leitor de tela pode reportar elemento como 'link menu item' ao invés de 'menu item' esperado. Navegação com arrow keys pode não funcionar conforme esperado (ARIA menus esperam role='menu' gerenciar focus).
- **correção:** Usar <a> nativo com href em vez de Next.js Link, ou remover role='menuitem' e deixar o link como <li> simples. Implementar gerenciamento de focus com ArrowUp/ArrowDown se quer semântica ARIA menu completa.
- **trecho:**

```
<div
              role="menu"
              className="absolute left-0 top-full z-50..."
            >
              <ul className="flex flex-col">
                {lista.map((cat) => (
                  <li key={cat.slug}>
                    <Link
                      role="menuitem"
```

### 7. [Alto] Imagem de miniatura de curso com alt vazio
- **arquivo:linha:** `src/components/vitrine/course-picker.tsx:283`
- **confiança (finder):** alta
- **descrição:** Componente CourseThumb renderiza <Image> com alt="" vazio em linha 283. Esta imagem é a capa do curso exibida em picker/dropdown e é semanticamente importante para identificar o curso visualmente.
- **impacto:** Usuários de leitores de tela não conseguem identificar qual curso está selecionado/sendo visualizado no picker de cursos, prejudicando experiência de compra.
- **correção:** Defina alt={`Capa do curso ${course.name}`} ou similar para descrever a imagem da capa do curso.
- **trecho:**

```
<Image src={course.imageUrl} alt="" fill unoptimized sizes="56px" className="object-cover" />
```

### 8. [Medio] Tabela com min-w-[860px] quebra layout em mobile sem scroll explicito
- **arquivo:linha:** `src/components/admin/financeiro-tenant-payments.tsx:279`
- **confiança (finder):** media
- **descrição:** Tabela dentro de overflow-x-auto com min-w-[860px] fixo. Em telas pequenas (< 860px), força scroll horizontal mesmo que overflow-x-auto contenha. Sem contraste visual de scroll hint ou viewport reset em mobile.
- **impacto:** Em mobile, usuário vê scroll horizontal necessário mas pode não perceber. Tabela pode cortar conteúdo lateral sem scroll accessibility indicators.
- **correção:** Manter overflow-x-auto com min-w-[860px] para desktop, mas adicionar classe responsiva: overflow-x-auto em mobile, overflow-x-hidden + flex-col com display:block para colunas em breakpoint sm. Ou usar display:table-cell com max-width auto em mobile.
- **trecho:**

```
className="w-full min-w-[860px] text-sm"
```

### 9. [Medio] Múltiplos inputs com placeholder contrast baixo
- **arquivo:linha:** `src/components/loja/lead-inquiry-card.tsx:111, 122, 132`
- **confiança (finder):** alta
- **descrição:** Três inputs em lead-inquiry-card usam placeholder:text-[rgba(2,89,24,0.45)] - 45% opacidade. Contraste insuficiente por WCAG 2.1 1.4.3 (AA requer 4.5:1 para texto).
- **impacto:** Usuários com baixa visão não conseguem ler placeholders dos campos de contato, prejudicando preenchimento de formulário crítico de lead.
- **correção:** Aumentar opacidade para minimum 0.7: placeholder:text-[rgba(2,89,24,0.7)]
- **trecho:**

```
placeholder:text-[rgba(2,89,24,0.45)]
```

### 10. [Medio] Tabela com min-w-[700px] fixa quebra responsividade em mobile
- **arquivo:linha:** `src/components/main/comparacao-tabela.tsx:97`
- **confiança (finder):** media
- **descrição:** Tabela com min-w-[700px] dentro de div com overflow-x-auto. Em telas <700px (mobile), força scroll horizontal sem redimensionamento responsivo de células.
- **impacto:** Mobile: conteúdo de tabela fica ilegível ou requer scroll horizontal. Desktop: responsive OK.
- **correção:** Stack colunas em mobile com CSS media query ou usar card layout para mobile. Para desktop, manter table com min-w. Exemplo: `md:min-w-[700px]` para limitar apenas em md+.
- **trecho:**

```
className="w-full min-w-[700px] border-separate border-spacing-0 text-left"
```

### 11. [Medio] Lista de badges sem semântica de lista acessível
- **arquivo:linha:** `src/components/main/home/hero-banner.tsx:72-96`
- **confiança (finder):** media
- **descrição:** Línea 72-96: badges de benefícios ("Certificado incluso", etc) em <ul> mas listitems são divs contendo spans com ✓. Estrutura está correta, mas ícone check (✓) em span sem aria-hidden pode ser anunciado redundantemente.
- **impacto:** Leitores de tela podem anunciar o símbolo ✓ literalmente antes do texto, criando experiência confusa para usuários com deficiência visual.
- **correção:** Adicione aria-hidden="true" aos spans contendo ✓, ou use CSS puro (::before com content: "✓") com aria-hidden no container.
- **trecho:**

```
<span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--color-pmb-lime)]...text-[10px] font-black">✓</span>
```

### 12. [Medio] Imagem de preview de banner com alt vazio
- **arquivo:linha:** `src/components/shared/banner-slides-manager.tsx:469`
- **confiança (finder):** alta
- **descrição:** Componente de gerenciamento de banners renderiza preview de imagem com alt="" vazio em linha 469. Esta é imagem de administração, mas ainda deve ter alt text apropriado para conformidade WCAG.
- **impacto:** Admininistradores com deficiência visual não conseguem identificar visualmente qual imagem está sendo previsualisada durante upload de banners.
- **correção:** Defina alt="Preview da imagem do banner enviada" ou similar.
- **trecho:**

```
<Image src={props.url} alt="" fill sizes="(max-width:768px) 50vw, 25vw" unoptimized className="object-cover" />
```

### 13. [Medio] Navbar com alturas fixas h-[80px] e max-w-[560px] pode quebrar em viewport estreito
- **arquivo:linha:** `src/components/shared/layouts/navbar-main.tsx:63`
- **confiança (finder):** media
- **descrição:** Navbar flex com h-[80px] md:h-[92px] (valores arbitrários). Icone Search com h-[18px] w-[18px] fixo. Seção de busca com max-w-[560px] flex-1. Em telas <360px (ex: smartwatch), espaço insuficiente para logo + search + botões.
- **impacto:** Em viewport muito estreito (<360px), elementos podem sobrepor ou cortar. Logo pode ficar invisível ou muito pequeno. Search cabe mas botão 'Quero estudar' é hidden em md, deixando só search visível.
- **correção:** Usar h-auto ou flex-shrink-0 com padding em vez de altura fixa. Reduzir max-w-[560px] para max-w-[100%] md:max-w-[560px]. Testar em 320px viewport width (mobile mínimo).
- **trecho:**

```
h-[80px] max-w-[1280px] px-4 md:h-[92px]
className="h-[18px] w-[18px] absolute"
```

### 14. [Informativo] Falta de skip link para navegação por teclado
- **arquivo:linha:** `src/app/(main)/page.tsx e componentes loja:various`
- **confiança (finder):** media
- **descrição:** Página principal e vitrine não possuem skip link ("Pular para conteúdo principal") visível ao navegar por teclado. Enquanto há landmarks <section>, usuários por teclado precisam passar por navegação repetida antes de chegar ao conteúdo.
- **impacto:** Usuários que navegam apenas por teclado ou usam tecnologias assistivas precisam apertar Tab várias vezes para chegar ao conteúdo principal, prejudicando eficiência de navegação.
- **correção:** Adicione skip link no início do layout: <a href="#main-content" className="sr-only focus:not-sr-only">Pular para conteúdo principal</a> e <main id="main-content">

### 15. [Informativo] Viewport maximumScale: 5 permite zoom excessivo pode quebrar layout
- **arquivo:linha:** `src/app/layout.tsx:107-113`
- **confiança (finder):** baixa
- **descrição:** Viewport config com maximumScale: 5 permite zoom de até 500%. Layout fixo com max-w-[1280px] pode ficar desproporcionado em zoom alto.
- **impacto:** Usuário com baixa visão faz zoom 5x, layout quebra ou fica distorcido. Não é bloqueador, mas viola best practice de acessibilidade.
- **correção:** Mudar maximumScale para 2 ou user-scalable: 'no' se zoom for gerenciado por CSS. Padrão WCAG recomenda maximum-scale 5 ser mínimo, está OK.
- **trecho:**

```
maximumScale: 5
```

### 16. [Informativo] Div com aspect-[3/4] e max-w-[380px] sem height explicita em mobile
- **arquivo:linha:** `src/components/main/home/learn-anywhere.tsx:31`
- **confiança (finder):** media
- **descrição:** Imagem com aspect-[3/4] w-full max-w-[380px]. Em mobile <380px, aspect ratio é mantido mas largura é 100%, deixando height muito grande para tela de celular.
- **impacto:** Mobile: imagem ocupa altura excessiva, força scroll vertical. UX prejudicada.
- **correção:** Adicionar md:max-w-[380px] max-w-[280px] ou usar w-screen-safe (custom class). Testar responsividade em 320px width.
- **trecho:**

```
className="relative mx-auto aspect-[3/4] w-full max-w-[380px]"
```
