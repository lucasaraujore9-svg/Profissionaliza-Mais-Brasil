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
import { Button } from "@/components/ui/button"
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
import { ResellerImpersonateButton } from "./reseller-impersonate-button"
import { ResellerBillingEdit } from "./reseller-billing-edit"
import { ResellerPasswordEdit } from "./reseller-password-edit"
import {
  ResellerReferralConfig,
  type ReferralStats,
  type ReferrerSummary,
} from "./reseller-referral-config"
import { ResellerTecnicaConfig } from "./reseller-tecnica-config"
import { ResellerAutomationConfig } from "./reseller-automation-config"
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
    referralPercent: number | null
    referralMinReferrals: number | null
    pixKey: string | null
    pixKeyType: string | null
    tecnicaEnabled: boolean
    tecnicaUrl: string | null
    tecnicaLabel: string | null
    tecnicaCourses: Array<{ name: string; url: string }>
    automationEnabled: boolean
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
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
        Carregando revendedor...
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

      <ResellerImpersonateButton tenantId={tenantId} />

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          {canEditSlug && (
            <ResellerSubdomainEdit
              tenantId={tenantId}
              slug={data.reseller.slug}
              onSaved={load}
            />
          )}
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
          <ResellerTecnicaConfig
            tenantId={tenantId}
            tecnicaEnabled={data.reseller.tecnicaEnabled}
            tecnicaUrl={data.reseller.tecnicaUrl}
            tecnicaLabel={data.reseller.tecnicaLabel}
            tecnicaCourses={data.reseller.tecnicaCourses}
            onSaved={load}
          />
          <ResellerAutomationConfig
            tenantId={tenantId}
            automationEnabled={data.reseller.automationEnabled}
            waConnectedPhone={data.reseller.waConnectedPhone}
            waStatus={data.reseller.waStatus}
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
        <div className="space-y-6">
          {isSuperAdmin && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="font-semibold text-[var(--color-pmb-green-900)]">
                Vendedor de revenda
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                Vendedor responsável comercialmente por esta unidade.
              </p>
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
                    className="bg-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-green-900)]"
                  >
                    {savingSales ? "Salvando…" : "Salvar"}
                  </Button>
                </div>
              </div>
            </div>
          )}
          <ResellerStudentCount students={data.students} />
          <ResellerReferralConfig
            tenantId={tenantId}
            referralCode={data.reseller.referralCode}
            referralPercent={data.reseller.referralPercent}
            referralMinReferrals={data.reseller.referralMinReferrals}
            pixKey={data.reseller.pixKey}
            pixKeyType={data.reseller.pixKeyType}
            referrer={data.referrer}
            stats={data.referralStats}
            onSaved={load}
          />
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
          <ResellerSupportNotes
            tenantId={tenantId}
            whatsapp={(data.reseller as { whatsapp?: string | null }).whatsapp ?? null}
          />
        </div>
      </div>
    </div>
  )
}
