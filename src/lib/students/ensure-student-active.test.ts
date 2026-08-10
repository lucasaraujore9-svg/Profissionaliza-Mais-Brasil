import { describe, it, expect, vi, beforeEach } from "vitest"

// Invariante coberto: "todo aluno com curso vinculado deve estar ATIVO na
// plataforma de aulas". `ensureStudentActiveOnPlatform` corrige logins que ja
// existiam na EA com status defasado (ex.: "interessado") quando um curso e
// vinculado — preservando o isolamento cross-tenant (nao reativa quem esta
// bloqueado por inadimplencia em OUTRA unidade).

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
    student: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    // `pushPlatformState` resolve o bolsista efetivo (acesso sem cobrança) antes
    // de montar o payload de usuarios/editar.
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

import { editarAluno } from "@/lib/plataforma-cursos/client"
import { prisma } from "@/lib/prisma"
import { ensureStudentActiveOnPlatform } from "@/lib/students/plataforma-actions"

const editarAlunoMock = vi.mocked(editarAluno)
const studentFindUnique = vi.mocked(prisma.student.findUnique)
const studentUpdate = vi.mocked(prisma.student.update)
const studentFindFirst = vi.mocked(prisma.student.findFirst)
const enrollmentFindFirst = vi.mocked(prisma.enrollment.findFirst)

// O select de ensureStudentActiveOnPlatform devolve um subconjunto do Student —
// cast para o tipo que o Prisma client espera nas asserts dos mocks.
const studentRow = (row: Record<string, unknown> | null) =>
  row as unknown as Awaited<ReturnType<typeof prisma.student.findUnique>>

beforeEach(() => {
  vi.clearAllMocks()
  // Por padrao ninguem esta bloqueado em outra unidade.
  studentFindFirst.mockResolvedValue(null)
  // Por padrao a pessoa nao tem matricula gratuita (nao e bolsista).
  enrollmentFindFirst.mockResolvedValue(null as never)
})

describe("ensureStudentActiveOnPlatform", () => {
  it("promove para ATIVO na EA um login legado em 'interessado' e sincroniza o banco", async () => {
    studentFindUnique.mockResolvedValue(
      studentRow({
        id: "s1",
        cpf: "12345678900",
        email: "katia@example.com",
        nome: "KATIA",
        polo: "unidade",
        bolsista: false,
        status: "INTERESSADO",
        apostila: "LIBERADA",
      }),
    )

    await ensureStudentActiveOnPlatform("s1", 4358)

    // O payload carrega o retrato COMPLETO — campo omitido em usuarios/editar
    // volta ao default da plataforma (`interessado`), ver platform-state.ts.
    expect(editarAlunoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id_aluno: 4358,
        status: "ativo",
        apostila: "liberar",
        bolsista: "N",
        nome: "KATIA",
        polo: "unidade",
      }),
    )
    expect(studentUpdate).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { status: "ATIVO", apostila: "LIBERADA" },
    })
  })

  it("NAO reativa quando a mesma pessoa esta bloqueada por inadimplencia em outra unidade", async () => {
    studentFindUnique.mockResolvedValue(
      studentRow({
        id: "s1",
        cpf: "12345678900",
        email: "katia@example.com",
        nome: "KATIA",
        polo: "unidade",
        bolsista: false,
        status: "INTERESSADO",
        apostila: "LIBERADA",
      }),
    )
    // Existe OUTRO registro da mesma pessoa BLOQUEADO.
    studentFindFirst.mockResolvedValue(studentRow({ id: "s2" }))

    await ensureStudentActiveOnPlatform("s1", 4358)

    expect(editarAlunoMock).not.toHaveBeenCalled()
    expect(studentUpdate).not.toHaveBeenCalled()
  })

  it("nao reescreve o banco quando o aluno ja esta ATIVO/LIBERADA (mas reafirma na EA, idempotente)", async () => {
    studentFindUnique.mockResolvedValue(
      studentRow({
        id: "s1",
        cpf: "12345678900",
        email: "katia@example.com",
        nome: "KATIA",
        polo: "unidade",
        bolsista: false,
        status: "ATIVO",
        apostila: "LIBERADA",
      }),
    )

    await ensureStudentActiveOnPlatform("s1", 4358)

    // O payload carrega o retrato COMPLETO — campo omitido em usuarios/editar
    // volta ao default da plataforma (`interessado`), ver platform-state.ts.
    expect(editarAlunoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id_aluno: 4358,
        status: "ativo",
        apostila: "liberar",
        bolsista: "N",
        nome: "KATIA",
        polo: "unidade",
      }),
    )
    expect(studentUpdate).not.toHaveBeenCalled()
  })

  it("ignora silenciosamente quando o aluno nao existe", async () => {
    studentFindUnique.mockResolvedValue(studentRow(null))

    await ensureStudentActiveOnPlatform("missing", 4358)

    expect(editarAlunoMock).not.toHaveBeenCalled()
    expect(studentUpdate).not.toHaveBeenCalled()
  })
})
