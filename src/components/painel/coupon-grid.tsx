"use client"

import { useState } from "react"
import { CouponCard } from "./coupon-card"
import { CouponUsageTable } from "./coupon-usage-table"

const coupons = [
  { codigo: "BEMVINDO10", descricao: "10% off para novos alunos", descontoLabel: "10% de desconto", validoAte: "30/04/2026", usos: "142 de 500", ativo: true },
  { codigo: "EXCEL50", descricao: "R$ 50 off em Excel", descontoLabel: "R$ 50 de desconto", validoAte: "30/04/2026", usos: "38 de 100", ativo: true },
  { codigo: "PASCOA20", descricao: "Campanha de Páscoa", descontoLabel: "20% de desconto", validoAte: "25/04/2026", usos: "22 de 200", ativo: true },
  { codigo: "AMIGOS15", descricao: "Indique um amigo", descontoLabel: "15% de desconto", validoAte: "31/12/2026", usos: "86 ilimitado", ativo: true },
  { codigo: "VOLTA30", descricao: "Volta às aulas", descontoLabel: "30% de desconto", validoAte: "15/03/2026", usos: "Encerrado", ativo: false },
  { codigo: "BLACK40", descricao: "Black Friday antecipada", descontoLabel: "40% de desconto", validoAte: "28/11/2026", usos: "Programado", ativo: false },
  { codigo: "BOASVINDAS", descricao: "Email de boas-vindas", descontoLabel: "R$ 30 de desconto", validoAte: "Sem validade", usos: "74 ilimitado", ativo: true },
  { codigo: "ANIVERSARIO", descricao: "Mês de aniversário", descontoLabel: "25% de desconto", validoAte: "30/04/2026", usos: "12 de 50", ativo: true },
  { codigo: "MARKETING5", descricao: "Marketing Digital", descontoLabel: "5% de desconto", validoAte: "30/06/2026", usos: "48 ilimitado", ativo: true },
  { codigo: "CURSO100", descricao: "Frete/desconto plano", descontoLabel: "R$ 100 de desconto", validoAte: "10/04/2026", usos: "4 de 20", ativo: false },
  { codigo: "PRIMEIRO", descricao: "Primeira compra", descontoLabel: "12% de desconto", validoAte: "Sem validade", usos: "210 ilimitado", ativo: true },
  { codigo: "INDICA25", descricao: "Programa indica", descontoLabel: "25% de desconto", validoAte: "31/05/2026", usos: "19 de 100", ativo: true },
]

export function CouponGrid() {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {coupons.map((coupon) => (
          <CouponCard
            key={coupon.codigo}
            coupon={coupon}
            onToggleDetails={() =>
              setExpanded((prev) =>
                prev === coupon.codigo ? null : coupon.codigo,
              )
            }
          />
        ))}
      </div>

      {expanded && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-[#1A1A2E]">
            Histórico do cupom{" "}
            <span className="font-mono text-blue-600">{expanded}</span>
          </h3>
          <p className="mt-1 text-xs text-gray-600">
            Últimos usos registrados deste cupom.
          </p>
          <div className="mt-4">
            <CouponUsageTable />
          </div>
        </div>
      )}
    </div>
  )
}
