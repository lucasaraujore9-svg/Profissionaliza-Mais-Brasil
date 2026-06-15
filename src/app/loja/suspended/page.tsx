import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { headers } from "next/headers"
import { RocketIcon, WrenchIcon } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

async function getTenant(
  slug: string | null,
): Promise<{ name: string; logoUrl: string | null; status: string } | null> {
  if (!slug) return null
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { name: true, logoUrl: true, status: true },
    })
    return tenant ?? null
  } catch {
    return null
  }
}

// Texto/visual por estado do tenant. PENDING (revenda nova, ainda sem o 1o
// pagamento) tem tom de lancamento; SUSPENDED (inadimplente) tom de manutencao.
// CANCELLED e tratado antes, como 404. Qualquer outro estado nao-ativo cai no
// fallback de manutencao.
const STATE_COPY: Record<
  string,
  { icon: LucideIcon; iconWrap: string; iconColor: string; title: string; body: string }
> = {
  PENDING: {
    icon: RocketIcon,
    iconWrap: "bg-emerald-100",
    iconColor: "text-emerald-600",
    title: "EM BREVE",
    body: "Uma nova escola de cursos profissionalizantes está chegando. Volte logo!",
  },
  SUSPENDED: {
    icon: WrenchIcon,
    iconWrap: "bg-amber-100",
    iconColor: "text-amber-500",
    title: "EM MANUTENÇÃO",
    body: "Este site está passando por uma manutenção e volta em breve.",
  },
}

export default async function LojaGatePage() {
  const headersList = await headers()
  const slug = headersList.get("x-tenant-slug")
  const tenant = await getTenant(slug)

  // Revenda cancelada (ou slug inexistente): trata como site inexistente → 404.
  if (!tenant || tenant.status === "CANCELLED") {
    notFound()
  }

  const copy = tenant.status === "PENDING" ? STATE_COPY.PENDING : STATE_COPY.SUSPENDED
  const Icon = copy.icon

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
      <div className="max-w-md">
        {/* Branding da unidade — logo se houver, senão o nome em texto. Nunca a
            logo institucional da PMB (a vitrine é da revenda, não da PMB). */}
        {tenant.logoUrl ? (
          <Image
            src={tenant.logoUrl}
            alt={tenant.name}
            width={160}
            height={48}
            className="mx-auto mb-8 h-12 w-auto object-contain"
          />
        ) : tenant.name ? (
          <p className="mb-8 text-xl font-black text-[var(--color-pmb-green,#16a34a)]">
            {tenant.name}
          </p>
        ) : null}

        <div className="mb-6 flex justify-center">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-full ${copy.iconWrap}`}
          >
            <Icon className={`h-8 w-8 ${copy.iconColor}`} />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900">{copy.title}</h1>
        <p className="mt-3 text-gray-500">{copy.body}</p>

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
