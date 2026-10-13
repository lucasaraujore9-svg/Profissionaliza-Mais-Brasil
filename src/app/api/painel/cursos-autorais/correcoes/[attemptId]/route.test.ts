import { describe, expect, it, vi, beforeEach } from "vitest"
import { LmsApiError } from "@/lib/lms/errors"

/*
 * Correcao de dissertativa pela unidade produtora. O que importa provar:
 *  - a unidade enviada ao LMS e SEMPRE a da sessao (o escopo da prova e
 *    aplicado la pelo dono do curso — nunca por algo que o cliente mande);
 *  - a nota exige `cursosAutorais.manage`;
 *  - recusa do LMS (409 ja corrigida, 404 de outra unidade) chega com a
 *    mensagem dele, e so o sucesso vai para `audit_logs`.
 */

const requireCourseAuthoring = vi.fn()
vi.mock("@/lib/course-authoring/module-gate", () => ({
  requireCourseAuthoring: (...a: unknown[]) => requireCourseAuthoring(...a),
}))
vi.mock("@/lib/lms/authoring", () => ({ isLmsAuthoringEnabled: () => true }))
const gradeLmsAttempt = vi.fn()
vi.mock("@/lib/lms/grading", () => ({
  gradeLmsAttempt: (...a: unknown[]) => gradeLmsAttempt(...a),
}))
const logAudit = vi.fn()
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }))
vi.mock("@/lib/logger", () => ({ contextLogger: () => ({ error: vi.fn() }) }))

const { POST } = await import("./route")

const CTX = { tenantId: "ten_A", userId: "usr_1", memberRole: "owner" }
const params = { params: Promise.resolve({ attemptId: "att_1" }) }
const req = (body: unknown) =>
  new Request("http://x/api/painel/cursos-autorais/correcoes/att_1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  vi.clearAllMocks()
  requireCourseAuthoring.mockResolvedValue({ ok: true, ctx: CTX })
  gradeLmsAttempt.mockResolvedValue({ score: 80, passed: true })
})

describe("POST /api/painel/cursos-autorais/correcoes/[attemptId]", () => {
  it("exige cursosAutorais.manage", async () => {
    requireCourseAuthoring.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Sem permissao" }, { status: 403 }),
    })
    const res = await POST(req({ awards: { a: 1 } }), params)
    expect(res.status).toBe(403)
    expect(requireCourseAuthoring).toHaveBeenCalledWith("cursosAutorais.manage")
    expect(gradeLmsAttempt).not.toHaveBeenCalled()
  })

  it("manda a unidade da sessao, nao a do corpo", async () => {
    const res = await POST(req({ awards: { a: 2 }, tenantExternalId: "ten_B" }), params)
    expect(res.status).toBe(200)
    expect(gradeLmsAttempt).toHaveBeenCalledWith({
      tenantExternalId: "ten_A",
      attemptId: "att_1",
      awards: { a: 2 },
      gradedBy: "usr_1",
    })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "course_authoring.quiz_graded", tenantId: "ten_A" }),
    )
  })

  it("nota negativa ou fracionada -> 400 sem falar com o LMS", async () => {
    expect((await POST(req({ awards: { a: -1 } }), params)).status).toBe(400)
    expect((await POST(req({ awards: { a: 1.5 } }), params)).status).toBe(400)
    expect(gradeLmsAttempt).not.toHaveBeenCalled()
  })

  it("recusa do LMS chega com a mensagem dele e nao audita", async () => {
    gradeLmsAttempt.mockRejectedValue(
      new LmsApiError("HTTP 409", "/x", 409, "Esta prova já foi corrigida."),
    )
    const res = await POST(req({ awards: { a: 1 } }), params)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: "Esta prova já foi corrigida." })
    expect(logAudit).not.toHaveBeenCalled()
  })

  it("LMS fora do ar -> 502", async () => {
    gradeLmsAttempt.mockRejectedValue(new Error("rede"))
    const res = await POST(req({ awards: { a: 1 } }), params)
    expect(res.status).toBe(502)
  })
})
