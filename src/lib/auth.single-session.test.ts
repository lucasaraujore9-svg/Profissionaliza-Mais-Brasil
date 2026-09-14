import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Um acesso por vez, no lugar onde a regra de fato roda: o `authorize` do login
 * de aluno e o callback `jwt` do NextAuth. A config é capturada do `NextAuth()`
 * mockado, então o teste exercita as funções reais de `src/lib/auth.ts`.
 */

type AnyFn = (...args: unknown[]) => unknown
const captured = vi.hoisted(() => ({
  config: null as null | {
    callbacks: { jwt: AnyFn }
    providers: Array<{ authorize: AnyFn }>
  },
}))

vi.mock("next-auth", () => ({
  default: (config: typeof captured.config) => {
    captured.config = config
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }
  },
}))
vi.mock("next-auth/providers/credentials", () => ({
  default: (cfg: unknown) => cfg,
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn(), findUnique: vi.fn() },
    student: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    tenant: { findUnique: vi.fn() },
    tenantMember: { findFirst: vi.fn() },
  },
}))
vi.mock("bcryptjs", () => ({ compare: vi.fn(async () => true) }))
vi.mock("@/lib/ratelimit", () => ({
  rateLimitByKey: vi.fn(async () => ({ ok: true })),
  RATE_LIMITS: { authLogin: {} },
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))
vi.mock("@/lib/env", () => ({ authSecret: () => "x".repeat(32) }))
vi.mock("@/lib/after-response", () => ({ afterResponse: vi.fn() }))
vi.mock("@/lib/students/session-sync", () => ({ pushStudentSessionToLms: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { afterResponse } from "@/lib/after-response"
import "./auth"

type Mock = ReturnType<typeof vi.fn>
const studentFindUnique = prisma.student.findUnique as unknown as Mock
const studentFindFirst = prisma.student.findFirst as unknown as Mock
const studentUpdate = prisma.student.update as unknown as Mock
const userFindFirst = prisma.user.findFirst as unknown as Mock
const tenantFindUnique = prisma.tenant.findUnique as unknown as Mock

function jwt(args: Record<string, unknown>) {
  return captured.config!.callbacks.jwt(args) as Promise<Record<string, unknown> | null>
}

function authorize(credentials: Record<string, string>) {
  const request = new Request("https://loja.example.com/api/auth/callback/credentials", {
    headers: { "x-tenant-id": "t1" },
  })
  return captured.config!.providers[0].authorize(credentials, request) as Promise<
    Record<string, unknown> | null
  >
}

beforeEach(() => {
  vi.clearAllMocks()
  tenantFindUnique.mockResolvedValue({ id: "t1" })
  userFindFirst.mockResolvedValue(null)
})

describe("login do aluno", () => {
  beforeEach(() => {
    studentFindFirst.mockResolvedValue({
      id: "st1",
      nome: "Maria",
      email: "maria@x.com",
      passwordHash: "hash",
      tenantId: "t1",
      status: "ATIVO",
    })
    studentUpdate.mockResolvedValue({})
  })

  it("grava a sessão nova como a única válida e a devolve para o JWT", async () => {
    const user = await authorize({ email: "maria@x.com", password: "segredo1" })

    expect(user?.sessionId).toMatch(/^pmb_/)
    const data = studentUpdate.mock.calls[0][0].data
    expect(data.activeSessionId).toBe(user?.sessionId)
    expect(data.activeSessionAt).toBeInstanceOf(Date)
    // A sessão aberta na plataforma de aulas em outro aparelho é avisada.
    expect(afterResponse).toHaveBeenCalledTimes(1)
  })

  it("dois logins seguidos geram sessões diferentes", async () => {
    const a = await authorize({ email: "maria@x.com", password: "segredo1" })
    const b = await authorize({ email: "maria@x.com", password: "segredo1" })
    expect(a?.sessionId).not.toBe(b?.sessionId)
  })

  it("se não consegue gravar a sessão, recusa o login em vez de emitir JWT órfão", async () => {
    // Um JWT com `sid` que o banco não conhece seria deslogado no primeiro clique.
    studentUpdate.mockRejectedValue(new Error("db down"))
    const user = await authorize({ email: "maria@x.com", password: "segredo1" })
    expect(user).toBeNull()
  })

  it("o login copia o sid para o token", async () => {
    const token = await jwt({
      token: { sub: "st1" },
      user: { role: "STUDENT", tenantId: "t1", studentId: "st1", sessionId: "pmb_novo" },
    })
    expect(token?.sid).toBe("pmb_novo")
  })
})

describe("callback jwt · aluno", () => {
  it("token do login mais recente segue valendo", async () => {
    studentFindUnique.mockResolvedValue({ activeSessionId: "pmb_2" })
    const token = await jwt({ token: { sub: "st1", studentId: "st1", sid: "pmb_2" } })
    expect(token).not.toBeNull()
  })

  it("token de um login ANTERIOR (outro aparelho) é derrubado", async () => {
    studentFindUnique.mockResolvedValue({ activeSessionId: "pmb_2" })
    const token = await jwt({ token: { sub: "st1", studentId: "st1", sid: "pmb_1" } })
    expect(token).toBeNull()
  })

  it("token antigo, sem sid, é derrubado", async () => {
    studentFindUnique.mockResolvedValue({ activeSessionId: null })
    const token = await jwt({ token: { sub: "st1", studentId: "st1" } })
    expect(token).toBeNull()
  })

  it("'entrar como' do suporte não consulta nem derruba", async () => {
    const token = await jwt({
      token: { sub: "st1", studentId: "st1", impersonatedBy: "admin_1" },
    })
    expect(token).not.toBeNull()
    expect(studentFindUnique).not.toHaveBeenCalled()
  })

  it("falha do banco mantém a sessão — não desloga todo mundo porque o banco piscou", async () => {
    studentFindUnique.mockRejectedValue(new Error("timeout"))
    const token = await jwt({ token: { sub: "st1", studentId: "st1", sid: "pmb_1" } })
    expect(token).not.toBeNull()
  })

  it("não afeta a sessão de usuário interno (sem studentId)", async () => {
    const token = await jwt({ token: { sub: "u1", refreshedAt: Date.now() } })
    expect(token).not.toBeNull()
    expect(studentFindUnique).not.toHaveBeenCalled()
  })
})
