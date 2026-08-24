import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * INVARIANTE ESTRUTURAL: o gate de "esta loja tem gateway?" mora em
 * `resolveSaleGateway`, e em lugar nenhum antes dele.
 *
 * O defeito que isto trava: um gate escrito à mão ANTES do cálculo do cupom
 * recusa a venda por falta de conta bancária sem nunca olhar o desconto — e um
 * cupom de 100%, que não vai a gateway nenhum, morre junto com as cobranças de
 * verdade. Era assim nas três portas até 2026-08-24; a unidade emitia no painel
 * um cupom que a própria vitrine dela recusava.
 *
 * Modelado em `guard-coverage.test.ts`: o valor está em quebrar o build quando
 * alguém escrever a PRÓXIMA porta de venda com o gate no lugar errado.
 */

const SRC = join(process.cwd(), "src")

// Portas self-service de venda de unidade (revenda). A vitrine da PMB tem
// gateway próprio sempre, então fica fora.
const PORTAS = [
  "app/api/loja/checkout/route.ts",
  "app/api/loja/checkout/package/route.ts",
  "app/api/aluno/comprar/route.ts",
]

describe("gate de gateway das portas de venda da unidade", () => {
  for (const porta of PORTAS) {
    const src = readFileSync(join(SRC, porta), "utf8")

    it(`${porta} resolve o gateway por resolveSaleGateway`, () => {
      expect(src).toContain("@/lib/checkout/sale-gateway")
      expect(src).toContain("resolveSaleGateway(")
    })

    it(`${porta} não tem gate de gateway escrito à mão`, () => {
      // `CHECKOUT_UNAVAILABLE` / `ASAAS_NOT_CONFIGURED` fora do helper significa
      // uma recusa que não enxerga o valor final da venda.
      expect(src).not.toContain("CHECKOUT_UNAVAILABLE")
      expect(src).not.toContain("ASAAS_NOT_CONFIGURED")
    })

    it(`${porta} reserva o cupom DEPOIS de resolver o gateway`, () => {
      // Ordem invertida devolve 503 com um uso do cupom já queimado numa venda
      // que não aconteceu.
      const gate = src.indexOf("resolveSaleGateway(")
      const reserva = src.indexOf("tryConsumeCoupon(")
      expect(gate).toBeGreaterThan(-1)
      expect(reserva).toBeGreaterThan(gate)
    })
  }
})
