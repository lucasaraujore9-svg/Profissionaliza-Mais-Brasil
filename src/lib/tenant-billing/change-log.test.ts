import { describe, it, expect } from "vitest"
import { appendNote, lastNote, outsideChanges } from "./change-log"

const due = new Date("2026-10-26T00:00:00.000Z")

describe("change-log", () => {
  it("fatura cancelada PELO PMB (DELETING) nao vira 'direto no Asaas'", () => {
    expect(
      outsideChanges({ status: "DELETING", amount: 239, dueDate: due }, { status: "DELETED", value: 239, dueDate: "2026-10-26" }),
    ).toEqual([])
  })

  it("pagamento normal pelo Asaas nao gera nota", () => {
    expect(
      outsideChanges({ status: "PENDING", amount: 239, dueDate: due }, { status: "RECEIVED", value: 239, dueDate: "2026-10-26" }),
    ).toEqual([])
  })

  it("historico acumula e a tela le a ultima entrada", () => {
    const at = new Date("2026-10-26T14:00:00.000Z")
    const notes = appendNote(appendNote(null, "Cancelada no PMB por Ana.", at), "Cancelada direto no Asaas.", at)
    expect(notes).toBe("[26/10/2026, 11:00] Cancelada no PMB por Ana.\n---\n[26/10/2026, 11:00] Cancelada direto no Asaas.")
    expect(lastNote(notes)).toBe("[26/10/2026, 11:00] Cancelada direto no Asaas.")
    expect(lastNote(null)).toBeNull()
  })
})
