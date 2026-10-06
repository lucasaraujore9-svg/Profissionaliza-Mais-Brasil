import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { compare } from "bcryptjs"
import { buscarAluno, cursosVinculados } from "@/lib/plataforma-cursos/client"
import { authorizeCron } from "@/lib/observability/cron-heartbeat"

export const maxDuration = 60
export const dynamic = "force-dynamic"

/**
 * Diagnostico SOMENTE LEITURA: o que a plataforma de aulas (EA) tem vinculado a
 * um login x o que as nossas matriculas dizem que deveria estar.
 *
 * Existe porque os segredos da EA sao "Sensitive" na Vercel e nao descem para a
 * maquina de quem investiga (mesmo motivo de `resync-platform-passwords`).
 * Nasceu do chamado de 29/09 (unidade otymus): o aluno clicava num curso e a
 * plataforma abria outro, e so a lista DA EA diz qual curso o login tem de fato.
 *
 * Auth: Bearer CRON_SECRET. Disparo: `app_internal.run_cron(...)`.
 * Query: `ids=4818,4819` (ea_aluno_id, obrigatorio, ate 20).
 *
 * Nao grava nada e nao devolve dado sensivel: so nomes de curso, situacao e
 * percentual — de cada lado — e a diferenca entre eles.
 */
export async function POST(request: Request) {
  if (!(await authorizeCron(request))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .slice(0, 20)
  // Busca por CPF/e-mail: acha o cadastro na EA quando o nosso ainda e
  // `pending_` (aluno de curso do LMS que alguem cadastrou na EA por fora).
  const params = new URL(request.url).searchParams
  const cpf = params.get("cpf")?.replace(/\D/g, "") || undefined
  const email = params.get("email")?.trim() || undefined
  if (cpf || email) {
    const busca = []
    for (const filtro of [cpf && { cpf }, email && { email }].filter(Boolean) as Array<{ cpf?: string; email?: string }>) {
      try {
        const a = await buscarAluno(filtro)
        const local = await prisma.student.findFirst({
          where: cpf ? { cpf } : { email: { equals: email, mode: "insensitive" } },
          select: { passwordHash: true },
        })
        busca.push({
          filtro: cpf && filtro.cpf ? "cpf" : "email",
          ea: a
            ? {
                login: a.login,
                nome: a.nome,
                email: a.email,
                polo: a.polo,
                status: a.status,
                apostila: a.apostila,
                datacadastro: a.datacadastro,
                funcionario_cadastro: a.funcionario_cadastro,
                vendedor: a.vendedor,
                // Nunca a senha: so se ela e a mesma do login do PMB.
                temSenha: Boolean(a.senha),
                senhaIgualPmb:
                  a.senha && local?.passwordHash ? await compare(a.senha, local.passwordHash) : null,
                cursos: /^\d+$/.test(a.login) ? await cursosVinculados(Number(a.login)) : null,
              }
            : null,
        })
      } catch (err) {
        busca.push({ filtro: filtro.cpf ? "cpf" : "email", erro: err instanceof Error ? err.message : String(err) })
      }
    }
    return NextResponse.json({ busca })
  }
  if (ids.length === 0) {
    return NextResponse.json({ error: "Informe ids=<ea_aluno_id>,... ou cpf=/email=" }, { status: 400 })
  }

  const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim().toLowerCase()

  const data = []
  for (const id of ids) {
    const local = await prisma.enrollment.findMany({
      where: { student: { plataformaAlunoId: id }, course: { provider: "EA" } },
      select: {
        status: true,
        course: { select: { nome: true, plataformaCourseId: true } },
        student: { select: { tenant: { select: { slug: true } } } },
      },
    })
    let ea: Array<{ curso: string; situacao: string; porcentagem: string }> | null = null
    let erro: string | null = null
    try {
      ea = (await cursosVinculados(Number(id))).map((c) => ({
        curso: c.Curso,
        situacao: c["Situação"],
        porcentagem: c.Porcentagem,
      }))
    } catch (err) {
      erro = err instanceof Error ? err.message : String(err)
    }
    const localNames = new Set(local.map((e) => norm(e.course.nome)))
    const eaNames = new Set((ea ?? []).map((c) => norm(c.curso)))
    data.push({
      eaAlunoId: id,
      local: local.map((e) => ({
        curso: e.course.nome,
        eaCourseId: e.course.plataformaCourseId,
        status: e.status,
        unidade: e.student.tenant?.slug ?? null,
      })),
      ea,
      erro,
      soNaEa: (ea ?? []).filter((c) => !localNames.has(norm(c.curso))).map((c) => c.curso),
      soAqui: local.filter((e) => !eaNames.has(norm(e.course.nome))).map((e) => e.course.nome),
    })
  }
  return NextResponse.json({ data })
}

export async function GET(request: Request) {
  return POST(request)
}
