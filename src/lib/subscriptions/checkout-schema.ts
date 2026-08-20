import { z } from "zod"
import {
  withGuardianRule,
  guardianShape,
  nascimentoField,
} from "@/lib/students/guardian"
import { isValidCpf, stripCpf } from "@/lib/validation/cpf"
import { isValidPhone, normalizePhone } from "@/lib/validation/phone"

/**
 * Contrato de entrada da contratacao de assinatura na vitrine PMB.
 *
 * Mora num modulo proprio (e nao dentro do route handler) para que o TESTE
 * importe o MESMO schema que a rota usa. Enquanto ele vivia no arquivo da rota,
 * o teste precisava recriar o objeto — e um schema recriado nao protege a rota:
 * foi assim que a falta de `nascimento` passou pela suite inteira e derrubou
 * TODA contratacao com 400.
 */

export const subscriptionCardSchema = z.object({
  holderName: z.string().trim().min(3).max(160),
  number: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= 13 && v.length <= 19, "Número do cartão inválido"),
  expiryMonth: z.string().regex(/^(0[1-9]|1[0-2])$/, "Mês inválido"),
  expiryYear: z
    .string()
    .regex(/^\d{2}(\d{2})?$/, "Ano inválido")
    .transform((v) => (v.length === 2 ? `20${v}` : v)),
  ccv: z.string().regex(/^\d{3,4}$/, "CCV inválido"),
})

export const subscriptionCardHolderSchema = z.object({
  postalCode: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 8, "CEP inválido"),
  addressNumber: z.string().trim().min(1).max(20),
  addressComplement: z.string().trim().max(60).optional(),
})

/**
 * `nascimento` do ALUNO e obrigatorio: e o unico jeito de saber quem e menor.
 * Quando indicar menor de 18, `withGuardianRule` exige o bloco do RESPONSAVEL
 * FINANCEIRO — a cobranca recorrente sai no CPF dele e o certificado continua
 * saindo no nome do aluno.
 */
export const subscriptionCheckoutSchema = withGuardianRule(
  z.object({
    ...guardianShape,
    // NAO REMOVER: sem esta linha o zod faz strip de `nascimento` (objeto
    // .strip() por padrao) e o refine recusa toda contratacao.
    nascimento: nascimentoField,
    planId: z.string().min(1),
    nome: z.string().trim().min(3).max(160),
    email: z.string().email().toLowerCase().trim(),
    cpf: z.string().trim().refine(isValidCpf, "CPF inválido").transform(stripCpf),
    fone: z
      .string()
      .trim()
      .refine(isValidPhone, "Telefone inválido")
      .transform(normalizePhone),
    endereco: z.string().trim().max(300).optional(),
    paymentMethod: z.enum(["PIX", "BOLETO", "CREDIT_CARD"]),
    creditCard: subscriptionCardSchema.optional(),
    creditCardHolder: subscriptionCardHolderSchema.optional(),
    /**
     * Token do cartao gerado no BROWSER (SDK do Mercado Pago). So a vitrine de
     * unidade que usa MP manda isto — a recorrencia do MP exige o token e nunca
     * ve o PAN. No Asaas o cartao trafega pelo nosso servidor (o Asaas nao tem
     * tokenizacao no browser), entao ali vem `creditCard`.
     */
    cardToken: z.string().trim().min(1).max(200).optional(),
    acceptedTerms: z.literal(true),
  }),
)

/**
 * Mesma forma na vitrine da REVENDA. Separado por clareza de nome, mas o objeto
 * e identico de proposito: o que muda entre as duas lojas e a CONTA que recebe
 * e o catalogo do plano, nunca o que se pede ao aluno.
 */
export const resellerSubscriptionCheckoutSchema = subscriptionCheckoutSchema
