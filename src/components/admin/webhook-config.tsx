"use client"

import { useState } from "react"
import { ChevronDown, Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const LOGS = [
  { id: "w01", data: "08/04/2026 14:22", origem: "Asaas", evento: "PAYMENT_RECEIVED", status: "sucesso" as const },
  { id: "w02", data: "08/04/2026 12:08", origem: "Mercado Pago", evento: "payment.approved", status: "sucesso" as const },
  { id: "w03", data: "08/04/2026 09:41", origem: "Asaas", evento: "PAYMENT_OVERDUE", status: "sucesso" as const },
  { id: "w04", data: "07/04/2026 18:33", origem: "Mercado Pago", evento: "payment.cancelled", status: "falha" as const },
  { id: "w05", data: "07/04/2026 15:12", origem: "Asaas", evento: "SUBSCRIPTION_CANCELLED", status: "sucesso" as const },
]

export function WebhookConfig() {
  const [show, setShow] = useState(false)
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[#1A1A2E]">Webhook secrets</h3>
        <p className="mt-1 text-xs text-gray-600">
          Segredos usados para validar assinaturas HMAC nos callbacks de Asaas e MP.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="wh-asaas">Asaas Webhook Token</Label>
            <div className="relative mt-1.5">
              <Input
                id="wh-asaas"
                type={show ? "text" : "password"}
                defaultValue="asaas_whk_9f2a7b1c0d8e4f6a3b2c1d0e9f8a7b6c"
                readOnly
                className="pr-10 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-500 hover:bg-gray-100"
                aria-label={show ? "Ocultar" : "Mostrar"}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <Label htmlFor="wh-mp">Mercado Pago Secret</Label>
            <div className="relative mt-1.5">
              <Input
                id="wh-mp"
                type={show ? "text" : "password"}
                defaultValue="mp_whk_87c5a3e2f1b0d9c8a7b6e5d4f3c2b1a0"
                readOnly
                className="pr-10 font-mono text-xs"
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button className="bg-blue-600 text-white hover:bg-blue-700">
            Rotacionar secrets
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between px-6 py-4 text-left"
        >
          <div>
            <h3 className="text-sm font-semibold text-[#1A1A2E]">Histórico de webhooks</h3>
            <p className="mt-0.5 text-xs text-gray-600">
              Eventos recebidos e processados nas últimas 24h.
            </p>
          </div>
          <ChevronDown
            className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open && (
          <div className="overflow-x-auto border-t border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-6 py-3 font-medium">Data</th>
                  <th className="px-6 py-3 font-medium">Origem</th>
                  <th className="px-6 py-3 font-medium">Evento</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {LOGS.map((log) => (
                  <tr key={log.id} className="border-t border-gray-100">
                    <td className="px-6 py-3 font-mono text-xs text-gray-700">{log.data}</td>
                    <td className="px-6 py-3 text-xs text-gray-600">{log.origem}</td>
                    <td className="px-6 py-3 font-mono text-xs text-[#1A1A2E]">{log.evento}</td>
                    <td className="px-6 py-3">
                      {log.status === "sucesso" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Sucesso
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600">
                          <XCircle className="h-3.5 w-3.5" />
                          Falha
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
