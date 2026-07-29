import { describe, it, expect } from "vitest"
import {
  ADMIN_PERMISSIONS,
  ADMIN_PERMISSION_GROUPS,
  ADMIN_ROLE_PRESETS,
  PMB_TEAM_ROLES,
  SENSITIVE,
  SUPER_EXCLUSIVE,
  SUPER_EXCLUSIVE_BY_PRESET,
  filterAdminPermissions,
  resolveAdminPermissions,
  type AdminPermission,
} from "./admin-permissions"

describe("catálogo", () => {
  // `unidades.viewAll` é o substituto de todo bypass `role === "SUPER_ADMIN"`
  // do código anterior: quem a tem passa pelo recorte de carteira em senha do
  // titular, impersonação, gateway e export de comissões. Concedê-la por
  // override viraria um gerente de unidades em super admin de fato.
  it("unidades.viewAll nunca é concedida por override", () => {
    expect(SUPER_EXCLUSIVE).toContain("unidades.viewAll")
    const perms = resolveAdminPermissions("PMB_RESELLER_MGR", ["unidades.viewAll"])
    expect(perms.has("unidades.viewAll")).toBe(false)
  })

  /**
   * `unidades.governanca` grava `Tenant.accountManagerId`. Concedida por
   * override, ela permitia à pessoa se auto-atribuir a carteira de qualquer
   * unidade e, por tabela, ganhar senha do titular, impersonação, cobrança e
   * ledger de comissão — a mesma escalada de `unidades.viewAll`, em dois passos.
   */
  it("unidades.governanca nunca é concedida por override", () => {
    expect(SUPER_EXCLUSIVE).toContain("unidades.governanca")
    const perms = resolveAdminPermissions("PMB_RESELLER_MGR", ["unidades.governanca"])
    expect(perms.has("unidades.governanca")).toBe(false)
  })

  /**
   * Bolsa entrega o curso por R$ 0. Sem permissão própria era o caminho de
   * fuga do teto de desconto: quem tomava 403 num desconto de 11% marcava
   * "Bolsa de estudo" e concedia 100%.
   */
  it("matricular como bolsista exige permissão própria", () => {
    for (const role of PMB_TEAM_ROLES) {
      const podeVender = ADMIN_ROLE_PRESETS[role].includes("vendas.create")
      const podeBolsa = ADMIN_ROLE_PRESETS[role].includes("vendas.bolsa")
      // Só quem já vendia concede bolsa; ninguém ganha bolsa sem vender.
      if (podeBolsa) expect(podeVender, role).toBe(true)
    }
    expect(resolveAdminPermissions("PMB_RESELLER_MGR").has("vendas.bolsa")).toBe(false)
  })

  it("não tem permissão duplicada", () => {
    expect(new Set(ADMIN_PERMISSIONS).size).toBe(ADMIN_PERMISSIONS.length)
  })

  it("todo preset só usa permissões do catálogo", () => {
    const catalog = new Set<string>(ADMIN_PERMISSIONS)
    for (const role of PMB_TEAM_ROLES) {
      for (const perm of ADMIN_ROLE_PRESETS[role]) {
        expect(catalog.has(perm), `${role} → ${perm}`).toBe(true)
      }
    }
  })

  it("SUPER_ADMIN tem o catálogo inteiro", () => {
    expect(ADMIN_ROLE_PRESETS.SUPER_ADMIN.length).toBe(ADMIN_PERMISSIONS.length)
  })

  it("todo papel pode editar o próprio perfil", () => {
    for (const role of PMB_TEAM_ROLES) {
      expect(ADMIN_ROLE_PRESETS[role], role).toContain("perfil.edit")
    }
  })

  it("SUPER_EXCLUSIVE e SENSITIVE só citam permissões do catálogo", () => {
    const catalog = new Set<string>(ADMIN_PERMISSIONS)
    for (const perm of [...SUPER_EXCLUSIVE, ...SENSITIVE]) {
      expect(catalog.has(perm), perm).toBe(true)
    }
  })

  /**
   * Igualdade EXATA contra a lista declarada — não "não contém". Um preset novo
   * que ganhe uma exclusiva sem entrar em SUPER_EXCLUSIVE_BY_PRESET quebra
   * aqui, e tirar de lá um papel que ainda a usa também quebra. É o que impede
   * a exceção do Diretor de unidades de virar uma porta aberta a mais papéis.
   */
  it("só os papéis declarados carregam permissão exclusiva no preset", () => {
    for (const role of PMB_TEAM_ROLES) {
      const declarado = [...(SUPER_EXCLUSIVE_BY_PRESET[role] ?? [])].sort()
      const real = SUPER_EXCLUSIVE.filter((perm) =>
        ADMIN_ROLE_PRESETS[role].includes(perm),
      ).sort()
      expect(real, role).toEqual(declarado)
    }
  })

  /**
   * A linha que não se cruza: `equipe.manage` cria usuários e edita permissões
   * — inclusive as próprias. Nem por preset, nem por override.
   */
  it("equipe.manage nunca sai do SUPER_ADMIN", () => {
    for (const role of PMB_TEAM_ROLES) {
      if (role === "SUPER_ADMIN") continue
      expect(ADMIN_ROLE_PRESETS[role], role).not.toContain("equipe.manage")
      expect(
        resolveAdminPermissions(role, ["equipe.manage"]).has("equipe.manage"),
        role,
      ).toBe(false)
    }
  })
})

