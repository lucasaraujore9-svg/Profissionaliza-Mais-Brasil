import { prisma } from "@/lib/prisma"

/**
 * MODULO "VENDER ASSINATURAS" — a habilitacao por UNIDADE.
 *
 * Duas perguntas diferentes, como no modulo "Produzir cursos":
 *
 *   `Tenant.subscriptionsEnabled`  esta unidade PODE vender assinatura?
 *   `assinaturas.view/manage`      QUEM, dentro dela, mexe nos planos?
 *
 * So a segunda existia — e o preset do dono e `owner: ALL`, entao TODA revenda
 * vendia assinatura, e plano da PMB (`tenantId` null) aparecia sozinho em todas
 * as vitrines. Vender assinatura e habilitacao comercial, concedida unidade a
 * unidade em /admin/revendedores/[id] → "Vitrine & extras".
 *
 * ONDE O GATE MORA: em `resolveVitrinePlans` e `getPlanForCheckout`
 * (`plans.ts`). Todas as vitrines, a venda direta do painel e a area do aluno
 * ja passam por essas duas funcoes para listar e para cobrar — um gate que
 * precisasse ser lembrado em cada tela nova e um gate que uma hora fica de fora.
 * As rotas de gestao de planos do painel usam `requireSubscriptionModule`
 * (`module-gate.ts`), coberto por teste.
 *
 * O QUE ELE NAO FECHA, de proposito: a assinatura que JA EXISTE. Webhook,
 * renovacao, catalogo do assinante, liberacao de curso e cancelamento seguem
 * funcionando com o modulo desligado — o aluno pagou pelo ciclo, e desligar
 * uma habilitacao comercial da unidade nao pode tirar o acesso de quem comprou.
 * Mesma regra do modulo "Produzir cursos" ao ser desligado.
 *
 * Modulo sem dependencia de sessao de proposito: `plans.ts` o importa, e
 * arrastar o guard do painel para la puxaria autenticacao para dentro de toda
 * leitura de plano da vitrine.
 */

/** Codigo que a UI usa para distinguir "modulo desligado" de "sem permissao". */
export const SUBSCRIPTIONS_DISABLED = "SUBSCRIPTIONS_DISABLED"

export const SUBSCRIPTIONS_DISABLED_MESSAGE =
  "A venda de assinaturas não está habilitada para esta unidade. Fale com a Profissionaliza Mais Brasil."

/**
 * Esta vitrine pode vender assinatura?
 *
 * `null` e a vitrine da PMB: ela e a dona do produto e nao depende de
 * habilitacao — quem controla o que ela vende sao os proprios planos.
 * Unidade inexistente e fail-closed.
 */
export async function isSubscriptionModuleEnabled(
  tenantId: string | null,
): Promise<boolean> {
  if (tenantId === null) return true
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { subscriptionsEnabled: true },
  })
  return tenant?.subscriptionsEnabled ?? false
}
