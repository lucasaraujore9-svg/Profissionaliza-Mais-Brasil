import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { getSessionStatus, stopSession } from "@/lib/automation/wa-client"

export const GET = withRequestContext(
  {
    action: "painel.automacao.wa.status",
    route: "/api/painel/automacao/whatsapp/status",
  },
  async () => {
    const guard = await requirePainel("automacao.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: {
        id: true,
        automationEnabled: true,
        waSessionName: true,
        waStatus: true,
        waConnectedPhone: true,
      },
    })

    if (!tenant || !tenant.automationEnabled) {
      return NextResponse.json(
        { error: "Módulo Automação indisponível" },
        { status: 403 },
      )
    }

    if (!tenant.waSessionName) {
      return NextResponse.json({
        data: {
          status: "DISCONNECTED",
          connectedPhone: null,
          qrDataUrl: null,
        },
      })
    }

    const live = await getSessionStatus(tenant.waSessionName)

    // Salva snapshot. Captura colisao de numero ja conectado em outro tenant.
    if (
      live.status === "WORKING" &&
      live.connectedPhone &&
      live.connectedPhone !== tenant.waConnectedPhone
    ) {
      try {
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: {
            waStatus: "WORKING",
            waConnectedPhone: live.connectedPhone,
            waStatusUpdatedAt: new Date(),
          },
        })
      } catch (err) {
        // P2002 = numero ja conectado em outro tenant. Encerra a sessao.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          await stopSession(tenant.waSessionName).catch(() => {
            /* ignore */
          })
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: {
              waStatus: "FAILED",
              waConnectedPhone: null,
              waStatusUpdatedAt: new Date(),
            },
          })
          return NextResponse.json({
            data: {
              status: "FAILED",
              connectedPhone: null,
              qrDataUrl: null,
              error:
                "Este número já está conectado em outra escola. Desconecte lá antes de tentar aqui.",
            },
          })
        }
        throw err
      }
    } else if (live.status !== tenant.waStatus) {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          waStatus: live.status,
          waConnectedPhone: live.connectedPhone ?? tenant.waConnectedPhone,
          waStatusUpdatedAt: new Date(),
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
