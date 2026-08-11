import { describe, it, expect, vi, beforeEach } from "vitest"

// Prévia de cupom da área do aluno. O que importa travar aqui é o ESCOPO: o
// aluno de uma unidade não pode enxergar (nem aplicar) cupom da PMB, e
// vice-versa — e a decisão vem de `Student.tenantId` no banco, não do JWT.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    student: { findUnique: vi.fn() },
    course: { findFirst: vi.fn() },
    tenantCourse: { findFirst: vi.fn() },
    coupon: { findFirst: vi.fn() },
  },
}))

vi.mock("@/lib/auth/student-session", () => ({
  requireStudentSession: vi.fn(),
}))

vi.mock("@/lib/ratelimit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ratelimit")>(
    "@/lib/ratelimit",
  )
  return {
    ...actual,
    rateLimitByKey: vi.fn().mockResolvedValue({
      ok: true,
      remaining: 19,
      limit: 20,
      retryAfterSec: 0,
    }),
  }
})

import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { rateLimitByKey } from "@/lib/ratelimit"
import { POST } from "./route"

const studentFindUnique = prisma.student.findUnique as unknown as ReturnType<typeof vi.fn>
const courseFindFirst = prisma.course.findFirst as unknown as ReturnType<typeof vi.fn>
const tenantCourseFindFirst = prisma.tenantCourse.findFirst as unknown as ReturnType<typeof vi.fn>
const couponFindFirst = prisma.coupon.findFirst as unknown as ReturnType<typeof vi.fn>
const sessionMock = requireStudentSession as unknown as ReturnType<typeof vi.fn>
const rlMock = rateLimitByKey as unknown as ReturnType<typeof vi.fn>

const PAST = new Date("2020-01-01T00:00:00Z")
const FUTURE = new Date("2999-01-01T00:00:00Z")

