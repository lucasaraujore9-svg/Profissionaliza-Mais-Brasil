import { describe, it, expect, vi, beforeEach } from "vitest"

// QA-013: caminho de dinheiro pós-webhook. `fulfillEnrollment` é o coração
// comercial — cria Payment + matrícula, provisiona acesso (EA vs LMS por
// Course.provider), libera satélites de pacote (finalAmount 0) e trata falha
// parcial do LMS (provisioning.ok=false → alerta e segue). Aqui provamos esse
// comportamento com todos os clients externos mockados (padrão do repo).

vi.mock("@/lib/prisma", () => {
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([{ pg_try_advisory_lock: true }]),
    // O fulfill usa transacao INTERATIVA (as linhas de rateio precisam do id do
    // Payment recem-criado). O mock aceita as duas formas para nao amarrar o
    // teste ao formato da chamada.
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function"
        ? await (arg as (tx: unknown) => Promise<unknown>)(prisma)
        : Promise.all(arg as Promise<unknown>[]),
    ),
    enrollment: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    payment: { findFirst: vi.fn(), create: vi.fn() },
    courseSaleSplit: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    student: { update: vi.fn() },
    coursePackageItem: { findMany: vi.fn() },
    course: { findMany: vi.fn() },
    // Venda multi-curso de unidade: a satélite resolve aqui o TenantCourse do
    // seu curso (é a coluna pela qual o painel conta matrículas ativas antes de
    // deixar remover um curso da vitrine).
    tenantCourse: { findMany: vi.fn() },
  }
  return { prisma }
})

vi.mock("@/lib/email/mailer", () => ({ sendEmail: vi.fn() }))
vi.mock("@/lib/email/brand", () => ({
  PMB_EMAIL_BRAND: { name: "PMB", siteUrl: "https://pmb.test", replyTo: null },
  emailFromForBrand: () => "PMB <no-reply@pmb.test>",
}))
vi.mock("@/lib/email/tenant-brand", () => ({
  loadTenantEmailBrand: vi.fn().mockResolvedValue({
    name: "Loja 1",
    siteUrl: "https://loja1.test",
    replyTo: null,
  }),
}))
vi.mock("@/lib/plataforma-cursos/client", () => ({ enviarEmailCredenciais: vi.fn() }))
vi.mock("@/lib/students/plataforma-actions", () => ({
  ensureStudentOnPlatform: vi.fn(),
  linkCourseToStudent: vi.fn(),
}))
vi.mock("@/lib/lms", () => ({ createLmsEnrollment: vi.fn() }))
vi.mock("@/lib/crypto", () => ({ encrypt: (s: string) => `enc(${s})` }))
vi.mock("@/lib/students/platform-credentials", () => ({
  getStudentPlatformLoginUrl: () => "https://plataforma.test/login",
}))
vi.mock("@/lib/students/generate-password", () => ({
  generatePasswordWithHash: vi.fn().mockResolvedValue({ plain: "pw", hash: "h" }),
}))
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }))
// Cota de aulas: motor real fora do escopo daqui. O que importa provar é que o
// fulfill CHAMA a avaliação — é ela que manda o teto ao LMS no ato da compra.
vi.mock("@/lib/enrollment/pace", () => ({
  evaluatePaceGate: vi.fn(),
  evaluateSatellitePaceGates: vi.fn(),
}))
// afterResponse: no-op — não roda o callback de emails (fora do escopo do dinheiro).
vi.mock("@/lib/after-response", () => ({ afterResponse: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))
vi.mock("@/lib/tenant/urls", () => ({ appUrl: () => "https://pmb.test" }))

import { prisma } from "@/lib/prisma"
import { ensureStudentOnPlatform, linkCourseToStudent } from "@/lib/students/plataforma-actions"
import { createLmsEnrollment } from "@/lib/lms"
import { createNotification } from "@/lib/notifications"
import { evaluatePaceGate } from "@/lib/enrollment/pace"
import { fulfillEnrollment, type TenantContext, type PaymentEvent } from "./fulfill"

const p = prisma as unknown as {
  $queryRaw: ReturnType<typeof vi.fn>
  $transaction: ReturnType<typeof vi.fn>
  enrollment: {
    findUnique: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
  payment: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }
  student: { update: ReturnType<typeof vi.fn> }
  coursePackageItem: { findMany: ReturnType<typeof vi.fn> }
  course: { findMany: ReturnType<typeof vi.fn> }
  tenantCourse: { findMany: ReturnType<typeof vi.fn> }
}
const ensureMock = ensureStudentOnPlatform as unknown as ReturnType<typeof vi.fn>
const linkMock = linkCourseToStudent as unknown as ReturnType<typeof vi.fn>
const lmsMock = createLmsEnrollment as unknown as ReturnType<typeof vi.fn>
const notifyMock = createNotification as unknown as ReturnType<typeof vi.fn>
const paceMock = evaluatePaceGate as unknown as ReturnType<typeof vi.fn>

const eaTenant: TenantContext = {
  id: "t1",
  slug: "loja1",
  plataformaVendedorId: "v1",
  name: "Loja 1",
}
const pmbTenant: TenantContext = {
  id: "__pmb__",
  slug: "pmb",
  plataformaVendedorId: "vp",
  name: "PMB",
  isPmbVitrine: true,
}
const event: PaymentEvent = {
  gateway: "MP",
  externalPaymentId: "pay_1",
  amount: 100,
  paidAt: new Date("2026-07-03T00:00:00.000Z"),
  paymentType: "ONE_TIME",
}

type EnrollmentOverride = Record<string, unknown>
function enrollment(overrides: EnrollmentOverride = {}) {
  return {
    id: "e1",
    tenantId: "t1",
    courseId: "c1",
    coursePackageId: null,
    coursePackage: null,
    bundleCourseIds: [],
    soldByUserId: null,
    paymentType: "ONE_TIME",
    startedAt: null,
    installmentsTotal: null,
    installmentsPaid: 0,
    mpPaymentId: null,
    asaasPaymentId: null,
    gateway: "MP",
    student: {
      id: "s1",
      email: "a@b.com",
      nome: "Aluno",
      passwordHash: "hash", // já tem senha → pula geração de senha do painel
      lmsStudentId: null,
    },
    course: { id: "c1", nome: "Curso", provider: "EA", lmsCourseId: null },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  p.$queryRaw.mockResolvedValue([{ pg_try_advisory_lock: true }])
  p.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function"
      ? await (arg as (tx: unknown) => Promise<unknown>)(p)
      : Promise.all(arg as Promise<unknown>[]),
  )
  p.payment.findFirst.mockResolvedValue(null)
  p.payment.create.mockResolvedValue({ id: "pmt1" })
  p.enrollment.update.mockResolvedValue({})
  // `evaluateSatellitePaceGates` varre as satélites da compra depois que a
  // parcela é contabilizada. Sem satélite ACTIVE, é no-op.
  p.enrollment.findMany.mockResolvedValue([])
  p.enrollment.create.mockResolvedValue({ id: "sat1" })
  p.student.update.mockResolvedValue({})
  p.coursePackageItem.findMany.mockResolvedValue([])
  p.course.findMany.mockResolvedValue([])
  p.tenantCourse.findMany.mockResolvedValue([])
  ensureMock.mockResolvedValue({ plataformaAlunoId: 42, created: true, plataformaSenha: "sec" })
  linkMock.mockResolvedValue(undefined)
  notifyMock.mockResolvedValue(undefined)
})

