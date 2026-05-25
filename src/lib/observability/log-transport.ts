/**
 * Transport HTTP opcional para encaminhar logs a um aggregator externo
 * (Axiom-compatible). NÃO substitui stdout — adiciona um segundo destino.
 *
 * Por que isso existe (e por que é OPCIONAL):
 *   O caminho preferido no Vercel é configurar um **Log Drain** no
 *   dashboard (Project Settings → Log Drains → Axiom/Datadog/Logtail).
 *   Zero código, sem custo de cold-start, sem perda de eventos no flush.
 *
 *   Esse transport HTTP existe pra casos onde Log Drain não é viável:
 *   - Self-hosted (fora do Vercel)
 *   - Plano sem Log Drains
 *   - Necessidade de filtrar/enriquecer eventos antes de mandar
 *   - Stream separado por ambiente
 *
 * Como ativar:
 *   Defina AXIOM_TOKEN + AXIOM_DATASET. Sem essas envs, este módulo é no-op
 *   (logger.ts cai pra stdout puro, comportamento default).
 *
 *   Para outro provider Axiom-compatible (Elasticsearch ingest API, custom
 *   endpoint), aponte AXIOM_URL. Default: https://api.axiom.co
 *
 * Importante (lifecycle em serverless):
 *   Buffer flusha por tamanho (50 eventos) ou tempo (2s). Em Fluid Compute,
 *   a instância sobrevive entre requests — o buffer drena naturalmente.
 *   Em serverless tradicional (uma função = uma instância), eventos do
 *   final do request podem se perder se a função for finalizada antes do
 *   flush. Por isso preferimos Log Drain no Vercel.
 *
 *   Eventos `level >= error` flusham imediatamente (não esperam buffer).
 */
import type { DestinationStream } from "pino"

const AXIOM_TOKEN = process.env.AXIOM_TOKEN?.trim()
const AXIOM_DATASET = process.env.AXIOM_DATASET?.trim()
const AXIOM_URL = process.env.AXIOM_URL?.trim() ?? "https://api.axiom.co"

const FLUSH_BATCH_SIZE = 50
const FLUSH_INTERVAL_MS = 2000
const HTTP_TIMEOUT_MS = 5000

interface ParsedEvent {
  level?: number
  [key: string]: unknown
}

function parseLine(line: string): ParsedEvent {
  try {
    return JSON.parse(line) as ParsedEvent
  } catch {
    return { raw: line }
  }
}

/**
 * Cria o stream HTTP. Retorna null se as envs não estão setadas — chamador
 * deve então usar só stdout.
 */
export function createHttpLogStream(): DestinationStream | null {
  if (!AXIOM_TOKEN || !AXIOM_DATASET) return null

  const buffer: ParsedEvent[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  let flushing = false

  const sendBatch = async (events: ParsedEvent[]): Promise<void> => {
    if (events.length === 0) return
    try {
      await fetch(`${AXIOM_URL}/v1/datasets/${AXIOM_DATASET}/ingest`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AXIOM_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(events),
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      })
    } catch {
      // Silently — logger não pode bloquear request. Falha de ingestion é
      // detectada via ausência de logs no aggregator. stdout segue íntegro.
    }
  }

  const flush = async (): Promise<void> => {
    if (flushing || buffer.length === 0) return
    flushing = true
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    const batch = buffer.splice(0, buffer.length)
    await sendBatch(batch)
    flushing = false
  }

  return {
    write(line: string): void {
      const event = parseLine(line)
      buffer.push(event)

      // Pino levels: 10=trace, 20=debug, 30=info, 40=warn, 50=error, 60=fatal
      const level = typeof event.level === "number" ? event.level : 30
      const isUrgent = level >= 50

      if (isUrgent || buffer.length >= FLUSH_BATCH_SIZE) {
        void flush()
      } else if (!timer) {
        timer = setTimeout(() => void flush(), FLUSH_INTERVAL_MS)
      }
    },
  }
}
