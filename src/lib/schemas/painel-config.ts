import { z } from "zod"
import { isValidCpf, stripCpf } from "@/lib/validation/cpf"
import { isValidCnpj, stripCnpj } from "@/lib/validation/cnpj"
import { isValidPhone, normalizePhone } from "@/lib/validation/phone"

// Schema do PUT /api/painel/config (aba "Dados da conta" do painel).
// Extraído do route handler para ser testável (route.ts só pode exportar
// handlers/route config no App Router).
export const painelConfigUpdateSchema = z.object({
  name: z.string().trim().min(3, "Nome muito curto").max(120),
  email: z.string().trim().toLowerCase().email("Email inválido").max(160),
  companyName: z.string().trim().min(2).max(160),
  // CPF do titular — identificador alternativo de login (User.cpf). Opcional
  // (contas antigas não têm) e apagável (string vazia → null). Normalizado
  // para 11 dígitos sem máscara, mesma forma que o authorize consulta.
  cpf: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? stripCpf(v) : null))
    .refine((v) => v === null || isValidCpf(v), "CPF inválido"),
  // CNPJ da EMPRESA da unidade (Tenant.cnpj) — separado do CPF acima, que e
  // login de pessoa fisica e nunca aceita CNPJ. Ausente = nao mexe (membro sem
  // `configuracoes.manage` nem ve o campo); vazio = apaga.
  cnpj: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? stripCnpj(v) : null))
    .refine((v) => v == null || isValidCnpj(v), "CNPJ inválido"),
  razaoSocial: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null)),
  // Telefone de contato (User.phone) — coletado no cadastro da unidade e, até
  // agora, sem nenhuma tela onde pudesse ser conferido ou corrigido. Opcional e
  // apagável (string vazia → null); normalizado para DDD + número.
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || isValidPhone(v), "Telefone inválido")
    .transform((v) => (v === null ? null : normalizePhone(v))),
})

export type PainelConfigUpdateInput = z.infer<typeof painelConfigUpdateSchema>
