import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * Invariantes do incidente de teste de cartao (20/10/2026).
 *
 * 1. Todo POST dos checkouts publicos confere o BotID no servidor. O robo
 *    chamava a API direto — a prova so vale se for conferida em TODA porta.
 * 2. O script cliente protege os mesmos prefixos (rota conferida sem estar
 *    listada no cliente recusaria todo comprador).
 * 3. Nenhum checkout publico cria senha nem manda e-mail antes do pagamento:
 *    era o que transformava o robo em disparo em massa e derrubou o e-mail da
 *    plataforma inteira.
 */

const API = join(process.cwd(), "src/app/api")
const PUBLIC_CHECKOUT_DIRS = ["loja/checkout", "checkout"]

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...routeFiles(full))
    else if (entry === "route.ts") out.push(full)
  }
  return out
}

const routes = PUBLIC_CHECKOUT_DIRS.flatMap((d) => routeFiles(join(API, d)))
const postRoutes = routes.filter((f) => /export (const|async function) POST\b/.test(readFileSync(f, "utf8")))

describe("checkouts publicos", () => {
  it("encontra as rotas (sanidade do teste)", () => {
    expect(postRoutes.length).toBeGreaterThanOrEqual(13)
  })

  it.each(postRoutes.map((f) => [f.replace(API, "api")]))("%s confere o BotID", (rel) => {
    const src = readFileSync(join(API, rel.replace(/^api/, "")), "utf8")
    expect(src).toMatch(/const bot = await rejectBot\(\)\s*\n\s*if \(bot\) return bot/)
  })

  it("o cliente BotID protege os mesmos prefixos", () => {
    const client = readFileSync(join(process.cwd(), "src/instrumentation-client.ts"), "utf8")
    for (const d of PUBLIC_CHECKOUT_DIRS) {
      expect(client).toContain(`"/api/${d}"`)
      expect(client).toContain(`"/api/${d}/*"`)
    }
  })

  it.each(routes.map((f) => [f.replace(API, "api")]))("%s nao cria acesso antes do pagamento", (rel) => {
    const src = readFileSync(join(API, rel.replace(/^api/, "")), "utf8")
    expect(src).not.toMatch(/provisionStudentAccess|generatePasswordWithHash|student-welcome/)
  })
})
