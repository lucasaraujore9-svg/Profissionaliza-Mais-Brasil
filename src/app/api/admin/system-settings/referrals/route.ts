import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { withRequestContext } from "@/lib/observability/with-request-context"

const bodySchema = z.object({
  referralEnabled: z.boolean(),
  defaultReferralPercent: z.number().min(0).max(100),
  referralMinPayout: z.number().min(0).max(100000),
  referralPayoutDay: z.number().int().min(1).max(28),
})

export const PUT = withRequestContext(
  { action: "admin.system_settings.referrals.update", route: "/api/admin/system-settings/referrals" },
  async (request: Request) => {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Dados invalidos",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }
  const data = parsed.data

  const updated = await prisma.systemSettings.upsert({
    where: { id: "default" },
    update: {
      referralEnabled: data.referralEnabled,
      defaultReferralPercent: new Prisma.Decimal(data.defaultReferralPercent),
      referralMinPayout: new Prisma.Decimal(data.referralMinPayout),
      referralPayoutDay: data.referralPayoutDay,
    },
    create: {
      id: "default",
      referralEnabled: data.referralEnabled,
      defaultReferralPercent: new Prisma.Decimal(data.defaultReferralPercent),
      referralMinPayout: new Prisma.Decimal(data.referralMinPayout),
      referralPayoutDay: data.referralPayoutDay,
    },
    select: {
      referralEnabled: true,
      defaultReferralPercent: true,
      referralMinPayout: true,
      referralPayoutDay: true,
    },
  })

  return NextResponse.json({
    data: {
      referralEnabled: updated.referralEnabled,
      defaultReferralPercent: Number(updated.defaultReferralPercent),
      referralMinPayout: Number(updated.referralMinPayout),
      referralPayoutDay: updated.referralPayoutDay,
    },
  })
  },
)
