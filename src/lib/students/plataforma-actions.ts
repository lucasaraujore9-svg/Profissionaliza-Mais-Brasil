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
import { setLmsStudentAccess, revokeLmsEnrollment } from "@/lib/lms"

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
    } catch {
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
    where: {
      id: { not: student.id },
      OR: orFilters,
      // DEVEDOR conta junto com BLOQUEADO: e a trava da COTA DE AULAS, que
      // tambem restringe o acesso. Sem ele, comprar um curso numa segunda
      // unidade reativava o login e devolvia as aulas ainda nao pagas da
      // primeira — o mesmo vazamento cross-tenant que este guard existe para
      // impedir, so que pela porta da cota.
      status: { in: ["BLOQUEADO", "DEVEDOR"] },
    },
    select: { id: true },
  })
  return Boolean(blocked)
}

/**
 * Le a senha que de fato vale na plataforma de aulas via `usuarios/listar`
 * (fonte da verdade do acesso as aulas).
 *
 * Nunca lanca. Devolve `null` quando nao foi possivel saber — listar falhou
 * (rede/API) ou veio sem senha. `null` significa "desconhecido", NAO "vazio":
 * quem chama precisa distinguir os dois para nao gravar retrato errado.
 */
export async function readPlatformPassword(
  plataformaAlunoId: number,
): Promise<string | null> {
  try {
    const aluno = await buscarAluno({ id: plataformaAlunoId })
    const senha = aluno?.senha != null ? String(aluno.senha).trim() : ""
    if (senha) return senha
    contextLogger().warn(
      { event: "plataforma.listar_senha_vazia", plataformaAlunoId },
      "usuarios/listar nao retornou senha",
    )
  } catch (err) {
    contextLogger().warn(
      { err, event: "plataforma.listar_senha_failed", plataformaAlunoId },
      "falha ao reler senha autoritativa da plataforma",
    )
  }
  return null
}

/**
 * Resolve a senha autoritativa do aluno na plataforma de aulas relendo de
 * `usuarios/listar` (fonte da verdade), porque a resposta de `usuarios/novo`
 * nem sempre traz a senha real de login.
 *
 * Nunca lanca: se o listar falhar (rede/API) ou nao trouxer senha, devolve a
 * `fallbackSenha` (a do cadastro) — melhor um retrato possivelmente defasado do
 * que quebrar a matricula em andamento.
 */
