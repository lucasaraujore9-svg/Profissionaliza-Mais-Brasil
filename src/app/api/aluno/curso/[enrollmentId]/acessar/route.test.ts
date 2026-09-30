import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * O botão "Acessar" de um curso do LMS tem que abrir AQUELE curso. Sem
 * `returnUrl`, o SSO do LMS cai em `/inicio`, que destaca o último curso
 * estudado — o aluno clicava num curso e caía em outro (chamado otymus, 29/09).
 */

const findFirst = vi.hoisted(() => vi.fn())
const createLmsSsoToken = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => ({ url: "https://lms.test/sso?token=x" })),
)

vi.mock("@/lib/prisma", () => ({ prisma: { enrollment: { findFirst } } }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/auth/impersonate", () => ({
  decodeImpersonationFlag: () => null,
  IMPERSONATION_FLAG_COOKIE: "imp",
}))
vi.mock("@/lib/auth/student-session", () => ({
  requireStudentSession: async () => ({ studentId: "stu_1", sessionId: "sid_1" }),
}))
vi.mock("@/lib/lms", () => ({
  createLmsSsoToken,
  normalizeLmsPublicUrl: (u: string | null) => u,
}))
vi.mock("@/lib/enrollment/pace-settings", () => ({
  resolvePaceGateSettings: async () => ({ enabled: false }),
}))
vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { contextLogger: () => noop }
})

import { GET } from "./route"

function enrollment(course: Record<string, unknown>) {
  return {
    tenantId: "ten_1",
    lmsPlayback: "local",
    lmsPortalUrl: null,
    paceBlockedAt: null,
    student: { id: "stu_1" },
    course: { provider: "LMS", contentType: "COURSE", lmsSlug: "macrame", ...course },
  }
}

async function access() {
  return GET(new Request("https://pmb.test/api/aluno/curso/enr_1/acessar"), {
    params: Promise.resolve({ enrollmentId: "enr_1" }),
  })
}

beforeEach(() => vi.clearAllMocks())

describe("acessar curso do LMS", () => {
  it("curso: o SSO leva ao curso CLICADO (continuar de onde parou nele), não ao último estudado", async () => {
    findFirst.mockResolvedValue(enrollment({ lmsSlug: "macrame" }))
    const res = await access()
    expect(res.headers.get("location")).toBe("https://lms.test/sso?token=x")
    expect(createLmsSsoToken.mock.calls[0][0]).toMatchObject({
      studentExternalId: "stu_1",
      sessionId: "sid_1",
      returnUrl: "/curso/macrame/continuar",
    })
  })

  it("e-book: direto para o leitor", async () => {
    findFirst.mockResolvedValue(enrollment({ contentType: "EBOOK", lmsSlug: "guia" }))
    await access()
    expect(createLmsSsoToken.mock.calls[0][0]).toMatchObject({ returnUrl: "/curso/guia/ler" })
  })

  it("sem slug: não inventa caminho", async () => {
    findFirst.mockResolvedValue(enrollment({ lmsSlug: null }))
    await access()
    expect(createLmsSsoToken.mock.calls[0][0]).not.toHaveProperty("returnUrl")
  })
})
