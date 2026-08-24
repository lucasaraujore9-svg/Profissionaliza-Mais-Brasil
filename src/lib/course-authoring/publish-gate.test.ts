import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Publicar curso de autoria: a plataforma de aulas TEM voto, e é bloqueante.
 *
 * O `!course.lmsCourseId` da rota só sabe que a CASCA existe — não que há aula,
 * matriz e categoria. Quem sabe isso é o LMS, que recusa com 409. Enquanto o
 * espelho da publicação foi `afterResponse(...).catch(log)`, essa recusa virava
 * uma linha de log: o curso VAZIO ficava à venda na vitrine e o aluno pagaria
 * por um curso sem conteúdo.
 *
 * Teste de forma (lê o arquivo) porque a rota é um handler Next com guard,
 * Prisma e afterResponse — montar tudo isso custaria mais do que protege. O que
 * precisa não regredir é a ORDEM e o caráter bloqueante.
 */
const SRC = readFileSync(
  join(process.cwd(), "src/app/api/painel/cursos-autorais/[id]/route.ts"),
  "utf-8",
)

describe("publicação espelhada na plataforma de aulas", () => {
  it("o publicar AGUARDA o LMS (não é afterResponse)", () => {
    expect(SRC).toMatch(/await setLmsCoursePublished\(course\.lmsCourseId, true\)/)
  })

  it("o publicar acontece ANTES da escrita na vitrine", () => {
    // Publicar aqui e só depois descobrir que lá recusou deixaria o curso
    // ATIVO na loja com a plataforma de aulas dizendo "não".
    const chamadaLms = SRC.indexOf("await setLmsCoursePublished(course.lmsCourseId, true)")
    const escrita = SRC.indexOf("await prisma.course.update(")
    expect(chamadaLms).toBeGreaterThan(-1)
    expect(escrita).toBeGreaterThan(-1)
    expect(chamadaLms).toBeLessThan(escrita)
  })

  it("409 do LMS vira 409 acionável; qualquer outra falha é fail-closed", () => {
    expect(SRC).toMatch(/status === 409 \? 409 : 502/)
    expect(SRC).toMatch(/CONTENT_NOT_READY/)
    expect(SRC).toMatch(/LMS_UNAVAILABLE/)
  })

  it("a mensagem repassada é a do LMS (que lista o que falta), sem o prefixo HTTP", () => {
    // `err.message` traz "HTTP 409: …", que não diz nada ao produtor.
    expect(SRC).toMatch(/\(err as LmsApiError\)\.apiError/)
  })

  it("despublicar segue best-effort — tirar de venda é a direção segura", () => {
    // A assimetria é deliberada: bloquear o despublicar impediria o produtor de
    // tirar do ar o próprio curso porque a outra ponta caiu.
    expect(SRC).toMatch(/if \(!isPublished && isLmsAuthoringEnabled\(\)/)
    expect(SRC).toMatch(/setLmsCoursePublished\(course\.lmsCourseId as string, false\)/)
  })

  it("publicar tem UMA chamada e as demais só despublicam", () => {
    // A forma antiga era uma chamada só, com `isPublished` — publicava e
    // despublicava pelo MESMO caminho, ambos best-effort. Se ela voltar, o
    // segundo argumento deixa de ser literal e este teste quebra.
    //
    // As chamadas com `false` são legítimas e mais de uma: o despublicar do
    // PATCH e o do DELETE (apagar o curso tira-o do ar lá também).
    const args = [...SRC.matchAll(/setLmsCoursePublished\(([^)]*)\)/g)].map((m) =>
      m[1].replace(/\s+/g, " ").trim(),
    )
    expect(args.filter((a) => a.endsWith(", true"))).toEqual(["course.lmsCourseId, true"])
    expect(args.filter((a) => !a.endsWith(", true") && !a.endsWith(", false"))).toEqual([])
  })
})
