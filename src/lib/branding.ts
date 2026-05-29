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
  /** Email de atendimento (com fallback no @profissionalizamaisbrasil.com.br). */
  email: string
  /** Horario de atendimento. */
  hours: string
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

export function getSupportContacts(): SupportContacts {
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || FALLBACK_EMAIL
  const hours = process.env.NEXT_PUBLIC_SUPPORT_HOURS?.trim() || FALLBACK_HOURS
  const digits = normalizeDigits(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP)

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

  // Celular: gera link wa.me com DDI 55 quando necessario.
  const intlDigits = digits.startsWith("55") ? digits : `55${digits}`
  return {
    phoneLabel: formatBrCelular(digits),
    phoneUrl: `https://wa.me/${intlDigits}`,
    isWhatsapp: true,
    email,
    hours,
  }
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
