/**
 * SAAS-004 — invariante "curso sem valor não vende".
 *
 * A vitrine nunca exibe um curso com preço <= 0 (gate `price > 0` /
 * COURSE_HAS_PRICE em todas as listagens e no detalhe). Esta função aplica a
 * MESMA invariante no caminho de RECEITA (checkout da loja): mesmo que um
 * `TenantCourse` fique em estado inconsistente (`isVisible: true` + `price: 0`),
 * alcançável por id direto, o checkout não pode criar enrollment a R$0.
 *
 * Centralizada e pura para ser testável sem DB. Trata `NaN`, negativos, zero,
 * `null`/`undefined` e o caso de Decimal convertido para Number como "não
 * vendável".
 */
export function isSellablePrice(price: number | null | undefined): boolean {
  return typeof price === "number" && Number.isFinite(price) && price > 0
}