export async function resolveAuthoritativePlatformPassword(
  plataformaAlunoId: number,
  fallbackSenha: string,
): Promise<string> {
  return (await readPlatformPassword(plataformaAlunoId)) ?? fallbackSenha
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
  const novoSenha = String(result.senha)

  // A resposta do `usuarios/novo` nem sempre traz a senha REAL de login (a EA
  // pode gerar/usar uma senha diferente da devolvida no cadastro). A fonte da
  // verdade é `usuarios/listar`, então relemos de lá para guardar/exibir o valor
  // correto — com fallback seguro para a senha do cadastro se o listar falhar.
  const plataformaSenha = await resolveAuthoritativePlatformPassword(
    Number.parseInt(platformLogin, 10),
    novoSenha,
  )

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

export interface PlatformPasswordChangeResult {
  /** false = aluno ainda nao existe na plataforma de aulas (sem matricula paga). */
  onPlatform: boolean
  /**
   * true  = a plataforma REALMENTE trocou a senha (confirmado relendo
   *         `usuarios/listar` depois da escrita).
   * false = a chamada respondeu "sucesso" mas a senha la continua outra, ou nao
   *         foi possivel confirmar. Quem chama NAO pode reportar sucesso.
   */
  applied: boolean
  /**
   * Senha que de fato vale na plataforma apos a tentativa. `null` quando nao
   * conseguimos reler (EA fora do ar) — nesse caso nada foi gravado.
   */
  effectivePassword: string | null
}

/**
 * Tenta alterar a senha do aluno na plataforma de aulas (EA) e sincroniza a
 * copia criptografada do nosso banco (exibida na area do aluno) com o valor que
 * REALMENTE vale la.
 *
 * ⚠️ A API v2 da Escola Avancada NAO expoe troca de senha de aluno. O campo
 * `senha` so existe em `funcionarios/novo`; `usuarios/novo` gera a senha e
 * `usuarios/editar` nao tem esse campo — manda-lo faz a EA DESCARTAR o
 * parametro em silencio e ainda responder "Aluno editado com sucesso!".
 * Confiar nesse retorno era o bug: reportavamos sucesso ao aluno e gravavamos
 * no snapshot uma senha inexistente, destruindo a unica via de recuperacao que
 * funciona (a senha reta exibida em /aluno).
 *
 * Por isso a escrita e sempre seguida de uma RELEITURA (`usuarios/listar`):
 * - releu e bate com a nova senha  → aplicou de verdade; grava o snapshot.
 * - releu e veio outra coisa       → a EA ignorou; grava a senha REAL
 *                                    (auto-corrige retratos ja corrompidos) e
 *                                    devolve `applied: false`.
 * - nao conseguiu reler            → estado desconhecido; nao grava nada.
 *
 * Mantemos a tentativa de escrita (em vez de so recusar) para que o recurso
 * volte a funcionar sozinho caso a EA passe a aceitar `senha` em `editar`.
 */
export async function changeStudentPlatformPassword(
  studentId: string,
  newPassword: string,
): Promise<PlatformPasswordChangeResult> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, plataformaAlunoId: true },
  })
  if (!student) throw new Error(`student ${studentId} nao encontrado`)

  const plataformaId = parseExternalId(student.plataformaAlunoId)
  const isPending = student.plataformaAlunoId?.startsWith("pending") ?? false
  if (plataformaId === null || isPending) {
    return { onPlatform: false, applied: false, effectivePassword: null }
  }

  await editarAluno({ id_aluno: plataformaId, senha: newPassword })

  const effective = await readPlatformPassword(plataformaId)
  if (effective === null) {
    // Estado desconhecido: nao sabemos se a senha mudou. Deixar o snapshot como
    // esta e melhor do que grava-lo com um palpite.
    contextLogger().warn(
      { event: "plataforma.senha_change_unverified", studentId, plataformaAlunoId: plataformaId },
      "nao foi possivel confirmar a troca de senha na plataforma — snapshot preservado",
    )
    return { onPlatform: true, applied: false, effectivePassword: null }
  }

  const applied = effective === newPassword
  if (!applied) {
    contextLogger().warn(
      { event: "plataforma.senha_change_ignored", studentId, plataformaAlunoId: plataformaId },
      "a plataforma de aulas ignorou a troca de senha (usuarios/editar nao suporta `senha`) — snapshot ressincronizado com a senha real",
    )
  }

  // Grava sempre o valor autoritativo: quando aplicou e a nova senha; quando
  // nao aplicou, ressincroniza o snapshot com a senha real da EA.
  await prisma.student.update({
    where: { id: student.id },
    data: { plataformaAlunoSenha: encrypt(effective) },
  })

  return { onPlatform: true, applied, effectivePassword: effective }
}

/**
 * Ressincroniza o snapshot cifrado (`plataformaAlunoSenha`) com a senha real da
 * plataforma de aulas. Usado antes de exibir/reenviar credenciais, para que o
 * aluno nunca receba um valor defasado.
 *
 * Nunca lanca: se a EA estiver fora do ar mantemos o snapshot atual.
 */
