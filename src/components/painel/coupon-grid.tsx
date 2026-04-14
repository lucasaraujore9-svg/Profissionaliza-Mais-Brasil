"use client"

import { useCallback, useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CouponCard, type CouponListItem } from "./coupon-card"
import {
  CouponUsageTable,
  type CouponUsageItem,
} from "./coupon-usage-table"
import { CreateCouponModal } from "./create-coupon-modal"

export function CouponGrid() {
  const [coupons, setCoupons] = useState<CouponListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [usages, setUsages] = useState<CouponUsageItem[]>([])
  const [usageLoading, setUsageLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/painel/cupons")
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao carregar cupons")
        return
      }
      setCoupons(body.data)
    } catch {
      setError("Erro de rede ao carregar cupons")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const loadUsage = useCallback(async (couponId: string) => {
    setUsageLoading(true)
    try {
      const res = await fetch(`/api/painel/cupons/${couponId}/usage`)
      const body = await res.json()
      if (res.ok) setUsages(body.data)
      else setUsages([])
    } catch {
      setUsages([])
    } finally {
      setUsageLoading(false)
    }
  }, [])

  const handleToggle = useCallback(
    async (coupon: CouponListItem) => {
      setPendingId(coupon.id)
      setCoupons((prev) =>
        prev.map((c) =>
          c.id === coupon.id ? { ...c, isActive: !c.isActive } : c,
        ),
      )
      try {
        const res = await fetch(`/api/painel/cupons/${coupon.id}/toggle`, {
          method: "PATCH",
        })
        if (!res.ok) {
          const body = await res.json()
          alert(body.error ?? "Falha ao alterar cupom")
          await load()
        }
      } catch {
        alert("Erro de rede ao alterar cupom")
        await load()
      } finally {
        setPendingId(null)
      }
    },
    [load],
  )

  const handleViewUsage = useCallback(
    (coupon: CouponListItem) => {
      if (expandedId === coupon.id) {
        setExpandedId(null)
        setUsages([])
        return
      }
      setExpandedId(coupon.id)
      loadUsage(coupon.id)
    },
    [expandedId, loadUsage],
  )

  const expandedCoupon = coupons.find((c) => c.id === expandedId)

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button
          className="bg-blue-600 text-white hover:bg-blue-700"
          onClick={() => setModalOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo cupom
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Carregando cupons...
        </div>
      ) : coupons.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
          Nenhum cupom cadastrado ainda.
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {coupons.map((coupon) => (
            <CouponCard
              key={coupon.id}
              coupon={coupon}
              pending={pendingId === coupon.id}
              onToggle={handleToggle}
              onViewUsage={handleViewUsage}
            />
          ))}
        </div>
      )}

      {expandedCoupon && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-[#1A1A2E]">
            Histórico do cupom{" "}
            <span className="font-mono text-blue-600">{expandedCoupon.code}</span>
          </h3>
          <p className="mt-1 text-xs text-gray-600">
            Últimos usos registrados deste cupom.
          </p>
          <div className="mt-4">
            <CouponUsageTable usages={usages} loading={usageLoading} />
          </div>
        </div>
      )}

      <CreateCouponModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={load}
      />
    </div>
  )
}
