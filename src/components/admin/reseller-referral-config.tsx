"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  Share2,
  Copy,
  Check,
  Save,
  RotateCcw,
  Users,
  TrendingUp,
  TrendingDown,
  CalendarClock,
  KeyRound,
  ExternalLink,
  FileText,
  Download,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

export interface ReferralStats {
  defaultPercent: number
  payoutDay: number
  totalReferrals: number
  totalCommissionGenerated: number
  totalCommissionReceived: number
  totalReferralsPaidToMe: number
}

export interface ReferrerSummary {
  id: string
  name: string
  slug: string
}

interface ResellerReferralConfigProps {
  tenantId: string
  referralCode: string
  referralPercent: number | null
  pixKey: string | null
  pixKeyType: string | null
  referrer: ReferrerSummary | null
  stats: ReferralStats
  onSaved?: () => void
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

/**
 * Calcula a proxima data de pagamento: dia X (payoutDay) do mes seguinte.
 * Se o dia X deste mes ainda nao chegou, retorna o dia X deste mes.
 */
function computeNextPayoutDate(payoutDay: number): Date {
  const now = new Date()
  const thisMonthPayout = new Date(
    now.getFullYear(),
    now.getMonth(),
    payoutDay,
    0,
    0,
    0,
    0,
  )
  if (thisMonthPayout.getTime() > now.getTime()) {
    return thisMonthPayout
  }
  return new Date(now.getFullYear(), now.getMonth() + 1, payoutDay, 0, 0, 0, 0)
}

function formatDateBR(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function currentMonthIso(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}

function buildMonthOptions(count: number): Array<{ value: string; label: string }> {
  const opts: Array<{ value: string; label: string }> = []
  const now = new Date()
  const labelMonths = [
    "Janeiro",
    "Fevereiro",
    "Marco",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ]
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const mIdx = d.getMonth()
    const mStr = String(mIdx + 1).padStart(2, "0")
    opts.push({
      value: `${y}-${mStr}`,
      label: `${labelMonths[mIdx]}/${y}`,
    })
  }
  return opts
}

export function ResellerReferralConfig({
  tenantId,
  referralCode,
  referralPercent,
  pixKey,
  pixKeyType,
  referrer,
  stats,
  onSaved,
}: ResellerReferralConfigProps) {
  const [percentInput, setPercentInput] = useState<string>(
    referralPercent != null ? String(referralPercent) : "",
  )
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [copied, setCopied] = useState(false)
  const monthOptions = useMemo(() => buildMonthOptions(12), [])
  const [demoMonth, setDemoMonth] = useState<string>(
    monthOptions[0]?.value ?? currentMonthIso(),
  )
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    setPercentInput(referralPercent != null ? String(referralPercent) : "")
  }, [referralPercent])

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(referralCode)
      setCopied(true)
      toast.success("Codigo copiado!")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Nao foi possivel copiar")
    }
  }

  async function savePercent() {
    const raw = percentInput.trim()
    if (!raw) {
      toast.error("Informe um percentual ou use 'Usar padrao'")
      return
    }
    const parsed = Number(raw.replace(",", "."))
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
      toast.error("Percentual invalido (0 a 100)")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(
        `/api/admin/tenants/${tenantId}/referral-percent`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ percent: parsed }),
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao salvar percentual")
        return
      }
      toast.success("Percentual atualizado")
      onSaved?.()
    } catch {
      toast.error("Erro de rede ao salvar")
    } finally {
      setSaving(false)
    }
  }

  async function resetToDefault() {
    setResetting(true)
    try {
      const res = await fetch(
        `/api/admin/tenants/${tenantId}/referral-percent`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ percent: null }),
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao redefinir")
        return
      }
      setPercentInput("")
      toast.success(`Voltou ao padrao (${stats.defaultPercent}%)`)
      onSaved?.()
    } catch {
      toast.error("Erro de rede ao redefinir")
    } finally {
      setResetting(false)
    }
  }

  async function downloadDemonstrativo() {
    if (!demoMonth) {
      toast.error("Selecione um mes")
      return
    }
    setDownloading(true)
    try {
      const res = await fetch(
        `/api/admin/revendedores/${tenantId}/comissoes/demonstrativo?month=${encodeURIComponent(demoMonth)}`,
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body?.error ?? "Falha ao gerar demonstrativo")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `demonstrativo-${demoMonth}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success("Demonstrativo baixado")
    } catch {
      toast.error("Erro de rede ao baixar")
    } finally {
      setDownloading(false)
    }
  }

  const usingDefault = referralPercent == null
  const effectivePercent = usingDefault ? stats.defaultPercent : referralPercent
  const nextPayout = computeNextPayoutDate(stats.payoutDay)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      {/* Cabecalho */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Share2 className="h-4 w-4 text-[var(--color-pmb-green)]" />
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Indicacao
          </h3>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            usingDefault
              ? "bg-gray-100 text-gray-600"
              : "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-900)]"
          }`}
        >
          {usingDefault ? "Padrao" : "Override"} {effectivePercent}%
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-600">
        Codigo de indicacao, comissoes e percentual deste revendedor.
      </p>

      {/* Codigo de indicacao */}
      <div className="mt-5 space-y-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Codigo de indicacao
        </span>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm text-[var(--color-pmb-green-900)]">
            {referralCode}
          </code>
          <Button
            size="sm"
            variant="outline"
            type="button"
            onClick={copyCode}
            className="shrink-0"
          >
            {copied ? (
              <>
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Copiado
              </>
            ) : (
              <>
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Copiar
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Quem indicou */}
      {referrer && (
        <div className="mt-4 space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Indicado por
          </span>
          <Link
            href={`/admin/revendedores/${referrer.id}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-[var(--color-pmb-green-900)] transition hover:border-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-lime-50)]/30"
          >
            <span className="font-medium">{referrer.name}</span>
            <span className="text-xs text-gray-500">/{referrer.slug}</span>
            <ExternalLink className="ml-auto h-3.5 w-3.5 text-gray-400" />
          </Link>
        </div>
      )}

      {/* Editor de % */}
      <div className="mt-5 space-y-2 border-t border-gray-100 pt-5">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Percentual de comissao (override)
        </label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={percentInput}
              onChange={(e) => setPercentInput(e.target.value)}
              placeholder={`Padrao: ${stats.defaultPercent}`}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 pr-8 font-mono text-sm focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-gray-400">
              %
            </span>
          </div>
          <Button
            size="sm"
            type="button"
            onClick={savePercent}
            disabled={saving || resetting}
            className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
          >
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {saving ? "Salvando..." : "Salvar %"}
          </Button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-gray-500">
            {usingDefault
              ? `Usando padrao global (${stats.defaultPercent}%).`
              : `Override ativo. Padrao global e ${stats.defaultPercent}%.`}
          </p>
          {!usingDefault && (
            <button
              type="button"
              onClick={resetToDefault}
              disabled={saving || resetting}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-[var(--color-pmb-green-900)] disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" />
              {resetting ? "Aguarde..." : "Usar padrao"}
            </button>
          )}
        </div>
      </div>

      {/* Stats 2x2 */}
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-gray-100 pt-5">
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            <Users className="h-3 w-3" />
            Indicados ativos
          </div>
          <div className="mt-1 text-lg font-semibold text-[var(--color-pmb-green-900)]">
            {stats.totalReferrals}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            <TrendingDown className="h-3 w-3" />
            Gerado p/ indicador
          </div>
          <div className="mt-1 text-lg font-semibold text-[var(--color-pmb-green-900)]">
            {formatBRL(stats.totalCommissionGenerated)}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            <TrendingUp className="h-3 w-3" />
            Recebido por indicados
          </div>
          <div className="mt-1 text-lg font-semibold text-[var(--color-pmb-green-900)]">
            {formatBRL(stats.totalCommissionReceived)}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            <CalendarClock className="h-3 w-3" />
            Proximo pagamento
          </div>
          <div className="mt-1 text-sm font-semibold text-[var(--color-pmb-green-900)]">
            {formatDateBR(nextPayout)}
          </div>
        </div>
      </div>

      {/* PIX */}
      <div className="mt-5 space-y-1.5 border-t border-gray-100 pt-5">
        <div className="flex items-center gap-1.5">
          <KeyRound className="h-3.5 w-3.5 text-gray-500" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Chave PIX para comissoes
          </span>
        </div>
        {pixKey ? (
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">
              {pixKeyType ?? "Tipo nao informado"}
            </div>
            <div className="font-mono text-sm text-[var(--color-pmb-green-900)]">
              {pixKey}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-500">
            Nao cadastrado
          </div>
        )}
      </div>

      {/* Demonstrativo mensal */}
      <div className="mt-5 space-y-2 border-t border-gray-100 pt-5">
        <div className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-gray-500" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Demonstrativo mensal (PDF)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={demoMonth}
            onChange={(e) => setDemoMonth(e.target.value)}
            disabled={downloading}
            className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"
          >
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={downloadDemonstrativo}
            disabled={downloading}
            className="shrink-0"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {downloading ? "Gerando..." : "Baixar PDF"}
          </Button>
        </div>
        <p className="text-[11px] text-gray-500">
          Relatorio das comissoes pagas neste mes (com totais e dados
          bancarios).
        </p>
      </div>

      {/* Drilldown */}
      <div className="mt-5 border-t border-gray-100 pt-4">
        <Link
          href={`/admin/revendedores/${tenantId}/comissoes`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-pmb-green-900)] hover:text-[var(--color-pmb-green)]"
        >
          Ver detalhado
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  )
}
