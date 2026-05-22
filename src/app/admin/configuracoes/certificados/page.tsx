import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { PageHeader } from "@/components/painel/page-header"
import { AdminCertificateSettingsForm } from "@/components/admin/admin-certificate-settings-form"

export const dynamic = "force-dynamic"

const SETTINGS_ID = "default"

export default async function AdminCertificadosConfigPage() {
  const ctx = await requireAdminSession()
  if (!ctx || ctx.role !== "SUPER_ADMIN") {
    redirect("/admin/certificados")
  }

  const row = await prisma.systemSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
    select: {
      certificateAutoIssue: true,
      certificateMinPercent: true,
      certificateRequireCpf: true,
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações de certificados"
        description="Regras globais que controlam quando e como certificados são emitidos."
      />

      <AdminCertificateSettingsForm initial={row} />
    </div>
  )
}
