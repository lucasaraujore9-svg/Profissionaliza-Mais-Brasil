import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCustomer, motherAsaasKey } from "@/lib/asaas/client"
import { cpfFromDocument } from "@/lib/validation/cpf"
import { isCronAuthorized } from "@/lib/auth/bearer"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * Backfill operacional: preenche `User.cpf` (identificador alternativo de
 * login) dos donos de revenda criados ANTES do login por CPF existir. O CPF
 * informado na criação da revenda sempre foi enviado ao Asaas
 * (customer.cpfCnpj da mensalidade, conta-mãe PMB) e descartado no nosso
 * banco — aqui relemos o customer e gravamos o documento quando é um CPF
 * válido (CNPJ fica só na cobrança).
 *
 * One-shot (sem agendamento no pg_cron). Roda no runtime de produção porque
 * ASAAS_API_KEY é Sensitive na Vercel. Disparado via
 * `app_internal.run_cron('/api/cron/backfill-user-cpf?write=1')`.
 *
 * Auth: Bearer CRON_SECRET (padrão dos demais crons).
 *
 * Query params:
 *   write=1   grava (default: dry-run, não altera nada)
 *
 * O retorno nunca inclui o CPF (fica inspecionável em net._http_response) —
 * só slug + desfecho por unidade.
 */

interface Outcome {
  slug: string
  status:
    | "updated" // CPF válido no Asaas, gravado (ou gravável, em dry-run)
    | "cnpj" // documento do customer é CNPJ — nada a gravar
    | "taken" // CPF já pertence a outra conta — mantém login por email
    | "no_customer" // tenant sem asaasCustomerId (ex.: revenda gratuita)
    | "asaas_error" // GET /customers falhou (ex.: id de sandbox em prod)
}

async function backfill(write: boolean) {
  const owners = await prisma.user.findMany({
    where: {
      role: "RESELLER",
      cpf: null,
      tenantId: { not: null },
    },
    select: {
      id: true,
      tenant: { select: { slug: true, asaasCustomerId: true } },
    },
  })

  const tally = {
    scanned: 0,
    updated: 0,
    cnpj: 0,
    taken: 0,
    no_customer: 0,
    asaas_error: 0,
  }
  const details: Outcome[] = []
  const CONCURRENCY = 3

  async function processOne(o: (typeof owners)[number]): Promise<void> {
    const slug = o.tenant?.slug ?? "?"
    tally.scanned++

    if (!o.tenant?.asaasCustomerId) {
      tally.no_customer++
      details.push({ slug, status: "no_customer" })
      return
    }

    let document = ""
    try {
      const customer = await getCustomer(o.tenant.asaasCustomerId, motherAsaasKey())
      document = customer.cpfCnpj ?? ""
    } catch {
      tally.asaas_error++
      details.push({ slug, status: "asaas_error" })
      return
    }

    const cpf = cpfFromDocument(document)
    if (!cpf) {
      tally.cnpj++
      details.push({ slug, status: "cnpj" })
      return
    }

    const cpfTaken = await prisma.user.findUnique({
      where: { cpf },
      select: { id: true },
    })
    if (cpfTaken && cpfTaken.id !== o.id) {
      tally.taken++
      details.push({ slug, status: "taken" })
      return
    }

    if (write) {
      await prisma.user.update({ where: { id: o.id }, data: { cpf } })
    }
    tally.updated++
    details.push({ slug, status: "updated" })
  }

  for (let i = 0; i < owners.length; i += CONCURRENCY) {
    await Promise.all(owners.slice(i, i + CONCURRENCY).map(processOne))
  }

  contextLogger().info(
    { event: "cron.backfill_user_cpf", write, ...tally },
    "backfill de User.cpf a partir do Asaas concluído",
  )
  return { write, tally, details }
}

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const url = new URL(request.url)
  const write = url.searchParams.get("write") === "1"

  const result = await backfill(write)
  return NextResponse.json({ data: result })
}

export async function GET(request: Request) {
  return POST(request)
}
