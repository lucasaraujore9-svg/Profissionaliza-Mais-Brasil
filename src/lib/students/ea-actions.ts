import { prisma } from "@/lib/prisma"
import {
  criarAluno,
  editarAluno,
  vincularCurso,
  removerCurso,
} from "@/lib/escola-avancada/client"
import { pmbEaPolo, pmbEaVendedorId, PMB_TENANT_SLUG } from "@/lib/pmb-config"

/**
 * Camada UNICA de integracao com a plataforma de aulas (EA).
 *
 * Regras do projeto:
 * - Qualquer venda (vitrine PMB ou revendedor) cadastra o aluno na EA do mesmo
 *   jeito — nao ha distincao na plataforma. O `polo` e o `vendedor` mudam por
 *   contexto, mas o restante das chamadas e identico.
 * - Suspensao, liberacao, vinculo e desvinculo de curso passam SEMPRE por aqui
 *   (nao chamar editarAluno/vincularCurso/removerCurso direto em outros pontos).
 * - Toda gestao financeira (Enrollment, Payment, Coupon, mensalidade do tenant)
 *   fica no nosso banco. A EA so conhece: aluno + cursos vinculados + status
 *   de acesso.
 */

interface PoloContext {
  polo: string
  vendedor: string | null
}

async function resolvePoloContextForStudent(
  studentId: string,
): Promise<PoloContext | null> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      tenant: { select: { slug: true, poloName: true } },
    },
  })
  if (!student) return null

  const isPmb = student.tenant.slug === PMB_TENANT_SLUG
  // Vendedor é sempre o PMB (único vendedor na EA para toda a plataforma).
  // O polo identifica a unidade do aluno (slug da revenda ou polo PMB).
  return {
    polo: isPmb ? pmbEaPolo() : (student.tenant.poloName ?? student.tenant.slug),
    vendedor: pmbEaVendedorId(),
  }
}

function parseEaId(value: string | null | undefined): number | null {
  if (!value) return null
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

/**
 * Garante que o aluno existe na EA. Se ja tem ea_aluno_id valido, retorna
 * imediatamente. Caso contrario chama criarAluno e persiste ea_aluno_id +
 * ea_aluno_senha + status ATIVO + apostila LIBERADA + polo + vendedor.
 *
 * Retorna o numero do aluno na EA.
 */
export async function ensureStudentInEA(
  studentId: string,
): Promise<{ eaAlunoId: number; created: boolean; eaSenha: string | null }> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { tenant: { select: { slug: true, eaVendedorId: true } } },
  })
  if (!student) throw new Error(`student ${studentId} nao encontrado`)

  const existingId = parseEaId(student.eaAlunoId)
  if (existingId !== null && student.eaAlunoId !== "pending") {
    return {
      eaAlunoId: existingId,
      created: false,
      eaSenha: student.eaAlunoSenha,
    }
  }

  const isPmb = student.tenant.slug === PMB_TENANT_SLUG
  const polo = isPmb ? pmbEaPolo() : student.tenant.slug
  const vendedor = isPmb ? pmbEaVendedorId() : student.tenant.eaVendedorId

  const result = await criarAluno({
    nome: student.nome,
    email: student.email ?? undefined,
    fone: student.fone ?? undefined,
    cpf: student.cpf ?? undefined,
    rg: student.rg ?? undefined,
    rua: student.rua ?? undefined,
    bairro: student.bairro ?? undefined,
    cidade: student.cidade ?? undefined,
    estado: student.estado ?? undefined,
    numero: student.numero ?? undefined,
    cep: student.cep ?? undefined,
    nascimento: student.nascimento
      ? student.nascimento.toISOString().slice(0, 10)
      : undefined,
    sexo: student.sexo ?? undefined,
    polo,
    status: "ativo",
    apostila: "liberar",
    vendedor: vendedor ? Number.parseInt(vendedor, 10) || undefined : undefined,
  })

  const eaLogin = String(result.login)
  const eaSenha = String(result.senha)

  await prisma.student.update({
    where: { id: student.id },
    data: {
      eaAlunoId: eaLogin,
      eaAlunoSenha: eaSenha,
      status: "ATIVO",
      apostila: "LIBERADA",
      polo,
      vendedorId: vendedor ?? null,
    },
  })

  return { eaAlunoId: Number.parseInt(eaLogin, 10), created: true, eaSenha }
}

/**
 * Vincula um curso ao aluno na EA. Cria o aluno na EA se ainda nao existir.
 * Idempotente: a EA e tolerante a multiplos vincularCurso para o mesmo par.
 */
