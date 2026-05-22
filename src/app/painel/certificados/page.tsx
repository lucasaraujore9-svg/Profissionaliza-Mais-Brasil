import Link from "next/link"
import { redirect } from "next/navigation"
import { Award, FileText, Palette, Plus } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PageHeader } from "@/components/painel/page-header"

export const dynamic = "force-dynamic"

export default async function PainelCertificadosPage() {
  const session = await auth()
  const user = session?.user as
    | { id?: string; role?: string; tenantId?: string | null }
    | undefined
  if (!user?.id || user.role !== "RESELLER" || !user.tenantId) {
    redirect("/login?callbackUrl=/painel/certificados")
  }

  const tenantId = user.tenantId

  const [issuedCount, revokedCount, template] = await Promise.all([
    prisma.certificate.count({ where: { tenantId, revokedAt: null } }),
    prisma.certificate.count({ where: { tenantId, revokedAt: { not: null } } }),
    prisma.certificateTemplate.findUnique({ where: { tenantId } }),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Certificados"
        description="Configure o template e acompanhe os certificados emitidos para seus alunos."
        actions={
          <Link
            href="/painel/certificados/emitir"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-pmb-green-700)]"
          >
            <Plus className="h-4 w-4" />
            Emitir certificado
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={<Award className="h-5 w-5" />}
          label="Emitidos"
          value={issuedCount}
        />
        <SummaryCard
          icon={<FileText className="h-5 w-5" />}
          label="Revogados"
          value={revokedCount}
        />
        <SummaryCard
          icon={<Palette className="h-5 w-5" />}
          label="Template"
          value={template ? "Configurado" : "Padrão PMB"}
          isString
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <NavCard
          href="/painel/certificados/template"
          icon={<Palette className="h-5 w-5" />}
          title="Template visual"
          description="Personalize o layout, cores, logos e textos do certificado da sua escola."
        />
        <NavCard
          href="/painel/certificados/emitidos"
          icon={<FileText className="h-5 w-5" />}
          title="Certificados emitidos"
          description="Veja todos os certificados gerados, baixe PDFs e revogue quando necessário."
        />
      </div>
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  isString,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  isString?: boolean
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-900)]">
        {icon}
      </div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {label}
        </div>
        <div
          className={
            isString
              ? "mt-1 text-lg font-semibold text-[var(--color-pmb-green-900)]"
              : "mt-1 text-2xl font-bold text-[var(--color-pmb-green-900)]"
          }
        >
          {value}
        </div>
      </div>
    </div>
  )
}

function NavCard({
  href,
  icon,
  title,
  description,
}: {
  href: string
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-[var(--color-pmb-green)] hover:shadow-md"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green-900)] transition-colors group-hover:bg-[var(--color-pmb-green)] group-hover:text-white">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          {title}
        </h3>
        <p className="mt-1 text-xs text-gray-600">{description}</p>
      </div>
    </Link>
  )
}
