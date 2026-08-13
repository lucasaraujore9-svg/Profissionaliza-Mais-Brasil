import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import {
  applyTitularityCorrection,
  markTitularityReviewed,
  titularitySchema,
  TitularityScopeError,
} from "@/lib/students/titularity/apply"
import { prisma } from "@/lib/prisma"

/**
 * Correção de titularidade no painel da unidade.
 *
 * A UNIDADE PODE, e deve: é ela que conhece a família e tem o documento na mão.
 * Centralizar na PMB criaria uma fila de chamados que não drena — e a PMB não
 * tem como conferir o documento de uma criança.
 *
 * PERMISSÃO CONJUNTA, e é ela que importa: corrigir o CADASTRO exige
 * `alunos.manage`; reescrever um CERTIFICADO já emitido exige também
 * `certificados.manage`. Existe preset com `alunos.manage` e sem
 * `certificados.manage` (atendimento) — quem atende conserta ficha, mas não
 * reescreve diploma. Nenhuma permissão nova foi criada de propósito: o catálogo
 * é fechado e uma permissão nova obrigaria a mexer em ADMIN_PERMISSIONS,
 * PAINEL_PERMISSIONS, WRITE_IMPLIES_READ, em todos os presets e nas listas de
 * rótulos de /admin/equipe e /painel/equipe.
 */

function actorFrom(
  request: Request,
  ctx: { userId: string; memberRole: string; isOwner: boolean },
) {
  return {
    userId: ctx.userId,
    // O painel não carrega e-mail do ator no contexto; o papel na unidade é o
    // que identifica quem agiu na trilha.
    role: ctx.isOwner ? "owner" : ctx.memberRole,
    email: null,
    ip:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip")?.trim() ||
      null,
    userAgent: request.headers.get("user-agent"),
  }
}

export const POST = withRequestContextParams<{ id: string }>(
  {
    action: "painel.alunos.titularidade",
    route: "/api/painel/alunos/[id]/titularidade",
  },
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const guard = await requirePainel("alunos.manage")
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
        where: { studentId: id, tenantId: ctx.tenantId, revokedAt: null },
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

    try {
      // Isolamento P0: `scopeTenantId` faz o próprio núcleo recusar aluno de
      // outra unidade — nenhum id forjado alcança loja alheia.
      const result = await applyTitularityCorrection(
        id,
        parsed.data,
        actorFrom(request, ctx),
        { tenantId: ctx.tenantId, extraWhere: ctx.scope.alunos },
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
    action: "painel.alunos.titularidade.revisado",
    route: "/api/painel/alunos/[id]/titularidade",
  },
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const guard = await requirePainel("alunos.manage")
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

    const ok = await markTitularityReviewed(
      id,
      actorFrom(request, ctx),
      parsed.data.nota || null,
      { tenantId: ctx.tenantId, extraWhere: ctx.scope.alunos },
    )
    if (!ok) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }
    return NextResponse.json({ data: { ok: true } })
  },
)
