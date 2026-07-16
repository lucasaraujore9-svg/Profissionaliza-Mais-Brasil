import type { Metadata } from "next"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { ImpersonationBanner } from "@/components/admin/impersonation-banner"
import {
  decodeImpersonationFlag,
  IMPERSONATION_FLAG_COOKIE,
} from "@/lib/auth/impersonate"
import { AdminLayoutShell } from "./layout-shell"
import { SIDEBAR_COLLAPSED_COOKIE } from "@/components/shared/layouts/use-sidebar-collapsed"

export const metadata: Metadata = {
  title: "Admin | Profissionaliza Mais Brasil",
  description: "Painel administrativo do Profissionaliza Mais Brasil",
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin")

  // NOTA: o enforcement server-side de mustChangePassword foi REVERTIDO aqui —
  // estava bloqueando contas existentes (super admin com flag legada) em
  // produção. Re-introduzir só após garantir que (a) contas ativas não tenham
  // a flag legada e (b) o JWT seja revalidado pós-troca (evita loop). Ver R22.

  // Banner de impersonação: SUPER_ADMIN entrando como um membro interno da
  // equipe (PMB) vê o admin com o papel do alvo — o banner dá o botão "voltar".
  const cookieStore = await cookies()
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
      <AdminLayoutShell
        role={session.role as "SUPER_ADMIN" | "PMB_SALES" | "PMB_SALES_MGR" | "PMB_REVENDA_SALES" | "PMB_RESELLER_MGR" | "PMB_FINANCEIRO" | "PMB_DESIGNER"}
        userName={session.name ?? "Admin"}
        userEmail={session.email ?? ""}
        defaultCollapsed={sidebarCollapsed}
      >
        {children}
      </AdminLayoutShell>
    </>
  )
}
