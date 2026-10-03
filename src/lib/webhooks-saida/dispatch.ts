import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { afterResponse } from "@/lib/after-response"
import { contextLogger } from "@/lib/logger"
import {
  MAX_ATTEMPTS,
  nextAttemptDelayMs,
  webhookUrlError,
  type WebhookEvent,
  TEST_EVENT,
} from "./core"
import { signWebhook } from "./secret"

/**
 * Webhooks de SAÍDA — emissão e entrega.
 *
 * Desenho de outbox: o evento vira uma linha `WebhookDelivery` por endpoint
 * ANTES de qualquer tentativa de rede. A 1ª tentativa sai logo depois da
 * resposta (`afterResponse`); as seguintes, pelo cron `/api/cron/webhooks-entregas`.
 * Assim uma queda do destino não perde evento e não segura o fluxo que o gerou
 * (webhook do Asaas, criação de unidade).
 *
 * Entrega é AT-LEAST-ONCE: timeout depois de o destino ter processado gera
 * reenvio. O `X-PMB-Event-Id` é estável entre tentativas — é ele que o
 * receptor usa para não processar duas vezes.
 */

const TIMEOUT_MS = 10_000
/** Trava de uma linha durante a entrega — maior que o timeout com folga. */
const LOCK_MS = 60_000
const SWEEP_BATCH = 50

/**
 * Registra o evento para todo endpoint ATIVO que o assina e dispara a 1ª
 * tentativa em background.
 *
 * `buildData` só roda se alguém assina o evento: sem endpoint cadastrado (o
 * caso de quase toda execução) o custo é uma consulta indexada e mais nada.
 *
 * `dedupeKey` faz o mesmo fato emitido por dois caminhos virar UMA entrega —
 * o Asaas manda CONFIRMED e RECEIVED para o mesmo cartão, e a reconciliação
 * diária pode ver de novo o pagamento que o webhook já tratou.
 *
 * NUNCA lança: quem chama é fluxo de negócio (pagamento, criação de unidade).
 * Falha aqui vira log, não erro para o Asaas re-entregar.
 */
export async function emitWebhookEvent(
  event: WebhookEvent,
  buildData: () => Promise<Record<string, unknown> | null>,
  dedupeKey?: string,
): Promise<void> {
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { status: "ACTIVE", events: { has: event } },
      select: { id: true },
    })
    if (endpoints.length === 0) return
    const data = await buildData()
    if (!data) return
    const ids = await enqueue(event, data, endpoints.map((e) => e.id), dedupeKey)
    if (ids.length > 0) afterResponse(() => deliverMany(ids))
  } catch (err) {
    contextLogger().error(
      { err, event: "webhooks_saida.emit_failed", webhookEvent: event },
      "falha ao registrar evento de webhook de saída",
    )
  }
}

/** "Enviar teste" da tela: um evento só para aquele endpoint, entregue na hora. */
export async function sendTestEvent(endpointId: string) {
  const [id] = await enqueue(
    TEST_EVENT,
    { mensagem: "Teste de webhook do PMB. Se você recebeu, a URL e a assinatura estão funcionando." },
    [endpointId],
  )
  await deliverOne(id!)
  return prisma.webhookDelivery.findUnique({
    where: { id: id! },
    select: { id: true, status: true, lastStatusCode: true, lastError: true },
  })
}

async function enqueue(
  event: string,
  data: Record<string, unknown>,
  endpointIds: string[],
  dedupeKey?: string,
): Promise<string[]> {
  const createdAt = new Date()
  const rows = endpointIds.map((endpointId) => {
    const id = `evt_${randomUUID().replace(/-/g, "")}`
    return {
      id,
      endpointId,
      event,
      payload: { id, evento: event, criadoEm: createdAt.toISOString(), dados: data } as object,
      createdAt,
      nextAttemptAt: createdAt,
      dedupeKey: dedupeKey ? `${event}:${dedupeKey}` : null,
    }
  })
  // skipDuplicates + RETURNING: só volta o que entrou de fato; o repetido some.
  const created = await prisma.webhookDelivery.createManyAndReturn({
    data: rows,
    skipDuplicates: true,
    select: { id: true },
  })
  return created.map((r) => r.id)
}

