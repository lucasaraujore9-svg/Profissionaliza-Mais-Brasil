"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ReportTable, ReportTableColumn } from "@/lib/reports/types"
import { formatByFormat } from "@/lib/reports/format"
import { cn } from "@/lib/utils"

type Row = Record<string, string | number | null>

/** Interpola um template de href ("/x/{id}") com os valores da linha. */
function resolveHref(template: string, row: Row): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(row[k] ?? ""))
}

function alignClass(align?: ReportTableColumn["align"]): string {
  if (align === "right") return "text-right"
  if (align === "center") return "text-center"
  return "text-left"
}

interface DataTableProps {
  table: ReportTable
  /** 0 = sem paginação. */
  pageSize?: number
  initialSort?: { key: string; dir: "asc" | "desc" }
}

export function DataTable({ table, pageSize = 20, initialSort }: DataTableProps) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(
    initialSort ?? null,
  )
  const [page, setPage] = useState(0)

  const sortedRows = useMemo(() => {
    if (!sort) return table.rows
    const col = table.columns.find((c) => c.key === sort.key)
    const numeric = col?.format && col.format !== "text"
    const copy = [...table.rows]
    copy.sort((a, b) => {
      const av = a[sort.key]
      const bv = b[sort.key]
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1
      let cmp: number
      if (numeric) cmp = Number(av) - Number(bv)
      else cmp = String(av).localeCompare(String(bv), "pt-BR")
      return sort.dir === "asc" ? cmp : -cmp
    })
    return copy
  }, [table.rows, table.columns, sort])

  const totalPages = pageSize > 0 ? Math.ceil(sortedRows.length / pageSize) : 1
  const clampedPage = Math.min(page, Math.max(totalPages - 1, 0))
  const pageRows =
    pageSize > 0
      ? sortedRows.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize)
      : sortedRows

  function toggleSort(key: string) {
    setPage(0)
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: "desc" }
      if (prev.dir === "desc") return { key, dir: "asc" }
      return null
    })
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      {(table.title || table.subtitle) && (
        <div className="border-b border-gray-100 px-5 py-4">
          {table.title && (
            <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
              {table.title}
            </h3>
          )}
          {table.subtitle && <p className="mt-0.5 text-xs text-gray-600">{table.subtitle}</p>}
        </div>
      )}
      <div className="px-2 py-1">
        <Table>
          <TableHeader>
            <TableRow>
              {table.columns.map((col) => (
                <TableHead key={col.key} className={cn("text-xs", alignClass(col.align))}>
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={cn(
                        "inline-flex items-center gap-1 font-medium hover:text-[var(--color-pmb-green-900)]",
                        col.align === "right" && "flex-row-reverse",
                      )}
                    >
                      {col.label}
                      {sort?.key === col.key ? (
                        sort.dir === "asc" ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-gray-300" />
                      )}
                    </button>
                  ) : (
                    col.label
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={table.columns.length}
                  className="py-8 text-center text-sm text-gray-400"
                >
                  Sem dados no período
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row, i) => (
                <TableRow key={i}>
                  {table.columns.map((col) => {
                    const raw = row[col.key]
                    const content =
                      col.format && col.format !== "text"
                        ? formatByFormat(raw, col.format)
                        : (raw ?? "—")
                    const href = col.href ? resolveHref(col.href, row) : null
                    return (
                      <TableCell
                        key={col.key}
                        className={cn("text-sm", alignClass(col.align))}
                      >
                        {href ? (
                          <Link
                            href={href}
                            className="font-medium text-[var(--color-pmb-green)] hover:underline"
                          >
                            {content}
                          </Link>
                        ) : (
                          content
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
          <span>
            {clampedPage * pageSize + 1}–
            {Math.min((clampedPage + 1) * pageSize, sortedRows.length)} de {sortedRows.length}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={clampedPage === 0}
              onClick={() => setPage((p) => Math.max(p - 1, 0))}
              className="rounded-md border border-gray-200 px-2 py-1 font-medium disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={clampedPage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(p + 1, totalPages - 1))}
              className="rounded-md border border-gray-200 px-2 py-1 font-medium disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
