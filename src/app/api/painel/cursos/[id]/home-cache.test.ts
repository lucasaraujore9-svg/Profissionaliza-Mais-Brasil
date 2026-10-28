import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenantCourse: { findFirst: vi.fn(), update: vi.fn() },
    tenant: { findUnique: vi.fn() },
  },
}))
vi.mock("@/lib/auth/painel-guard", () => ({ requirePainel: vi.fn() }))
vi.mock("@/lib/course-authoring/split-server", () => ({
  validateTenantCoursePrice: vi.fn().mockResolvedValue(null),
}))
vi.mock("@/lib/home/cache", () => ({ invalidateHomeCache: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { invalidateHomeCache } from "@/lib/home/cache"
import { painelGuardOk } from "@/test/painel-ctx"
import { PUT } from "./route"
import { PATCH } from "./visibility/route"

type Fn = ReturnType<typeof vi.fn>
const db = prisma as unknown as {
  tenantCourse: { findFirst: Fn; update: Fn }
}
const T = "t_home"
const params = { params: Promise.resolve({ id: "tc1" }) }

function req(method: string, body: unknown) {
  return new Request("http://x/api/painel/cursos/tc1", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(requirePainel as unknown as Fn).mockResolvedValue(painelGuardOk({ tenantId: T }))
  db.tenantCourse.findFirst.mockResolvedValue({ id: "tc1", courseId: "c1", isVisible: true })
  db.tenantCourse.update.mockResolvedValue({ id: "tc1", price: 199.9, isVisible: false })
})

// Os cards do hero ficam 60s no Redis com o preco: sem a invalidacao, a
// vitrine mostra o preco antigo logo depois de a unidade salvar.
describe("edicao de curso no painel limpa o cache da home", () => {
  it("PUT de preco invalida a home da unidade", async () => {
    const res = await PUT(req("PUT", { price: 199.9, paymentType: "ONE_TIME" }), params)
    expect(res.status).toBe(200)
    expect(invalidateHomeCache).toHaveBeenCalledWith(T)
  })

  it("PUT recusado nao invalida", async () => {
    const res = await PUT(req("PUT", { price: -1, paymentType: "ONE_TIME" }), params)
    expect(res.status).toBe(400)
    expect(invalidateHomeCache).not.toHaveBeenCalled()
  })

  it("trocar visibilidade invalida a home da unidade", async () => {
    const res = await PATCH(req("PATCH", { isVisible: false }), params)
    expect(res.status).toBe(200)
    expect(invalidateHomeCache).toHaveBeenCalledWith(T)
  })
})
