"use client"

import { useEffect, useState } from "react"
import { Globe, Save, Loader2, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

const VITRINE_DOMAIN = process.env.NEXT_PUBLIC_VITRINE_DOMAIN ?? "livrecursos.com.br"

interface ResellerSubdomainEditProps {
  tenantId: string
  slug: string
  onSaved?: () => void
}

/**
 * Edicao do subdominio (slug) da revenda. Renderizado SOMENTE para quem tem
 * permissao (SUPER_ADMIN, ou o gerente de revendedores dono da unidade) — a
 * checagem fica no chamador; a rota PATCH .../slug e a fonte de verdade.
 */
export function ResellerSubdomainEdit({
  tenantId,
  slug,
  onSaved,
}: ResellerSubdomainEditProps) {
  const [value, setValue] = useState(slug)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValue(slug)
  }, [slug])

  const next = value.trim().toLowerCase()
  const changed = next !== slug

  async function save() {
    if (!changed) return
    const confirmed = window.confirm(
      `Trocar o subdomínio de "${slug}" para "${next}"?\n\n` +
        `O endereço antigo (${slug}.${VITRINE_DOMAIN}) vai redirecionar para o ` +
        `novo por 15 dias e ficará reservado (indisponível para outras revendas) ` +
        `nesse período.`,
    )
    if (!confirmed) return

    setSaving(true)
    try {
      const res = await fetch(`/api/admin/revendedores/${tenantId}/slug`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: next }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao alterar subdomínio")
        return
      }
      toast.success("Subdomínio alterado")
      onSaved?.()
    } catch {
      toast.error("Erro de rede ao salvar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-[var(--color-pmb-green)]" />
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Subdomínio da vitrine
        </h3>
      </div>

      <p className="mt-1 text-xs text-gray-500">
        Endereço atual:{" "}
        <span className="font-medium text-gray-700">
          {slug}.{VITRINE_DOMAIN}
        </span>
      </p>

      <div className="mt-4 flex items-stretch overflow-hidden rounded-lg border border-gray-300 focus-within:border-[var(--color-pmb-green)]">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          className="min-w-0 flex-1 px-3 py-2 text-sm outline-none"
          placeholder="novo-subdominio"
        />
        <span className="flex items-center bg-gray-50 px-3 text-xs text-gray-500">
          .{VITRINE_DOMAIN}
        </span>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Ao salvar, o endereço antigo passa a redirecionar para o novo por 15
          dias e fica reservado nesse período. O cadastro do aluno na plataforma
          de aulas não muda.
        </span>
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={save} disabled={saving || !changed} size="sm">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Salvar subdomínio
        </Button>
      </div>
    </div>
  )
}