export async function linkCourseToStudent(
  studentId: string,
  courseId: string,
): Promise<{ eaAlunoId: number; eaCourseId: number }> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, eaCourseId: true, nome: true },
  })
  if (!course) throw new Error(`curso ${courseId} nao encontrado`)
  if (!course.eaCourseId) {
    throw new Error(
      `curso ${course.nome} sem ea_course_id — rode o sync do catalogo primeiro`,
    )
  }

  const eaCourseIdNum = parseEaId(course.eaCourseId)
  if (eaCourseIdNum === null) {
    throw new Error(`ea_course_id ${course.eaCourseId} invalido`)
  }

  const { eaAlunoId } = await ensureStudentInEA(studentId)

  await vincularCurso({ aluno: eaAlunoId, idcurso: eaCourseIdNum })

  return { eaAlunoId, eaCourseId: eaCourseIdNum }
}

/**
 * Desvincula um curso do aluno na EA.
 */
export async function unlinkCourseFromStudent(
  studentId: string,
  courseId: string,
): Promise<void> {
  const [student, course] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
      select: { eaAlunoId: true },
    }),
    prisma.course.findUnique({
      where: { id: courseId },
      select: { eaCourseId: true },
    }),
  ])
  if (!student) throw new Error(`student ${studentId} nao encontrado`)
  if (!course) throw new Error(`course ${courseId} nao encontrado`)

  const eaAlunoId = parseEaId(student.eaAlunoId)
  const eaCourseIdNum = parseEaId(course.eaCourseId)
  if (eaAlunoId === null) throw new Error("aluno sem ea_aluno_id")
  if (eaCourseIdNum === null) throw new Error("curso sem ea_course_id")

  await removerCurso({ aluno: eaAlunoId, idcurso: eaCourseIdNum })
}

/**
 * Bloqueia o acesso do aluno na EA: status=bloqueado + apostila=bloquear.
 * Atualiza tambem o registro local (status BLOQUEADO + apostila BLOQUEADA).
 * Marcacoes de Enrollment SUSPENDED ficam por conta do chamador (ou do
 * blockTenantStudents).
 */
export async function blockStudentInEA(studentId: string): Promise<void> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, eaAlunoId: true },
  })
  if (!student) throw new Error(`student ${studentId} nao encontrado`)

  const eaId = parseEaId(student.eaAlunoId)
  if (eaId === null) {
    throw new Error("aluno sem ea_aluno_id (ainda nao foi para a EA)")
  }

  await editarAluno({
    id_aluno: eaId,
    status: "bloqueado",
    apostila: "bloquear",
  })

  await prisma.student.update({
    where: { id: student.id },
    data: { status: "BLOQUEADO", apostila: "BLOQUEADA" },
  })
}

/**
 * Sincroniza dados de perfil do aluno na EA (sem mexer em status/apostila).
 * Idempotente: se o aluno ainda nao foi para a EA, ignora (so faz sentido
 * apos pagamento/criacao). Usa editarAluno passando apenas os campos que o
 * usuario pode editar no /aluno/perfil.
 */
export async function syncStudentProfileToEA(studentId: string): Promise<void> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      eaAlunoId: true,
      nome: true,
      email: true,
      fone: true,
      cpf: true,
      cidade: true,
      estado: true,
      cep: true,
      rua: true,
      numero: true,
      bairro: true,
    },
  })
  if (!student) throw new Error(`student ${studentId} nao encontrado`)
  const eaId = parseEaId(student.eaAlunoId)
  if (eaId === null) {
    // Aluno ainda nao esta na EA — sera enviado quando o pagamento confirmar.
    return
  }

  await editarAluno({
    id_aluno: eaId,
    nome: student.nome,
    email: student.email ?? undefined,
    fone: student.fone ?? undefined,
    cpf: student.cpf ?? undefined,
    cidade: student.cidade ?? undefined,
    estado: student.estado ?? undefined,
    cep: student.cep ?? undefined,
    rua: student.rua ?? undefined,
    numero: student.numero ?? undefined,
    bairro: student.bairro ?? undefined,
  })
}

/**
 * Libera o acesso do aluno na EA: status=ativo + apostila=liberar.
 */
export async function unblockStudentInEA(studentId: string): Promise<void> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, eaAlunoId: true },
  })
  if (!student) throw new Error(`student ${studentId} nao encontrado`)

  const eaId = parseEaId(student.eaAlunoId)
  if (eaId === null) {
    throw new Error("aluno sem ea_aluno_id (ainda nao foi para a EA)")
  }

  await editarAluno({
    id_aluno: eaId,
    status: "ativo",
    apostila: "liberar",
  })

  await prisma.student.update({
    where: { id: student.id },
    data: { status: "ATIVO", apostila: "LIBERADA" },
  })
}

export { resolvePoloContextForStudent }
