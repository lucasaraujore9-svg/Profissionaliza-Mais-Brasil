import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * O aviso "sua conta foi acessada em outro aparelho" só pode aparecer quando isso
 * de fato aconteceu. Um JWT antigo (sem `sid`) cai no deploy sem que ninguém
 * tenha entrado em outro lugar — ali o aviso mentiria.
 */

const cookieValue = vi.hoisted(() => ({ current: undefined as string | undefined }))
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (cookieValue.current ? { value: cookieValue.current } : undefined),
  }),
}))
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
const decode = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth/impersonate", () => ({
  decodeSessionToken: decode,
  sessionCookieName: () => "authjs.session-token",
}))

import { studentSessionWasReplaced } from "./student-session"

beforeEach(() => {
  vi.clearAllMocks()
  cookieValue.current = "jwt"
})

describe("studentSessionWasReplaced", () => {
  it("JWT de aluno com sid, recusado: foi outro aparelho", async () => {
    decode.mockResolvedValue({ role: "STUDENT", sid: "pmb_1" })
    expect(await studentSessionWasReplaced()).toBe(true)
  })

  it("JWT antigo, sem sid: não mostra o aviso", async () => {
    decode.mockResolvedValue({ role: "STUDENT", sid: null })
    expect(await studentSessionWasReplaced()).toBe(false)
  })

  it("sem cookie, cookie vencido ou de outro papel: não", async () => {
    cookieValue.current = undefined
    expect(await studentSessionWasReplaced()).toBe(false)
    cookieValue.current = "jwt"
    decode.mockResolvedValue(null)
    expect(await studentSessionWasReplaced()).toBe(false)
    decode.mockResolvedValue({ role: "SUPER_ADMIN", sid: null })
    expect(await studentSessionWasReplaced()).toBe(false)
  })
})
