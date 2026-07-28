"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ReceiptText, X } from "lucide-react"
import type { TenantBillingSummary, TenantCharge } from "@/lib/tenant-billing/types"
import { payUrlFor } from "@/lib/tenant-billing/types"
import {
  URGENCY_STYLE,
  billingTypeLabel,
  dueLabel,
  formatDueDate,
  formatMoney,
} from "./charge-presentation"

/**
 * Pop-up de vencimento da mensalidade, exibido ao entrar no painel.
 *
 * REGRA DE EXIBIÇÃO — uma vez por dia, por conjunto de cobranças:
 *   • aparece no primeiro carregamento do painel do dia (na prática, logo após
 *     o login, que cai em /painel);
 *   • não reaparece a cada navegação — seria ruído, e ruído ensina o usuário a
 *     fechar sem ler, que é o oposto do objetivo;
 *   • volta a aparecer no mesmo dia se o conjunto MUDAR (cobrança nova, ou uma
 *     que passou a estar vencida), porque aí é informação que ele ainda não viu.
 *
 * A dispensa é local (localStorage): é preferência de exibição, não estado de
 * negócio. O aviso "de verdade" continua na notificação in-app, no email e no
 * card do dashboard — fechar o pop-up não apaga nada.
 */
const STORAGE_KEY = "pmb:billing-popup:dismissed:v1"

/** Identidade do conjunto exibido: mudou o conteúdo, mostra de novo. */
function signatureOf(charges: TenantCharge[]): string {
  return charges
    .map((c) => `${c.id}:${c.urgency}`)
    .sort()
    .join("|")
}

function todayKey(): string {
  return new Date().toLocaleDateString("en-CA")
}

function wasDismissedToday(signature: string): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const saved = JSON.parse(raw) as { day?: string; signature?: string }
    return saved.day === todayKey() && saved.signature === signature
  } catch {
    // localStorage indisponível (modo privado/quota): mostrar é o fail-safe.
    return false
  }
}

function rememberDismissal(signature: string): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ day: todayKey(), signature }),
    )
  } catch {
    // sem persistência, o pop-up reaparece na próxima navegação — aceitável
  }
}

export function BillingReminderPopup() {
  const [charges, setCharges] = useState<TenantCharge[] | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch("/api/painel/cobrancas?history=0", {
          cache: "no-store",
        })
        // 403 = consultor (não é dono): sem pop-up financeiro, e sem barulho.
        if (!res.ok || !active) return
        const json = (await res.json()) as { data?: TenantBillingSummary }
        const alerts = json.data?.alerts ?? []
        if (!active || alerts.length === 0) return
        if (wasDismissedToday(signatureOf(alerts))) return
        setCharges(alerts)
        setOpen(true)
      } catch {
        // rede fora: o card do dashboard e o menu seguem cobrindo o aviso
      }
    })()
    return () => {
      active = false
    }
  }, [])

  if (!open || !charges || charges.length === 0) return null

  function dismiss() {
    if (charges) rememberDismissal(signatureOf(charges))
    setOpen(false)
  }

  const hasOverdue = charges.some((c) => c.urgency === "overdue")
  const total = charges.reduce((sum, c) => sum + c.amount, 0)
  const first = charges[0]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="billing-popup-title"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div
          className={`flex items-start gap-3 border-b p-5 ${
            hasOverdue
              ? "border-rose-100 bg-rose-50"
              : "border-amber-100 bg-amber-50"
          }`}
        >
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              hasOverdue
                ? "bg-rose-100 text-rose-600"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {hasOverdue ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <ReceiptText className="h-5 w-5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="billing-popup-title"
              className="text-base font-bold text-[var(--color-pmb-green-900)]"
            >
              {hasOverdue
                ? "Você tem mensalidade vencida"
                : first.daysUntilDue === 0
                  ? "Sua mensalidade vence hoje"
                  : "Sua mensalidade está próxima do vencimento"}
            </h2>
            <p className="mt-0.5 text-xs text-gray-700">
              {hasOverdue
                ? "Regularize para manter sua vitrine no ar e evitar o bloqueio dos seus alunos."
                : "Pague por PIX, boleto ou cartão sem sair do sistema."}
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Fechar aviso"
            className="shrink-0 rounded-lg p-1 text-gray-500 transition-colors hover:bg-white/60 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto px-5">
          {charges.map((charge) => {
            const style = URGENCY_STYLE[charge.urgency]
            return (
              <li
                key={charge.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                    {formatMoney(charge.amount)}
                  </p>
                  <p className="text-[11px] text-gray-600">
                    {billingTypeLabel(charge.billingType)} · vence{" "}
                    {formatDueDate(charge.dueDate)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.badge}`}
                >
                  {dueLabel(charge.daysUntilDue)}
                </span>
              </li>
            )
          })}
        </ul>

        <div className="flex flex-col gap-2 border-t border-gray-100 p-5 sm:flex-row-reverse">
          <Link
            href={charges.length === 1 ? payUrlFor(first) : "/painel/cobrancas"}
            onClick={dismiss}
            className="inline-flex flex-1 items-center justify-center rounded-lg bg-[var(--color-pmb-green)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-pmb-green-700)]"
          >
            {charges.length === 1
              ? `Pagar ${formatMoney(total)}`
              : `Ver ${charges.length} cobranças`}
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex flex-1 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            Lembrar depois
          </button>
        </div>
      </div>
    </div>
  )
}