export async function resyncStudentPlatformPassword(
  studentId: string,
): Promise<{ onPlatform: boolean; password: string | null }> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, plataformaAlunoId: true },
  })
  if (!student) throw new Error(`student ${studentId} nao encontrado`)

  const plataformaId = parseExternalId(student.plataformaAlunoId)
  const isPending = student.plataformaAlunoId?.startsWith("pending") ?? false
  if (plataformaId === null || isPending) {
    return { onPlatform: false, password: null }
  }

  const real = await readPlatformPassword(plataformaId)
  if (real === null) return { onPlatform: true, password: null }

  await prisma.student.update({
    where: { id: student.id },
    data: { plataformaAlunoSenha: encrypt(real) },
  })
  return { onPlatform: true, password: real }
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

  const { plataformaAlunoId, created } = await ensureStudentOnPlatform(studentId)

  await vincularCurso({ aluno: plataformaAlunoId, idcurso: courseIdNum })

  // Invariante: todo aluno com curso vinculado deve estar ATIVO na plataforma.
  // `ensureStudentOnPlatform` garante status="ativo" ao CRIAR o login, mas faz
  // short-circuit quando o aluno JA existe (early return) — entao um login
  // legado/manual em "interessado" (ou inativo) ganharia o curso sem ser
  // promovido a ativo. Reafirmamos o acesso quando o login nao foi criado agora.
  if (!created) {
    await ensureStudentActiveOnPlatform(studentId, plataformaAlunoId)
  }

  return { plataformaAlunoId, plataformaCourseId: courseIdNum }
}

/**
 * Garante que o aluno esta ATIVO/LIBERADO na plataforma de aulas — invariante de
 * "todo aluno com curso vinculado deve estar ativo". Chamado ao vincular curso a
 * um login que ja existia (o `criarAluno` ja nasce ativo, entao esse caminho so
 * corrige logins legados/manuais ou com status defasado, ex.: "interessado").
 *
 * Espelha a guarda de isolamento cross-tenant de `ensureStudentOnPlatform`: NAO
 * reativa quando a MESMA pessoa esta bloqueada por inadimplencia em OUTRA unidade
 * (status/apostila sao por-login compartilhado; reativar reabriria os cursos
 * suspensos da outra unidade — vazamento de acesso cross-tenant). O bloqueio por
 * inadimplencia/expiracao do PROPRIO aluno e reaplicado pelos crons de sweep.
 */
export async function ensureStudentActiveOnPlatform(
  studentId: string,
  plataformaAlunoId: number,
): Promise<void> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, cpf: true, email: true, status: true, apostila: true },
  })
  if (!student) return

  if (await isPersonBlockedInAnotherTenant(student)) {
    contextLogger().warn(
      {
        event: "plataforma.skip_activate_blocked_login",
        studentId,
        plataformaAlunoId,
      },
      "curso vinculado SEM reativar o acesso — pessoa bloqueada por inadimplencia em outra unidade",
    )
    return
  }

  // Idempotente: a EA aceita reenviar o mesmo status. So tocamos o banco quando
  // o status local ainda nao reflete ATIVO/LIBERADA.
  await editarAluno({ id_aluno: plataformaAlunoId, status: "ativo", apostila: "liberar" })
  if (student.status !== "ATIVO" || student.apostila !== "LIBERADA") {
    await prisma.student.update({
      where: { id: student.id },
      data: { status: "ATIVO", apostila: "LIBERADA" },
    })
  }
}

/**
 * Desvincula um curso do aluno na plataforma. Roteia por fornecedora:
 *  - LMS: revoga a matricula (POST /enrollments/:id/revoke, por enrollmentId) — idempotente.
 *  - EA:  remove o curso do aluno (removerCurso).
 */
