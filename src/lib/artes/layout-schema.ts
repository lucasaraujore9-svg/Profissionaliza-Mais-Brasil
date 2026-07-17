import { z } from "zod"
import type { ArtLayout } from "./types"

// Schema Zod do ArtLayout (espelho dos tipos em types.ts) — usado nas rotas
// admin (create/PATCH) e no parse defensivo do JSONB vindo do banco.

const rel = z.number().min(0).max(1)

const logoPlacementSchema = z.object({
  cx: rel,
  cy: rel,
  w: z.number().min(0.04).max(0.9),
  h: z.number().min(0.02).max(0.9),
  bg: z.boolean(),
  pad: z.number().min(0).max(0.6).optional(),
})

const pricePlacementSchema = z.object({
  cx: rel,
  cy: rel,
  scale: z.number().min(0.5).max(2.5),
  pad: z.number().min(0.3).max(3).optional(),
  bgColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  textColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
})

const footerPlacementSchema = z.object({
  cx: rel,
  cy: rel,
  w: z.number().min(0.3).max(1),
})

export const variantLayoutSchema = z.object({
  logo: logoPlacementSchema,
  price: pricePlacementSchema.optional(),
  footer: footerPlacementSchema.optional(),
  footerBg: z.boolean(),
  // Hex #rrggbb; ausente = cor automatica.
  footerColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  footerPad: z.number().min(0).max(2).optional(),
})

export const artLayoutSchema = z.object({
  feed: variantLayoutSchema,
  story: variantLayoutSchema.optional(),
})

// Parse defensivo do JSONB do banco: lixo/formato antigo vira null (a pagina
// do painel cai nos defaults em vez de quebrar).
export function parseArtLayout(value: unknown): ArtLayout | null {
  if (!value || typeof value !== "object") return null
  const parsed = artLayoutSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