/**
 * O papel criado para dar suporte a TODAS as revendas sem ser super admin.
 * Estes testes fixam a fronteira decidida: tudo de unidade, nada de dinheiro do
 * ecossistema, nada de sistema.
 */
describe("PMB_RESELLER_DIRECTOR (Diretor de unidades)", () => {
  const perms = resolveAdminPermissions("PMB_RESELLER_DIRECTOR")

  it("alcança a rede inteira de unidades, com governança", () => {
    for (const perm of [
      "unidades.view",
      "unidades.viewAll",
      "unidades.create",
      "unidades.manage",
      "unidades.billing",
      "unidades.credenciais",
      "unidades.impersonate",
      "unidades.comissoes",
      "unidades.governanca",
    ] as const) {
      expect(perms.has(perm), perm).toBe(true)
    }
  })

  it("faz suporte a aluno de qualquer unidade e trabalha o funil B2B", () => {
    for (const perm of [
      "alunosRede.view",
      "alunosRede.manage",
      "alunosRede.acesso",
      "leadsRevenda.view",
      "leadsRevenda.viewAll",
      "leadsRevenda.manage",
    ] as const) {
      expect(perms.has(perm), perm).toBe(true)
    }
  })

  it("não é super admin: fora do escopo de revenda ele não entra", () => {
    for (const perm of [
      // Dinheiro do ecossistema — quem baixa pagamento é o Financeiro.
      "financeiro.viewAll",
      "financeiro.manage",
      "indicacoes.clawback",
      "indicacoes.config",
      "indicacoes.percentUnidade",
      // Destruição LGPD irreversível.
      "unidades.anonimizar",
      // Produto, marca e sistema.
      "catalogo.manage",
      "pacotes.manage",
      "vitrine.manage",
      "configuracoes.manage",
      "integracoes.manage",
      "equipe.manage",
      // Vitrine PMB (B2C) não é dele.
      "vendas.create",
      "vendas.bolsa",
      "alunos.viewAll",
    ] as const) {
      expect(perms.has(perm), perm).toBe(false)
    }
  })

  it("vê e aprova saque da rede, mas não dá baixa no pagamento", () => {
    expect(perms.has("financeiro.view")).toBe(true)
    expect(perms.has("indicacoes.saques")).toBe(true)
    expect(perms.has("financeiro.manage")).toBe(false)
  })

  it("é estritamente mais amplo que o Gerente de unidades", () => {
    for (const perm of ADMIN_ROLE_PRESETS.PMB_RESELLER_MGR) {
      expect(perms.has(perm), perm).toBe(true)
    }
  })
})

