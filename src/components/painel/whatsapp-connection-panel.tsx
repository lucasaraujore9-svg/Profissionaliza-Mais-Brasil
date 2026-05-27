"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import { toast } from "sonner"
import {
  Loader2,
  Smartphone,
  CheckCircle2,
  XCircle,
  Power,
  RefreshCw,
  QrCode,
} from "lucide-react"

type WaStatus =
  | "DISCONNECTED"
  | "CONNECTING"
  | "SCAN_QR_CODE"
  | "WORKING"
  | "FAILED"

interface PanelProps {
  initialStatus: string
  initialPhone: string | null
  /** Base da API. Default = painel do revendedor. PMB usa "/api/admin/automacao". */
  apiBase?: string
}

const POLL_MS = 3500

export function WhatsAppConnectionPanel({
  initialStatus,
  initialPhone,
  apiBase = "/api/painel/automacao",
}: PanelProps) {
  const [status, setStatus] = useState<WaStatus>(initialStatus as WaStatus)
  const [phone, setPhone] = useState<string | null>(initialPhone)
  const [qr, setQr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pollingError, setPollingError] = useState<string | null>(null)

  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearPolling = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/whatsapp/status`, {
        cache: "no-store",
      })
      const body = await res.json()
      if (!res.ok) {
        setPollingError(body.error ?? "Falha ao consultar status")
        return
      }
      setPollingError(body.data.error ?? null)
      setStatus(body.data.status)
      setPhone(body.data.connectedPhone)
      setQr(body.data.qrDataUrl)
      if (body.data.status === "WORKING" || body.data.status === "FAILED") {
        clearPolling()
      } else {
        pollingRef.current = setTimeout(poll, POLL_MS)
      }
    } catch {
      setPollingError("Erro de rede")
    }
  }, [clearPolling])

  useEffect(() => () => clearPolling(), [clearPolling])

  // Inicia polling automaticamente se ja esta em estado intermediario
  useEffect(() => {
    if (status === "CONNECTING" || status === "SCAN_QR_CODE") {
      poll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function connect() {
    setBusy(true)
    setPollingError(null)
    try {
      const res = await fetch(`${apiBase}/whatsapp/connect`, {
        method: "POST",
      })
      const body = await res.json()
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao conectar")
        return
      }
      setStatus(body.data.status)
      setPhone(body.data.connectedPhone)
      setQr(body.data.qrDataUrl)
      if (body.data.status !== "WORKING" && body.data.status !== "FAILED") {
        clearPolling()
        pollingRef.current = setTimeout(poll, POLL_MS)
      }
    } catch {
      toast.error("Erro de rede")
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    if (!confirm("Desconectar o WhatsApp? Os disparos automáticos vão parar.")) return
    setBusy(true)
    try {
      const res = await fetch(`${apiBase}/whatsapp/disconnect`, {
        method: "POST",
      })
      const body = await res.json()
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao desconectar")
        return
      }
      clearPolling()
      setStatus("DISCONNECTED")
      setPhone(null)
      setQr(null)
      toast.success("WhatsApp desconectado")
    } catch {
      toast.error("Erro de rede")
    } finally {
      setBusy(false)
    }
  }

  const isConnected = status === "WORKING"
  const showQr = status === "SCAN_QR_CODE" && qr

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">
          Status atual
        </h2>

        <div className="mt-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          {isConnected ? (
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          ) : (
            <XCircle className="h-6 w-6 text-gray-400" />
          )}
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
              {labelFor(status)}
            </p>
            {phone && (
              <p className="font-mono text-xs text-gray-600">{phone}</p>
            )}
          </div>
        </div>

        {pollingError && (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            {pollingError}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {!isConnected && (
            <button
              onClick={connect}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-pmb-green)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--color-pmb-green-700)] disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Smartphone className="h-3.5 w-3.5" />
              )}
              Iniciar conexão
            </button>
          )}
          {(status === "CONNECTING" || status === "SCAN_QR_CODE") && (
            <button
              onClick={poll}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar status
            </button>
          )}
          {(isConnected || status === "FAILED") && (
            <button
              onClick={disconnect}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <Power className="h-3.5 w-3.5" />
              Desconectar
            </button>
          )}
        </div>

        <ul className="mt-6 list-disc space-y-1 pl-5 text-xs text-gray-600">
          <li>Use um número exclusivo da unidade (não use o pessoal).</li>
          <li>O número precisa estar ativo no app oficial WhatsApp.</li>
          <li>Não desconecte se quiser que mensagens automáticas sigam disparando.</li>
        </ul>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--color-pmb-green-900)]">
          <QrCode className="h-4 w-4" />
          QR Code
        </h2>

        {showQr ? (
          <div className="mt-4 space-y-3">
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-2">
              <Image
                src={qr}
                alt="QR Code WhatsApp"
                width={300}
                height={300}
                className="h-auto w-full"
                unoptimized
              />
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-xs text-gray-600">
              <li>Abra o WhatsApp no celular da unidade.</li>
              <li>Vá em <strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong>.</li>
              <li>Aponte a câmera para este QR.</li>
            </ol>
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-xs text-gray-500">
            {isConnected
              ? "Já conectado. Sem QR para exibir."
              : status === "CONNECTING"
                ? "Aguardando o engine gerar o QR…"
                : "Clique em \"Iniciar conexão\" para gerar o QR."}
          </p>
        )}
      </div>
    </div>
  )
}

function labelFor(status: WaStatus): string {
  if (status === "WORKING") return "Conectado e pronto"
  if (status === "CONNECTING") return "Conectando…"
  if (status === "SCAN_QR_CODE") return "Aguardando você escanear o QR"
  if (status === "FAILED") return "Falha na conexão"
  return "Desconectado"
}
