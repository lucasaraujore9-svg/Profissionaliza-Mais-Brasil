// Tipos compartilhados de cupom. Mantidos FORA do módulo "use server"
// (preview.ts) porque um arquivo "use server" só deve exportar funções async —
// tipos vivem aqui e são importados por client e server sem violar a regra.

export type CouponScope =
  | { kind: "tenant"; tenantId: string }
  | { kind: "pmb" }

export interface CouponPreviewInput {
  code: string
  basePrice: number
  scope: CouponScope
}

export interface AppliedCouponPreview {
  code: string
  discountType: "PERCENTAGE" | "FIXED"
  discountValue: number
  discountAmount: number
  finalPrice: number
}

export type CouponPreviewResult =
  | { ok: true; coupon: AppliedCouponPreview }
  | { ok: false; error: string }
