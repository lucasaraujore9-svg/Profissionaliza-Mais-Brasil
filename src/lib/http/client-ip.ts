/**
 * Extrai o IP do COMPRADOR a partir dos headers da request.
 *
 * Usado, sobretudo, como `remoteIp` nas chamadas de cartão do Asaas — que o
 * exige como "IP de onde o cliente está fazendo a compra. Não deve ser
 * informado o IP do seu servidor." (ver spec PaymentSaveWithCreditCardRequestDTO
 * e payWithCreditCard). Sem ele, a análise de risco do Asaas pode recusar a
 * captura do cartão.
 *
 * Estratégia: primeiro segmento de `x-forwarded-for` (cliente original na
 * cadeia de proxies da Vercel), caindo para `x-real-ip` e, por fim, `0.0.0.0`
 * quando nenhum header está presente (ex.: ambiente fora da Vercel). Mesmo
 * critério já provado no clientIp() da rota de pay-card.
 */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0].trim()
  return request.headers.get("x-real-ip") ?? "0.0.0.0"
}
