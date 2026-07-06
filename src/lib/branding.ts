/**
 * Configuracao central de contato/branding publico.
 *
 * As envs sao opcionais: se nao definidas, os componentes que renderizam
 * contato escondem o item (preferivel a expor placeholder "(11) 4000-0000"
 * ou link wa.me inexistente).
 *
 * O numero em NEXT_PUBLIC_SUPPORT_WHATSAPP pode ser:
 *   - 0800 nacional (`0800...`): tratado como telefone (link `tel:`),
 *     icone de fone e label "Telefone" — WhatsApp nao aceita 0800.
 *   - Celular brasileiro (com ou sem DDI 55): gera link wa.me e usa label
 *     "WhatsApp".
 */

function normalizeDigits(value: string | undefined): string | null {
  if (!value) return null
  const digits = value.replace(/\D/g, "")
  return digits.length >= 10 ? digits : null
}

export interface SupportContacts {
  /** Numero formatado para exibicao (ex: "0800 441 4321" ou "(11) 99999-9999"). */
  phoneLabel: string | null
  /** Link clicavel — wa.me para celular, tel: para 0800/fixo. */
  phoneUrl: string | null
  /** `true` quando o numero gera link wa.me; `false` quando e telefone tel:. */
  isWhatsapp: boolean
  /** Email de atendimento. `null` esconde a linha (vitrine sem e-mail proprio). */
  email: string | null
  /** Horario de atendimento. `null` esconde a linha. */
  hours: string | null
}

const FALLBACK_EMAIL = "atendimento@profissionalizamaisbrasil.com.br"
const FALLBACK_HOURS = "Segunda a sábado, 8h às 20h"

function format0800(digits: string): string {
  // Formatos comuns: 0800 + 3-7 digitos. Normalizamos como 0800 XXX XXXX.
  const tail = digits.slice(4)
  if (tail.length === 7) {
    return `0800 ${tail.slice(0, 3)} ${tail.slice(3)}`
  }
  if (tail.length === 8) {
    return `0800 ${tail.slice(0, 4)} ${tail.slice(4)}`
  }
  if (tail.length === 6) {
    return `0800 ${tail.slice(0, 2)} ${tail.slice(2)}`
  }
  return `0800 ${tail}`
}

function formatBrCelular(digits: string): string {
  // Remove DDI 55 quando presente. Suporta 10 (fixo) ou 11 (celular).
  const local =
    digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  }
  return local
}

/**
 * Monta `SupportContacts` a partir de um telefone/whatsapp livre + email +
 * horario. Sem fallback PMB: campos vazios viram `null` e somem do rodape.
 * Usado tanto pela PMB (via `getSupportContacts`, com fallbacks de env) quanto
 * pela vitrine do revendedor (`buildTenantSupportContacts`, dados do tenant).
 */
function buildSupportContacts(input: {
  phone: string | null | undefined
  email: string | null | undefined
  hours: string | null | undefined
}): SupportContacts {
  const email = input.email?.trim() || null
  const hours = input.hours?.trim() || null
  const digits = normalizeDigits(input.phone ?? undefined)

  if (!digits) {
    return { phoneLabel: null, phoneUrl: null, isWhatsapp: false, email, hours }
  }

  // 0800: telefone fixo, nao WhatsApp.
  if (digits.startsWith("0800")) {
    return {
      phoneLabel: format0800(digits),
      phoneUrl: `tel:${digits}`,
      isWhatsapp: false,
      email,
      hours,
    }
  }

  // Celular: gera link wa.me com DDI 55 quando necessario. Reusa
  // `whatsappIntlNumber` (mesma normalizacao do FAB da vitrine) para os dois
  // botoes de WhatsApp da loja concordarem — inclusive em DDD 55 (RS), onde a
  // heuristica antiga `startsWith("55")` tratava o DDD como DDI e quebrava o link.
  const intlDigits =
    whatsappIntlNumber(digits) ?? (digits.startsWith("55") ? digits : `55${digits}`)
  return {
    phoneLabel: formatBrCelular(digits),
    phoneUrl: `https://wa.me/${intlDigits}`,
    isWhatsapp: true,
    email,
    hours,
  }
}

export function getSupportContacts(): SupportContacts {
  return buildSupportContacts({
    phone: process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP,
    email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || FALLBACK_EMAIL,
    hours: process.env.NEXT_PUBLIC_SUPPORT_HOURS?.trim() || FALLBACK_HOURS,
  })
}

/**
 * Contatos do rodape da vitrine do revendedor. Usa exclusivamente os dados do
 * tenant — nunca cai nos contatos da PMB (evita "vazar" o atendimento do
 * sistema mae na loja da unidade). Linhas sem dado simplesmente nao aparecem.
 */
export function buildTenantSupportContacts(tenant: {
  whatsapp?: string | null
  supportEmail?: string | null
  supportHours?: string | null
}): SupportContacts {
  return buildSupportContacts({
    phone: tenant.whatsapp,
    email: tenant.supportEmail,
    hours: tenant.supportHours,
  })
}

