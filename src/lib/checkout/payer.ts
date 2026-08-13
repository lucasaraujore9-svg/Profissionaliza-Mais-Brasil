import type { Prisma } from "@prisma/client"
import { hasGuardian } from "@/lib/students/guardian"

/**
 * QUEM PAGA — desacoplado de quem estuda.
 *
 * Ate aqui o pagador do Asaas/Mercado Pago saia direto de `student.nome` /
 * `student.cpf`. Como o gateway exige um adulto com CPF, o vendedor nao tinha
 * alternativa senao digitar a mae no campo do aluno — e o certificado, que le o
 * mesmo `Student`, saia no nome dela.
 *
 * Aqui a cobranca passa a olhar o RESPONSAVEL quando existe; o certificado e a
 * matricula continuam olhando o ALUNO. Nada em src/lib/certificates/ importa
 * este modulo, e ha teste garantindo isso.
 */

/**
 * O `select` minimo para decidir o pagador. Como `resolvePayer` so aceita
 * `PayerSource`, qualquer call site que carregue o Student com um select mais
 * estreito NAO COMPILA — o compilador substitui um teste estrutural.
 */
export const PAYER_SELECT = {
  id: true,
  nome: true,
  email: true,
  cpf: true,
  fone: true,
  responsavel: true,
  cpfResponsavel: true,
  responsavelEmail: true,
  responsavelFone: true,
  asaasCustomerId: true,
  responsavelAsaasCustomerId: true,
} satisfies Prisma.StudentSelect

export type PayerSource = Prisma.StudentGetPayload<{
  select: typeof PAYER_SELECT
}>

export interface PayerIdentity {
  kind: "STUDENT" | "GUARDIAN"
  nome: string
  cpf: string | null
  email: string | null
  fone: string | null
  /** Ja e o da COLUNA CERTA — nunca misturar aluno e responsavel aqui. */
  asaasCustomerId: string | null
  asaasExternalReference: string
}

/**
 * A regra e DATA-DRIVEN, nao CLOCK-DRIVEN: o responsavel vence se e somente se
 * `responsavel` + `cpfResponsavel` estao na ficha — nao "se o aluno e menor
 * hoje".
 *
 * POR QUE: o aluno que faz 18 no meio de um carne precisa continuar cobrando o
 * MESMO customer Asaas da cobranca em andamento. Uma regra baseada no relogio
 * trocaria o pagador no meio do parcelamento e deixaria assinatura orfa. Bonus:
 * fica testavel sem congelar o relogio.
 */
export function resolvePayer(student: PayerSource): PayerIdentity {
  if (hasGuardian(student)) {
    return {
      kind: "GUARDIAN",
      nome: student.responsavel!.trim(),
      cpf: student.cpfResponsavel,
      // Fallback para o contato do aluno so se o responsavel nao tiver: melhor
      // uma cobranca que chega no e-mail da familia do que uma que nao sai.
      email: student.responsavelEmail ?? student.email,
      fone: student.responsavelFone ?? student.fone,
      asaasCustomerId: student.responsavelAsaasCustomerId,
      // A chave de LOOKUP do Asaas e o cpfCnpj (findOrCreateAsaasCustomer
      // deduplica por ele); esta referencia e descritiva. Uma mae pagando por
      // dois filhos resolve para UM customer, que e o correto — o Asaas rejeita
      // dois customers com o mesmo CPF.
      asaasExternalReference: `guardian_${student.id}`,
    }
  }
  return {
    kind: "STUDENT",
    nome: student.nome,
    cpf: student.cpf,
    email: student.email,
    fone: student.fone,
    asaasCustomerId: student.asaasCustomerId,
    asaasExternalReference: `student_${student.id}`,
  }
}

/**
 * Em qual coluna gravar o `cus_` recem-criado. Escrever o customer do
 * responsavel em `asaasCustomerId` faria o aluno cobrar nele PARA SEMPRE,
 * inclusive depois dos 18 — e, como o codigo reusa o customer em cache, o erro
 * nunca seria detectado.
 */
export function asaasCustomerColumn(
  payer: PayerIdentity,
): "asaasCustomerId" | "responsavelAsaasCustomerId" {
  return payer.kind === "GUARDIAN"
    ? "responsavelAsaasCustomerId"
    : "asaasCustomerId"
}

/** `{ asaasCustomerId: id }` ou `{ responsavelAsaasCustomerId: id }`. */
export function asaasCustomerUpdate(
  payer: PayerIdentity,
  customerId: string,
): Prisma.StudentUpdateInput {
  return { [asaasCustomerColumn(payer)]: customerId }
}
