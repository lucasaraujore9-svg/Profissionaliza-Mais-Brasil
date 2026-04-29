import type { Metadata } from "next"
import { cookies } from "next/headers"
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
  const cookieStore = await cookies()
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
      <PainelLayoutShell>{children}</PainelLayoutShell>
    </>
  )
}
