import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * INVARIANTE: o link de pagamento de uma LOJA (unidade ou vitrine PMB) é sempre
 * a página da própria plataforma — nunca a página do gateway.
 *
 * Nasceu do caso Conecta Educacional (2026-09-14): a venda direta de assinatura
 * mandava o `init_point` do Mercado Pago, e a revisão achou o mesmo defeito em
 * mais seis lugares (fatura do Asaas no "reenviar link" e no "Pagar agora",
 * boleto hospedado no carnê, `ticket_url` no e-mail, preference na vitrine PMB,
 * fatura na renovação da assinatura). Cada um nasceu num arquivo diferente,
 * então a trava é estrutural: quebra o build quando alguém voltar a LER um
 * campo de página do gateway fora dos lugares conhecidos.
 *
 * O que é permitido DENTRO da nossa página: QR do PIX, linha digitável e PDF do
 * boleto (`bankSlipUrl`, `external_resource_url`). O que não é: a fatura
 * hospedada do Asaas (`invoiceUrl`), o checkout do MP (`init_point`), a página
 * do PIX do MP (`ticket_url`) e a preference do Checkout Pro.
 *
 * Arquivo novo numa lista abaixo = decisão consciente, com o motivo escrito ao
 * lado. Nunca para "fazer o teste passar".
 */

const SRC = join(process.cwd(), "src")

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(full) && !/\.test\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

const rel = (f: string) => f.slice(SRC.length + 1).replaceAll("\\", "/")

/** Comentários explicam o defeito antigo; só CÓDIGO conta. */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1")
}

const FILES = walk(SRC).map((f) => ({ path: rel(f), src: code(f) }))

function filesMatching(re: RegExp): string[] {
  return FILES.filter((f) => re.test(f.src)).map((f) => f.path).sort()
}

describe("link de pagamento de loja nunca é a página do gateway", () => {
  it("página hospedada do Mercado Pago (init_point, ticket_url) só existe no tipo", () => {
    expect(
      filesMatching(/\b(init_point|sandbox_init_point|initPoint|ticket_url|ticketUrl)\b/),
    ).toEqual(["lib/mercadopago/types.ts"])
  })

  it("preference do Checkout Pro (pagamento na página do MP) não é criada em lugar nenhum", () => {
    expect(filesMatching(/\bcreatePreference\s*\(/)).toEqual(["lib/mercadopago/client.ts"])
  })

  it("toda preapproval do MP leva o cartão tokenizado (sem token ela vira página do MP)", () => {
    const semToken = FILES.filter(
      (f) =>
        f.path !== "lib/mercadopago/client.ts" &&
        /\bcreatePreapproval\s*\(/.test(f.src) &&
        !f.src.includes("card_token_id"),
    ).map((f) => f.path)
    expect(semToken).toEqual([])
  })

  it("a fatura hospedada do Asaas (invoiceUrl) só é lida nos lugares conhecidos", () => {
    const permitidos = [
      // ── Cobrança da MENSALIDADE da unidade (a PMB cobra a revenda) — não é
      //    loja vendendo para aluno.
      "app/api/admin/financeiro/tenant-payments/route.ts",
      "app/api/admin/revendedores/[id]/billing/route.ts",
      "app/api/admin/revendedores/[id]/route.ts",
      "app/api/admin/revendedores/export/route.ts",
      "app/api/revendedores/cadastro/route.ts",
      "components/admin/financeiro-tenant-payments.tsx",
      "components/admin/new-reseller-dialog.tsx",
      "components/admin/reseller-payment-history.tsx",
      "components/painel/nova-revenda-form.tsx",
      "components/painel/tenant-charges-list.tsx",
      "lib/admin/resellers/export-rows.ts",
      "lib/asaas/promo.ts",
      "lib/asaas/reconcile.ts",
      "lib/resellers/create.ts",
      "lib/tenant-billing/charges.ts",
      "lib/tenant-billing/types.ts",
      // ── GRAVAÇÃO do que o Asaas devolve/avisa (histórico, reconciliação) —
      //    nunca devolvida ao aluno como link.
      "lib/asaas/process.ts",
      "lib/asaas/transparent-process.ts",
      "lib/asaas/types.ts",
      "lib/checkout/issue-pmb-asaas-charge.ts",
      "lib/subscriptions/renew.ts",
      // Evento de assinatura dos DOIS webhooks do Asaas (a cópia que morava em
      // `reseller-process.ts` foi unificada aqui): só repassa o que o evento
      // traz para `renew.ts` gravar.
      "lib/subscriptions/asaas-events.ts",
      // ── Coluna `BoletoInstallment.invoiceUrl`: guarda só o PDF do BOLETO da
      //    parcela (lib/installments/plan.ts), mostrado dentro da nossa página.
      "app/(main)/pagar/[id]/page.tsx",
      "app/aluno/pagamentos/page.tsx",
      "app/loja/pagar/[id]/page.tsx",
      "components/aluno/installments-section.tsx",
      "components/loja/pmb-checkout-form.tsx",
      "lib/installments/plan.ts",
      // ── Mesma view (`InstallmentView.invoiceUrl`) para a assinatura no boleto:
      //    preenchida com `bankSlipUrl`, o PDF do boleto — nunca a fatura.
      "lib/subscriptions/carne-view.ts",
    ].sort()
    expect(filesMatching(/\binvoiceUrl\b/)).toEqual(permitidos)
  })

  it("a fatura do Asaas gravada na matrícula (asaasInvoiceUrl) só é escrita, nunca vira link", () => {
    expect(filesMatching(/\basaasInvoiceUrl\b/)).toEqual([
      "lib/asaas/transparent-process.ts",
      "lib/checkout/issue-pmb-asaas-charge.ts",
    ])
  })
})
