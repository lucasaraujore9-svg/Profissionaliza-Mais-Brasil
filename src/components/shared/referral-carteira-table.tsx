import Link from "next/link"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { tenantStatusLabel } from "@/lib/labels"
import { MOTIVO_LABEL } from "@/lib/referrals/relatorio-motivo"
import {
  proximaDirecao,
  type DirecaoOrdem,
  type OrdemCarteira,
} from "@/lib/referrals/relatorio-ordem"
import type { LinhaCarteira } from "@/lib/referrals/relatorio-indicador"

/**
 * Carteira de indicadas do relatorio de indicacao — a tabela que permite
 * CONFERIR a comissao do mes: quem entrou na conta, por quanto, e quem nao
 * entrou e por que.
 *
 * Server component compartilhado por /admin/indicacoes/[id] e
 * /painel/indicacoes/relatorio. Duplicar a tabela faria as duas divergirem em
 * silencio, e a do revendedor e justamente a que ele usa para contestar o valor
 * — ela tem de mostrar exatamente o que a nossa mostra.
 *
 * A ordenacao viaja na URL para o relatorio reabrir igual ao que foi lido; por
 * isso o componente recebe `baseHref` e os parametros ja preservados em vez de
 * virar client component com estado proprio.
 */
/** URL do proprio relatorio com a nova coluna de ordenacao aplicada. */
function sortHref(
  baseHref: string,
  queryExtra: Record<string, string>,
  coluna: OrdemCarteira,
  ordem: OrdemCarteira,
  dir: DirecaoOrdem,
): string {
  const params = new URLSearchParams(queryExtra)
  params.set("ordem", coluna)
  params.set("dir", proximaDirecao(ordem, coluna, dir))
  return `${baseHref}?${params.toString()}`
}

/**
 * Cabecalho clicavel. Fica FORA do componente da tabela de proposito: declarar
 * um componente dentro do render o recria a cada passada (e o lint do projeto
 * barra).
 */
function SortHeader({
  coluna,
  ordem,
  dir,
  baseHref,
  queryExtra,
  align,
  children,
}: {
  coluna: OrdemCarteira
  ordem: OrdemCarteira
  dir: DirecaoOrdem
  baseHref: string
  queryExtra: Record<string, string>
  align?: "right"
  children: React.ReactNode
}) {
  const ativa = ordem === coluna
  const Icone = !ativa ? ChevronsUpDown : dir === "asc" ? ArrowUp : ArrowDown
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <Link
        href={sortHref(baseHref, queryExtra, coluna, ordem, dir)}
        scroll={false}
        className={`inline-flex items-center gap-1 hover:text-[var(--color-pmb-green-900)] ${
          ativa ? "font-semibold text-[var(--color-pmb-green-900)]" : ""
        }`}
      >
        {children}
        <Icone className={`h-3 w-3 ${ativa ? "" : "text-gray-300"}`} aria-hidden />
      </Link>
    </TableHead>
  )
}

export function ReferralCarteiraTable({
  linhas,
  competenciaLabel,
  baseHref,
  queryExtra = {},
  ordem,
  dir,
  unidadeHrefBase,
  titulo = "Carteira de indicadas",
  descricao,
}: {
  linhas: LinhaCarteira[]
  competenciaLabel: string
  baseHref: string
  queryExtra?: Record<string, string>
  ordem: OrdemCarteira
  dir: DirecaoOrdem
  /** Prefixo do link de cada unidade. `null` = sem link (painel do revendedor). */
  unidadeHrefBase?: string | null
  titulo?: string
  descricao?: string
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-800">{titulo}</h2>
        {descricao ? (
          <p className="mt-0.5 text-xs text-gray-500">{descricao}</p>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {(
                [
                  ["nome", "Unidade"],
                  ["status", "Status"],
                  ["entrada", "Entrou em"],
                  ["recebido", "Recebido no mês"],
                  ["conta", `Na conta de ${competenciaLabel}`],
                ] as [OrdemCarteira, string][]
              ).map(([coluna, rotulo]) => (
                <SortHeader
                  key={coluna}
                  coluna={coluna}
                  ordem={ordem}
                  dir={dir}
                  baseHref={baseHref}
                  queryExtra={queryExtra}
                  align={coluna === "recebido" ? "right" : undefined}
                >
                  {rotulo}
                </SortHeader>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-sm text-gray-500"
                >
                  Nenhuma unidade indicada ainda.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {unidadeHrefBase ? (
                      <Link
                        href={`${unidadeHrefBase}/${u.id}`}
                        className="hover:underline"
                      >
                        {u.name}
                      </Link>
                    ) : (
                      u.name
                    )}
                    {u.ativouNoMes ? (
                      <span className="ml-2 rounded bg-[var(--color-pmb-lime-50)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-pmb-green-900)]">
                        ativou no mês
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        u.status === "ACTIVE"
                          ? "default"
                          : u.status === "CANCELLED"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {tenantStatusLabel(u.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-gray-600">
                    {u.entrouEm.toLocaleDateString("pt-BR")}
                    {!u.ativacaoRegistrada ? (
                      <span
                        className="ml-1 text-gray-400"
                        title="Sem data de ativação registrada — usamos a data de cadastro"
                      >
                        (cadastro)
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {u.recebidoNoMes > 0 ? (
                      formatMoney(u.recebidoNoMes)
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {u.naConta ? (
                      <span className="font-semibold text-[var(--color-pmb-green-900)]">
                        Sim · {formatMoney(u.valorNaConta)}
                      </span>
                    ) : (
                      <span className="text-gray-500">
                        Não
                        {u.motivoFora ? ` · ${MOTIVO_LABEL[u.motivoFora]}` : ""}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n)
}