async function deliverMany(ids: string[]): Promise<void> {
  for (const id of ids) await deliverOne(id)
}

/**
 * Uma tentativa de entrega. Toma a linha com UPDATE condicional (trava curta),
 * então o cron e a 1ª tentativa nunca mandam a mesma linha ao mesmo tempo.
 */
export async function deliverOne(id: string): Promise<void> {
  const now = new Date()
  const claimed = await prisma.webhookDelivery.updateMany({
    where: {
      id,
      status: "PENDING",
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    data: { lockedUntil: new Date(now.getTime() + LOCK_MS) },
  })
  if (claimed.count === 0) return

  const row = await prisma.webhookDelivery.findUnique({
    where: { id },
    select: {
      attempts: true,
      event: true,
      payload: true,
      endpoint: { select: { url: true, status: true, secretEncrypted: true } },
    },
  })
  if (!row) return

  const attempts = row.attempts + 1
  let statusCode: number | null = null
  let error: string | null = null

  if (row.endpoint.status !== "ACTIVE") {
    // Desligado depois de o evento entrar na fila: não manda, encerra a linha.
    await prisma.webhookDelivery.update({
      where: { id },
      data: { status: "FAILED", lockedUntil: null, lastError: "Endpoint desativado" },
    })
    return
  }

  const urlError = webhookUrlError(row.endpoint.url)
  if (urlError) {
    error = urlError
  } else {
    const body = JSON.stringify(row.payload)
    const timestamp = String(Math.floor(Date.now() / 1000))
    try {
      const signature = signWebhook(decrypt(row.endpoint.secretEncrypted), timestamp, body)
      const res = await fetch(row.endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "PMB-Webhooks/1",
          "X-PMB-Event-Id": id,
          "X-PMB-Event-Type": row.event,
          "X-PMB-Timestamp": timestamp,
          "X-PMB-Signature": `sha256=${signature}`,
        },
        body,
        // Redirect não é seguido: um 30x poderia levar a requisição assinada
        // para um endereço interno que a validação da URL barrou.
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      statusCode = res.status
      if (!res.ok) error = `HTTP ${res.status}`
    } catch (err) {
      error = err instanceof Error ? err.message.slice(0, 300) : "Falha de rede"
    }
  }

  if (!error) {
    await prisma.webhookDelivery.update({
      where: { id },
      data: {
        status: "DELIVERED",
        attempts,
        deliveredAt: new Date(),
        lockedUntil: null,
        lastStatusCode: statusCode,
        lastError: null,
      },
    })
    return
  }

  const delay = attempts >= MAX_ATTEMPTS ? null : nextAttemptDelayMs(attempts)
  await prisma.webhookDelivery.update({
    where: { id },
    data: {
      status: delay === null ? "FAILED" : "PENDING",
      attempts,
      lockedUntil: null,
      lastStatusCode: statusCode,
      lastError: error,
      ...(delay !== null ? { nextAttemptAt: new Date(Date.now() + delay) } : {}),
    },
  })
}

/** Cron: entrega o que está vencido. Sequencial de propósito — poucos eventos/dia. */
export async function sweepWebhookDeliveries(): Promise<{ processed: number }> {
  const due = await prisma.webhookDelivery.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: SWEEP_BATCH,
    select: { id: true },
  })
  for (const { id } of due) await deliverOne(id)
  return { processed: due.length }
}

/** "Reenviar" da tela: devolve uma entrega FAILED (ou DELIVERED) à fila, agora. */
export async function retryDelivery(id: string): Promise<boolean> {
  const updated = await prisma.webhookDelivery.updateMany({
    where: { id, status: { in: ["FAILED", "DELIVERED"] } },
    data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lockedUntil: null },
  })
  if (updated.count === 0) return false
  await deliverOne(id)
  return true
}
