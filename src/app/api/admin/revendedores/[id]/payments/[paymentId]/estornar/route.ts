import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { uploadPayoutProof } from "@/lib/storage/payout-proof"
import { isValidImageMagic } from "@/lib/storage/validate-image"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { logAudit } from "@/lib/audit"
import { swallow } from "@/lib/errors"
import { createNotification } from "@/lib/notifications"
import { flagMonthlyCommissionForRefund } from "@/lib/referrals/monthly"
import { janelaEstorno, podeEstornar } from "@/lib/tenant-billing/refund"

const MAX_BYTES = 8 * 1024 * 1024 // 8MB
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "application/pdf",
])

function extensionFor(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png"
    case "image/jpeg":
    case "image/jpg":
      return "jpg"
    case "image/webp":
      return "webp"
    case "application/pdf":
      return "pdf"
    default:
      return "bin"
  }
}

/** Magic bytes do PDF: "%PDF-". */
function isPdf(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer.slice(0, 5))
  return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d
}

/**
 * ESTORNO de mensalidade — registra que o dinheiro voltou para a unidade.
 *
 * O estorno em si acontece FORA daqui (PIX de devolucao, botao de estorno no
 * painel do Asaas); esta rota o REGISTRA. Por isso o COMPROVANTE e obrigatorio:
 * e a unica prova, dentro do sistema, de que o dinheiro saiu. Sem ele um estorno
 * fica indistinguivel de um erro de digitacao que apaga receita.
 *
 * Efeito no dinheiro: a linha vai para `REFUNDED` e SAI do filtro de status pago
 * do motor de comissao, entao a mensalidade deixa de gerar repasse. Se a
 * competencia JA foi apurada, dispara o clawback — a comissao ja liberada ou
 * paga e marcada `[CLAWBACK_PENDING]` e os saques do indicador ficam bloqueados
 * ate o financeiro resolver, em vez de o valor sumir em silencio.
 *
 * O PRAZO DE 7 DIAS AVISA, NAO IMPEDE (decisao do dono): quando alguem vem
 * registrar, o estorno JA aconteceu no banco. Bloquear nao desfaz a devolucao —
 * so deixaria o sistema afirmando que a mensalidade foi paga, e a comissao
 * seguiria sendo calculada sobre dinheiro que voltou. Fora do prazo a rota
 * responde 409 com `requiresConfirmation` e so grava com a confirmacao
 * explicita; a trilha registra os dois casos.
 */
