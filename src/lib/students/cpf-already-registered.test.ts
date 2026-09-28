import { describe, it, expect, vi, beforeEach } from "vitest"

// Gate de CPF do checkout de convidado: só bloqueia quem tem login E já
// recebeu acesso a algo naquele tenant. Senha sozinha NÃO conta — os checkouts
// criam a senha antes de cobrar, e uma cobrança recusada prendia a nova
// tentativa em "faça login" (Capacita Pró Brasil, 2026-09-25).

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
  it("retorna true quando existe aluno com senha e acesso já liberado naquele tenant", async () => {
    studentFindFirst.mockResolvedValue(studentRow({ id: "s1" }))

    const result = await cpfHasRegisteredLogin("t1", "123.456.789-09")

    expect(result).toBe(true)
    const where = studentFindFirst.mock.calls[0][0]!.where!
    expect(where).toMatchObject({
      tenantId: "t1",
      cpf: "12345678909",
      passwordHash: { not: null },
    })
  })

  it("exige acesso liberado: senha sozinha (cobrança recusada) não trava o CPF", async () => {
    studentFindFirst.mockResolvedValue(studentRow(null))
    await cpfHasRegisteredLogin("t1", "12345678909")

    const where = studentFindFirst.mock.calls[0][0]!.where!
    // Sem o OR de acesso, o aluno cuja 1ª cobrança falhou cairia em "faça login".
    expect(where.OR).toEqual([
      {
        enrollments: {
          some: {
            OR: [
              { startedAt: { not: null } },
              { status: { in: ["ACTIVE", "SUSPENDED", "COMPLETED"] } },
            ],
          },
        },
      },
      { subscriptions: { some: { startedAt: { not: null } } } },
      { certificates: { some: {} } },
    ])
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
