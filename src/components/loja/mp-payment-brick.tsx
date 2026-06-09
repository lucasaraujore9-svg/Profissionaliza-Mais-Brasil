"use client"

import { useEffect, useRef, useState } from "react"
import { initMercadoPago, Payment } from "@mercadopago/sdk-react"
import { Copy, Check, FileText, Loader2, AlertCircle } from "lucide-react"
import { clientLogger } from "@/lib/logger-client"

/**
 * Resultado de um pagamento pendente (PIX ou boleto) devolvido pelo endpoint
 * /process. Renderizado inline — o comprador NÃO sai do site.
 */
interface PendingResult {
  method: "pix" | "boleto"
  pix?: { qrCode: string; qrCodeBase64: string; ticketUrl?: string }
  boleto?: { url: string; digitableLine?: string }
}

export interface MpPaymentBrickProps {
  publicKey: string
  /** Valor a cobrar (já com cupom aplicado). */
  amount: number
  payerEmail: string
  enrollmentId: string
  /** Endpoint que recebe o formData do Brick e cria o pagamento no MP. */
  processUrl: string
  /** Endpoint de polling do status (PIX/boleto). */
  statusUrl: string
  /** Para onde redirecionar quando o pagamento for aprovado. */
  successUrl: string
  /** one_time aceita cartão+PIX+boleto; subscription é só cartão. */
  mode: "one_time" | "subscription"
  maxInstallments?: number
}

let mpInitialized = false

export function MpPaymentBrick({
  publicKey,
  amount,
  payerEmail,
  enrollmentId,
  processUrl,
  statusUrl,
  successUrl,
  mode,
  maxInstallments = 1,
}: MpPaymentBrickProps) {
  const [pending, setPending] = useState<PendingResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!mpInitialized) {
      initMercadoPago(publicKey, { locale: "pt-BR" })
      mpInitialized = true
    }
  }, [publicKey])

  // Polling do status quando há PIX/boleto pendente — confirma via webhook e
  // redireciona o comprador automaticamente quando o pagamento cair.
  useEffect(() => {
    if (!pending) return
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `${statusUrl}?enrollment_id=${encodeURIComponent(enrollmentId)}`,
          { cache: "no-store" },
        )
        if (!res.ok) return
        const json = await res.json()
        if (json.data?.paid) {
          if (pollRef.current) clearInterval(pollRef.current)
          window.location.href = successUrl
        }
      } catch {
        // silencioso — próximo tick tenta de novo
      }
    }, 4000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [pending, statusUrl, enrollmentId, successUrl])

  // formData é tipado contextualmente pelo Brick (interseção cartão/PIX/boleto).
  // Repassamos opaco (unknown) ao backend, que valida com Zod — evita acoplar o
  // client ao shape interno do SDK.
  async function submitPayment(formData: unknown) {
    setErrorMsg(null)
    try {
      const res = await fetch(processUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentId, formData }),
      })
      const json = await res.json()

      if (!res.ok) {
        setErrorMsg(json.error ?? "Não foi possível processar o pagamento.")
        // Rejeita para o Brick reabilitar o formulário.
        throw new Error(json.error ?? "payment_failed")
      }

      const status: string = json.data?.status
      if (status === "approved" || status === "authorized") {
        window.location.href = successUrl
        return
      }

      // PIX / boleto → pendente, renderiza inline.
      if (json.data?.pix) {
        setPending({ method: "pix", pix: json.data.pix })
        return
      }
      if (json.data?.boleto) {
        setPending({ method: "boleto", boleto: json.data.boleto })
        return
      }

      // Pendente sem dados de pagamento (ex.: cartão em análise).
      setErrorMsg(
        "Seu pagamento está em análise. Assim que for aprovado, liberamos seu acesso por e-mail.",
      )
    } catch (err) {
      clientLogger.error(
        { err: String(err), event: "mp_brick.submit_failed", enrollmentId },
        "submit do Payment Brick falhou",
      )
      // Re-throw para o Brick tratar (reabilita o botão). errorMsg já setado.
      throw err
    }
  }

  function copyPix() {
    const code = pending?.pix?.qrCode
    if (!code) return
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  if (pending?.method === "pix" && pending.pix) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm lg:p-8">
        <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">
          Pague com PIX para liberar seu acesso
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Escaneie o QR Code ou copie o código abaixo. A confirmação é
          automática.
        </p>
        {pending.pix.qrCodeBase64 && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`data:image/png;base64,${pending.pix.qrCodeBase64}`}
            alt="QR Code PIX"
            className="mx-auto mt-6 h-56 w-56"
          />
        )}
        <button
          type="button"
          onClick={copyPix}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-pmb-green-700)]"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copiado!" : "Copiar código PIX"}
        </button>
        <p className="mt-4 break-all rounded-lg bg-gray-50 p-3 text-left font-mono text-xs text-gray-600">
          {pending.pix.qrCode}
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Aguardando confirmação do pagamento…
        </div>
      </div>
    )
  }

  if (pending?.method === "boleto" && pending.boleto) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm lg:p-8">
        <FileText className="mx-auto h-10 w-10 text-[var(--color-pmb-green)]" />
        <h2 className="mt-3 text-base font-semibold text-[var(--color-pmb-green-900)]">
          Boleto gerado
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          O acesso é liberado após a compensação (até 2 dias úteis).
        </p>
        {pending.boleto.digitableLine && (
          <p className="mt-4 break-all rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-600">
            {pending.boleto.digitableLine}
          </p>
        )}
        <a
          href={pending.boleto.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-pmb-green-700)]"
        >
          <FileText className="h-4 w-4" />
          Abrir boleto
        </a>
        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Aguardando compensação…
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {errorMsg && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}
      <Payment
        initialization={{ amount, payer: { email: payerEmail } }}
        customization={{
          paymentMethods:
            mode === "subscription"
              ? { creditCard: "all", maxInstallments: 1 }
              : {
                  creditCard: "all",
                  debitCard: "all",
                  bankTransfer: "all",
                  ticket: "all",
                  maxInstallments,
                },
        }}
        onSubmit={async ({ formData }) => {
          await submitPayment(formData)
        }}
        onError={(error) => {
          clientLogger.error(
            { err: String(error?.message ?? error), event: "mp_brick.error", enrollmentId },
            "Payment Brick erro",
          )
        }}
      />
    </div>
  )
}
