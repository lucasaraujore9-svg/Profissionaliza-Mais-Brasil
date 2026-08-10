import { describe, it, expect, vi, beforeEach } from "vitest"

// Mesma estratégia dos outros testes deste módulo: `plataforma-actions` importa
// prisma + client da fornecedora + lms no topo, então stubamos tudo.
vi.mock("@/lib/plataforma-cursos/client", () => ({
  criarAluno: vi.fn(),
  editarAluno: vi.fn(),
  buscarAluno: vi.fn(),
  vincularCurso: vi.fn(),
  removerCurso: vi.fn(),
  enviarEmailCredenciais: vi.fn(),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    student: { findUnique: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    enrollment: { findFirst: vi.fn() },
  },
}))
vi.mock("@/lib/crypto", () => ({ encrypt: (s: string) => s, decrypt: (s: string) => s }))
vi.mock("@/lib/lms", () => ({ setLmsStudentAccess: vi.fn(), revokeLmsEnrollment: vi.fn() }))
vi.mock("@/lib/pmb-config", () => ({
  pmbPlataformaPolo: () => "polo",
  pmbPlataformaVendedorId: () => "1",
  PMB_TENANT_SLUG: "__pmb__",
}))
vi.mock("@/lib/tenant/slug", () => ({ tenantPolo: () => "polo" }))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}))

import { editarAluno, buscarAluno } from "@/lib/plataforma-cursos/client"
import { prisma } from "@/lib/prisma"
import { auditStudentPlatformState } from "@/lib/students/plataforma-actions"

const editarAlunoMock = vi.mocked(editarAluno)
const buscarAlunoMock = vi.mocked(buscarAluno)
const studentFindUnique = vi.mocked(prisma.student.findUnique)
const studentFindFirst = vi.mocked(prisma.student.findFirst)
const enrollmentFindFirst = vi.mocked(prisma.enrollment.findFirst)

const row = (over: Record<string, unknown> = {}) =>
  ({
    id: "stu_1",
    plataformaAlunoId: "4455",
    nome: "MARIA LUIZA VIANA SOARES",
    email: "aluna@example.com",
    fone: null,
    fone2: null,
    cpf: "70062665480",
    rg: null,
    sexo: null,
    nascimento: null,
    rua: null,
    numero: null,
    bairro: null,
    cidade: null,
    estado: null,
    cep: null,
    polo: "unidade",
    status: "ATIVO",
    apostila: "LIBERADA",
    bolsista: false,
    ...over,
  }) as never

/** Resposta de `usuarios/listar`. */
const ea = (over: Record<string, unknown> = {}) =>
  ({ status: "ATIVO", bolsista: null, ...over }) as never

beforeEach(() => {
  vi.clearAllMocks()
  studentFindUnique.mockResolvedValue(row())
  studentFindFirst.mockResolvedValue(null)
  enrollmentFindFirst.mockResolvedValue(null as never)
  editarAlunoMock.mockResolvedValue("Aluno editado com sucesso!")
})

describe("auditStudentPlatformState", () => {
  it("acusa e corrige o aluno rebaixado a 'interessado' (o incidente de 05/08/2026)", async () => {
    buscarAlunoMock.mockResolvedValue(ea({ status: "INTERESSADO" }))

    const dry = await auditStudentPlatformState("stu_1", { apply: false })
    expect(dry.outcome).toBe("diverged")
    expect(dry.eaStatus).toBe("INTERESSADO")
    expect(dry.expectedStatus).toBe("ATIVO")
    expect(editarAlunoMock).not.toHaveBeenCalled()

    const applied = await auditStudentPlatformState("stu_1", { apply: true })
    expect(applied.outcome).toBe("fixed")
    expect(editarAlunoMock).toHaveBeenCalledWith(
      expect.objectContaining({ id_aluno: 4455, status: "ativo", apostila: "liberar" }),
    )
  })

  // A trava que faltou na primeira versão: `usuarios/listar` devolve
  // `bolsista: null` até em aluno criado com "S" (verificado em produção contra
  // 6 alunos de bolsa). Comparar o campo marcava TODO bolsista como divergente,
  // e a varredura reescreveria a base inteira a cada execução, para sempre.
  it("NÃO acusa divergência por bolsista — a leitura não devolve o campo", async () => {
    // Aluno que DEVE ser bolsista (tem matrícula gratuita), mas a plataforma
    // responde null. Status confere.
    enrollmentFindFirst.mockResolvedValue({ id: "enr_1" } as never)
    buscarAlunoMock.mockResolvedValue(ea({ status: "ATIVO", bolsista: null }))

    const result = await auditStudentPlatformState("stu_1", { apply: true })

    expect(result.expectedBolsista).toBe(true)
    expect(result.eaBolsista).toBeNull()
    expect(result.outcome).toBe("ok")
    expect(editarAlunoMock).not.toHaveBeenCalled()
  })

  it("force reescreve o retrato mesmo sem divergência de status", async () => {
    enrollmentFindFirst.mockResolvedValue({ id: "enr_1" } as never)
    buscarAlunoMock.mockResolvedValue(ea())

    const result = await auditStudentPlatformState("stu_1", {
      apply: true,
      force: true,
    })

    expect(result.outcome).toBe("reasserted")
    expect(editarAlunoMock).toHaveBeenCalledWith(
      expect.objectContaining({ id_aluno: 4455, bolsista: "S" }),
    )
  })

  it("force em simulação não inventa achado nem escreve", async () => {
    buscarAlunoMock.mockResolvedValue(ea())

    const result = await auditStudentPlatformState("stu_1", {
      apply: false,
      force: true,
    })

    expect(result.outcome).toBe("ok")
    expect(editarAlunoMock).not.toHaveBeenCalled()
  })

  it("não reativa quem está bloqueado por inadimplência em outra unidade", async () => {
    buscarAlunoMock.mockResolvedValue(ea({ status: "INTERESSADO" }))
    studentFindFirst.mockResolvedValue({ id: "stu_2" } as never)

    const result = await auditStudentPlatformState("stu_1", { apply: true })

    expect(result.outcome).toBe("skipped_blocked_elsewhere")
    expect(editarAlunoMock).not.toHaveBeenCalled()
  })

  it("ignora aluno que ainda não foi para a plataforma", async () => {
    studentFindUnique.mockResolvedValue(row({ plataformaAlunoId: "pending_123" }))

    const result = await auditStudentPlatformState("stu_1", { apply: true })

    expect(result.outcome).toBe("skipped_not_on_platform")
    expect(buscarAlunoMock).not.toHaveBeenCalled()
  })

  it("status desconhecido na plataforma conta como divergência (nunca chuta ok)", async () => {
    buscarAlunoMock.mockResolvedValue(ea({ status: "QUALQUER_COISA" }))

    const result = await auditStudentPlatformState("stu_1", { apply: false })

    expect(result.outcome).toBe("diverged")
  })

  it("falha de leitura não vira 'ok' silencioso", async () => {
    buscarAlunoMock.mockRejectedValue(new Error("plataforma fora do ar"))

    const result = await auditStudentPlatformState("stu_1", { apply: true })

    expect(result.outcome).toBe("failed")
    expect(editarAlunoMock).not.toHaveBeenCalled()
  })
})
