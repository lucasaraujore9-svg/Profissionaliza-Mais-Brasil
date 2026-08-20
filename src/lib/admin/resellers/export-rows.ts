/**
 * Montagem das abas da planilha de revendedores — PURO (recebe dados já lidos).
 *
 * Fica separado da rota para poder ser testado sem banco: o que quebra num
 * export não é a consulta, é a coluna que troca de lugar e passa a mostrar o
 * MRR de uma unidade na linha de outra. Aqui as três abas nascem do MESMO
 * objeto `ResellerExportUnit`, então uma unidade não pode aparecer numa aba e
 * sumir da outra.
 */
import { appUrl, vitrineUrl } from "@/lib/tenant/urls"
import { brDateTimeIso, brDayIso, utcDayIso } from "@/lib/dates"
import { tenantStatusLabel } from "@/lib/labels"
import {
  payUrlFor,
  situacaoCobranca,
  type TenantCharge,
} from "@/lib/tenant-billing/types"
import type { ExportCell, ExportColumn, ExportSheet } from "./export-types"

/** Contagem de alunos por `StudentStatus` (chaves cruas do enum). */
export type StudentStatusCounts = Record<string, number>

/**
 * Uma unidade com tudo que o export mostra dela. Achatado de propósito: a rota
 * junta as agregações (que vêm de `groupBy` separados) UMA vez, e as abas leem
 * daqui — em vez de cada aba refazer o join e escolher um total diferente.
 */
export interface ResellerExportUnit {
  id: string
  name: string
  slug: string
  status: string
  createdAt: string
  activatedAt: string | null
  nuncaAtivou: boolean
  customDomain: string | null
  domainVerified: boolean

  ownerName: string | null
  ownerEmail: string | null
  ownerPhone: string | null
  ownerCpf: string | null
  ownerStatus: string | null
  ownerLastActiveAt: string | null

  accountManagerName: string | null
  salesUserName: string | null
  referrerName: string | null
  referralCode: string
  referralsCount: number
  referralsActiveCount: number

  planValue: number
  promoValue: number | null
  promoMonths: number | null
  firstPaymentMaxInstallments: number
  interestFreeInstallments: number
  billingMode: string
  asaasCustomerId: string | null
  asaasSubscriptionId: string | null

  /** Cobranças em aberto (ordenadas por vencimento) + agregados. */
  nextCharge: TenantCharge | null
  openCharges: TenantCharge[]
  openCount: number
  openAmount: number
  overdueCount: number
  overdueAmount: number
  paidCount: number
  paidTotal: number
  lastPaidAt: string | null

  students: number
  studentsByStatus: StudentStatusCounts
  courses: number
  enrollments: number
  enrollmentsActive: number

  salesCount: number
  salesRevenue: number
  lastSaleAt: string | null

  mpConnected: boolean
  asaasConnected: boolean
  salesGateway: string
  plataformaVendedorId: string | null
  poloName: string | null

  automationEnabled: boolean
  ejaEnabled: boolean
  tecnicaEnabled: boolean
  canSellResellers: boolean
  monthlyAllowed: boolean
  monthlyEnabled: boolean
  monthlyScope: string
  paceGateEnabled: boolean | null

  waStatus: string
  waConnectedPhone: string | null
  whatsapp: string | null
  supportEmail: string | null
}

/** Uma linha do histórico de mensalidades (aba 3). */
export interface ResellerExportCharge {
  tenantId: string
  charge: TenantCharge
  notes: string | null
}

function sim(value: boolean): string {
  return value ? "Sim" : "Não"
}

/**
 * As colunas de data viajam como "YYYY-MM-DD" (e "YYYY-MM-DD HH:mm") JÁ
 * resolvidas no fuso certo — quem sabe a semântica de cada campo é o servidor.
 * O cliente só converte para célula de data do Excel; se ele tivesse que
 * escolher o fuso, erraria por um dia em metade das linhas.
 *
 * `dia` = INSTANTE (createdAt, paidAt) lido no dia civil brasileiro.
 * `diaCivil` = data já civil guardada como meia-noite UTC (dueDate do Asaas).
 */
function dia(iso: string | null): string | null {
  return iso ? brDayIso(new Date(iso)) : null
}

function diaCivil(iso: string | null): string | null {
  return iso ? utcDayIso(new Date(iso)) : null
}

