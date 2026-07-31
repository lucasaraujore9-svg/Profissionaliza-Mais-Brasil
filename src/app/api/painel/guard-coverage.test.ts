import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * Invariante do par ver/editar no painel da unidade.
 *
 * Espelha `src/app/api/admin/guard-coverage.test.ts`. O defeito que motivou o
 * teste morava AQUI: PATCH, DELETE, mudança de etapa, atividades e disparo de
 * WhatsApp de lead eram guardados por `leads.view`. O preset do Vendedor tem
 * essa permissão — ou seja, quem só podia CONSULTAR o funil apagava lead. A
 * escrita agora é `leads.manage`, e este teste impede a regressão.
 *
 * A checagem é por HANDLER, não por arquivo: um DELETE novo num route.ts cujo
 * GET já é gateado não pode herdar o gate do vizinho.
 */

const ROOT = join(process.cwd(), "src/app/api/painel")

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

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])
const HANDLER_START =
  /^export (?:const|async function) (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/
const READ = /\.(view|viewAll)$/

describe("escrita não pode ser guardada por permissão de leitura (/api/painel)", () => {
  const files = routeFiles(ROOT)

  /**
   * Escritas que LEGITIMAMENTE exigem só a permissão de leitura da área.
   * Todas são auto-serviço: gravam algo do PRÓPRIO usuário, nunca um dado da
   * unidade ou de terceiro.
   */
  const EXCECOES: Record<string, string> = {
    "onboarding-tour/route.ts":
      "Auto-serviço: marca o tour guiado como visto para o próprio usuário. " +
      "Quem enxerga o painel (`dashboard.view`) pode dispensar o próprio tour.",
    "treinamentos/progress/route.ts":
      "Auto-serviço: grava o PRÓPRIO progresso de quem assiste. Quem pode " +
      "assistir (`treinamentos.view`) pode marcar a própria aula como vista.",
  }

  it("encontra as rotas do painel", () => {
    expect(files.length).toBeGreaterThan(50)
  })

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
        const call = body.match(/\brequirePainel\(([^)]*)\)/)
        if (!call) return

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

  /**
   * O caso concreto, fixado por nome: se alguém reverter o guard das rotas de
   * lead, o teste acima já quebra — mas este diz QUAL era o defeito, para quem
   * ler a falha daqui a um ano.
   */
  it("as rotas de lead exigem leads.manage para escrever", () => {
    const rotas = [
      "leads/[id]/route.ts",
      "leads/[id]/stage/route.ts",
      "leads/[id]/activities/route.ts",
      "leads/[id]/whatsapp/route.ts",
    ]
    for (const rel of rotas) {
      const src = readFileSync(join(ROOT, rel), "utf-8")
      expect(src, rel).toContain('requirePainel("leads.manage")')
    }
  })
})

/**
 * Rotas do painel ainda fora do modelo de permissão, usando os guards por PAPEL
 * (`requireResellerOwner` / `requireResellerSeller`).
 *
 * Não são um vazamento hoje — `equipe.manage` e `conta.delete` são
 * OWNER_EXCLUSIVE, e sub-revendas exige o módulo contratado —, mas são o resto
 * da dívida: enquanto estiverem aqui, essas telas não respondem a
 * `extraPermissions`/`revokedPermissions`. A lista é FECHADA de propósito: uma
 * rota nova que nasça com guard por papel quebra o teste.
 */
describe("dívida: rotas ainda com guard por papel", () => {
  const files = routeFiles(ROOT)

  const CONHECIDAS = [
    "equipe/route.ts",
    "equipe/[id]/route.ts",
    "equipe/[id]/resend-invite/route.ts",
    "equipe/preview/route.ts",
    "revendas/route.ts",
    "revendas/leads/[id]/route.ts",
  ]

  it("nenhuma rota NOVA usa guard por papel", () => {
    const usandoPapel = files.filter((rel) =>
      /require(ResellerOwner|ResellerSeller|ResellerSession)\(/.test(
        readFileSync(join(ROOT, rel), "utf-8"),
      ),
    )
    // Igualdade exata: entrar na lista exige decisão consciente; sair dela
    // (migrar para requirePainel) também quebra e pede a atualização.
    expect(usandoPapel.sort()).toEqual([...CONHECIDAS].sort())
  })
})
