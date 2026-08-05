import { describe, it, expect } from "vitest"
import {
  UNIDADE_SELECT,
  mascararCpf,
  serializarUnidade,
  type UnidadeRecord,
} from "./unidade-payload"

function unidadeFake(over: Partial<UnidadeRecord> = {}): UnidadeRecord {
  return {
    id: "clg8x2k9p0001abcdefghijk",
    name: "Cursos do João",
    slug: "cursos-do-joao",
    status: "ACTIVE",
    customDomain: null,
    domainVerified: false,
    logoUrl: null,
    faviconUrl: null,
    bannerUrl: null,
    primaryColor: "#2563eb",
    secondaryColor: "#1e40af",
    tagline: null,
    description: null,
    whatsapp: "11987654321",
    supportEmail: null,
    supportHours: null,
    instagram: null,
    facebook: null,
    youtube: null,
    tiktok: null,
    referralCode: "JOAO2026",
    automationEnabled: false,
    canSellResellers: false,
    tecnicaEnabled: false,
    tecnicaUrl: null,
    tecnicaLabel: null,
    ejaEnabled: false,
    ejaUrl: null,
    ejaLabel: null,
    activatedAt: null,
    createdAt: new Date("2026-01-15T13:00:00.000Z"),
    updatedAt: new Date("2026-08-01T18:44:12.000Z"),
    owner: {
      id: "clg8x2k9p0002abcdefghijk",
      name: "João da Silva",
      email: "joao@exemplo.com.br",
      phone: "11987654321",
      cpf: "52998224725",
    },
    ...over,
  } as UnidadeRecord
}

describe("UNIDADE_SELECT — fronteira de dados", () => {
  /**
   * A trava PRINCIPAL: o conjunto EXATO de campos que saem para o parceiro.
   *
   * A denylist do teste seguinte só pega os nomes que alguém lembrou de listar —
   * um campo sensível novo (`pixKeyType2`, uma credencial de um gateway futuro)
   * passaria batido por ela. Aqui a asserção é de igualdade: qualquer campo
   * ADICIONADO ao select quebra este teste e obriga quem adicionou a declarar,
   * na lista abaixo, que aquele dado pode mesmo ser público. É o mesmo formato
   * do teste do titular logo adiante.
   *
   * Ao ampliar a API, atualize esta lista NO MESMO commit — e só depois de
   * conferir que o campo não é credencial, dado financeiro nem dado de aluno.
   */
  it("expõe exatamente os campos declarados como públicos", () => {
    expect(Object.keys(UNIDADE_SELECT).sort()).toEqual(
      [
        "activatedAt",
        "automationEnabled",
        "bannerUrl",
        "canSellResellers",
        "createdAt",
        "customDomain",
        "description",
        "domainVerified",
        "ejaEnabled",
        "ejaLabel",
        "ejaUrl",
        "facebook",
        "faviconUrl",
        "id",
        "instagram",
        "logoUrl",
        "name",
        "owner",
        "primaryColor",
        "referralCode",
        "secondaryColor",
        "slug",
        "status",
        "supportEmail",
        "supportHours",
        "tagline",
        "tecnicaEnabled",
        "tecnicaLabel",
        "tecnicaUrl",
        "tiktok",
        "updatedAt",
        "whatsapp",
        "youtube",
      ].sort(),
    )
  })

  /**
   * Rede de segurança adicional: nomes conhecidamente proibidos. Redundante com
   * o teste acima por design — se alguém atualizar a lista de cima no automático
   * para "consertar o build", este ainda barra os campos que nunca podem sair.
   */
  it("não seleciona credencial, segredo nem dado financeiro", () => {
    const chaves = Object.keys(UNIDADE_SELECT)
    const proibidos = [
      "mpAccessToken",
      "mpRefreshToken",
      "mpPublicKey",
      "mpWebhookSecret",
      "asaasApiKey",
      "asaasWebhookToken",
      "asaasCustomerId",
      "asaasSubscriptionId",
      "planValue",
      "promoValue",
      "pixKey",
      "pixKeyType",
      "referralPercent",
      "referralTiers",
      "commissionPlan",
      "commissionBrackets",
      "trackingPixels",
    ]
    for (const proibido of proibidos) {
      expect(chaves, `${proibido} não pode sair na API de parceiros`).not.toContain(
        proibido,
      )
    }
  })

  it("do titular, só identidade e contato — nunca senha ou token", () => {
    const doTitular = Object.keys(UNIDADE_SELECT.owner.select)
    expect(doTitular.sort()).toEqual(["cpf", "email", "id", "name", "phone"])
  })
})

describe("serializarUnidade", () => {
  it("monta o subdomínio e usa o domínio próprio como URL canônica", () => {
    const semDominio = serializarUnidade(unidadeFake())
    expect(semDominio.dominio.subdominio).toBe("cursos-do-joao.livrecursos.com.br")
    expect(semDominio.dominio.url).toBe("https://cursos-do-joao.livrecursos.com.br")
    expect(semDominio.dominio.proprio).toBeNull()

    const comDominio = serializarUnidade(
      unidadeFake({ customDomain: "cursosdojoao.com.br", domainVerified: true }),
    )
    expect(comDominio.dominio.url).toBe("https://cursosdojoao.com.br")
    // O subdomínio continua exposto: ele nunca deixa de funcionar.
    expect(comDominio.dominio.urlSubdominio).toBe(
      "https://cursos-do-joao.livrecursos.com.br",
    )
  })

  it("`ativa` é derivada do status, não um campo independente", () => {
    expect(serializarUnidade(unidadeFake({ status: "ACTIVE" })).ativa).toBe(true)
    for (const status of ["PENDING", "SUSPENDED", "CANCELLED"] as const) {
      const payload = serializarUnidade(unidadeFake({ status }))
      expect(payload.ativa).toBe(false)
      // Unidade inativa continua sendo devolvida — quem decide o que fazer com
      // ela é o parceiro.
      expect(payload.status).toBe(status)
    }
  })

  it("nunca devolve o CPF completo do titular", () => {
    const payload = serializarUnidade(unidadeFake())
    expect(payload.titular?.cpfMascarado).toBe("***.982.247-**")
    expect(JSON.stringify(payload)).not.toContain("52998224725")
  })

  it("aguenta unidade sem titular", () => {
    const payload = serializarUnidade(unidadeFake({ owner: null }))
    expect(payload.titular).toBeNull()
  })

  it("formata os telefones para exibição sem perder o valor cru", () => {
    const payload = serializarUnidade(unidadeFake())
    expect(payload.contato.whatsapp).toBe("11987654321")
    expect(payload.contato.whatsappFormatado).toBe("(11) 98765-4321")
    expect(payload.titular?.telefoneFormatado).toBe("(11) 98765-4321")
  })

  it("serializa datas em ISO", () => {
    const payload = serializarUnidade(
      unidadeFake({ activatedAt: new Date("2026-01-20T10:22:00.000Z") }),
    )
    expect(payload.criadaEm).toBe("2026-01-15T13:00:00.000Z")
    expect(payload.ativadaEm).toBe("2026-01-20T10:22:00.000Z")
  })
})

describe("mascararCpf", () => {
  it("mostra só os dígitos centrais", () => {
    expect(mascararCpf("52998224725")).toBe("***.982.247-**")
    expect(mascararCpf("529.982.247-25")).toBe("***.982.247-**")
  })

  it("devolve null para ausente ou malformado", () => {
    expect(mascararCpf(null)).toBeNull()
    expect(mascararCpf("")).toBeNull()
    expect(mascararCpf("123")).toBeNull()
  })
})
