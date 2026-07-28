import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { getSessionStatus, stopSession } from "@/lib/automation/wa-client"
import { swallow } from "@/lib/errors"
import { requireAdmin } from "@/lib/auth/admin-guard"

export const GET = withRequestContext(
  {
    action: "admin.automacao.wa.status",
    route: "/api/admin/automacao/whatsapp/status",
  },
  async () => {
    const guard = await requireAdmin("automacao.manage")
    if (!guard.ok) return guard.response
    const settings = await prisma.systemSettings.upsert({
      where: { id: "default" },
      create: { id: "default" },
      update: {},
      select: {
        pmbAutomationEnabled: true,
        pmbWaSessionName: true,
        pmbWaStatus: true,
        pmbWaConnectedPhone: true,
      },
    })

    if (!settings.pmbAutomationEnabled) {
      return NextResponse.json(
        { error: "Automação PMB desativada" },
        { status: 403 },
      )
    }

    if (!settings.pmbWaSessionName) {
      return NextResponse.json({
        data: {
          status: "DISCONNECTED",
          connectedPhone: null,
          qrDataUrl: null,
        },
      })
    }

    const live = await getSessionStatus(settings.pmbWaSessionName)

    if (
      live.status === "WORKING" &&
      live.connectedPhone &&
      live.connectedPhone !== settings.pmbWaConnectedPhone
    ) {
      try {
        await prisma.systemSettings.update({
          where: { id: "default" },
          data: {
            pmbWaStatus: "WORKING",
            pmbWaConnectedPhone: live.connectedPhone,
            pmbWaStatusUpdatedAt: new Date(),
          },
        })
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          await stopSession(settings.pmbWaSessionName).catch(
            swallow("automacao.whatsapp.stop_session"),
          )
          await prisma.systemSettings.update({
            where: { id: "default" },
            data: {
              pmbWaStatus: "FAILED",
              pmbWaConnectedPhone: null,
              pmbWaStatusUpdatedAt: new Date(),
            },
          })
          return NextResponse.json({
            data: {
              status: "FAILED",
              connectedPhone: null,
              qrDataUrl: null,
              error:
                "Este número já está conectado em outra conta. Desconecte lá antes de tentar aqui.",
            },
          })
        }
        throw err
      }
    } else if (live.status !== settings.pmbWaStatus) {
      await prisma.systemSettings.update({
        where: { id: "default" },
        data: {
          pmbWaStatus: live.status,
          pmbWaConnectedPhone: live.connectedPhone ?? settings.pmbWaConnectedPhone,
          pmbWaStatusUpdatedAt: new Date(),
        },
      })
    }

    return NextResponse.json({
      data: {
        status: live.status,
        connectedPhone: live.connectedPhone,
        qrDataUrl: live.qrDataUrl,
      },
    })
  },
)
