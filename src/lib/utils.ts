import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parseia preço no formato brasileiro "R$ 1.299,90" para número.
 */
export function parseBRPrice(value: string): number {
  const cleaned = value
    .replace(/[R$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
  const parsed = parseFloat(cleaned)
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid BR price format: "${value}"`)
  }
  return parsed
}

/**
 * Formata número como moeda brasileira "R$ 1.299,90".
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

/**
 * Gera slug a partir de string (remove acentos, espaços, etc).
 */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
