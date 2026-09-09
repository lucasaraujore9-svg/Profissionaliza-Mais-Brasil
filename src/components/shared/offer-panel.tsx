import Image from "next/image"
import Link from "next/link"

/**
 * A OFERTA — preco, parcelamento e o botao de comprar.
 *
 * Extraido de `course-detail-view.tsx` quando a pagina de venda passou a ter
 * duas formas (curso e e-book). O que muda entre elas e a PROMESSA (aulas x
 * paginas, certificado x arquivo); o que NAO pode mudar e o dinheiro: o "De R$",
 * o "Nx sem juros", o carne no boleto e a mensalidade sao a mesma conta e o
 * mesmo texto nas duas. Duas copias divergiriam no primeiro ajuste de preco — e
 * o lugar onde isso apareceria e a tela em que o aluno decide pagar.
 *
 * A LISTA DE BENEFICIOS nao esta aqui de proposito: ela e a promessa, e e
 * justamente o que cada tipo diz de diferente. Cada view monta a dela e a passa
 * em `features`.
 */

export interface OfferData {
  price: number
  originalPrice: number | null
  /** Nº de parcelas sem juros anunciado (pagamento unico). 1 = so a vista. */
  parcelas: number | null
  /** ONE_TIME = preco cheio; MONTHLY = mensalidade recorrente. */
  paymentType?: "ONE_TIME" | "MONTHLY"
  monthlyMonths?: number | null
  /** Carne no boleto ("ou em ate Nx de R$X"). Ausente = linha oculta. */
  boletoParcelas?: { n: number; valor: number } | null
}

export function formatBRL(value: number): string {
  if (value <= 0) return "Consulte"
  return `R$ ${value.toFixed(2).replace(".", ",")}`
}

/** Percentual de desconto quando ha "De R$" maior que o preco. null = sem promo. */
export function offerDiscount(o: OfferData): number | null {
  if (!o.originalPrice || o.originalPrice <= o.price) return null
  return Math.round(((o.originalPrice - o.price) / o.originalPrice) * 100)
}

function offerNumbers(o: OfferData) {
  const isMonthly = o.paymentType === "MONTHLY"
  const parcelas = o.parcelas ?? 1
  return {
    isMonthly,
    monthlyMonths: isMonthly ? o.monthlyMonths ?? 12 : null,
    parcelas,
    valorParcela: o.price > 0 ? o.price / parcelas : 0,
    boletoParcelas:
      !isMonthly && o.boletoParcelas && o.boletoParcelas.n > 1 ? o.boletoParcelas : null,
    desconto: offerDiscount(o),
  }
}

