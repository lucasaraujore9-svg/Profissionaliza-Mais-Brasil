import { prisma } from "@/lib/prisma"
import {
  criarAluno,
  editarAluno,
  buscarAluno,
  vincularCurso,
  removerCurso,
  enviarEmailCredenciais,
} from "@/lib/plataforma-cursos/client"
import { pmbPlataformaPolo, pmbPlataformaVendedorId, PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { tenantPolo } from "@/lib/tenant/slug"
import { encrypt } from "@/lib/crypto"
import { contextLogger } from "@/lib/logger"

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
  // O polo identifica a unidade do aluno (poloName fixo da revenda ou polo PMB).
  return {
    polo: isPmb ? pmbPlataformaPolo() : tenantPolo(student.tenant),
    vendedor: pmbPlataformaVendedorId(),
  }
}

function parseExternalId(value: string | null | undefined): number | null {
  if (!value) return null
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

function onlyDigits(value: string | null | undefined): string {
  return value?.replace(/\D/g, "") ?? ""
}

function normEmail(value: string | null | undefined): string | null {
  const v = value?.trim().toLowerCase()
  return v && v.length > 0 ? v : null
}

interface ExistingPlatformLogin {
  plataformaAlunoId: number
  // Senha ja criptografada (AES-256-GCM), pronta para persistir. Null quando
  // a origem nao expoe a senha (ex.: reuso de outro registro nosso sem senha).
  encryptedSenha: string | null
}

/**
 * Procura um usuario que a pessoa JA possua na plataforma de aulas (EA).
 *
 * Regra de negocio: cada pessoa (mesmo CPF/email) deve ter UM unico usuario na
 * EA, reutilizado entre revendas. Sem isso, comprar numa segunda revenda
 * tentaria recriar o aluno na EA (CPF/email duplicado) e a matricula falhava.
 *
 * Ordem de busca:
 *   1. Outro Student nosso (qualquer tenant) com o mesmo CPF/email que ja foi
 *      para a plataforma — deterministico, sem chamada externa. Reaproveita
 *      ate a senha criptografada.
 *   2. Consulta direta na EA (`usuarios/listar`) por CPF e depois por email —
 *      cobre alunos que existem na plataforma mas ainda nao no nosso banco
 *      (cadastros legados/manuais). Best-effort: erros sao tratados como
 *      "nao encontrado" e o fluxo segue para criar um novo aluno.
 *
 * Retorna null quando e a primeira vez da pessoa na plataforma.
 */
async function findExistingPlatformLogin(student: {
  id: string
  cpf: string | null
  email: string | null
}): Promise<ExistingPlatformLogin | null> {
  const cpfDigits = onlyDigits(student.cpf)
  const email = normEmail(student.email)
  if (!cpfDigits && !email) return null

  // 1. Reuso a partir de outro registro nosso.
  const orFilters: { cpf?: string; email?: string }[] = []
  if (student.cpf) orFilters.push({ cpf: student.cpf })
  if (student.email) orFilters.push({ email: student.email })

  if (orFilters.length > 0) {
    const candidates = await prisma.student.findMany({
      where: { id: { not: student.id }, OR: orFilters },
      select: {
        plataformaAlunoId: true,
        plataformaAlunoSenha: true,
        cpf: true,
        email: true,
      },
    })

    const valid = candidates.flatMap((c) => {
      const id = parseExternalId(c.plataformaAlunoId)
      if (id === null || c.plataformaAlunoId.startsWith("pending")) return []
      return [{ id, senha: c.plataformaAlunoSenha, cpf: c.cpf, email: c.email }]
    })

    // Prioridade 1: mesmo CPF (identidade forte).
    let match = cpfDigits
      ? valid.find((c) => onlyDigits(c.cpf) === cpfDigits)
      : undefined
    // Prioridade 2: mesmo email, desde que o CPF nao conflite (email de
    // familia compartilhado entre alunos distintos nao deve casar).
    if (!match && email) {
      match = valid.find((c) => {
        if (normEmail(c.email) !== email) return false
        const cCpf = onlyDigits(c.cpf)
        return !cCpf || !cpfDigits || cCpf === cpfDigits
      })
    }

    if (match) {
      return { plataformaAlunoId: match.id, encryptedSenha: match.senha }
    }
  }

  // 2. Consulta direta na plataforma (best-effort).
  for (const filter of [
    cpfDigits ? { cpf: cpfDigits } : null,
    email ? { email } : null,
  ]) {
    if (!filter) continue
    try {
      const aluno = await buscarAluno(filter)
      const id = parseExternalId(aluno?.login)
      if (id !== null) {
        return {
          plataformaAlunoId: id,
          encryptedSenha: aluno.senha ? encrypt(String(aluno.senha)) : null,
        }
      }
    } catch (err) {
      // "Nao encontrado" na EA chega como erro de API — segue para o proximo
      // filtro / criacao. Logado em debug para diagnostico.
      contextLogger().debug(
        { event: "plataforma.buscar_aluno_miss", studentId: student.id, filter: Object.keys(filter)[0] },
        "buscarAluno nao retornou aluno existente",
      )
    }
  }

  return null
}

/**
 * O login da plataforma parceira é ÚNICO por pessoa (mesmo CPF/email),
 * compartilhado entre revendas, e status/apostila são por-LOGIN (não por curso).
 * Antes de reativar o login na compra de uma unidade, checamos se a MESMA pessoa
 * está BLOQUEADA por inadimplência em OUTRA unidade — se estiver, reativar
 * reabriria indevidamente os cursos suspensos daquela outra unidade
 * (vazamento de estado de acesso cross-tenant).
 */
async function isPersonBlockedInAnotherTenant(student: {
  id: string
  cpf: string | null
  email: string | null
}): Promise<boolean> {
  const orFilters: { cpf?: string; email?: string }[] = []
  if (student.cpf) orFilters.push({ cpf: student.cpf })
  if (student.email) orFilters.push({ email: student.email })
  if (orFilters.length === 0) return false
  const blocked = await prisma.student.findFirst({
    where: { id: { not: student.id }, OR: orFilters, status: "BLOQUEADO" },
    select: { id: true },
  })
  return Boolean(blocked)
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
    include: { tenant: { select: { slug: true, poloName: true, plataformaVendedorId: true } } },
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
  const polo = isPmb ? pmbPlataformaPolo() : tenantPolo(student.tenant)

  // Reuso entre revendas: se a pessoa (mesmo CPF/email) ja tem usuario na
  // plataforma — porque comprou em outra unidade — reaproveitamos o login dela
  // em vez de tentar recriar (CPF/email duplicado faria a EA rejeitar e a
  // matricula falhar). Garante o aluno ativo/liberado para acessar o curso
  // recem-comprado (pode ter sido bloqueado por inadimplencia noutra unidade).
  const reused = await findExistingPlatformLogin({
    id: student.id,
    cpf: student.cpf,
    email: student.email,
  })
  if (reused) {
    // Só reativamos o ESTADO GLOBAL do login (status/apostila) se a pessoa NÃO
    // estiver bloqueada por inadimplência em outra unidade — caso contrário a
    // compra aqui reabriria os cursos suspensos de lá (vazamento cross-tenant de
    // acesso). O vínculo do curso recém-comprado é feito pelo caller
    // (linkCourseToStudent) independentemente do status; o desbloqueio global só
    // ocorre quando a pendência que originou o bloqueio for resolvida.
    const blockedElsewhere = await isPersonBlockedInAnotherTenant({
      id: student.id,
      cpf: student.cpf,
      email: student.email,
    })
    if (!blockedElsewhere) {
      await editarAluno({
        id_aluno: reused.plataformaAlunoId,
        status: "ativo",
        apostila: "liberar",
      })
    } else {
      contextLogger().warn(
        {
          event: "plataforma.reuse_blocked_login",
          studentId: student.id,
          plataformaAlunoId: reused.plataformaAlunoId,
        },
        "login compartilhado bloqueado por inadimplência em outra unidade — curso vinculado SEM reativar o acesso global",
      )
    }
    await prisma.student.update({
      where: { id: student.id },
      data: {
        plataformaAlunoId: String(reused.plataformaAlunoId),
        // So sobrescreve a senha local se a origem tinha uma (consulta EA);
        // reuso entre nossos registros pode nao ter senha guardada.
        ...(reused.encryptedSenha
          ? { plataformaAlunoSenha: reused.encryptedSenha }
          : {}),
        // Só promove a ATIVO/LIBERADA se a pessoa não está bloqueada em outra
        // unidade — espelha o que foi (ou não) aplicado na plataforma acima.
        ...(blockedElsewhere ? {} : { status: "ATIVO", apostila: "LIBERADA" }),
        polo,
        vendedorId: null,
      },
    })
    // created=false: a pessoa ja tinha credenciais da plataforma — nao reenvia
    // email de login/senha (seria spam e credenciais possivelmente diferentes).
    return { plataformaAlunoId: reused.plataformaAlunoId, created: false, plataformaSenha: null }
  }

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
    // Por decisão de negócio, NUNCA enviamos vendedor ao EA — o campo fica
    // sempre vazio na plataforma de aulas, para qualquer venda (revenda ou
    // PMB). O `polo` é o que identifica a unidade do aluno.
    vendedor: undefined,
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
      // Não atribuímos vendedor (nem no EA, nem no nosso registro) — uniforme
      // para todas as unidades.
      vendedorId: null,
    },
  })

  return { plataformaAlunoId: Number.parseInt(platformLogin, 10), created: true, plataformaSenha }
}

