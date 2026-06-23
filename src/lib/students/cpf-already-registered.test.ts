import { describe, it, expect, vi, beforeEach } from "vitest"

// Gate de CPF do checkout de convidado: só bloqueia quem já tem acesso ao
// painel /aluno (passwordHash != null) naquele tenant. Aluno sem senha
// (checkout abandonado antes do pagamento) NÃO conta — senão recompras de quem
// nunca pagou ficariam presas sem caminho de login.

vi.mock("@/lib/prisma", () => ({
  prisma: {
    student: {
      findFirst: vi.fn(),
    },
  },
}))

import { prisma } from "@/lib/prisma"
import { cpfHasRegisteredLogin } from "@/lib/students/cpf-already-registered"

const studentFindFirst = vi.mocked(prisma.student.findFirst)

const studentRow = (row: Record<string, unknown> | null) =>
  row as unknown as Awaited<ReturnType<typeof prisma.student.findFirst>>

beforeEach(() => {
  vi.clearAllMocks()
})

describe("cpfHasRegisteredLogin", () => {
  it("retorna true quando existe aluno com passwordHash naquele tenant", async () => {
    studentFindFirst.mockResolvedValue(studentRow({ id: "s1" }))

    const result = await cpfHasRegisteredLogin("t1", "123.456.789-09")

    expect(result).toBe(true)
    // Consulta escopada por tenant, CPF stripado e exigindo passwordHash != null.
    expect(studentFindFirst).toHaveBeenCalledWith({
      where: { tenantId: "t1", cpf: "12345678909", passwordHash: { not: null } },
      select: { id: true },
    })
  })

  it("retorna false quando não há aluno com senha (ex.: checkout abandonado sem pagamento)", async () => {
    studentFindFirst.mockResolvedValue(studentRow(null))

    const result = await cpfHasRegisteredLogin("t1", "12345678909")

    expect(result).toBe(false)
  })

  it("retorna false sem consultar o banco quando o CPF é vazio", async () => {
    const result = await cpfHasRegisteredLogin("t1", "")

    expect(result).toBe(false)
    expect(studentFindFirst).not.toHaveBeenCalled()
  })
})
