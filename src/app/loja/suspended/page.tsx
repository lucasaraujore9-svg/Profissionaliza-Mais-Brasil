import Image from "next/image"
import Link from "next/link"
import { headers } from "next/headers"
import { WrenchIcon } from "lucide-react"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

async function getTenantLogo(slug: string | null): Promise<string | null> {
  if (!slug) return null
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { logoUrl: true },
    })
    return tenant?.logoUrl ?? null
  } catch {
    return null
  }
}

export default async function LojaMaintenancePage() {
  const headersList = await headers()
  const slug = headersList.get("x-tenant-slug")
  const logoUrl = await getTenantLogo(slug)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
      <div className="max-w-md">
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt="Logo"
            width={160}
            height={48}
            className="mx-auto mb-8 h-12 w-auto object-contain"
          />
        ) : (
          <Image
            src="/images/logo.png"
            alt="Profissionaliza Mais Brasil"
            width={180}
            height={48}
            className="mx-auto mb-8 h-12 w-auto object-contain"
          />
        )}

        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <WrenchIcon className="h-8 w-8 text-amber-500" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900">EM MANUTENÇÃO</h1>
        <p className="mt-3 text-gray-500">
          Este site está temporariamente indisponível. Em breve estaremos de volta.
        </p>

        <p className="mt-8 text-sm text-gray-400">
          Caso seja administrador desta unidade,{" "}
          <Link
            href="/login"
            className="font-medium text-[var(--color-pmb-green,#16a34a)] underline underline-offset-2 hover:opacity-80"
          >
            clique aqui para fazer login
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
