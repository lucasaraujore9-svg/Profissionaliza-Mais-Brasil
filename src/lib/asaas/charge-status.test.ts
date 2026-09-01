import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { chargeStatus, isChargePayable } from "./charge-status"

/*
 * O caso real: a mensalidade da unidade `n1-professional-institute` foi
 * REMOVIDA no Asaas e, minutos depois, a titular abriu o link de pagamento e
 * pediu o PIX. O Asaas devolveu 200 com `status: "PENDING"` (soft delete), a
 * tela abriu o checkout inteiro e o QR gerado apontava para uma cobrança que
 * não existe mais — o banco dela respondeu "QR Code não é válido".
 */

const removida = { status: "PENDING", deleted: true }
const removidaVencida = { status: "OVERDUE", deleted: true }
const emAberto = { status: "PENDING", deleted: false }
const vencida = { status: "OVERDUE", deleted: false }
const paga = { status: "RECEIVED", deleted: false }

describe("isChargePayable — as DUAS condições", () => {
  it("recusa cobrança removida que ainda se diz PENDING", () => {
    expect(isChargePayable(removida)).toBe(false)
  })

  it("recusa cobrança removida que ainda se diz OVERDUE", () => {
    expect(isChargePayable(removidaVencida)).toBe(false)
  })

  it("recusa cobrança já paga", () => {
    expect(isChargePayable(paga)).toBe(false)
  })

  it("aceita cobrança em aberto de verdade", () => {
    expect(isChargePayable(emAberto)).toBe(true)
    expect(isChargePayable(vencida)).toBe(true)
  })
})

describe("chargeStatus — 'removida' deixa de ser estado invisível", () => {
  it("colapsa a cobrança removida em DELETED, apesar do status do Asaas", () => {
    // O enum de status da API do Asaas NÃO tem "DELETED". Sem este colapso, a
    // tela mostraria "Pendente" para sempre numa cobrança apagada.
    expect(chargeStatus(removida)).toBe("DELETED")
    expect(chargeStatus(removidaVencida)).toBe("DELETED")
  })

  it("preserva o status real quando a cobrança existe", () => {
    expect(chargeStatus(emAberto)).toBe("PENDING")
    expect(chargeStatus(paga)).toBe("RECEIVED")
  })
})

/*
 * Invariante de cobertura, no molde do `guard-coverage.test.ts`: toda rota de
 * `/api/cobranca` que lê a cobrança no Asaas tem que decidir por este módulo.
 * Uma rota nova que volte a comparar `payment.status` na mão reabre exatamente
 * o buraco que gerou o "QR Code não é válido".
 */
describe("cobertura: nenhuma rota de /cobranca decide por status na mão", () => {
  const ROOT = join(process.cwd(), "src/app/api/cobranca")

  function routeFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) return routeFiles(full)
      return entry.name === "route.ts" ? [full] : []
    })
  }

  const files = routeFiles(ROOT)

  it("encontra as rotas (senão o teste passaria vazio)", () => {
    expect(files.length).toBeGreaterThanOrEqual(4)
  })

  it.each(files.map((f) => [f.slice(ROOT.length + 1), f]))(
    "%s",
    (_label, file) => {
      const src = readFileSync(file as string, "utf8")
      if (!src.includes("getPayment(")) return

      // Comparar status a mão é o padrão que deixou a cobrança removida passar.
      const naMao = /payment\.status\s*(===|!==)\s*"(PENDING|OVERDUE)"/.test(src)
      expect(naMao).toBe(false)

      expect(src).toMatch(/isChargePayable|chargeStatus/)
    },
  )
})
