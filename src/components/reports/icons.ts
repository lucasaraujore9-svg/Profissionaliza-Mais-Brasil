import { createElement, type ReactElement } from "react"
import {
  TrendingUp,
  Users,
  GraduationCap,
  Target,
  Receipt,
  DollarSign,
  Wallet,
  Percent,
  ShoppingCart,
  Store,
  Share2,
  Award,
  BookOpen,
  Tag,
  Inbox,
  Building2,
  CreditCard,
  AlertTriangle,
  CircleDollarSign,
  BarChart3,
  Repeat,
  UserPlus,
  CheckCircle2,
  Clock,
  type LucideIcon,
} from "lucide-react"

/**
 * Registro curado de ícones lucide usados pelos KPIs de BI. O payload só carrega
 * o NOME do ícone (string); o cliente mapeia aqui. Curado (em vez de
 * `import * as Icons`) para preservar o tree-shaking do bundle.
 */
export const REPORT_ICONS: Record<string, LucideIcon> = {
  "trending-up": TrendingUp,
  users: Users,
  "graduation-cap": GraduationCap,
  target: Target,
  receipt: Receipt,
  "dollar-sign": DollarSign,
  wallet: Wallet,
  percent: Percent,
  "shopping-cart": ShoppingCart,
  store: Store,
  "share-2": Share2,
  award: Award,
  "book-open": BookOpen,
  tag: Tag,
  inbox: Inbox,
  "building-2": Building2,
  "credit-card": CreditCard,
  "alert-triangle": AlertTriangle,
  "circle-dollar-sign": CircleDollarSign,
  "bar-chart-3": BarChart3,
  repeat: Repeat,
  "user-plus": UserPlus,
  "check-circle-2": CheckCircle2,
  clock: Clock,
}

export function resolveReportIcon(name?: string): LucideIcon | null {
  if (!name) return null
  return REPORT_ICONS[name] ?? null
}

/**
 * Renderiza um ícone do registro via `createElement` (não JSX com variável
 * capitalizada) para não violar `react-hooks/static-components` — o lint
 * interpreta `const Icon = resolve(...); <Icon/>` como componente criado no
 * render.
 */
export function renderReportIcon(
  name: string | undefined,
  className: string,
): ReactElement | null {
  const Comp = resolveReportIcon(name)
  return Comp ? createElement(Comp, { className }) : null
}
