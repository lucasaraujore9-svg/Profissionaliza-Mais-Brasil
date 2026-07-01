import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { leadScopeWhere } from "@/lib/auth/scope"
import type { KpiDatum, ReportSeries, ReportTable } from "../types"
import { buildPayload, type BiContext, type BiModule } from "./context"

const STATUS_LABELS: Record<string, string> = {
  NEW: "Novo",
  CONTACTED: "Em contato",
  CONVERTED: "Convertido",
  LOST: "Perdido",
}

export const leadsConversaoModule: BiModule = {
  async run(ctx: BiContext) {
    const { period, session } = ctx
    const scope = await leadScopeWhere({ userId: session.userId, role: session.role })
    if (!scope) return buildPayload(period, {})

    const range = { gte: period.start, lt: period.end }
    const inPeriod: Prisma.LeadWhereInput = { ...scope, createdAt: range }

    const [total, byStatus, converted, bySource, byOwner, recent] = await Promise.all([
      prisma.lead.count({ where: inPeriod }),
      prisma.lead.groupBy({ by: ["status"], where: inPeriod, _count: { _all: true } }),
      prisma.lead.count({
        where: { ...scope, status: "CONVERTED", updatedAt: range },
      }),
      prisma.lead.groupBy({
        by: ["source"],
        where: inPeriod,
        _count: { _all: true },
        orderBy: { _count: { source: "desc" } },
        take: 10,
      }),
      prisma.lead.groupBy({
        by: ["ownerUserId"],
        where: { ...inPeriod, ownerUserId: { not: null } },
        _count: { _all: true },
      }),
      prisma.lead.findMany({
        where: inPeriod,
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          companyName: true,
          status: true,
          source: true,
          createdAt: true,
          owner: { select: { name: true } },
        },
      }),
    ])

    const countOf = (s: string) => byStatus.find((r) => r.status === s)?._count._all ?? 0
    const open = countOf("NEW") + countOf("CONTACTED")
    const lost = countOf("LOST")
    const conversion = total > 0 ? (countOf("CONVERTED") / total) * 100 : 0

    const kpis: KpiDatum[] = [
      { key: "total", label: "Leads no período", value: total, format: "number", icon: "inbox" },
      { key: "open", label: "Em aberto", value: open, format: "number", icon: "clock" },
      { key: "converted", label: "Convertidos", value: converted, format: "number", icon: "check-circle-2" },
      { key: "conversion", label: "Taxa de conversão", value: conversion, format: "percent", icon: "target" },
      { key: "lost", label: "Perdidos", value: lost, format: "number", icon: "alert-triangle", invertDelta: true },
    ]

    const ownerIds = byOwner.map((o) => o.ownerUserId).filter((x): x is string => !!x)
    const owners = await prisma.user.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, name: true },
    })
    const ownerName = new Map(owners.map((o) => [o.id, o.name]))

    const series: ReportSeries[] = [
      {
        id: "funnel",
        kind: "funnel",
        title: "Funil de conversão",
        xKey: "x",
        series: [{ key: "value", label: "Leads", format: "number" }],
        points: [
          { x: "Novos", value: countOf("NEW") },
          { x: "Em contato", value: countOf("CONTACTED") },
          { x: "Convertidos", value: countOf("CONVERTED") },
        ],
      },
      {
        id: "by-source",
        kind: "bar",
        title: "Leads por origem",
        xKey: "x",
        series: [{ key: "value", label: "Leads", format: "number" }],
        points: bySource.map((s) => ({ x: s.source ?? "—", value: s._count._all })),
      },
      {
        id: "by-owner",
        kind: "bar",
        title: "Leads por vendedor",
        xKey: "x",
        series: [{ key: "value", label: "Leads", format: "number" }],
        points: byOwner.map((o) => ({
          x: ownerName.get(o.ownerUserId ?? "") ?? "—",
          value: o._count._all,
        })),
      },
    ]

    const tables: ReportTable[] = [
      {
        id: "leads-recentes",
        title: "Leads recentes",
        columns: [
          { key: "empresa", label: "Empresa" },
          { key: "status", label: "Status" },
          { key: "origem", label: "Origem" },
          { key: "vendedor", label: "Vendedor" },
          { key: "data", label: "Criado em", format: "text", sortable: true },
        ],
        rows: recent.map((l) => ({
          empresa: l.companyName,
          status: STATUS_LABELS[l.status] ?? l.status,
          origem: l.source ?? "—",
          vendedor: l.owner?.name ?? "—",
          data: l.createdAt.toISOString().slice(0, 10),
        })),
      },
    ]

    return buildPayload(period, { kpis, series, tables })
  },
}
