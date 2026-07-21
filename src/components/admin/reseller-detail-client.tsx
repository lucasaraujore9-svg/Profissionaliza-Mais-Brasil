"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { BlockSkeleton } from "@/components/shared/loading-skeletons"
import { ResellerCard } from "./reseller-card"
import { ResellerProfile, type ResellerProfileData } from "./reseller-profile"
import {
  ResellerPaymentHistory,
  type ResellerPayment,
} from "./reseller-payment-history"
import {
  ResellerPolicyConfig,
  type BillingMode,
  type CancellationPolicy,
} from "./reseller-policy-config"
import { ResellerActionButtons } from "./reseller-action-buttons"
import {
  ResellerStudentCount,
  type ResellerStudentsBreakdown,
} from "./reseller-student-count"
import { ResellerSupportNotes } from "./reseller-support-notes"
import { ResellerBillingEdit } from "./reseller-billing-edit"
import { ResellerPasswordEdit } from "./reseller-password-edit"
import {
  ResellerReferralConfig,
  type ReferralStats,
  type ReferrerSummary,
} from "./reseller-referral-config"
import {
  ResellerCommissionOverrideForm,
  type CommissionPreview,
  type OverrideInitial,
} from "./reseller-commission-override-form"
import { ResellerTecnicaConfig } from "./reseller-tecnica-config"
import { ResellerEjaConfig } from "./reseller-eja-config"
import { ResellerAutomationConfig } from "./reseller-automation-config"
import { ResellerCanSellConfig } from "./reseller-can-sell-config"
import { ResellerAsaasGatewayConfig } from "./reseller-asaas-gateway-config"
import {
  ResellerMonthlyConfig,
  type MonthlyScope,
} from "./reseller-monthly-config"
import { ResellerSubdomainEdit } from "./reseller-subdomain-edit"
import type { UserRole } from "@prisma/client"

interface DetailResponse {
  reseller: ResellerProfileData & {
    billingMode: BillingMode
    cancellationPolicy: CancellationPolicy | null
    asaasCustomerId: string | null
    asaasSubscriptionId: string | null
    asaasPromoSubscriptionId: string | null
    asaasNextDueDate: string | null
    asaasSubscriptionStatus: string | null
    asaasSubscriptionValue: number | null
    promoValue: number | null
    promoMonths: number | null
    referralCode: string
    referralMinReferrals: number | null
    commissionBracketBasis: OverrideInitial["commissionBracketBasis"]
    commissionRateType: OverrideInitial["commissionRateType"]
    commissionPayoutBase: OverrideInitial["commissionPayoutBase"]
    commissionBrackets: unknown
    commissionPlan: unknown
    commissionOverrideSource: OverrideInitial["overrideSource"]
    commissionPreview: CommissionPreview
    activatedAt: string | null
    pixKey: string | null
    pixKeyType: string | null
    tecnicaEnabled: boolean
    tecnicaUrl: string | null
    tecnicaLabel: string | null
    tecnicaCourses: Array<{ name: string; url: string }>
    ejaEnabled: boolean
    ejaUrl: string | null
    ejaLabel: string | null
    automationEnabled: boolean
    canSellResellers: boolean
    waConnectedPhone: string | null
    waStatus: string
    monthlyAllowed: boolean
    monthlyEnabled: boolean
    monthlyScope: MonthlyScope
    asaasGatewayEnabled: boolean
    asaasConnected: boolean
    salesGateway: "MP" | "ASAAS"
    accountManagerId: string | null
  }
  referrer: ReferrerSummary | null
  referralStats: ReferralStats
  payments: ResellerPayment[]
  students: ResellerStudentsBreakdown
}

interface SalesUserOption {
  id: string
  name: string
}

interface ResellerDetailClientProps {
  tenantId: string
  isSuperAdmin?: boolean
  viewerId?: string | null
  viewerRole?: UserRole | null
  salesUserId?: string | null
  salesUserName?: string | null
  salesUsers?: SalesUserOption[]
}

