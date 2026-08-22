import { ArrowDownLeft, ArrowUpRight, Landmark } from "lucide-react"

export interface SplitStatement {
  repasseEnviado: number
  comissaoRecebida: number
  repasseRecebido: number
  taxaPlataforma: number
  aguardandoLiquidacao: number
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/**
 * Rateio de cursos de autoria.
 *
 * O card acima ("Recebido") mostra o BRUTO que entrou na conta da unidade — e
 * numa venda de curso produzido por outra loja parte desse valor é debitada
 * pelo Asaas na liquidação. Sem esta seção a unidade lê o bruto como se fosse
 * dela e planeja em cima de um dinheiro que já saiu.
 *
 * Some por completo quando não há nada de rateio, que é o caso da esmagadora
 * maioria das unidades — um bloco zerado só polui a tela.
 */
export function FinanceSplitCard({ split }: { split: SplitStatement }) {
  const temMovimento =
    split.repasseEnviado > 0 ||
    split.comissaoRecebida > 0 ||
    split.repasseRecebido > 0

  if (!temMovimento) return null

  const liquido = split.comissaoRecebida + split.repasseRecebido

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Landmark className="h-4 w-4 text-[var(--color-pmb-green)]" aria-hidden="true" />
        <h2 className="text-sm font-semibold">Cursos de autoria</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Vendas de cursos produzidos por você em outras lojas, e vendas de cursos
        de outras unidades na sua. O valor é dividido automaticamente pelo Asaas
        no momento em que a cobrança é paga.
      </p>

      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <Row
          icon={ArrowDownLeft}
          tone="green"
          label="Você recebeu por vender"
          hint="comissão sobre cursos de outras unidades"
          value={split.comissaoRecebida}
        />
        <Row
          icon={ArrowDownLeft}
          tone="green"
          label="Você recebeu como produtor"
          hint="seus cursos vendidos em outras lojas"
          value={split.repasseRecebido}
        />
        <Row
          icon={ArrowUpRight}
          tone="muted"
          label="Repassado a produtores"
          hint="debitado das vendas que entraram aqui"
          value={split.repasseEnviado}
        />
      </dl>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
        <span className="text-muted-foreground">
          Entrou para você em cursos de autoria
        </span>
        <span className="font-mono font-semibold">{formatCurrency(liquido)}</span>
      </div>

      {split.aguardandoLiquidacao > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {formatCurrency(split.aguardandoLiquidacao)} ainda aguardando
          liquidação do Asaas.
        </p>
      )}
    </section>
  )
}

function Row({
  icon: Icon,
  label,
  hint,
  value,
  tone,
}: {
  icon: typeof ArrowUpRight
  label: string
  hint: string
  value: number
  tone: "green" | "muted"
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon
          className={`h-3.5 w-3.5 ${
            tone === "green" ? "text-[var(--color-pmb-green)]" : "text-slate-400"
          }`}
          aria-hidden="true"
        />
        {label}
      </dt>
      <dd className="mt-1 font-mono text-lg font-semibold">
        {formatCurrency(value)}
      </dd>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  )
}
