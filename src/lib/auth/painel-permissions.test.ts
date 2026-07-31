import { describe, it, expect } from "vitest"
import {
  ASSIGNABLE_MEMBER_ROLES,
  OWNER_EXCLUSIVE,
  PAINEL_MEMBER_ROLES,
  PAINEL_PERMISSIONS,
  PERMISSION_GROUPS,
  ROLE_PRESETS,
  WRITE_IMPLIES_READ,
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
  it("aceita os papéis atribuíveis", () => {
    expect(normalizeMemberRole("manager")).toBe("manager")
    expect(normalizeMemberRole("support")).toBe("support")
    expect(normalizeMemberRole("finance")).toBe("finance")
  })

  it("cai no papel mais restrito para valores legados ou desconhecidos", () => {
    // "viewer" e "manager" apareciam no comentário do schema; só o segundo virou
    // papel real. Qualquer coisa fora do catálogo é fail-closed.
    expect(normalizeMemberRole("viewer")).toBe("consultant")
    expect(normalizeMemberRole("")).toBe("consultant")
    expect(normalizeMemberRole(null)).toBe("consultant")
    expect(normalizeMemberRole(undefined)).toBe("consultant")
  })

  it('"owner" numa membership NÃO escala para acesso total', () => {
    // O dono é o User com `tenantId`, nunca um TenantMember. Uma linha com
    // role="owner" (legado ou adulterada) não pode virar acesso total.
    expect(normalizeMemberRole("owner")).toBe("consultant")
    const perms = resolvePermissions(normalizeMemberRole("owner"))
    expect(perms.has("gateway.manage")).toBe(false)
    expect(perms.has("equipe.manage")).toBe(false)
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

/**
 * Estrutura do par ver/editar.
 *
 * Antes, uma dúzia de áreas da unidade só existia na forma `.manage`: para
 * ABRIR a vitrine, o domínio, a automação, a equipe, as configurações ou o
 * gateway era preciso conceder o poder de ALTERÁ-LOS. Estes testes impedem que
 * uma permissão nova nasça assim de novo.
 */
describe("par ver/editar (WRITE_IMPLIES_READ)", () => {
  const pares = Object.entries(WRITE_IMPLIES_READ) as [
    PainelPermission,
    PainelPermission,
  ][]

  it("só referencia permissões do catálogo", () => {
    for (const [write, read] of pares) {
      expect(PAINEL_PERMISSIONS, write).toContain(write)
      expect(PAINEL_PERMISSIONS, read).toContain(read)
    }
  })

  it("todo alvo é uma permissão de leitura", () => {
    for (const [write, read] of pares) {
      expect(read.endsWith(".view"), `${write} → ${read}`).toBe(true)
    }
  })

  // `applyImplications` faz UMA passada. Se uma chave fosse também um alvo
  // (A → B e B → C), conceder A deixaria de conceder C sem ninguém perceber.
  it("nenhuma chave é também um alvo — uma passada basta", () => {
    const alvos = new Set(pares.map(([, read]) => read))
    const chaves = pares.map(([write]) => write)
    expect(chaves.filter((k) => alvos.has(k))).toEqual([])
  })

  it("toda permissão de escrita declara a leitura correspondente", () => {
    // `perfil.edit` é auto-serviço (nome, CPF e a própria senha) e
    // `conta.delete` destrói a unidade — nenhuma das duas é uma ÁREA com tela
    // de consulta separada.
    const SEM_AREA: PainelPermission[] = ["perfil.edit", "conta.delete"]
    const semPar = PAINEL_PERMISSIONS.filter((perm) => {
      if (perm.endsWith(".view") || perm.endsWith(".viewAll")) return false
      if (SEM_AREA.includes(perm)) return false
      return !(perm in WRITE_IMPLIES_READ)
    })
    expect(semPar).toEqual([])
  })

  it("conceder a escrita já concede a leitura", () => {
    const perms = resolvePermissions("consultant", ["vitrine.manage"])
    expect(perms.has("vitrine.view")).toBe(true)
  })

  /**
   * Fail-closed: revogar a leitura derruba a escrita junto. Sem isto, tirar
   * `catalogo.view` de alguém deixaria a pessoa sem a tela e ainda com o PATCH
   * liberado — pior do que não ter revogado nada.
   */
  it("revogar a leitura derruba a escrita da mesma área", () => {
    const perms = resolvePermissions("manager", [], ["catalogo.view"])
    expect(ROLE_PRESETS.manager).toContain("catalogo.manage")
    expect(perms.has("catalogo.view")).toBe(false)
    expect(perms.has("catalogo.manage")).toBe(false)
  })

  it("revogar só a escrita preserva a leitura", () => {
    const perms = resolvePermissions("manager", [], ["catalogo.manage"])
    expect(perms.has("catalogo.manage")).toBe(false)
    expect(perms.has("catalogo.view")).toBe(true)
  })

  // O dono ignora `revoked` — inclusive para o fail-closed, senão ele se
  // trancaria fora da própria unidade com um checkbox.
  it("o dono mantém tudo mesmo revogando a leitura", () => {
    const perms = resolvePermissions("owner", [], ["catalogo.view"])
    expect(perms.has("catalogo.view")).toBe(true)
    expect(perms.has("catalogo.manage")).toBe(true)
  })
})

/**
 * O defeito concreto que motivou a revisão: PATCH, DELETE, mudança de etapa,
 * atividades e WhatsApp de lead eram guardados por `leads.view`. Quem só podia
 * CONSULTAR o funil apagava lead.
 */
describe("leads: consultar não é trabalhar", () => {
  it("leads.manage existe e é permissão de escrita", () => {
    expect(PAINEL_PERMISSIONS).toContain("leads.manage")
    expect(isWritePermission("leads.manage")).toBe(true)
  })

  it("quem só recebe leads.view não trabalha o funil", () => {
    const perms = resolvePermissions("support", ["leads.view"])
    expect(perms.has("leads.view")).toBe(true)
    expect(perms.has("leads.manage")).toBe(false)
  })

  it("gerente e vendedor seguem trabalhando o funil", () => {
    for (const role of ["manager", "consultant"] as const) {
      expect(resolvePermissions(role).has("leads.manage"), role).toBe(true)
    }
  })

  // A prévia "ver como" nunca escreve.
  it("a prévia somente-leitura perde leads.manage", () => {
    expect(toReadOnly(resolvePermissions("manager")).has("leads.manage")).toBe(false)
  })
})
