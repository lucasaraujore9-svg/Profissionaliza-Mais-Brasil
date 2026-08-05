import type { Prisma } from "@prisma/client"
import { activeCustomDomain, vitrineHost, vitrineUrl } from "@/lib/tenant/urls"
import { formatPhone } from "@/lib/validation/phone"

/**
 * Serialização da unidade (revenda) para a API de parceiros.
 *
 * Este arquivo é a FRONTEIRA de dados do /api/v1: o que não estiver na
 * `SELECT` abaixo não sai daqui. É allowlist, não denylist — campo novo no
 * `Tenant` não vaza sozinho para os parceiros.
 *
 * Deliberadamente FORA do payload:
 *   - Credenciais de gateway (mpAccessToken, asaasApiKey, webhook secrets) e
 *     qualquer id de cliente/assinatura no Asaas ou MP.
 *   - Dado financeiro da unidade: mensalidade, promoção, regras e faixas de
 *     comissão, PIX de recebimento. É contrato comercial entre PMB e unidade,
 *     não dado de identidade.
 *   - CPF completo do titular: sai mascarado (ver `mascararCpf`). Quem consulta
 *     POR CPF já tem o número; quem consulta por outro campo não passa a ter.
 *   - Hash de senha, tokens de reset, qualquer coisa de sessão.
 */

export const UNIDADE_SELECT = {
  id: true,
  name: true,
  slug: true,
  status: true,
  customDomain: true,
  domainVerified: true,
  logoUrl: true,
  faviconUrl: true,
  bannerUrl: true,
  primaryColor: true,
  secondaryColor: true,
  tagline: true,
  description: true,
  whatsapp: true,
  supportEmail: true,
  supportHours: true,
  instagram: true,
  facebook: true,
  youtube: true,
  tiktok: true,
  referralCode: true,
  automationEnabled: true,
  canSellResellers: true,
  tecnicaEnabled: true,
  tecnicaUrl: true,
  tecnicaLabel: true,
  ejaEnabled: true,
  ejaUrl: true,
  ejaLabel: true,
  activatedAt: true,
  createdAt: true,
  updatedAt: true,
  owner: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      cpf: true,
    },
  },
} satisfies Prisma.TenantSelect

export type UnidadeRecord = Prisma.TenantGetPayload<{
  select: typeof UNIDADE_SELECT
}>

export interface UnidadePayload {
  id: string
  nome: string
  slug: string
  status: string
  ativa: boolean
  codigoIndicacao: string
  dominio: {
    subdominio: string
    urlSubdominio: string
    proprio: string | null
    proprioVerificado: boolean
    /** URL canônica da vitrine: domínio próprio quando existe, senão o subdomínio. */
    url: string
  }
  contato: {
    whatsapp: string | null
    whatsappFormatado: string | null
    email: string | null
    horarioAtendimento: string | null
  }
  redesSociais: {
    instagram: string | null
    facebook: string | null
    youtube: string | null
    tiktok: string | null
  }
  identidadeVisual: {
    logoUrl: string | null
    faviconUrl: string | null
    bannerUrl: string | null
    corPrimaria: string
    corSecundaria: string
    tagline: string | null
    descricao: string | null
  }
  titular: {
    id: string
    nome: string
    email: string
    telefone: string | null
    telefoneFormatado: string | null
    /** Mascarado: só os 3 dígitos centrais. Ver comentário no topo do arquivo. */
    cpfMascarado: string | null
  } | null
  recursos: {
    automacao: boolean
    vendaDeRevendas: boolean
    unidadeTecnica: { habilitada: boolean; url: string | null; rotulo: string | null }
    eja: { habilitada: boolean; url: string | null; rotulo: string | null }
  }
  criadaEm: string
  ativadaEm: string | null
  atualizadaEm: string
}

export function serializarUnidade(tenant: UnidadeRecord): UnidadePayload {
  const subdominio = vitrineHost(tenant.slug)
  // `activeCustomDomain` (não `tenant.customDomain` cru): o domínio próprio só
  // entra na URL canônica depois de VERIFICADO. Entre o cadastro do domínio e o
  // apontamento do DNS/certificado ele existe na coluna mas não resolve — e este
  // payload é justamente a fonte com que o parceiro monta links para o público.
  // Mesma regra que o resto do sistema aplica a toda URL de saída (e-mails, SSO,
  // links da vitrine). O estado bruto continua visível em `dominio.proprio` +
  // `dominio.proprioVerificado`, para o parceiro que quiser acompanhar.
  const dominioProprioAtivo = activeCustomDomain(tenant)
  const url = dominioProprioAtivo
    ? `https://${dominioProprioAtivo}`
    : vitrineUrl(tenant.slug)

  return {
    id: tenant.id,
    nome: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    ativa: tenant.status === "ACTIVE",
    codigoIndicacao: tenant.referralCode,
    dominio: {
      subdominio,
      urlSubdominio: vitrineUrl(tenant.slug),
      proprio: tenant.customDomain,
      proprioVerificado: tenant.domainVerified,
      url,
    },
    contato: {
      whatsapp: tenant.whatsapp,
      whatsappFormatado: tenant.whatsapp ? formatPhone(tenant.whatsapp) : null,
      email: tenant.supportEmail,
      horarioAtendimento: tenant.supportHours,
    },
    redesSociais: {
      instagram: tenant.instagram,
      facebook: tenant.facebook,
      youtube: tenant.youtube,
      tiktok: tenant.tiktok,
    },
    identidadeVisual: {
      logoUrl: tenant.logoUrl,
      faviconUrl: tenant.faviconUrl,
      bannerUrl: tenant.bannerUrl,
      corPrimaria: tenant.primaryColor,
      corSecundaria: tenant.secondaryColor,
      tagline: tenant.tagline,
      descricao: tenant.description,
    },
    titular: tenant.owner
      ? {
          id: tenant.owner.id,
          nome: tenant.owner.name,
          email: tenant.owner.email,
          telefone: tenant.owner.phone,
          telefoneFormatado: tenant.owner.phone
            ? formatPhone(tenant.owner.phone)
            : null,
          cpfMascarado: mascararCpf(tenant.owner.cpf),
        }
      : null,
    recursos: {
      automacao: tenant.automationEnabled,
      vendaDeRevendas: tenant.canSellResellers,
      unidadeTecnica: {
        habilitada: tenant.tecnicaEnabled,
        url: tenant.tecnicaUrl,
        rotulo: tenant.tecnicaLabel,
      },
      eja: {
        habilitada: tenant.ejaEnabled,
        url: tenant.ejaUrl,
        rotulo: tenant.ejaLabel,
      },
    },
    criadaEm: tenant.createdAt.toISOString(),
    ativadaEm: tenant.activatedAt?.toISOString() ?? null,
    atualizadaEm: tenant.updatedAt.toISOString(),
  }
}

/**
 * `52998224725` → `***.982.247-**`. Confirma a identidade de quem já conhece o
 * documento sem entregar o número a quem não conhece.
 */
export function mascararCpf(cpf: string | null | undefined): string | null {
  if (!cpf) return null
  const digitos = cpf.replace(/\D/g, "")
  if (digitos.length !== 11) return null
  return `***.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-**`
}