export function ResellerDetailClient({
  tenantId,
  isSuperAdmin = false,
  viewerId = null,
  viewerRole = null,
  salesUserId = null,
  salesUserName = null,
  salesUsers = [],
}: ResellerDetailClientProps) {
  const [data, setData] = useState<DetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Vendedor de revenda (PMB_REVENDA_SALES) — espelha o gerente de suporte.
  const [salesUserCurrentId, setSalesUserCurrentId] = useState<string | null>(
    salesUserId,
  )
  const [salesUserCurrentName, setSalesUserCurrentName] = useState<
    string | null
  >(salesUserName)
  const [salesValue, setSalesValue] = useState<string>(salesUserId ?? "")
  const [savingSales, setSavingSales] = useState(false)

  async function saveSales() {
    setSavingSales(true)
    try {
      const res = await fetch(`/api/admin/revendedores/${tenantId}/sales`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ salesUserId: salesValue || null }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao atribuir")
        return
      }
      toast.success("Vendedor de revenda atualizado")
      const updated = body.data as {
        salesUserId: string | null
        salesUser: { id: string; name: string } | null
      }
      setSalesUserCurrentId(updated.salesUserId)
      setSalesUserCurrentName(updated.salesUser?.name ?? null)
      setSalesValue(updated.salesUserId ?? "")
    } finally {
      setSavingSales(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/revendedores/${tenantId}`)
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao carregar revendedor")
        return
      }
      setData(body.data)
    } catch {
      setError("Erro de rede ao carregar revendedor")
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    load()
  }, [load])

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <BlockSkeleton className="h-32" />
        <BlockSkeleton className="h-9 max-w-md" />
        <BlockSkeleton className="h-64" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    )
  }

  if (!data) return null

  // Edicao de subdominio: so equipe PMB. SUPER_ADMIN qualquer; gerente de
  // revendedores apenas as unidades atribuidas a ele. A rota PATCH revalida.
  const canEditSlug =
    viewerRole === "SUPER_ADMIN" ||
    (viewerRole === "PMB_RESELLER_MGR" &&
      data.reseller.accountManagerId === viewerId)

  return (
    <div className="space-y-6">
      <ResellerProfile reseller={data.reseller} />

      <Tabs defaultValue="overview" className="gap-6">
        <TabsList variant="line" className="flex-wrap">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="billing">Cobrança</TabsTrigger>
          <TabsTrigger value="vitrine">Vitrine &amp; extras</TabsTrigger>
          <TabsTrigger value="referral">Indicação</TabsTrigger>
          <TabsTrigger value="advanced">Avançado</TabsTrigger>
        </TabsList>

        {/* Visão geral */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
            <div className="space-y-6">
              <ResellerStudentCount students={data.students} />
              <ResellerBillingEdit
                tenantId={tenantId}
                planValue={data.reseller.planValue}
                asaasCustomerId={data.reseller.asaasCustomerId}
                asaasNextDueDate={data.reseller.asaasNextDueDate}
                asaasSubscriptionId={data.reseller.asaasSubscriptionId}
                asaasSubscriptionStatus={data.reseller.asaasSubscriptionStatus}
                asaasSubscriptionValue={data.reseller.asaasSubscriptionValue}
                asaasPromoSubscriptionId={data.reseller.asaasPromoSubscriptionId}
                promoValue={data.reseller.promoValue}
                promoMonths={data.reseller.promoMonths}
                onSaved={load}
              />
            </div>
            <div className="space-y-6">
              <ResellerSupportNotes
                tenantId={tenantId}
                whatsapp={(data.reseller as { whatsapp?: string | null }).whatsapp ?? null}
              />
            </div>
          </div>
        </TabsContent>

        {/* Cobrança */}
        <TabsContent value="billing" className="space-y-6">
          <ResellerBillingEdit
            tenantId={tenantId}
            planValue={data.reseller.planValue}
            asaasCustomerId={data.reseller.asaasCustomerId}
            asaasNextDueDate={data.reseller.asaasNextDueDate}
            asaasSubscriptionId={data.reseller.asaasSubscriptionId}
            asaasSubscriptionStatus={data.reseller.asaasSubscriptionStatus}
            asaasSubscriptionValue={data.reseller.asaasSubscriptionValue}
            asaasPromoSubscriptionId={data.reseller.asaasPromoSubscriptionId}
            promoValue={data.reseller.promoValue}
            promoMonths={data.reseller.promoMonths}
            onSaved={load}
          />
          <ResellerPaymentHistory
            tenantId={tenantId}
            payments={data.payments}
            onRefresh={load}
          />
          <ResellerPolicyConfig
            tenantId={tenantId}
            billingMode={data.reseller.billingMode}
            cancellationPolicy={data.reseller.cancellationPolicy}
            onSaved={load}
          />
        </TabsContent>

        {/* Vitrine & extras */}
        <TabsContent value="vitrine" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            {canEditSlug && (
              <ResellerSubdomainEdit
                tenantId={tenantId}
                slug={data.reseller.slug}
                onSaved={load}
              />
            )}
            <ResellerTecnicaConfig
              tenantId={tenantId}
              tecnicaEnabled={data.reseller.tecnicaEnabled}
              tecnicaUrl={data.reseller.tecnicaUrl}
              tecnicaLabel={data.reseller.tecnicaLabel}
              tecnicaCourses={data.reseller.tecnicaCourses}
              onSaved={load}
            />
            <ResellerEjaConfig
              tenantId={tenantId}
              ejaEnabled={data.reseller.ejaEnabled}
              ejaUrl={data.reseller.ejaUrl}
              ejaLabel={data.reseller.ejaLabel}
              onSaved={load}
            />
            <ResellerAutomationConfig
              tenantId={tenantId}
              automationEnabled={data.reseller.automationEnabled}
              waConnectedPhone={data.reseller.waConnectedPhone}
              waStatus={data.reseller.waStatus}
              onSaved={load}
            />
            <ResellerCanSellConfig
              tenantId={tenantId}
              canSellResellers={data.reseller.canSellResellers}
              onSaved={load}
            />
            <ResellerMonthlyConfig
              tenantId={tenantId}
              monthlyAllowed={data.reseller.monthlyAllowed}
              monthlyEnabled={data.reseller.monthlyEnabled}
              monthlyScope={data.reseller.monthlyScope}
              onSaved={load}
            />
            <ResellerAsaasGatewayConfig
              tenantId={tenantId}
              asaasGatewayEnabled={data.reseller.asaasGatewayEnabled}
              asaasConnected={data.reseller.asaasConnected}
              salesGateway={data.reseller.salesGateway}
              onSaved={load}
            />
          </div>
        </TabsContent>

        {/* Indicação */}
        <TabsContent value="referral" className="space-y-6">
          <ResellerReferralConfig
            tenantId={tenantId}
            referralCode={data.reseller.referralCode}
            referralMinReferrals={data.reseller.referralMinReferrals}
            pixKey={data.reseller.pixKey}
            pixKeyType={data.reseller.pixKeyType}
            referrer={data.referrer}
            stats={data.referralStats}
          />
          <ResellerCommissionOverrideForm
            tenantId={tenantId}
            initial={{
              overrideSource: data.reseller.commissionOverrideSource,
              commissionBracketBasis: data.reseller.commissionBracketBasis,
              commissionRateType: data.reseller.commissionRateType,
              commissionPayoutBase: data.reseller.commissionPayoutBase,
              commissionBrackets: data.reseller.commissionBrackets,
              commissionPlan: data.reseller.commissionPlan,
              referralMinReferrals: data.reseller.referralMinReferrals,
              defaultMinReferrals: data.referralStats.defaultMinReferrals,
            }}
            preview={data.reseller.commissionPreview}
            onSaved={load}
          />
        </TabsContent>

        {/* Avançado */}
        <TabsContent value="advanced" className="space-y-6">
          {isSuperAdmin && (
            <ResellerCard
              title="Vendedor de revenda"
              description="Vendedor responsável comercialmente por esta unidade."
            >
              <p className="mt-3 text-sm text-gray-700">
                Atual:{" "}
                <span className="font-semibold">
                  {salesUserCurrentName ?? "Sem vendedor"}
                </span>
              </p>
              <div className="mt-3 space-y-2">
                <Select
                  value={salesValue || "__none__"}
                  onValueChange={(v) =>
                    setSalesValue(v === "__none__" ? "" : (v ?? ""))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Sem vendedor —</SelectItem>
                    {salesUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={saveSales}
                    disabled={
                      savingSales || salesValue === (salesUserCurrentId ?? "")
                    }
                    className="bg-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-green-700)]"
                  >
                    {savingSales ? "Salvando…" : "Salvar"}
                  </Button>
                </div>
              </div>
            </ResellerCard>
          )}
          <ResellerPasswordEdit
            tenantId={tenantId}
            ownerEmail={data.reseller.email}
          />
          <ResellerActionButtons
            tenantId={tenantId}
            status={data.reseller.status}
            isSuperAdmin={isSuperAdmin}
            onChanged={load}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
