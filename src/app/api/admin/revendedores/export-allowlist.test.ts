import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/*
 * FRONTEIRA DE DADOS do export de revendedores.
 *
 * O `select` da rota é uma allowlist: o `Tenant` guarda o token do Mercado Pago,
 * a API key do Asaas e dois segredos de webhook da unidade, todos criptografados
 * em repouso — e todos DECIFRÁVEIS depois de saírem numa planilha que circula
 * por e-mail. Um `select` esquecido (ou um `include` "prático" no lugar dele)
 * transformaria o export num vazamento de credencial de gateway de terceiro.
 *
 * Espelha o teste de allowlist da API de parceiros: o que protege não é a
 * revisão de quem escreveu, é a quebra do build de quem vier depois.
 */

const ROUTE = join(
  process.cwd(),
  "src/app/api/admin/revendedores/export/route.ts",
)

/** Campos que NUNCA podem ser lidos por esta rota. */
const PROIBIDOS = [
  "mpAccessToken",
  "mpRefreshToken",
  "mpWebhookSecret",
  "asaasApiKey",
  "asaasWebhookToken",
  "passwordHash",
  "resetToken",
  "plataformaVendedorLogin",
  "extraPermissions",
  "revokedPermissions",
]

describe("allowlist do export de revendedores", () => {
  const src = readFileSync(ROUTE, "utf-8")

  it.each(PROIBIDOS)("não seleciona %s", (campo) => {
    // Fora dos comentários: o arquivo cita alguns destes nomes ao explicar por
    // que eles ficam de fora.
    const codigo = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
    expect(codigo).not.toContain(campo)
  })

  it("lê o Tenant por `select`, nunca por `include`", () => {
    // `include` traz o modelo INTEIRO — inclusive as colunas de segredo. É o
    // atalho que anula a allowlist sem parecer que anulou.
    expect(src).toContain("select: {")
    expect(src).not.toMatch(/prisma\.tenant\.findMany\(\{[\s\S]{0,400}?include:/)
  })

  it("passa pelo guard de permissão e pelo recorte compartilhado", () => {
    expect(src).toContain('requireAdmin("unidades.view")')
    expect(src).toContain("resellerListWhere(ctx, filters)")
  })

  it("fecha com 403 ANTES de consultar, quando o recorte é vazio", () => {
    // Recorte nulo = a pessoa não alcança unidade nenhuma. Seguir para o
    // `findMany` com um `where` sem filtro exportaria a rede inteira — por isso
    // a checagem tem que vir antes da consulta, não depois dela.
    const fechamento = src.search(/if \(!\w+\)[\s\S]{0,240}?status: 403/)
    const consulta = src.indexOf("prisma.tenant.findMany")
    expect(fechamento).toBeGreaterThan(-1)
    expect(consulta).toBeGreaterThan(-1)
    expect(fechamento).toBeLessThan(consulta)
  })

  it("grava trilha de auditoria da exportação", () => {
    expect(src).toContain('action: "data.export"')
    expect(src).toContain('resource: "tenants"')
  })
})
