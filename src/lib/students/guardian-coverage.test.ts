import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * INVARIANTES ESTRUTURAIS do responsável financeiro.
 *
 * Modelado em `src/app/api/admin/guard-coverage.test.ts`: o valor não está em
 * cobrir o que existe hoje, e sim em quebrar o build quando alguém escrever a
 * PRÓXIMA rota de criação de aluno sem a regra — que é exatamente como a base
 * legada ficou com a mãe cadastrada no lugar do filho.
 */

const SRC = join(process.cwd(), "src")

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full)
  }
  return out
}

const ALL_FILES = walk(SRC)
const rel = (f: string) => f.slice(SRC.length + 1).replaceAll("\\", "/")

describe("toda porta de criação de aluno aplica a regra do responsável", () => {
  it("rota que cria aluno importa @/lib/students/guardian", () => {
    const faltando: string[] = []
    for (const file of ALL_FILES) {
      if (!rel(file).startsWith("app/api/")) continue
      if (!rel(file).endsWith("/route.ts")) continue
      const src = readFileSync(file, "utf8")
      const criaAluno =
        src.includes("upsertStudent(") || src.includes("prisma.student.create(")
      if (!criaAluno) continue
      if (!src.includes("@/lib/students/guardian")) faltando.push(rel(file))
    }
    expect(faltando).toEqual([])
  })

  it("prisma.student.create só existe nos dois pontos conhecidos", () => {
    // Um `create` novo em outro lugar significa uma porta de entrada que
    // escapou da regra — e do provisionamento, e do dedupe por CPF.
    const permitidos = new Set([
      "lib/students/upsert.ts",
      "app/api/admin/alunos/route.ts",
    ])
    const encontrados = ALL_FILES.filter((f) => {
      if (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) return false
      return readFileSync(f, "utf8").includes("prisma.student.create(")
    }).map(rel)

    expect(encontrados.filter((f) => !permitidos.has(f))).toEqual([])
  })
})

describe("o certificado é do ALUNO, nunca do responsável", () => {
  it("nada em lib/certificates lê campos do responsável", () => {
    // Se um dia alguém "resolver" o problema imprimindo o responsável no
    // certificado, este teste quebra — é o oposto do objetivo do recurso.
    const ofensores = ALL_FILES.filter((f) => {
      const r = rel(f)
      if (!r.startsWith("lib/certificates/")) return false
      if (r.endsWith(".test.ts")) return false
      const src = readFileSync(f, "utf8")
      return (
        src.includes("responsavel") ||
        src.includes("cpfResponsavel") ||
        src.includes("resolvePayer")
      )
    }).map(rel)

    expect(ofensores).toEqual([])
  })

  it("o snapshot do certificado copia nome e CPF do Student", () => {
    const src = readFileSync(join(SRC, "lib/certificates/issue.ts"), "utf8")
    expect(src).toContain("studentName: enrollment.student.nome")
    expect(src).toContain("studentCpf: enrollment.student.cpf")
  })
})

describe("o pagador vem de resolvePayer, não do Student direto", () => {
  it("os contratos de gateway não têm mais campos studentNome/studentCpf", () => {
    // O rename foi o enforcement: `studentNome` dizia ao leitor que o pagador é
    // o aluno, e não havia lugar no fluxo em que isso fosse questionado.
    for (const f of [
      "lib/asaas/transparent-process.ts",
      "lib/mercadopago/transparent-process.ts",
    ]) {
      // Ignora comentários: o de `transparent-process.ts` cita os nomes
      // antigos de propósito, para explicar por que foram renomeados.
      const src = readFileSync(join(SRC, f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "")
      expect(src, f).not.toContain("studentNome")
      expect(src, f).not.toContain("studentCpf")
    }
  })
})
