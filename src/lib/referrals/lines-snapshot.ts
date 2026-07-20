/**
 * Leitura do `ReferralMonthlyCommission.linesSnapshot`.
 *
 * O campo e `Json?` no Prisma: o banco nao valida nada e o formato pode ter sido
 * gravado por uma versao anterior do motor. Todo consumidor (PDF do
 * demonstrativo, CSVs, telas do admin, BI) precisa do MESMO type guard, senao
 * cada tela inventa uma tolerancia diferente e as somas divergem entre si.
 *
 * O produtor canonico e `MonthlyLine` em ./monthly.ts — mantenha os dois lados
 * em sincronia ao mexer no snapshot.
 */

/** Uma unidade indicada dentro do fechamento mensal do indicador. */
export interface MonthlyCommissionLine {
  /** Tenant da unidade indicada. */
  tenantId: string
  /** Nome da unidade no momento do fechamento (snapshot, nao lookup). */
  name: string
  /** Mensalidade recebida no mes (PERCENT) ou planValue (FIXED). */
  mensalidade: number
  /** Contribuicao desta unidade para a comissao do mes. */
  amount: number
  /** Tipo de valor da fase ATIVA desta unidade no mes. */
  rateType?: "FIXED" | "PERCENT"
  /** Valor da faixa aplicada: R$ por unidade (FIXED) ou % (PERCENT). */
  rate?: number
  /** Indice (0-based) da fase ativa desta unidade no plano. */
  phaseIndex?: number
}

/**
 * Type guard REAL: valida cada campo obrigatorio e, quando presente, cada campo
 * opcional. Objetos que nao passam sao descartados pelo chamador — nenhuma
 * coercao silenciosa para 0 / "", que viraria dinheiro fabricado no relatorio.
 */
export function isMonthlyCommissionLine(
  value: unknown,
): value is MonthlyCommissionLine {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const obj = value as Record<string, unknown>
  if (typeof obj.tenantId !== "string" || obj.tenantId === "") return false
  if (typeof obj.name !== "string") return false
  if (typeof obj.mensalidade !== "number" || !Number.isFinite(obj.mensalidade)) return false
  if (typeof obj.amount !== "number" || !Number.isFinite(obj.amount)) return false
  if (
    obj.rateType !== undefined &&
    obj.rateType !== "FIXED" &&
    obj.rateType !== "PERCENT"
  ) {
    return false
  }
  if (
    obj.rate !== undefined &&
    (typeof obj.rate !== "number" || !Number.isFinite(obj.rate))
  ) {
    return false
  }
  if (
    obj.phaseIndex !== undefined &&
    (typeof obj.phaseIndex !== "number" || !Number.isInteger(obj.phaseIndex))
  ) {
    return false
  }
  return true
}

/**
 * Le o snapshot e devolve so as linhas integras. Snapshot ausente, nao-array ou
 * totalmente corrompido devolve `[]` — e cada chamador ja tem o caminho de
 * fallback para o agregado do mes (`amount`/`baseSum`/`unitCount` da comissao),
 * que e a fonte de verdade do dinheiro.
 */
export function parseLinesSnapshot(snapshot: unknown): MonthlyCommissionLine[] {
  if (!Array.isArray(snapshot)) return []
  return snapshot.filter(isMonthlyCommissionLine)
}

/**
 * Percentual a exibir para uma linha. Faixa FIXED paga R$ por unidade — nao e
 * percentual e nao pode ser publicado numa coluna "%".
 */
export function linePercent(line: MonthlyCommissionLine): number | null {
  return line.rateType === "PERCENT" && typeof line.rate === "number" ? line.rate : null
}