/** O cartao sticky da coluna direita: capa (no mobile), preco, CTA e beneficios. */
export function OfferPanel({
  offer,
  imageUrl,
  imageAlt,
  ctaHref,
  ctaLabel,
  secondaryCtaHref,
  secondaryCtaLabel,
  features,
  extraSlot,
}: {
  offer: OfferData
  imageUrl: string | null
  imageAlt: string
  ctaHref: string
  ctaLabel: string
  secondaryCtaHref?: string
  secondaryCtaLabel?: string
  features: React.ReactNode
  extraSlot?: React.ReactNode
}) {
  const { isMonthly, monthlyMonths, parcelas, valorParcela, boletoParcelas, desconto } =
    offerNumbers(offer)

  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <div className="overflow-hidden rounded-2xl border border-[rgba(2,89,24,0.1)] bg-white shadow-[0_20px_40px_-20px_rgba(2,89,24,0.25)]">
        {imageUrl && (
          <div className="relative aspect-video w-full overflow-hidden bg-[var(--color-pmb-mist)] lg:hidden">
            {/* Spacer em fluxo garante a altura 16:9 em engines antigos
                (iOS Safari ≤14) onde aspect-ratio colapsa sem conteudo em
                fluxo (o <Image fill> e position:absolute). */}
            <div aria-hidden className="pt-[56.25%]" />
            <Image
              src={imageUrl}
              alt={imageAlt}
              fill
              sizes="(min-width: 1024px) 360px, 100vw"
              className="object-cover"
            />
          </div>
        )}

        <div className="space-y-5 p-5">
          <div>
            {offer.originalPrice && offer.originalPrice > offer.price && (
              <p className="text-[13px] line-through text-[rgba(2,89,24,0.55)]">
                De {formatBRL(offer.originalPrice)}
              </p>
            )}
            <p className="text-[10.5px] font-bold uppercase tracking-widest text-[var(--color-pmb-gold-600)]">
              {desconto
                ? `Promoção · ${desconto}% OFF`
                : isMonthly
                  ? "Mensalidade"
                  : "Investimento"}
            </p>
            <p className="mt-1 text-[36px] font-black leading-none text-[var(--color-pmb-green)]">
              {formatBRL(offer.price)}
              {isMonthly && (
                <span className="ml-1 text-[16px] font-bold text-[rgba(2,89,24,0.6)]">
                  /mês
                </span>
              )}
            </p>
            {isMonthly && monthlyMonths ? (
              <p className="mt-1.5 text-[13px] text-[rgba(2,89,24,0.7)]">
                {monthlyMonths} mensalidades de {formatBRL(offer.price)}
              </p>
            ) : (
              offer.price > 0 &&
              parcelas > 1 && (
                <p className="mt-1.5 text-[13px] text-[rgba(2,89,24,0.7)]">
                  ou {parcelas}x de {formatBRL(valorParcela)} sem juros
                </p>
              )
            )}
            {boletoParcelas && offer.price > 0 && (
              <p className="mt-0.5 text-[13px] text-[rgba(2,89,24,0.7)]">
                ou em até {boletoParcelas.n}x de {formatBRL(boletoParcelas.valor)} no boleto
              </p>
            )}
          </div>

          <Link
            href={ctaHref}
            className="block w-full rounded-lg bg-[var(--color-pmb-gold)] px-4 py-3.5 text-center text-[14px] font-black text-[var(--color-pmb-green)] transition-colors hover:bg-[var(--color-pmb-gold-600)]"
          >
            {ctaLabel}
          </Link>
          {secondaryCtaHref && secondaryCtaLabel && (
            <Link
              href={secondaryCtaHref}
              className="block w-full rounded-lg border border-[rgba(2,89,24,0.18)] px-4 py-3 text-center text-[13px] font-bold text-[var(--color-pmb-green)] hover:border-[var(--color-pmb-green)]"
            >
              {secondaryCtaLabel}
            </Link>
          )}

          <ul className="space-y-2.5 border-t border-[rgba(2,89,24,0.08)] pt-4 text-[13px] text-[rgba(2,89,24,0.78)]">
            {features}
          </ul>

          {extraSlot}
        </div>
      </div>
    </aside>
  )
}

/**
 * A barra fixa do rodape no celular.
 *
 * Leigos nao rolam ate a coluna da direita — e no mobile ela fica no fim da
 * pagina. Sem esta barra, o preco e o botao de comprar so existiam depois de
 * toda a descricao.
 */
export function OfferStickyBar({
  offer,
  ctaHref,
  ctaLabel,
}: {
  offer: OfferData
  ctaHref: string
  ctaLabel: string
}) {
  const { isMonthly, parcelas, valorParcela, boletoParcelas, desconto } = offerNumbers(offer)

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[rgba(2,89,24,0.12)] bg-white shadow-[0_-8px_30px_-12px_rgba(2,89,24,0.25)] lg:hidden">
      <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          {desconto && (
            <span className="inline-block rounded-full bg-[var(--color-pmb-gold)]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-pmb-gold-600)]">
              {desconto}% OFF
            </span>
          )}
          <p className="truncate text-[18px] font-black leading-tight text-[var(--color-pmb-green)]">
            {formatBRL(offer.price)}
            {isMonthly && (
              <span className="ml-1 text-[12px] font-bold text-[rgba(2,89,24,0.6)]">/mês</span>
            )}
          </p>
          {isMonthly && offer.monthlyMonths ? (
            <p className="truncate text-[11px] text-[rgba(2,89,24,0.65)]">
              {offer.monthlyMonths} mensalidades
            </p>
          ) : offer.price > 0 && parcelas > 1 ? (
            <p className="truncate text-[11px] text-[rgba(2,89,24,0.65)]">
              ou {parcelas}x de {formatBRL(valorParcela)}
              {boletoParcelas ? ` · ${boletoParcelas.n}x no boleto` : ""}
            </p>
          ) : (
            boletoParcelas &&
            offer.price > 0 && (
              <p className="truncate text-[11px] text-[rgba(2,89,24,0.65)]">
                em até {boletoParcelas.n}x de {formatBRL(boletoParcelas.valor)} no boleto
              </p>
            )
          )}
        </div>
        <Link
          href={ctaHref}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-[var(--color-pmb-gold)] px-5 py-3 text-[14px] font-black text-[var(--color-pmb-green)] transition-colors hover:bg-[var(--color-pmb-gold-600)]"
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  )
}
