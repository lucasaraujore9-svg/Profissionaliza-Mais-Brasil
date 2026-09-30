import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authorizeCron } from "@/lib/observability/cron-heartbeat"
import { cancelSubscriptionAccess } from "@/lib/subscriptions/cancel"
import { anonymizeStudentAccount } from "@/lib/lgpd/anonymize-student"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 120
export const dynamic = "force-dynamic"

/**
 * Limpeza de CADASTROS DE TESTE de uma unidade, a pedido dela (chamado Capacita
 * Pró Brasil, 30/09: "CPF e e-mail de teste").
 *
 * Roda no runtime de produção porque cancelar a cobrança pendente exige a chave
 * do gateway DA UNIDADE, que é Sensitive na Vercel. Disparo:
 * `app_internal.run_cron('/api/cron/limpar-cadastros-teste?tenant=<slug>&ids=a,b')`.
 *
 * Só alcança quem NUNCA pagou nada e não tem curso: com pagamento, matrícula ou
 * certificado o cadastro é histórico financeiro/legal, e apagá-lo é outra
 * decisão (recusado aqui, com o motivo). Para cada elegível:
 *   1. cancela assinaturas vivas no gateway (a recorrência nativa do Asaas, ou o
 *      carnê + a autorização de Pix Automático) — senão o QR segue pagável;
 *   2. anonimiza o cadastro pelo mesmo fluxo LGPD da exclusão pelo titular, o
 *      que também libera CPF e e-mail para um cadastro de verdade.
 *
 * Dry-run por padrão; `apply=1` executa. `ids` são Student.id, sempre escopados
 * ao `tenant` informado.
 */
export async function POST(request: Request) {
  if (!(await authorizeCron(request))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const url = new URL(request.url)
  const slug = url.searchParams.get("tenant") ?? ""
  const ids = (url.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 50)
  const apply = url.searchParams.get("apply") === "1"
  if (!slug || ids.length === 0) {
    return NextResponse.json({ error: "Informe tenant=<slug> e ids=<studentId>,..." }, { status: 400 })
  }
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } })
  if (!tenant) return NextResponse.json({ error: "Unidade não encontrada" }, { status: 404 })

  const students = await prisma.student.findMany({
    where: { id: { in: ids }, tenantId: tenant.id },
    select: {
      id: true,
      nome: true,
      _count: { select: { enrollments: true, certificates: true } },
      subscriptions: {
        select: {
          id: true,
          status: true,
          _count: { select: { payments: { where: { paidAt: { not: null } } } } },
        },
      },
    },
  })

  const results = []
  for (const id of ids) {
    const s = students.find((x) => x.id === id)
    if (!s) {
      results.push({ id, status: "ignorado", motivo: "aluno não é desta unidade" })
      continue
    }
    const paidCycles = s.subscriptions.reduce((n, sub) => n + sub._count.payments, 0)
    const motivo =
      s._count.enrollments > 0 ? "tem matrícula"
      : s._count.certificates > 0 ? "tem certificado"
      : paidCycles > 0 ? "tem pagamento de assinatura"
      : null
    if (motivo) {
      results.push({ id, nome: s.nome, status: "recusado", motivo })
      continue
    }
    const live = s.subscriptions.filter((sub) => sub.status !== "CANCELLED" && sub.status !== "EXPIRED")
    if (!apply) {
      results.push({ id, nome: s.nome, status: "seria limpo", assinaturasACancelar: live.length })
      continue
    }
    const errors: string[] = []
    for (const sub of live) {
      const r = await cancelSubscriptionAccess(sub.id, "REQUESTED", true)
      errors.push(...r.errors)
    }
    if (errors.length > 0) {
      // Cobrança que não caiu no gateway: NÃO anonimiza — sem o cadastro,
      // ninguém mais acharia de quem é a cobrança viva.
      results.push({ id, nome: s.nome, status: "falhou", erros: errors })
      continue
    }
    await anonymizeStudentAccount(id, { role: "SYSTEM", origem: "limpeza_cadastros_teste" })
    results.push({ id, nome: s.nome, status: "limpo", assinaturasCanceladas: live.length })
  }

  contextLogger().info(
    { event: "cron.limpar_cadastros_teste", tenant: slug, apply, results },
    "limpeza de cadastros de teste",
  )
  return NextResponse.json({ data: { apply, results } })
}

export async function GET(request: Request) {
  return POST(request)
}