describe("fulfillEnrollment — dinheiro pós-webhook (QA-013)", () => {
  it("(a) EA aprovado: cria 1 Payment primário + matrícula ACTIVE, provisiona na EA, sem LMS", async () => {
    p.enrollment.findUnique.mockResolvedValue(enrollment())

    await fulfillEnrollment(eaTenant, "e1", event)

    expect(p.payment.create).toHaveBeenCalledTimes(1)
    expect(p.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "t1",
          enrollmentId: "e1",
          amount: 100,
          gateway: "MP",
          mpPaymentId: "pay_1",
          mpStatus: "APPROVED",
        }),
      }),
    )
    expect(p.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ACTIVE" }) }),
    )
    // Roteou para EA — não tocou no LMS.
    expect(ensureMock).toHaveBeenCalledWith("s1")
    expect(linkMock).toHaveBeenCalledWith("s1", "c1")
    expect(lmsMock).not.toHaveBeenCalled()
  })

  it("(a2) venda parcelada avalia a cota da PRÓPRIA matrícula na 1ª parcela", async () => {
    // Regressão: a 1ª cobrança só avaliava as satélites, então a matrícula
    // principal de um carnê 6x nascia sem teto no LMS — o curso INTEIRO ficava
    // aberto com 1 de 6 parcelas pagas, e a trava só chegaria depois, reativa,
    // quando o aluno já tivesse assistido além do que pagou.
    p.enrollment.findUnique.mockResolvedValue(
      enrollment({
        paymentType: "BOLETO_INSTALLMENT",
        installmentsTotal: 6,
        installmentsPaid: 0,
      }),
    )

    await fulfillEnrollment(eaTenant, "e1", event)

    expect(p.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ installmentsPaid: 1 }),
      }),
    )
    expect(paceMock).toHaveBeenCalledWith("e1")
  })

  it("(b) LMS aprovado: chama createLmsEnrollment com Idempotency-Key = id do pagamento e NÃO usa a EA", async () => {
    p.enrollment.findUnique.mockResolvedValue(
      enrollment({ course: { id: "c1", nome: "Curso LMS", provider: "LMS", lmsCourseId: "lms-c1" } }),
    )
    lmsMock.mockResolvedValue({
      enrollmentId: "lms-e1",
      origin: "own",
      playback: "sso",
      studentId: "lms-s1",
      provisioning: { ok: true },
      partnerAccess: null,
    })

    await fulfillEnrollment(eaTenant, "e1", event)

    expect(lmsMock).toHaveBeenCalledTimes(1)
    expect(lmsMock).toHaveBeenCalledWith(
      expect.objectContaining({ courseId: "lms-c1", studentExternalId: "s1" }),
      "pay_1", // Idempotency-Key = externalPaymentId
    )
    expect(ensureMock).not.toHaveBeenCalled()
    expect(linkMock).not.toHaveBeenCalled()
    expect(p.payment.create).toHaveBeenCalledTimes(1)
  })

  it("(c) LMS com provisioning.ok=false: alerta SUPER_ADMIN e NÃO lança (segue o fulfillment)", async () => {
    p.enrollment.findUnique.mockResolvedValue(
      enrollment({ course: { id: "c1", nome: "Curso LMS", provider: "LMS", lmsCourseId: "lms-c1" } }),
    )
    lmsMock.mockResolvedValue({
      enrollmentId: "lms-e1",
      origin: "partner",
      playback: "redirect",
      studentId: null,
      provisioning: { ok: false, message: "EA fora do ar" },
      partnerAccess: null,
    })

    await expect(fulfillEnrollment(eaTenant, "e1", event)).resolves.toBeUndefined()

    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        roleTarget: "SUPER_ADMIN",
        title: "Provisionamento parcial no LMS",
        level: "WARNING",
      }),
    )
    // Mesmo com falha parcial, o Payment é registrado (o aluno pagou).
    expect(p.payment.create).toHaveBeenCalledTimes(1)
  })

  it("(d) vitrine PMB: Payment.tenantId=null e notificação de venda direta ao SUPER_ADMIN", async () => {
    p.enrollment.findUnique.mockResolvedValue(enrollment({ tenantId: null }))

    await fulfillEnrollment(pmbTenant, "e1", event)

    expect(p.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: null }) }),
    )
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ audience: "ROLE", roleTarget: "SUPER_ADMIN" }),
    )
  })

  it("(e) idempotência: pagamento já registrado → no-op (não cria Payment nem provisiona)", async () => {
    p.enrollment.findUnique.mockResolvedValue(enrollment())
    p.payment.findFirst.mockResolvedValue({ id: "pmt-existente" })

    await fulfillEnrollment(eaTenant, "e1", event)

    expect(p.payment.create).not.toHaveBeenCalled()
    expect(ensureMock).not.toHaveBeenCalled()
    expect(lmsMock).not.toHaveBeenCalled()
  })

  it("(f) pacote misto EA+LMS: libera satélites com finalAmount 0 roteando por provider", async () => {
    p.enrollment.findUnique.mockResolvedValue(
      enrollment({ coursePackageId: "pkg1", coursePackage: { id: "pkg1", name: "Combo" } }),
    )
    // Primário (c1/EA) + satélites: c2/EA e c3/LMS.
    p.coursePackageItem.findMany.mockResolvedValue([
      { course: { id: "c1", nome: "Primário", status: "ATIVO", provider: "EA", lmsCourseId: null } },
      { course: { id: "c2", nome: "Sat EA", status: "ATIVO", provider: "EA", lmsCourseId: null } },
      { course: { id: "c3", nome: "Sat LMS", status: "ATIVO", provider: "LMS", lmsCourseId: "lms-c3" } },
    ])
    p.enrollment.findFirst.mockResolvedValue(null) // aluno ainda sem acesso aos satélites
    lmsMock.mockResolvedValue({
      enrollmentId: "lms-e3",
      origin: "own",
      playback: "sso",
      studentId: null,
      provisioning: { ok: true },
      partnerAccess: null,
    })

    await fulfillEnrollment(eaTenant, "e1", event)

    // 2 satélites criados (c2 e c3), ambos finalAmount 0, packagePrimary false.
    const satelliteCalls = p.enrollment.create.mock.calls.map((c) => c[0].data)
    expect(satelliteCalls).toHaveLength(2)
    for (const data of satelliteCalls) {
      expect(data.finalAmount).toBe(0)
      expect(data.packagePrimary).toBe(false)
      expect(data.coursePackageId).toBe("pkg1")
      // Ponteiro para quem pagou: e por ele que a COTA DE AULAS descobre o
      // parcelamento do pacote (a satelite nao tem plano proprio).
      expect(data.primaryEnrollmentId).toBe("e1")
    }
    expect(satelliteCalls.map((d) => d.courseId).sort()).toEqual(["c2", "c3"])
    // Satélite LMS provisionado via LMS; satélite EA via ensure+link.
    expect(lmsMock).toHaveBeenCalledWith(
      expect.objectContaining({ courseId: "lms-c3" }),
      "pkg:e1:c3",
    )
  })

  // Venda direta com mais de um curso: mesma mecânica do pacote, mas a lista de
  // cursos é da VENDA (`bundleCourseIds`) e a satélite aponta para a primária
  // por `primaryEnrollmentId` — não há pacote no catálogo.
  it("(g) venda multi-curso: satélites finalAmount 0 ligados à primária por primaryEnrollmentId", async () => {
    p.enrollment.findUnique.mockResolvedValue(
      enrollment({ bundleCourseIds: ["c2", "c3"] }),
    )
    p.course.findMany.mockResolvedValue([
      { id: "c2", nome: "Extra EA", status: "ATIVO", provider: "EA", lmsCourseId: null },
      { id: "c3", nome: "Extra LMS", status: "ATIVO", provider: "LMS", lmsCourseId: "lms-c3" },
    ])
    p.enrollment.findFirst.mockResolvedValue(null)
    lmsMock.mockResolvedValue({
      enrollmentId: "lms-e3",
      origin: "own",
      playback: "sso",
      studentId: null,
      provisioning: { ok: true },
      partnerAccess: null,
    })

    await fulfillEnrollment(eaTenant, "e1", event)

    const satelliteCalls = p.enrollment.create.mock.calls.map((c) => c[0].data)
    expect(satelliteCalls).toHaveLength(2)
    for (const data of satelliteCalls) {
      expect(data.finalAmount).toBe(0)
      expect(data.packagePrimary).toBe(false)
      expect(data.coursePackageId).toBeNull()
      expect(data.primaryEnrollmentId).toBe("e1")
      expect(data.status).toBe("ACTIVE")
    }
    expect(satelliteCalls.map((d) => d.courseId).sort()).toEqual(["c2", "c3"])
    // Idempotency-Key própria (`bundle:`) — nunca colide com a do pacote.
    expect(lmsMock).toHaveBeenCalledWith(
      expect.objectContaining({ courseId: "lms-c3" }),
      "bundle:e1:c3",
    )
    // Um único Payment: a receita fica toda na primária.
    expect(p.payment.create).toHaveBeenCalledTimes(1)
  })

  it("(g2) curso da venda multi-curso que ficou INATIVO não é liberado e alerta o admin", async () => {
    p.enrollment.findUnique.mockResolvedValue(enrollment({ bundleCourseIds: ["c2"] }))
    p.course.findMany.mockResolvedValue([
      { id: "c2", nome: "Extra fora do ar", status: "INATIVO", provider: "EA", lmsCourseId: null },
    ])

    await fulfillEnrollment(eaTenant, "e1", event)

    expect(p.enrollment.create).not.toHaveBeenCalled()
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        roleTarget: "SUPER_ADMIN",
        title: "Curso da venda não liberado",
      }),
    )
  })

  it("recusa fulfill com tenant mismatch (defesa cross-tenant) — não cria Payment", async () => {
    // Enrollment pertence a t1, mas o contexto é de outro tenant.
    p.enrollment.findUnique.mockResolvedValue(enrollment({ tenantId: "t1" }))
    const otherTenant: TenantContext = { ...eaTenant, id: "t2" }

    await expect(fulfillEnrollment(otherTenant, "e1", event)).rejects.toThrow(/tenant mismatch/)
    expect(p.payment.create).not.toHaveBeenCalled()
  })

  it("aborta quando o advisory lock está ocupado (outro processo em fulfill)", async () => {
    p.$queryRaw.mockResolvedValueOnce([{ pg_try_advisory_lock: false }])

    await fulfillEnrollment(eaTenant, "e1", event)

    expect(p.enrollment.findUnique).not.toHaveBeenCalled()
    expect(p.payment.create).not.toHaveBeenCalled()
  })
})
