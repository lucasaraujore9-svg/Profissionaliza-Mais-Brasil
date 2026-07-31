import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * Invariante de cobertura do guard do sistema mãe.
 *
 * Toda rota sob /api/admin passa pelo guard por permissão. Antes deste modelo,
 * cada rota reimplementava a matriz à mão (`requireAdminSession` + um
 * `if (role !== "SUPER_ADMIN")`), e foi assim que apareceram os buracos que
 * motivaram a mudança — por exemplo, o export de comissões que qualquer pessoa
 * da equipe interna baixava.
 *
 * Este teste falha quando alguém cria uma rota nova sem gate. Se a rota for
 * legitimamente aberta, ela entra em EXCECOES com a justificativa.
 */

const ROOT = join(process.cwd(), "src/app/api/admin")

/** Rotas deliberadamente sem gate de permissão. */
const EXCECOES: Record<string, string> = {
  "end-impersonation/route.ts":
    "Encerra a impersonação e devolve a sessão do admin real. Precisa responder " +
    "com o cookie do alvo ativo — validar permissão do alvo aqui trancaria a " +
    "pessoa dentro da impersonação.",
}

function routeFiles(dir: string, prefix = ""): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...routeFiles(full, prefix ? `${prefix}/${entry}` : entry))
    } else if (entry === "route.ts") {
      out.push(prefix ? `${prefix}/${entry}` : entry)
    }
  }
  return out
}

