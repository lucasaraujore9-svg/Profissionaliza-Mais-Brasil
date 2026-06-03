import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { PageHeader } from "@/components/painel/page-header"
import { AdminCertificateSettingsForm } from "@/components/admin/admin-certificate-settings-form"
import {
  CertificateTemplateEditor,
  type CertificateTemplateData,
} from "@/components/painel/certificate-template-editor"

export const dynamic = "force-dynamic"

const SETTINGS_ID = "default"

export default async function AdminCertificadosConfiguracoesPage() {
  const ctx = await requireAdminSession()
  if (!ctx || ctx.role !== "SUPER_ADMIN") {
    redirect("/admin/certificados")
  }

  const [settings, template] = await Promise.all([
    prisma.systemSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
      select: {
        certificateAutoIssue: true,
        certificateMinPercent: true,
        certificateRequireCpf: true,
        groupLogoUrl: true,
        groupName: true,
      },
    }),
    prisma.certificateTemplate.findFirst({ where: { tenantId: null } }),
  ])

  const initialTemplate: CertificateTemplateData | null = template
    ? {
        layout: template.layout,
        backgroundUrl: template.backgroundUrl,
        logoUrl: template.logoUrl,
        sealUrl: template.sealUrl,
        signatureUrl: template.signatureUrl,
        primaryColor: template.primaryColor,
        secondaryColor: template.secondaryColor,
        titleText: template.titleText,
        bodyText: template.bodyText,
        footerText: template.footerText,
        signerName: template.signerName,
        signerTitle: template.signerTitle,
        showQrCode: template.showQrCode,
        showValidationUrl: template.showValidationUrl,
        showSeal: template.showSeal,
        isActive: template.isActive,
      }
    : null

  return (
    <div className="space-y-6">
      <Link
        href="/admin/certificados"
        className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-[var(--color-pmb-green-900)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar
      </Link>

      <PageHeader
        title="Configurações de certificados"
        description="Regras globais de emissão, branding do Grupo e template padrão da vitrine PMB."
      />

      {/* Seção 1 — Regras globais + Logo do Grupo */}
      <section className="space-y-3">
        <header>
          <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">
            Regras globais
          </h2>
          <p className="text-sm text-gray-600">
            Controlam quando o sistema emite certificados automaticamente e a logo
            do Grupo Bolsa Mais Brasil que aparece em todos os certificados.
          </p>
        </header>
        <AdminCertificateSettingsForm initial={settings} />
      </section>

      {/* Seção 2 — Template padrão PMB */}
      <section className="space-y-3 pt-4">
        <header>
          <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">
            Template padrão Profissionaliza Mais Brasil
          </h2>
          <p className="text-sm text-gray-600">
            Layout usado na vitrine PMB e como fallback para revendedores sem
            template próprio. Revendedores escolhem apenas o layout
            (CLASSIC/MODERN/MINIMAL); todo o resto (logo da escola, cores, textos
            e assinatura) é controlado por este template.
          </p>
        </header>
        <CertificateTemplateEditor
          initial={initialTemplate}
          saveEndpoint="/api/admin/certificate-template"
          uploadEndpoint="/api/admin/certificate-template/upload"
          previewEndpoint="/api/admin/certificate-template/preview"
          scopeLabel="Template padrão PMB (vitrine própria)"
          groupLogoUrl={settings.groupLogoUrl}
          groupName={settings.groupName}
        />
      </section>
    </div>
  )
}
