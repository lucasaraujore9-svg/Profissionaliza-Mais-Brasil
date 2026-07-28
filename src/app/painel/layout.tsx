import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PainelLayoutShell } from "./layout-shell"
import { SIDEBAR_COLLAPSED_COOKIE } from "@/components/shared/layouts/use-sidebar-collapsed"
import { ImpersonationBanner } from "@/components/admin/impersonation-banner"
import {
  decodeImpersonationFlag,
  IMPERSONATION_FLAG_COOKIE,
} from "@/lib/auth/impersonate"
import { painelContext } from "@/lib/auth/painel-guard"
import { PainelPreviewBanner } from "@/components/painel/painel-preview-banner"

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

  // NOTA: enforcement server-side de mustChangePassword REVERTIDO (bloqueava
  // contas existentes em produção). Re-introduzir só com revalidação de JWT
  // pós-troca e limpeza da flag legada em contas ativas. Ver R22.

  const [cookieStore, tenant, currentUser, ctx] = await Promise.all([
    cookies(),
    prisma.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { name: true, logoUrl: true, automationEnabled: true, canSellResellers: true },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id as string },
      select: { onboardingTourCompletedAt: true, dismissedTours: true },
    }),
    // Papel + permissões efetivas na unidade. Resolvido AQUI, uma vez, e
    // repassado ao shell: é o que decide quais itens do menu aparecem.
    painelContext(),
  ])

  // Sessão de RESELLER sem vínculo válido (membership removida/inativada
  // enquanto o token ainda vive). Fail-closed: manda para o login em vez de
  // renderizar um painel sem permissão nenhuma.
  if (!ctx) {
    redirect("/login?callbackUrl=/painel")
  }

  // Tours já dispensados. Compat: a flag legada onboardingTourCompletedAt
  // cobria só o tour de visão geral — se preenchida, semeia "painel.overview".
  const dismissedTours = Array.from(
    new Set([
      ...(currentUser?.dismissedTours ?? []),
      ...(currentUser?.onboardingTourCompletedAt ? ["painel.overview"] : []),
    ]),
  )

  const flag = decodeImpersonationFlag(
    cookieStore.get(IMPERSONATION_FLAG_COOKIE)?.value,
  )
  const sidebarCollapsed =
    cookieStore.get(SIDEBAR_COLLAPSED_COOKIE)?.value === "1"

  return (
    <>
      {flag && (
        <ImpersonationBanner
          adminName={flag.adminName}
          targetName={flag.targetName}
        />
      )}
      {ctx.isPreview && <PainelPreviewBanner role={ctx.memberRole} />}
      <PainelLayoutShell
        userName={session.user.name ?? "Revendedor"}
        userEmail={session.user.email ?? ""}
        tenantName={tenant?.name ?? null}
        tenantLogoUrl={tenant?.logoUrl ?? null}
        automationEnabled={tenant?.automationEnabled ?? false}
        canSellResellers={tenant?.canSellResellers ?? false}
        memberRole={ctx.memberRole}
        permissions={[...ctx.permissions]}
        dismissedTours={dismissedTours}
        defaultCollapsed={sidebarCollapsed}
      >
        {children}
      </PainelLayoutShell>
    </>
  )
}
