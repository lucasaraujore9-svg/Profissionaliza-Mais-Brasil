"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowRight, CheckCircle2, Plus, Tag, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/painel/page-header"
import { EmptyState } from "@/components/shared/empty-state"
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

  const stats = useMemo(() => {
    const active = coupons.filter((c) => c.isActive).length
    const totalUses = coupons.reduce((sum, c) => sum + (c.usedCount ?? 0), 0)
    return {
      total: coupons.length,
      active,
      uses: totalUses,
    }
  }, [coupons])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cupons"
        description="Crie códigos promocionais e acompanhe quem está usando."
        actions={
          <Button
            data-tour="cupons:novo"
            className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
            onClick={() => setModalOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo cupom
          </Button>
        }
      />

      {/* Estatísticas */}
      {coupons.length > 0 && (
        <div data-tour="cupons:resumo" className="grid gap-3 sm:grid-cols-3">
          <SummaryStat
            label="Cupons ativos"
            value={`${stats.active}`}
            hint={`de ${stats.total} criados`}
            icon={CheckCircle2}
            tone="success"
          />
          <SummaryStat
            label="Total de cupons"
            value={`${stats.total}`}
            hint="histórico completo"
            icon={Tag}
            tone="primary"
          />
          <SummaryStat
            label="Usos registrados"
            value={`${stats.uses}`}
            hint="alunos que aplicaram"
            icon={TrendingUp}
            tone="accent"
          />
        </div>
      )}

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
        <EmptyState
          icon={Tag}
          title="Crie seu primeiro cupom"
          description="Cupons ajudam você a atrair novos alunos com descontos. Defina um código, valor e período de validade — e pronto, seu aluno aplica no checkout."
          action={
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-pmb-green-700)]"
            >
              <Plus className="h-4 w-4" />
              Criar cupom agora
              <ArrowRight className="h-4 w-4" />
            </button>
          }
        />
      ) : (
        <div
          data-tour="cupons:lista"
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
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
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Histórico do cupom{" "}
            <span className="font-mono text-[var(--color-pmb-green)]">{expandedCoupon.code}</span>
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

/* ------------------------------------------------------------------ */
/* SummaryStat                                                         */
/* ------------------------------------------------------------------ */

type StatTone = "primary" | "success" | "accent"

const STAT_TONES: Record<StatTone, string> = {
  primary: "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]",
  success: "bg-[var(--color-pmb-green)]/10 text-[var(--color-pmb-green-700)]",
  accent: "bg-[var(--color-pmb-gold-50)] text-[var(--color-pmb-gold-600)]",
}

function SummaryStat({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  hint: string
  icon: typeof Tag
  tone: StatTone
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${STAT_TONES[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {label}
        </p>
      </div>
      <p className="mt-3 font-mono text-2xl font-bold text-[var(--color-pmb-green-900)]">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-gray-500">{hint}</p>
    </div>
  )
}
