"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  Share2,
  Copy,
  Check,
  Users,
  TrendingUp,
  TrendingDown,
  CalendarClock,
  KeyRound,
  ExternalLink,
  FileText,
  Download,
  Pencil,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useCan } from "@/components/shared/permissions/permission-context"
import { tenantStatusLabel } from "@/lib/labels"
import type { TenantStatus } from "@prisma/client"

export interface ReferralStats {
  defaultPercent: number
  payoutDay: number
  defaultMinReferrals: number
  totalReferrals: number
  activeReferrals: number
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
  /** Minimo de indicacoes ativas em vigor — apenas para exibir a elegibilidade.
   *  A EDICAO da regra vive no card "Regra de comissao de indicacao". */
  referralMinReferrals: number | null
  pixKey: string | null
  pixKeyType: string | null
  referrer: ReferrerSummary | null
  stats: ReferralStats
  /** Recarrega o detalhe da unidade após alterar a indicação. */
  onSaved: () => void
}

interface ReferrerCandidate {
  id: string
  name: string
  slug: string
  status: TenantStatus
}

/** Normaliza o JSON salvo numa lista de faixas para o editor. */
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
    "Março",
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
  referralMinReferrals,
  pixKey,
  pixKeyType,
  referrer,
  stats,
  onSaved,
}: ResellerReferralConfigProps) {
  const [copied, setCopied] = useState(false)
  const monthOptions = useMemo(() => buildMonthOptions(12), [])
  const [demoMonth, setDemoMonth] = useState<string>(
    monthOptions[0]?.value ?? currentMonthIso(),
  )
  const [downloading, setDownloading] = useState(false)

  // Editar/atribuir a indicação — mesma permissão da rota PATCH .../referrer
  // (atribuir gerente/vendedor é a mesma classe de decisão sobre a conta).
  const canGovernanca = useCan("unidades.governanca")
  const [editingReferrer, setEditingReferrer] = useState(false)
  const [referrerQuery, setReferrerQuery] = useState("")
  const [referrerOptions, setReferrerOptions] = useState<ReferrerCandidate[]>([])
  const [searchingReferrer, setSearchingReferrer] = useState(false)
  const [savingReferrer, setSavingReferrer] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  // Busca debounced na lista de unidades (mesmo endpoint da tela de
  // revendedores — consulta só banco, sem chamadas ao Asaas).
  useEffect(() => {
    if (!editingReferrer) return
    const q = referrerQuery.trim()
    if (q.length < 2) {
      setReferrerOptions([])
      return
    }
    const handle = setTimeout(async () => {
      setSearchingReferrer(true)
      try {
        const res = await fetch(
          `/api/admin/revendedores?q=${encodeURIComponent(q)}`,
        )
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(body?.error ?? "Falha ao buscar unidades")
          return
        }
        const rows = (body?.data?.resellers ?? []) as ReferrerCandidate[]
        setReferrerOptions(
          rows
            // A unidade não pode indicar a si mesma; cancelada não indica
            // (mesma regra da rota — filtrar aqui evita oferecer opção que
            // voltaria 400 no salvar).
            .filter((r) => r.id !== tenantId && r.status !== "CANCELLED")
            .slice(0, 8),
        )
      } catch {
        toast.error("Erro de rede ao buscar unidades")
      } finally {
        setSearchingReferrer(false)
      }
    }, 350)
    return () => clearTimeout(handle)
  }, [editingReferrer, referrerQuery, tenantId])

  async function saveReferrer(referrerTenantId: string | null) {
    setSavingReferrer(true)
    try {
      const res = await fetch(`/api/admin/revendedores/${tenantId}/referrer`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ referrerTenantId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body?.error ?? "Falha ao atualizar a indicação")
        return
      }
      const updatedName = (
        body?.data?.referrer as { name?: string } | null | undefined
      )?.name
      toast.success(
        referrerTenantId
          ? `Indicação atribuída a ${updatedName ?? "unidade selecionada"}`
          : "Indicação removida",
      )
      setEditingReferrer(false)
      setReferrerQuery("")
      setReferrerOptions([])
      setConfirmRemove(false)
      onSaved()
    } catch {
      toast.error("Erro de rede ao salvar a indicação")
    } finally {
      setSavingReferrer(false)
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(referralCode)
      setCopied(true)
      toast.success("Código copiado!")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Não foi possível copiar")
    }
  }

  async function downloadDemonstrativo() {
    if (!demoMonth) {
      toast.error("Selecione um mês")
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

  const nextPayout = computeNextPayoutDate(stats.payoutDay)

  const effectiveMin = referralMinReferrals ?? stats.defaultMinReferrals
  const meetsMin = effectiveMin <= 0 || stats.activeReferrals >= effectiveMin

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      {/* Cabecalho */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Share2 className="h-4 w-4 text-[var(--color-pmb-green)]" />
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Indicação
          </h3>
        </div>
      </div>
      <p className="mt-1 text-xs text-gray-600">
        Código de indicação, PIX e demonstrativo. A regra de comissão fica no
        card abaixo.
      </p>

      {/* Codigo de indicacao */}
      <div className="mt-5 space-y-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Código de indicação
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

      {/* Quem indicou — editável para quem decide sobre a conta da unidade
          (o código pode ter sido esquecido no cadastro). */}
      <div className="mt-4 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Indicado por
          </span>
          {canGovernanca && !editingReferrer && (
            <button
              type="button"
              onClick={() => {
                setEditingReferrer(true)
                setConfirmRemove(false)
              }}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-pmb-green-900)] hover:text-[var(--color-pmb-green)]"
            >
              <Pencil className="h-3 w-3" />
              {referrer ? "Alterar" : "Atribuir"}
            </button>
          )}
        </div>

        {referrer ? (
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/revendedores/${referrer.id}`}
              className="inline-flex flex-1 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-[var(--color-pmb-green-900)] transition hover:border-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-lime-50)]/30"
            >
              <span className="font-medium">{referrer.name}</span>
              <span className="text-xs text-gray-500">/{referrer.slug}</span>
              <ExternalLink className="ml-auto h-3.5 w-3.5 text-gray-400" />
            </Link>
            {canGovernanca && !editingReferrer && (
              <Button
                size="sm"
                variant="outline"
                type="button"
                disabled={savingReferrer}
                onClick={() => {
                  if (!confirmRemove) {
                    setConfirmRemove(true)
                    return
                  }
                  saveReferrer(null)
                }}
                className={`shrink-0 ${confirmRemove ? "border-red-300 text-red-700 hover:bg-red-50" : ""}`}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                {confirmRemove ? "Confirmar remoção" : "Remover"}
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-500">
            Sem indicador — cadastro feito sem código de indicação.
          </div>
        )}

        {editingReferrer && (
          <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={referrerQuery}
                onChange={(e) => setReferrerQuery(e.target.value)}
                placeholder="Buscar unidade por nome, slug ou e-mail do titular…"
                autoFocus
                disabled={savingReferrer}
                className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"
              />
              <Button
                size="sm"
                variant="ghost"
                type="button"
                disabled={savingReferrer}
                onClick={() => {
                  setEditingReferrer(false)
                  setReferrerQuery("")
                  setReferrerOptions([])
                }}
                className="shrink-0"
              >
                Cancelar
              </Button>
            </div>

            {searchingReferrer && (
              <p className="text-[11px] text-gray-500">Buscando…</p>
            )}
            {!searchingReferrer &&
              referrerQuery.trim().length >= 2 &&
              referrerOptions.length === 0 && (
                <p className="text-[11px] text-gray-500">
                  Nenhuma unidade encontrada.
                </p>
              )}

            {referrerOptions.length > 0 && (
              <ul className="divide-y divide-gray-100 overflow-hidden rounded-md border border-gray-200 bg-white">
                {referrerOptions.map((opt) => (
                  <li key={opt.id}>
                    <button
                      type="button"
                      disabled={savingReferrer}
                      onClick={() => saveReferrer(opt.id)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-[var(--color-pmb-lime-50)]/40 disabled:opacity-50"
                    >
                      <span className="font-medium text-[var(--color-pmb-green-900)]">
                        {opt.name}
                      </span>
                      <span className="text-xs text-gray-500">/{opt.slug}</span>
                      <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-400">
                        {tenantStatusLabel(opt.status)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <p className="text-[11px] text-gray-500">
              Vale a partir da próxima apuração de comissão. Comissões já
              geradas não mudam de indicador.
            </p>
          </div>
        )}
      </div>

      {/* Elegibilidade (somente leitura).
          A EDICAO da regra de comissao — percentual, escala por tempo e minimo
          de indicacoes — vive agora no card unico "Regra de comissao de
          indicacao" (ResellerCommissionOverrideForm), logo abaixo. Antes havia
          um editor de % aqui e outro la, gravando a mesma coluna por caminhos
          diferentes: quem preenchia o daqui via o sistema pagar o padrao global. */}
      <div className="mt-5 space-y-2 border-t border-gray-100 pt-5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Elegibilidade
        </span>
        <div
          className={`rounded-md px-3 py-2 text-[11px] ${
            meetsMin
              ? "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-900)]"
              : "bg-amber-50 text-amber-800"
          }`}
        >
          {effectiveMin <= 0 ? (
            <>Sem mínimo — recebe comissão desde a 1ª indicação.</>
          ) : meetsMin ? (
            <>
              Elegível: {stats.activeReferrals} de {effectiveMin} indicações
              ativas. Já recebe comissão de recorrência.
            </>
          ) : (
            <>
              {stats.activeReferrals} de {effectiveMin} indicações ativas. As
              comissões ficam retidas e são geradas retroativamente ao atingir o
              mínimo.
            </>
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
          {/* ATIVOS, nao o total: o tile mostrava `totalReferrals` (toda unidade
              indicada, canceladas inclusive) sob o rotulo "Indicados ativos" e
              contradizia a linha de elegibilidade logo acima, que sempre usou
              `activeReferrals`. O total vai ao lado, no formato do hub. */}
          <div className="mt-1 text-lg font-semibold text-[var(--color-pmb-green-900)]">
            {stats.activeReferrals}
            {stats.totalReferrals > stats.activeReferrals ? (
              <span className="text-sm font-normal text-gray-400">
                {" "}
                / {stats.totalReferrals}
              </span>
            ) : null}
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
            Próximo pagamento
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
            Chave PIX para comissões
          </span>
        </div>
        {pixKey ? (
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">
              {pixKeyType ?? "Tipo não informado"}
            </div>
            <div className="font-mono text-sm text-[var(--color-pmb-green-900)]">
              {pixKey}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-500">
            Não cadastrado
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
          Relatório das comissões pagas neste mês (com totais e dados
          bancários).
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
