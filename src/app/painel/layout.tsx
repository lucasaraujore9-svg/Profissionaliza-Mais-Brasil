import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PainelLayoutShell } from "./layout-shell"
import { ImpersonationBanner } from "@/components/admin/impersonation-banner"
import {
  decodeImpersonationFlag,
  IMPERSONATION_FLAG_COOKIE,
} from "@/lib/auth/impersonate"

export const metadata: Metadata = {
  title: "Painel do Revendedor | Profissionaliza Mais Brasil",
  description: "Gerencie sua vitrine, alunos e vendas",
}

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (
    !session?.user ||
    session.user.role !== "RESELLER" ||
    !session.user.tenantId
  ) {
    redirect("/login?callbackUrl=/painel")
  }

  const [cookieStore, tenant] = await Promise.all([
    cookies(),
    prisma.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { name: true },
    }),
  ])

  const flag = decodeImpersonationFlag(
    cookieStore.get(IMPERSONATION_FLAG_COOKIE)?.value,
  )

  return (
    <>
      {flag && (
        <ImpersonationBanner
          adminName={flag.adminName}
          targetName={flag.targetName}
        />
      )}
      <PainelLayoutShell
        userName={session.user.name ?? "Revendedor"}
        userEmail={session.user.email ?? ""}
        tenantName={tenant?.name ?? null}
      >
        {children}
      </PainelLayoutShell>
    </>
  )
}
