"use client"

import { useCallback, useEffect, useState } from "react"
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

interface DetailResponse {
  reseller: ResellerProfileData & {
    billingMode: BillingMode
    cancellationPolicy: CancellationPolicy | null
    asaasSubscriptionId: string | null
    asaasNextDueDate: string | null
    asaasSubscriptionStatus: string | null
  }
  payments: ResellerPayment[]
  students: ResellerStudentsBreakdown
}

interface ResellerDetailClientProps {
  tenantId: string
}

export function ResellerDetailClient({ tenantId }: ResellerDetailClientProps) {
  const [data, setData] = useState<DetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="space-y-6">
      <ResellerProfile reseller={data.reseller} />

      <ResellerImpersonateButton tenantId={tenantId} />

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <ResellerBillingEdit
            tenantId={tenantId}
            planValue={data.reseller.planValue}
            asaasNextDueDate={data.reseller.asaasNextDueDate}
            asaasSubscriptionId={data.reseller.asaasSubscriptionId}
            asaasSubscriptionStatus={data.reseller.asaasSubscriptionStatus}
            onSaved={load}
          />
          <ResellerPaymentHistory payments={data.payments} />
          <ResellerPolicyConfig
            tenantId={tenantId}
            billingMode={data.reseller.billingMode}
            cancellationPolicy={data.reseller.cancellationPolicy}
            onSaved={load}
          />
        </div>
        <div className="space-y-6">
          <ResellerStudentCount students={data.students} />
          <ResellerActionButtons
            tenantId={tenantId}
            status={data.reseller.status}
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
