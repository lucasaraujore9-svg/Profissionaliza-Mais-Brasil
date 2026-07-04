// Tipos COMPARTILHADOS do wizard de checkout de revendedor. Extraídos para um
// módulo folha (só tipos) para quebrar a dependência circular entre
// `checkout-wizard` (que importa os componentes de formulário) e cada formulário
// (que importava seu tipo de volta do wizard) — COD-004.

export type BillingType = "CREDIT_CARD" | "PIX" | "BOLETO"

export interface PessoalForm {
  nome: string
  email: string
  telefone: string
  cpf: string
  password: string
}

export interface EmpresaForm {
  razaoSocial: string
  fantasia: string
  cnpj: string
  cidade: string
}

export interface PagamentoForm {
  billingType: BillingType
}
