// Tipo COMPARTILHADO das abas de configuração da unidade. Extraído para um
// módulo folha (só tipos) para quebrar a dependência circular entre `config-tabs`
// (que importa os componentes filhos AccountForm/BillingSection) e cada filho
// (que importava ConfigData de volta do pai) — COD-004.

export interface ConfigData {
  // cpf: 11 dígitos sem máscara (identificador alternativo de login) ou null.
  // phone: DDD + número, sem máscara, ou null.
  user: {
    id: string
    name: string
    email: string
    cpf: string | null
    phone: string | null
  }
  /** Administra a configuração da unidade (`configuracoes.manage`). */
  canManageUnit: boolean
  /** Configura o gateway/chave PIX da unidade (`gateway.manage`). */
  canManagePix: boolean
  /**
   * `null` para membros sem `configuracoes.manage`: a API não devolve o bloco
   * da unidade (gateway, mensalidade, parcelamento) para quem não o administra.
   */
  tenant: {
    id: string
    name: string
    slug: string
    billingMode: "AUTO" | "MANUAL"
    status: "PENDING" | "ACTIVE" | "SUSPENDED" | "CANCELLED"
    mpConnected: boolean
    mpWebhookConfigured: boolean
    mpPublicKeyConfigured: boolean
    mpWebhookUrl: string
    mpUserId: string | null
    monthlyAllowed: boolean
    monthlyEnabled: boolean
    monthlyScope: "DIRECT_ONLY" | "DIRECT_AND_VITRINE"
    interestFreeInstallments: number
    // Asaas como gateway de vendas da unidade — sempre disponível (não há mais
    // capability do Admin Master); estes campos só dizem o que ela já conectou.
    asaasConnected: boolean
    asaasWebhookConfigured: boolean
    asaasWebhookUrl: string
    salesGateway: "MP" | "ASAAS"
  } | null
}

/** Estreita `ConfigData` para o caso em que o bloco da unidade veio. */
export type ConfigDataWithTenant = ConfigData & {
  tenant: NonNullable<ConfigData["tenant"]>
}
