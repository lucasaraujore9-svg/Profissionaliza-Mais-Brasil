import { prisma } from "@/lib/prisma"
import {
  criarAluno,
  editarAluno,
  vincularCurso,
  removerCurso,
} from "@/lib/plataforma-cursos/client"
import { pmbPlataformaPolo, pmbPlataformaVendedorId, PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { encrypt } from "@/lib/crypto"

/**
 * Camada UNICA de integracao com a plataforma de aulas (plataforma).
 *
 * Regras do projeto:
 * - Qualquer venda (vitrine PMB ou revendedor) cadastra o aluno na plataforma do mesmo
 *   jeito — nao ha distincao na plataforma. O `polo` e o `vendedor` mudam por
 *   contexto, mas o restante das chamadas e identico.
 * - Suspensao, liberacao, vinculo e desvinculo de curso passam SEMPRE por aqui
 *   (nao chamar editarAluno/vincularCurso/removerCurso direto em outros pontos).
 * - Toda gestao financeira (Enrollment, Payment, Coupon, mensalidade do tenant)
 *   fica no nosso banco. A plataforma so conhece: aluno + cursos vinculados + status
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
  // Vendedor é sempre o PMB (único vendedor na plataforma para toda a plataforma).
  // O polo identifica a unidade do aluno (slug da revenda ou polo PMB).
  return {
    polo: isPmb ? pmbPlataformaPolo() : (student.tenant.poloName ?? student.tenant.slug),
    vendedor: pmbPlataformaVendedorId(),
  }
}

function parseExternalId(value: string | null | undefined): number | null {
  if (!value) return null
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

/**
 * Garante que o aluno existe na plataforma. Se ja tem plataforma_aluno_id valido, retorna
 * imediatamente. Caso contrario chama criarAluno e persiste plataforma_aluno_id +
 * ea_aluno_senha + status ATIVO + apostila LIBERADA + polo + vendedor.
 *
 * Retorna o numero do aluno na plataforma.
 */
export async function ensureStudentOnPlatform(
  studentId: string,
): Promise<{ plataformaAlunoId: number; created: boolean; plataformaSenha: string | null }> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { tenant: { select: { slug: true, plataformaVendedorId: true } } },
  })
  if (!student) throw new Error(`student ${studentId} nao encontrado`)

  // O upsertStudent usa `pending_<timestamp>` como fallback enquanto o aluno
  // ainda não foi para a plataforma — `parseExternalId` retorna null nesse
  // caso (NaN não passa o isFinite), então a guarda abaixo já cobre. Mantemos
  // o startsWith como defesa extra contra valores legados/inconsistentes.
  const existingId = parseExternalId(student.plataformaAlunoId)
  const isPendingPlaceholder =
    student.plataformaAlunoId?.startsWith("pending") ?? false
  if (existingId !== null && !isPendingPlaceholder) {
    // Aluno já existe na plataforma: a senha guardada está criptografada e não
    // temos o texto puro aqui. O chamador não precisa dele neste caminho
    // (recompra não reenvia credenciais), então retornamos null.
    return {
      plataformaAlunoId: existingId,
      created: false,
      plataformaSenha: null,
    }
  }

  const isPmb = student.tenant.slug === PMB_TENANT_SLUG
  const polo = isPmb ? pmbPlataformaPolo() : student.tenant.slug
  const vendedor = isPmb ? pmbPlataformaVendedorId() : student.tenant.plataformaVendedorId

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
    // Bolsista (bolsa de estudo): a plataforma espera "S"/"N". So enviamos
    // quando o aluno foi marcado como bolsista numa venda direta — o EA libera
    // o acesso sem vincular cobranca financeira na plataforma.
    bolsista: student.bolsista ? "S" : undefined,
  })

  const platformLogin = String(result.login)
  const plataformaSenha = String(result.senha)

  await prisma.student.update({
    where: { id: student.id },
    data: {
      plataformaAlunoId: platformLogin,
      // Criptografada (AES-256-GCM) — exibida na área do aluno após o pagamento.
      // Não é mais zerada após o email: o aluno precisa dela no painel /aluno.
      plataformaAlunoSenha: encrypt(plataformaSenha),
      status: "ATIVO",
      apostila: "LIBERADA",
      polo,
      vendedorId: vendedor ?? null,
    },
  })

  return { plataformaAlunoId: Number.parseInt(platformLogin, 10), created: true, plataformaSenha }
}