/**
 * Converte um numero livre para o formato internacional que o `wa.me` espera
 * (so digitos, com DDI). Diferente do rodape (`buildSupportContacts`, que trata
 * 0800/fixo como telefone `tel:`), aqui NAO ha essa distincao: o WhatsApp
 * Business aceita linha fixa e 0800, entao geramos o link para qualquer numero
 * valido. Regras (a 1a que casar vence):
 *   - Prefixo de discagem internacional "00" (ex.: 00 1 555… nos EUA): o que
 *     segue ja e internacional (DDI + assinante) — remove so o "00".
 *   - Ja internacional (DDI 55 + DDD + numero, >= 12 digitos): usa como esta.
 *   - Tronco nacional "0" (0800, ou DDD discado com 0): remove os zeros iniciais
 *     e acrescenta o DDI 55.
 *   - Numero nacional COM DDD (fixo 10 / celular 11 digitos): acrescenta o DDI 55.
 * Exige DDD: um numero curto demais (sem DDD, < 10 digitos nacionais) nao gera
 * link — retorna `null` e o FAB some, em vez de emitir um `wa.me` quebrado.
 * Alinha-se ao piso de 10 digitos do rodape (`normalizeDigits`).
 */
export function whatsappIntlNumber(
  raw: string | null | undefined,
): string | null {
  const digits = (raw ?? "").replace(/\D/g, "")
  // Discagem internacional "00" + DDI + numero: mantem so a parte internacional.
  if (digits.startsWith("00")) {
    const intl = digits.slice(2)
    return intl.length >= 10 ? intl : null
  }
  // Ja internacional com DDI 55 (2 + DDD 2 + 8/9 do assinante = 12/13 digitos).
  if (digits.startsWith("55") && digits.length >= 12) return digits
  // Tronco nacional "0" (0800 ou DDD discado com 0): remove zeros, vira DDI 55.
  if (digits.startsWith("0")) {
    const national = digits.replace(/^0+/, "")
    return national.length >= 10 ? `55${national}` : null
  }
  // Nacional com DDD (fixo 10 / celular 11): acrescenta o DDI 55.
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`
  // Sem DDD (curto demais) ou comprimento improvavel: nao ha wa.me valido.
  return null
}

/**
 * Link `wa.me` para o botao flutuante de WhatsApp da vitrine, opcionalmente com
 * mensagem pre-preenchida (`?text=`). Retorna `null` quando nao ha numero
 * utilizavel. Ver `whatsappIntlNumber` para as regras de normalizacao.
 */
export function buildWhatsappLink(
  raw: string | null | undefined,
  message?: string | null,
): string | null {
  const intl = whatsappIntlNumber(raw)
  if (!intl) return null
  const text = message?.trim()
  return text
    ? `https://wa.me/${intl}?text=${encodeURIComponent(text)}`
    : `https://wa.me/${intl}`
}

export interface SocialLinks {
  instagram: string | null
  facebook: string | null
  youtube: string | null
  tiktok: string | null
}

// Instagram e Facebook sao perfis oficiais fixos da PMB — fixados no codigo
// para nao dependerem de env (que estava apontando para perfis errados em prod).
const PMB_INSTAGRAM_URL = "https://www.instagram.com/profissionaliza_maisbrasil"
const PMB_FACEBOOK_URL = "https://www.facebook.com/profissionalizamaisbrasil_oficial"

export function getSocialLinks(): SocialLinks {
  return {
    instagram: PMB_INSTAGRAM_URL,
    facebook: PMB_FACEBOOK_URL,
    youtube: process.env.NEXT_PUBLIC_YOUTUBE_URL?.trim() || null,
    tiktok: process.env.NEXT_PUBLIC_TIKTOK_URL?.trim() || null,
  }
}

/**
 * Normaliza um valor de rede social para uma URL absoluta clicavel.
 *
 * Os campos `instagram`/`facebook`/`youtube`/`tiktok` do tenant aceitam texto
 * livre na personalizacao da vitrine — o revendedor costuma digitar so o
 * `@usuario` ou `usuario`. Sem normalizar, `<a href="usuario">` resolveria
 * relativo ao dominio da vitrine (link quebrado). Aceita: URL completa, dominio
 * sem protocolo (`instagram.com/x`) ou handle (`@x` / `x`). Retorna null se
 * vazio.
 */
export function normalizeSocialUrl(
  value: string | null | undefined,
  platform: "instagram" | "facebook" | "youtube" | "tiktok",
): string | null {
  const v = value?.trim()
  if (!v) return null
  // Ja e URL absoluta.
  if (/^https?:\/\//i.test(v)) return v
  // Dominio sem protocolo (ex: "instagram.com/fulano", "youtube.com/@x").
  if (
    /^(?:www\.)?(?:instagram\.com|facebook\.com|fb\.com|youtube\.com|youtu\.be|tiktok\.com)\//i.test(
      v,
    )
  ) {
    return `https://${v.replace(/^www\./i, "")}`
  }
  // Handle solto: remove @ e barras das pontas.
  const handle = v.replace(/^@/, "").replace(/^\/+|\/+$/g, "")
  if (!handle) return null
  switch (platform) {
    case "instagram":
      return `https://www.instagram.com/${handle}`
    case "facebook":
      return `https://www.facebook.com/${handle}`
    case "youtube":
      // Handle moderno (sem barra) usa @ (youtube.com/@nome). Caminho legado
      // (channel/UC..., c/Nome, user/Nome) vai sem @ para não quebrar o link.
      return handle.includes("/")
        ? `https://www.youtube.com/${handle}`
        : `https://www.youtube.com/@${handle}`
    case "tiktok":
      // Perfis do TikTok sempre usam @ no caminho (tiktok.com/@nome).
      return `https://www.tiktok.com/@${handle}`
  }
}
