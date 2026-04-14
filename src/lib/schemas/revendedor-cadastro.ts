import { z } from "zod"

const cpfRegex = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/
const cnpjRegex = /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/
const phoneRegex = /^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/

export const pessoalSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(3, "Informe seu nome completo")
    .max(120, "Nome muito longo"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Email inválido")
    .max(160, "Email muito longo"),
  telefone: z
    .string()
    .trim()
    .regex(phoneRegex, "Telefone inválido"),
  cpf: z
    .string()
    .trim()
    .regex(cpfRegex, "CPF inválido"),
})

export const empresaSchema = z.object({
  razaoSocial: z
    .string()
    .trim()
    .min(3, "Informe a razão social")
    .max(160, "Razão social muito longa"),
  fantasia: z
    .string()
    .trim()
    .min(2, "Informe o nome fantasia")
    .max(120, "Nome fantasia muito longo"),
  cnpj: z
    .string()
    .trim()
    .regex(cnpjRegex, "CNPJ inválido"),
  cidade: z
    .string()
    .trim()
    .min(2, "Informe a cidade e UF")
    .max(120, "Campo muito longo"),
})

export const pagamentoSchema = z.object({
  billingType: z.enum(["CREDIT_CARD", "PIX", "BOLETO"]),
})

export const cadastroRevendedorSchema = z.object({
  pessoal: pessoalSchema,
  empresa: empresaSchema,
  pagamento: pagamentoSchema,
  password: z
    .string()
    .min(8, "Senha precisa ter pelo menos 8 caracteres")
    .max(120, "Senha muito longa"),
})

export type CadastroRevendedorInput = z.infer<typeof cadastroRevendedorSchema>
export type PessoalInput = z.infer<typeof pessoalSchema>
export type EmpresaInput = z.infer<typeof empresaSchema>
export type PagamentoInput = z.infer<typeof pagamentoSchema>

export function stripDigits(value: string): string {
  return value.replace(/\D/g, "")
}