function dataHora(iso: string | null): string | null {
  return iso ? brDateTimeIso(new Date(iso)) : null
}

/**
 * Link absoluto da nossa página de cobrança (PIX + boleto + cartão).
 *
 * Vazio quando a cobrança já foi parcelada no cartão: ali `payUrlFor` devolve
 * `null` (o id é um `ins_...`, que não resolve). Interpolar direto produzia a
 * string literal "…com.brnull" na planilha — o TypeScript não reclama de `null`
 * dentro de template literal, então só o teste pega.
 */
export function chargePayUrl(charge: TenantCharge): string {
  const path = payUrlFor(charge)
  return path ? `${appUrl()}${path}` : ""
}

function paceLabel(value: boolean | null): string {
  if (value === null) return "Herda do sistema"
  return value ? "Ligada" : "Desligada"
}

const UNIDADES_COLUMNS: ExportColumn[] = [
  { header: "Unidade", kind: "text", width: 30 },
  { header: "Slug", kind: "text", width: 18 },
  { header: "Status", kind: "text", width: 12 },
  { header: "Nunca ativou", kind: "text", width: 13 },
  { header: "Criada em", kind: "date", width: 12 },
  { header: "Ativada em", kind: "date", width: 12 },
  { header: "Vitrine", kind: "link", width: 34 },
  { header: "Domínio próprio", kind: "text", width: 26 },
  { header: "Domínio verificado", kind: "text", width: 16 },

  { header: "Titular", kind: "text", width: 28 },
  { header: "E-mail do titular", kind: "text", width: 30 },
  { header: "Telefone do titular", kind: "text", width: 18 },
  { header: "CPF do titular", kind: "text", width: 16 },
  { header: "Situação do titular", kind: "text", width: 15 },
  { header: "Último acesso do titular", kind: "datetime", width: 20 },

  { header: "Gerente de conta", kind: "text", width: 24 },
  { header: "Vendedor responsável", kind: "text", width: 24 },
  { header: "Indicada por", kind: "text", width: 24 },
  { header: "Código de indicação", kind: "text", width: 18 },
  { header: "Indicadas (total)", kind: "number", width: 14 },
  { header: "Indicadas ativas", kind: "number", width: 14 },

  { header: "Mensalidade (R$)", kind: "money", width: 16 },
  { header: "Valor promocional (R$)", kind: "money", width: 18 },
  { header: "Meses de promoção", kind: "number", width: 16 },
  { header: "Parcelas da 1ª mensalidade", kind: "number", width: 20 },
  { header: "Parcelas sem juros (vendas)", kind: "number", width: 20 },
  { header: "Modo de cobrança", kind: "text", width: 14 },

  { header: "Próximo vencimento", kind: "date", width: 16 },
  { header: "Situação da cobrança", kind: "text", width: 20 },
  { header: "Valor da próxima (R$)", kind: "money", width: 18 },
  { header: "Link de pagamento", kind: "link", width: 40 },
  { header: "Link do boleto", kind: "link", width: 40 },
  { header: "Cobranças em aberto", kind: "number", width: 16 },
  { header: "Valor em aberto (R$)", kind: "money", width: 18 },
  { header: "Cobranças vencidas", kind: "number", width: 16 },
  { header: "Valor vencido (R$)", kind: "money", width: 18 },
  { header: "Mensalidades pagas", kind: "number", width: 16 },
  { header: "Total pago (R$)", kind: "money", width: 16 },
  { header: "Última mensalidade paga", kind: "date", width: 18 },

  { header: "Alunos (total)", kind: "number", width: 13 },
  { header: "Alunos ativos", kind: "number", width: 13 },
  { header: "Alunos bloqueados", kind: "number", width: 16 },
  { header: "Alunos inadimplentes", kind: "number", width: 17 },
  { header: "Alunos formados", kind: "number", width: 14 },
  { header: "Alunos inativos", kind: "number", width: 14 },
  { header: "Cursos na vitrine", kind: "number", width: 15 },
  { header: "Matrículas (total)", kind: "number", width: 15 },
  { header: "Matrículas ativas", kind: "number", width: 15 },

  { header: "Vendas aprovadas", kind: "number", width: 15 },
  { header: "Receita aprovada (R$)", kind: "money", width: 19 },
  { header: "Ticket médio (R$)", kind: "money", width: 16 },
  { header: "Última venda", kind: "date", width: 13 },

  { header: "Mercado Pago conectado", kind: "text", width: 19 },
  { header: "Asaas conectado", kind: "text", width: 15 },
  { header: "Gateway das vendas", kind: "text", width: 16 },
  { header: "ID na plataforma de aulas", kind: "text", width: 20 },
  { header: "Polo", kind: "text", width: 20 },

  { header: "Automação", kind: "text", width: 11 },
  { header: "EJA", kind: "text", width: 8 },
  { header: "Cursos técnicos", kind: "text", width: 14 },
  { header: "Revende revendas", kind: "text", width: 15 },
  { header: "Parcelado liberado", kind: "text", width: 16 },
  { header: "Parcelado ligado", kind: "text", width: 15 },
  { header: "Escopo do parcelado", kind: "text", width: 18 },
  { header: "Cota de aulas", kind: "text", width: 16 },

  { header: "WhatsApp (automação)", kind: "text", width: 18 },
  { header: "Número conectado", kind: "text", width: 17 },
  { header: "WhatsApp de contato", kind: "text", width: 18 },
  { header: "E-mail de atendimento", kind: "text", width: 28 },

  { header: "Cliente Asaas", kind: "text", width: 22 },
  { header: "Assinatura Asaas", kind: "text", width: 22 },
  { header: "ID da unidade", kind: "text", width: 26 },
]

