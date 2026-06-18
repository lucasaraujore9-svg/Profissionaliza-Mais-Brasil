"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Save, Info, CheckCircle2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

type TemplateKey =
  | "FORM_SUBMITTED"
  | "CHECKOUT_ABANDONED"
  | "PURCHASE_CONFIRMED"
  | "WELCOME"

interface Template {
  id: string
  key: TemplateKey
  body: string
  enabled: boolean
}

const KEY_META: Record<
  TemplateKey,
  { label: string; description: string; trigger: string }
> = {
  FORM_SUBMITTED: {
    label: "Formulário preenchido",
    description: "Enviado quando alguém preenche o formulário na página do curso.",
    trigger: "Form na vitrine",
  },
  CHECKOUT_ABANDONED: {
    label: "Carrinho abandonado",
    description: "Enviado após X horas sem pagamento depois de iniciar checkout.",
    trigger: "Cron de abandono",
  },
  PURCHASE_CONFIRMED: {
    label: "Compra confirmada",
    description: "Enviado quando o pagamento é aprovado pelo Mercado Pago.",
    trigger: "Webhook MP",
  },
  WELCOME: {
    label: "Boas-vindas (manual)",
    description: "Disponível para envio manual a partir do detalhe do lead.",
    trigger: "Ação manual",
  },
}

const TEMPLATE_ORDER: TemplateKey[] = [
  "FORM_SUBMITTED",
  "CHECKOUT_ABANDONED",
  "PURCHASE_CONFIRMED",
  "WELCOME",
]

const VARIABLES = [
  { token: "{{aluno_nome}}", desc: "Nome do aluno (form ou cadastro)" },
  { token: "{{curso}}", desc: "Nome do curso de interesse" },
  { token: "{{escola}}", desc: "Nome da sua unidade" },
  { token: "{{link_curso}}", desc: "Link da página do curso na vitrine" },
  { token: "{{valor}}", desc: "Valor (quando aplicável)" },
]

interface MessageTemplateEditorProps {
  /** Base da API. Default = painel do revendedor. PMB usa "/api/admin/automacao". */
  apiBase?: string
}

export function MessageTemplateEditor({
  apiBase = "/api/painel/automacao",
}: MessageTemplateEditorProps = {}) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${apiBase}/templates`, {
        cache: "no-store",
      })
      const body = await res.json()
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao carregar templates")
        return
      }
      setTemplates(body.data)
    } catch {
      toast.error("Erro de rede")
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    load()
  }, [load])

  function update(key: TemplateKey, patch: Partial<Template>) {
    setSavedOk(false)
    setTemplates((prev) =>
      prev.map((t) => (t.key === key ? { ...t, ...patch } : t)),
    )
  }

  async function save() {
    setSaving(true)
    setSavedOk(false)
    try {
      const res = await fetch(`${apiBase}/templates`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templates: templates.map((t) => ({
            key: t.key,
            body: t.body,
            enabled: t.enabled,
          })),
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao salvar")
        return
      }
      toast.success("Templates atualizados")
      setSavedOk(true)
    } catch {
      toast.error("Erro de rede")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white py-16 text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Carregando…
      </div>
    )
  }

  const sorted = [...templates].sort(
    (a, b) => TEMPLATE_ORDER.indexOf(a.key) - TEMPLATE_ORDER.indexOf(b.key),
  )

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--color-pmb-cyan)]/25 bg-[var(--color-pmb-cyan-50)] p-4 text-xs text-[var(--color-pmb-cyan-700)]">
        <p className="flex items-center gap-1.5 font-semibold">
          <Info className="h-3.5 w-3.5" />
          Variáveis disponíveis
        </p>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {VARIABLES.map((v) => (
            <li key={v.token}>
              <code className="rounded bg-white px-1.5 py-0.5 text-[11px] font-mono text-[var(--color-pmb-cyan-700)] ring-1 ring-[var(--color-pmb-cyan)]/25">
                {v.token}
              </code>{" "}
              <span>— {v.desc}</span>
            </li>
          ))}
        </ul>
      </div>

      {sorted.map((t) => {
        const meta = KEY_META[t.key]
        return (
          <div
            key={t.key}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[var(--color-pmb-green-900)]">
                    {meta.label}
                  </h3>
                  <span className="rounded-full bg-[var(--color-pmb-mist)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    {meta.trigger}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-600">{meta.description}</p>
              </div>
              <Label
                htmlFor={`tpl-${t.key}`}
                className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-gray-700"
              >
                <Switch
                  id={`tpl-${t.key}`}
                  checked={t.enabled}
                  onCheckedChange={(v) => update(t.key, { enabled: v })}
                />
                {t.enabled ? "Ativo" : "Inativo"}
              </Label>
            </div>

            <textarea
              value={t.body}
              onChange={(e) => update(t.key, { body: e.target.value })}
              rows={4}
              maxLength={2000}
              className="mt-3 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-pmb-green)]"
            />
            <p
              className={`mt-1 text-right text-[11px] ${
                t.body.length > 1900 ? "font-semibold text-amber-600" : "text-gray-400"
              }`}
            >
              {t.body.length.toLocaleString("pt-BR")} / 2.000 caracteres
            </p>
          </div>
        )
      })}

      {savedOk && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          Templates salvos. As próximas mensagens já usam os novos textos.
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-pmb-green-700)] disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Salvar templates
        </button>
      </div>
    </div>
  )
}
