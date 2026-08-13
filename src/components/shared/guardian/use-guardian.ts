"use client"

import { useCallback, useMemo, useState } from "react"
import { guardianRequirement } from "@/lib/students/guardian"
import {
  EMPTY_GUARDIAN,
  guardianPayload,
  type GuardianFormState,
} from "./guardian-fields"

/**
 * Estado do par (data de nascimento, responsável financeiro) para os
 * formulários. A DECISÃO de exigir continua sendo do servidor — aqui só
 * antecipamos, para o bloco abrir sozinho em vez de o usuário descobrir a regra
 * por um 400.
 *
 * `guardianRequirement` é a MESMA função que o Zod do servidor usa, então o
 * cliente e o servidor não têm como discordar sobre quem é menor.
 */
export function useGuardian(initial?: {
  nascimento?: string
  guardian?: Partial<GuardianFormState>
}) {
  const [nascimento, setNascimento] = useState(initial?.nascimento ?? "")
  const [guardian, setGuardianState] = useState<GuardianFormState>({
    ...EMPTY_GUARDIAN,
    ...initial?.guardian,
  })
  /** Aberto manualmente: "quem vai pagar não é o aluno?" (avó pagando pelo neto). */
  const [manualOpen, setManualOpen] = useState(
    Boolean(initial?.guardian?.responsavel),
  )

  const requirement = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) return "UNKNOWN" as const
    const d = new Date(`${nascimento}T00:00:00.000Z`)
    if (Number.isNaN(d.getTime())) return "UNKNOWN" as const
    return guardianRequirement(d)
  }, [nascimento])

  const required = requirement === "REQUIRED"
  const open = required || manualOpen

  const setGuardian = useCallback((patch: Partial<GuardianFormState>) => {
    setGuardianState((prev) => ({ ...prev, ...patch }))
  }, [])

  return {
    nascimento,
    setNascimento,
    guardian,
    setGuardian,
    /** Menor de idade pela data informada. */
    required,
    /** O bloco deve estar na tela (por idade OU por escolha). */
    open,
    manualOpen,
    setManualOpen,
    /** Campos prontos para o corpo da requisição. */
    payload: () => guardianPayload(guardian, open),
  }
}
