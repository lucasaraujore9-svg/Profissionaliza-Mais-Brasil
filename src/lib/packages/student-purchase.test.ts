import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Combo comprado pelo aluno JÁ LOGADO (chamado Capacita Pró Brasil, 30/09): o
 * checkout anônimo recusa quem tem login e a área do aluno não vendia combo.
 */

const db = vi.hoisted(() => ({
  student: { findUnique: vi.fn() },
  coupon: { findFirst: vi.fn() },
  enrollment: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}))
const pkg = vi.hoisted(() => ({ get: vi.fn() }))
const coupons = vi.hoisted(() => ({ consume: vi.fn(async () => true), release: vi.fn(async () => undefined) }))
const free = vi.hoisted(() => ({ release: vi.fn(async () => undefined) }))

vi.mock("@/lib/prisma", () => ({ prisma: db }))
vi.mock("@/lib/packages/vitrine", () => ({ getPackageForCheckout: pkg.get }))
vi.mock("@/lib/coupons/consume", () => ({
  tryConsumeCoupon: coupons.consume,
  releaseCoupon: coupons.release,
}))
vi.mock("@/lib/checkout/free-enrollment", () => ({
  isFreeAmount: (v: number) => v <= 0,
  releaseFreeEnrollment: free.release,
  resellerTenantContext: (t: unknown) => t,
}))
vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { contextLogger: () => noop }
})

import { startStudentPackagePurchase } from "./student-purchase"

const tenant = {
  id: "ten_1",
  slug: "capacitaprobrasil",
  name: "Capacita",
  status: "ACTIVE",
  mpAccessToken: "enc",
  mpPublicKey: "pk",
  plataformaVendedorId: null,
  salesGateway: "MP" as const,
  asaasConnected: false,
  asaasWebhookToken: null,
}

const student = {
  id: "stu_1",
  nome: "Leila",
  email: "leila@x.com",
  cpf: "39053344705",
  fone: "31999999999",
  nascimento: new Date("1990-01-01"),
  responsavel: null,
  cpfResponsavel: null,
  responsavelEmail: null,
  responsavelFone: null,
  asaasCustomerId: null,
  responsavelAsaasCustomerId: null,
}

async function buy(extra: { couponCode?: string } = {}) {
  const res = await startStudentPackagePurchase({
    tenant,
    studentId: "stu_1",
    packageId: "pkg_1",
    ...extra,
  })
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  db.student.findUnique.mockResolvedValue(student)
  pkg.get.mockResolvedValue({
    id: "pkg_1",
    name: "COMBO GESTÃO",
    price: 99.9,
    courses: [{ id: "c_1" }, { id: "c_2" }],
  })
  db.enrollment.findFirst.mockResolvedValue(null)
  db.enrollment.create.mockResolvedValue({ id: "enr_new" })
})

describe("startStudentPackagePurchase", () => {
  it("cria a matrícula PRIMÁRIA do combo, no escopo da loja do aluno", async () => {
    const r = await buy()
    expect(r).toEqual({ status: 200, body: { data: { enrollmentId: "enr_new" } } })
    expect(pkg.get).toHaveBeenCalledWith("ten_1", "pkg_1")
    expect(db.enrollment.create.mock.calls[0][0].data).toMatchObject({
      tenantId: "ten_1",
      studentId: "stu_1",
      courseId: "c_1",
      coursePackageId: "pkg_1",
      packagePrimary: true,
      paymentType: "ONE_TIME",
      status: "PENDING",
      finalAmount: 99.9,
    })
  })

  it("combo de outra loja (ou oculto) não é vendido", async () => {
    pkg.get.mockResolvedValue(null)
    expect((await buy()).status).toBe(404)
    expect(db.enrollment.create).not.toHaveBeenCalled()
  })

  it("combo já comprado: 409, e o cupom reservado volta", async () => {
    db.coupon.findFirst.mockResolvedValue({
      id: "cup_1", tenantId: "ten_1", maxUses: null, usedCount: 0,
      discountType: "PERCENTAGE", discountValue: 10,
    })
    db.enrollment.findFirst.mockResolvedValue({ id: "enr_old", status: "ACTIVE", couponId: null, finalAmount: 99.9 })
    const r = await buy({ couponCode: "x10" })
    expect(r.status).toBe(409)
    expect(coupons.release).toHaveBeenCalledWith("cup_1")
  })

  it("compra PENDENTE é reaproveitada e ganha o cupom esquecido", async () => {
    db.coupon.findFirst.mockResolvedValue({
      id: "cup_1", tenantId: "ten_1", maxUses: null, usedCount: 0,
      discountType: "PERCENTAGE", discountValue: 10,
    })
    db.enrollment.findFirst.mockResolvedValue({ id: "enr_old", status: "PENDING", couponId: null, finalAmount: 99.9 })
    const r = await buy({ couponCode: "x10" })
    expect(r.body).toEqual({ data: { enrollmentId: "enr_old" } })
    expect(db.enrollment.create).not.toHaveBeenCalled()
    expect(db.enrollment.update.mock.calls[0][0]).toMatchObject({
      where: { id: "enr_old" },
      data: { couponId: "cup_1" },
    })
  })

  it("cupom de 100% libera o combo na hora, sem gateway", async () => {
    db.coupon.findFirst.mockResolvedValue({
      id: "cup_all", tenantId: "ten_1", maxUses: null, usedCount: 0,
      discountType: "PERCENTAGE", discountValue: 100,
    })
    const r = await buy({ couponCode: "free" })
    expect(r.body).toEqual({ data: { enrollmentId: "enr_new", free: true } })
    expect(free.release).toHaveBeenCalledWith(tenant, "enr_new")
  })

  it("menor sem responsável na ficha é recusado (a cobrança sairia no CPF da criança)", async () => {
    db.student.findUnique.mockResolvedValue({ ...student, nascimento: new Date(Date.now() - 10 * 365 * 864e5) })
    const r = await buy()
    expect(r.body.code).toBe("GUARDIAN_REQUIRED")
    expect(db.enrollment.create).not.toHaveBeenCalled()
  })
})
