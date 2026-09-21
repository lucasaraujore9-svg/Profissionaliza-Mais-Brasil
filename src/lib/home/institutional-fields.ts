import type { InstitutionalVariant } from "./sections"

/**
 * Quais campos do `InstitutionalConfig` CADA variante realmente renderiza.
 *
 * Existe porque o editor da vitrine mostrava os mesmos campos para todas as
 * variantes, e a barra de benefícios (`trust_bar`) desenhava só os selos: três
 * unidades escreveram título, subtítulo e um texto de anúncio inteiro lá e nada
 * apareceu na home. Campo que a tela oferece e o render ignora é uma promessa
 * falsa — o dono salva, confere e não entende.
 *
 * Fonte única dos DOIS lados: o editor (`InstitutionalEditor`) desenha só o que
 * está marcado aqui, e há teste de paridade com o que os renderers leem. Módulo
 * PURO (sem Prisma) porque o editor é um componente de cliente.
 */
export interface InstitutionalFieldSet {
  title: boolean
  subtitle: boolean
  body: boolean
  button: boolean
  secondaryButton: boolean
  items: boolean
}

export const INSTITUTIONAL_FIELDS: Record<
  InstitutionalVariant,
  InstitutionalFieldSet
> = {
  // Cabeçalho opcional acima dos selos + os selos.
  trust_bar: {
    title: true,
    subtitle: true,
    body: true,
    button: false,
    secondaryButton: false,
    items: true,
  },
  learn_anywhere: {
    title: true,
    subtitle: true,
    body: true,
    button: true,
    secondaryButton: false,
    items: true,
  },
  // Os depoimentos SÃO os itens: sem item nenhum a seção não renderiza.
  testimonials: {
    title: true,
    subtitle: true,
    body: true,
    button: false,
    secondaryButton: false,
    items: true,
  },
  final_cta: {
    title: true,
    subtitle: true,
    body: true,
    button: true,
    secondaryButton: true,
    items: false,
  },
  benefits: {
    title: true,
    subtitle: true,
    body: false,
    button: false,
    secondaryButton: false,
    items: true,
  },
  custom: {
    title: true,
    subtitle: true,
    body: true,
    button: true,
    secondaryButton: false,
    items: false,
  },
}

/**
 * Ícones que os blocos institucionais aceitam. É a lista que o editor oferece
 * no select — tem de ser exatamente as chaves do `ICON_MAP` do renderer (há
 * teste), senão o dono escolhe um ícone que a home descarta em silêncio.
 */
export const INSTITUTIONAL_ICON_NAMES = [
  "Award",
  "Banknote",
  "CalendarDays",
  "ShieldCheck",
  "Smartphone",
  "MessageCircle",
  "Clock",
  "Infinity",
  "Quote",
  "Users",
] as const

export type InstitutionalIconName = (typeof INSTITUTIONAL_ICON_NAMES)[number]

/** Rótulo em português para o select de ícones. */
export const INSTITUTIONAL_ICON_LABEL: Record<string, string> = {
  Award: "Selo / certificado",
  Banknote: "Dinheiro / pagamento",
  CalendarDays: "Calendário / prazo",
  ShieldCheck: "Escudo / garantia",
  Smartphone: "Celular",
  MessageCircle: "Mensagem / suporte",
  Clock: "Relógio / carga horária",
  Infinity: "Infinito / acesso vitalício",
  Quote: "Aspas / depoimento",
  Users: "Pessoas / comunidade",
}

/** Máximo de itens por bloco — espelha o MAX_ITEMS do validador do servidor. */
export const INSTITUTIONAL_MAX_ITEMS = 16
