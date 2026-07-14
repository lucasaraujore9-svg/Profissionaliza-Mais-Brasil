// Tipo COMPARTILHADO das abas de configuração da unidade. Extraído para um
// módulo folha (só tipos) para quebrar a dependência circular entre `config-tabs`
// (que importa os componentes filhos AccountForm/BillingSection) e cada filho
// (que importava ConfigData de volta do pai) — COD-004.

export interface ConfigData {
  // cpf: 11 dígitos sem máscara (identificador alternativo de login) ou null.
  user: { id: string; name: string; email: string; cpf: string | null }
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
    // Asaas como gateway de vendas da unidade. asaasGatewayEnabled vem do Admin
    // Master; quando false, a seção Asaas nem é renderizada no painel.
    asaasGatewayEnabled: boolean
    asaasConnected: boolean
    asaasWebhookConfigured: boolean
    asaasWebhookUrl: string
    salesGateway: "MP" | "ASAAS"
  }
}
