import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

import { removerCurso } from "./client"

/**
 * A remoção de curso na plataforma legada falha com HTTP 403 desde jul/2026
 * (59 de 59 na auditoria). A mensagem era só "HTTP 403: Forbidden": sem o corpo
 * não dá para saber se quem recusa é o firewall do servidor ou a aplicação.
 */
describe("cliente da plataforma legada — erro HTTP", () => {
  beforeEach(() => {
    process.env.EA_API_URL = "https://ea.test/api/v2"
    process.env.EA_API_TOKEN = "t"
  })
  afterEach(() => vi.unstubAllGlobals())

  it("leva o corpo da resposta (sem HTML) na mensagem do erro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("<html><body><h1>403</h1>\n<p>Blocked by   firewall</p></body></html>", {
          status: 403,
          statusText: "Forbidden",
        }),
      ),
    )
    await expect(removerCurso({ aluno: 1, idcurso: 2 })).rejects.toThrow(
      "HTTP 403: Forbidden — 403 Blocked by firewall",
    )
  })

  it("sem corpo, a mensagem segue como era", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 403, statusText: "Forbidden" })))
    await expect(removerCurso({ aluno: 1, idcurso: 2 })).rejects.toThrow(/^HTTP 403: Forbidden$/)
  })
})
