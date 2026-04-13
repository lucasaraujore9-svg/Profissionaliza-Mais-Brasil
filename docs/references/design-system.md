# Design System — Padrões Visuais do PMB

Este documento descreve o design system visual do Profissionaliza Mais Brasil. Todas as telas DEVEM seguir estes padrões.

---

## 1. Tipografia

### Famílias de Fonte

| Uso | Fonte | Fallback | Exemplos |
|-----|-------|----------|----------|
| **Headings, UI** | Satoshi | Inter | Títulos, botões, labels |
| **Corpo de texto** | Satoshi | Inter | Parágrafos, descrições, ebody |
| **Monospace (preços, códigos)** | JetBrains Mono | Courier New | Valores monetários, IDs, tokens |

### Hierarchy de Tamanhos

| Nível | Tamanho | Weight | Uso |
|-------|---------|--------|-----|
| **Hero** | 48-64px | 700 | Títulos de landing, hero sections |
| **H1** | 36px | 700 | Títulos de página principal |
| **H2** | 28px | 700 | Títulos de seção |
| **H3** | 22px | 600 | Subtítulos, card titles |
| **Body** | 16px | 400 | Parágrafo padrão |
| **Small** | 14px | 400 | Legends, captions |
| **Micro** | 12px | 400 | Hints, meta info |

### Exemplos de Uso

```
Hero: "Venda cursos com sua marca"
H1: "Dashboard de Vendas"
H2: "Últimos Pedidos"
H3: "Curso de Python Avançado"
Body: "Selecione o curso para gerenciar conteúdo e alunos."
Small: "Última atualização há 2 horas"
Micro: "ID: 12345"
```

### Line Height

- Headings: 1.1 (tight)
- Body: 1.6 (readable)
- Small/Micro: 1.4

---

## 2. Paleta de Cores

### Core Colors

| Nome | Hex | RGB | Uso |
|------|-----|-----|-----|
| **Canvas** | #FAFAFA | 250, 250, 250 | Background das páginas |
| **Surface** | #FFFFFF | 255, 255, 255 | Cards, modais, containers |
| **Border** | #E5E7EB | 229, 231, 235 | Borders, dividers, subtle lines |

### Text Colors

| Nome | Hex | Contraste | Uso |
|------|-----|-----------|-----|
| **Primary Text** (Charcoal) | #1A1A2E | 16.3:1 | Body text, headings |
| **Secondary Text** | #6B7280 | 7.1:1 | Captions, hints, disabled |
| **Tertiary Text** | #9CA3AF | 4.5:1 | Very light text (backgrounds) |

### Accent Colors

| Nome | Hex | Hover | Uso |
|------|-----|-------|-----|
| **Primary (Electric Blue)** | #3B82F6 | #2563EB | CTAs, links, active states |
| **Success** | #10B981 | #059669 | Confirmações, status positivo |
| **Warning** | #F59E0B | #D97706 | Alerts, cautionary states |
| **Error** | #EF4444 | #DC2626 | Erros, deletions, danger |
| **Info** | #3B82F6 | #2563EB | Informações, helpertext |

### Semantic Colors

```typescript
// src/lib/colors.ts (para referência)

export const colors = {
  // Canvas & Surfaces
  canvas: "#FAFAFA",
  surface: "#FFFFFF",
  border: "#E5E7EB",

  // Text
  textPrimary: "#1A1A2E",
  textSecondary: "#6B7280",
  textTertiary: "#9CA3AF",

  // Accent
  primary: "#3B82F6",
  primaryHover: "#2563EB",
  success: "#10B981",
  successHover: "#059669",
  warning: "#F59E0B",
  warningHover: "#D97706",
  error: "#EF4444",
  errorHover: "#DC2626",
  info: "#3B82F6",

  // Status
  statusPending: "#F59E0B",
  statusActive: "#10B981",
  statusInactive: "#6B7280",
  statusBlocked: "#EF4444",
};
```

### Dark Mode (Futuro)

```
Canvas Dark: #0F0F0F
Surface Dark: #1A1A1A
Border Dark: #2D2D2D
Text Primary Dark: #F5F5F5
Text Secondary Dark: #A0A0A0
```

---

## 3. Componentes shadcn/ui — Padrões de Uso

### Cards

```tsx
// Padrão: Surface bg, border 1px, rounded-xl, subtle shadow
<Card className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
  <CardHeader>
    <CardTitle>Título do Card</CardTitle>
    <CardDescription>Descrição opcional</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Conteúdo */}
  </CardContent>
  <CardFooter>
    {/* Ações */}
  </CardFooter>
</Card>
```

### Buttons