describe("grupos da UI", () => {
  it("cobrem cada permissão exatamente uma vez", () => {
    const seen = ADMIN_PERMISSION_GROUPS.flatMap((g) =>
      g.permissions.map((p) => p.perm),
    )
    expect(new Set(seen).size).toBe(seen.length)
    expect([...seen].sort()).toEqual([...ADMIN_PERMISSIONS].sort())
  })
})

describe("resolveAdminPermissions", () => {
  it("sem overrides devolve exatamente o preset do papel", () => {
    const perms = resolveAdminPermissions("PMB_SALES")
    expect([...perms].sort()).toEqual([...ADMIN_ROLE_PRESETS.PMB_SALES].sort())
  })

  it("extra soma permissões ao preset", () => {
    const perms = resolveAdminPermissions("PMB_SALES", ["financeiro.view"])
    expect(perms.has("financeiro.view")).toBe(true)
    expect(perms.has("vendas.create")).toBe(true)
  })

  it("revoked subtrai permissões do preset", () => {
    const perms = resolveAdminPermissions("PMB_SALES", [], ["cupons.manage"])
    expect(ADMIN_ROLE_PRESETS.PMB_SALES).toContain("cupons.manage")
    expect(perms.has("cupons.manage")).toBe(false)
  })

  it("revoked vence extra quando a mesma permissão aparece nos dois", () => {
    const perms = resolveAdminPermissions(
      "PMB_SALES",
      ["financeiro.view"],
      ["financeiro.view"],
    )
    expect(perms.has("financeiro.view")).toBe(false)
  })

  it("ignora SUPER_EXCLUSIVE concedida por extra", () => {
    const perms = resolveAdminPermissions("PMB_FINANCEIRO", [...SUPER_EXCLUSIVE])
    for (const perm of SUPER_EXCLUSIVE) {
      expect(perms.has(perm)).toBe(false)
    }
  })

  it("descarta strings fora do catálogo", () => {
    const perms = resolveAdminPermissions("PMB_DESIGNER", ["nao.existe"], ["tambem.nao"])
    expect(perms.has("nao.existe" as AdminPermission)).toBe(false)
    expect([...perms].sort()).toEqual([...ADMIN_ROLE_PRESETS.PMB_DESIGNER].sort())
  })

  it("SUPER_ADMIN recebe tudo e ignora revoked", () => {
    const perms = resolveAdminPermissions(
      "SUPER_ADMIN",
      [],
      ["equipe.manage", "integracoes.manage"],
    )
    expect(perms.size).toBe(ADMIN_PERMISSIONS.length)
    expect(perms.has("equipe.manage")).toBe(true)
    expect(perms.has("integracoes.manage")).toBe(true)
  })
})

describe("filterAdminPermissions", () => {
  it("mantém só o que está no catálogo", () => {
    expect(
      filterAdminPermissions(["vendas.create", "lixo", "financeiro.view"]),
    ).toEqual(["vendas.create", "financeiro.view"])
  })
})

/**
 * Trava de regressão da matriz herdada dos guards antigos. Cada linha aqui
 * corresponde a um comportamento que já existia em produção antes do modelo de
 * permissões — se um preset for alterado sem intenção, isto quebra.
 */
