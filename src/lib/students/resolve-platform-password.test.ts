import { describe, it, expect, vi } from "vitest"

// O módulo plataforma-actions importa prisma + EA client + lms no topo. Como só
// testamos resolveAuthoritativePlatformPassword (que usa apenas buscarAluno e o
// logger), stubamos o resto para o import resolver sem tocar banco/rede.
vi.mock("@/lib/plataforma-cursos/client", () => ({
  criarAluno: vi.fn(),
  editarAluno: vi.fn(),
  buscarAluno: vi.fn(),
  vincularCurso: vi.fn(),
  removerCurso: vi.fn(),
  enviarEmailCredenciais: vi.fn(),
}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/crypto", () => ({ encrypt: (s: string) => s, decrypt: (s: string) => s }))
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

import { buscarAluno } from "@/lib/plataforma-cursos/client"
import { resolveAuthoritativePlatformPassword } from "@/lib/students/plataforma-actions"

const buscarAlunoMock = vi.mocked(buscarAluno)
// EA tipa senha como number, mas na prática vem string/number — cast nos mocks.
const ea = (senha: unknown) =>
  ({ senha }) as unknown as Awaited<ReturnType<typeof buscarAluno>>

describe("resolveAuthoritativePlatformPassword", () => {
  it("usa a senha autoritativa do usuarios/listar (não a do cadastro)", async () => {
    // EA devolveu "mrmc3112" no cadastro, mas a senha real de login é "4978048".
    buscarAlunoMock.mockResolvedValue(ea("4978048"))
    expect(await resolveAuthoritativePlatformPassword(4373, "mrmc3112")).toBe("4978048")
  })

  it("normaliza senha numérica (EA pode tipar como number) para string", async () => {
    buscarAlunoMock.mockResolvedValue(ea(4978048))
    expect(await resolveAuthoritativePlatformPassword(4373, "x")).toBe("4978048")
  })

  it("faz trim da senha retornada", async () => {
    buscarAlunoMock.mockResolvedValue(ea("  4978048  "))
    expect(await resolveAuthoritativePlatformPassword(4373, "x")).toBe("4978048")
  })

  it("cai para a senha do cadastro quando o listar não traz senha", async () => {
    buscarAlunoMock.mockResolvedValue(ea(""))
    expect(await resolveAuthoritativePlatformPassword(4373, "fallback")).toBe("fallback")
  })

  it("cai para a senha do cadastro quando o listar falha (rede/API) — nunca lança", async () => {
    // O helper engole o erro e devolve o fallback. Verificamos via try/catch
    // próprio para não deixar a exceção do mock escapar para o runner do vitest.
    buscarAlunoMock.mockImplementation(() => {
      throw new Error("EA fora do ar")
    })
    let result: string | undefined
    let threw: unknown
    try {
      result = await resolveAuthoritativePlatformPassword(4373, "fallback")
    } catch (err) {
      threw = err
    }
    expect(threw).toBeUndefined()
    expect(result).toBe("fallback")
  })
})