```tsx
// Primary (Default)
<Button className="bg-blue-600 text-white hover:bg-blue-700">
  Ação Primária
</Button>

// Secondary
<Button variant="outline" className="border border-gray-300">
  Ação Secundária
</Button>

// Destructive
<Button variant="destructive" className="bg-red-600">
  Deletar
</Button>

// Ghost (link-like)
<Button variant="ghost">
  Link Subtle
</Button>

// Loading State
<Button disabled>
  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  Carregando...
</Button>
```

### Badges

```tsx
// Status badges
<Badge className="rounded-full bg-green-100 text-green-800">
  Ativo
</Badge>

<Badge className="rounded-full bg-yellow-100 text-yellow-800">
  Pendente
</Badge>

<Badge className="rounded-full bg-red-100 text-red-800">
  Bloqueado
</Badge>

<Badge className="rounded-full bg-gray-100 text-gray-800">
  Inativo
</Badge>
```

### Tables

```tsx
<Table className="w-full">
  <TableHeader className="bg-gray-50 border-b border-gray-200">
    <TableRow>
      <TableHead>Coluna 1</TableHead>
      <TableHead>Coluna 2</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {data.map((row) => (
      <TableRow
        key={row.id}
        className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
      >
        <TableCell>{row.col1}</TableCell>
        <TableCell>{row.col2}</TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

### Forms

```tsx
// Padrão: Top label ou floating label
<div className="space-y-2">
  <Label htmlFor="name">Nome do Curso</Label>
  <Input
    id="name"
    placeholder="ex: Python Avançado"
    className="border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
  />
  {error && <p className="text-sm text-red-600">{error}</p>}
</div>

// Com ícone
<div className="relative">
  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
  <Input
    placeholder="Buscar..."
    className="pl-10"
  />
</div>
```

### Modals & Dialogs

```tsx
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent className="bg-white rounded-xl p-6">
    <DialogHeader>
      <DialogTitle>Confirmar Ação</DialogTitle>
      <DialogDescription>
        Tem certeza que deseja continuar?
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" onClick={() => setIsOpen(false)}>
        Cancelar
      </Button>
      <Button onClick={handleConfirm}>
        Confirmar
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Drawers

```tsx
// Drawer (slide-in from right)
<Sheet open={isOpen} onOpenChange={setIsOpen}>
  <SheetContent side="right" className="w-96">
    <SheetHeader>
      <SheetTitle>Painel Lateral</SheetTitle>
    </SheetHeader>
    {/* Conteúdo */}
  </SheetContent>
</Sheet>
```

### Loading States

```tsx
// Skeleton (matches layout)
<div className="space-y-4">
  <Skeleton className="h-12 w-full rounded-lg" />
  <Skeleton className="h-24 w-full rounded-lg" />
  <Skeleton className="h-12 w-1/3 rounded-lg" />
</div>

// Spinner
<div className="flex justify-center items-center h-64">
  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
</div>
```

### Alerts

```tsx
// Info
<Alert className="bg-blue-50 border-l-4 border-blue-500">
  <AlertCircle className="h-4 w-4 text-blue-600" />
  <AlertTitle>Informação</AlertTitle>
  <AlertDescription>Mensagem informativa aqui.</AlertDescription>
</Alert>

// Warning
<Alert className="bg-yellow-50 border-l-4 border-yellow-500">
  <AlertTriangle className="h-4 w-4 text-yellow-600" />
  <AlertTitle>Atenção</AlertTitle>
  <AlertDescription>Mensagem de alerta aqui.</AlertDescription>
</Alert>

// Error
<Alert className="bg-red-50 border-l-4 border-red-500">
  <AlertCircle className="h-4 w-4 text-red-600" />
  <AlertTitle>Erro</AlertTitle>
  <AlertDescription>Mensagem de erro aqui.</AlertDescription>
</Alert>
```

---

## 4. Padrões de Layout

### Admin / Painel Revendedor

```
┌─────────────────────────────────────────┐
│ Header (logo, search, notifications)    │
├─────────────────────────────────────────┤
│          │                              │
│ Sidebar  │     Main Content             │
│ (240px)  │     (scrollable)             │
│          │                              │
│          │                              │
└─────────────────────────────────────────┘
```

