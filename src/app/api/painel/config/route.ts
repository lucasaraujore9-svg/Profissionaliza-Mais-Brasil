import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { mpWebhookUrl, asaasWebhookUrl } from "@/lib/tenant/urls"
import { forbiddenNameError } from "@/lib/tenant/forbidden-names"
import { painelConfigUpdateSchema } from "@/lib/schemas/painel-config"
import { requirePainel } from "@/lib/auth/painel-guard"
import { AsaasApiError, motherAsaasKey, updateCustomer } from "@/lib/asaas/client"
import { logAudit } from "@/lib/audit"
import { contextLogger } from "@/lib/logger"

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
      select: { id: true, name: true, email: true, cpf: true, phone: true },
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
        cnpj: true,
        razaoSocial: true,
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
        // Asaas como gateway de vendas — disponivel para TODA unidade (nao ha
        // mais capability). asaasConnected indica se ela ja conectou a conta;
        // nao buscamos a api key (segredo) aqui.
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

    // CNPJ/razao social da empresa: so quem administra a unidade, e so quando o
    // campo veio (undefined = nao mexe). O cliente Asaas da MENSALIDADE (conta
    // da PMB) passa a usar o CNPJ — e e atualizado ANTES de qualquer escrita
    // local: se o Asaas recusar, nada muda e a tela mostra o motivo, em vez de
    // o PMB dizer CNPJ e o boleto seguir saindo no CPF. Apagar o CNPJ so tira
    // do PMB/rodape; o Asaas fica como esta.
    const { cnpj, razaoSocial } = parsed.data
    let companyChange: {
      before: { cnpj: string | null; razaoSocial: string | null }
      after: { cnpj: string | null; razaoSocial: string | null }
      asaasCustomerId: string | null
    } | null = null
    if (canManageUnit && (cnpj !== undefined || razaoSocial !== undefined)) {
      const before = await prisma.tenant.findUnique({
        where: { id: ctx.tenantId },
        select: { cnpj: true, razaoSocial: true, asaasCustomerId: true },
      })
      const after = {
        cnpj: cnpj === undefined ? (before?.cnpj ?? null) : cnpj,
        razaoSocial: razaoSocial === undefined ? (before?.razaoSocial ?? null) : razaoSocial,
      }
      if (before && (after.cnpj !== before.cnpj || after.razaoSocial !== before.razaoSocial)) {
        companyChange = {
          before: { cnpj: before.cnpj, razaoSocial: before.razaoSocial },
          after,
          asaasCustomerId: before.asaasCustomerId,
        }
      }
    }

    if (companyChange?.after.cnpj && companyChange.asaasCustomerId) {
      const razao = companyChange.after.razaoSocial
      try {
        await updateCustomer(
          companyChange.asaasCustomerId,
          { cpfCnpj: companyChange.after.cnpj, ...(razao ? { name: razao, company: razao } : {}) },
          motherAsaasKey(),
        )
      } catch (err) {
        contextLogger().error(
          { err, event: "painel.config.cnpj.asaas_failed", tenantId: ctx.tenantId },
          "atualizar CNPJ do cliente Asaas da mensalidade falhou",
        )
        const refused = err instanceof AsaasApiError && err.statusCode < 500
        const message = refused
          ? `O Asaas recusou o CNPJ: ${err.message}`
          : "Não foi possível atualizar o CNPJ na cobrança agora. Tente novamente em instantes."
        return NextResponse.json(
          { error: message, fields: { cnpj: [message] } },
          { status: refused ? 400 : 502 },
        )
      }
    }

    await prisma.user.update({
      where: { id: ctx.userId },
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        cpf: parsed.data.cpf,
        phone: parsed.data.phone,
      },
    })
    // Renomear a unidade é privilégio de quem administra a configuração — um
    // membro comum salva só os próprios dados.
    if (canManageUnit) {
      await prisma.tenant.update({
        where: { id: ctx.tenantId },
        data: {
          name: parsed.data.companyName,
          ...(companyChange ? companyChange.after : {}),
        },
      })
    }
    if (companyChange) {
      await logAudit({
        action: "tenant.cnpj.update",
        resource: "Tenant",
        resourceId: ctx.tenantId,
        actorUserId: ctx.userId,
        actorRole: ctx.memberRole,
        tenantId: ctx.tenantId,
        payloadBefore: companyChange.before,
        payloadAfter: {
          ...companyChange.after,
          asaasCustomerUpdated: Boolean(companyChange.after.cnpj && companyChange.asaasCustomerId),
        },
      })
    }

    return NextResponse.json({ data: { ok: true } })
  },
)
