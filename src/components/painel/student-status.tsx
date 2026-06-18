import { StatusBadge, type BadgeTone } from "@/components/shared/status-badge"

/**
 * Fonte unica de verdade para status de aluno no painel (revendedor).
 * Consumido pela tabela de alunos, pelo detalhe (student-management) e pelos
 * filtros, garantindo vocabulario e cores identicos — sem cores cruas
 * (green/orange/violet) e sem drift entre filtro e exibicao.
 *
 * Tons conforme o sistema de design PMB (status-badge):
 *  - ATIVO                 -> success (verde)
 *  - PENDENTE / DEVEDOR    -> warning (ouro)
 *  - BLOQUEADO             -> danger (vermelho)
 *  - INATIVO / cancelado   -> neutral (cinza)
 *  - FORMADO               -> accent (lima)
 *  - INTERESSADO           -> info (ciano)
 */
export type StudentStatusKey =
  | "ATIVO"
  | "PENDENTE"
  | "INATIVO"
  | "BLOQUEADO"
  | "DEVEDOR"
  | "FORMADO"
  | "INTERESSADO"

export interface StudentStatusMeta {
  label: string
  tone: BadgeTone
}

export const STUDENT_STATUS_META: Record<StudentStatusKey, StudentStatusMeta> = {
  ATIVO: { label: "Ativo", tone: "success" },
  PENDENTE: { label: "Pagamento pendente", tone: "warning" },
  DEVEDOR: { label: "Devedor", tone: "warning" },
  BLOQUEADO: { label: "Bloqueado", tone: "danger" },
  INATIVO: { label: "Inativo", tone: "neutral" },
  FORMADO: { label: "Formado", tone: "accent" },
  INTERESSADO: { label: "Interessado", tone: "info" },
}

const FALLBACK_META: StudentStatusMeta = { label: "", tone: "neutral" }

export function studentStatusMeta(status: string): StudentStatusMeta {
  return (
    STUDENT_STATUS_META[status as StudentStatusKey] ?? {
      ...FALLBACK_META,
      label: status,
    }
  )
}

export function StudentStatusBadge({ status }: { status: string }) {
  const { label, tone } = studentStatusMeta(status)
  return (
    <StatusBadge tone={tone} dot>
      {label}
    </StatusBadge>
  )
}
