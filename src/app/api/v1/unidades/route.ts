import { z } from "zod"
import { autenticarParceiro } from "@/lib/api-parceiros/gate"
import { apiFail, apiOk } from "@/lib/api-parceiros/response"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"
import { createReseller } from "@/lib/resellers/create"
import { RESELLER_PLANS } from "@/lib/resellers/plans"
import { SLUG_REGEX } from "@/lib/tenant/slug"
import { appUrl } from "@/lib/tenant/urls"
import { slugify } from "@/lib/utils"

/**
 * POST /api/v1/unidades
 *
 * Cria uma unidade (revenda) e devolve o link da 1ª mensalidade. Mesmo núcleo
 * (`createReseller`) do /admin e do painel: cobrança no Asaas da PMB, e-mail de
 * onboarding com a senha temporária, vitrine semeada.
 *
 * Só os planos de TABELA. Cortesia, promoção e valor livre continuam sendo
 * decisão humana no /admin — uma chave vazada não pode abrir unidade de graça.
 *
 * Auth: escopo `unidades.create`. Contrato em docs/api/parceiros-v1.md.
 */

export const dynamic = "force-dynamic"

const PLANO_PRO = RESELLER_PLANS.find((p) => p.automation)!
const PLANO_BASE = RESELLER_PLANS.find((p) => !p.automation)!

const bodySchema = z.object({
  nome: z.string().trim().min(2).max(80),
  /** Ausente = derivado do nome. */
  slug: z.string().trim().toLowerCase().min(3).max(32).regex(SLUG_REGEX, "Use apenas letras, números e hífen").optional(),
  plano: z.enum(["profissionaliza", "pro"]),
  /** Teto de parcelas no cartão da 1ª mensalidade (1 = à vista). */
  parcelasPrimeiraMensalidade: z.number().int().min(1).max(12).default(1),
  titular: z.object({
    nome: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email(),
    cpfCnpj: z.string().trim().min(11).max(20),
    telefone: z.string().trim().min(8).max(20).optional(),
  }),
})

export const POST = withRequestContext(
  { action: "api.v1.unidades.create", route: "/api/v1/unidades" },
  async (request: Request) => {
    const auth = await autenticarParceiro(request, "unidades.create", 30)
    if (!auth.ok) return auth.response

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return apiFail("JSON inválido.", { status: 400, code: "VALIDATION_ERROR" })
    }
    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return apiFail("Dados inválidos.", {
        status: 400,
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten(),
      })
    }
    const data = parsed.data
    const plano = data.plano === "pro" ? PLANO_PRO : PLANO_BASE
    const slug = data.slug ?? slugify(data.nome).slice(0, 32).replace(/-+$/, "")

    try {
      const result = await createReseller({
        name: data.nome,
        slug,
        ownerName: data.titular.nome,
        ownerEmail: data.titular.email,
        ownerCpfCnpj: data.titular.cpfCnpj,
        ownerPhone: data.titular.telefone,
        planValue: plano.value,
        firstPaymentMaxInstallments: data.parcelasPrimeiraMensalidade,
        automationEnabled: plano.automation,
        actor: { userId: null, role: "API_KEY", email: `api:${auth.key.prefix}` },
      })

      if (!result.ok) {
        const code =
          result.status === 409 ? "CONFLICT" : result.status === 403 ? "FORBIDDEN" : "VALIDATION_ERROR"
        return apiFail(result.error, {
          status: result.status,
          code,
          ...(result.fields ? { details: { fieldErrors: result.fields } } : {}),
        })
      }

      // Link da NOSSA página de cobrança (PIX, boleto e cartão parcelado), não a
      // fatura hospedada do Asaas — mesmo destino do /admin e do painel.
      const { firstPaymentId, error: asaasError } = result.asaas
      return apiOk(
        {
          unidade: {
            id: result.tenant.id,
            slug: result.tenant.slug,
            nome: result.tenant.name,
            status: result.tenant.status,
            vitrineUrl: result.vitrineUrl,
          },
          titular: result.owner,
          pagamento: {
            url: firstPaymentId ? `${appUrl()}/cobranca/${firstPaymentId}` : null,
            cobrancaId: firstPaymentId,
            valor: plano.value,
            plano: data.plano,
            // A unidade JÁ foi criada; sem link, a equipe PMB reemite pelo /admin.
            erro: asaasError,
          },
          emailOnboardingEnviado: result.email.sent,
        },
        201,
      )
    } catch (error) {
      contextLogger().error(
        { err: error, event: "api.v1.unidades.create.failed", apiKeyPrefix: auth.key.prefix, slug },
        "criação de unidade via API falhou",
      )
      return apiFail("Erro interno ao criar a unidade.", { status: 500, code: "INTERNAL_ERROR" })
    }
  },
)