export function buildUnidadesSheet(
  units: ResellerExportUnit[],
  note?: string | null,
): ExportSheet {
  const rows: ExportCell[][] = units.map((u) => {
    const next = u.nextCharge
    return [
      u.name,
      u.slug,
      tenantStatusLabel(u.status),
      sim(u.nuncaAtivou),
      dia(u.createdAt),
      dia(u.activatedAt),
      vitrineUrl(u.slug),
      u.customDomain,
      u.customDomain ? sim(u.domainVerified) : "—",

      u.ownerName,
      u.ownerEmail,
      u.ownerPhone,
      u.ownerCpf,
      u.ownerStatus,
      dataHora(u.ownerLastActiveAt),

      u.accountManagerName,
      u.salesUserName,
      u.referrerName,
      u.referralCode,
      u.referralsCount,
      u.referralsActiveCount,

      u.planValue,
      u.promoValue,
      u.promoMonths,
      u.firstPaymentMaxInstallments,
      u.interestFreeInstallments,
      u.billingMode,

      next ? diaCivil(next.dueDate) : null,
      next ? situacaoCobranca(next.daysUntilDue) : "Sem cobrança em aberto",
      next ? next.amount : null,
      next ? chargePayUrl(next) : null,
      next?.bankSlipUrl ?? next?.invoiceUrl ?? null,
      u.openCount,
      u.openAmount,
      u.overdueCount,
      u.overdueAmount,
      u.paidCount,
      u.paidTotal,
      dia(u.lastPaidAt),

      u.students,
      u.studentsByStatus.ATIVO ?? 0,
      u.studentsByStatus.BLOQUEADO ?? 0,
      u.studentsByStatus.DEVEDOR ?? 0,
      u.studentsByStatus.FORMADO ?? 0,
      u.studentsByStatus.INATIVO ?? 0,
      u.courses,
      u.enrollments,
      u.enrollmentsActive,

      u.salesCount,
      u.salesRevenue,
      // Ticket médio só existe com venda; 0/0 imprimiria "R$ 0,00" e leria como
      // "vende de graça" em vez de "não vendeu".
      u.salesCount > 0 ? u.salesRevenue / u.salesCount : null,
      dia(u.lastSaleAt),

      sim(u.mpConnected),
      sim(u.asaasConnected),
      u.salesGateway,
      u.plataformaVendedorId,
      u.poloName,

      sim(u.automationEnabled),
      sim(u.ejaEnabled),
      sim(u.tecnicaEnabled),
      sim(u.canSellResellers),
      sim(u.monthlyAllowed),
      sim(u.monthlyEnabled),
      u.monthlyScope,
      paceLabel(u.paceGateEnabled),

      u.waStatus,
      u.waConnectedPhone,
      u.whatsapp,
      u.supportEmail,

      u.asaasCustomerId,
      u.asaasSubscriptionId,
      u.id,
    ]
  })

  return { name: "Unidades", columns: UNIDADES_COLUMNS, rows, note: note ?? null }
}

