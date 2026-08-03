import { z } from "zod"
import { isValidCpf, stripCpf } from "@/lib/validation/cpf"
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
