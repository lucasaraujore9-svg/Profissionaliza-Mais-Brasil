import { describe, it, expect } from "vitest"
import { render } from "@react-email/components"
import { EnrollmentTemplate } from "./enrollment"

const baseProps = {
  studentName: "Maria Silva",
  courseName: "Auxiliar Administrativo",
  studentPanelUrl: "https://loja.example.com/aluno",
}

describe("EnrollmentTemplate", () => {
  it("aluno novo: confirma matrícula e explica a plataforma de aulas", async () => {
    const html = await render(EnrollmentTemplate({ ...baseProps, isNewStudent: true }))
    expect(html).toContain("Tudo certo")
    expect(html).toContain("plataforma de aulas")
    expect(html).not.toContain("Novo curso liberado")
  })

  it("aluno antigo comprando curso novo: avisa o novo curso", async () => {
    const html = await render(EnrollmentTemplate({ ...baseProps, isNewStudent: false }))
    expect(html).toContain("Novo curso liberado")
    expect(html).toContain("Auxiliar Administrativo")
    expect(html).not.toContain("Tudo certo")
  })

  it("default (sem isNewStudent) trata como aluno novo", async () => {
    const html = await render(EnrollmentTemplate({ ...baseProps }))
    expect(html).toContain("Tudo certo")
  })
})