function req(body: unknown) {
  return new Request("http://x/api/aluno/cupom/validar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function validCoupon(overrides: Record<string, unknown> = {}) {
  return {
    code: "PROMO50",
    discountType: "PERCENTAGE",
    discountValue: 50,
    maxUses: null,
    usedCount: 0,
    isActive: true,
    validFrom: PAST,
    validUntil: FUTURE,
    ...overrides,
  }
}

beforeEach(() => {
  studentFindUnique.mockReset()
  courseFindFirst.mockReset()
  tenantCourseFindFirst.mockReset()
  couponFindFirst.mockReset()
  sessionMock.mockReset()
  sessionMock.mockResolvedValue({
    studentId: "stu_1",
    email: "a@b.com",
    tenantId: null,
  })
  rlMock.mockReset()
  rlMock.mockResolvedValue({ ok: true, remaining: 19, limit: 20, retryAfterSec: 0 })
})

describe("aluno/cupom/validar", () => {
  it("não autenticado → 401 sem consultar o banco", async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(req({ code: "PROMO50", courseId: "c1" }))
    expect(res.status).toBe(401)
    expect(couponFindFirst).not.toHaveBeenCalled()
  })

  it("rate limit estourado → 429 sem consultar o banco", async () => {
    rlMock.mockResolvedValue({ ok: false, remaining: 0, limit: 20, retryAfterSec: 60 })
    const res = await POST(req({ code: "PROMO50", courseId: "c1" }))
    expect(res.status).toBe(429)
    expect(couponFindFirst).not.toHaveBeenCalled()
  })

  it("corpo inválido → 400", async () => {
    const res = await POST(req({ code: "" }))
    expect(res.status).toBe(400)
    expect(couponFindFirst).not.toHaveBeenCalled()
  })

  it("aluno PMB busca cupom no escopo PMB (tenantId null) e usa o preço da vitrine mãe", async () => {
    studentFindUnique.mockResolvedValue({ tenant: { id: "t_pmb", slug: "__pmb__" } })
    courseFindFirst.mockResolvedValue({
      precoVitrineMain: 200,
      precoPromocional: null,
      precoOriginal: 500,
    })
    couponFindFirst.mockResolvedValue(validCoupon())

    const res = await POST(req({ code: "promo50", courseId: "c1" }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(couponFindFirst.mock.calls[0][0].where).toMatchObject({
      tenantId: null,
      code: "PROMO50",
    })
    // 50% sobre o preço de vitrine (200), não sobre o preço original (500).
    expect(body.data).toMatchObject({
      code: "PROMO50",
      basePrice: 200,
      discountAmount: 100,
      finalPrice: 100,
    })
    expect(tenantCourseFindFirst).not.toHaveBeenCalled()
  })

  it("aluno de revenda busca cupom DA UNIDADE e usa o preço da unidade", async () => {
    studentFindUnique.mockResolvedValue({ tenant: { id: "t_1", slug: "revenda1" } })
    tenantCourseFindFirst.mockResolvedValue({ price: 300 })
    couponFindFirst.mockResolvedValue(validCoupon({ code: "UNIDADE10", discountValue: 10 }))

    const res = await POST(req({ code: "UNIDADE10", courseId: "c1" }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(couponFindFirst.mock.calls[0][0].where).toMatchObject({
      tenantId: "t_1",
      code: "UNIDADE10",
    })
    expect(body.data).toMatchObject({ basePrice: 300, discountAmount: 30, finalPrice: 270 })
    expect(courseFindFirst).not.toHaveBeenCalled()
  })

  it("escopo vem de Student.tenantId, NÃO do claim do JWT", async () => {
    // JWT sem tenantId (caso que já causou vazamento de receita no /comprar):
    // ainda assim o cupom tem de ser procurado no escopo da unidade do aluno.
    sessionMock.mockResolvedValue({ studentId: "stu_1", email: "a@b.com", tenantId: null })
    studentFindUnique.mockResolvedValue({ tenant: { id: "t_1", slug: "revenda1" } })
    tenantCourseFindFirst.mockResolvedValue({ price: 100 })
    couponFindFirst.mockResolvedValue(null)

    const res = await POST(req({ code: "SUPER50", courseId: "c1" }))

    expect(res.status).toBe(400)
    expect(couponFindFirst.mock.calls[0][0].where.tenantId).toBe("t_1")
  })

  it("curso fora da vitrine da unidade → 404 sem tocar em cupom", async () => {
    studentFindUnique.mockResolvedValue({ tenant: { id: "t_1", slug: "revenda1" } })
    tenantCourseFindFirst.mockResolvedValue(null)

    const res = await POST(req({ code: "PROMO50", courseId: "c1" }))
    expect(res.status).toBe(404)
    expect(couponFindFirst).not.toHaveBeenCalled()
  })

  it("curso sem preço configurado → 400 sem tocar em cupom", async () => {
    studentFindUnique.mockResolvedValue({ tenant: { id: "t_pmb", slug: "__pmb__" } })
    courseFindFirst.mockResolvedValue({
      precoVitrineMain: null,
      precoPromocional: null,
      precoOriginal: null,
    })

    const res = await POST(req({ code: "PROMO50", courseId: "c1" }))
    expect(res.status).toBe(400)
    expect(couponFindFirst).not.toHaveBeenCalled()
  })

  it("cupom expirado → 400 com a data na mensagem", async () => {
    studentFindUnique.mockResolvedValue({ tenant: { id: "t_pmb", slug: "__pmb__" } })
    courseFindFirst.mockResolvedValue({
      precoVitrineMain: 100,
      precoPromocional: null,
      precoOriginal: null,
    })
    couponFindFirst.mockResolvedValue(validCoupon({ validUntil: PAST }))

    const res = await POST(req({ code: "PROMO50", courseId: "c1" }))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toContain("expirou")
  })

  it("cupom esgotado → 400", async () => {
    studentFindUnique.mockResolvedValue({ tenant: { id: "t_pmb", slug: "__pmb__" } })
    courseFindFirst.mockResolvedValue({
      precoVitrineMain: 100,
      precoPromocional: null,
      precoOriginal: null,
    })
    couponFindFirst.mockResolvedValue(validCoupon({ maxUses: 5, usedCount: 5 }))

    const res = await POST(req({ code: "PROMO50", courseId: "c1" }))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toContain("esgotado")
  })

  it("a prévia NÃO reserva uso do cupom (só leitura)", async () => {
    studentFindUnique.mockResolvedValue({ tenant: { id: "t_pmb", slug: "__pmb__" } })
    courseFindFirst.mockResolvedValue({
      precoVitrineMain: 100,
      precoPromocional: null,
      precoOriginal: null,
    })
    couponFindFirst.mockResolvedValue(validCoupon())

    // O mock de prisma não expõe `$executeRaw`, que é como `tryConsumeCoupon`
    // reserva o uso: se a prévia passar a consumir, este 200 vira exceção.
    const res = await POST(req({ code: "PROMO50", courseId: "c1" }))
    expect(res.status).toBe(200)
  })
})
