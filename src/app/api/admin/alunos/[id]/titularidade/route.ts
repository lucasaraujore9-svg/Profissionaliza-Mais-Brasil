import { NextResponse } from "next/server"
import { z } from "zod"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import {
  applyTitularityCorrection,
  markTitularityReviewed,
  titularitySchema,
  TitularityScopeError,
} from "@/lib/students/titularity/apply"
import { prisma } from "@/lib/prisma"

/**
 * Correção de titularidade no /admin.
 *
 * Família `alunosRede.*` e NÃO `alunos.*`: esta rota alcança aluno de QUALQUER
 * unidade da rede — `alunos.*` cobre só a vitrine B2C da PMB. É a mesma
 * permissão que `PATCH /api/admin/alunos/[id]` já exige para a edição comum;
 * seria incoerente exigir menos para reescrever um certificado. (E o Diretor de
 * unidades, cujo trabalho é exatamente este, tem `alunosRede.*` e não `alunos.*`.)
 *
 * PERMISSÃO CONJUNTA, e é ela que importa: corrigir o CADASTRO exige
 * `alunosRede.manage`; reescrever um CERTIFICADO já emitido exige também
 * `certificados.manage`. Existe preset com `alunos.manage` e sem
 * `certificados.manage` (atendimento) — quem atende conserta ficha, mas não
 * reescreve diploma. Nenhuma permissão nova foi criada de propósito: o catálogo
 * é fechado e uma permissão nova obrigaria a mexer em ADMIN_PERMISSIONS,
 * PAINEL_PERMISSIONS, WRITE_IMPLIES_READ, em todos os presets e nas listas de
 * rótulos de /admin/equipe e /painel/equipe.
 */

function actorFrom(
  request: Request,
  ctx: { userId: string; role: string; email: string | null },
) {
  return {
    userId: ctx.userId,
    role: ctx.role,
    email: ctx.email,
    ip:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip")?.trim() ||
      null,
    userAgent: request.headers.get("user-agent"),
  }
}

export const POST = withRequestContextParams<{ id: string }>(
  {
    action: "admin.alunos.titularidade",
    route: "/api/admin/alunos/[id]/titularidade",
  },
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const guard = await requireAdmin("alunosRede.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const { id } = await params

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = titularitySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Dados inválidos",
          fields: z.flattenError(parsed.error).fieldErrors,
        },
        { status: 400 },
      )
    }

    // Reescrever certificado é um poder à parte de corrigir cadastro.
    if (parsed.data.corrigirCertificados) {
      const temCertificado = await prisma.certificate.count({
        where: { studentId: id, revokedAt: null },
      })
      if (temCertificado > 0 && !ctx.can("certificados.manage")) {
        return NextResponse.json(
          {
            error:
              "Este aluno tem certificado emitido. Corrigir o documento exige a permissão de gerenciar certificados.",
            code: "CERTIFICATE_PERMISSION_REQUIRED",
          },
          { status: 403 },
        )
      }
    }

    // Recorte de carteira: nunca re-derivado na rota.
    const student = await prisma.student.findUnique({
      where: { id },
      // `canAccessTenant` precisa dos campos de CARTEIRA — o recorte vem do
      // guard, nunca re-derivado aqui.
      select: {
        tenantId: true,
        tenant: { select: { accountManagerId: true, salesUserId: true } },
      },
    })
    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }
    if (!ctx.canAccessTenant(student.tenant)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    try {
      const result = await applyTitularityCorrection(
        id,
        parsed.data,
        actorFrom(request, ctx),
      )
      return NextResponse.json({ data: result })
    } catch (err) {
      if (err instanceof TitularityScopeError) {
        return NextResponse.json(
          { error: "Aluno não encontrado" },
          { status: 404 },
        )
      }
      throw err
    }
  },
)

const reviewSchema = z.object({
  nota: z.string().trim().max(300).optional().or(z.literal("")),
})

/** "Revisei e está correto" — tira da fila sem alterar nada. */
export const PATCH = withRequestContextParams<{ id: string }>(
  {
    action: "admin.alunos.titularidade.revisado",
    route: "/api/admin/alunos/[id]/titularidade",
  },
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const guard = await requireAdmin("alunosRede.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const { id } = await params

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      payload = {}
    }
    const parsed = reviewSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
    }

    const student = await prisma.student.findUnique({
      where: { id },
      select: {
        tenant: { select: { accountManagerId: true, salesUserId: true } },
      },
    })
    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }
    if (!ctx.canAccessTenant(student.tenant)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    const ok = await markTitularityReviewed(
      id,
      actorFrom(request, ctx),
      parsed.data.nota || null,
    )
    if (!ok) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }
    return NextResponse.json({ data: { ok: true } })
  },
)
