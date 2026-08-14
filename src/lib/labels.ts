/**
 * Rótulos em pt-BR dos enums do Prisma que aparecem na interface.
 *
 * FONTE ÚNICA — nenhuma tela deve renderizar o valor cru do banco ("PENDING",
 * "ASAAS_PIX") nem redefinir o mapa localmente. Um valor fora do mapa cai no
 * próprio valor cru: é feio, mas é visível, e não esconde dado do usuário.
 *
 * Os rótulos são curtos de propósito — quase todos os pontos de uso são badges
 * dentro de tabelas.
 */
import type {
  EnrollmentStatus,
  PaymentGateway,
  PaymentStatus,
  PaymentType,
  ReferralCommissionStatus,
  ReferralPayoutMethod,
  ReferralPayoutStatus,
  TenantStatus,
} from "@prisma/client"
import type { StudentDisplayStatus } from "@/lib/students/display-status"

function labelFrom(
  map: Record<string, string>,
  value: string | null | undefined,
): string {
  if (!value) return "—"
  return map[value] ?? value
}

const STUDENT_STATUS_LABELS: Record<StudentDisplayStatus, string> = {
  ATIVO: "Ativo",
  INATIVO: "Inativo",
  BLOQUEADO: "Bloqueado",
  DEVEDOR: "Inadimplente",
  FORMADO: "Formado",
  INTERESSADO: "Interessado",
  // Derivado (não existe no banco): matrícula criada, pagamento não confirmado.
  PENDENTE: "Pendente",
}

/** Aceita `StudentDisplayStatus` — inclui o derivado "PENDENTE". */
export function studentStatusLabel(
  status: StudentDisplayStatus | string | null | undefined,
): string {
  return labelFrom(STUDENT_STATUS_LABELS, status)
}

const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  PENDING: "Pendente",
  ACTIVE: "Ativa",
  SUSPENDED: "Suspensa",
  CANCELLED: "Cancelada",
  COMPLETED: "Concluída",
}

export function enrollmentStatusLabel(
  status: EnrollmentStatus | string | null | undefined,
): string {
  return labelFrom(ENROLLMENT_STATUS_LABELS, status)
}

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Pendente",
  APPROVED: "Aprovado",
  REJECTED: "Recusado",
  REFUNDED: "Estornado",
  CANCELLED: "Cancelado",
  IN_PROCESS: "Em análise",
  CHARGED_BACK: "Chargeback",
}

export function paymentStatusLabel(
  status: PaymentStatus | string | null | undefined,
): string {
  return labelFrom(PAYMENT_STATUS_LABELS, status)
}

const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  ONE_TIME: "Único",
  MONTHLY: "Mensal",
  BOLETO_INSTALLMENT: "Carnê (boleto)",
  CARD_INSTALLMENT: "Parcelado no cartão",
}

export function paymentTypeLabel(
  type: PaymentType | string | null | undefined,
): string {
  return labelFrom(PAYMENT_TYPE_LABELS, type)
}

const PAYMENT_GATEWAY_LABELS: Record<PaymentGateway, string> = {
  MP: "Mercado Pago",
  ASAAS: "Asaas",
}

export function paymentGatewayLabel(
  gateway: PaymentGateway | string | null | undefined,
): string {
  return labelFrom(PAYMENT_GATEWAY_LABELS, gateway)
}

const REFERRAL_COMMISSION_STATUS_LABELS: Record<
  ReferralCommissionStatus,
  string
> = {
  PENDING: "Pendente",
  AVAILABLE: "Disponível",
  PAID: "Paga",
  CANCELLED: "Cancelada",
}

export function referralCommissionStatusLabel(
  status: ReferralCommissionStatus | string | null | undefined,
): string {
  return labelFrom(REFERRAL_COMMISSION_STATUS_LABELS, status)
}

const REFERRAL_PAYOUT_STATUS_LABELS: Record<ReferralPayoutStatus, string> = {
  REQUESTED: "Solicitado",
  PROCESSING: "Processando",
  PAID: "Pago",
  FAILED: "Falhou",
  CANCELLED: "Cancelado",
}

export function referralPayoutStatusLabel(
  status: ReferralPayoutStatus | string | null | undefined,
): string {
  return labelFrom(REFERRAL_PAYOUT_STATUS_LABELS, status)
}

const REFERRAL_PAYOUT_METHOD_LABELS: Record<ReferralPayoutMethod, string> = {
  ASAAS_PIX: "PIX",
  DESCONTO_MENSALIDADE: "Desconto na mensalidade",
  MANUAL: "Manual",
}

export function referralPayoutMethodLabel(
  method: ReferralPayoutMethod | string | null | undefined,
): string {
  return labelFrom(REFERRAL_PAYOUT_METHOD_LABELS, method)
}

/**
 * Status de uma UNIDADE (`TenantStatus`) ou de uma cobrança da mensalidade dela
 * no Asaas (`TenantPayment.status`, string livre vinda do gateway).
 *
 * Um mapa só, e não dois, porque a mesma badge (`ResellerStatusBadge`) renderiza
 * os dois — e "PENDING" quer dizer a mesma coisa nos dois contextos. Separá-los
 * obrigaria todo ponto de uso a saber de antemão qual dos dois está lendo.
 */
const TENANT_STATUS_LABELS: Record<string, string> = {
  // Unidade
  ACTIVE: "Ativo",
  PENDING: "Pendente",
  SUSPENDED: "Suspenso",
  CANCELLED: "Cancelado",
  // Cobrança da mensalidade no Asaas
  RECEIVED: "Pago",
  RECEIVED_IN_CASH: "Recebido em dinheiro",
  CONFIRMED: "Confirmado",
  OVERDUE: "Vencido",
  REFUNDED: "Estornado",
  DELETED: "Cancelado",
  DELETING: "Apagando…",
}

export function tenantStatusLabel(
  status: TenantStatus | string | null | undefined,
): string {
  return labelFrom(TENANT_STATUS_LABELS, status)
}
