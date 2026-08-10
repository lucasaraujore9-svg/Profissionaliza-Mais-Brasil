import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import {
  buildEditarAlunoPayload,
  parseEaStatus,
  parseEaBolsista,
  EA_STATUS_BY_LOCAL,
  EA_APOSTILA_BY_LOCAL,
  type PlatformStudentSnapshot,
} from "@/lib/students/platform-state"
import { StudentStatus, ApostilaStatus } from "@prisma/client"

function snapshot(
  over: Partial<PlatformStudentSnapshot> = {},
): PlatformStudentSnapshot {
  return {
    nome: "MARIA LUIZA VIANA SOARES",
    email: "aluna@example.com",
    fone: "84988721399",
    fone2: null,
    cpf: "70062665480",
    rg: null,
    sexo: null,
    nascimento: null,
    rua: "AV ABEL CABRAL 06",
    numero: null,
    bairro: null,
    cidade: null,
    estado: null,
    cep: null,
    polo: "logosescolateologicacursosprofis",
    status: "ATIVO",
    apostila: "LIBERADA",
    bolsista: false,
    ...over,
  }
}

describe("buildEditarAlunoPayload", () => {
  // ESTE é o teste do incidente: a troca de senha mandava `{ id_aluno, senha }`
  // e a plataforma reescrevia o cadastro com o default dela (`interessado`),
  // derrubando o acesso de uma aluna com matrícula ativa.
  it("sempre carrega status, apostila e bolsista — inclusive quando só a senha muda", () => {
    const payload = buildEditarAlunoPayload(4455, snapshot(), {
      senha: "nova123",
    })

    expect(payload.status).toBe("ativo")
    expect(payload.apostila).toBe("liberar")
    expect(payload.bolsista).toBe("N")
    expect(payload.senha).toBe("nova123")
    expect(payload.id_aluno).toBe(4455)
  })

  it("nenhum payload sai sem os três campos de estado", () => {
    for (const status of Object.values(StudentStatus)) {
      for (const apostila of Object.values(ApostilaStatus)) {
        const payload = buildEditarAlunoPayload(1, snapshot({ status, apostila }))
        expect(payload.status).toBe(EA_STATUS_BY_LOCAL[status])
        expect(payload.apostila).toBe(EA_APOSTILA_BY_LOCAL[apostila])
        expect(payload.bolsista).toBeDefined()
      }
    }
  })

  it("overrides vencem o retrato gravado (bloqueio pede BLOQUEADO, não o status atual)", () => {
    const payload = buildEditarAlunoPayload(4455, snapshot({ status: "ATIVO" }), {
      status: "BLOQUEADO",
      apostila: "BLOQUEADA",
    })

    expect(payload.status).toBe("bloqueado")
    expect(payload.apostila).toBe("bloquear")
  })

  it("bolsista vai como S/N explícito, nunca omitido", () => {
    expect(buildEditarAlunoPayload(1, snapshot({ bolsista: true })).bolsista).toBe("S")
    expect(buildEditarAlunoPayload(1, snapshot({ bolsista: false })).bolsista).toBe("N")
    expect(
      buildEditarAlunoPayload(1, snapshot({ bolsista: false }), { bolsista: true })
        .bolsista,
    ).toBe("S")
  })

  it("não inventa perfil: campo vazio do nosso lado sai como undefined", () => {
    // `buildFormData` descarta undefined, então o que a plataforma tem naquele
    // campo é preservado. Mandar string vazia APAGARIA o dado de lá.
    const payload = buildEditarAlunoPayload(1, snapshot({ cidade: null, rg: "  " }))

    expect(payload.cidade).toBeUndefined()
    expect(payload.rg).toBeUndefined()
    expect(payload.nome).toBe("MARIA LUIZA VIANA SOARES")
  })

  it("formata nascimento em YYYY-MM-DD", () => {
    const payload = buildEditarAlunoPayload(
      1,
      snapshot({ nascimento: new Date("1997-05-10T00:00:00.000Z") }),
    )
    expect(payload.nascimento).toBe("1997-05-10")
  })

  it("não envia senha quando não foi pedida", () => {
    expect(buildEditarAlunoPayload(1, snapshot()).senha).toBeUndefined()
  })
})

describe("leitura de usuarios/listar", () => {
  it("reconhece o status em caixa alta que a plataforma devolve", () => {
    expect(parseEaStatus("ATIVO")).toBe("ATIVO")
    expect(parseEaStatus("interessado")).toBe("INTERESSADO")
    expect(parseEaStatus(" Bloqueado ")).toBe("BLOQUEADO")
  })

  it("devolve null para valor desconhecido ou vazio (nunca chuta ATIVO)", () => {
    expect(parseEaStatus("")).toBeNull()
    expect(parseEaStatus(null)).toBeNull()
    expect(parseEaStatus("pendente")).toBeNull()
  })

  it("mapeia bolsista S/N e trata null como desconhecido", () => {
    expect(parseEaBolsista("S")).toBe(true)
    expect(parseEaBolsista("n")).toBe(false)
    expect(parseEaBolsista(null)).toBeNull()
  })

  it("cobre todo o enum local — status novo sem tradução quebra o build", () => {
    for (const status of Object.values(StudentStatus)) {
      expect(EA_STATUS_BY_LOCAL[status]).toBeTruthy()
      expect(parseEaStatus(EA_STATUS_BY_LOCAL[status])).toBe(status)
    }
  })
})

/**
 * Invariante estrutural: `editarAluno` só pode ser chamado de dentro da camada
 * de integração, onde `pushPlatformState` garante o payload completo. Uma
 * chamada direta em outro arquivo reabre exatamente o bug de 2026-08-05.
 */
describe("cobertura de usuarios/editar", () => {
  const SRC = join(process.cwd(), "src")
  const PERMITIDOS = new Set([
    "lib/plataforma-cursos/client.ts", // define o wrapper
    "lib/students/plataforma-actions.ts", // único chamador legítimo
  ])

  function sourceFiles(dir: string, prefix = ""): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      const rel = prefix ? `${prefix}/${entry}` : entry
      if (statSync(full).isDirectory()) {
        out.push(...sourceFiles(full, rel))
      } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
        out.push(rel)
      }
    }
    return out
  }

  it("nenhum arquivo fora da camada de integração chama editarAluno", () => {
    const infratores = sourceFiles(SRC).filter((rel) => {
      if (PERMITIDOS.has(rel)) return false
      const src = readFileSync(join(SRC, rel), "utf8")
      // Ignora menção em comentário: só conta chamada de verdade.
      return /(?<!\/\/.*)\beditarAluno\s*\(/.test(
        src
          .split("\n")
          .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
          .join("\n"),
      )
    })

    expect(infratores).toEqual([])
  })

  it("plataforma-actions chama editarAluno num único ponto", () => {
    const src = readFileSync(
      join(SRC, "lib/students/plataforma-actions.ts"),
      "utf8",
    )
    const chamadas = src.match(/\bawait editarAluno\(/g) ?? []
    expect(chamadas).toHaveLength(1)
  })
})
