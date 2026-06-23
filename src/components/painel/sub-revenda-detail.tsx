"use client"

import Link from "next/link"
import { ExternalLink, FileText, Users, Calendar, Store } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// Visão SOMENTE-LEITURA de uma sub-revenda para o revendedor-vendedor que a
// trouxe. Espelha as abas "Visão geral" e "Cobrança" do sistema mãe, mas SEM os
// controles de edição (plano, política, notas de suporte) — a cobrança é da PMB,
// o vendedor apenas acompanha e ajuda a sub-revenda a se manter em dia.
// As demais abas (Vitrine, Indicação, Avançado) seguem exclusivas do admin.

export interface SubRevendaDetailData {
  name: string
  slug: string
  status: string
  planValue: number
  promoValue: number | null
  promoMonths: number | null
  createdAt: string
  ownerName: string | null
  ownerEmail: string | null
  ownerPhone: string | null
  studentCount: number
  vitrineUrl: string
  hasAsaasSubscription: boolean
  payments: SubRevendaPayment[]
}

export interface SubRevendaPayment {
  id: string
  asaasPaymentId: string
  amount: number
  status: string
  billingType: string | null
  dueDate: string
  paidAt: string | null
  invoiceUrl: string | null
  bankSlipUrl: string | null
}

const TENANT_STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Ativa", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  PENDING: { label: "Aguardando pgto.", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  SUSPENDED: { label: "Suspensa", cls: "bg-red-50 text-red-700 ring-red-200" },
  CANCELLED: { label: "Cancelada", cls: "bg-gray-100 text-gray-600 ring-gray-200" },
}

const PAYMENT_STATUS: Record<string, { label: string; cls: string }> = {
  RECEIVED: { label: "Pago", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  CONFIRMED: { label: "Pago", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  PENDING: { label: "Pendente", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  OVERDUE: { label: "Vencido", cls: "bg-red-50 text-red-700 ring-red-200" },
  REFUNDED: { label: "Estornado", cls: "bg-gray-100 text-gray-600 ring-gray-200" },
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("pt-BR")
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-right text-sm font-medium text-[var(--color-pmb-green-900)]">
        {children}
      </span>
    </div>
  )
}

export function SubRevendaDetail({ data }: { data: SubRevendaDetailData }) {
  const st = TENANT_STATUS[data.status] ?? TENANT_STATUS.PENDING

  return (
    <Tabs defaultValue="overview" className="gap-6">
      <TabsList variant="line" className="flex-wrap">
        <TabsTrigger value="overview">Visão geral</TabsTrigger>
        <TabsTrigger value="billing">Cobrança</TabsTrigger>
      </TabsList>

      {/* Visão geral */}
      <TabsContent value="overview" className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">Unidade</h3>
            <div className="mt-2 divide-y divide-gray-100">
              <InfoRow label="Status">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${st.cls}`}>
                  {st.label}
                </span>
              </InfoRow>
              <InfoRow label="Endereço (slug)">{data.slug}</InfoRow>
              <InfoRow label="Vitrine">
                <a
                  href={data.vitrineUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[var(--color-pmb-green)] hover:underline"
                >
                  Abrir <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </InfoRow>
              <InfoRow label="Criada em">{fmtDate(data.createdAt)}</InfoRow>
              <InfoRow label="Alunos">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-gray-400" /> {data.studentCount}
                </span>
              </InfoRow>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">Responsável</h3>
            <div className="mt-2 divide-y divide-gray-100">
              <InfoRow label="Nome">{data.ownerName ?? "—"}</InfoRow>
              <InfoRow label="E-mail">{data.ownerEmail ?? "—"}</InfoRow>
              <InfoRow label="Telefone">{data.ownerPhone ?? "—"}</InfoRow>
              <InfoRow label="Mensalidade">{brl(data.planValue)}</InfoRow>
              {data.promoValue != null && data.promoMonths != null && (
                <InfoRow label="Promoção">
                  {brl(data.promoValue)} nos primeiros {data.promoMonths} meses
                </InfoRow>
              )}
            </div>
          </div>
        </div>
      </TabsContent>

      {/* Cobrança */}
      <TabsContent value="billing" className="space-y-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-[var(--color-pmb-green)]" />
            <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
              Cobrança da mensalidade
            </h3>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            A mensalidade desta revenda é cobrada pela PMB. Você acompanha o status
            e pode reenviar o link de pagamento para ajudá-la a se manter ativa.
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5 text-gray-600">
              <Calendar className="h-4 w-4 text-gray-400" />
              {data.hasAsaasSubscription
                ? "Assinatura recorrente ativa"
                : "Sem assinatura recorrente"}
            </span>
          </div>
        </div>

        {data.payments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-12 text-center">
            <FileText className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">Nenhuma cobrança registrada ainda.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Vencimento</th>
                  <th className="px-4 py-3 font-medium">Valor</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Pago em</th>
                  <th className="px-4 py-3 font-medium text-right">Pagamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.payments.map((p) => {
                  const ps = PAYMENT_STATUS[p.status] ?? PAYMENT_STATUS.PENDING
                  // Mesma regra do sistema mãe: cobrança em aberto abre o CHECKOUT
                  // interno (/cobranca/{id}) — onde o pagador escolhe PIX/boleto/
                  // cartão — e não o boleto cru do Asaas. Já paga abre a fatura.
                  const isPending = p.status === "PENDING" || p.status === "OVERDUE"
                  const link = isPending
                    ? `/cobranca/${p.asaasPaymentId}`
                    : p.invoiceUrl ?? p.bankSlipUrl
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3 text-gray-600">{fmtDate(p.dueDate)}</td>
                      <td className="px-4 py-3 font-mono text-[var(--color-pmb-green-900)]">
                        {brl(p.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${ps.cls}`}>
                          {ps.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{fmtDate(p.paidAt)}</td>
                      <td className="px-4 py-3 text-right">
                        {link ? (
                          <Link
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-pmb-green)] hover:underline"
                          >
                            {isPending ? "Abrir checkout" : "Ver fatura"}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </TabsContent>
    </Tabs>
  )
}
