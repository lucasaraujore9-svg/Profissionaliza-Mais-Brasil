import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { mpWebhookUrl, asaasWebhookUrl } from "@/lib/tenant/urls"
import { forbiddenNameError } from "@/lib/tenant/forbidden-names"
import { painelConfigUpdateSchema } from "@/lib/schemas/painel-config"
import { requirePainel } from "@/lib/auth/painel-guard"

export const GET = withRequestContext(
  { action: "painel.config.get", route: "/api/painel/config" },
  async () => {
    // Auto-serviço: qualquer membro carrega a própria conta (nome/e-mail/CPF)
    // e a aba de senha. O bloco `tenant` — gateway, mensalidade, parcelamento —
    // só sai para quem administra a unidade.
    const guard = await requirePainel("perfil.edit")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const canManageUnit = ctx.can("configuracoes.manage")

    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, name: true, email: true, cpf: true },
    })
    if (!user) {
      return NextResponse.json({ error: "Recurso não encontrado" }, { status: 404 })
    }

    if (!canManageUnit) {
      return NextResponse.json({
        data: { user, tenant: null, canManageUnit: false, canManagePix: ctx.can("gateway.manage") },
      })
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        billingMode: true,
        status: true,
        mpConnected: true,
        mpUserId: true,
        mpWebhookSecret: true,
        mpPublicKey: true,
        monthlyAllowed: true,
        monthlyEnabled: true,
        monthlyScope: true,
        interestFreeInstallments: true,
        // Asaas como gateway de vendas (so aparece no painel quando liberado).
        // asaasConnected ja indica conexao; nao buscamos a api key (segredo) aqui.
        asaasGatewayEnabled: true,
        asaasConnected: true,
        asaasWebhookToken: true,
        salesGateway: true,
      },
    })

    if (!tenant) {
      return NextResponse.json({ error: "Recurso não encontrado" }, { status: 404 })
    }

    // Nunca expõe segredos em si — só se estão configurados. A public key não é
    // secreta (vai pro client no checkout), mas a UI só precisa do booleano.
    const {
      mpWebhookSecret,
      mpPublicKey,
      asaasWebhookToken,
      ...tenantSafe
    } = tenant
    return NextResponse.json({
      data: {
        user,
        canManageUnit: true,
        canManagePix: ctx.can("gateway.manage"),
        tenant: {
          ...tenantSafe,
          mpWebhookConfigured: mpWebhookSecret !== null,
          mpPublicKeyConfigured: mpPublicKey !== null,
          // URL exata que enviamos ao MP e que a unidade cola no painel MP.
          mpWebhookUrl: mpWebhookUrl(tenant.slug),
          // Asaas: só os booleanos + a URL de webhook por-tenant (a unidade cola
          // no painel Asaas dela). A API key e o token nunca chegam ao client.
          asaasWebhookConfigured: asaasWebhookToken !== null,
          asaasWebhookUrl: asaasWebhookUrl(tenant.slug),
        },
      },
    })
  },
)

export const PUT = withRequestContext(
  { action: "painel.config.update", route: "/api/painel/config" },
  async (request: Request) => {
    // Os dados pessoais (nome/e-mail/CPF) são auto-serviço; renomear a UNIDADE
    // exige administrar a configuração. Por isso o guard mínimo aqui é
    // `perfil.edit` e o rename é aplicado condicionalmente mais abaixo.
    const guard = await requirePainel("perfil.edit")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const canManageUnit = ctx.can("configuracoes.manage")

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = painelConfigUpdateSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Dados inválidos",
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    // Marca reservada (contrato): a unidade não pode renomear-se usando
    // Bolsa Mais Brasil / Profissionaliza / Escola de Ensino a Distância /
    // Livre Cursos. Mesma regra da criação (admin).
    if (canManageUnit) {
      const forbidden = forbiddenNameError(parsed.data.companyName)
      if (forbidden) {
        return NextResponse.json(
          { error: forbidden, fields: { companyName: [forbidden] } },
          { status: 400 },
        )
      }
    }

    const emailTaken = await prisma.user.findFirst({
      where: { email: parsed.data.email, NOT: { id: ctx.userId } },
      select: { id: true },
    })
    if (emailTaken) {
      return NextResponse.json(
        { error: "Email já está em uso", code: "EMAIL_TAKEN" },
        { status: 409 },
      )
    }

    // CPF é unique (login determinístico): se já pertence a OUTRA conta,
    // devolve conflito claro em vez de estourar P2002 no update.
    if (parsed.data.cpf) {
      const cpfTaken = await prisma.user.findFirst({
        where: { cpf: parsed.data.cpf, NOT: { id: ctx.userId } },
        select: { id: true },
      })
      if (cpfTaken) {
        return NextResponse.json(
          {
            error: "CPF já está em uso em outra conta",
            code: "CPF_TAKEN",
            fields: { cpf: ["CPF já está em uso em outra conta"] },
          },
          { status: 409 },
        )
      }
    }

    await prisma.user.update({
      where: { id: ctx.userId },
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        cpf: parsed.data.cpf,
      },
    })
    // Renomear a unidade é privilégio de quem administra a configuração — um
    // membro comum salva só os próprios dados.
    if (canManageUnit) {
      await prisma.tenant.update({
        where: { id: ctx.tenantId },
        data: { name: parsed.data.companyName },
      })
    }

    return NextResponse.json({ data: { ok: true } })
  },
)
