"use client"

import { useMemo } from "react"
import { AlertTriangle, ChevronDown } from "lucide-react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { PMB_ROLE_LABEL, PMB_TEAM_ROLES, type PmbTeamRole } from "@/lib/auth/roles"
import {
  ADMIN_PERMISSION_GROUPS,
  ADMIN_ROLE_PRESETS,
  SENSITIVE,
  SUPER_EXCLUSIVE,
  adminRoleDescription,
  resolveAdminPermissions,
  type AdminPermission,
} from "@/lib/auth/admin-permissions"

const SUPER_EXCLUSIVE_SET = new Set<string>(SUPER_EXCLUSIVE)
const SENSITIVE_SET = new Set<string>(SENSITIVE)

export interface AdminPermissionValue {
  role: PmbTeamRole
  extraPermissions: AdminPermission[]
  revokedPermissions: AdminPermission[]
}

/**
 * Seletor de papel + ajuste fino de permissões de um membro da equipe interna.
 *
 * O papel define o preset; marcar/desmarcar um item grava a DIFERENÇA em
 * relação ao preset (`extraPermissions` / `revokedPermissions`), nunca a lista
 * inteira. Assim, se o preset de um papel mudar numa versão futura, quem não
 * customizou nada acompanha automaticamente.
 *
 * Espelha `components/painel/member-permission-fields.tsx`, que faz o mesmo do
 * lado da unidade.
 */
export function AdminPermissionFields({
  value,
  onChange,
  disabled,
  /** true quando a pessoa está editando a si mesma — o papel fica travado. */
  lockRole = false,
}: {
  value: AdminPermissionValue
  onChange: (next: AdminPermissionValue) => void
  disabled?: boolean
  lockRole?: boolean
}) {
  const preset = useMemo(
    () => new Set<string>(ADMIN_ROLE_PRESETS[value.role]),
    [value.role],
  )
  const effective = useMemo(
    () =>
      resolveAdminPermissions(
        value.role,
        value.extraPermissions,
        value.revokedPermissions,
      ),
    [value.role, value.extraPermissions, value.revokedPermissions],
  )
  const customCount =
    value.extraPermissions.length + value.revokedPermissions.length
  const isSuper = value.role === "SUPER_ADMIN"

  function setRole(role: PmbTeamRole) {
    // Trocar de papel zera os ajustes: os overrides do papel anterior quase
    // nunca fazem sentido no novo, e mantê-los produziria combinações
    // surpreendentes (ex.: um "revoga financeiro" herdado num Financeiro).
    onChange({ role, extraPermissions: [], revokedPermissions: [] })
  }

  function toggle(perm: AdminPermission, checked: boolean) {
    const inPreset = preset.has(perm)
    const extra = value.extraPermissions.filter((p) => p !== perm)
    const revoked = value.revokedPermissions.filter((p) => p !== perm)

    if (checked && !inPreset) extra.push(perm)
    if (!checked && inPreset) revoked.push(perm)

    onChange({ role: value.role, extraPermissions: extra, revokedPermissions: revoked })
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="admin-role">Papel</Label>
        <Select
          value={value.role}
          onValueChange={(v) => v && setRole(v as PmbTeamRole)}
          disabled={disabled || lockRole}
        >
          <SelectTrigger id="admin-role" className="mt-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PMB_TEAM_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {PMB_ROLE_LABEL[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {adminRoleDescription(value.role)}
        </p>
      </div>

      <details className="rounded-lg border border-gray-200 bg-gray-50/60">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium">
          <span>
            Permissões avançadas
            {customCount > 0 && (
              <span className="ml-2 rounded-full bg-[var(--color-pmb-lime)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-pmb-green-900)]">
                {customCount} ajuste{customCount > 1 ? "s" : ""}
              </span>
            )}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </summary>

        <div className="space-y-4 border-t border-gray-200 px-3 py-3">
          <p className="text-xs text-muted-foreground">
            {isSuper
              ? "O Super Admin sempre tem tudo — os ajustes finos valem para os demais papéis."
              : "Marcado = a pessoa tem a permissão. O papel já vem com um conjunto pronto; aqui você ajusta caso a caso."}
          </p>

          {ADMIN_PERMISSION_GROUPS.map((group) => (
            <fieldset key={group.label}>
              <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-pmb-green-900)]">
                {group.label}
              </legend>
              <div className="space-y-1">
                {group.permissions.map(({ perm, label }) => {
                  const superOnly = SUPER_EXCLUSIVE_SET.has(perm)
                  const sensitive = SENSITIVE_SET.has(perm)
                  const checked = effective.has(perm)
                  const changed =
                    value.extraPermissions.includes(perm) ||
                    value.revokedPermissions.includes(perm)
                  const locked = superOnly || isSuper
                  return (
                    <label
                      key={perm}
                      className={cn(
                        "flex items-start gap-2 rounded-md px-2 py-1.5 text-sm",
                        locked
                          ? "cursor-not-allowed opacity-50"
                          : "cursor-pointer hover:bg-white",
                        changed && "bg-[var(--color-pmb-lime-50)]",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-pmb-green)]"
                        checked={checked}
                        disabled={disabled || locked}
                        onChange={(e) => toggle(perm, e.target.checked)}
                      />
                      <span className="flex-1">
                        {label}
                        {/* SUPER_EXCLUSIVE não é "só o Super Admin tem" — é
                            "não se concede por aqui". Um preset pode carregá-la
                            (o Diretor de unidades carrega `unidades.viewAll` e
                            `unidades.governanca`), e nesse caso o checkbox
                            aparece marcado e travado. Rotular de super-only
                            mentiria sobre quem tem o quê. */}
                        {superOnly && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {checked
                              ? "(vem do papel)"
                              : "(só pelo papel, não por ajuste)"}
                          </span>
                        )}
                        {sensitive && !superOnly && (
                          <AlertTriangle
                            className="ml-1.5 inline h-3.5 w-3.5 text-amber-500"
                            aria-label="Permissão sensível"
                          />
                        )}
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          ))}
        </div>
      </details>
    </div>
  )
}
