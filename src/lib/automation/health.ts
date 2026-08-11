import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import { createNotification } from "@/lib/notifications"
import { runInChunks } from "@/lib/concurrency"
import { ensureSessionWorking } from "./wa-client"
import { syncWaSnapshot } from "./context"

/**
 * Saude do canal de WhatsApp das unidades.
 *
 * O problema que este arquivo resolve: a sessao morre no engine (o aparelho
 * desvincula o WhatsApp, o WhatsApp expira o pareamento, o engine reinicia) e
 * NINGUEM FICA SABENDO. O painel continua exibindo "conectado" porque o
 * `waStatus` do banco so era reescrito quando alguem abria a tela de conexao.
 * Medicao em producao (2026-08-07): 26 das 45 unidades ditas conectadas estavam
 * FAILED no engine — todas em silencio, sem disparar uma mensagem sequer.
 *
 * Reconectar exige ler o QR de novo, o que so o dono faz. Entao o trabalho do
 * sistema e DETECTAR e AVISAR — nao ha conserto automatico para credencial
 * expirada.
 */

const CATEGORY = "automacao"
// Nao repete o aviso enquanto houver um recente: a unidade nao reconecta em
// minutos, e um alerta por lead perdido viraria spam.
const ALERT_COOLDOWN_HOURS = 24

/**
 * Avisa a unidade (ou o time PMB, quando tenantId e null) que o WhatsApp da
 * automacao esta fora do ar e precisa ser reconectado.
 *
 * Idempotente por janela: nao cria um segundo aviso se ja houver um nas ultimas
 * `ALERT_COOLDOWN_HOURS`. Best-effort — nunca lanca.
 */
export async function alertWaDisconnected(
  tenantId: string | null,
  status: string,
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - ALERT_COOLDOWN_HOURS * 60 * 60 * 1000)

    const recent = await prisma.notification.findFirst({
      where: {
        category: CATEGORY,
        createdAt: { gte: since },
        ...(tenantId ? { tenantId } : { tenantId: null }),
      },
      select: { id: true },
    })
    if (recent) return false

    const precisaQr = status === "SCAN_QR_CODE" || status === "FAILED"
    const body = precisaQr
      ? "A conexão do WhatsApp caiu e precisa ser refeita: abra Automação → Conexão e leia o QR Code novamente. Enquanto isso, nenhuma mensagem automática é enviada."
      : "O WhatsApp da automação está desconectado. Abra Automação → Conexão para reconectar. Enquanto isso, nenhuma mensagem automática é enviada."

    if (tenantId) {
      await createNotification({
        audience: "TENANT",
        tenantId,
        level: "WARNING",
        category: CATEGORY,
        title: "WhatsApp desconectado — automação parada",
        body,
        href: "/painel/automacao/conexao",
      })
    } else {
      await createNotification({
        audience: "ROLE",
        roleTarget: "SUPER_ADMIN",
        level: "WARNING",
        category: CATEGORY,
        title: "WhatsApp da PMB desconectado — automação parada",
        body,
        href: "/admin/automacao/conexao",
      })
    }

    contextLogger().warn(
      { event: "automation.wa_disconnected_alert", tenantId, status },
      "Unidade avisada de que o WhatsApp da automacao caiu",
    )
    return true
  } catch (err) {
    contextLogger().error(
      { err, event: "automation.wa_alert_failed", tenantId },
      "Falha ao avisar unidade sobre WhatsApp desconectado",
    )
    return false
  }
}

export interface WaHealthResult {
  verificadas: number
  saudaveis: number
  recuperadas: number
  precisamReconectar: number
  avisosEnviados: number
}

// Quantas sessoes conferimos ao mesmo tempo. Verificar uma sessao caida custa
// ate ~20s (status + stop + start + 3 sondagens com espera), entao em serie
// 49 unidades nao cabiam nos 300s de `maxDuration`: a primeira execucao real
// parou em 41 e as 8 do fim da lista nunca eram alcancadas. Sao chamadas HTTP
// ao engine, nao consultas ao banco — o limite protege o engine, nao o pooler.
const HEALTH_CONCURRENCY = 6

/**
 * Varre as unidades com automacao ligada e sessao criada, confronta o snapshot
 * do banco com o engine, tenta religar o que da e avisa quem precisa reconectar
 * na mao. Cobre tambem a vitrine PMB (sistema mae).
 *
 * Idempotente: pode rodar quantas vezes quiser. O aviso tem cooldown proprio.
 */
export async function checkWaSessionsHealth(): Promise<WaHealthResult> {
  const result: WaHealthResult = {
    verificadas: 0,
    saudaveis: 0,
    recuperadas: 0,
    precisamReconectar: 0,
    avisosEnviados: 0,
  }

  const tenants = await prisma.tenant.findMany({
    where: {
      automationEnabled: true,
      status: "ACTIVE",
      waSessionName: { not: null },
    },
    select: { id: true, slug: true, waSessionName: true, waStatus: true },
    // Menos recente primeiro: se ainda assim a execucao for cortada no meio,
    // a proxima comeca por quem esta ha mais tempo sem conferencia, em vez de
    // reconferir sempre os mesmos e deixar uma cauda permanentemente cega.
    orderBy: { waStatusUpdatedAt: { sort: "asc", nulls: "first" } },
  })

  // A vitrine PMB tem sessao propria e ficava de fora desta varredura — o
  // snapshot dela chegou a passar 2 meses sem uma unica conferencia.
  const settings = await prisma.systemSettings.findUnique({
    where: { id: "default" },
    select: { pmbAutomationEnabled: true, pmbWaSessionName: true, pmbWaStatus: true },
  })

  const alvos: Array<{
    tenantId: string | null
    label: string
    sessionName: string
    snapshot: string
  }> = tenants
    .filter((t): t is typeof t & { waSessionName: string } => !!t.waSessionName)
    .map((t) => ({
      tenantId: t.id,
      label: t.slug,
      sessionName: t.waSessionName,
      snapshot: t.waStatus,
    }))

  if (settings?.pmbAutomationEnabled && settings.pmbWaSessionName) {
    alvos.push({
      tenantId: null,
      label: "__pmb__",
      sessionName: settings.pmbWaSessionName,
      snapshot: settings.pmbWaStatus,
    })
  }

  const settled = await runInChunks(alvos, HEALTH_CONCURRENCY, async (alvo) => {
    const live = await ensureSessionWorking(alvo.sessionName)
    await syncWaSnapshot(alvo.tenantId, live.status, live.connectedPhone)

    if (live.status === "WORKING") {
      // Estava mentindo antes: o snapshot dizia caído e o canal estava de pé.
      return { saudavel: true, recuperada: alvo.snapshot !== "WORKING", avisou: false }
    }

    const avisou = await alertWaDisconnected(alvo.tenantId, live.status)
    return { saudavel: false, recuperada: false, avisou }
  })

  settled.forEach((outcome, i) => {
    result.verificadas++
    if (outcome.status === "rejected") {
      contextLogger().error(
        {
          err: outcome.reason,
          event: "automation.wa_health_failed",
          tenantId: alvos[i].tenantId,
          slug: alvos[i].label,
        },
        "Falha ao verificar saude da sessao WhatsApp da unidade",
      )
      return
    }
    if (outcome.value.saudavel) {
      result.saudaveis++
      if (outcome.value.recuperada) result.recuperadas++
      return
    }
    result.precisamReconectar++
    if (outcome.value.avisou) result.avisosEnviados++
  })

  return result
}
