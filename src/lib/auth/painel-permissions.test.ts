import { describe, it, expect } from "vitest"
import {
  ASSIGNABLE_MEMBER_ROLES,
  OWNER_EXCLUSIVE,
  PAINEL_MEMBER_ROLES,
  PAINEL_PERMISSIONS,
  PERMISSION_GROUPS,
  ROLE_PRESETS,
  isWritePermission,
  normalizeMemberRole,
  resolvePermissions,
  roleLabel,
  toReadOnly,
  type PainelPermission,
} from "./painel-permissions"

describe("resolvePermissions", () => {
  it("sem overrides devolve exatamente o preset do papel", () => {
    const perms = resolvePermissions("consultant")
    expect([...perms].sort()).toEqual([...ROLE_PRESETS.consultant].sort())
  })

  it("extra soma permissões ao preset", () => {
    const perms = resolvePermissions("consultant", ["financeiro.view"])
    expect(perms.has("financeiro.view")).toBe(true)
    expect(perms.has("dashboard.view")).toBe(true)
  })

  it("revoked subtrai permissões do preset", () => {
    const perms = resolvePermissions("manager", [], ["financeiro.view"])
    expect(ROLE_PRESETS.manager).toContain("financeiro.view")
    expect(perms.has("financeiro.view")).toBe(false)
  })

  it("revoked vence extra quando a mesma permissão aparece nos dois", () => {
    const perms = resolvePermissions("consultant", ["financeiro.view"], ["financeiro.view"])
    expect(perms.has("financeiro.view")).toBe(false)
  })

  it("ignora OWNER_EXCLUSIVE concedida por extra", () => {
    const perms = resolvePermissions("manager", [...OWNER_EXCLUSIVE])
    for (const perm of OWNER_EXCLUSIVE) {
      expect(perms.has(perm)).toBe(false)
    }
  })

  it("descarta strings fora do catálogo", () => {
    const perms = resolvePermissions("consultant", ["nao.existe"], ["tambem.nao"])
    expect(perms.has("nao.existe" as PainelPermission)).toBe(false)
    expect([...perms].sort()).toEqual([...ROLE_PRESETS.consultant].sort())
  })

  it("owner recebe todas as permissões e ignora revoked", () => {
    const perms = resolvePermissions("owner", [], ["gateway.manage", "equipe.manage"])
    expect(perms.size).toBe(PAINEL_PERMISSIONS.length)
    expect(perms.has("gateway.manage")).toBe(true)
    expect(perms.has("equipe.manage")).toBe(true)
  })
})

