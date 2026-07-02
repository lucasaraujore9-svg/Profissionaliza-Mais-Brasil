/**
 * Substituição dos tokens dinâmicos dos itens do trust-bar (barra de benefícios).
 *
 * Os textos dos itens vêm da config das HomeSections (DB) e podem conter tokens
 * resolvidos por unidade em runtime — assim a mesma linha global (pmb-trustbar)
 * serve todas as vitrines, personalizada por tenant:
 *  - `{{semJuros}}`          → nº de parcelas sem juros da unidade/PMB (ver
 *    `interestFreePhrase`). Só substitui quando há texto; sem texto o token fica
 *    literal (comportamento herdado — nunca ocorre pois a frase tem fallback).
 *  - `{{horarioAtendimento}}` → Horário de atendimento da unidade
 *    (`Tenant.supportHours`). Vazio quando não configurado — o chamador esconde
 *    a linha se o resultado ficar vazio (igual ao rodapé da vitrine).
 */
export function substituteTrustTokens(
  text: string,
  tokens: { semJurosText?: string; supportHoursText?: string | null },
): string {
  let out = text
  if (tokens.semJurosText) {
    out = out.replaceAll("{{semJuros}}", tokens.semJurosText)
  }
  out = out.replaceAll("{{horarioAtendimento}}", tokens.supportHoursText ?? "")
  return out
}
