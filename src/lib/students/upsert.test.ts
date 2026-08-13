import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    student: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}))

import { prisma } from "@/lib/prisma"
import { StudentEmailConflictError, upsertStudent } from "./upsert"
import type { NormalizedGuardian } from "./guardian"

const p = prisma as unknown as {
  student: {
    findFirst: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
}

const BASE = {
  tenantId: "t1",
  nome: "João Pedro",
  email: "joao@exemplo.com",
  cpf: "52998224725",
  fone: "31988887777",
  polo: "unidade",
  vendedorId: null,
  plataformaAlunoIdFallback: "pending_1",
}

const RESPONSAVEL: NormalizedGuardian = {
  nome: "Maria da Silva",
  cpf: "39053344705",
  rg: null,
  email: "maria@exemplo.com",
  fone: "31999998888",
  parentesco: "Mãe",
}

beforeEach(() => {
  vi.clearAllMocks()
  p.student.update.mockResolvedValue({ id: "s1" })
  p.student.create.mockResolvedValue({ id: "s1" })
})

/** As asserções são nos ARGUMENTOS do Prisma: é lá que o bug moraria. */
function dataDoUpdate() {
  return p.student.update.mock.calls[0]![0].data as Record<string, unknown>
}
function dataDoCreate() {
  return p.student.create.mock.calls[0]![0].data as Record<string, unknown>
}

describe("upsertStudent — escrita tri-estado do responsável", () => {
  it("guardian undefined NÃO menciona as colunas (não apaga dado bom)", async () => {
    // É o caso da recompra e de qualquer chamador que não coleta o bloco. Se as
    // colunas aparecessem como null, um aluno menor perderia o responsável ao
    // simplesmente comprar de novo — e a cobrança seguinte iria para o CPF dele.
    p.student.findFirst.mockResolvedValueOnce({ id: "s1", cpf: BASE.cpf })

    await upsertStudent(BASE)

    const data = dataDoUpdate()
    expect(data).not.toHaveProperty("responsavel")
    expect(data).not.toHaveProperty("cpfResponsavel")
    expect(data).not.toHaveProperty("nascimento")
  })

  it("guardian null limpa as colunas explicitamente", async () => {
    p.student.findFirst.mockResolvedValueOnce({ id: "s1", cpf: BASE.cpf })

    await upsertStudent({ ...BASE, guardian: null, nascimento: null })

    const data = dataDoUpdate()
    expect(data.responsavel).toBeNull()
    expect(data.cpfResponsavel).toBeNull()
    expect(data.responsavelDefinidoEm).toBeNull()
    expect(data.nascimento).toBeNull()
  })

  it("guardian objeto grava o bloco no update por CPF", async () => {
    p.student.findFirst.mockResolvedValueOnce({ id: "s1", cpf: BASE.cpf })

    await upsertStudent({ ...BASE, guardian: RESPONSAVEL })

    const data = dataDoUpdate()
    expect(data.responsavel).toBe("Maria da Silva")
    expect(data.cpfResponsavel).toBe("39053344705")
    expect(data.responsavelDefinidoEm).toBeInstanceOf(Date)
  })

  it("grava o bloco também no caminho de CREATE", async () => {
    p.student.findFirst.mockResolvedValue(null)

    await upsertStudent({
      ...BASE,
      guardian: RESPONSAVEL,
      nascimento: new Date("2012-01-01T00:00:00.000Z"),
    })

    const data = dataDoCreate()
    expect(data.responsavel).toBe("Maria da Silva")
    expect(data.nascimento).toEqual(new Date("2012-01-01T00:00:00.000Z"))
  })

  it("grava o bloco no update por EMAIL", async () => {
    p.student.findFirst
      .mockResolvedValueOnce(null) // por CPF
      .mockResolvedValueOnce({ id: "s1", cpf: null }) // por email

    await upsertStudent({ ...BASE, guardian: RESPONSAVEL })

    expect(dataDoUpdate().responsavel).toBe("Maria da Silva")
  })

  it("NUNCA limpa o customer Asaas do responsável", async () => {
    // É bookkeeping de gateway: limpá-lo com carnê em aberto obrigaria a
    // re-resolver o customer no meio de uma cobrança.
    p.student.findFirst.mockResolvedValueOnce({ id: "s1", cpf: BASE.cpf })

    await upsertStudent({ ...BASE, guardian: null })

    expect(dataDoUpdate()).not.toHaveProperty("responsavelAsaasCustomerId")
  })
})

describe("upsertStudent — não-regressão do dedupe", () => {
  it("email de OUTRO aluno com CPF diferente ainda lança conflito", async () => {
    p.student.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "outro", cpf: "11144477735" })

    await expect(upsertStudent(BASE)).rejects.toBeInstanceOf(
      StudentEmailConflictError,
    )
    expect(p.student.update).not.toHaveBeenCalled()
  })

  it("reaproveita por email quando o CPF do existente é o mesmo", async () => {
    p.student.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "s1", cpf: BASE.cpf })

    await upsertStudent(BASE)
    expect(p.student.update).toHaveBeenCalledTimes(1)
  })
})