describe("cobertura do guard em /api/admin", () => {
  const files = routeFiles(ROOT)

  it("encontra as rotas do admin", () => {
    expect(files.length).toBeGreaterThan(100)
  })

  // Cobertura POR HANDLER, não por arquivo: procurar `requireAdmin(` em algum
  // lugar do route.ts deixava passar um `export const DELETE` novo, sem gate,
  // dentro de um arquivo cujo GET já era gateado — exatamente o buraco que este
  // teste diz fechar. Contamos os handlers HTTP exportados contra as chamadas
  // do guard.
  const HTTP =
    /^export (const|async function) (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/gm
  const GUARD = /\brequireAdmin(Any)?\(/g

  it.each(files.filter((f) => !(f in EXCECOES)))(
    "%s: todo handler HTTP passa por requireAdmin",
    (rel) => {
      const src = readFileSync(join(ROOT, rel), "utf-8")
      const handlers = src.match(HTTP) ?? []
      const guards = src.match(GUARD) ?? []
      expect(handlers.length, "arquivo sem handler HTTP exportado").toBeGreaterThan(0)
      expect(
        guards.length,
        `${handlers.length} handler(s), ${guards.length} chamada(s) de guard`,
      ).toBeGreaterThanOrEqual(handlers.length)
    },
  )

  /**
   * `requireAdmin()` sem argumento só exige sessão da equipe interna. É
   * legítimo em auto-serviço (o próprio perfil); em qualquer outra rota é um
   * gate que não gateia nada.
   */
  it("requireAdmin() sem permissão só aparece em auto-serviço", () => {
    const AUTO_SERVICO = ["me/route.ts"]
    const offenders = files.filter((rel) => {
      if (AUTO_SERVICO.includes(rel)) return false
      const src = readFileSync(join(ROOT, rel), "utf-8")
      return /\brequireAdmin(Any)?\(\s*\)/.test(src)
    })
    expect(offenders).toEqual([])
  })

  it("nenhuma rota volta a decidir autorização por papel cru", () => {
    const offenders = files.filter((rel) => {
      const src = readFileSync(join(ROOT, rel), "utf-8")
      // Procuramos a forma NEGATIVA aplicada ao papel do ATOR — que é a
      // assinatura de um gate ("não é X, então 403").
      //
      // Ficam de fora, por serem legítimos:
      //   - `role === "X"` do ator, que molda ESCOPO/formato (qual dashboard,
      //     qual teto de cupom) e não concede nem nega acesso;
      //   - o papel de um TERCEIRO (`seller.role !== "PMB_REVENDA_SALES"`), que
      //     é regra de negócio sobre o alvo, não sobre quem chamou.
      const actor = /\b(ctx|session|guard\.ctx|admin|actor)\.role !== "(SUPER_ADMIN|PMB_[A-Z_]+)"/
      const allowlist = /\.includes\((ctx|session|guard\.ctx|admin|actor)\.role\)/
      return actor.test(src) || allowlist.test(src)
    })
    expect(offenders).toEqual([])
  })

  it("nenhuma rota volta a usar os guards por papel", () => {
    const offenders = files.filter((rel) => {
      const src = readFileSync(join(ROOT, rel), "utf-8")
      return /require(AdminSession|SuperAdmin|PmbTeam|PmbSales|ArtesManager|PmbResellerMgr)\(/.test(
        src,
      )
    })
    expect(offenders).toEqual([])
  })
})

/**
 * Mesmo invariante do lado das PÁGINAS. Uma página sem gate não vaza dados por
 * si só (as APIs continuam fechadas), mas entrega uma tela vazia ou quebrada —
 * foi o que acontecia com /admin/financeiro para o vendedor de curso.
 */
describe("cobertura do guard nas páginas /admin", () => {
  const PAGES = join(process.cwd(), "src/app/admin")

  function pageFiles(dir: string, prefix = ""): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        out.push(...pageFiles(full, prefix ? `${prefix}/${entry}` : entry))
      } else if (entry === "page.tsx") {
        out.push(prefix ? `${prefix}/${entry}` : entry)
      }
    }
    return out
  }

  const files = pageFiles(PAGES)

  it("nenhuma página volta a usar requireAdminSession", () => {
    const offenders = files.filter((rel) =>
      /requireAdminSession\(/.test(readFileSync(join(PAGES, rel), "utf-8")),
    )
    expect(offenders).toEqual([])
  })

  // Cobertura POSITIVA: cada página resolve o contexto do admin. As exceções
  // são shells sem dado próprio, servidos por APIs já gateadas.
  const SEM_GUARD_PROPRIO: Record<string, string> = {
    "analytics/page.tsx": "redirect puro para /admin/relatorios/visao-geral",
    "banner/page.tsx": "redirect puro para /admin/vitrine",
    "certificados/template-padrao/page.tsx": "redirect puro",
    "configuracoes/certificados/page.tsx": "redirect puro",
    "meu-perfil/page.tsx": "auto-serviço; o layout já exige sessão da equipe",
    "notificacoes/page.tsx": "auto-serviço; o layout já exige sessão da equipe",
  }

  it.each(files.filter((f) => !(f in SEM_GUARD_PROPRIO)))(
    "%s passa por requireAdminPage",
    (rel) => {
      const src = readFileSync(join(PAGES, rel), "utf-8")
      expect(src).toMatch(/\brequireAdminPage(Any)?\(/)
    },
  )

  it("nenhuma página decide autorização pelo papel do ator", () => {
    const offenders = files.filter((rel) => {
      const src = readFileSync(join(PAGES, rel), "utf-8")
      return /\b(ctx|session|guard\.ctx|admin|actor)\.role !== "(SUPER_ADMIN|PMB_[A-Z_]+)"/.test(
        src,
      )
    })
    expect(offenders).toEqual([])
  })
})

/**
 * Invariante do par ver/editar.
 *
 * Um handler de ESCRITA guardado por permissão de LEITURA é o buraco que este
 * modelo existe para fechar: quem recebeu "pode consultar" ganha "pode alterar"
 * de brinde. Foi assim que, do lado da unidade, o Vendedor — cujo preset tem
 * `leads.view` — conseguia EXCLUIR lead.
 *
 * A checagem é por HANDLER (o guard fica dentro de cada `export const POST`),
 * não por arquivo: um DELETE novo num route.ts cujo GET já é gateado não pode
 * herdar o gate do vizinho.
 */
describe("escrita não pode ser guardada por permissão de leitura (/api/admin)", () => {
  const files = routeFiles(ROOT)
  const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])
  const HANDLER_START =
    /^export (?:const|async function) (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/

  /**
   * Escritas que LEGITIMAMENTE exigem só a permissão de leitura da área.
   * Todas são auto-serviço ou consulta expressa como POST — nunca alteram um
   * dado de terceiro.
   */
  const EXCECOES: Record<string, string> = {
    "cupons/validate/route.ts":
      "Consulta expressa como POST (valida um código e devolve o desconto). " +
      "Não grava nada; é POST só porque o código vai no corpo.",
    "treinamentos/progress/route.ts":
      "Auto-serviço: grava o PRÓPRIO progresso de quem assiste. Quem pode " +
      "assistir (`treinamentos.view`) pode marcar a própria aula como vista.",
  }

  const READ = /\.(view|viewAll)$/

  it("nenhum POST/PUT/PATCH/DELETE se contenta com .view", () => {
    const offenders: string[] = []

    for (const rel of files) {
      if (rel in EXCECOES) continue
      const lines = readFileSync(join(ROOT, rel), "utf-8").split("\n")

      const starts: { method: string; line: number }[] = []
      lines.forEach((l, i) => {
        const m = l.match(HANDLER_START)
        if (m) starts.push({ method: m[1], line: i })
      })

      starts.forEach((s, idx) => {
        if (!WRITE_METHODS.has(s.method)) return
        const end = idx + 1 < starts.length ? starts[idx + 1].line : lines.length
        const body = lines.slice(s.line, end).join("\n")
        const call = body.match(/\brequireAdmin(?:Any)?\(([^)]*)\)/)
        if (!call) return // cobertura de guard é problema do teste acima

        const perms = (call[1].match(/"([^"]+)"/g) ?? []).map((p) =>
          p.replace(/"/g, ""),
        )
        if (perms.length === 0) return
        if (perms.every((p) => READ.test(p))) {
          offenders.push(`${rel} → ${s.method} guardado por ${perms.join(", ")}`)
        }
      })
    }

    expect(offenders).toEqual([])
  })
})
