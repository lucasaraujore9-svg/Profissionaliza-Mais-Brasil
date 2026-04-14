"use client"

import { CheckCircle2, XCircle } from "lucide-react"

export interface WebhookConfigData {
  asaasTokenConfigured: boolean
  cronSecretConfigured: boolean
}

interface WebhookConfigProps {
  config: WebhookConfigData
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
      <CheckCircle2 className="h-3 w-3" />
      {label}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
      <XCircle className="h-3 w-3" />
      Não configurado
    </span>
  )
}

export function WebhookConfig({ config }: WebhookConfigProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[#1A1A2E]">Webhook secrets</h3>
        <p className="mt-1 text-xs text-gray-600">
          Segredos usados para validar assinaturas HMAC nos callbacks de Asaas e MP, e
          autenticar chamadas de cron.
        </p>

        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div>
              <p className="text-xs font-semibold text-[#1A1A2E]">Asaas Webhook Token</p>
              <p className="mt-0.5 text-[11px] text-gray-600">
                Variável <code className="font-mono">ASAAS_WEBHOOK_TOKEN</code>
              </p>
            </div>
            <StatusBadge ok={config.asaasTokenConfigured} label="Configurado" />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div>
              <p className="text-xs font-semibold text-[#1A1A2E]">Cron Secret</p>
              <p className="mt-0.5 text-[11px] text-gray-600">
                Variável <code className="font-mono">CRON_SECRET</code>
              </p>
            </div>
            <StatusBadge ok={config.cronSecretConfigured} label="Configurado" />
          </div>
        </div>

        <p className="mt-5 text-[11px] text-gray-500">
          Para rotacionar secrets, edite as variáveis de ambiente no Vercel e faça redeploy.
        </p>
      </div>
    </div>
  )
}