const COBRANCA_COLUMNS: ExportColumn[] = [
  { header: "Unidade", kind: "text", width: 30 },
  { header: "Slug", kind: "text", width: 18 },
  { header: "Status da unidade", kind: "text", width: 15 },
  { header: "Titular", kind: "text", width: 26 },
  { header: "E-mail do titular", kind: "text", width: 30 },
  { header: "Telefone do titular", kind: "text", width: 18 },
  { header: "Gerente de conta", kind: "text", width: 22 },
  { header: "Vencimento", kind: "date", width: 13 },
  { header: "Situação", kind: "text", width: 20 },
  { header: "Dias até vencer", kind: "number", width: 14 },
  { header: "Valor (R$)", kind: "money", width: 14 },
  { header: "Forma de pagamento", kind: "text", width: 17 },
  { header: "Status no Asaas", kind: "text", width: 15 },
  { header: "Link de pagamento", kind: "link", width: 42 },
  { header: "Link do boleto", kind: "link", width: 42 },
  { header: "Fatura no Asaas", kind: "link", width: 42 },
  { header: "ID da cobrança", kind: "text", width: 24 },
]

/**
 * Uma linha por cobrança EM ABERTO (vencida ou a vencer) — é o que a pessoa do
 * financeiro leva para cobrar. Vem ordenada da mais atrasada para a mais
 * distante, cruzando unidades: quem está devendo há mais tempo aparece primeiro,
 * que é a ordem em que se trabalha a régua.
 */
export function buildCobrancasSheet(units: ResellerExportUnit[]): ExportSheet {
  const rows = units
    .flatMap((u) => u.openCharges.map((charge) => ({ u, charge })))
    .sort((a, b) => a.charge.daysUntilDue - b.charge.daysUntilDue)
    .map(({ u, charge }): ExportCell[] => [
      u.name,
      u.slug,
      tenantStatusLabel(u.status),
      u.ownerName,
      u.ownerEmail,
      u.ownerPhone,
      u.accountManagerName,
      diaCivil(charge.dueDate),
      situacaoCobranca(charge.daysUntilDue),
      charge.daysUntilDue,
      charge.amount,
      charge.billingType,
      tenantStatusLabel(charge.status),
      chargePayUrl(charge),
      charge.bankSlipUrl,
      charge.invoiceUrl,
      charge.asaasPaymentId,
    ])

  return { name: "Cobranças em aberto", columns: COBRANCA_COLUMNS, rows, note: null }
}

const HISTORICO_COLUMNS: ExportColumn[] = [
  { header: "Unidade", kind: "text", width: 30 },
  { header: "Slug", kind: "text", width: 18 },
  { header: "Vencimento", kind: "date", width: 13 },
  { header: "Pago em", kind: "date", width: 13 },
  { header: "Valor (R$)", kind: "money", width: 14 },
  { header: "Status", kind: "text", width: 14 },
  { header: "Forma de pagamento", kind: "text", width: 17 },
  { header: "Baixa manual", kind: "text", width: 13 },
  { header: "Observações", kind: "text", width: 40 },
  { header: "Link de pagamento", kind: "link", width: 42 },
  { header: "Link do boleto", kind: "link", width: 42 },
  { header: "ID da cobrança", kind: "text", width: 24 },
]

export function buildHistoricoSheet(
  charges: ResellerExportCharge[],
  unitsById: Map<string, Pick<ResellerExportUnit, "name" | "slug">>,
  note?: string | null,
): ExportSheet {
  const rows: ExportCell[][] = charges.map(({ tenantId, charge, notes }) => {
    const unit = unitsById.get(tenantId)
    return [
      unit?.name ?? null,
      unit?.slug ?? null,
      diaCivil(charge.dueDate),
      dia(charge.paidAt),
      charge.amount,
      tenantStatusLabel(charge.status),
      charge.billingType,
      sim(charge.markedPaid),
      notes,
      chargePayUrl(charge),
      charge.bankSlipUrl,
      charge.asaasPaymentId,
    ]
  })

  return {
    name: "Histórico de mensalidades",
    columns: HISTORICO_COLUMNS,
    rows,
    note: note ?? null,
  }
}
