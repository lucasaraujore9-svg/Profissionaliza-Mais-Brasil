import { describe, it, expect, vi, beforeEach } from "vitest"

// Mesma estratégia do resolve-platform-password.test.ts: o módulo importa
// prisma + client EA + lms no topo, então stubamos tudo que não está sob teste.
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
    student: { findUnique: vi.fn(), update: vi.fn() },
    // `pushPlatformState` resolve o bolsista efetivo antes de montar o payload.
    enrollment: { findFirst: vi.fn() },
  },
}))
// encrypt identidade: deixa o snapshot gravado legível na asserção.
vi.mock("@/lib/crypto", () => ({
  encrypt: (s: string) => `enc(${s})`,
  decrypt: (s: string) => s,
}))
vi.mock("@/lib/lms", () => ({ setLmsStudentAccess: vi.fn(), revokeLmsEnrollment: vi.fn() }))
vi.mock("@/lib/pmb-config", () => ({
  pmbPlataformaPolo: () => "polo",
  pmbPlataformaVendedorId: () => "1",
  PMB_TENANT_SLUG: "__pmb__",
}))
vi.mock("@/lib/tenant/slug", () => ({ tenantPolo: () => "polo" }))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

import { editarAluno, buscarAluno } from "@/lib/plataforma-cursos/client"
import { prisma } from "@/lib/prisma"
import { changeStudentPlatformPassword } from "@/lib/students/plataforma-actions"

const editarAlunoMock = vi.mocked(editarAluno)
const buscarAlunoMock = vi.mocked(buscarAluno)
const findUnique = vi.mocked(prisma.student.findUnique)
const update = vi.mocked(prisma.student.update)
const enrollmentFindFirst = vi.mocked(prisma.enrollment.findFirst)

// EA tipa senha como number, mas na prática vem string/number — cast nos mocks.
const ea = (senha: unknown) =>
  ({ senha }) as unknown as Awaited<ReturnType<typeof buscarAluno>>

function mockStudent(plataformaAlunoId: string) {
  findUnique.mockResolvedValue({
    id: "stu_1",
    plataformaAlunoId,
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
    polo: "logosescolateologicacursosprofis",
    status: "ATIVO",
    apostila: "LIBERADA",
    bolsista: false,
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  editarAlunoMock.mockResolvedValue("Aluno editado com sucesso!")
  update.mockResolvedValue({} as never)
  enrollmentFindFirst.mockResolvedValue(null as never)
})

describe("changeStudentPlatformPassword", () => {
  it("não toca na plataforma quando o aluno ainda não foi cadastrado lá", async () => {
    mockStudent("pending_1720000000")

    const result = await changeStudentPlatformPassword("stu_1", "nova123")

    expect(result).toEqual({
      onPlatform: false,
      applied: false,
      effectivePassword: null,
    })
    expect(editarAlunoMock).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it("confirma a troca relendo a plataforma e só então grava o snapshot", async () => {
    mockStudent("4373")
    buscarAlunoMock.mockResolvedValue(ea("nova123"))

    const result = await changeStudentPlatformPassword("stu_1", "nova123")

    // Regressão do incidente de 2026-08-05: a edição NÃO pode ser parcial. Sem
    // status/apostila no payload a plataforma reescreve o cadastro no default
    // dela (`interessado`) e o aluno perde as aulas — com o nosso banco ainda
    // dizendo ATIVO.
    expect(editarAlunoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id_aluno: 4373,
        senha: "nova123",
        status: "ativo",
        apostila: "liberar",
        bolsista: "N",
      }),
    )
    expect(result).toEqual({
      onPlatform: true,
      applied: true,
      effectivePassword: "nova123",
    })
    expect(update).toHaveBeenCalledWith({
      where: { id: "stu_1" },
      data: { plataformaAlunoSenha: "enc(nova123)" },
    })
  })

  it("não reporta sucesso quando a EA descarta a senha — e ressincroniza o snapshot com a senha real", async () => {
    // Este é o bug de produção: `usuarios/editar` responde "Aluno editado com
    // sucesso!" e ignora `senha`, então a releitura devolve a senha antiga.
    mockStudent("4373")
    buscarAlunoMock.mockResolvedValue(ea("4978048"))

    const result = await changeStudentPlatformPassword("stu_1", "nova123")

    expect(result).toEqual({
      onPlatform: true,
      applied: false,
      effectivePassword: "4978048",
    })
    // Auto-cura: grava a senha que REALMENTE vale, nunca a que foi pedida.
    expect(update).toHaveBeenCalledWith({
      where: { id: "stu_1" },
      data: { plataformaAlunoSenha: "enc(4978048)" },
    })
  })

  it("normaliza senha numérica da EA ao comparar (number vs string)", async () => {
    mockStudent("4373")
    buscarAlunoMock.mockResolvedValue(ea(4978048))

    const result = await changeStudentPlatformPassword("stu_1", "4978048")

    expect(result.applied).toBe(true)
    expect(result.effectivePassword).toBe("4978048")
  })

  it("não grava nada quando não consegue confirmar (EA fora do ar)", async () => {
    mockStudent("4373")
    buscarAlunoMock.mockImplementation(() => {
      throw new Error("EA fora do ar")
    })

    const result = await changeStudentPlatformPassword("stu_1", "nova123")

    expect(result).toEqual({
      onPlatform: true,
      applied: false,
      effectivePassword: null,
    })
    // Snapshot preservado: um palpite gravado aqui quebraria o acesso do aluno.
    expect(update).not.toHaveBeenCalled()
  })
})