- **Sidebar**: Fixed, 240px wide, bg-white, border-right
- **Header**: Sticky, 64px height, bg-white
- **Main**: Full height, scrollable, bg-canvas (#FAFAFA)

### Vitrine (Loja)

```
┌────────────────────────────────────────┐
│ Navbar (logo, menu, search)            │
├────────────────────────────────────────┤
│                                        │
│    Content (max-w-7xl centered)       │
│                                        │
│    Section 1 (alternate bg colors)    │
│    Section 2                          │
│    Section 3                          │
│                                        │
└────────────────────────────────────────┘
│ Footer                                  │
└────────────────────────────────────────┘
```

- **Full-width**: 100vw
- **Container**: max-w-7xl, mx-auto, px-6
- **Sections**: Alternating bg (white, canvas, white)
- **Footer**: Sticky ou no final

### Auth

```
┌──────────────────┬──────────────────┐
│                  │                  │
│ Brand Panel      │  Form Panel      │
│ (bg-primary)     │  (bg-white)      │
│ Hero, Logo       │  Input, Buttons  │
│                  │                  │
└──────────────────┴──────────────────┘
```

- **Left**: 50%, bg-primary (#3B82F6), centered text
- **Right**: 50%, bg-white, form with padding

---

## 5. Responsive Breakpoints

### Mobile-First Approach

```typescript
// tailwind.config.ts (defaults)
const defaultBreakpoints = {
  'sm': '640px',   // phones
  'md': '768px',   // tablets
  'lg': '1024px',  // desktops
  'xl': '1280px',  // wide desktops
};
```

| Device | Width | Columns | Sidebar | Notes |
|--------|-------|---------|---------|-------|
| **Mobile** | < 768px | 1 | Hamburger (hidden) | Bottom CTA bar |
| **Tablet** | 768-1024px | 2 | Collapsed (icons) | Drawer menu |
| **Desktop** | > 1024px | 3+ | Expanded (240px) | Full sidebar |

### Exemplos

```tsx
// Mobile: 1 col, Tablet: 2 cols, Desktop: 3 cols
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {/* Cards */}
</div>

// Mobile: hidden, Desktop: visible
<aside className="hidden lg:block w-240 bg-white">
  {/* Sidebar */}
</aside>

// Mobile: top, Desktop: left
<div className="flex flex-col lg:flex-row gap-6">
  {/* Main + Sidebar */}
</div>

// Mobile: 100%, Tablet: 90%, Desktop: 80%
<div className="w-full md:w-11/12 lg:w-4/5 mx-auto">
  {/* Centered content */}
</div>
```

---

## 6. Spacing System

Baseado em grid de 4px.

| Unidade | Pixel | Uso |
|---------|-------|-----|
| **xs** | 4px | Tiny gaps, inline |
| **sm** | 8px | Small gaps, inner padding |
| **md** | 16px | Default gap, padding |
| **lg** | 24px | Card padding, larger gaps |
| **xl** | 32px | Section padding |
| **2xl** | 48px | Large section padding |
| **3xl** | 64px | Hero section padding |
| **4xl** | 80px | Page section padding |

### Exemplos

```tsx
// Card padding: lg (24px)
<Card className="p-6">

// Section padding: 4xl vertical (80px), md horizontal (16px)
<section className="py-20 px-4 md:px-6">

// Grid gap: md (16px) to lg (24px)
<div className="grid gap-4 md:gap-6">

// Flex gap: sm (8px)
<div className="flex gap-2">
```

---

## 7. Componentes Custom (PMB-Specific)

### Course Card

```tsx
<div className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
  {/* Image */}
  <img
    src={course.image}
    alt={course.name}
    className="w-full h-48 object-cover"
  />

  {/* Content */}
  <div className="p-6">
    <h3 className="text-lg font-semibold text-gray-900 mb-2">
      {course.name}
    </h3>
    <p className="text-sm text-gray-600 mb-4 line-clamp-2">
      {course.description}
    </p>

    {/* Price & CTA */}
    <div className="flex items-center justify-between">
      <span className="text-2xl font-bold text-gray-900 font-mono">
        R$ {formatPrice(course.price)}
      </span>
      <Button size="sm" className="bg-blue-600">
        Comprar
      </Button>
    </div>
  </div>
</div>
```

### Order Status Badge

```tsx
const statusConfig = {
  pending: {
    bg: "bg-yellow-100",
    text: "text-yellow-800",
    label: "Pendente",
  },
  approved: {
    bg: "bg-green-100",
    text: "text-green-800",
    label: "Aprovado",
  },
  failed: {
    bg: "bg-red-100",
    text: "text-red-800",
    label: "Falhou",
  },
  refunded: {
    bg: "bg-gray-100",
    text: "text-gray-800",
    label: "Reembolsado",
  },
};

<Badge className={`${statusConfig[status].bg} ${statusConfig[status].text}`}>
  {statusConfig[status].label}
</Badge>
```

### Sidebar Item

```tsx
<Link
  href={item.href}
  className={`
    px-4 py-3 flex items-center gap-3 rounded-lg
    transition-colors
    ${isActive
      ? "bg-blue-50 text-blue-600 font-semibold"
      : "text-gray-700 hover:bg-gray-100"
    }
  `}
>
  {item.icon && <item.icon className="h-5 w-5" />}
  <span>{item.label}</span>
</Link>
```

---

## 8. Data Visualization

### Charts (Recharts)

```tsx
<ResponsiveContainer width="100%" height={300}>
  <LineChart data={data}>
    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
    <XAxis dataKey="date" stroke="#6b7280" />
    <YAxis stroke="#6b7280" />
    <Tooltip
      contentStyle={{
        backgroundColor: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
      }}
    />
    <Legend />
    <Line
      type="monotone"
      dataKey="revenue"
      stroke="#3b82f6"
      strokeWidth={2}
      dot={{ fill: "#3b82f6" }}
    />
    <Line
      type="monotone"
      dataKey="orders"
      stroke="#10b981"
      strokeWidth={2}
      dot={{ fill: "#10b981" }}
    />
  </LineChart>
</ResponsiveContainer>
```

### Color Scheme for Charts

- Primary: #3B82F6 (Electric Blue)
- Secondary: #10B981 (Success Green)
- Tertiary: #F59E0B (Warning Orange)
- Quaternary: #8B5CF6 (Purple)

---

## 9. Accessibility & Best Practices

### WCAG 2.1 AA Compliance

- Contraste mínimo: 4.5:1 para text, 3:1 para UI components
- Todos os inputs devem ter labels (visível ou aria-label)
- Keyboard navigation suportado
- Não depender de cor sozinha para comunicar informação
- Focus indicators visíveis (ring-2 ring-blue-500)

### Exemplo Acessível

```tsx
<div className="space-y-4">
  {/* Label visível */}
  <Label htmlFor="email">Email</Label>
  <Input
    id="email"
    type="email"
    aria-label="Email address"
    aria-required="true"
    className="focus:ring-2 focus:ring-blue-500 focus:outline-none"
  />

  {/* Status combinado com ícone e texto */}
  <div className="flex items-center gap-2 text-red-600">
    <AlertCircle className="h-4 w-4" aria-hidden="true" />
    <span id="email-error">Email inválido</span>
  </div>
</div>
```

---

## 10. Dark Mode (Preparação Futura)

Estrutura para suporte a dark mode (não ativo agora):

```typescript
// tailwind.config.ts
module.exports = {
  darkMode: 'class', // class ou 'media'
  // ...
};

// Uso
<div className="bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-50">
  Content
</div>
```

---

## 11. Animações & Transitions

### Padrões

```tsx
// Fade in
className="transition-opacity duration-200 opacity-0 data-[loaded]:opacity-100"

// Slide in (drawer)
className="transform transition-all duration-300 translate-x-full data-[open]:translate-x-0"

// Bounce (subtle)
className="transition-transform duration-200 hover:scale-105"

// Loading spinner
className="animate-spin h-4 w-4"

// Pulse (highlight)
className="animate-pulse bg-gray-200"
```

### Timing

- **Micro interactions**: 100-150ms
- **Page transitions**: 200-300ms
- **Modals**: 300-400ms
- **Drawer**: 300-400ms

---

## Checklist de Implementação

Ao construir uma tela, verificar:

- [ ] Tipografia hierárquica correta (H1, H2, H3, body)
- [ ] Cores de acordo com paleta (primary, secondary, text)
- [ ] Componentes shadcn/ui usados corretamente
- [ ] Layout responsivo (mobile, tablet, desktop testados)
- [ ] Spacing consistente (múltiplos de 4px)
- [ ] Loading states visíveis
- [ ] Error states com mensagens claras
- [ ] Badges de status coloridas e acessíveis
- [ ] Focus indicators visíveis
- [ ] Labels em todos os inputs
- [ ] Nenhuma informação comunicada só por cor
- [ ] Contraste 4.5:1 em texto crítico

---

## Resumo

O design system PMB é:

- **Tipografia**: Satoshi (headings), body 16px, mono para preços
- **Cores**: Canvas #FAFAFA, Surface #FFF, Primary Blue #3B82F6
- **Componentes**: shadcn/ui com customizações mínimas
- **Layouts**: Sidebar admin, full-width loja, split auth
- **Responsive**: Mobile-first, tablets, desktops
- **Spacing**: Grid 4px, padding 24px (cards)
- **Animações**: Subtle, <300ms
- **Accessibility**: WCAG AA, contrast 4.5:1

Use este guia em TODAS as novas telas.