/**
 * Vincula um curso ao aluno na plataforma. Cria o aluno na plataforma se ainda nao existir.
 * Idempotente: a plataforma e tolerante a multiplos vincularCurso para o mesmo par.
 */
export async function linkCourseToStudent(
  studentId: string,
  courseId: string,
): Promise<{ plataformaAlunoId: number; plataformaCourseId: number }> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, plataformaCourseId: true, nome: true },
  })
  if (!course) throw new Error(`curso ${courseId} nao encontrado`)
  if (!course.plataformaCourseId) {
    throw new Error(
      `curso ${course.nome} sem plataforma_course_id — rode o sync do catalogo primeiro`,
    )
  }

  const courseIdNum = parseExternalId(course.plataformaCourseId)
  if (courseIdNum === null) {
    throw new Error(`plataforma_course_id ${course.plataformaCourseId} invalido`)
  }

  const { plataformaAlunoId } = await ensureStudentOnPlatform(studentId)

  await vincularCurso({ aluno: plataformaAlunoId, idcurso: courseIdNum })

  return { plataformaAlunoId, plataformaCourseId: courseIdNum }
}

/**
 * Desvincula um curso do aluno na plataforma.
 */
export async function unlinkCourseFromStudent(
  studentId: string,
  courseId: string,
): Promise<void> {
  const [student, course] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
      select: { plataformaAlunoId: true },
    }),
    prisma.course.findUnique({
      where: { id: courseId },
      select: { plataformaCourseId: true },
    }),
  ])
  if (!student) throw new Error(`student ${studentId} nao encontrado`)
  if (!course) throw new Error(`course ${courseId} nao encontrado`)

  const plataformaAlunoId = parseExternalId(student.plataformaAlunoId)
  const courseIdNum = parseExternalId(course.plataformaCourseId)
  if (plataformaAlunoId === null) throw new Error("aluno sem plataforma_aluno_id")
  if (courseIdNum === null) throw new Error("curso sem plataforma_course_id")

  await removerCurso({ aluno: plataformaAlunoId, idcurso: courseIdNum })
}

/**
 * Bloqueia o acesso do aluno na plataforma: status=bloqueado + apostila=bloquear.
 * Atualiza tambem o registro local (status BLOQUEADO + apostila BLOQUEADA).
 * Marcacoes de Enrollment SUSPENDED ficam por conta do chamador (ou do
 * blockTenantStudents).
 */
export async function blockStudentInEA(studentId: string): Promise<void> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, plataformaAlunoId: true },
  })
  if (!student) throw new Error(`student ${studentId} nao encontrado`)

  const platformId = parseExternalId(student.plataformaAlunoId)
  if (platformId === null) {
    throw new Error("aluno sem plataforma_aluno_id (ainda nao foi para a plataforma)")
  }

  await editarAluno({
    id_aluno: platformId,
    status: "bloqueado",
    apostila: "bloquear",
  })

  await prisma.student.update({
    where: { id: student.id },
    data: { status: "BLOQUEADO", apostila: "BLOQUEADA" },
  })
}

/**
 * Sincroniza dados de perfil do aluno na plataforma (sem mexer em status/apostila).
 * Idempotente: se o aluno ainda nao foi para a plataforma, ignora (so faz sentido
 * apos pagamento/criacao). Usa editarAluno passando apenas os campos que o
 * usuario pode editar no /aluno/perfil.
 */
export async function syncStudentProfileToEA(studentId: string): Promise<void> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      plataformaAlunoId: true,
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
  const platformId = parseExternalId(student.plataformaAlunoId)
  if (platformId === null) {
    // Aluno ainda nao esta na plataforma — sera enviado quando o pagamento confirmar.
    return
  }

  await editarAluno({
    id_aluno: platformId,
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
 * Libera o acesso do aluno na plataforma: status=ativo + apostila=liberar.
 */
export async function unblockStudentInEA(studentId: string): Promise<void> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, plataformaAlunoId: true },
  })
  if (!student) throw new Error(`student ${studentId} nao encontrado`)

  const platformId = parseExternalId(student.plataformaAlunoId)
  if (platformId === null) {
    throw new Error("aluno sem plataforma_aluno_id (ainda nao foi para a plataforma)")
  }

  await editarAluno({
    id_aluno: platformId,
    status: "ativo",
    apostila: "liberar",
  })

  await prisma.student.update({
    where: { id: student.id },
    data: { status: "ATIVO", apostila: "LIBERADA" },
  })
}

export { resolvePoloContextForStudent }