/**
 * Altera a senha do aluno na plataforma de aulas (EA) e sincroniza a copia
 * criptografada no nosso banco (exibida na area do aluno).
 *
 * A plataforma de aulas e a fonte da verdade do acesso as aulas, entao a senha
 * e trocada la primeiro via `usuarios/editar`; so depois atualizamos o snapshot
 * criptografado em `plataformaAlunoSenha`.
 *
 * Retorna `{ onPlatform: false }` quando o aluno ainda nao foi cadastrado na
 * plataforma (sem matricula paga) — nesse caso nao ha senha a alterar.
 */
export async function changeStudentPlatformPassword(
  studentId: string,
  newPassword: string,
): Promise<{ onPlatform: boolean }> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, plataformaAlunoId: true },
  })
  if (!student) throw new Error(`student ${studentId} nao encontrado`)

  const plataformaId = parseExternalId(student.plataformaAlunoId)
  const isPending = student.plataformaAlunoId?.startsWith("pending") ?? false
  if (plataformaId === null || isPending) {
    return { onPlatform: false }
  }

  // Troca a senha na plataforma de aulas.
  await editarAluno({ id_aluno: plataformaId, senha: newPassword })

  // Sincroniza a copia criptografada exibida no painel do aluno.
  await prisma.student.update({
    where: { id: student.id },
    data: { plataformaAlunoSenha: encrypt(newPassword) },
  })

  return { onPlatform: true }
}

/**
 * Reenvia, pela plataforma de aulas (EA), o email com as credenciais de acesso
 * do aluno (login + senha). Util quando o aluno nao recebeu o email automatico
 * disparado na matricula.
 *
 * Retorna `{ onPlatform: false }` quando o aluno ainda nao foi cadastrado na
 * plataforma (sem matricula paga) — nesse caso nao ha o que reenviar.
 */
export async function resendStudentPlatformCredentials(
  studentId: string,
): Promise<{ onPlatform: boolean }> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { plataformaAlunoId: true },
  })
  if (!student) throw new Error(`student ${studentId} nao encontrado`)

  const plataformaId = parseExternalId(student.plataformaAlunoId)
  const isPending = student.plataformaAlunoId?.startsWith("pending") ?? false
  if (plataformaId === null || isPending) {
    return { onPlatform: false }
  }

  await enviarEmailCredenciais(plataformaId)
  return { onPlatform: true }
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
