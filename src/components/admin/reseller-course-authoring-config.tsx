"use client"

import { useEffect, useState } from "react"
import { BookPlus, Save, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

interface ResellerCourseAuthoringConfigProps {
  tenantId: string
  courseAuthoringEnabled: boolean
  /** Carteira Asaas da unidade: sem ela o curso não sai da vitrine dela. */
  asaasWalletId?: string | null
  onSaved?: () => void
}

/**
 * Liga/desliga o módulo "Produzir cursos" da unidade — ela cria curso próprio,
 * define o preço mínimo e a comissão de quem vender, e pode publicar além da
 * própria vitrine.
 *
 * É habilitação COMERCIAL, por unidade. A permissão `cursosAutorais.*` é outra
 * coisa: diz QUEM, dentro da unidade, opera o módulo depois de ligado — e o
 * preset do dono é acesso total, então sem esta chave toda revenda produziria
 * curso. Só `unidades.governanca`.
 */
export function ResellerCourseAuthoringConfig({
  tenantId,
  courseAuthoringEnabled,
  asaasWalletId,
  onSaved,
}: ResellerCourseAuthoringConfigProps) {
  const [enabled, setEnabled] = useState(courseAuthoringEnabled)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setEnabled(courseAuthoringEnabled)
  }, [courseAuthoringEnabled])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/course-authoring`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao salvar")
        return
      }
      toast.success(
        enabled ? "Produção de cursos liberada" : "Produção de cursos desativada",
      )
      onSaved?.()
    } catch {
      toast.error("Erro de rede ao salvar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookPlus className="h-4 w-4 text-[var(--color-pmb-green)]" />
          <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Produzir cursos
          </h3>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            courseAuthoringEnabled
              ? "bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-900)]"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {courseAuthoringEnabled ? "Ativo" : "Desativado"}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-600">
        Permite que esta unidade crie cursos próprios, suba o conteúdo na
        plataforma de aulas e defina o preço mínimo e a comissão de quem vender.
        Publicando além da vitrine dela, o rateio da venda é automático.
      </p>

      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 transition hover:border-[var(--color-pmb-green)]">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[var(--color-pmb-green)] focus:ring-[var(--color-pmb-green)]"
        />
        <div className="flex-1">
          <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Habilitar produção de cursos para esta unidade
          </p>
          <p className="text-xs text-gray-500">
            Mostra a aba “Meus cursos” em Catálogo, no painel da unidade.
          </p>
        </div>
      </label>

      {enabled && !asaasWalletId && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Esta unidade ainda não tem carteira Asaas. Ela consegue criar o curso e
          vendê-lo na própria vitrine, mas publicar para a PMB ou para a rede vai
          pedir a conta Asaas conectada — é para ela que o repasse é enviado.
        </p>
      )}

      {courseAuthoringEnabled && !enabled && (
        <p className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
          Desativar fecha a criação e a edição. Os cursos que a unidade já
          publicou continuam à venda e os alunos seguem com acesso — para tirar
          um do ar, use “Pausar” em Catálogo → Cursos das unidades.
        </p>
      )}

      <div className="mt-5 flex justify-end">
        <Button
          size="sm"
          type="button"
          onClick={save}
          disabled={saving || enabled === courseAuthoringEnabled}
          className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
        >
          {saving ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Salvando…
            </>
          ) : (
            <>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              Salvar
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
