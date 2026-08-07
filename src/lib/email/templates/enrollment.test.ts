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
    expect(html).toMatch(/plataforma de aulas/i)
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

  it("mostra a área do aluno e a Plataforma de Aulas, sem nomear fornecedora", async () => {
    const html = await render(
      EnrollmentTemplate({ ...baseProps, studentEmail: "maria@email.com" }),
    )
    expect(html).toContain("Sistema Acadêmico")
    expect(html).toContain("Plataforma de Aulas")
    // Login do Sistema Acadêmico (área do aluno) = e-mail do aluno.
    expect(html).toContain("maria@email.com")
    // O aluno não deve saber que os cursos vêm de fornecedoras diferentes.
    expect(html).not.toMatch(/Escola Avan|Plataforma da Escola|\bLMS\b|parceir/i)
  })

  it("com credenciais da escola: exibe usuário e link, mas NUNCA a senha (LGPD-012)", async () => {
    const html = await render(
      EnrollmentTemplate({
        ...baseProps,
        school: {
          login: "98765",
          password: "abc12345",
          loginUrl: "https://exemplo.com/aulas/login",
        },
      }),
    )
    expect(html).toContain("98765")
    // LGPD-012: a senha inicial não trafega mais no e-mail.
    expect(html).not.toContain("abc12345")
    // Orienta o aluno a obter a senha na área do aluno.
    expect(html).toContain("área do aluno")
    expect(html).toContain("Acessar aulas")
    expect(html).toContain("https://exemplo.com/aulas/login")
  })

  it("sem credenciais da escola: orienta acesso pela área do aluno e não vaza senha", async () => {
    const html = await render(EnrollmentTemplate({ ...baseProps, school: null }))
    expect(html).toContain("Acessar aulas")
    // Sem bloco de credenciais não há senha inventada no corpo.
    expect(html).not.toContain("Usuário:")
  })

  it("login com senha conhecida: mostra o usuário e NÃO imprime a senha (LGPD-012)", async () => {
    const html = await render(
      EnrollmentTemplate({
        ...baseProps,
        school: { login: "55501", password: "segredo123", loginUrl: null },
      }),
    )
    expect(html).toContain("55501")
    // A senha nunca aparece no corpo, mesmo quando o provisionamento a conhece.
    expect(html).not.toContain("segredo123")
    expect(html).toContain("área do aluno")
  })
})
