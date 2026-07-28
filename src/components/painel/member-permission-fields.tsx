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
import {
  ASSIGNABLE_MEMBER_ROLES,
  OWNER_EXCLUSIVE,
  PERMISSION_GROUPS,
  ROLE_PRESETS,
  SENSITIVE,
  resolvePermissions,
  roleDescription,
  roleLabel,
  type AssignableMemberRole,
  type PainelPermission,
} from "@/lib/auth/painel-permissions"

const OWNER_EXCLUSIVE_SET = new Set<string>(OWNER_EXCLUSIVE)
const SENSITIVE_SET = new Set<string>(SENSITIVE)

export interface MemberPermissionValue {
  role: AssignableMemberRole
  extraPermissions: PainelPermission[]
  revokedPermissions: PainelPermission[]
}

/**
 * Seletor de papel + ajuste fino de permissões de um membro da unidade.
 *
 * O papel define o preset; marcar/desmarcar um item grava a DIFERENÇA em
 * relação ao preset (`extraPermissions` / `revokedPermissions`), e não a lista
 * inteira. Assim, se o preset de um papel mudar numa versão futura, quem não
 * customizou nada acompanha automaticamente.
 */
export function MemberPermissionFields({
  value,
  onChange,
  disabled,
}: {
  value: MemberPermissionValue
  onChange: (next: MemberPermissionValue) => void
  disabled?: boolean
}) {
  const preset = useMemo(
    () => new Set<string>(ROLE_PRESETS[value.role]),
    [value.role],
  )
  const effective = useMemo(
    () =>
      resolvePermissions(
        value.role,
        value.extraPermissions,
        value.revokedPermissions,
      ),
    [value.role, value.extraPermissions, value.revokedPermissions],
  )
  const customCount =
    value.extraPermissions.length + value.revokedPermissions.length

  function setRole(role: AssignableMemberRole) {
    // Trocar de papel zera os ajustes: os overrides do papel anterior quase
    // nunca fazem sentido no novo, e mantê-los produziria combinações
    // surpreendentes (ex.: um "revoga financeiro" herdado num Financeiro).
    onChange({ role, extraPermissions: [], revokedPermissions: [] })
  }

  function toggle(perm: PainelPermission, checked: boolean) {
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
        <Label htmlFor="member-role">Papel na unidade</Label>
        <Select
          value={value.role}
          onValueChange={(v) => v && setRole(v as AssignableMemberRole)}
          disabled={disabled}
        >
          <SelectTrigger id="member-role" className="mt-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASSIGNABLE_MEMBER_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {roleLabel(role)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {roleDescription(value.role)}
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
            Marcado = a pessoa tem a permissão. O papel já vem com um conjunto
            pronto; aqui você ajusta caso a caso.
          </p>

          {PERMISSION_GROUPS.map((group) => (
            <fieldset key={group.label}>
              <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-pmb-green-900)]">
                {group.label}
              </legend>
              <div className="space-y-1">
                {group.permissions.map(({ perm, label }) => {
                  const ownerOnly = OWNER_EXCLUSIVE_SET.has(perm)
                  const sensitive = SENSITIVE_SET.has(perm)
                  const checked = effective.has(perm)
                  const changed =
                    value.extraPermissions.includes(perm) ||
                    value.revokedPermissions.includes(perm)
                  return (
                    <label
                      key={perm}
                      className={cn(
                        "flex items-start gap-2 rounded-md px-2 py-1.5 text-sm",
                        ownerOnly
                          ? "cursor-not-allowed opacity-50"
                          : "cursor-pointer hover:bg-white",
                        changed && "bg-[var(--color-pmb-lime-50)]",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-pmb-green)]"
                        checked={checked}
                        disabled={disabled || ownerOnly}
                        onChange={(e) => toggle(perm, e.target.checked)}
                      />
                      <span className="flex-1">
                        {label}
                        {ownerOnly && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            (só o titular)
                          </span>
                        )}
                        {sensitive && !ownerOnly && (
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
