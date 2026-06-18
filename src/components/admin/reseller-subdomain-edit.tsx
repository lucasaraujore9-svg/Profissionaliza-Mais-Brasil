"use client"

import { useEffect, useState } from "react"
import { Globe, Save, Loader2, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ResellerCard } from "./reseller-card"

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
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    setValue(slug)
  }, [slug])

  const next = value.trim().toLowerCase()
  const changed = next !== slug

  async function save() {
    if (!changed) return
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
      setConfirmOpen(false)
      onSaved?.()
    } catch {
      toast.error("Erro de rede ao salvar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ResellerCard title="Subdomínio da vitrine" icon={Globe}>
      <p className="mt-1 text-xs text-gray-500">
        Endereço atual:{" "}
        <span className="font-medium text-gray-700">
          {slug}.{VITRINE_DOMAIN}
        </span>
      </p>

      <div className="mt-4 flex items-stretch overflow-hidden rounded-lg border border-gray-300 focus-within:border-[var(--color-pmb-green)] focus-within:ring-1 focus-within:ring-[var(--color-pmb-green)]">
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

      <div className="mt-3 flex items-start gap-2 rounded-lg bg-[var(--color-pmb-gold-50)] p-3 text-xs text-[var(--color-pmb-gold-600)]">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Ao salvar, o endereço antigo passa a redirecionar para o novo por 15
          dias e fica reservado nesse período. O cadastro do aluno na plataforma
          de aulas não muda.
        </span>
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          onClick={() => setConfirmOpen(true)}
          disabled={saving || !changed}
          size="sm"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Salvar subdomínio
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trocar subdomínio?</AlertDialogTitle>
            <AlertDialogDescription>
              Trocar o subdomínio de{" "}
              <span className="font-mono font-semibold">{slug}</span> para{" "}
              <span className="font-mono font-semibold">{next}</span>? O endereço
              antigo ({slug}.{VITRINE_DOMAIN}) vai redirecionar para o novo por
              15 dias e ficará reservado (indisponível para outras revendas)
              nesse período.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={saving}
            >
              Voltar
            </Button>
            <Button
              onClick={save}
              disabled={saving}
              className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
            >
              {saving ? "Salvando..." : "Trocar subdomínio"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ResellerCard>
  )
}