describe("matriz de papéis — regressão do vazamento de privilégio", () => {
  // Este é o bug que motivou a mudança: até então qualquer membro da unidade
  // podia trocar o token do gateway, mexer no domínio e gerir a equipe.
  it.each([...ASSIGNABLE_MEMBER_ROLES])(
    "%s não tem gateway.manage, equipe.manage nem conta.delete",
    (role) => {
      const perms = resolvePermissions(role)
      expect(perms.has("gateway.manage")).toBe(false)
      expect(perms.has("equipe.manage")).toBe(false)
      expect(perms.has("conta.delete")).toBe(false)
    },
  )

  it.each([...ASSIGNABLE_MEMBER_ROLES])("%s não tem dominio.manage", (role) => {
    expect(resolvePermissions(role).has("dominio.manage")).toBe(false)
  })

  it("vendedor não vê financeiro, vitrine, indicações nem certificados", () => {
    const perms = resolvePermissions("consultant")
    expect(perms.has("financeiro.view")).toBe(false)
    expect(perms.has("vitrine.manage")).toBe(false)
    expect(perms.has("indicacoes.view")).toBe(false)
    expect(perms.has("certificados.view")).toBe(false)
    expect(perms.has("comunicacao.manage")).toBe(false)
  })

  it("vendedor não tem nenhum viewAll — é isso que escopa os dados dele", () => {
    const perms = resolvePermissions("consultant")
    expect(perms.has("alunos.viewAll")).toBe(false)
    expect(perms.has("vendas.viewAll")).toBe(false)
    expect(perms.has("leads.viewAll")).toBe(false)
  })

  it("secretaria não vê dinheiro", () => {
    const perms = resolvePermissions("support")
    expect(perms.has("financeiro.view")).toBe(false)
    expect(perms.has("vendas.view")).toBe(false)
    expect(perms.has("cupons.manage")).toBe(false)
    expect(perms.has("alunos.viewAll")).toBe(true)
  })

  it("financeiro não edita catálogo, vitrine nem indicações", () => {
    const perms = resolvePermissions("finance")
    expect(perms.has("financeiro.view")).toBe(true)
    expect(perms.has("relatorios.indicacoes")).toBe(false)
    expect(perms.has("catalogo.manage")).toBe(false)
    expect(perms.has("vitrine.manage")).toBe(false)
  })

  it("gerente opera a unidade mas não toca em indicações", () => {
    const perms = resolvePermissions("manager")
    expect(perms.has("financeiro.view")).toBe(true)
    expect(perms.has("vitrine.manage")).toBe(true)
    expect(perms.has("alunos.viewAll")).toBe(true)
    expect(perms.has("indicacoes.view")).toBe(false)
    expect(perms.has("revendas.manage")).toBe(false)
  })

  it("todo preset é um subconjunto do catálogo", () => {
    const catalog = new Set<string>(PAINEL_PERMISSIONS)
    for (const role of PAINEL_MEMBER_ROLES) {
      for (const perm of ROLE_PRESETS[role]) {
        expect(catalog.has(perm)).toBe(true)
      }
    }
  })
})

describe("toReadOnly", () => {
  it("remove toda permissão de escrita", () => {
    const perms = toReadOnly(resolvePermissions("owner"))
    for (const perm of perms) {
      expect(isWritePermission(perm)).toBe(false)
    }
    expect(perms.has("dashboard.view")).toBe(true)
    expect(perms.has("alunos.viewAll")).toBe(true)
    expect(perms.has("gateway.manage")).toBe(false)
    expect(perms.has("vendas.create")).toBe(false)
    expect(perms.has("conta.delete")).toBe(false)
    expect(perms.has("alunos.impersonate")).toBe(false)
  })
})

describe("normalizeMemberRole", () => {
  it("aceita papéis conhecidos", () => {
    expect(normalizeMemberRole("manager")).toBe("manager")
    expect(normalizeMemberRole("owner")).toBe("owner")
  })

  it("cai no papel mais restrito para valores legados ou desconhecidos", () => {
    // "viewer" e "manager" apareciam no comentário do schema; só o segundo virou
    // papel real. Qualquer coisa fora do catálogo é fail-closed.
    expect(normalizeMemberRole("viewer")).toBe("consultant")
    expect(normalizeMemberRole("")).toBe("consultant")
    expect(normalizeMemberRole(null)).toBe("consultant")
    expect(normalizeMemberRole(undefined)).toBe("consultant")
  })
})

describe("catálogo e UI", () => {
  it("cada permissão aparece em exatamente um grupo da UI", () => {
    const seen = new Map<string, number>()
    for (const group of PERMISSION_GROUPS) {
      for (const item of group.permissions) {
        seen.set(item.perm, (seen.get(item.perm) ?? 0) + 1)
      }
    }
    for (const perm of PAINEL_PERMISSIONS) {
      expect(seen.get(perm), `permissão ${perm} sem grupo na UI`).toBe(1)
    }
    expect(seen.size).toBe(PAINEL_PERMISSIONS.length)
  })

  it("todo papel tem rótulo próprio", () => {
    const labels = PAINEL_MEMBER_ROLES.map(roleLabel)
    expect(new Set(labels).size).toBe(PAINEL_MEMBER_ROLES.length)
  })
})
