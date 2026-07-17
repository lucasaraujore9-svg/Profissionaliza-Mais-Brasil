"use client"

import { useState } from "react"
import { OrderSummary, type OrderSummaryProps } from "./order-summary"
import { MpCheckoutForm } from "./mp-checkout-form"
import { AsaasCheckoutForm } from "./asaas-checkout-form"
import { PmbCheckoutForm } from "./pmb-checkout-form"
import { CouponField, type AppliedCoupon } from "./coupon-field"
import { previewCheckoutCoupon } from "@/lib/coupons/preview"
import type { CouponScope } from "@/lib/coupons/types"

/**
 * Wrapper CLIENT do checkout: detém o estado do cupom e alimenta tanto o
 * formulário de pagamento (couponCode → cobrança) quanto o resumo do pedido
 * (desconto/total ao vivo). Aplicar/remover cupom NÃO recarrega a página —
 * evita perder os dados já digitados no formulário — e o resumo atualiza na
 * hora. A revalidação/cálculo usa a Server Action `previewCheckoutCoupon`
 * (mesmo helper de desconto da cobrança), cobrindo curso/pacote e vitrine/PMB.
 */

type FormConfig =
  | {
      kind: "mp"
      publicKey: string
      /** Teto de parcelas oferecido no cartão (1 = à vista/mensal). Default 12. */
      maxInstallments?: number
      /** Parcelas sem juros anunciadas pela loja (informativo). */
      interestFreeInstallments?: number
      /** Endpoint dos payer_costs reais (revenda vs PMB). */
      installmentsPath?: string
      initPath?: string
      processPath?: string
      statusPath?: string
      confirmacaoPath?: string
    }
  | {
      kind: "asaas"
      initPath?: string
      processPath?: string
      statusPath?: string
      confirmacaoPath?: string
    }
  | {
      kind: "pmb"
      initPath?: string
      /** Curso com mensalidade: sem parcelamento adicional (cartão/boleto). */
      isMonthly?: boolean
    }

export interface CheckoutPanelProps {
  target: { courseId: string } | { packageId: string }
  couponScope: CouponScope
  basePrice: number
  initialCoupon: { code: string; discountAmount: number; finalPrice: number } | null
  form: FormConfig
  summary: Omit<OrderSummaryProps, "discountAmount" | "finalPrice" | "couponCode">
}

export function CheckoutPanel({
  target,
  couponScope,
  basePrice,
  initialCoupon,
  form,
  summary,
}: CheckoutPanelProps) {
  const [applied, setApplied] = useState<AppliedCoupon | null>(
    initialCoupon
      ? {
          code: initialCoupon.code,
          discountAmount: initialCoupon.discountAmount,
          finalPrice: initialCoupon.finalPrice,
          // discountType/value não são exibidos quando vêm da URL; o chip usa
          // discountAmount como fallback.
          discountType: "FIXED",
          discountValue: initialCoupon.discountAmount,
        }
      : null,
  )

  const courseId = "courseId" in target ? target.courseId : undefined
  const packageId = "packageId" in target ? target.packageId : undefined

  const discountAmount = applied?.discountAmount ?? 0
  const finalPrice = applied?.finalPrice ?? basePrice
  const couponCode = applied?.code ?? null

  async function validate(code: string) {
    return previewCheckoutCoupon({ code, basePrice, scope: couponScope })
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px] lg:gap-8">
      <div className="space-y-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
          <CouponField
            applied={applied}
            onApply={setApplied}
            onRemove={() => setApplied(null)}
            onValidate={validate}
          />
        </div>

        {form.kind === "mp" && (
          <MpCheckoutForm
            publicKey={form.publicKey}
            amount={finalPrice}
            maxInstallments={form.maxInstallments}
            interestFreeInstallments={form.interestFreeInstallments}
            installmentsPath={form.installmentsPath}
            courseId={courseId}
            packageId={packageId}
            couponCode={couponCode}
            initPath={form.initPath}
            processPath={form.processPath}
            statusPath={form.statusPath}
            confirmacaoPath={form.confirmacaoPath}
          />
        )}
        {form.kind === "asaas" && (
          <AsaasCheckoutForm
            courseId={courseId}
            packageId={packageId}
            couponCode={couponCode}
            initPath={form.initPath}
            processPath={form.processPath}
            statusPath={form.statusPath}
            confirmacaoPath={form.confirmacaoPath}
          />
        )}
        {form.kind === "pmb" && (
          <PmbCheckoutForm
            courseId={courseId}
            packageId={packageId}
            couponCode={couponCode}
            initPath={form.initPath}
            amount={finalPrice}
            isMonthly={form.isMonthly}
          />
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <OrderSummary
          {...summary}
          discountAmount={discountAmount}
          finalPrice={finalPrice}
          couponCode={couponCode}
        />
      </aside>
    </div>
  )
}
