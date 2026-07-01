/**
 * Tema dos gráficos de BI. Espelha os tokens de `src/app/globals.css`
 * (`--color-pmb-*`) como hex JS, porque o Recharts precisa dos valores
 * concretos para `<Cell/>`, legendas e tooltips renderizados em portais fora
 * do escopo das CSS vars. Import-safe (sem Recharts) — pode ser usado no
 * servidor e nos wrappers de skeleton.
 */
export const PMB = {
  green: "#025918", // --color-pmb-green
  green700: "#014712", // --color-pmb-green-700
  green900: "#012e0b", // --color-pmb-green-900
  gold: "#F2B705", // --color-pmb-gold
  gold600: "#D9A304", // --color-pmb-gold-600
  lime: "#C0D904", // --color-pmb-lime
  cyan: "#07B2D9", // --color-pmb-cyan
  cyan700: "#066F87", // --color-pmb-cyan-700
  terracotta: "#8C3A27", // --color-pmb-terracotta
  mist: "#F4F4EE", // --color-pmb-mist
  grid: "#EEF0EC",
  axis: "#9CA3AF",
  positive: "#025918",
  negative: "#B91C1C",
} as const

/** Paleta cíclica das séries (ordem de leitura verde → dourado → lima → …). */
export const SERIES_PALETTE = [
  PMB.green,
  PMB.gold,
  PMB.lime,
  PMB.cyan,
  PMB.terracotta,
  PMB.green700,
] as const

export function seriesColor(index: number): string {
  return SERIES_PALETTE[index % SERIES_PALETTE.length]
}

export const axisProps = {
  stroke: PMB.axis,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const

export const gridProps = {
  stroke: PMB.grid,
  strokeDasharray: "3 3",
  vertical: false,
} as const
