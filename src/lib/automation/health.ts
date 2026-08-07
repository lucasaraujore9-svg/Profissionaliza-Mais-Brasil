import { prisma } from "@/lib/prisma"
import { contextLogger } from "@/lib/logger"
import { createNotification } from "@/lib/notifications"
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

/**
 * Varre as unidades com automacao ligada e sessao criada, confronta o snapshot
 * do banco com o engine, tenta religar o que da e avisa quem precisa reconectar
 * na mao.
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
  })

  for (const t of tenants) {
    if (!t.waSessionName) continue
    result.verificadas++
    try {
      const live = await ensureSessionWorking(t.waSessionName)
      await syncWaSnapshot(t.id, live.status, live.connectedPhone)

      if (live.status === "WORKING") {
        result.saudaveis++
        // Estava mentindo antes: o snapshot dizia caído e o canal estava de pé.
        if (t.waStatus !== "WORKING") result.recuperadas++
        continue
      }

      result.precisamReconectar++
      if (await alertWaDisconnected(t.id, live.status)) {
        result.avisosEnviados++
      }
    } catch (err) {
      contextLogger().error(
        { err, event: "automation.wa_health_failed", tenantId: t.id, slug: t.slug },
        "Falha ao verificar saude da sessao WhatsApp da unidade",
      )
    }
  }

  return result
}