export async function unlinkCourseFromStudent(
  studentId: string,
  courseId: string,
): Promise<void> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { provider: true, plataformaCourseId: true },
  })
  if (!course) throw new Error(`course ${courseId} nao encontrado`)

  // ── LMS: revoga por enrollmentId (acesso e por-matricula no LMS) ──
  if (course.provider === "LMS") {
    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId, courseId, lmsEnrollmentId: { not: null } },
      select: { lmsEnrollmentId: true },
      orderBy: { createdAt: "desc" },
    })
    if (enrollment?.lmsEnrollmentId) {
      await revokeLmsEnrollment(enrollment.lmsEnrollmentId)
    }
    return
  }

  // ── EA: remove o curso do aluno ──
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { plataformaAlunoId: true },
  })
  if (!student) throw new Error(`student ${studentId} nao encontrado`)

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
    select: {
      id: true,
      plataformaAlunoId: true,
      enrollments: {
        where: { lmsEnrollmentId: { not: null } },
        select: { id: true },
        take: 1,
      },
    },
  })
  if (!student) throw new Error(`student ${studentId} nao encontrado`)

  const platformId = parseExternalId(student.plataformaAlunoId)
  const hasLms = student.enrollments.length > 0

  // Aluno sem nenhum canal (nem EA nem LMS): nao ha o que propagar.
  if (platformId === null && !hasLms) {
    throw new Error("aluno sem plataforma_aluno_id (ainda nao foi para a plataforma)")
  }

  // EA: bloqueio por-login. LMS: bloqueio por-student (best-effort + log — os
  // crons de sweep reaplicam; o bloqueio do LMS e idempotente).
  if (platformId !== null) {
    await editarAluno({ id_aluno: platformId, status: "bloqueado", apostila: "bloquear" })
  }
  if (hasLms) {
    // NAO engolir a falha: se virasse só log, o status local ja seria BLOQUEADO
    // abaixo e os sweeps (blockTenantStudents / sweep-students-overdue pulam quem
    // ja esta BLOQUEADO) nunca re-tentariam — o aluno manteria acesso ao LMS
    // apesar de bloqueado (vazamento de acesso pago). Propagar mantem o status
    // local inalterado e deixa o proximo run re-tentar (re-bloquear na EA e
    // idempotente).
    try {
      await setLmsStudentAccess(student.id, "blocked")
    } catch (err) {
      contextLogger().error(
        { err, event: "students.lms_block_failed", studentId },
        "bloqueio do aluno no LMS falhou",
      )
      throw err
    }
  }

  await prisma.student.update({
    where: { id: student.id },
    data: { status: "BLOQUEADO", apostila: "BLOQUEADA" },
  })
}

/**
 * Status enviado a plataforma de aulas quando a trava e a COTA DE AULAS (venda
 * parcelada, aluno em dia mas adiantado no conteudo) — decisao do produto em
 * 2026-07-22. Distinto de "bloqueado", que fica reservado a INADIMPLENCIA, para
 * o suporte da unidade saber na propria EA por que o aluno esta travado.
 *
 * Constante isolada de proposito: se a EA nao barrar a aula com `devedor` (a doc
 * da API v2 nao especifica — validar com aluno de teste), trocar aqui por
 * "bloqueado", que comprovadamente barra, resolve em uma linha.
 */
const EA_PACE_STATUS = "devedor"

/**
 * Ids dos nossos Student que representam a MESMA PESSOA — e portanto compartilham
 * um unico login na plataforma de aulas (regra de negocio: um usuario por CPF,
 * reaproveitado entre revendas; ver `findExistingPlatformLogin`).
 *
 * Necessario porque status/apostila sao por LOGIN, nao por curso: qualquer trava
 * precisa saber o que mais aquela pessoa tem liberado antes de cortar.
 */
export async function findPersonStudentIds(studentId: string): Promise<string[]> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, cpf: true, email: true },
  })
  if (!student) return []

  const orFilters: { cpf?: string; email?: string }[] = []
  if (student.cpf) orFilters.push({ cpf: student.cpf })
  if (student.email) orFilters.push({ email: student.email })
  if (orFilters.length === 0) return [student.id]

  const siblings = await prisma.student.findMany({
    where: { OR: orFilters },
    select: { id: true },
  })
  const ids = new Set(siblings.map((s) => s.id))
  ids.add(student.id)
  return [...ids]
}

