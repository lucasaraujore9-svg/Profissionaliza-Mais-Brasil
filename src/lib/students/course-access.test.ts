import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * O aluno e a unidade não devem saber que os cursos vêm de mais de uma
 * fornecedora. A parte frágil dessa promessa não é o texto da tela — é o DADO:
 * estas listas são serializadas dentro de Client Components e acabam no payload
 * RSC embutido no HTML, legível em "ver código-fonte".
 *
 * Por isso o teste ataca a FRONTEIRA (que campos atravessam) e não a copy.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: { enrollment: { findMany: vi.fn() } },
}))
vi.mock("@/lib/students/platform-credentials", () => ({
  getStudentPlatformCredentials: vi.fn(),
  getStudentPlatformLoginUrl: vi.fn(() => "https://aulas.example.com/login"),
}))
vi.mock("@/lib/students/lms-credentials", () => ({
  getLmsEnrollmentCredentials: vi.fn(),
}))

import { prisma } from "@/lib/prisma"
import { getStudentPlatformCredentials } from "@/lib/students/platform-credentials"
import { getLmsEnrollmentCredentials } from "@/lib/students/lms-credentials"
import { getCourseAccessCards } from "@/lib/students/course-access"

const enrollmentFindMany = vi.mocked(prisma.enrollment.findMany)
const platformCreds = vi.mocked(getStudentPlatformCredentials)
const lmsCreds = vi.mocked(getLmsEnrollmentCredentials)

type EnrollmentRows = Awaited<ReturnType<typeof prisma.enrollment.findMany>>
const rows = (v: unknown[]) => v as unknown as EnrollmentRows

beforeEach(() => {
  vi.clearAllMocks()
  platformCreds.mockResolvedValue(null)
  lmsCreds.mockResolvedValue([])
  enrollmentFindMany.mockResolvedValue(rows([]))
})

describe("getCourseAccessCards", () => {
  it("dá um cartão a CADA curso da fornecedora de login único", async () => {
    // A credencial dela é uma só para o aluno inteiro. Um cartão genérico
    // ("seu acesso") ao lado de cartões por curso denunciaria o agrupamento —
    // então replicamos a mesma credencial em um cartão por curso.
    platformCreds.mockResolvedValue({ login: "12345", senha: "s3nh4" })
    enrollmentFindMany.mockResolvedValue(
      rows([
        { id: "e1", course: { nome: "Excel Avançado" } },
        { id: "e2", course: { nome: "Auxiliar Administrativo" } },
      ]),
    )

    const cards = await getCourseAccessCards("st1")

    expect(cards).toHaveLength(2)
    expect(cards.map((c) => c.courseName)).toEqual([
      "Auxiliar Administrativo",
      "Excel Avançado",
    ])
    expect(cards.every((c) => c.login === "12345" && c.senha === "s3nh4")).toBe(
      true,
    )
    expect(cards.every((c) => c.accessUrl === "https://aulas.example.com/login")).toBe(
      true,
    )
  })

  it("não devolve cartão dessa fornecedora quando não há credencial gravada", async () => {
    platformCreds.mockResolvedValue(null)
    enrollmentFindMany.mockResolvedValue(
      rows([{ id: "e1", course: { nome: "Excel Avançado" } }]),
    )

    expect(await getCourseAccessCards("st1")).toEqual([])
  })

  it("usa o portal do curso quando existe e a nossa rota quando não existe", async () => {
    lmsCreds.mockResolvedValue([
      {
        enrollmentId: "e9",
        courseId: "c9",
        courseNome: "Design Gráfico",
        origin: "escola-avancada",
        playback: "redirect",
        login: "maria",
        senha: "abc",
        portalUrl: "https://portal.example.com/entrar",
      },
      {
        enrollmentId: "e8",
        courseId: "c8",
        courseNome: "Anatomia",
        origin: "own",
        playback: "local",
        login: "maria2",
        senha: null,
        portalUrl: null,
      },
    ])

    const cards = await getCourseAccessCards("st1")

    expect(cards.find((c) => c.courseName === "Design Gráfico")?.accessUrl).toBe(
      "https://portal.example.com/entrar",
    )
    expect(cards.find((c) => c.courseName === "Anatomia")?.accessUrl).toBe(
      "/api/aluno/curso/e8/acessar",
    )
  })

  it("não deixa passar nenhum campo que identifique a origem do curso", async () => {
    // É ESTE o teste que protege o sigilo. `origin: "escola-avancada"` no
    // payload RSC entrega a fornecedora sem nenhum texto na tela.
    platformCreds.mockResolvedValue({ login: "12345", senha: "s3nh4" })
    enrollmentFindMany.mockResolvedValue(
      rows([{ id: "e1", course: { nome: "Excel Avançado" } }]),
    )
    lmsCreds.mockResolvedValue([
      {
        enrollmentId: "e9",
        courseId: "c9",
        courseNome: "Design Gráfico",
        origin: "escola-avancada",
        playback: "redirect",
        login: "maria",
        senha: "abc",
        portalUrl: "https://portal.example.com/entrar",
      },
    ])

    const cards = await getCourseAccessCards("st1")

    expect(cards).toHaveLength(2)
    // Os dois cartões têm exatamente o MESMO conjunto de chaves: um cartão com
    // campo a mais que o outro já é um sinal observável.
    const shapes = cards.map((c) => Object.keys(c).sort().join(","))
    expect(new Set(shapes).size).toBe(1)
    expect(shapes[0]).toBe("accessUrl,courseName,enrollmentId,login,senha")

    const serialized = JSON.stringify(cards)
    expect(serialized).not.toMatch(/escola|avan[çc]ada|\bLMS\b|origin|playback/i)
  })
})

/**
 * Invariantes de código-fonte, no mesmo espírito de `guard-coverage.test.ts`:
 * quebram quando alguém reintroduz a fuga por um caminho novo, que nenhum teste
 * de unidade cobriria.
 */
describe("fronteira do sigilo de fornecedora", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

  it("o painel da unidade não pede o marcador de origem; o sistema mãe pede", () => {
    expect(read("src/app/painel/alunos/[id]/page.tsx")).not.toContain(
      "includeProviderOrigin",
    )
    expect(read("src/app/admin/alunos/[id]/page.tsx")).toContain(
      "includeProviderOrigin: true",
    )
  })

  it("o DTO da tela de gestão não carrega roteamento interno", () => {
    const types = read("src/components/shared/student-management/types.ts")
    const dto = types.slice(
      types.indexOf("interface StudentCourseAccessItem"),
      types.indexOf("interface StudentNotificationItem"),
    )
    expect(dto).not.toMatch(/\borigin\b|\bplayback\b|\bprovider\b/)
  })

  it("nenhuma tela do aluno ou da unidade nomeia a fornecedora", () => {
    // `provider` (enum do Prisma) é permitido: ele é comparado no SERVIDOR para
    // escolher o destino do link e não chega ao navegador.
    const MARCAS = /Escola Avan|playcurso|lms\.bmbr|portal parceiro|plataforma parceira|Aulas EA|Acessar EA/i
    const dirs = [
      "src/app/aluno",
      "src/app/painel",
      "src/components/aluno",
      "src/components/painel",
      "src/components/shared/student-management",
    ]
    const offenders: string[] = []
    for (const dir of dirs) {
      for (const file of walk(join(process.cwd(), dir))) {
        if (MARCAS.test(readFileSync(file, "utf8"))) {
          offenders.push(file.replace(`${process.cwd()}/`, ""))
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}