describe("paridade com a matriz de papéis anterior", () => {
  const cases: [string, AdminPermission, boolean][] = [
    // Vendedor de curso opera a vitrine PMB, mas não a rede de unidades.
    ["PMB_SALES", "vendas.create", true],
    ["PMB_SALES", "atendimento.manage", true],
    ["PMB_SALES", "unidades.view", false],
    ["PMB_SALES", "financeiro.viewAll", false],
    ["PMB_SALES", "catalogo.manage", false],
    ["PMB_SALES", "alunosRede.manage", true],
    // Bloquear aluno e mexer no vínculo de curso sempre foi só do super admin.
    ["PMB_SALES", "alunosRede.acesso", false],
    ["PMB_SALES", "alunos.viewAll", false],
    ["PMB_SALES", "relatorios.export", true],
    ["PMB_SALES", "certificados.manage", true],
    // O teto de desconto (padrao 50%) vale para o vendedor de curso.
    ["PMB_SALES", "vendas.descontoIlimitado", false],
    // Comercial de revenda não enxerga aluno nem dinheiro.
    ["PMB_REVENDA_SALES", "unidades.create", true],
    ["PMB_REVENDA_SALES", "leadsRevenda.manage", true],
    ["PMB_REVENDA_SALES", "leadsRevenda.config", false],
    ["PMB_REVENDA_SALES", "alunos.view", false],
    ["PMB_REVENDA_SALES", "financeiro.view", false],
    // Só o gerente de vendas configura o rodízio de leads B2B.
    ["PMB_SALES_MGR", "leadsRevenda.config", true],
    ["PMB_SALES_MGR", "financeiro.view", false],
    // Gerente de unidades: suporte à carteira, sem visão financeira global.
    ["PMB_RESELLER_MGR", "unidades.impersonate", true],
    ["PMB_RESELLER_MGR", "unidades.credenciais", true],
    ["PMB_RESELLER_MGR", "financeiro.view", true],
    ["PMB_RESELLER_MGR", "financeiro.viewAll", false],
    // Aprova saque da carteira, mas nao decide estorno nem regra de comissao.
    ["PMB_RESELLER_MGR", "indicacoes.saques", true],
    ["PMB_RESELLER_MGR", "indicacoes.clawback", false],
    ["PMB_RESELLER_MGR", "indicacoes.config", false],
    ["PMB_RESELLER_MGR", "indicacoes.percentUnidade", false],
    // Emite certificado da propria carteira (era requireAdminSession +
    // adminCanAccessCertTenant antes do modelo de permissoes).
    ["PMB_RESELLER_MGR", "certificados.manage", true],
    ["PMB_RESELLER_MGR", "leadsRevenda.view", false],
    // Administra a carteira, mas não amplia o contrato da unidade.
    ["PMB_RESELLER_MGR", "unidades.governanca", false],
    ["PMB_RESELLER_MGR", "relatorios.export", true],
    // Financeiro não mexe em catálogo, unidade nem aluno.
    ["PMB_FINANCEIRO", "financeiro.manage", true],
    // Estorno e % por unidade sim; a regra GLOBAL do motor sempre foi
    // SUPER_ADMIN-only (PUT /api/admin/system-settings/referrals).
    ["PMB_FINANCEIRO", "indicacoes.clawback", true],
    ["PMB_FINANCEIRO", "indicacoes.percentUnidade", true],
    ["PMB_FINANCEIRO", "indicacoes.config", false],
    ["PMB_FINANCEIRO", "indicacoes.saques", false],
    ["PMB_FINANCEIRO", "unidades.manage", false],
    ["PMB_FINANCEIRO", "catalogo.manage", false],
    ["PMB_FINANCEIRO", "alunos.view", false],
    // A exportação CSV nunca serviu o financeiro (REPORT_ROLES não o inclui).
    ["PMB_FINANCEIRO", "relatorios.export", false],
    ["PMB_SALES_MGR", "relatorios.export", false],
    // Designer só tem o banco de artes.
    ["PMB_DESIGNER", "artes.manage", true],
    ["PMB_DESIGNER", "dashboard.view", false],
    ["PMB_DESIGNER", "alunosRede.view", false],
    ["PMB_DESIGNER", "alunosRede.manage", false],
    ["PMB_DESIGNER", "alunos.manage", false],
  ]

  it.each(cases)("%s → %s = %s", (role, perm, expected) => {
    const perms = resolveAdminPermissions(role as never)
    expect(perms.has(perm)).toBe(expected)
  })
})
