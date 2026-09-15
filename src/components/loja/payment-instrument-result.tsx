"use client"

import { useState } from "react"
import { Copy, QrCode, Receipt } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

/**
 * PIX e boleto exibidos DENTRO da página de pagamento da plataforma. É o que o
 * aluno recebe depois de escolher o meio — nunca um link para a fatura do
 * gateway.
 */

async function copyText(text: string, onDone: () => void) {
  try {
    await navigator.clipboard.writeText(text)
    onDone()
  } catch {
    // ignora: o campo continua selecionável para copiar à mão
  }
}

export function PixInstrumentResult({
  qrCode,
  qrCodeBase64,
  waitingText,
  onChangeMethod,
}: {
  qrCode: string
  qrCodeBase64: string
  waitingText: string
  onChangeMethod?: () => void
}) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <div className="flex items-center gap-2">
        <QrCode className="h-5 w-5 text-[var(--color-pmb-green)]" />
        <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">Pague com PIX</h2>
      </div>
      <p className="mt-2 text-sm text-gray-600">
        Escaneie o QR Code abaixo ou copie o código para concluir o pagamento.
      </p>
      {qrCodeBase64 && (
        <div className="mt-6 flex justify-center">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`data:image/png;base64,${qrCodeBase64}`} alt="QR Code PIX" className="h-60 w-60" />
          </div>
        </div>
      )}
      <div className="mt-6 space-y-2">
        <Label>Código PIX copia e cola</Label>
        <div className="flex gap-2">
          <Input value={qrCode} readOnly className="font-mono text-xs" />
          <Button
            type="button"
            onClick={() => copyText(qrCode, () => {
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            })}
            variant="outline"
            className="shrink-0"
          >
            <Copy className="mr-2 h-4 w-4" />
            {copied ? "Copiado!" : "Copiar"}
          </Button>
        </div>
      </div>
      <p className="mt-6 rounded-xl bg-[var(--color-pmb-lime-50)]/40 p-4 text-sm text-[var(--color-pmb-green-700)]">
        {waitingText}
      </p>
      {onChangeMethod && <ChangeMethod onClick={onChangeMethod} />}
    </div>
  )
}

export function BoletoInstrumentResult({
  url,
  digitableLine,
  waitingText,
  onChangeMethod,
}: {
  url: string
  digitableLine?: string | null
  waitingText: string
  onChangeMethod?: () => void
}) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <div className="flex items-center gap-2">
        <Receipt className="h-5 w-5 text-[var(--color-pmb-green)]" />
        <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">Pague com boleto</h2>
      </div>
      <p className="mt-2 text-sm text-gray-600">
        Copie a linha digitável ou abra o boleto para pagar pelo banco ou app.
      </p>
      {digitableLine && (
        <div className="mt-6 space-y-2">
          <Label>Linha digitável</Label>
          <div className="flex gap-2">
            <Input value={digitableLine} readOnly className="font-mono text-xs" />
            <Button
              type="button"
              onClick={() => copyText(digitableLine, () => {
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              })}
              variant="outline"
              className="shrink-0"
            >
              <Copy className="mr-2 h-4 w-4" />
              {copied ? "Copiado!" : "Copiar"}
            </Button>
          </div>
        </div>
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-[var(--color-pmb-green)] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--color-pmb-green-700)]"
      >
        Abrir boleto
      </a>
      <p className="mt-6 rounded-xl bg-[var(--color-pmb-lime-50)]/40 p-4 text-sm text-[var(--color-pmb-green-700)]">
        {waitingText}
      </p>
      {onChangeMethod && <ChangeMethod onClick={onChangeMethod} />}
    </div>
  )
}

function ChangeMethod({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-4 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50"
    >
      Escolher outra forma de pagamento
    </button>
  )
}
