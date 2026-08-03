"use client"

import { useEffect, useState } from "react"
import { Loader2, Phone, Save } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatPhone, isValidPhone } from "@/lib/validation/phone"
import { ResellerCard } from "./reseller-card"

interface ResellerOwnerContactProps {
  tenantId: string
  ownerName: string | null
  ownerEmail: string | null
  ownerPhone: string | null
  /** `unidades.manage`: sem isso o card só mostra o contato. */
  canManage: boolean
  onSaved?: () => void
}

/**
 * Contato do titular da unidade. O telefone é coletado no cadastro da revenda
 * (`User.phone`) e antes não aparecia em lugar nenhum do admin — nem para
 * consultar, nem para corrigir quando a pessoa trocava de número.
 *
 * O campo só é editável com `unidades.manage`; a rota PATCH .../owner revalida
 * a permissão e o recorte de carteira.
 */
export function ResellerOwnerContact({
  tenantId,
  ownerName,
  ownerEmail,
  ownerPhone,
  canManage,
  onSaved,
}: ResellerOwnerContactProps) {
  const [value, setValue] = useState(ownerPhone ?? "")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValue(ownerPhone ?? "")
  }, [ownerPhone])

  const next = value.trim()
  const changed = next !== (ownerPhone ?? "")
  // Vazio é válido: apaga o telefone (o campo é opcional no cadastro).
  const invalid = next !== "" && !isValidPhone(next)

  async function save() {
    if (!changed || invalid) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/revendedores/${tenantId}/owner`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: next }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? "Falha ao salvar telefone")
        return
      }
      toast.success(next ? "Telefone atualizado" : "Telefone removido")
      onSaved?.()
    } catch {
      toast.error("Erro de rede ao salvar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ResellerCard
      title="Contato do titular"
      icon={Phone}
      description="Dados da pessoa responsável pela unidade, informados no cadastro."
    >
      <dl className="mt-4 space-y-2 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-gray-500">Nome</dt>
          <dd className="text-right font-medium text-gray-800">
            {ownerName ?? "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-gray-500">E-mail</dt>
          <dd className="text-right font-medium break-all text-gray-800">
            {ownerEmail ?? "—"}
          </dd>
        </div>
        {!canManage && (
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">Telefone</dt>
            <dd className="text-right font-medium text-gray-800">
              {ownerPhone ? formatPhone(ownerPhone) : "—"}
            </dd>
          </div>
        )}
      </dl>

      {canManage && (
        <div className="mt-4">
          <Label htmlFor="owner-phone" className="text-xs">
            Telefone
          </Label>
          <Input
            id="owner-phone"
            type="tel"
            inputMode="tel"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="(11) 99999-9999"
            className="mt-1.5"
          />
          {invalid ? (
            <p className="mt-1 text-xs text-red-600">
              Informe DDD + número (10 ou 11 dígitos).
            </p>
          ) : (
            <p className="mt-1 text-xs text-gray-500">
              Deixe em branco para remover o telefone.
            </p>
          )}

          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              onClick={save}
              disabled={saving || !changed || invalid}
              className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar telefone
            </Button>
          </div>
        </div>
      )}
    </ResellerCard>
  )
}