export const POST = withRequestContextParams<{ id: string; paymentId: string }>(
  {
    action: "admin.revendedores.estornar_pagamento",
    route: "/api/admin/revendedores/[id]/payments/[paymentId]/estornar",
  },
  async (request: Request, context) => {
    const guard = await requireAdmin("financeiro.manage")
    if (!guard.ok) return guard.response
    const ctx = guard.ctx
    const { id, paymentId } = await context.params

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        accountManagerId: true,
        salesUserId: true,
      },
    })
    if (!tenant || !(await ctx.canAccessTenant(tenant))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const payment = await prisma.tenantPayment.findFirst({
      // `tenantId` no where e o que impede estornar a cobranca de OUTRA unidade
      // passando um paymentId qualquer na URL.
      where: { id: paymentId, tenantId: id },
      select: {
        id: true,
        status: true,
        amount: true,
        refundedAt: true,
        paidAt: true,
        clientPaidAt: true,
        competenceAt: true,
      },
    })
    if (!payment) {
      return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 })
    }
    if (!podeEstornar(payment.status, payment.refundedAt)) {
      return NextResponse.json(
        {
          error: payment.refundedAt
            ? "Esta cobrança já foi estornada."
            : "Só é possível estornar uma cobrança paga.",
          code: "NOT_REFUNDABLE",
        },
        { status: 409 },
      )
    }

    const form = await request.formData().catch(() => null)
    if (!form) {
      return NextResponse.json({ error: "Envio inválido" }, { status: 400 })
    }
    const motivo = String(form.get("motivo") ?? "").trim()
    if (motivo.length < 3) {
      return NextResponse.json(
        { error: "Informe o motivo do estorno.", code: "REASON_REQUIRED" },
        { status: 400 },
      )
    }
    const confirmaForaDoPrazo = String(form.get("confirmaForaDoPrazo") ?? "") === "true"

    // O prazo conta do PAGAMENTO do cliente; `paidAt` (credito) so entra como
    // fallback para linha antiga sem a data do cliente.
    const referencia = payment.clientPaidAt ?? payment.paidAt
    const janela = referencia ? janelaEstorno(referencia) : null
    if (janela && !janela.dentroDoPrazo && !confirmaForaDoPrazo) {
      return NextResponse.json(
        {
          error: janela.descricao,
          code: "OUT_OF_WINDOW",
          requiresConfirmation: true,
          diasDesdePagamento: janela.diasDesdePagamento,
        },
        { status: 409 },
      )
    }

    const file = form.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Anexe o comprovante do estorno.", code: "PROOF_REQUIRED" },
        { status: 400 },
      )
    }
    if (file.size === 0 || file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Arquivo vazio ou maior que 8MB." },
        { status: 400 },
      )
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Formato não aceito. Use PNG, JPG, WEBP ou PDF." },
        { status: 400 },
      )
    }
    const bytes = await file.arrayBuffer()
    // O `type` do multipart vem do cliente. A checagem de magic bytes e o que
    // impede subir um executavel dizendo que e PNG.
    const conteudoOk =
      file.type === "application/pdf"
        ? isPdf(bytes)
        : isValidImageMagic(bytes, file.type)
    if (!conteudoOk) {
      return NextResponse.json(
        { error: "O arquivo não corresponde ao formato informado." },
        { status: 400 },
      )
    }

    // Bucket privado compartilhado com o comprovante de saque; o prefixo separa
    // os dois. `refundProofUrl` guarda o PATH, nunca URL publica.
    const path = `estornos/${paymentId}/${crypto.randomUUID()}.${extensionFor(file.type)}`
    await uploadPayoutProof(path, bytes, file.type)

    const agora = new Date()
    const atualizado = await prisma.tenantPayment.updateMany({
      // CAS: `refundedAt: null` faz o segundo clique virar no-op em vez de um
      // segundo estorno na trilha e um segundo clawback sobre a mesma comissao.
      where: { id: paymentId, tenantId: id, refundedAt: null },
      data: {
        status: "REFUNDED",
        refundedAt: agora,
        refundReason: motivo,
        refundProofUrl: path,
        refundedById: ctx.userId,
      },
    })
    if (atualizado.count === 0) {
      return NextResponse.json(
        { error: "Esta cobrança já foi estornada.", code: "NOT_REFUNDABLE" },
        { status: 409 },
      )
    }

    // A comissao da competencia pode ja ter sido apurada — e ate paga.
    await flagMonthlyCommissionForRefund(
      paymentId,
      `Mensalidade estornada: ${motivo}`,
    ).catch(swallow("admin.revendedores.estornar_pagamento"))

    await logAudit({
      action: "tenant_payment.refund",
      resource: "tenant_payment",
      resourceId: paymentId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      actorEmail: ctx.email,
      tenantId: id,
      payloadBefore: { status: payment.status },
      payloadAfter: {
        unidade: tenant.name,
        valor: Number(payment.amount),
        motivo,
        competencia: payment.competenceAt?.toISOString().slice(0, 7) ?? null,
        diasDesdePagamento: janela?.diasDesdePagamento ?? null,
        foraDoPrazo: janela ? !janela.dentroDoPrazo : null,
        comprovante: path,
      },
    }).catch(swallow("admin.revendedores.estornar_pagamento"))

    if (janela && !janela.dentroDoPrazo) {
      // Estorno fora da janela de arrependimento nao pode passar despercebido.
      // SEM `category` para nao poder ser silenciado por preferencia.
      await createNotification({
        audience: "ROLE",
        roleTarget: "SUPER_ADMIN",
        level: "WARNING",
        title: `Estorno fora do prazo: ${tenant.name}`,
        body: `Mensalidade de R$ ${Number(payment.amount).toFixed(2).replace(".", ",")} estornada ${janela.diasDesdePagamento} dias após o pagamento (prazo: 7). Motivo: ${motivo}`,
        href: `/admin/revendedores/${id}`,
      }).catch(swallow("admin.revendedores.estornar_pagamento"))
    }

    return NextResponse.json({
      data: {
        refundedAt: agora.toISOString(),
        diasDesdePagamento: janela?.diasDesdePagamento ?? null,
        foraDoPrazo: janela ? !janela.dentroDoPrazo : false,
      },
    })
  },
)