/**
 * Aplica (ou remove) a trava de COTA DE AULAS no acesso do aluno.
 *
 * Precedencia sobre a trava de inadimplencia sai de graca do proprio estado
 * local, sem resolver central:
 *   - so TRAVA quem esta ATIVO — um aluno ja BLOQUEADO por inadimplencia nao e
 *     rebaixado para DEVEDOR (seria afrouxar a trava mais forte);
 *   - so LIBERA quem esta DEVEDOR — ou seja, quem foi travado por ESTA regra.
 *     Um BLOQUEADO segue com a inadimplencia, que tem dono proprio (o sweep do
 *     carne e o auto-block do tenant).
 *
 * Propaga aos dois canais, como `blockStudentInEA`: EA por login (`editarAluno`)
 * e LMS por aluno (`setLmsStudentAccess`). NUNCA desvincula curso — na EA
 * desvincular e revincular ZERA o progresso do aluno (confirmado em 2026-07-22).
 *
 * Devolve `true` quando o estado mudou de fato.
 */
export async function setStudentPaceBlock(
  studentId: string,
  blocked: boolean,
): Promise<boolean> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      status: true,
      plataformaAlunoId: true,
      enrollments: {
        where: { lmsEnrollmentId: { not: null } },
        select: { id: true },
        take: 1,
      },
    },
  })
  if (!student) throw new Error(`student ${studentId} nao encontrado`)

  // Precedencia: nao mexe em quem esta sob outra trava (BLOQUEADO/INATIVO/...).
  const expectedFrom = blocked ? "ATIVO" : "DEVEDOR"
  if (student.status !== expectedFrom) return false

  const platformId = parseExternalId(student.plataformaAlunoId)
  const hasLms = student.enrollments.length > 0
  // Aluno que ainda nao foi para nenhuma plataforma: nada a propagar. Nao e erro
  // (a cota vale a partir do provisionamento) — so nao ha o que travar.
  if (platformId === null && !hasLms) return false

  if (platformId !== null) {
    await editarAluno({
      id_aluno: platformId,
      status: blocked ? EA_PACE_STATUS : "ativo",
      apostila: blocked ? "bloquear" : "liberar",
    })
  }
  if (hasLms) {
    // Simetrico a blockStudentInEA: propaga a falha em vez de engolir, para o
    // status local NAO ser gravado antes do LMS confirmar — senao a varredura
    // seguinte veria o estado ja aplicado e nunca re-tentaria.
    try {
      await setLmsStudentAccess(student.id, blocked ? "blocked" : "active")
    } catch (err) {
      contextLogger().error(
        { err, event: "students.lms_pace_block_failed", studentId, blocked },
        "propagacao da cota de aulas ao LMS falhou",
      )
      throw err
    }
  }

  await prisma.student.update({
    where: { id: student.id },
    data: blocked
      ? { status: "DEVEDOR", apostila: "BLOQUEADA" }
      : { status: "ATIVO", apostila: "LIBERADA" },
  })
  return true
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
    select: {
      id: true,
      plataformaAlunoId: true,
      enrollments: {
        where: { lmsEnrollmentId: { not: null } },
        select: { id: true },
        take: 1,
      },
    },
  })
  if (!student) throw new Error(`student ${studentId} nao encontrado`)

  const platformId = parseExternalId(student.plataformaAlunoId)
  const hasLms = student.enrollments.length > 0

  if (platformId === null && !hasLms) {
    throw new Error("aluno sem plataforma_aluno_id (ainda nao foi para a plataforma)")
  }

  if (platformId !== null) {
    await editarAluno({ id_aluno: platformId, status: "ativo", apostila: "liberar" })
  }
  if (hasLms) {
    // Simetrico ao bloqueio: propaga a falha para o status local nao ser marcado
    // ATIVO antes do LMS confirmar — senao a reativacao do LMS ficaria pendente
    // sem retry e o aluno (que pagou) seguiria sem acesso ao LMS.
    try {
      await setLmsStudentAccess(student.id, "active")
    } catch (err) {
      contextLogger().error(
        { err, event: "students.lms_unblock_failed", studentId },
        "reativacao do aluno no LMS falhou",
      )
      throw err
    }
  }

  await prisma.student.update({
    where: { id: student.id },
    data: { status: "ATIVO", apostila: "LIBERADA" },
  })
}

export { resolvePoloContextForStudent }
