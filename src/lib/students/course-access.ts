import { prisma } from "@/lib/prisma"
import {
  getStudentPlatformCredentials,
  getStudentPlatformLoginUrl,
} from "@/lib/students/platform-credentials"
import { getLmsEnrollmentCredentials } from "@/lib/students/lms-credentials"

/**
 * Um acesso as aulas, do ponto de vista do aluno: o curso, o usuario, a senha e
 * o botao que abre a aula. Nada mais.
 */
export interface CourseAccessCard {
  enrollmentId: string
  courseName: string
  login: string
  /** Senha inicial; `null` quando nao temos o valor (aluno usa a do email). */
  senha: string | null
  /** Destino do botao "Acessar aulas". `null` esconde o botao. */
  accessUrl: string | null
}

/**
 * FRONTEIRA DE DADOS da area do aluno.
 *
 * O sistema atende os cursos por mais de uma origem, e cada origem entrega a
 * credencial de um jeito: uma delas tem UM login por aluno (vale para todos os
 * cursos dela), a outra tem um login POR MATRICULA. Esta funcao achata as duas
 * no mesmo formato — um cartao por curso — para que a tela nao precise saber de
 * onde o curso veio.
 *
 * Isso NAO e cosmetico: a area do aluno renderiza estes objetos dentro de um
 * Client Component, e tudo que entra aqui e serializado no payload RSC embutido
 * no HTML. Campos de roteamento interno (origem, modo de reproducao, fornecedor)
 * morrem NESTA funcao e nunca chegam ao navegador. Nao propague nenhum deles
 * para o tipo acima.
 *
 * Passe SEMPRE o studentId da SESSAO — o isolamento por aluno depende disso.
 */
export async function getCourseAccessCards(
  studentId: string,
): Promise<CourseAccessCard[]> {
  const [platformCredentials, lmsCredentials, platformEnrollments] =
    await Promise.all([
      getStudentPlatformCredentials(studentId),
      getLmsEnrollmentCredentials(studentId),
      // Matriculas atendidas pela origem de login unico: precisamos dos nomes
      // dos cursos para dar um cartao a cada um, em vez de um cartao generico
      // que denunciaria a origem compartilhada.
      prisma.enrollment.findMany({
        where: {
          studentId,
          status: { in: ["ACTIVE", "COMPLETED"] },
          course: { provider: "EA" },
        },
        select: { id: true, course: { select: { nome: true } } },
      }),
    ])

  const cards: CourseAccessCard[] = []

  if (platformCredentials) {
    const accessUrl = getStudentPlatformLoginUrl()
    for (const enrollment of platformEnrollments) {
      cards.push({
        enrollmentId: enrollment.id,
        courseName: enrollment.course.nome,
        login: platformCredentials.login,
        senha: platformCredentials.senha,
        accessUrl,
      })
    }
  }

  for (const credential of lmsCredentials) {
    cards.push({
      enrollmentId: credential.enrollmentId,
      courseName: credential.courseNome,
      login: credential.login,
      senha: credential.senha,
      // Quando ha portal proprio do curso, e ele; senao passamos pela nossa
      // rota, que resolve o acesso do lado do servidor.
      accessUrl:
        credential.portalUrl ?? `/api/aluno/curso/${credential.enrollmentId}/acessar`,
    })
  }

  // Ordem alfabetica: mistura as duas origens e deixa a lista estavel entre
  // recargas. Agrupar por origem seria justamente o sinal que queremos evitar.
  return cards.sort((a, b) =>
    a.courseName.localeCompare(b.courseName, "pt-BR"),
  )
}
